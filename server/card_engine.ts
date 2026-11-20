import crypto from 'crypto';
import { db } from './db.ts';
import { hashSecret } from './routes_os3.ts';
import {
  ANIME_CARD_BANKS,
  CARD_TIER_LABELS,
  CARD_TIER_ORDER,
  computeFutureExpiry,
  decryptVaultSecret,
  encryptVaultSecret,
  formatPanGroups,
  generateSimulatedCvv,
  generateUniqueSimulatedPan,
  getBankDefinition,
  getTierPolicy,
  hashCvv,
  hashPan,
  normalizePanDigits,
  type BankBrandId,
  type CardCategory,
  type CardTierId,
  type CardTierPolicy,
} from './db_cards.ts';

export class CardEngineHttpError extends Error {
  statusCode: number;
  code: string;
  errorTitle: string;
  reason: string;
  constructor(statusCode: number, message: string, code = 'CARD_ERROR', errorTitle = '') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errorTitle = errorTitle || message;
    this.reason = message;
  }
}

export function cardUid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function genCardRefCode(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  for (let i = 0; i < 10; i++) {
    const rand = crypto.randomInt(100000, 999999);
    const candidate = `HK${datePart}${rand}`;
    const exists = db.prepare('SELECT 1 FROM banking_transactions_demo WHERE ref_code = ? LIMIT 1').get(candidate);
    if (!exists) return candidate;
  }
  return `HK${datePart}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function formatVndCard(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')} VNĐ`;
}

function signCardReceipt(payload: {
  txId: string;
  refCode: string;
  amount: number;
  fee: number;
  totalAmount: number;
  senderAccount: string;
  recipientAccount: string;
  createdAt: string;
  status: string;
}): string {
  const canonical = [
    payload.txId,
    payload.refCode,
    Math.round(payload.amount),
    Math.round(payload.fee),
    Math.round(payload.totalAmount),
    payload.senderAccount,
    payload.recipientAccount,
    payload.createdAt,
    payload.status,
  ].join('|');
  return crypto.createHash('sha256').update(`HIKARI_BANK_SIM_V3:${canonical}`).digest('hex').slice(0, 24).toUpperCase();
}

function pushCardNotification(notifType: string, title: string, body: string, amount = 0, refId = ''): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO banking_notifications (id, notif_type, title, body, amount, is_read, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(cardUid('bnotif'), notifType, title, body, Math.round(amount), refId, now);
  db.prepare(`
    INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at)
    VALUES (?, 'banking', 'Hikari Bank', ?, ?, 'banking', ?, 0, 0, ?)
  `).run(cardUid('notif'), title, body, refId || 'banking', now);
}

function writeCardAudit(params: {
  operation: string;
  txId?: string;
  accountId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  detail?: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO banking_ledger_audit (id, operation, tx_id, account_id, delta, balance_before, balance_after, status, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
    `).run(
      cardUid('audit'),
      params.operation,
      params.txId || '',
      params.accountId,
      Math.round(params.delta),
      Math.round(params.balanceBefore),
      Math.round(params.balanceAfter),
      params.detail || '',
      new Date().toISOString()
    );
  } catch {
    // non-fatal
  }
}

function recordCardReceipt(transactionId: string, receiptType: string): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO banking_receipts (receipt_id, transaction_id, receipt_type, render_version, created_at, image_reference)
      VALUES (?, ?, ?, '3.0', ?, '')
    `).run(cardUid('rcpt'), transactionId, receiptType, new Date().toISOString());
  } catch {
    // non-fatal
  }
}

export function isCardExpiredLocal(expiry: string): boolean {
  const m = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return true;
  const expEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return Date.now() > expEnd.getTime();
}

export function getTierRank(tier?: string): number {
  const idx = CARD_TIER_ORDER.indexOf((tier || 'standard') as CardTierId);
  return idx >= 0 ? idx : 0;
}

export function computeCardStatsForRow(card: Record<string, unknown>, accMap: Map<string, Record<string, unknown>>, totalAssets: number) {
  const bankId = String(card.bank_id || 'hikari') as BankBrandId;
  const tierId = (CARD_TIER_ORDER.includes(String(card.card_tier) as CardTierId) ? String(card.card_tier) : 'standard') as CardTierId;
  const bank = getBankDefinition(bankId);
  const policy = getTierPolicy(bankId, tierId);

  const accountId = String(card.account_id || '');
  const linkedAcc = accountId ? accMap.get(accountId) : undefined;
  const linkedStatus = accountId && linkedAcc && String(card.linked_status || 'linked') !== 'unlinked' ? 'linked' : 'unlinked';
  const linkedBalance = linkedAcc ? Number(linkedAcc.available_balance ?? linkedAcc.balance ?? 0) : 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const rawSpentDate = String(card.spent_date || '');
  const spentToday = rawSpentDate === todayStr ? Number(card.spent_today || 0) : 0;
  const spentMonth = Number(card.spent_month || 0);

  // Card transaction volume & count for upgrade eligibility
  const txAgg = db
    .prepare(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as vol FROM banking_transactions_demo WHERE source_card_id = ? AND tx_type = 'expense' AND status = 'Thành công'"
    )
    .get(String(card.id)) as { cnt: number; vol: number } | undefined;

  const txCount = Number(txAgg?.cnt || 0);
  const cardSpendVolume = Math.max(spentMonth, Number(txAgg?.vol || 0));
  const rewardPoints = Number(card.reward_points || 0);

  // Upgrade status to next tier
  const curIdx = getTierRank(tierId);
  const nextTierId = curIdx < CARD_TIER_ORDER.length - 1 ? CARD_TIER_ORDER[curIdx + 1] : null;
  let upgradeStatus: Record<string, unknown> = {
    hasNextTier: false,
    nextTier: null,
    nextTierLabel: null,
    eligible: false,
    checks: [],
    missingReasons: [],
  };

  if (nextTierId) {
    const nextPolicy = getTierPolicy(bankId, nextTierId);
    const req = nextPolicy.upgradeReq;
    const checks = [
      {
        key: 'linkedBalance',
        label: 'Số dư TK liên kết',
        current: linkedBalance,
        required: req.minLinkedBalance,
        passed: linkedStatus === 'linked' && linkedBalance >= req.minLinkedBalance,
      },
      {
        key: 'totalAssets',
        label: 'Tổng tài sản ngân hàng',
        current: totalAssets,
        required: req.minTotalAssets,
        passed: totalAssets >= req.minTotalAssets,
      },
      {
        key: 'cardSpend',
        label: 'Tổng chi tiêu qua thẻ',
        current: cardSpendVolume,
        required: req.minCardSpend,
        passed: cardSpendVolume >= req.minCardSpend,
      },
      {
        key: 'txCount',
        label: 'Số giao dịch thành công',
        current: txCount,
        required: req.minTxCount,
        passed: txCount >= req.minTxCount,
      },
      {
        key: 'rewardPoints',
        label: 'Điểm thưởng thẻ',
        current: rewardPoints,
        required: req.minRewardPoints,
        passed: rewardPoints >= req.minRewardPoints,
      },
    ];
    const missingReasons = checks
      .filter((c) => !c.passed)
      .map((c) =>
        c.key === 'txCount' || c.key === 'rewardPoints'
          ? `${c.label}: ${c.current}/${c.required}`
          : `${c.label}: ${formatVndCard(c.current)} / ${formatVndCard(c.required)}`
      );
    upgradeStatus = {
      hasNextTier: true,
      nextTier: nextTierId,
      nextTierLabel: nextPolicy.tierLabel,
      nextCardTitle: nextPolicy.cardTitle,
      nextCashbackRate: nextPolicy.cashbackRate,
      nextInterestRate: nextPolicy.interestRate,
      nextDailyLimit: nextPolicy.dailyLimit,
      eligible: linkedStatus === 'linked' && String(card.status) === 'active' && missingReasons.length === 0,
      checks,
      missingReasons,
    };
  }

  // Interest cycle preview
  const interestRate = Number(card.interest_rate ?? policy.interestRate);
  const interestBalanceCap = Number(card.interest_balance_cap || policy.interestBalanceCap || 100_000_000);
  const lastInterestAt = String(card.last_interest_at || '');
  const lastCycleKey = lastInterestAt ? lastInterestAt.slice(0, 10) : '';
  const alreadyClaimedToday = Boolean(
    db
      .prepare('SELECT 1 FROM banking_card_interest_logs WHERE card_id = ? AND cycle_key = ? LIMIT 1')
      .get(String(card.id), todayStr)
  ) || lastCycleKey === todayStr;

  let elapsedDays = 1;
  if (lastInterestAt) {
    const diffMs = Date.now() - new Date(lastInterestAt).getTime();
    elapsedDays = Math.max(1, Math.min(30, Math.floor(diffMs / 86400_000)));
  }
  const eligibleBalance = linkedStatus === 'linked' ? Math.min(linkedBalance, interestBalanceCap) : 0;
  const estimatedInterest =
    interestRate > 0 && eligibleBalance > 0 && String(card.status) === 'active' && !alreadyClaimedToday
      ? Math.max(1, Math.round(eligibleBalance * (interestRate / 100) * (elapsedDays / 365)))
      : 0;

  let parsedBenefits: string[] = policy.benefits;
  try {
    const b = JSON.parse(String(card.benefits_json || '[]'));
    if (Array.isArray(b) && b.length > 0) parsedBenefits = b.map(String);
  } catch {
    parsedBenefits = policy.benefits;
  }

  return {
    bank_id: bankId,
    bank_name: bank.name,
    bank_jp_name: bank.jpName,
    bank_short_code: bank.shortCode,
    bank_primary_color: bank.primaryColor,
    bank_secondary_color: bank.secondaryColor,
    bank_accent_color: bank.accentColor,
    card_tier: tierId,
    tier_label: CARD_TIER_LABELS[tierId],
    network_brand: String(card.network_brand || bank.networkBrand),
    cashback_rate: Number(card.cashback_rate ?? policy.cashbackRate),
    interest_rate: interestRate,
    tx_fee_pct: Number(card.tx_fee_pct ?? policy.txFeePct),
    fixed_tx_fee: Number(card.fixed_tx_fee ?? policy.fixedTxFee),
    withdraw_fee: Number(card.withdraw_fee ?? policy.withdrawFee),
    intl_fee_pct: Number(card.intl_fee_pct ?? policy.intlFeePct),
    maintenance_fee: Number(card.maintenance_fee ?? policy.maintenanceFee),
    reward_point_rate: Number(card.reward_point_rate ?? policy.rewardPointRate),
    reward_points: rewardPoints,
    per_tx_limit: Number(card.per_tx_limit || policy.perTxLimit),
    transfer_limit: Number(card.transfer_limit || policy.transferLimit),
    withdraw_limit: Number(card.withdraw_limit || policy.withdrawLimit),
    online_limit: Number(card.online_limit || policy.onlineLimit),
    spent_today: spentToday,
    spent_date: todayStr,
    cashback_cap_month: Number(card.cashback_cap_month || policy.cashbackCapMonth),
    cashback_used_month: Number(card.cashback_used_month || 0),
    interest_balance_cap: interestBalanceCap,
    last_interest_at: lastInterestAt,
    linked_status: linkedStatus,
    linked_account_number: linkedAcc ? String(linkedAcc.account_number || '') : '',
    linked_account_name: linkedAcc ? String(linkedAcc.nickname || linkedAcc.account_type || '') : '',
    linked_balance: linkedBalance,
    benefits: parsedBenefits,
    tx_count: txCount,
    total_card_spend: cardSpendVolume,
    upgrade_status: upgradeStatus,
    interest_preview: {
      eligibleBalance,
      interestRate,
      elapsedDays,
      estimatedInterest,
      alreadyClaimedToday,
      cycleKey: todayStr,
    },
  };
}

export function getCardSystemCatalogData() {
  const banksRaw = db.prepare('SELECT * FROM banking_card_banks ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
  const cardBanks = banksRaw.map((b) => {
    let tierPolicies: Record<string, CardTierPolicy> = {};
    try {
      tierPolicies = JSON.parse(String(b.tier_policies_json || '{}')) as Record<string, CardTierPolicy>;
    } catch {
      tierPolicies = {};
    }
    return {
      id: String(b.id) as BankBrandId,
      name: String(b.name),
      jp_name: String(b.jp_name || ''),
      short_code: String(b.short_code),
      tagline: String(b.tagline || ''),
      specialty: String(b.specialty || ''),
      network_brand: String(b.network_brand || ''),
      bin_prefix: String(b.bin_prefix || '9704'),
      primary_color: String(b.primary_color),
      secondary_color: String(b.secondary_color),
      accent_color: String(b.accent_color),
      logo_variant: String(b.logo_variant) as BankBrandId,
      tier_policies: tierPolicies,
    };
  });

  const cardPartners = db
    .prepare('SELECT * FROM banking_card_partners WHERE is_active = 1 ORDER BY cashback_bonus_pct DESC, discount_pct DESC, points_bonus_pct DESC')
    .all()
    .map((p: any) => ({
      ...p,
      cashback_bonus_pct: Number(p.cashback_bonus_pct || 0),
      discount_pct: Number(p.discount_pct || 0),
      max_discount: Number(p.max_discount || 0),
      points_bonus_pct: Number(p.points_bonus_pct || 0),
      default_amount: Number(p.default_amount || 0),
    })) as Array<Record<string, unknown>>;

  const cardRewardCatalog = db
    .prepare('SELECT * FROM banking_card_rewards_catalog WHERE is_active = 1 ORDER BY points_cost ASC')
    .all()
    .map((r: any) => ({
      ...r,
      item_type: String(r.reward_type || 'voucher'),
      voucher_max_discount: Number(r.voucher_discount_pct || 0) > 0 ? 200000 : Number(r.cash_value || 0),
    })) as Array<Record<string, unknown>>;

  const cardVouchers = db
    .prepare('SELECT * FROM banking_card_vouchers ORDER BY CASE WHEN status = \'available\' THEN 0 ELSE 1 END, redeemed_at DESC LIMIT 80')
    .all()
    .map((v: any) => ({
      ...v,
      voucher_code: String(v.code || ''),
      max_discount: Number(v.max_discount || (Number(v.discount_pct || 0) > 0 ? 200000 : Number(v.cash_value || 0))),
      min_spend: Number(v.min_spend || (Number(v.cash_value || 0) >= 100000 ? 250000 : 0)),
    })) as Array<Record<string, unknown>>;

  const cardPointsLedger = db
    .prepare('SELECT * FROM banking_card_points_ledger ORDER BY created_at DESC LIMIT 100')
    .all() as Array<Record<string, unknown>>;

  const cardCashbackLogs = db
    .prepare('SELECT * FROM banking_card_cashback_logs ORDER BY created_at DESC LIMIT 100')
    .all() as Array<Record<string, unknown>>;

  const cardInterestLogs = db
    .prepare('SELECT * FROM banking_card_interest_logs ORDER BY created_at DESC LIMIT 60')
    .all() as Array<Record<string, unknown>>;

  const cardBills = db
    .prepare(
      "SELECT * FROM banking_card_bills ORDER BY CASE WHEN status = 'unpaid' THEN 0 ELSE 1 END, due_date ASC, created_at ASC"
    )
    .all() as Array<Record<string, unknown>>;

  return {
    cardBanks,
    cardPartners,
    cardRewardCatalog,
    cardVouchers,
    cardPointsLedger,
    cardCashbackLogs,
    cardInterestLogs,
    cardBills,
  };
}

export type CardTxKind = 'payment' | 'partner' | 'transfer' | 'bill' | 'topup' | 'withdraw' | 'intl';

export function calculateCardFeeForTx(params: {
  card: Record<string, unknown> | null;
  amount: number;
  kind: CardTxKind;
  transferMethod?: string;
}): number {
  const amt = Math.max(0, Math.round(params.amount));
  const card = params.card;
  if (!card) {
    if (params.kind === 'transfer' && (params.transferMethod || '').includes('Hỏa tốc')) return 11000;
    return 0;
  }

  const tier = String(card.card_tier || 'standard') as CardTierId;
  const pct = Math.max(0, Number(params.kind === 'intl' ? card.intl_fee_pct || card.tx_fee_pct || 0 : card.tx_fee_pct || 0));
  const fixed = Math.max(0, Math.round(Number(card.fixed_tx_fee || 0)));

  if (params.kind === 'withdraw') {
    return Math.max(0, Math.round(Number(card.withdraw_fee || 0)));
  }

  if (params.kind === 'transfer') {
    const isExpress = (params.transferMethod || '').includes('Hỏa tốc');
    const expressWaived = tier === 'platinum' || tier === 'diamond' || tier === 'infinite';
    const expressFee = isExpress && !expressWaived ? 11000 : 0;
    const cardFee = Math.round(amt * (pct / 100)) + fixed;
    return expressFee + cardFee;
  }

  return Math.round(amt * (pct / 100)) + fixed;
}

export function validateCardBeforeSpend(params: {
  card: Record<string, unknown>;
  amount: number;
  fee: number;
  kind: CardTxKind;
}): { spentTodayBefore: number; todayStr: string; perTxLimit: number; dailyLimit: number; monthlyLimit: number } {
  const { card, amount, fee, kind } = params;
  if (String(card.status || 'active') === 'cancelled' || String(card.cancelled_at || '').trim()) {
    throw new CardEngineHttpError(400, 'Thẻ đã bị hủy vĩnh viễn.', 'CARD_CANCELLED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }
  if (String(card.status || 'active') !== 'active') {
    throw new CardEngineHttpError(400, 'Thẻ thanh toán hiện đang bị khóa.', 'CARD_LOCKED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }
  if (isCardExpiredLocal(String(card.expiry || ''))) {
    throw new CardEngineHttpError(400, 'Thẻ đã hết hạn sử dụng. Vui lòng chọn thẻ khác.', 'CARD_EXPIRED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }
  if (String(card.linked_status || 'linked') === 'unlinked' || !String(card.account_id || '').trim()) {
    throw new CardEngineHttpError(400, 'Thẻ chưa liên kết tài khoản thanh toán. Vui lòng liên kết tài khoản trước.', 'CARD_UNLINKED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }

  if ((kind === 'partner' || kind === 'payment' || kind === 'bill' || kind === 'topup') && Number(card.online_payment_enabled) === 0) {
    throw new CardEngineHttpError(400, 'Thẻ đang tắt tính năng thanh toán trực tuyến.', 'ONLINE_DISABLED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }
  if (kind === 'intl' && Number(card.intl_payment_enabled ?? 1) === 0) {
    throw new CardEngineHttpError(400, 'Thẻ đang tắt tính năng thanh toán quốc tế.', 'INTL_DISABLED', 'GIAO DỊCH BỊ TỪ CHỐI');
  }

  const totalDebit = amount + fee;
  const perTxLimit = Number(card.per_tx_limit || 50_000_000);
  const dailyLimit = Number(card.daily_limit || 50_000_000);
  const monthlyLimit = Number(card.monthly_limit || 200_000_000);
  const transferLimit = Number(card.transfer_limit || dailyLimit);
  const withdrawLimit = Number(card.withdraw_limit || 20_000_000);
  const onlineLimit = Number(card.online_limit || dailyLimit);

  const todayStr = new Date().toISOString().slice(0, 10);
  const spentTodayBefore = String(card.spent_date || '') === todayStr ? Number(card.spent_today || 0) : 0;
  const spentMonthBefore = Number(card.spent_month || 0);

  if (amount > perTxLimit) {
    throw new CardEngineHttpError(
      400,
      `Số tiền ${formatVndCard(amount)} vượt hạn mức tối đa mỗi giao dịch của thẻ (${formatVndCard(perTxLimit)}).`,
      'EXCEEDS_PER_TX_LIMIT'
    );
  }
  if (kind === 'transfer' && amount > transferLimit) {
    throw new CardEngineHttpError(
      400,
      `Số tiền vượt hạn mức chuyển khoản của thẻ (${formatVndCard(transferLimit)}).`,
      'EXCEEDS_TRANSFER_LIMIT'
    );
  }
  if (kind === 'withdraw' && amount > withdrawLimit) {
    throw new CardEngineHttpError(
      400,
      `Số tiền vượt hạn mức rút tiền của thẻ (${formatVndCard(withdrawLimit)}).`,
      'EXCEEDS_WITHDRAW_LIMIT'
    );
  }
  if ((kind === 'partner' || kind === 'payment') && amount > onlineLimit) {
    throw new CardEngineHttpError(
      400,
      `Số tiền vượt hạn mức thanh toán online của thẻ (${formatVndCard(onlineLimit)}).`,
      'EXCEEDS_ONLINE_LIMIT'
    );
  }
  if (spentTodayBefore + totalDebit > dailyLimit) {
    const remaining = Math.max(0, dailyLimit - spentTodayBefore);
    throw new CardEngineHttpError(
      400,
      `Giao dịch vượt hạn mức ngày của thẻ (${formatVndCard(dailyLimit)}). Còn lại hôm nay: ${formatVndCard(remaining)}.`,
      'EXCEEDS_DAILY_LIMIT'
    );
  }
  if (spentMonthBefore + totalDebit > monthlyLimit) {
    const remaining = Math.max(0, monthlyLimit - spentMonthBefore);
    throw new CardEngineHttpError(
      400,
      `Giao dịch vượt hạn mức tháng của thẻ (${formatVndCard(monthlyLimit)}). Còn lại trong tháng: ${formatVndCard(remaining)}.`,
      'EXCEEDS_MONTHLY_LIMIT'
    );
  }

  return { spentTodayBefore, todayStr, perTxLimit, dailyLimit, monthlyLimit };
}

export function applyCardPostSpendEffectsInTx(params: {
  card: Record<string, unknown>;
  acc: Record<string, unknown>;
  txId: string;
  baseAmount: number;
  totalDebit: number;
  spentTodayBefore: number;
  todayStr: string;
  merchant: string;
  category: string;
  kind: CardTxKind;
  partnerOffer?: Record<string, unknown> | null;
  now: string;
}): {
  cashbackAmount: number;
  cashbackRateApplied: number;
  cashbackTxId: string;
  pointsEarned: number;
} {
  const { card, acc, txId, baseAmount, totalDebit, spentTodayBefore, todayStr, merchant, category, kind, partnerOffer, now } = params;
  const cardId = String(card.id);
  const accId = String(acc.id);
  const last4 = String(card.last4 || '');
  const bank = getBankDefinition(String(card.bank_id || 'hikari'));

  // 0. Guard against zero-amount spend
  if (baseAmount <= 0 || totalDebit <= 0) {
    return {
      cashbackAmount: 0,
      cashbackRateApplied: 0,
      cashbackTxId: '',
      pointsEarned: 0,
    };
  }

  // 1. Update daily & monthly spent tracking on card
  const nextSpentToday = spentTodayBefore + totalDebit;
  db.prepare(
    'UPDATE banking_cards SET spent_today = ?, spent_date = ?, spent_month = COALESCE(spent_month, 0) + ? WHERE id = ?'
  ).run(nextSpentToday, todayStr, totalDebit, cardId);

  // 2. Reward points (earn on spending / bill / topup / transfer)
  const ptRate = Math.max(0, Number(card.reward_point_rate ?? 1));
  const partnerQualified =
    partnerOffer && getTierRank(String(card.card_tier || 'standard')) >= getTierRank(String(partnerOffer.min_tier || 'standard'));
  const partnerPtsBonusPct = partnerQualified ? Math.max(0, Number(partnerOffer?.points_bonus_pct || 0)) : 0;
  const partnerMult = 1 + partnerPtsBonusPct / 100;
  const rawPts = Math.floor((baseAmount / 100000) * ptRate * partnerMult);
  const pointsEarned = kind === 'withdraw' ? 0 : Math.max(baseAmount >= 20000 && ptRate > 0 ? 1 : 0, rawPts);

  if (pointsEarned > 0) {
    const prevPts = Number(card.reward_points || 0);
    const nextPts = prevPts + pointsEarned;
    db.prepare('UPDATE banking_cards SET reward_points = COALESCE(reward_points, 0) + ? WHERE id = ?').run(pointsEarned, cardId);
    db.prepare('UPDATE banking_security_state SET reward_points = COALESCE(reward_points, 0) + ?').run(pointsEarned);
    db.prepare(`
      INSERT INTO banking_card_points_ledger (id, card_id, tx_id, delta_points, balance_after, action_type, title, created_at)
      VALUES (?, ?, ?, ?, ?, 'earn', ?, ?)
    `).run(cardUid('pts'), cardId, txId, pointsEarned, nextPts, `Tích điểm thẻ •••• ${last4} (${merchant})`, now);
  }

  // 3. Cashback for eligible non-transfer, non-withdraw card purchases/bills/topup/intl
  let cashbackAmount = 0;
  let cashbackRateApplied = 0;
  let cashbackTxId = '';

  const eligibleForCashback =
    kind === 'payment' || kind === 'partner' || kind === 'bill' || kind === 'topup' || kind === 'intl';
  if (eligibleForCashback) {
    const baseRate = Math.max(0, Number(card.cashback_rate || 0));
    let bonusRate = 0;
    if (partnerQualified && partnerOffer && Number(partnerOffer.cashback_bonus_pct || 0) > 0) {
      bonusRate = Number(partnerOffer.cashback_bonus_pct || 0);
    }

    cashbackRateApplied = Number((baseRate + bonusRate).toFixed(2));
    if (cashbackRateApplied > 0) {
      const cap = Math.max(0, Number(card.cashback_cap_month || 0));
      const used = Math.max(0, Number(card.cashback_used_month || 0));
      const remainingCap = cap > 0 ? Math.max(0, cap - used) : Number.POSITIVE_INFINITY;
      const rawCb = Math.round(baseAmount * (cashbackRateApplied / 100));
      const ensuredCb = baseAmount >= 1000 && remainingCap >= 1 ? Math.max(1, rawCb) : rawCb;
      cashbackAmount = Math.min(ensuredCb, remainingCap);

      // Guard duplicate cashback for same source_tx_id
      const alreadyCb = db
        .prepare('SELECT 1 FROM banking_card_cashback_logs WHERE source_tx_id = ? LIMIT 1')
        .get(txId);

      if (cashbackAmount > 0 && !alreadyCb) {
        const freshAcc = db
          .prepare('SELECT balance, available_balance FROM banking_accounts_demo WHERE id = ?')
          .get(accId) as { balance: number; available_balance: number } | undefined;

        if (freshAcc) {
          const balBeforeCb = Number(freshAcc.balance || 0);
          const availBeforeCb = Number(freshAcc.available_balance ?? balBeforeCb);
          const nextBalCb = balBeforeCb + cashbackAmount;
          const nextAvailCb = availBeforeCb + cashbackAmount;

          db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_income = COALESCE(monthly_income, 0) + ? WHERE id = ?').run(
            nextBalCb,
            nextAvailCb,
            cashbackAmount,
            accId
          );
          db.prepare('UPDATE banking_cards SET cashback_used_month = COALESCE(cashback_used_month, 0) + ? WHERE id = ?').run(
            cashbackAmount,
            cardId
          );

          cashbackTxId = cardUid('tx');
          const cbRefCode = genCardRefCode();
          const cbNote = `Hoàn tiền Cashback ${cashbackRateApplied}% · Thẻ ${bank.name} •••• ${last4} (${merchant})`;
          const cbSig = signCardReceipt({
            txId: cashbackTxId,
            refCode: cbRefCode,
            amount: cashbackAmount,
            fee: 0,
            totalAmount: cashbackAmount,
            senderAccount: `${bank.shortCode}-CASHBACK`,
            recipientAccount: String(acc.account_number),
            createdAt: now,
            status: 'Thành công',
          });
          const cbReceipt = {
            txId: cashbackTxId,
            template: 'refund',
            refCode: cbRefCode,
            channel: `Cashback ${bank.name}`,
            bankName: bank.name,
            accountNumber: String(acc.account_number),
            senderName: `${bank.name} Cashback`,
            senderAccount: `${bank.shortCode}-CASHBACK`,
            recipientName: String(acc.holder_name),
            recipientAccount: String(acc.account_number),
            sourceCardId: cardId,
            sourceCardLast4: last4,
            amount: cashbackAmount,
            fee: 0,
            totalAmount: cashbackAmount,
            cashbackRate: cashbackRateApplied,
            note: cbNote,
            createdAt: now,
            status: 'Thành công',
            signature: cbSig,
          };

          db.prepare(`
            INSERT INTO banking_transactions_demo (
              id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
              category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
              receipt_json, bill_template, linked_ref, sender_name, sender_account, receipt_sig, source_type,
              source_card_id, source_card_last4
            ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, ?, 'Hoàn tiền', ?, ?, ?, 0, ?, ?, ?, ?, 'refund', ?, ?, ?, ?, 'cashback', ?, ?)
          `).run(
            cashbackTxId,
            accId,
            cashbackAmount,
            `${bank.name} Cashback`,
            cbNote,
            now,
            now,
            `Hoàn tiền ${cashbackRateApplied}%`,
            bank.name,
            String(acc.account_number),
            cashbackAmount,
            nextBalCb,
            cbRefCode,
            JSON.stringify(cbReceipt),
            txId,
            `${bank.name} Cashback`,
            `${bank.shortCode}-CASHBACK`,
            cbSig,
            cardId,
            last4
          );

          db.prepare(`
            INSERT INTO banking_card_cashback_logs (
              id, card_id, source_tx_id, cashback_tx_id, merchant, category, base_amount, rate_pct, cashback_amount, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(cardUid('cb'), cardId, txId, cashbackTxId, merchant, category, baseAmount, cashbackRateApplied, cashbackAmount, now);

          writeCardAudit({
            operation: 'card_cashback_credit',
            txId: cashbackTxId,
            accountId: accId,
            delta: cashbackAmount,
            balanceBefore: balBeforeCb,
            balanceAfter: nextBalCb,
            detail: cbNote,
          });
          recordCardReceipt(cashbackTxId, 'refund');
          pushCardNotification(
            'card',
            `Hoàn tiền +${formatVndCard(cashbackAmount)}`,
            `Thẻ ${bank.name} •••• ${last4} hoàn ${cashbackRateApplied}% tại ${merchant}`,
            cashbackAmount,
            cashbackTxId
          );
        }
      }
    }
  }

  return {
    cashbackAmount,
    cashbackRateApplied,
    cashbackTxId,
    pointsEarned,
  };
}

export function normalizeCardHolderName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function verifyCardSecurityPin(card: Record<string, unknown>, pin?: string): void {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) {
    throw new CardEngineHttpError(403, 'Vui lòng nhập mã PIN để xác thực thao tác bảo mật.', 'PIN_REQUIRED');
  }
  const linkedAcc = card.account_id
    ? (db.prepare('SELECT pin_hash FROM banking_accounts_demo WHERE id = ?').get(String(card.account_id)) as
        | { pin_hash?: string }
        | undefined)
    : undefined;
  const expectedHash = String(card.card_pin_hash || card.pin_hash || linkedAcc?.pin_hash || '');
  const candidateHash = hashSecret(cleanPin);
  const valid = expectedHash ? candidateHash === expectedHash : cleanPin === '123456';
  if (!valid) {
    throw new CardEngineHttpError(
      403,
      'Mã PIN thẻ không chính xác. (Nhập PIN thẻ hoặc mặc định 123456 nếu chưa đổi PIN)',
      'INVALID_CARD_PIN'
    );
  }
}

export function revealCardSensitiveInfo(cardId: string, pin: string) {
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!card) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
  }
  if (String(card.status || '') === 'cancelled' || String(card.cancelled_at || '').trim()) {
    throw new CardEngineHttpError(400, 'Thẻ đã bị hủy vĩnh viễn, không thể xem thông tin bảo mật.', 'CARD_CANCELLED');
  }
  verifyCardSecurityPin(card, pin);

  const encPan = String(card.card_number_enc || '').trim();
  const encCvv = String(card.cvv_enc || '').trim();
  if (!encPan || !encCvv) {
    throw new CardEngineHttpError(500, 'Dữ liệu thẻ mã hóa chưa sẵn sàng.', 'VAULT_MISSING');
  }

  const rawDigits = decryptVaultSecret(db, encPan);
  const cvv = decryptVaultSecret(db, encCvv);
  const bank = getBankDefinition(String(card.bank_id || 'hikari'));
  const linkedAcc = card.account_id
    ? (db.prepare('SELECT holder_name FROM banking_accounts_demo WHERE id = ?').get(String(card.account_id)) as
        | { holder_name?: string }
        | undefined)
    : undefined;

  return {
    cardId,
    cardNumber: formatPanGroups(rawDigits),
    cardNumberDigits: rawDigits,
    rawDigits,
    maskedNumber: String(card.masked_number || `${bank.binPrefix} •••• •••• ${rawDigits.slice(-4)}`),
    last4: String(card.last4 || rawDigits.slice(-4)),
    cvv,
    expiry: String(card.expiry || ''),
    issuedAt: String(card.issued_at || String(card.created_at || '').slice(0, 10)),
    holderName: String(linkedAcc?.holder_name || card.holder_name || 'MINH ANH').toUpperCase(),
    cardCategory: (String(card.card_category || 'debit') === 'credit' ? 'credit' : 'debit') as CardCategory,
    bankName: bank.name,
    expiresInSec: 60,
  };
}

export function changeCardPin(cardId: string, currentPin: string, newPin: string) {
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!card) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
  }
  if (String(card.status || '') === 'cancelled') {
    throw new CardEngineHttpError(400, 'Không thể đổi PIN cho thẻ đã hủy.', 'CARD_CANCELLED');
  }
  verifyCardSecurityPin(card, currentPin);
  const cleanNew = String(newPin || '').trim();
  if (!/^\d{4,6}$/.test(cleanNew)) {
    throw new CardEngineHttpError(400, 'Mã PIN mới phải gồm 4 đến 6 chữ số.', 'INVALID_PIN_FORMAT');
  }
  const nextHash = hashSecret(cleanNew);
  db.prepare('UPDATE banking_cards SET card_pin_hash = ?, pin_hash = ? WHERE id = ?').run(nextHash, nextHash, cardId);
  pushCardNotification(
    'security',
    'Đã đổi mã PIN thẻ',
    `Mã PIN thẻ •••• ${String(card.last4)} vừa được cập nhật thành công.`,
    0,
    cardId
  );
  return { ok: true, cardId };
}

export function cancelBankCard(cardId: string, pin: string) {
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!card) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
  }
  if (String(card.status || '') === 'cancelled') {
    throw new CardEngineHttpError(400, 'Thẻ này đã được hủy trước đó.', 'CARD_ALREADY_CANCELLED');
  }
  verifyCardSecurityPin(card, pin);
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare("UPDATE banking_cards SET status = 'cancelled', cancelled_at = ?, is_primary = 0 WHERE id = ?").run(now, cardId);
    if (Number(card.is_primary) === 1) {
      const replacement = db
        .prepare("SELECT id, expiry FROM banking_cards WHERE id != ? AND status = 'active' AND COALESCE(linked_status, 'linked') = 'linked' ORDER BY created_at ASC")
        .all(cardId) as Array<{ id: string; expiry: string }>;
      const validRep = replacement.find((c) => !isCardExpiredLocal(c.expiry));
      if (validRep) {
        db.prepare('UPDATE banking_cards SET is_primary = 1 WHERE id = ?').run(validRep.id);
      }
    }
    pushCardNotification(
      'security',
      'Đã hủy thẻ vĩnh viễn',
      `Thẻ ${String(card.card_nickname || card.card_name)} (•••• ${String(card.last4)}) đã bị hủy và không thể tiếp tục giao dịch.`,
      0,
      cardId
    );
  });
  run();
  return { ok: true, cardId };
}

export function reissueBankCard(cardId: string, pin: string) {
  const oldCard = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!oldCard) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
  }
  if (String(oldCard.status || '') === 'cancelled') {
    throw new CardEngineHttpError(400, 'Thẻ đã hủy không thể cấp lại trực tiếp. Vui lòng phát hành thẻ mới.', 'CARD_CANCELLED');
  }
  verifyCardSecurityPin(oldCard, pin);

  const bank = getBankDefinition(String(oldCard.bank_id || 'hikari'));
  const panInfo = generateUniqueSimulatedPan(db, bank.binPrefix);
  const rawCvv = generateSimulatedCvv();
  const newId = cardUid('card');
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);
  const nextExpiry = computeFutureExpiry(5);
  const masked = `${bank.binPrefix} •••• •••• ${panInfo.last4}`;

  const run = db.transaction(() => {
    db.prepare(
      "UPDATE banking_cards SET status = 'cancelled', cancelled_at = ?, replaced_by_card_id = ?, is_primary = 0 WHERE id = ?"
    ).run(now, newId, cardId);

    db.prepare(`
      INSERT INTO banking_cards (
        id, account_id, card_type, card_name, card_nickname, masked_number, last4, expiry, cvv, holder_name,
        status, online_payment_enabled, contactless_enabled, intl_payment_enabled, daily_limit, monthly_limit, spent_month, credit_limit,
        pin_hash, card_pin_hash, design_theme, is_primary, created_at, issued_at,
        bank_id, card_tier, card_category, cashback_rate, interest_rate, tx_fee_pct, fixed_tx_fee, withdraw_fee, intl_fee_pct,
        maintenance_fee, reward_point_rate, reward_points, per_tx_limit, transfer_limit, withdraw_limit, online_limit,
        spent_today, spent_date, cashback_cap_month, cashback_used_month, interest_balance_cap, last_interest_at,
        linked_status, network_brand, benefits_json, card_number_enc, card_number_hash, cvv_enc, cvv_hash
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, '•••', ?,
        'active', ?, ?, ?, ?, ?, 0, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        0, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      newId,
      String(oldCard.account_id || ''),
      String(oldCard.card_type || `${bank.id}_${String(oldCard.card_tier || 'standard')}`),
      String(oldCard.card_name || bank.name),
      String(oldCard.card_nickname || oldCard.card_name || bank.name),
      masked,
      panInfo.last4,
      nextExpiry,
      String(oldCard.holder_name || 'MINH ANH'),
      Number(oldCard.online_payment_enabled ?? 1),
      Number(oldCard.contactless_enabled ?? 1),
      Number(oldCard.intl_payment_enabled ?? 1),
      Number(oldCard.daily_limit || 50_000_000),
      Number(oldCard.monthly_limit || 200_000_000),
      Number(oldCard.credit_limit || 0),
      String(oldCard.pin_hash || ''),
      String(oldCard.card_pin_hash || oldCard.pin_hash || ''),
      String(oldCard.design_theme || 'hikari_standard'),
      Number(oldCard.is_primary || 0),
      now,
      todayStr,
      String(oldCard.bank_id || 'hikari'),
      String(oldCard.card_tier || 'standard'),
      String(oldCard.card_category || 'debit'),
      Number(oldCard.cashback_rate || 0),
      Number(oldCard.interest_rate || 0),
      Number(oldCard.tx_fee_pct || 0),
      Number(oldCard.fixed_tx_fee || 0),
      Number(oldCard.withdraw_fee || 0),
      Number(oldCard.intl_fee_pct || 0),
      Number(oldCard.maintenance_fee || 0),
      Number(oldCard.reward_point_rate || 1),
      Number(oldCard.reward_points || 0),
      Number(oldCard.per_tx_limit || 20_000_000),
      Number(oldCard.transfer_limit || 50_000_000),
      Number(oldCard.withdraw_limit || 20_000_000),
      Number(oldCard.online_limit || 30_000_000),
      todayStr,
      Number(oldCard.cashback_cap_month || 2_000_000),
      Number(oldCard.cashback_used_month || 0),
      Number(oldCard.interest_balance_cap || 100_000_000),
      String(oldCard.last_interest_at || ''),
      String(oldCard.linked_status || 'linked'),
      String(oldCard.network_brand || bank.networkBrand),
      String(oldCard.benefits_json || '[]'),
      encryptVaultSecret(db, panInfo.digits),
      panInfo.panHash,
      encryptVaultSecret(db, rawCvv),
      hashCvv(rawCvv)
    );

    pushCardNotification(
      'card',
      'Cấp lại thẻ thành công',
      `Thẻ mới •••• ${panInfo.last4} (${bank.name}) đã thay thế thẻ •••• ${String(oldCard.last4)}.`,
      0,
      newId
    );
  });
  run();

  return {
    oldCardId: cardId,
    newCardId: newId,
    last4: panInfo.last4,
    maskedNumber: masked,
    bankName: bank.name,
  };
}

export function lookupCardPublicInfo(params: { cardId?: string; cardNumber?: string }) {
  let card: Record<string, unknown> | undefined;
  if (params.cardId?.trim()) {
    card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.cardId.trim()) as
      | Record<string, unknown>
      | undefined;
  } else if (params.cardNumber) {
    const cleanDigits = normalizePanDigits(params.cardNumber);
    if (cleanDigits.length >= 12) {
      card = db.prepare('SELECT * FROM banking_cards WHERE card_number_hash = ? LIMIT 1').get(hashPan(cleanDigits)) as
        | Record<string, unknown>
        | undefined;
    }
  }
  if (!card) {
    return { found: false };
  }
  const bank = getBankDefinition(String(card.bank_id || 'hikari'));
  const tierId = (CARD_TIER_ORDER.includes(String(card.card_tier) as CardTierId)
    ? String(card.card_tier)
    : 'standard') as CardTierId;
  return {
    found: true,
    cardId: String(card.id),
    bankId: bank.id,
    bankName: bank.name,
    bankShortCode: bank.shortCode,
    cardCategory: (String(card.card_category || 'debit') === 'credit' ? 'credit' : 'debit') as CardCategory,
    tierLabel: CARD_TIER_LABELS[tierId],
    maskedNumber: String(card.masked_number || ''),
    last4: String(card.last4 || ''),
    holderName: String(card.holder_name || ''),
    status: String(card.status || 'active') as 'active' | 'locked' | 'cancelled',
  };
}

export function issueAdvancedBankCard(params: {
  bankId?: string;
  cardTier?: string;
  cardCategory?: 'debit' | 'credit';
  accountId?: string;
  cardNickname?: string;
  cardType?: string;
  designTheme?: string;
  pin?: string;
  dailyLimit?: number;
  monthlyLimit?: number;
}): {
  cardId: string;
  last4: string;
  maskedNumber: string;
  cardCategory: 'debit' | 'credit';
  cardNickname: string;
  bankName: string;
  tierLabel: string;
} {
  const bankId = (params.bankId || 'hikari') as BankBrandId;
  const bank = getBankDefinition(bankId);

  let tierId: CardTierId = 'standard';
  if (params.cardTier && CARD_TIER_ORDER.includes(params.cardTier as CardTierId)) {
    tierId = params.cardTier as CardTierId;
  } else if (params.cardType) {
    const ct = params.cardType.toLowerCase();
    if (ct.includes('infinite') || ct.includes('black')) tierId = 'infinite';
    else if (ct.includes('diamond')) tierId = 'diamond';
    else if (ct.includes('platinum') || ct.includes('anime')) tierId = 'platinum';
    else if (ct.includes('gold') || ct.includes('premier') || ct.includes('credit')) tierId = 'gold';
    else if (ct.includes('silver') || ct.includes('character')) tierId = 'silver';
  }

  const cardCategory: CardCategory =
    params.cardCategory === 'credit' || (!params.cardCategory && String(params.cardType || '').toLowerCase().includes('credit'))
      ? 'credit'
      : 'debit';

  const cleanPin = String(params.pin || '').trim();
  if (cleanPin && !/^\d{4,6}$/.test(cleanPin)) {
    throw new CardEngineHttpError(400, 'Mã PIN thẻ phải gồm 4 đến 6 chữ số.', 'INVALID_PIN_FORMAT');
  }

  const policy = getTierPolicy(bank.id, tierId);

  const targetAcc = (params.accountId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(params.accountId)
    : db
        .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC, opened_at ASC LIMIT 1")
        .get()) as Record<string, unknown> | undefined;

  if (!targetAcc) {
    throw new CardEngineHttpError(404, 'Không tìm thấy tài khoản liên kết hợp lệ.', 'ACCOUNT_NOT_FOUND');
  }
  if (String(targetAcc.account_role || 'payment') === 'receive_only') {
    throw new CardEngineHttpError(400, 'Không thể phát hành thẻ cho tài khoản chỉ nhận tiền.', 'ACCOUNT_RECEIVE_ONLY');
  }

  const accAvail = Number(targetAcc.available_balance ?? targetAcc.balance ?? 0);
  const allUserAccs = db
    .prepare("SELECT balance FROM banking_accounts_demo WHERE owner_type = 'user'")
    .all() as Array<{ balance: number }>;
  const activeSavings = db
    .prepare("SELECT principal FROM banking_savings WHERE status = 'active'")
    .all() as Array<{ principal: number }>;
  const totalAssets =
    allUserAccs.reduce((s, a) => s + Number(a.balance || 0), 0) +
    activeSavings.reduce((s, sv) => s + Number(sv.principal || 0), 0);

  if (accAvail < policy.issueUnlockReq.minBalance || totalAssets < policy.issueUnlockReq.minTotalAssets) {
    throw new CardEngineHttpError(
      400,
      `Chưa đủ điều kiện mở trực tiếp thẻ ${policy.cardTitle}. Cần số dư TK tối thiểu ${formatVndCard(policy.issueUnlockReq.minBalance)} & tổng tài sản ${formatVndCard(policy.issueUnlockReq.minTotalAssets)} (hoặc mở từ hạng Standard và nâng cấp).`,
      'ISSUE_REQUIREMENT_UNMET'
    );
  }

  const panInfo = generateUniqueSimulatedPan(db, bank.binPrefix);
  const rawCvv = generateSimulatedCvv();
  const id = cardUid('card');
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);
  const expiry = computeFutureExpiry(5);
  const finalNickname = (params.cardNickname || `${policy.cardTitle} ${cardCategory === 'credit' ? 'Credit' : 'Debit'}`)
    .trim()
    .slice(0, 44);
  const cardTypeKey = params.cardType || `${bank.id}_${tierId}_${cardCategory}`;
  const hasPrimary =
    (db.prepare("SELECT COUNT(*) as c FROM banking_cards WHERE is_primary = 1 AND status = 'active'").get() as { c: number }).c > 0;

  const finalDailyLimit = params.dailyLimit ? Math.max(1_000_000, Number(params.dailyLimit)) : policy.dailyLimit;
  const finalMonthlyLimit = params.monthlyLimit ? Math.max(finalDailyLimit, Number(params.monthlyLimit)) : policy.monthlyLimit;
  const finalCreditLimit = cardCategory === 'credit' ? Math.max(20_000_000, policy.creditLimit) : policy.creditLimit;
  const pinHash = cleanPin ? hashSecret(cleanPin) : String(targetAcc.pin_hash || '');
  const maskedNumber = `${bank.binPrefix} •••• •••• ${panInfo.last4}`;

  db.prepare(`
    INSERT INTO banking_cards (
      id, account_id, card_type, card_name, card_nickname, masked_number, last4, expiry, cvv, holder_name,
      status, online_payment_enabled, contactless_enabled, intl_payment_enabled, daily_limit, monthly_limit, spent_month, credit_limit,
      pin_hash, card_pin_hash, design_theme, is_primary, created_at, issued_at,
      bank_id, card_tier, card_category, cashback_rate, interest_rate, tx_fee_pct, fixed_tx_fee, withdraw_fee, intl_fee_pct,
      maintenance_fee, reward_point_rate, reward_points, per_tx_limit, transfer_limit, withdraw_limit, online_limit,
      spent_today, spent_date, cashback_cap_month, cashback_used_month, interest_balance_cap, last_interest_at,
      linked_status, network_brand, benefits_json, card_number_enc, card_number_hash, cvv_enc, cvv_hash
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, '•••', ?,
      'active', 1, 1, 1, ?, ?, 0, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, 0, ?, ?, ?, ?,
      0, ?, ?, 0, ?, '',
      'linked', ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    String(targetAcc.id),
    cardTypeKey,
    finalNickname,
    finalNickname,
    maskedNumber,
    panInfo.last4,
    expiry,
    String(targetAcc.holder_name || 'MINH ANH').toUpperCase(),
    finalDailyLimit,
    finalMonthlyLimit,
    finalCreditLimit,
    pinHash,
    pinHash,
    params.designTheme?.trim() || policy.designTheme,
    hasPrimary ? 0 : 1,
    now,
    todayStr,
    bank.id,
    tierId,
    cardCategory,
    policy.cashbackRate,
    policy.interestRate,
    policy.txFeePct,
    policy.fixedTxFee,
    policy.withdrawFee,
    policy.intlFeePct,
    policy.maintenanceFee,
    policy.rewardPointRate,
    policy.perTxLimit,
    policy.transferLimit,
    policy.withdrawLimit,
    policy.onlineLimit,
    todayStr,
    policy.cashbackCapMonth,
    policy.interestBalanceCap,
    bank.networkBrand,
    JSON.stringify(policy.benefits),
    encryptVaultSecret(db, panInfo.digits),
    panInfo.panHash,
    encryptVaultSecret(db, rawCvv),
    hashCvv(rawCvv)
  );

  pushCardNotification(
    'card',
    `Phát hành thẻ ${bank.name} (${policy.tierLabel} · ${cardCategory === 'credit' ? 'Credit' : 'Debit'})`,
    `Thẻ ${finalNickname} •••• ${panInfo.last4} liên kết TK ${String(targetAcc.account_number)} đã sẵn sàng.`,
    0,
    id
  );

  return {
    cardId: id,
    last4: panInfo.last4,
    maskedNumber,
    cardCategory,
    cardNickname: finalNickname,
    bankName: bank.name,
    tierLabel: policy.tierLabel,
  };
}

function logDeclinedCardTransaction(params: {
  card: Record<string, unknown>;
  acc?: Record<string, unknown>;
  merchant: string;
  amount: number;
  category: string;
  reason: string;
  code: string;
  appSource?: string;
}) {
  try {
    const now = new Date().toISOString();
    const txId = cardUid('tx');
    const refCode = genCardRefCode();
    const bank = getBankDefinition(String(params.card.bank_id || 'hikari'));
    const cardLast4 = String(params.card.last4 || '');
    const accId = String(params.acc?.id || params.card.account_id || 'bank_1');
    const balNow = Number(params.acc?.balance || 0);
    const cleanAmt = Math.max(0, Math.round(Number(params.amount || 0)));
    const noteText = `GIAO DỊCH BỊ TỪ CHỐI: ${params.reason}`;

    const receipt = {
      txId,
      template: 'failed',
      refCode,
      channel: `${params.appSource || 'Cổng thẻ'} · ${bank.name} •••• ${cardLast4}`,
      bankName: bank.name,
      accountNumber: String(params.card.masked_number || ''),
      senderName: String(params.acc?.holder_name || params.card.holder_name || 'MINH ANH'),
      senderAccount: String(params.acc?.account_number || ''),
      sourceCardId: String(params.card.id),
      sourceCardLast4: cardLast4,
      recipientName: params.merchant || 'Đơn vị chấp nhận thẻ',
      recipientAccount: String(params.card.masked_number || ''),
      amount: cleanAmt,
      fee: 0,
      totalAmount: 0,
      note: noteText,
      failureReason: params.reason,
      failureCode: params.code,
      createdAt: now,
      status: 'Thất bại',
    };

    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, failure_reason,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, source_card_id, source_card_last4,
        source_type, tx_status_code, tx_usage_channel
      ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thất bại', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'failed', ?, ?, ?, ?, 'card', 'DECLINED', ?)
    `).run(
      txId,
      accId,
      cleanAmt,
      params.merchant || 'Thanh toán thẻ',
      noteText,
      now,
      params.reason,
      params.category || 'Mua sắm',
      receipt.channel,
      bank.name,
      String(params.card.masked_number || ''),
      balNow,
      refCode,
      JSON.stringify(receipt),
      receipt.senderName,
      receipt.senderAccount,
      String(params.card.id),
      cardLast4,
      params.appSource || 'card_gateway'
    );

    pushCardNotification(
      'security',
      'Giao dịch thẻ bị từ chối',
      `Thẻ •••• ${cardLast4} tại ${params.merchant || 'Merchant'}: ${params.reason}`,
      0,
      txId
    );
  } catch {
    // non-fatal
  }
}

export function processUniversalCardPayment(params: {
  cardId?: string;
  cardNumber?: string;
  holderName?: string;
  expiry?: string;
  cvv?: string;
  merchant: string;
  amount: number;
  category?: string;
  partnerId?: string;
  voucherId?: string;
  billId?: string;
  channelType?: 'pos' | 'online' | 'partner' | 'intl';
  appSource?: string;
  idempotencyKey?: string;
}) {
  const idem = (params.idempotencyKey || '').trim();
  if (idem) {
    const existingTx = db
      .prepare('SELECT * FROM banking_transactions_demo WHERE idempotency_key = ? LIMIT 1')
      .get(idem) as Record<string, unknown> | undefined;
    if (existingTx) {
      let parsedReceipt = {};
      try {
        parsedReceipt = JSON.parse(String(existingTx.receipt_json || '{}'));
      } catch {
        parsedReceipt = {};
      }
      return { transaction: existingTx, receipt: parsedReceipt, idempotentHit: true };
    }
  }

  const rawAmt = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(rawAmt) || rawAmt < 1000) {
    throw new CardEngineHttpError(
      400,
      'Số tiền thanh toán phải từ 1.000 VNĐ trở lên.',
      'INVALID_AMOUNT',
      'GIAO DỊCH BỊ TỪ CHỐI'
    );
  }

  // Locate card by cardId OR manual PAN
  let card: Record<string, unknown> | undefined;
  const isManualEntry = !params.cardId?.trim();
  if (params.cardId?.trim()) {
    card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.cardId.trim()) as
      | Record<string, unknown>
      | undefined;
    if (!card) {
      throw new CardEngineHttpError(404, 'Không tìm thấy thẻ thanh toán.', 'CARD_NOT_FOUND', 'GIAO DỊCH BỊ TỪ CHỐI');
    }
  } else {
    const cleanDigits = normalizePanDigits(params.cardNumber || '');
    if (cleanDigits.length < 16) {
      throw new CardEngineHttpError(
        400,
        'Vui lòng nhập đầy đủ 16 chữ số thẻ ngân hàng.',
        'INVALID_CARD_NUMBER',
        'GIAO DỊCH BỊ TỪ CHỐI'
      );
    }
    card = db.prepare('SELECT * FROM banking_cards WHERE card_number_hash = ? LIMIT 1').get(hashPan(cleanDigits)) as
      | Record<string, unknown>
      | undefined;
    if (!card) {
      throw new CardEngineHttpError(
        400,
        'Số thẻ không tồn tại trong hệ thống Hikari Bank.',
        'CARD_NOT_FOUND',
        'GIAO DỊCH BỊ TỪ CHỐI'
      );
    }
  }

  const linkedAccForDecline = card.account_id
    ? (db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(String(card.account_id)) as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const rejectAndLog = (statusCode: number, reason: string, code: string, merchantName: string, categoryName: string) => {
    logDeclinedCardTransaction({
      card: card!,
      acc: linkedAccForDecline,
      merchant: merchantName,
      amount: rawAmt,
      category: categoryName,
      reason,
      code,
      appSource: params.appSource,
    });
    throw new CardEngineHttpError(statusCode, reason, code, 'GIAO DỊCH BỊ TỪ CHỐI');
  };

  const quickMerchant = String(params.merchant || 'Thanh toán thẻ').trim();
  const quickCategory = String(params.category || 'Mua sắm').trim();

  // Check lock / cancelled first so any attempt against a locked/cancelled card explicitly returns & logs lock/cancel status
  if (String(card.status || 'active') === 'cancelled' || String(card.cancelled_at || '').trim()) {
    rejectAndLog(400, 'Thẻ đã bị hủy vĩnh viễn.', 'CARD_CANCELLED', quickMerchant, quickCategory);
  }
  if (String(card.status || 'active') !== 'active') {
    rejectAndLog(400, 'Thẻ thanh toán hiện đang bị khóa.', 'CARD_LOCKED', quickMerchant, quickCategory);
  }

  // Verify manual card credentials (holder name, expiry MM/YY, CVV)
  if (isManualEntry) {
    const cleanExpiry = String(params.expiry || '').trim();
    const cleanCvv = String(params.cvv || '').trim();
    const expectedHolder = normalizeCardHolderName(
      String(linkedAccForDecline?.holder_name || card.holder_name || 'MINH ANH')
    );
    const providedHolder = normalizeCardHolderName(params.holderName || '');

    if (!providedHolder || providedHolder !== expectedHolder) {
      rejectAndLog(
        400,
        'Tên chủ thẻ không khớp với thông tin thẻ đã phát hành.',
        'INVALID_HOLDER_NAME',
        quickMerchant,
        quickCategory
      );
    }
    if (!cleanExpiry || cleanExpiry !== String(card.expiry || '').trim()) {
      rejectAndLog(400, 'Ngày hết hạn thẻ (MM/YY) không chính xác.', 'INVALID_EXPIRY', quickMerchant, quickCategory);
    }
    if (!cleanCvv || hashCvv(cleanCvv) !== String(card.cvv_hash || '')) {
      rejectAndLog(400, 'Mã bảo mật CVV không chính xác.', 'INVALID_CVV', quickMerchant, quickCategory);
    }
  }

  const txId = cardUid('tx');
  const refCode = genCardRefCode();
  const now = new Date().toISOString();

  let receiptPayload: Record<string, unknown> = {};
  let appliedDiscount = 0;
  let appliedFee = 0;
  let cbSummary = { cashbackAmount: 0, cashbackRateApplied: 0, cashbackTxId: '', pointsEarned: 0 };

  const run = db.transaction(() => {
    const freshCard = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(String(card!.id)) as Record<string, unknown>;

    let cardBillRow: Record<string, unknown> | undefined;
    if (params.billId) {
      cardBillRow = db.prepare('SELECT * FROM banking_card_bills WHERE id = ?').get(params.billId) as
        | Record<string, unknown>
        | undefined;
      if (!cardBillRow) {
        throw new CardEngineHttpError(404, 'Không tìm thấy hóa đơn thanh toán bằng thẻ.', 'BILL_NOT_FOUND', 'GIAO DỊCH BỊ TỪ CHỐI');
      }
      if (String(cardBillRow.status || 'unpaid') !== 'unpaid') {
        throw new CardEngineHttpError(
          400,
          'Hóa đơn này đã được thanh toán trước đó.',
          'BILL_ALREADY_PAID',
          'GIAO DỊCH BỊ TỪ CHỐI'
        );
      }
    }

    const effectivePartnerId = params.partnerId || (cardBillRow ? String(cardBillRow.partner_id || '') : '');
    const partnerOffer = effectivePartnerId
      ? (db.prepare('SELECT * FROM banking_card_partners WHERE id = ? AND is_active = 1').get(effectivePartnerId) as
          | Record<string, unknown>
          | undefined)
      : undefined;

    if (params.partnerId && !partnerOffer) {
      throw new CardEngineHttpError(
        400,
        'Đối tác thanh toán không hợp lệ hoặc đã ngừng hoạt động.',
        'INVALID_PARTNER',
        'GIAO DỊCH BỊ TỪ CHỐI'
      );
    }

    const cleanMerchant = (
      cardBillRow
        ? String(cardBillRow.merchant_name)
        : partnerOffer
        ? String(partnerOffer.merchant_name)
        : String(params.merchant || '')
    ).trim();
    if (!cleanMerchant) {
      throw new CardEngineHttpError(
        400,
        'Chưa có đối tác hoặc tên cửa hàng/hóa đơn cần thanh toán.',
        'MISSING_MERCHANT',
        'GIAO DỊCH BỊ TỪ CHỐI'
      );
    }
    const resolvedCategory =
      params.category || (cardBillRow ? String(cardBillRow.category) : partnerOffer ? String(partnerOffer.category) : 'Mua sắm');
    const billBaseAmt = cardBillRow ? Math.round(Number(cardBillRow.amount || 0)) : rawAmt;

    // Apply optional voucher
    let discountAmt = 0;
    let appliedVoucher: Record<string, unknown> | undefined;
    if (params.voucherId) {
      appliedVoucher = db
        .prepare("SELECT * FROM banking_card_vouchers WHERE id = ? AND status = 'available'")
        .get(params.voucherId) as Record<string, unknown> | undefined;
      if (!appliedVoucher) {
        throw new CardEngineHttpError(400, 'Voucher không hợp lệ hoặc đã được sử dụng.', 'INVALID_VOUCHER', 'GIAO DỊCH BỊ TỪ CHỐI');
      }
      const minSpend = Number(appliedVoucher.min_spend || (Number(appliedVoucher.cash_value || 0) >= 100000 ? 250000 : 0));
      if (minSpend > 0 && billBaseAmt < minSpend) {
        throw new CardEngineHttpError(
          400,
          `Voucher yêu cầu hóa đơn tối thiểu ${formatVndCard(minSpend)}.`,
          'VOUCHER_MIN_SPEND',
          'GIAO DỊCH BỊ TỪ CHỐI'
        );
      }
      if (Number(appliedVoucher.discount_pct || 0) > 0) {
        const rawVDisc = Math.round(billBaseAmt * (Number(appliedVoucher.discount_pct) / 100));
        const vMax = Number(appliedVoucher.max_discount || 200000);
        discountAmt = vMax > 0 ? Math.min(vMax, rawVDisc) : rawVDisc;
      } else if (Number(appliedVoucher.cash_value || 0) > 0) {
        discountAmt = Number(appliedVoucher.cash_value);
      }
    }

    if (partnerOffer && Number(partnerOffer.discount_pct || 0) > 0) {
      const cardRank = getTierRank(String(freshCard.card_tier || 'standard'));
      const minRank = getTierRank(String(partnerOffer.min_tier || 'standard'));
      if (cardRank >= minRank) {
        const rawPDisc = Math.round(billBaseAmt * (Number(partnerOffer.discount_pct) / 100));
        const pMax = Number(partnerOffer.max_discount || 0);
        discountAmt += pMax > 0 ? Math.min(pMax, rawPDisc) : rawPDisc;
      }
    }

    const rawNet = billBaseAmt - Math.max(0, discountAmt);
    if (rawNet <= 0) {
      throw new CardEngineHttpError(
        400,
        'Hóa đơn 0đ sau ưu đãi không thể thực hiện thanh toán hoặc nhận hoàn tiền.',
        'ZERO_PAYABLE_AMOUNT',
        'GIAO DỊCH BỊ TỪ CHỐI'
      );
    }
    const netAmount = Math.round(rawNet);
    const txKind: CardTxKind =
      partnerOffer || params.channelType === 'partner'
        ? 'partner'
        : params.channelType === 'intl'
        ? 'intl'
        : params.channelType === 'pos'
        ? 'payment'
        : 'payment';
    const fee = calculateCardFeeForTx({ card: freshCard, amount: netAmount, kind: txKind });
    appliedDiscount = Math.max(0, discountAmt);
    appliedFee = fee;
    const totalDebit = netAmount + fee;

    if (params.channelType === 'pos' && Number(freshCard.contactless_enabled ?? 1) === 0) {
      rejectAndLog(400, 'Thẻ đang tắt tính năng thanh toán chạm / POS.', 'POS_DISABLED', cleanMerchant, resolvedCategory);
    }

    let limitInfo: { spentTodayBefore: number; todayStr: string; perTxLimit: number; dailyLimit: number; monthlyLimit: number };
    try {
      limitInfo = validateCardBeforeSpend({ card: freshCard, amount: netAmount, fee, kind: txKind });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        rejectAndLog(err.statusCode, err.message, err.code, cleanMerchant, resolvedCategory);
      }
      throw err;
    }

    if (String(freshCard.card_category || 'debit') === 'credit' && Number(freshCard.credit_limit || 0) > 0) {
      const creditCap = Number(freshCard.credit_limit || 0);
      if (Number(freshCard.spent_month || 0) + totalDebit > creditCap) {
        rejectAndLog(
          400,
          `Giao dịch vượt hạn mức tín dụng khả dụng của thẻ (${formatVndCard(creditCap)}).`,
          'EXCEEDS_CREDIT_LIMIT',
          cleanMerchant,
          resolvedCategory
        );
      }
    }

    const acc = db
      .prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'")
      .get(String(freshCard.account_id || '')) as Record<string, unknown> | undefined;
    if (!acc) {
      rejectAndLog(404, 'Không tìm thấy tài khoản liên kết của thẻ.', 'LINKED_ACCOUNT_NOT_FOUND', cleanMerchant, resolvedCategory);
    }
    if (String(acc!.account_role || 'payment') === 'receive_only') {
      rejectAndLog(400, 'Tài khoản liên kết chỉ nhận tiền, không thể thanh toán.', 'RECEIVE_ONLY', cleanMerchant, resolvedCategory);
    }

    const balBefore = Number(acc!.balance || 0);
    const availBefore = Number(acc!.available_balance ?? balBefore);
    if (availBefore < totalDebit) {
      rejectAndLog(
        400,
        `Số dư tài khoản liên kết (${formatVndCard(availBefore)}) không đủ thanh toán ${formatVndCard(totalDebit)}.`,
        'INSUFFICIENT_BALANCE',
        cleanMerchant,
        resolvedCategory
      );
    }

    const nextBal = balBefore - totalDebit;
    const nextAvail = availBefore - totalDebit;
    db.prepare(
      'UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_expense = COALESCE(monthly_expense, 0) + ? WHERE id = ?'
    ).run(nextBal, nextAvail, totalDebit, String(acc!.id));

    if (appliedVoucher) {
      db.prepare("UPDATE banking_card_vouchers SET status = 'used', used_at = ? WHERE id = ?").run(
        now,
        String(appliedVoucher.id)
      );
    }

    if (cardBillRow) {
      db.prepare(
        "UPDATE banking_card_bills SET status = 'completed', paid_at = ?, paid_tx_id = ?, paid_card_id = ? WHERE id = ?"
      ).run(now, txId, String(freshCard.id), String(cardBillRow.id));
    }

    const bank = getBankDefinition(String(freshCard.bank_id || 'hikari'));
    const cardNick = String(freshCard.card_nickname || freshCard.card_name || bank.name);
    const sig = signCardReceipt({
      txId,
      refCode,
      amount: netAmount,
      fee,
      totalAmount: totalDebit,
      senderAccount: String(acc!.account_number),
      recipientAccount: String(freshCard.masked_number),
      createdAt: now,
      status: 'Thành công',
    });

    const noteText = appliedVoucher
      ? `Thanh toán thẻ ${cardNick} tại ${cleanMerchant} (Áp dụng ${String(appliedVoucher.title)})`
      : `Thanh toán thẻ ${cardNick} tại ${cleanMerchant}`;

    receiptPayload = {
      txId,
      template: 'shopping',
      refCode,
      channel: `${params.appSource ? `${params.appSource} · ` : ''}Thẻ ${bank.name} •••• ${String(freshCard.last4)}`,
      bankName: bank.name,
      accountNumber: String(freshCard.masked_number),
      senderName: String(acc!.holder_name),
      senderAccount: String(acc!.account_number),
      sourceAccountId: String(acc!.id),
      sourceAccountNickname: String(acc!.nickname || acc!.account_type || ''),
      sourceCardId: String(freshCard.id),
      sourceCardLast4: String(freshCard.last4),
      sourceCardNickname: cardNick,
      cardBankId: bank.id,
      cardTier: String(freshCard.card_tier || 'standard'),
      cardCategory: String(freshCard.card_category || 'debit'),
      recipientName: cleanMerchant,
      recipientAccount: String(freshCard.masked_number),
      amount: netAmount,
      originalAmount: billBaseAmt,
      discountAmount: discountAmt,
      fee,
      totalAmount: totalDebit,
      note: noteText,
      createdAt: now,
      status: 'Thành công',
      signature: sig,
    };

    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, receipt_sig, idempotency_key,
        source_card_id, source_card_last4, source_type, tx_status_code, tx_usage_channel
      ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shopping', ?, ?, ?, ?, ?, ?, 'card', 'SUCCESS', ?)
    `).run(
      txId,
      String(acc!.id),
      netAmount,
      cleanMerchant,
      noteText,
      now,
      now,
      resolvedCategory,
      String(receiptPayload.channel),
      bank.name,
      String(freshCard.masked_number),
      fee,
      totalDebit,
      nextBal,
      refCode,
      JSON.stringify(receiptPayload),
      String(acc!.holder_name),
      String(acc!.account_number),
      sig,
      idem,
      String(freshCard.id),
      String(freshCard.last4),
      params.appSource || txKind
    );

    writeCardAudit({
      operation: 'card_payment_debit',
      txId,
      accountId: String(acc!.id),
      delta: -totalDebit,
      balanceBefore: balBefore,
      balanceAfter: nextBal,
      detail: noteText,
    });
    recordCardReceipt(txId, 'shopping');

    cbSummary = applyCardPostSpendEffectsInTx({
      card: freshCard,
      acc: acc!,
      txId,
      baseAmount: netAmount,
      totalDebit,
      spentTodayBefore: limitInfo.spentTodayBefore,
      todayStr: limitInfo.todayStr,
      merchant: cleanMerchant,
      category: resolvedCategory,
      kind: txKind,
      partnerOffer,
      now,
    });

    receiptPayload.cashbackAmount = cbSummary.cashbackAmount;
    receiptPayload.cashbackRate = cbSummary.cashbackRateApplied;
    receiptPayload.pointsEarned = cbSummary.pointsEarned;
    db.prepare('UPDATE banking_transactions_demo SET receipt_json = ? WHERE id = ?').run(JSON.stringify(receiptPayload), txId);

    pushCardNotification(
      'card',
      `Thanh toán thẻ -${formatVndCard(totalDebit)}`,
      `${cleanMerchant} · Thẻ ${bank.name} •••• ${String(freshCard.last4)}${
        cbSummary.cashbackAmount > 0 ? ` · Hoàn ${formatVndCard(cbSummary.cashbackAmount)}` : ''
      }`,
      -totalDebit,
      txId
    );
  });

  run();

  return {
    transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId) as Record<string, unknown>,
    receipt: receiptPayload,
    discountAmount: appliedDiscount,
    fee: appliedFee,
    cashbackAmount: cbSummary.cashbackAmount,
    cashbackEarned: cbSummary.cashbackAmount,
    cashbackRateApplied: cbSummary.cashbackRateApplied,
    pointsEarned: cbSummary.pointsEarned,
  };
}

export function executeCardPaymentTransaction(params: {
  cardId: string;
  merchant?: string;
  amount?: number;
  category?: string;
  partnerId?: string;
  voucherId?: string;
  billId?: string;
  channelType?: 'pos' | 'online' | 'partner' | 'intl';
  idempotencyKey?: string;
}) {
  const unpaidCount = (
    db.prepare("SELECT COUNT(*) as c FROM banking_card_bills WHERE status = 'unpaid'").get() as { c: number }
  ).c;

  if (unpaidCount === 0) {
    throw new CardEngineHttpError(
      400,
      'Hiện không còn hóa đơn cần thanh toán bằng thẻ.',
      'NO_UNPAID_BILLS',
      'KHÔNG THỂ THANH TOÁN'
    );
  }

  let resolvedBill: Record<string, unknown> | undefined;
  if (params.billId) {
    resolvedBill = db.prepare('SELECT * FROM banking_card_bills WHERE id = ?').get(params.billId) as
      | Record<string, unknown>
      | undefined;
    if (!resolvedBill) {
      throw new CardEngineHttpError(404, 'Không tìm thấy hóa đơn cần thanh toán.', 'BILL_NOT_FOUND');
    }
    if (String(resolvedBill.status || '') !== 'unpaid') {
      throw new CardEngineHttpError(400, 'Hóa đơn này đã được thanh toán hoàn tất.', 'BILL_ALREADY_PAID');
    }
  } else if (params.partnerId) {
    resolvedBill = db
      .prepare("SELECT * FROM banking_card_bills WHERE partner_id = ? AND status = 'unpaid' ORDER BY due_date ASC LIMIT 1")
      .get(params.partnerId) as Record<string, unknown> | undefined;
    if (!resolvedBill) {
      throw new CardEngineHttpError(
        400,
        'Hóa đơn của đối tác này đã hoàn thành. Vui lòng chọn hóa đơn chưa thanh toán khác.',
        'BILL_ALREADY_PAID'
      );
    }
  } else {
    resolvedBill = db
      .prepare("SELECT * FROM banking_card_bills WHERE status = 'unpaid' ORDER BY due_date ASC, created_at ASC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
  }

  return processUniversalCardPayment({
    cardId: params.cardId,
    billId: resolvedBill ? String(resolvedBill.id) : undefined,
    merchant: resolvedBill ? String(resolvedBill.merchant_name) : String(params.merchant || ''),
    amount: resolvedBill ? Number(resolvedBill.amount || 0) : Number(params.amount || 0),
    category: resolvedBill ? String(resolvedBill.category) : params.category,
    partnerId: resolvedBill ? String(resolvedBill.partner_id || '') : params.partnerId,
    voucherId: params.voucherId,
    channelType: params.channelType || 'partner',
    appSource: 'Hoàn tiền & Hóa đơn thẻ',
    idempotencyKey: params.idempotencyKey,
  });
}

export function upgradeBankCardTier(cardId: string, requestedTier?: string) {
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!card) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ cần nâng cấp.', 'CARD_NOT_FOUND');
  }
  if (String(card.status || 'active') !== 'active') {
    throw new CardEngineHttpError(400, 'Thẻ đang bị khóa, không thể nâng cấp hạng.', 'CARD_LOCKED');
  }

  const userAccounts = db
    .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user'")
    .all() as Array<Record<string, unknown>>;
  const accMap = new Map(userAccounts.map((a) => [String(a.id), a]));
  const activeSavings = db.prepare("SELECT principal FROM banking_savings WHERE status = 'active'").all() as Array<{ principal: number }>;
  const activeInvestments = db
    .prepare("SELECT units, current_price FROM banking_investments WHERE status = 'active'")
    .all() as Array<{ units: number; current_price: number }>;

  const totalAssets =
    userAccounts.reduce((s, a) => s + Number(a.balance || 0), 0) +
    activeSavings.reduce((s, sv) => s + Number(sv.principal || 0), 0) +
    activeInvestments.reduce((s, inv) => s + Math.round(Number(inv.units || 0) * Number(inv.current_price || 0)), 0);

  const stats = computeCardStatsForRow(card, accMap, totalAssets);
  const currentTier = stats.card_tier as CardTierId;
  const curRank = getTierRank(currentTier);
  if (curRank >= CARD_TIER_ORDER.length - 1) {
    throw new CardEngineHttpError(400, 'Thẻ đã đạt hạng cao nhất (Infinite).', 'MAX_TIER_REACHED');
  }

  const nextTier = CARD_TIER_ORDER[curRank + 1];
  if (requestedTier && requestedTier !== nextTier) {
    throw new CardEngineHttpError(400, `Cần nâng cấp lần lượt theo bậc: hạng tiếp theo là ${CARD_TIER_LABELS[nextTier]}.`, 'INVALID_TIER_STEP');
  }

  if (stats.linked_status !== 'linked') {
    throw new CardEngineHttpError(400, 'Thẻ cần được liên kết với tài khoản thanh toán trước khi nâng cấp.', 'CARD_UNLINKED');
  }

  const upg = stats.upgrade_status as { eligible: boolean; missingReasons: string[] };
  if (!upg.eligible) {
    throw new CardEngineHttpError(
      400,
      `Chưa đủ điều kiện nâng cấp lên ${CARD_TIER_LABELS[nextTier]}: ${upg.missingReasons.join('; ')}`,
      'UPGRADE_REQUIREMENTS_UNMET'
    );
  }

  const bank = getBankDefinition(stats.bank_id);
  const nextPolicy = getTierPolicy(bank.id, nextTier);
  const oldPolicy = getTierPolicy(bank.id, currentTier);
  const currentNick = String(card.card_nickname || card.card_name || '');
  const updatedNick = currentNick === oldPolicy.cardTitle || currentNick.includes(oldPolicy.tierLabel) ? nextPolicy.cardTitle : currentNick;

  db.prepare(`
    UPDATE banking_cards SET
      card_tier = ?,
      card_name = ?,
      card_nickname = ?,
      design_theme = ?,
      cashback_rate = ?,
      interest_rate = ?,
      tx_fee_pct = ?,
      fixed_tx_fee = ?,
      withdraw_fee = ?,
      intl_fee_pct = ?,
      maintenance_fee = ?,
      reward_point_rate = ?,
      per_tx_limit = MAX(COALESCE(per_tx_limit, 0), ?),
      daily_limit = MAX(COALESCE(daily_limit, 0), ?),
      monthly_limit = MAX(COALESCE(monthly_limit, 0), ?),
      transfer_limit = MAX(COALESCE(transfer_limit, 0), ?),
      withdraw_limit = MAX(COALESCE(withdraw_limit, 0), ?),
      online_limit = MAX(COALESCE(online_limit, 0), ?),
      cashback_cap_month = ?,
      interest_balance_cap = ?,
      credit_limit = MAX(COALESCE(credit_limit, 0), ?),
      benefits_json = ?
    WHERE id = ?
  `).run(
    nextTier,
    nextPolicy.cardTitle,
    updatedNick,
    nextPolicy.designTheme,
    nextPolicy.cashbackRate,
    nextPolicy.interestRate,
    nextPolicy.txFeePct,
    nextPolicy.fixedTxFee,
    nextPolicy.withdrawFee,
    nextPolicy.intlFeePct,
    nextPolicy.maintenanceFee,
    nextPolicy.rewardPointRate,
    nextPolicy.perTxLimit,
    nextPolicy.dailyLimit,
    nextPolicy.monthlyLimit,
    nextPolicy.transferLimit,
    nextPolicy.withdrawLimit,
    nextPolicy.onlineLimit,
    nextPolicy.cashbackCapMonth,
    nextPolicy.interestBalanceCap,
    nextPolicy.creditLimit,
    JSON.stringify(nextPolicy.benefits),
    cardId
  );

  pushCardNotification(
    'card',
    `Nâng cấp thẻ lên ${nextPolicy.tierLabel} thành công`,
    `Thẻ ${bank.name} •••• ${String(card.last4)} hiện có Cashback ${nextPolicy.cashbackRate}% · Lãi suất ${nextPolicy.interestRate}%/năm.`,
    0,
    cardId
  );

  return {
    cardId,
    previousTier: currentTier,
    newTier: nextTier,
    policy: nextPolicy,
  };
}

export function claimCardInterestPayout(cardId: string) {
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);

  let payoutSummary: Record<string, unknown> = {};
  const txId = cardUid('tx');

  const run = db.transaction(() => {
    const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
    if (!card) {
      throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
    }
    if (String(card.status || 'active') !== 'active') {
      throw new CardEngineHttpError(400, 'Thẻ đang bị khóa, không đủ điều kiện nhận lãi.', 'CARD_LOCKED');
    }
    if (String(card.linked_status || 'linked') === 'unlinked' || !String(card.account_id || '').trim()) {
      throw new CardEngineHttpError(400, 'Thẻ chưa liên kết tài khoản thanh toán.', 'CARD_UNLINKED');
    }

    const bank = getBankDefinition(String(card.bank_id || 'hikari'));
    const tier = String(card.card_tier || 'standard') as CardTierId;
    const policy = getTierPolicy(bank.id, tier);
    const interestRate = Number(card.interest_rate ?? policy.interestRate);
    if (interestRate <= 0) {
      throw new CardEngineHttpError(
        400,
        `Hạng thẻ ${policy.tierLabel} hiện có lãi suất 0%/năm. Nâng cấp lên Silver trở lên để nhận lãi suất theo thẻ.`,
        'ZERO_INTEREST_TIER'
      );
    }

    const existingLog = db
      .prepare('SELECT 1 FROM banking_card_interest_logs WHERE card_id = ? AND cycle_key = ? LIMIT 1')
      .get(cardId, todayStr);
    if (existingLog || String(card.last_interest_at || '').slice(0, 10) === todayStr) {
      throw new CardEngineHttpError(
        400,
        `Kỳ lãi ngày ${todayStr} của thẻ •••• ${String(card.last4)} đã được chi trả trước đó.`,
        'ALREADY_CLAIMED_CYCLE'
      );
    }

    const acc = db
      .prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'")
      .get(String(card.account_id || '')) as Record<string, unknown> | undefined;
    if (!acc) {
      throw new CardEngineHttpError(404, 'Không tìm thấy tài khoản liên kết.', 'LINKED_ACCOUNT_NOT_FOUND');
    }

    const balBefore = Number(acc.balance || 0);
    const availBefore = Number(acc.available_balance ?? balBefore);
    const cap = Number(card.interest_balance_cap || policy.interestBalanceCap || 100_000_000);
    const eligibleBalance = Math.min(Math.max(0, availBefore), cap);
    if (eligibleBalance <= 0) {
      throw new CardEngineHttpError(400, 'Số dư tài khoản liên kết bằng 0 nên chưa phát sinh tiền lãi.', 'ZERO_ELIGIBLE_BALANCE');
    }

    const lastAt = String(card.last_interest_at || '');
    const elapsedDays = lastAt ? Math.max(1, Math.min(30, Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400_000))) : 1;
    const interestAmount = Math.max(1, Math.round(eligibleBalance * (interestRate / 100) * (elapsedDays / 365)));

    const nextBal = balBefore + interestAmount;
    const nextAvail = availBefore + interestAmount;
    const refCode = genCardRefCode();
    const note = `Nhận lãi suất thẻ ${bank.name} ${policy.tierLabel} (${interestRate}%/năm · ${elapsedDays} ngày · •••• ${String(card.last4)})`;

    const sig = signCardReceipt({
      txId,
      refCode,
      amount: interestAmount,
      fee: 0,
      totalAmount: interestAmount,
      senderAccount: `${bank.shortCode}-INTEREST`,
      recipientAccount: String(acc.account_number),
      createdAt: now,
      status: 'Thành công',
    });

    const receipt = {
      txId,
      template: 'savings_settle',
      refCode,
      channel: `Lãi suất thẻ ${bank.name}`,
      bankName: bank.name,
      accountNumber: String(acc.account_number),
      senderName: `${bank.name} Interest`,
      senderAccount: `${bank.shortCode}-INTEREST`,
      recipientName: String(acc.holder_name),
      recipientAccount: String(acc.account_number),
      sourceCardId: cardId,
      sourceCardLast4: String(card.last4),
      amount: interestAmount,
      fee: 0,
      totalAmount: interestAmount,
      interestRate,
      eligibleBalance,
      elapsedDays,
      note,
      createdAt: now,
      status: 'Thành công',
      signature: sig,
    };

    db.prepare(
      'UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_income = COALESCE(monthly_income, 0) + ? WHERE id = ?'
    ).run(nextBal, nextAvail, interestAmount, String(acc.id));

    db.prepare('UPDATE banking_cards SET last_interest_at = ? WHERE id = ?').run(now, cardId);

    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, receipt_sig, source_type,
        source_card_id, source_card_last4
      ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, ?, 'Tiền lãi', ?, ?, ?, 0, ?, ?, ?, ?, 'savings_settle', ?, ?, ?, 'card_interest', ?, ?)
    `).run(
      txId,
      String(acc.id),
      interestAmount,
      `${bank.name} Interest`,
      note,
      now,
      now,
      `Lãi thẻ ${interestRate}%/năm`,
      bank.name,
      String(acc.account_number),
      interestAmount,
      nextBal,
      refCode,
      JSON.stringify(receipt),
      `${bank.name} Interest`,
      `${bank.shortCode}-INTEREST`,
      sig,
      cardId,
      String(card.last4)
    );

    db.prepare(`
      INSERT INTO banking_card_interest_logs (
        id, card_id, account_id, tx_id, cycle_key, eligible_balance, interest_rate, interest_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cardUid('int'), cardId, String(acc.id), txId, todayStr, eligibleBalance, interestRate, interestAmount, now);

    writeCardAudit({
      operation: 'card_interest_credit',
      txId,
      accountId: String(acc.id),
      delta: interestAmount,
      balanceBefore: balBefore,
      balanceAfter: nextBal,
      detail: note,
    });
    recordCardReceipt(txId, 'savings_settle');
    pushCardNotification(
      'interest',
      `Nhận lãi thẻ +${formatVndCard(interestAmount)}`,
      `Thẻ ${bank.name} •••• ${String(card.last4)} (${interestRate}%/năm · ${elapsedDays} ngày)`,
      interestAmount,
      txId
    );

    payoutSummary = {
      cardId,
      txId,
      interestAmount,
      interestRate,
      eligibleBalance,
      elapsedDays,
      cycleKey: todayStr,
      receipt,
    };
  });

  run();

  return {
    ...payoutSummary,
    transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId),
  };
}

export function redeemCardRewardItem(cardId: string, catalogId: string) {
  const now = new Date().toISOString();
  let resultPayload: Record<string, unknown> = {};

  const run = db.transaction(() => {
    const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
    if (!card) {
      throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
    }
    const item = db
      .prepare('SELECT * FROM banking_card_rewards_catalog WHERE id = ? AND is_active = 1')
      .get(catalogId) as Record<string, unknown> | undefined;
    if (!item) {
      throw new CardEngineHttpError(404, 'Không tìm thấy phần thưởng để quy đổi.', 'REWARD_NOT_FOUND');
    }

    const cost = Math.max(1, Math.round(Number(item.points_cost || 0)));
    const curPts = Number(card.reward_points || 0);
    if (curPts < cost) {
      throw new CardEngineHttpError(
        400,
        `Thẻ •••• ${String(card.last4)} hiện có ${curPts} điểm, chưa đủ ${cost} điểm để đổi "${String(item.title)}".`,
        'INSUFFICIENT_POINTS'
      );
    }

    const nextPts = curPts - cost;
    db.prepare('UPDATE banking_cards SET reward_points = ? WHERE id = ?').run(nextPts, cardId);
    db.prepare('UPDATE banking_security_state SET reward_points = MAX(0, COALESCE(reward_points, 0) - ?)').run(cost);

    const bank = getBankDefinition(String(card.bank_id || 'hikari'));
    const rewardType = String(item.reward_type);
    const ledgerId = cardUid('pts');
    let txId = '';
    let voucherId = '';

    if (rewardType === 'cash_bonus') {
      if (String(card.linked_status || 'linked') === 'unlinked' || !String(card.account_id || '').trim()) {
        throw new CardEngineHttpError(400, 'Cần liên kết thẻ với tài khoản trước khi đổi điểm lấy tiền mặt.', 'CARD_UNLINKED');
      }
      const acc = db
        .prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'")
        .get(String(card.account_id)) as Record<string, unknown> | undefined;
      if (!acc) {
        throw new CardEngineHttpError(404, 'Không tìm thấy tài khoản liên kết.', 'LINKED_ACCOUNT_NOT_FOUND');
      }
      const cashVal = Math.max(1000, Math.round(Number(item.cash_value || 0)));
      const balBefore = Number(acc.balance || 0);
      const availBefore = Number(acc.available_balance ?? balBefore);
      const nextBal = balBefore + cashVal;
      const nextAvail = availBefore + cashVal;

      txId = cardUid('tx');
      const refCode = genCardRefCode();
      const note = `Đổi ${cost} điểm thẻ ${bank.name} •••• ${String(card.last4)} lấy ${formatVndCard(cashVal)}`;
      const sig = signCardReceipt({
        txId,
        refCode,
        amount: cashVal,
        fee: 0,
        totalAmount: cashVal,
        senderAccount: `${bank.shortCode}-REWARD`,
        recipientAccount: String(acc.account_number),
        createdAt: now,
        status: 'Thành công',
      });
      const receipt = {
        txId,
        template: 'refund',
        refCode,
        channel: 'Đổi điểm thưởng thẻ',
        bankName: bank.name,
        accountNumber: String(acc.account_number),
        senderName: `${bank.name} Rewards`,
        senderAccount: `${bank.shortCode}-REWARD`,
        recipientName: String(acc.holder_name),
        recipientAccount: String(acc.account_number),
        sourceCardId: cardId,
        sourceCardLast4: String(card.last4),
        amount: cashVal,
        fee: 0,
        totalAmount: cashVal,
        note,
        createdAt: now,
        status: 'Thành công',
        signature: sig,
      };

      db.prepare(
        'UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_income = COALESCE(monthly_income, 0) + ? WHERE id = ?'
      ).run(nextBal, nextAvail, cashVal, String(acc.id));

      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
          category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
          receipt_json, bill_template, sender_name, sender_account, receipt_sig, source_type,
          source_card_id, source_card_last4
        ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, ?, 'Đổi điểm thưởng', 'Đổi điểm thẻ', ?, ?, 0, ?, ?, ?, ?, 'refund', ?, ?, ?, 'card_reward', ?, ?)
      `).run(
        txId,
        String(acc.id),
        cashVal,
        `${bank.name} Rewards`,
        note,
        now,
        now,
        bank.name,
        String(acc.account_number),
        cashVal,
        nextBal,
        refCode,
        JSON.stringify(receipt),
        `${bank.name} Rewards`,
        `${bank.shortCode}-REWARD`,
        sig,
        cardId,
        String(card.last4)
      );

      writeCardAudit({
        operation: 'card_reward_cash',
        txId,
        accountId: String(acc.id),
        delta: cashVal,
        balanceBefore: balBefore,
        balanceAfter: nextBal,
        detail: note,
      });
      pushCardNotification('card', `Đổi điểm nhận +${formatVndCard(cashVal)}`, note, cashVal, txId);
    } else {
      voucherId = cardUid('vch');
      const vCode = `HKV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const vMaxDiscount = Number(item.voucher_discount_pct || 0) > 0 ? 200000 : Number(item.cash_value || 0);
      const vMinSpend = String(item.id) === 'rew_voucher_shop' ? 250000 : 0;
      db.prepare(`
        INSERT INTO banking_card_vouchers (
          id, catalog_id, card_id, title, reward_type, cash_value, discount_pct, max_discount, min_spend, category, code, status, redeemed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, '2027-12-31')
      `).run(
        voucherId,
        catalogId,
        cardId,
        String(item.title),
        rewardType,
        Number(item.cash_value || 0),
        Number(item.voucher_discount_pct || 0),
        vMaxDiscount,
        vMinSpend,
        String(item.voucher_category || ''),
        vCode,
        now
      );
      pushCardNotification(
        'card',
        `Đổi quà thành công: ${String(item.title)}`,
        `Đã dùng ${cost} điểm trên thẻ •••• ${String(card.last4)} · Mã: ${vCode}`,
        0,
        voucherId
      );
    }

    db.prepare(`
      INSERT INTO banking_card_points_ledger (id, card_id, tx_id, delta_points, balance_after, action_type, title, created_at)
      VALUES (?, ?, ?, ?, ?, 'redeem', ?, ?)
    `).run(ledgerId, cardId, txId || voucherId, -cost, nextPts, `Đổi quà: ${String(item.title)}`, now);

    resultPayload = {
      cardId,
      catalogId,
      pointsSpent: cost,
      remainingPoints: nextPts,
      txId,
      voucherId,
    };
  });

  run();
  return resultPayload;
}

export function setCardLinkStatus(cardId: string, action: 'link' | 'unlink', accountId?: string) {
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(cardId) as Record<string, unknown> | undefined;
  if (!card) {
    throw new CardEngineHttpError(404, 'Không tìm thấy thẻ.', 'CARD_NOT_FOUND');
  }

  if (action === 'unlink') {
    const run = db.transaction(() => {
      db.prepare("UPDATE banking_cards SET linked_status = 'unlinked', is_primary = 0 WHERE id = ?").run(cardId);
      if (Number(card.is_primary) === 1) {
        const replacement = db
          .prepare("SELECT id, expiry FROM banking_cards WHERE id != ? AND status = 'active' AND COALESCE(linked_status, 'linked') = 'linked' ORDER BY created_at ASC")
          .all(cardId) as Array<{ id: string; expiry: string }>;
        const validRep = replacement.find((c) => !isCardExpiredLocal(c.expiry));
        if (validRep) {
          db.prepare('UPDATE banking_cards SET is_primary = 1 WHERE id = ?').run(validRep.id);
        }
      }
      pushCardNotification(
        'card',
        'Đã hủy liên kết thẻ',
        `Thẻ •••• ${String(card.last4)} tạm ngưng liên kết với tài khoản thanh toán.`,
        0,
        cardId
      );
    });
    run();
    return;
  }

  const targetAccId = (accountId || String(card.account_id || '')).trim();
  const targetAcc = (targetAccId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(targetAccId)
    : db
        .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC, opened_at ASC LIMIT 1")
        .get()) as Record<string, unknown> | undefined;

  if (!targetAcc) {
    throw new CardEngineHttpError(404, 'Không tìm thấy tài khoản để liên kết.', 'ACCOUNT_NOT_FOUND');
  }
  if (String(targetAcc.account_role || 'payment') === 'receive_only') {
    throw new CardEngineHttpError(400, 'Không thể liên kết thẻ với tài khoản chỉ nhận tiền.', 'ACCOUNT_RECEIVE_ONLY');
  }

  db.prepare("UPDATE banking_cards SET account_id = ?, linked_status = 'linked' WHERE id = ?").run(String(targetAcc.id), cardId);
  pushCardNotification(
    'card',
    'Liên kết thẻ thành công',
    `Thẻ •••• ${String(card.last4)} đã liên kết với TK ${String(targetAcc.nickname || targetAcc.account_number)}.`,
    0,
    cardId
  );
}
