import crypto from 'crypto';
import { db } from './db.ts';
import {
  bankUid,
  formatVndServer,
  genBankRefCode,
  pushBankNotification,
  recordReceiptRecord,
  signReceiptPayload,
  writeLedgerAudit,
  type BillTemplateType,
} from './banking_engine.ts';
import {
  applyCardPostSpendEffectsInTx,
  calculateCardFeeForTx,
  CardEngineHttpError,
  validateCardBeforeSpend,
} from './card_engine.ts';

export class TelecomHttpError extends Error {
  statusCode: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(statusCode: number, message: string, code = 'TELECOM_ERROR', extra?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

export function telecomUid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function genTelecomRefCode(): string {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AT${y}${m}${rnd}`;
}

export function formatPhoneDisplay(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return phone;
}

function isCardExpired(expiry: string): boolean {
  const m = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return true;
  const expEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return Date.now() > expEnd.getTime();
}

export function resolveBankPaymentSource(params: {
  sourceAccountId?: string;
  sourceCardId?: string;
}): {
  account: Record<string, unknown>;
  card: Record<string, unknown> | null;
  sourceCardId: string;
  sourceCardLast4: string;
  sourceLabel: string;
} {
  let card: Record<string, unknown> | null = null;
  if (params.sourceCardId) {
    const foundCard = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.sourceCardId) as
      | Record<string, unknown>
      | undefined;
    if (!foundCard) {
      throw new TelecomHttpError(404, 'Không tìm thấy thẻ nguồn đã chọn', 'INVALID_CARD');
    }
    if (String(foundCard.status || 'active') !== 'active') {
      throw new TelecomHttpError(400, 'Thẻ đang bị khóa. Vui lòng chọn thẻ khác hoặc mở khóa thẻ.', 'CARD_LOCKED');
    }
    if (isCardExpired(String(foundCard.expiry || ''))) {
      throw new TelecomHttpError(400, 'Thẻ đã hết hạn sử dụng. Vui lòng chọn thẻ khác.', 'CARD_EXPIRED');
    }
    if (String(foundCard.linked_status || 'linked') === 'unlinked' || !String(foundCard.account_id || '').trim()) {
      throw new TelecomHttpError(400, 'Thẻ đang ngưng liên kết tài khoản thanh toán.', 'CARD_UNLINKED');
    }
    card = foundCard;
  }

  const targetAccId = card ? String(card.account_id || '') : params.sourceAccountId || '';
  const account = (targetAccId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(targetAccId)
    : db
        .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC, opened_at ASC LIMIT 1")
        .get()) as Record<string, unknown> | undefined;

  if (!account) {
    throw new TelecomHttpError(404, 'Không tìm thấy tài khoản Hikari Bank hợp lệ', 'ACCOUNT_NOT_FOUND');
  }
  if (String(account.account_role || 'payment') === 'receive_only') {
    throw new TelecomHttpError(400, 'Tài khoản chỉ nhận tiền không thể thực hiện thanh toán.', 'ACCOUNT_RECEIVE_ONLY');
  }
  if (String(account.status || 'Đang hoạt động').toLowerCase().includes('khóa')) {
    throw new TelecomHttpError(400, 'Tài khoản Hikari Bank đang bị khóa.', 'ACCOUNT_LOCKED');
  }

  const accLabel = String(account.nickname || account.account_type || 'Hikari Bank');
  const cardLast4 = card ? String(card.last4 || '') : '';
  const cardNick = card ? String(card.card_nickname || card.card_name || 'Thẻ Hikari') : '';
  const sourceLabel = card ? `${cardNick} (•••• ${cardLast4})` : `${accLabel} (${String(account.account_number)})`;

  return {
    account,
    card,
    sourceCardId: card ? String(card.id) : '',
    sourceCardLast4: cardLast4,
    sourceLabel,
  };
}

export function pushTelecomNotification(params: {
  simId?: string;
  title: string;
  body: string;
  notifType?: string;
  refId?: string;
}) {
  db.prepare(`
    INSERT INTO telecom_notifications (id, sim_id, title, body, notif_type, ref_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    telecomUid('tnot'),
    params.simId || '',
    params.title,
    params.body,
    params.notifType || 'info',
    params.refId || '',
    new Date().toISOString()
  );
}

function expireOutdatedUserPackages(): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE telecom_user_packages SET status = 'expired' WHERE status = 'active' AND expires_at < ?").run(now);
}

export function getTelecomOverview(userId = 'user_1') {
  expireOutdatedUserPackages();

  const carriers = db
    .prepare('SELECT * FROM telecom_carriers WHERE is_active = 1 ORDER BY sort_order ASC')
    .all() as Array<Record<string, unknown>>;

  const carrierMap = new Map(carriers.map((c) => [String(c.id), c]));

  const catalog = db
    .prepare("SELECT * FROM telecom_sim_catalog ORDER BY CASE WHEN status = 'available' THEN 0 ELSE 1 END, rarity_score DESC, price ASC")
    .all() as Array<Record<string, unknown>>;

  const rawUserSims = db
    .prepare('SELECT * FROM telecom_user_sims WHERE user_id = ? ORDER BY is_primary DESC, purchased_at ASC')
    .all(userId) as Array<Record<string, unknown>>;

  const userPackages = db
    .prepare('SELECT * FROM telecom_user_packages ORDER BY activated_at DESC')
    .all() as Array<Record<string, unknown>>;

  const packages = db
    .prepare('SELECT * FROM telecom_packages ORDER BY sort_order ASC, price ASC')
    .all() as Array<Record<string, unknown>>;

  const userSims: Array<Record<string, unknown>> = rawUserSims.map((sim) => {
    const carrier = carrierMap.get(String(sim.carrier_id));
    const activePackages = userPackages.filter(
      (up) => String(up.user_sim_id) === String(sim.id) && String(up.status) === 'active'
    );
    const packageHistory = userPackages.filter((up) => String(up.user_sim_id) === String(sim.id));
    return {
      ...sim,
      carrier_name: carrier ? String(carrier.name) : String(sim.carrier_id),
      carrier_code: carrier ? String(carrier.code) : String(sim.carrier_id).toUpperCase(),
      carrier_logo: carrier ? String(carrier.logo_variant) : String(sim.carrier_id),
      active_packages: activePackages,
      primary_package: activePackages[0] || null,
      package_history: packageHistory,
    };
  });

  const transactions = db
    .prepare('SELECT * FROM telecom_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(userId) as Array<Record<string, unknown>>;

  const notifications = db
    .prepare('SELECT * FROM telecom_notifications ORDER BY created_at DESC LIMIT 60')
    .all() as Array<Record<string, unknown>>;

  const userBankAccounts = db
    .prepare("SELECT id, bank_name, account_number, holder_name, balance, available_balance, nickname, account_type, account_role, status, is_primary FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC, opened_at ASC")
    .all();

  const userBankCards = db
    .prepare('SELECT id, account_id, card_type, card_name, card_nickname, masked_number, last4, expiry, status, is_primary, daily_limit, monthly_limit, spent_month FROM banking_cards ORDER BY is_primary DESC, created_at DESC')
    .all();

  return {
    carriers,
    catalog,
    userSims,
    packages,
    userPackages,
    transactions,
    notifications,
    bankAccounts: userBankAccounts,
    bankCards: userBankCards,
    primarySim: userSims.find((s) => Number(s.is_primary) === 1) || userSims[0] || null,
  };
}

export function purchaseCatalogSim(params: {
  catalogId: string;
  aliasName?: string;
  setAsPrimary?: boolean;
  sourceAccountId?: string;
  sourceCardId?: string;
  idempotencyKey?: string;
  userId?: string;
}) {
  const userId = params.userId || 'user_1';
  const resolvedIdem = (params.idempotencyKey || '').trim();

  if (resolvedIdem) {
    const existing = db
      .prepare('SELECT * FROM telecom_transactions WHERE idempotency_key = ? LIMIT 1')
      .get(resolvedIdem) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        ...getTelecomOverview(userId),
        transaction: existing,
        bankTransaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(String(existing.transaction_id)),
        idempotentHit: true,
      };
    }
  }

  if (!params.catalogId) {
    throw new TelecomHttpError(400, 'Vui lòng chọn SIM muốn mua.', 'MISSING_CATALOG_ID');
  }

  const resolvedSource = resolveBankPaymentSource({
    sourceAccountId: params.sourceAccountId,
    sourceCardId: params.sourceCardId,
  });

  const now = new Date().toISOString();
  const txId = bankUid('tx');
  const refCode = genTelecomRefCode();
  const simId = telecomUid('sim');
  const ttxId = telecomUid('ttx');

  let finalCarrierName = '';
  let finalPhone = '';
  let finalPrice = 0;
  let receiptPayload: Record<string, unknown> = {};

  const run = db.transaction(() => {
    const catalogSim = db.prepare('SELECT * FROM telecom_sim_catalog WHERE id = ?').get(params.catalogId) as
      | Record<string, unknown>
      | undefined;

    if (!catalogSim) {
      throw new TelecomHttpError(404, 'Không tìm thấy số SIM trong kho.', 'SIM_NOT_FOUND');
    }
    if (String(catalogSim.status) !== 'available') {
      throw new TelecomHttpError(409, 'Số SIM này đã có người sở hữu. Vui lòng chọn số khác.', 'SIM_ALREADY_SOLD');
    }

    const phone = String(catalogSim.phone_number);
    const alreadyOwned = db.prepare('SELECT id FROM telecom_user_sims WHERE phone_number = ?').get(phone);
    if (alreadyOwned) {
      throw new TelecomHttpError(409, 'Số điện thoại này đã được kích hoạt trước đó.', 'SIM_ALREADY_SOLD');
    }

    const carrier = db.prepare('SELECT * FROM telecom_carriers WHERE id = ?').get(String(catalogSim.carrier_id)) as
      | Record<string, unknown>
      | undefined;
    const carrierName = carrier ? String(carrier.name) : String(catalogSim.carrier_id);
    const carrierCode = carrier ? String(carrier.code) : String(catalogSim.carrier_id).toUpperCase();

    const price = Math.max(0, Math.round(Number(catalogSim.price || 0)));
    const initBal = Math.max(0, Math.round(Number(catalogSim.initial_balance || 0)));

    let fee = 0;
    let cardCheck: { spentTodayBefore: number; todayStr: string } | null = null;
    if (resolvedSource.card) {
      fee = calculateCardFeeForTx({ card: resolvedSource.card, amount: price, kind: 'payment' });
      try {
        cardCheck = validateCardBeforeSpend({ card: resolvedSource.card, amount: price, fee, kind: 'payment' });
      } catch (err) {
        if (err instanceof CardEngineHttpError) {
          throw new TelecomHttpError(err.statusCode, err.message, err.code);
        }
        throw err;
      }
    }
    const totalDebit = price + fee;

    const freshAcc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(resolvedSource.account.id)) as
      | Record<string, unknown>
      | undefined;
    const bankAvail = Number(freshAcc?.available_balance ?? freshAcc?.balance ?? 0);
    const bankBalBefore = Number(freshAcc?.balance ?? 0);

    if (!freshAcc || bankAvail < totalDebit) {
      throw new TelecomHttpError(
        400,
        `Số dư Hikari Bank không đủ (${formatVndServer(bankAvail)} < ${formatVndServer(totalDebit)}). Vui lòng chọn tài khoản hoặc thẻ khác.`,
        'INSUFFICIENT_BANK_BALANCE',
        { availableBalance: bankAvail, requiredAmount: totalDebit }
      );
    }

    const nextBankBal = bankBalBefore - totalDebit;
    const nextBankAvail = bankAvail - totalDebit;

    // 1. Deduct bank account & track card spending + cashback + points
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(
      nextBankBal,
      nextBankAvail,
      String(freshAcc.id)
    );
    let postEffects = { cashbackAmount: 0, pointsEarned: 0 };
    if (resolvedSource.card && cardCheck) {
      postEffects = applyCardPostSpendEffectsInTx({
        card: resolvedSource.card,
        acc: freshAcc,
        txId,
        baseAmount: price,
        totalDebit,
        spentTodayBefore: cardCheck.spentTodayBefore,
        todayStr: cardCheck.todayStr,
        merchant: `${carrierName} SIM`,
        category: 'Mua sắm',
        kind: 'payment',
        now,
      });
    }

    // 2. Mark catalog SIM sold
    db.prepare("UPDATE telecom_sim_catalog SET status = 'sold', sold_to_user_id = ?, sold_at = ? WHERE id = ?").run(
      userId,
      now,
      String(catalogSim.id)
    );

    // 3. Determine primary status
    const activeCount = (
      db.prepare("SELECT COUNT(*) as c FROM telecom_user_sims WHERE user_id = ? AND status != 'cancelled'").get(userId) as {
        c: number;
      }
    ).c;
    const makePrimary = activeCount === 0 || Boolean(params.setAsPrimary) ? 1 : 0;
    if (makePrimary === 1) {
      db.prepare('UPDATE telecom_user_sims SET is_primary = 0 WHERE user_id = ?').run(userId);
    }

    const cleanAlias = (params.aliasName || `${carrierName} · ${String(catalogSim.sim_type)}`).trim().slice(0, 48);

    // 4. Create owned SIM
    db.prepare(`
      INSERT INTO telecom_user_sims (
        id, user_id, catalog_sim_id, phone_number, carrier_id, alias_name, sim_type, sim_tier,
        purchase_price, sim_balance, total_topped_up, total_spent, is_primary, status,
        activated_at, purchased_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?)
    `).run(
      simId,
      userId,
      String(catalogSim.id),
      phone,
      String(catalogSim.carrier_id),
      cleanAlias,
      String(catalogSim.sim_type),
      String(catalogSim.sim_tier),
      price,
      initBal,
      initBal,
      makePrimary,
      now,
      now,
      now
    );

    // 5. Build shared receipt & transaction records
    const sig = signReceiptPayload({
      txId,
      refCode,
      amount: price,
      fee,
      totalAmount: totalDebit,
      senderAccount: String(freshAcc.account_number),
      recipientAccount: phone,
      createdAt: now,
      status: 'Thành công',
    });

    receiptPayload = {
      txId,
      template: 'shopping' as BillTemplateType,
      refCode,
      channel: resolvedSource.sourceCardId
        ? `Anime Telecom · Thẻ •••• ${resolvedSource.sourceCardLast4}`
        : `Anime Telecom · ${carrierName}`,
      bankName: carrierName,
      accountNumber: phone,
      senderName: String(freshAcc.holder_name),
      senderAccount: String(freshAcc.account_number),
      sourceAccountId: String(freshAcc.id),
      sourceAccountNickname: String(freshAcc.nickname || freshAcc.account_type || ''),
      sourceCardId: resolvedSource.sourceCardId,
      sourceCardLast4: resolvedSource.sourceCardLast4,
      recipientName: `${carrierName} (${formatPhoneDisplay(phone)})`,
      recipientAccount: phone,
      amount: price,
      fee,
      totalAmount: totalDebit,
      cashbackAmount: postEffects.cashbackAmount,
      pointsEarned: postEffects.pointsEarned,
      note: `Mua SIM ${String(catalogSim.tier_label)} ${formatPhoneDisplay(phone)} (${carrierName})`,
      createdAt: now,
      status: 'Thành công',
      signature: sig,
      carrierId: String(catalogSim.carrier_id),
      carrierCode,
      carrierName,
      simId,
      phoneNumber: phone,
      simBalanceBefore: 0,
      simBalanceAfter: initBal,
    };

    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, receipt_sig, idempotency_key,
        source_card_id, source_card_last4, source_type
      ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, 'Mua sắm', ?, ?, ?, ?, ?, ?, ?, ?, 'shopping', ?, ?, ?, ?, ?, ?, 'bill')
    `).run(
      txId,
      String(freshAcc.id),
      price,
      `${carrierName} · ${formatPhoneDisplay(phone)}`,
      String(receiptPayload.note),
      now,
      String(receiptPayload.channel),
      carrierName,
      phone,
      fee,
      totalDebit,
      nextBankBal,
      refCode,
      JSON.stringify(receiptPayload),
      String(freshAcc.holder_name),
      String(freshAcc.account_number),
      sig,
      resolvedIdem,
      resolvedSource.sourceCardId,
      resolvedSource.sourceCardLast4
    );

    db.prepare(`
      INSERT INTO telecom_transactions (
        id, transaction_id, ref_code, user_id, sim_id, phone_number, carrier_id, tx_type,
        amount, fee, total_amount, payment_channel, bank_account_id, bank_card_id, bank_source_label,
        card_last4, sim_balance_before, sim_balance_after, bank_balance_before, bank_balance_after,
        status, title, description, detail_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'buy_sim', ?, ?, ?, 'bank', ?, ?, ?, ?, 0, ?, ?, ?, 'Thành công', ?, ?, ?, ?, ?)
    `).run(
      ttxId,
      txId,
      refCode,
      userId,
      simId,
      phone,
      String(catalogSim.carrier_id),
      price,
      fee,
      totalDebit,
      String(freshAcc.id),
      resolvedSource.sourceCardId,
      resolvedSource.sourceLabel,
      resolvedSource.sourceCardLast4,
      initBal,
      bankBalBefore,
      nextBankBal,
      `Mua SIM ${carrierName}`,
      `Hòa mạng số ${formatPhoneDisplay(phone)} (${String(catalogSim.tier_label)}) · Số dư khởi đầu ${formatVndServer(initBal)}`,
      JSON.stringify({
        carrierName,
        carrierCode,
        simType: String(catalogSim.sim_type),
        simTier: String(catalogSim.sim_tier),
        tierLabel: String(catalogSim.tier_label),
        initialBalance: initBal,
        cashbackAmount: postEffects.cashbackAmount,
        pointsEarned: postEffects.pointsEarned,
        signature: sig,
      }),
      resolvedIdem,
      now
    );

    writeLedgerAudit({
      operation: 'telecom_buy_sim',
      txId,
      accountId: String(freshAcc.id),
      delta: -totalDebit,
      balanceBefore: bankBalBefore,
      balanceAfter: nextBankBal,
      detail: `Mua SIM ${formatPhoneDisplay(phone)} (${carrierName})`,
    });
    recordReceiptRecord({ transactionId: txId, receiptType: 'shopping' });
    pushBankNotification(
      'bill',
      `Mua SIM ${carrierName} -${formatVndServer(price)}`,
      `Số ${formatPhoneDisplay(phone)} đã kích hoạt thành công.`,
      -price,
      txId
    );
    pushTelecomNotification({
      simId,
      title: `Hòa mạng thành công ${formatPhoneDisplay(phone)}`,
      body: `SIM ${carrierName} (${String(catalogSim.sim_type)}) đã sẵn sàng với số dư ${formatVndServer(initBal)}.`,
      notifType: 'sim_activated',
      refId: txId,
    });

    finalCarrierName = carrierName;
    finalPhone = phone;
    finalPrice = price;
  });

  run();

  return {
    ...getTelecomOverview(userId),
    purchasedSimId: simId,
    phoneNumber: finalPhone,
    carrierName: finalCarrierName,
    amount: finalPrice,
    transaction: db.prepare('SELECT * FROM telecom_transactions WHERE id = ?').get(ttxId),
    bankTransaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId),
    receipt: receiptPayload,
  };
}

export function topupUserSim(params: {
  simId?: string;
  phone?: string;
  carrierId?: string;
  amount: number;
  sourceAccountId?: string;
  sourceCardId?: string;
  idempotencyKey?: string;
  origin?: 'telecom' | 'banking';
  userId?: string;
}) {
  const userId = params.userId || 'user_1';
  const resolvedIdem = (params.idempotencyKey || '').trim();

  if (resolvedIdem) {
    const existingTelecomTx = db
      .prepare('SELECT * FROM telecom_transactions WHERE idempotency_key = ? LIMIT 1')
      .get(resolvedIdem) as Record<string, unknown> | undefined;
    if (existingTelecomTx) {
      const bankTx = db
        .prepare('SELECT * FROM banking_transactions_demo WHERE id = ? LIMIT 1')
        .get(String(existingTelecomTx.transaction_id)) as Record<string, unknown> | undefined;
      let parsedReceipt = {};
      try {
        parsedReceipt = JSON.parse(String(bankTx?.receipt_json || '{}'));
      } catch {
        parsedReceipt = {};
      }
      return {
        ...getTelecomOverview(userId),
        telecomTransaction: existingTelecomTx,
        transaction: bankTx,
        receipt: parsedReceipt,
        idempotentHit: true,
      };
    }
  }

  const amt = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(amt) || amt < 10000 || amt > 50000000) {
    throw new TelecomHttpError(400, 'Mệnh giá nạp tiền hợp lệ từ 10.000 VNĐ đến 50.000.000 VNĐ.', 'INVALID_AMOUNT');
  }

  const resolvedSource = resolveBankPaymentSource({
    sourceAccountId: params.sourceAccountId,
    sourceCardId: params.sourceCardId,
  });

  const now = new Date().toISOString();
  const txId = bankUid('tx');
  const refCode = genBankRefCode();
  const ttxId = telecomUid('ttx');

  let receiptPayload: Record<string, unknown> = {};
  let updatedSimId = '';

  const run = db.transaction(() => {
    let sim: Record<string, unknown> | undefined;
    if (params.simId) {
      sim = db.prepare('SELECT * FROM telecom_user_sims WHERE id = ? AND user_id = ?').get(params.simId, userId) as
        | Record<string, unknown>
        | undefined;
    } else if (params.phone) {
      const cleanPhone = params.phone.replace(/\D/g, '');
      sim = db.prepare('SELECT * FROM telecom_user_sims WHERE phone_number = ? AND user_id = ?').get(cleanPhone, userId) as
        | Record<string, unknown>
        | undefined;
    } else {
      sim = db
        .prepare("SELECT * FROM telecom_user_sims WHERE user_id = ? AND status = 'active' ORDER BY is_primary DESC LIMIT 1")
        .get(userId) as Record<string, unknown> | undefined;
    }

    if (!sim) {
      throw new TelecomHttpError(
        404,
        'Số điện thoại chưa thuộc hệ thống Anime Telecom của bạn. Hãy mua SIM hoặc chọn đúng SIM đã sở hữu.',
        'SIM_NOT_OWNED'
      );
    }

    if (String(sim.status) !== 'active') {
      throw new TelecomHttpError(
        400,
        `SIM ${formatPhoneDisplay(String(sim.phone_number))} hiện đang ${sim.status === 'locked' ? 'bị khóa' : 'đã hủy'}, không thể nạp tiền.`,
        'SIM_INACTIVE'
      );
    }

    if (params.carrierId && String(params.carrierId) !== String(sim.carrier_id)) {
      const simCarrier = db.prepare('SELECT name FROM telecom_carriers WHERE id = ?').get(String(sim.carrier_id)) as
        | { name: string }
        | undefined;
      throw new TelecomHttpError(
        400,
        `Số ${formatPhoneDisplay(String(sim.phone_number))} thuộc nhà mạng ${simCarrier?.name || sim.carrier_id}. Vui lòng chọn đúng nhà mạng.`,
        'CARRIER_MISMATCH'
      );
    }

    const carrier = db.prepare('SELECT * FROM telecom_carriers WHERE id = ?').get(String(sim.carrier_id)) as
      | Record<string, unknown>
      | undefined;
    const carrierName = carrier ? String(carrier.name) : String(sim.carrier_id);
    const carrierCode = carrier ? String(carrier.code) : String(sim.carrier_id).toUpperCase();
    const phone = String(sim.phone_number);

    let fee = 0;
    let cardCheck: { spentTodayBefore: number; todayStr: string } | null = null;
    if (resolvedSource.card) {
      fee = calculateCardFeeForTx({ card: resolvedSource.card, amount: amt, kind: 'topup' });
      try {
        cardCheck = validateCardBeforeSpend({ card: resolvedSource.card, amount: amt, fee, kind: 'topup' });
      } catch (err) {
        if (err instanceof CardEngineHttpError) {
          throw new TelecomHttpError(err.statusCode, err.message, err.code);
        }
        throw err;
      }
    }
    const totalDebit = amt + fee;

    const freshAcc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(resolvedSource.account.id)) as
      | Record<string, unknown>
      | undefined;
    const bankAvail = Number(freshAcc?.available_balance ?? freshAcc?.balance ?? 0);
    const bankBalBefore = Number(freshAcc?.balance ?? 0);

    if (!freshAcc || bankAvail < totalDebit) {
      throw new TelecomHttpError(
        400,
        `Số dư Hikari Bank không đủ (${formatVndServer(bankAvail)}). Vui lòng chọn tài khoản khác hoặc giảm mệnh giá nạp.`,
        'INSUFFICIENT_BANK_BALANCE',
        { availableBalance: bankAvail, requiredAmount: totalDebit }
      );
    }

    const nextBankBal = bankBalBefore - totalDebit;
    const nextBankAvail = bankAvail - totalDebit;
    const simBalBefore = Number(sim.sim_balance || 0);
    const simBalAfter = simBalBefore + amt;
    updatedSimId = String(sim.id);

    // 1. Atomic debit bank (+ card spent/cashback/points) and credit exact SIM balance
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(
      nextBankBal,
      nextBankAvail,
      String(freshAcc.id)
    );
    let postEffects = { cashbackAmount: 0, pointsEarned: 0 };
    if (resolvedSource.card && cardCheck) {
      postEffects = applyCardPostSpendEffectsInTx({
        card: resolvedSource.card,
        acc: freshAcc,
        txId,
        baseAmount: amt,
        totalDebit,
        spentTodayBefore: cardCheck.spentTodayBefore,
        todayStr: cardCheck.todayStr,
        merchant: `${carrierName} Topup`,
        category: 'Khác',
        kind: 'topup',
        now,
      });
    }

    db.prepare(`
      UPDATE telecom_user_sims
      SET sim_balance = sim_balance + ?,
          total_topped_up = COALESCE(total_topped_up, 0) + ?,
          updated_at = ?
      WHERE id = ?
    `).run(amt, amt, now, updatedSimId);

    const sig = signReceiptPayload({
      txId,
      refCode,
      amount: amt,
      fee,
      totalAmount: totalDebit,
      senderAccount: String(freshAcc.account_number),
      recipientAccount: phone,
      createdAt: now,
      status: 'Thành công',
    });

    const originTag = params.origin === 'banking' ? 'Hikari Bank' : 'Anime Telecom';
    const channelStr = resolvedSource.card
      ? `Nạp SIM ${carrierName} (${originTag}) · Thẻ •••• ${resolvedSource.sourceCardLast4}`
      : `Nạp SIM ${carrierName} (${originTag})`;

    receiptPayload = {
      txId,
      template: 'topup' as BillTemplateType,
      refCode,
      channel: channelStr,
      bankName: carrierName,
      accountNumber: phone,
      senderName: String(freshAcc.holder_name),
      senderAccount: String(freshAcc.account_number),
      sourceAccountId: String(freshAcc.id),
      sourceAccountNickname: String(freshAcc.nickname || freshAcc.account_type || ''),
      sourceCardId: resolvedSource.sourceCardId,
      sourceCardLast4: resolvedSource.sourceCardLast4,
      sourceCardNickname: resolvedSource.card
        ? String(resolvedSource.card.card_nickname || resolvedSource.card.card_name || '')
        : '',
      recipientName: `${carrierName} (${formatPhoneDisplay(phone)})`,
      recipientAccount: phone,
      amount: amt,
      fee,
      totalAmount: totalDebit,
      cashbackAmount: postEffects.cashbackAmount,
      pointsEarned: postEffects.pointsEarned,
      note: `Nạp tiền SIM ${carrierName} cho số ${formatPhoneDisplay(phone)}`,
      createdAt: now,
      status: 'Thành công',
      signature: sig,
      carrierId: String(sim.carrier_id),
      carrierCode,
      carrierName,
      simId: updatedSimId,
      phoneNumber: phone,
      simAlias: String(sim.alias_name || ''),
      isPrimarySim: Number(sim.is_primary) === 1,
      simBalanceBefore: simBalBefore,
      simBalanceAfter: simBalAfter,
    };

    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, receipt_sig, idempotency_key,
        source_card_id, source_card_last4, source_type
      ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, 'Khác', ?, ?, ?, ?, ?, ?, ?, ?, 'topup', ?, ?, ?, ?, ?, ?, 'topup')
    `).run(
      txId,
      String(freshAcc.id),
      amt,
      `${carrierName} · ${formatPhoneDisplay(phone)}`,
      String(receiptPayload.note),
      now,
      channelStr,
      carrierName,
      phone,
      fee,
      totalDebit,
      nextBankBal,
      refCode,
      JSON.stringify(receiptPayload),
      String(freshAcc.holder_name),
      String(freshAcc.account_number),
      sig,
      resolvedIdem,
      resolvedSource.sourceCardId,
      resolvedSource.sourceCardLast4
    );

    db.prepare(`
      INSERT INTO telecom_transactions (
        id, transaction_id, ref_code, user_id, sim_id, phone_number, carrier_id, tx_type,
        amount, fee, total_amount, payment_channel, bank_account_id, bank_card_id, bank_source_label,
        card_last4, sim_balance_before, sim_balance_after, bank_balance_before, bank_balance_after,
        status, title, description, detail_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'topup', ?, ?, ?, 'bank', ?, ?, ?, ?, ?, ?, ?, ?, 'Thành công', ?, ?, ?, ?, ?)
    `).run(
      ttxId,
      txId,
      refCode,
      userId,
      updatedSimId,
      phone,
      String(sim.carrier_id),
      amt,
      fee,
      totalDebit,
      String(freshAcc.id),
      resolvedSource.sourceCardId,
      resolvedSource.sourceLabel,
      resolvedSource.sourceCardLast4,
      simBalBefore,
      simBalAfter,
      bankBalBefore,
      nextBankBal,
      `Nạp tiền SIM ${carrierName}`,
      `Nạp ${formatVndServer(amt)} vào ${formatPhoneDisplay(phone)} qua ${originTag} (${resolvedSource.sourceLabel})`,
      JSON.stringify({
        carrierName,
        carrierCode,
        simAlias: String(sim.alias_name || ''),
        origin: originTag,
        cashbackAmount: postEffects.cashbackAmount,
        pointsEarned: postEffects.pointsEarned,
        signature: sig,
      }),
      resolvedIdem,
      now
    );

    writeLedgerAudit({
      operation: 'telecom_sim_topup',
      txId,
      accountId: String(freshAcc.id),
      delta: -amt,
      balanceBefore: bankBalBefore,
      balanceAfter: nextBankBal,
      detail: `Nạp ${formatPhoneDisplay(phone)} (${carrierName}) từ ${originTag}`,
    });
    recordReceiptRecord({ transactionId: txId, receiptType: 'topup' });
    pushBankNotification(
      'bill',
      `Nạp tiền ${carrierName} -${formatVndServer(amt)}`,
      `Số ${formatPhoneDisplay(phone)} · Số dư SIM mới: ${formatVndServer(simBalAfter)}`,
      -amt,
      txId
    );
    pushTelecomNotification({
      simId: updatedSimId,
      title: `Nạp tiền +${formatVndServer(amt)} thành công`,
      body: `Số ${formatPhoneDisplay(phone)} (${carrierName}) đã nhận ${formatVndServer(amt)} từ ${resolvedSource.sourceLabel}. Số dư SIM: ${formatVndServer(simBalAfter)}.`,
      notifType: 'topup',
      refId: txId,
    });
  });

  run();

  return {
    ...getTelecomOverview(userId),
    simId: updatedSimId,
    telecomTransaction: db.prepare('SELECT * FROM telecom_transactions WHERE id = ?').get(ttxId),
    transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId),
    receipt: receiptPayload,
  };
}

export function setPrimarySim(simId: string, userId = 'user_1') {
  const run = db.transaction(() => {
    const sim = db.prepare('SELECT * FROM telecom_user_sims WHERE id = ? AND user_id = ?').get(simId, userId) as
      | Record<string, unknown>
      | undefined;
    if (!sim) {
      throw new TelecomHttpError(404, 'Không tìm thấy SIM trong danh sách của bạn.', 'SIM_NOT_FOUND');
    }
    if (String(sim.status) !== 'active') {
      throw new TelecomHttpError(400, 'Chỉ SIM đang hoạt động mới có thể đặt làm SIM chính.', 'SIM_INACTIVE');
    }
    db.prepare('UPDATE telecom_user_sims SET is_primary = 0, updated_at = ? WHERE user_id = ?').run(
      new Date().toISOString(),
      userId
    );
    db.prepare('UPDATE telecom_user_sims SET is_primary = 1, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      simId
    );
    pushTelecomNotification({
      simId,
      title: 'Đã thay đổi SIM chính',
      body: `Số ${formatPhoneDisplay(String(sim.phone_number))} hiện là SIM CHÍNH mặc định của bạn.`,
      notifType: 'sim_primary',
      refId: simId,
    });
  });
  run();
  return getTelecomOverview(userId);
}

export function updateUserSim(
  simId: string,
  patch: { aliasName?: string; status?: 'active' | 'locked' | 'cancelled' },
  userId = 'user_1'
) {
  const run = db.transaction(() => {
    const sim = db.prepare('SELECT * FROM telecom_user_sims WHERE id = ? AND user_id = ?').get(simId, userId) as
      | Record<string, unknown>
      | undefined;
    if (!sim) {
      throw new TelecomHttpError(404, 'Không tìm thấy SIM.', 'SIM_NOT_FOUND');
    }
    if (String(sim.status) === 'cancelled' && patch.status && patch.status !== 'cancelled') {
      throw new TelecomHttpError(400, 'SIM đã hủy vĩnh viễn không thể kích hoạt lại.', 'SIM_CANCELLED');
    }
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];

    if (patch.aliasName !== undefined) {
      const cleanAlias = patch.aliasName.trim().slice(0, 48);
      if (!cleanAlias) {
        throw new TelecomHttpError(400, 'Tên gợi nhớ SIM không được để trống.', 'INVALID_ALIAS');
      }
      sets.push('alias_name = ?');
      vals.push(cleanAlias);
    }

    if (patch.status !== undefined) {
      if (!['active', 'locked', 'cancelled'].includes(patch.status)) {
        throw new TelecomHttpError(400, 'Trạng thái SIM không hợp lệ.', 'INVALID_STATUS');
      }
      sets.push('status = ?');
      vals.push(patch.status);
      if (patch.status !== 'active' && Number(sim.is_primary) === 1) {
        const replacement = db
          .prepare("SELECT id FROM telecom_user_sims WHERE user_id = ? AND id != ? AND status = 'active' ORDER BY purchased_at ASC LIMIT 1")
          .get(userId, simId) as { id: string } | undefined;
        if (replacement) {
          db.prepare('UPDATE telecom_user_sims SET is_primary = 0 WHERE id = ?').run(simId);
          db.prepare('UPDATE telecom_user_sims SET is_primary = 1, updated_at = ? WHERE id = ?').run(now, replacement.id);
        } else if (patch.status === 'cancelled') {
          sets.push('is_primary = ?');
          vals.push(0);
        }
      }
    }

    vals.push(simId);
    db.prepare(`UPDATE telecom_user_sims SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    if (patch.status && patch.status !== sim.status) {
      const label = patch.status === 'locked' ? 'tạm khóa' : patch.status === 'cancelled' ? 'hủy' : 'mở khóa';
      pushTelecomNotification({
        simId,
        title: `Đã ${label} SIM ${formatPhoneDisplay(String(sim.phone_number))}`,
        body: `Trạng thái SIM đã được cập nhật và đồng bộ với Hikari Bank.`,
        notifType: 'sim_status',
        refId: simId,
      });
    }
  });
  run();
  return getTelecomOverview(userId);
}

export function purchaseSimPackage(params: {
  simId: string;
  packageId: string;
  confirmReplace?: boolean;
  idempotencyKey?: string;
  userId?: string;
}) {
  const userId = params.userId || 'user_1';
  const resolvedIdem = (params.idempotencyKey || '').trim();

  if (resolvedIdem) {
    const existing = db
      .prepare('SELECT * FROM telecom_transactions WHERE idempotency_key = ? LIMIT 1')
      .get(resolvedIdem) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        ...getTelecomOverview(userId),
        transaction: existing,
        idempotentHit: true,
      };
    }
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const ttxId = telecomUid('ttx');
  const txId = telecomUid('txpkg');
  const refCode = genTelecomRefCode();
  const upkgId = telecomUid('upkg');

  const run = db.transaction(() => {
    expireOutdatedUserPackages();

    const sim = db.prepare('SELECT * FROM telecom_user_sims WHERE id = ? AND user_id = ?').get(params.simId, userId) as
      | Record<string, unknown>
      | undefined;
    if (!sim) {
      throw new TelecomHttpError(404, 'Không tìm thấy SIM.', 'SIM_NOT_FOUND');
    }
    if (String(sim.status) !== 'active') {
      throw new TelecomHttpError(400, 'SIM đang bị khóa hoặc đã hủy, không thể đăng ký gói cước.', 'SIM_INACTIVE');
    }

    const pkg = db.prepare('SELECT * FROM telecom_packages WHERE id = ?').get(params.packageId) as
      | Record<string, unknown>
      | undefined;
    if (!pkg) {
      throw new TelecomHttpError(404, 'Không tìm thấy gói cước.', 'PACKAGE_NOT_FOUND');
    }
    if (String(pkg.carrier_id) !== String(sim.carrier_id)) {
      throw new TelecomHttpError(
        400,
        'Gói cước này thuộc nhà mạng khác với SIM đã chọn.',
        'CARRIER_MISMATCH'
      );
    }

    const simBalBefore = Number(sim.sim_balance || 0);
    const price = Math.max(0, Math.round(Number(pkg.price || 0)));

    if (simBalBefore < price) {
      throw new TelecomHttpError(
        400,
        `Số dư SIM (${formatVndServer(simBalBefore)}) không đủ để đăng ký gói ${String(pkg.name)} (${formatVndServer(price)}). Vui lòng nạp thêm tiền vào SIM.`,
        'INSUFFICIENT_SIM_BALANCE',
        {
          simId: String(sim.id),
          simBalance: simBalBefore,
          requiredAmount: price,
          shortfall: price - simBalBefore,
        }
      );
    }

    // Check existing active package conflict (same type or combo replacing data/voice/sms or vice versa)
    const activePkgs = db
      .prepare("SELECT * FROM telecom_user_packages WHERE user_sim_id = ? AND status = 'active'")
      .all(String(sim.id)) as Array<Record<string, unknown>>;

    const pkgType = String(pkg.package_type);
    const conflicting = activePkgs.find((ap) => {
      const apType = String(ap.package_type);
      if (apType === pkgType) return true;
      if (pkgType === 'combo' || apType === 'combo' || pkgType === 'limited' || apType === 'limited') return true;
      return false;
    });

    if (conflicting && !params.confirmReplace) {
      throw new TelecomHttpError(
        409,
        `SIM đang có gói "${String(conflicting.package_name)}" còn hiệu lực. Bạn có chắc muốn thay thế bằng gói "${String(pkg.name)}"?`,
        'ACTIVE_PACKAGE_EXISTS',
        { activePackage: conflicting }
      );
    }

    if (conflicting && params.confirmReplace) {
      db.prepare("UPDATE telecom_user_packages SET status = 'replaced' WHERE id = ?").run(String(conflicting.id));
    }

    const simBalAfter = simBalBefore - price;
    db.prepare(`
      UPDATE telecom_user_sims
      SET sim_balance = ?,
          total_spent = COALESCE(total_spent, 0) + ?,
          updated_at = ?
      WHERE id = ?
    `).run(simBalAfter, price, now, String(sim.id));

    const validityDays = Math.max(1, Number(pkg.validity_days || 30));
    const expiresAt = new Date(nowDate.getTime() + validityDays * 86400_000).toISOString();

    db.prepare(`
      INSERT INTO telecom_user_packages (
        id, user_sim_id, package_id, carrier_id, package_name, package_type, price_paid,
        data_total_mb, data_remaining_mb, voice_total_min, voice_remaining_min, sms_total, sms_remaining,
        status, activated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      upkgId,
      String(sim.id),
      String(pkg.id),
      String(sim.carrier_id),
      String(pkg.name),
      pkgType,
      price,
      Number(pkg.data_mb || 0),
      Number(pkg.data_mb || 0),
      Number(pkg.voice_minutes || 0),
      Number(pkg.voice_minutes || 0),
      Number(pkg.sms_count || 0),
      Number(pkg.sms_count || 0),
      now,
      expiresAt
    );

    const carrier = db.prepare('SELECT name, code FROM telecom_carriers WHERE id = ?').get(String(sim.carrier_id)) as
      | { name: string; code: string }
      | undefined;
    const carrierName = carrier?.name || String(sim.carrier_id);

    db.prepare(`
      INSERT INTO telecom_transactions (
        id, transaction_id, ref_code, user_id, sim_id, phone_number, carrier_id, tx_type,
        amount, fee, total_amount, payment_channel, bank_account_id, bank_card_id, bank_source_label,
        card_last4, sim_balance_before, sim_balance_after, bank_balance_before, bank_balance_after,
        status, title, description, detail_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'buy_package', ?, 0, ?, 'sim_balance', '', '', ?, '', ?, ?, 0, 0, 'Thành công', ?, ?, ?, ?, ?)
    `).run(
      ttxId,
      txId,
      refCode,
      userId,
      String(sim.id),
      String(sim.phone_number),
      String(sim.carrier_id),
      price,
      price,
      `Số dư SIM ${formatPhoneDisplay(String(sim.phone_number))}`,
      simBalBefore,
      simBalAfter,
      `Đăng ký gói ${String(pkg.name)}`,
      `Trừ ${formatVndServer(price)} từ số dư SIM ${formatPhoneDisplay(String(sim.phone_number))} (${carrierName})`,
      JSON.stringify({
        carrierName,
        carrierCode: carrier?.code || String(sim.carrier_id).toUpperCase(),
        packageName: String(pkg.name),
        packageType: pkgType,
        validityDays,
        dataMb: Number(pkg.data_mb || 0),
        voiceMinutes: Number(pkg.voice_minutes || 0),
        smsCount: Number(pkg.sms_count || 0),
        replacedPackage: conflicting ? String(conflicting.package_name) : '',
      }),
      resolvedIdem,
      now
    );

    pushTelecomNotification({
      simId: String(sim.id),
      title: `Kích hoạt gói ${String(pkg.name)}`,
      body: `SIM ${formatPhoneDisplay(String(sim.phone_number))} đã trừ ${formatVndServer(price)} từ số dư SIM. Hạn dùng đến ${expiresAt.slice(0, 10)}.`,
      notifType: 'package_activated',
      refId: txId,
    });
  });

  run();

  return {
    ...getTelecomOverview(userId),
    transaction: db.prepare('SELECT * FROM telecom_transactions WHERE id = ?').get(ttxId),
    userPackage: db.prepare('SELECT * FROM telecom_user_packages WHERE id = ?').get(upkgId),
  };
}
