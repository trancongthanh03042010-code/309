import { Router, type Request, type Response } from 'express';
import { db } from './db.ts';
import { hashSecret } from './routes_os3.ts';
import { buildLoanSchedule, ensureAiCharacterBankAccount, seedBankingDemoData } from './db_banking.ts';
import {
  bankUid,
  executeSimulatedDepositOrWithdraw,
  formatVndServer,
  genBankRefCode,
  getOverviewPayload,
  inferSpendingCategory,
  normalizeAccountDigits,
  pushBankNotification,
  recordReceiptRecord,
  sendUserTransferNoticeToAiChat,
  signReceiptPayload,
  verifyLegacyOrV3Signature,
  writeLedgerAudit,
  type BillTemplateType,
} from './banking_engine.ts';
import { TelecomHttpError, topupUserSim } from './telecom_engine.ts';
import {
  applyCardPostSpendEffectsInTx,
  calculateCardFeeForTx,
  cancelBankCard,
  CardEngineHttpError,
  changeCardPin,
  claimCardInterestPayout,
  executeCardPaymentTransaction,
  issueAdvancedBankCard,
  lookupCardPublicInfo,
  processUniversalCardPayment,
  redeemCardRewardItem,
  reissueBankCard,
  revealCardSensitiveInfo,
  setCardLinkStatus,
  upgradeBankCardTier,
  validateCardBeforeSpend,
  verifyCardSecurityPin,
} from './card_engine.ts';
import { generateBankingSupportReply } from './gemini.ts';

const KNOWN_DIRECTORY: Record<string, { name: string; bankCode: string; bankName: string; avatar?: string; characterId?: string }> = {
  '880020267712': {
    name: 'YUKI SHIRAKAWA',
    bankCode: 'HIKARI',
    bankName: 'Hikari Bank',
    avatar: '/src/assets/images/char_yuki_1794880089308.jpg',
    characterId: 'char_yuki',
  },
  '880020264405': {
    name: 'AKIRA KUROSAWA',
    bankCode: 'HIKARI',
    bankName: 'Hikari Bank',
    avatar: '/src/assets/images/char_akira_1794880089961.jpg',
    characterId: 'char_akira',
  },
  '880020261111': {
    name: 'SAKURA HINATA',
    bankCode: 'HIKARI',
    bankName: 'Hikari Bank',
    avatar: '/src/assets/images/char_sakura_1794880090451.jpg',
    characterId: 'char_sakura',
  },
  '880020262222': {
    name: 'RIN TACHIBANA',
    bankCode: 'HIKARI',
    bankName: 'Hikari Bank',
    avatar: '/src/assets/images/char_rin_1794880090553.jpg',
    characterId: 'char_rin',
  },
  '19035884120911': { name: 'NGUYEN THAO VY', bankCode: 'TCB', bankName: 'Techcombank' },
  '0071000912841': { name: 'LE MINH TUAN', bankCode: 'VCB', bankName: 'Vietcombank' },
  '190322114455': { name: 'PHAM HOANG NAM', bankCode: 'TCB', bankName: 'Techcombank' },
  '0121000554321': { name: 'TRAN BAO NGOC', bankCode: 'VCB', bankName: 'Vietcombank' },
  '0901223841': { name: 'CGV CINEMA VIETNAM', bankCode: 'MB', bankName: 'MB Bank' },
};

const BANK_NAME_MAP: Record<string, string> = {
  HIKARI: 'Hikari Bank',
  PHONEBANK: 'Hikari Bank',
  VCB: 'Vietcombank',
  TCB: 'Techcombank',
  MB: 'MB Bank',
  ACB: 'ACB',
  BIDV: 'BIDV',
  VPB: 'VPBank',
  TPB: 'TPBank',
  VTB: 'VietinBank',
};

const INVESTMENT_ASSETS: Record<string, { asset_name: string; asset_type: string; current_price: number }> = {
  PBFUND: { asset_name: 'Quỹ Mở Tăng Trưởng PB-VN30', asset_type: 'fund', current_price: 45500 },
  PBVN30: { asset_name: 'Chứng chỉ Quỹ Cổ phiếu PB-Bluechip', asset_type: 'stock', current_price: 32800 },
  GOLD99: { asset_name: 'Vàng Kỹ Thuật Số 9999', asset_type: 'gold', current_price: 8650000 },
  TECHAI: { asset_name: 'Quỹ Công Nghệ & AI Toàn Cầu', asset_type: 'fund', current_price: 58400 },
};

function logFailedTx(params: {
  accountId: string;
  amount: number;
  counterparty: string;
  accountNumber: string;
  bankName: string;
  note: string;
  reason: string;
  senderName: string;
  senderAccount: string;
}) {
  try {
    const now = new Date().toISOString();
    const refCode = genBankRefCode();
    const txId = bankUid('tx');
    const failedAmt = Math.max(0, Math.round(params.amount || 0));
    const receipt = {
      txId,
      template: 'failed' as BillTemplateType,
      refCode,
      amount: failedAmt,
      fee: 0,
      totalAmount: failedAmt,
      senderName: params.senderName,
      senderAccount: params.senderAccount,
      recipientName: params.counterparty || 'Chưa xác định',
      recipientAccount: params.accountNumber || '-',
      bankName: params.bankName || 'PhoneBank Premier',
      channel: 'Chuyển khoản 24/7',
      note: `${params.note || 'Chuyển tiền'} · Lý do: ${params.reason}`,
      createdAt: now,
      status: 'Thất bại',
    };
    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, failure_reason,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, 'Khác', 'Chuyển khoản 24/7', ?, ?, 0, ?, 0, ?, ?, 'failed', ?, ?)
    `).run(
      txId,
      params.accountId,
      receipt.amount,
      receipt.recipientName,
      `${params.reason}`,
      'Thất bại',
      now,
      params.reason,
      receipt.bankName,
      receipt.recipientAccount,
      receipt.amount,
      refCode,
      JSON.stringify(receipt),
      params.senderName,
      params.senderAccount
    );
  } catch {
    // non-fatal
  }
}

class BankingHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isCardExpired(expiry: string): boolean {
  const m = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return true;
  const now = new Date();
  const expEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return now.getTime() > expEnd.getTime();
}

function resolveUserPaymentSource(params: {
  sourceAccountId?: string;
  sourceCardId?: string;
}): {
  account: Record<string, unknown>;
  card: Record<string, unknown> | null;
  sourceCardId: string;
  sourceCardLast4: string;
} {
  let card: Record<string, unknown> | null = null;
  if (params.sourceCardId) {
    const foundCard = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.sourceCardId) as
      | Record<string, unknown>
      | undefined;
    if (!foundCard) {
      throw new BankingHttpError(404, 'Không tìm thấy thẻ nguồn đã chọn');
    }
    if (String(foundCard.status || 'active') !== 'active') {
      throw new BankingHttpError(400, 'Thẻ đang bị khóa. Vui lòng chọn thẻ khác hoặc mở khóa thẻ.');
    }
    if (isCardExpired(String(foundCard.expiry || ''))) {
      throw new BankingHttpError(400, 'Thẻ đã hết hạn sử dụng. Vui lòng chọn thẻ khác.');
    }
    if (String(foundCard.linked_status || 'linked') === 'unlinked' || !String(foundCard.account_id || '').trim()) {
      throw new BankingHttpError(400, 'Thẻ đang ngưng liên kết tài khoản thanh toán.');
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
    throw new BankingHttpError(404, 'Không tìm thấy tài khoản nguồn hợp lệ');
  }
  if (String(account.account_role || 'payment') === 'receive_only') {
    throw new BankingHttpError(400, 'Tài khoản chỉ nhận tiền không thể thực hiện thanh toán hoặc chuyển tiền đi.');
  }
  if (String(account.status || 'Đang hoạt động').toLowerCase().includes('khóa')) {
    throw new BankingHttpError(400, 'Tài khoản nguồn đang bị khóa.');
  }

  return {
    account,
    card,
    sourceCardId: card ? String(card.id) : '',
    sourceCardLast4: card ? String(card.last4 || '') : '',
  };
}

export function createBankingRouter(): Router {
  const router = Router();

  // 1. Overview (full Hikari Bank 3.0 state)
  router.get('/overview', (_req: Request, res: Response) => {
    res.json(getOverviewPayload());
  });

  // 2. Recipient Lookup (checks internal user accts, CHAR accts, beneficiaries, directory)
  router.post('/lookup-recipient', (req: Request, res: Response) => {
    const { accountNumber = '', bankCode = 'HIKARI' } = req.body as {
      accountNumber?: string;
      bankCode?: string;
    };
    const digits = normalizeAccountDigits(accountNumber);
    if (!digits || digits.length < 6 || digits.length > 18) {
      res.status(400).json({
        valid: false,
        error: 'Số tài khoản không hợp lệ (cần 6–18 chữ số)',
      });
      return;
    }

    if (/^0+$/.test(digits)) {
      res.status(400).json({ valid: false, error: 'Số tài khoản không tồn tại trong hệ thống' });
      return;
    }

    const allAccounts = db.prepare('SELECT * FROM banking_accounts_demo').all() as Array<Record<string, unknown>>;
    const matchedAcc = allAccounts.find((a) => normalizeAccountDigits(String(a.account_number || '')) === digits);
    if (matchedAcc) {
      res.json({
        valid: true,
        recipientName: String(matchedAcc.holder_name).toUpperCase(),
        displayName: String(matchedAcc.holder_name),
        bankCode: 'HIKARI',
        bankName: 'Hikari Bank',
        avatar: String(matchedAcc.avatar || ''),
        status: String(matchedAcc.status || 'Đang hoạt động'),
        isAi: matchedAcc.owner_type === 'ai',
        characterId: String(matchedAcc.character_id || ''),
        targetAccountId: String(matchedAcc.id),
      });
      return;
    }

    // Check beneficiaries
    const ben = db
      .prepare("SELECT * FROM banking_beneficiaries WHERE REPLACE(REPLACE(account_number, '-', ''), ' ', '') = ?")
      .get(digits) as { name: string; bank_code: string; bank_name: string } | undefined;
    if (ben) {
      res.json({
        valid: true,
        recipientName: ben.name.toUpperCase(),
        displayName: ben.name,
        bankCode: ben.bank_code,
        bankName: ben.bank_name,
        avatar: '',
        status: 'Đang hoạt động',
        isAi: false,
      });
      return;
    }

    // Check known directory
    const dir = KNOWN_DIRECTORY[digits];
    if (dir) {
      res.json({
        valid: true,
        recipientName: dir.name,
        displayName: dir.name,
        bankCode: dir.bankCode,
        bankName: dir.bankName,
        avatar: dir.avatar || '',
        status: 'Đang hoạt động',
        isAi: Boolean(dir.characterId),
        characterId: dir.characterId || '',
      });
      return;
    }

    // Deterministic external simulator (require at least 8 digits for unknown external accts)
    if (digits.length < 8) {
      res.status(400).json({ valid: false, error: 'Không tìm thấy số tài khoản này tại ngân hàng đã chọn' });
      return;
    }
    const sampleNames = [
      'TRAN QUOC BAO',
      'PHAM MINH THU',
      'HOANG GIA HUY',
      'VO NGOC KHANH',
      'DANG ANH KHOA',
      'BUI PHUONG LINH',
    ];
    const idx = Number(digits.slice(-2)) % sampleNames.length;
    res.json({
      valid: true,
      recipientName: sampleNames[idx],
      displayName: sampleNames[idx],
      bankCode,
      bankName: BANK_NAME_MAP[bankCode] || bankCode,
      avatar: '',
      status: 'Đang hoạt động',
      isAi: false,
    });
  });

  // 3. Multi-Step Transfer (Atomic, Idempotent, Source Card/Account Selection, 2-Way User<->User & User->CHAR sync)
  router.post('/transfer', (req: Request, res: Response) => {
    const {
      sourceAccountId,
      sourceCardId,
      clientTxId,
      idempotencyKey,
      amount,
      counterparty,
      accountNumber = '',
      bankCode = 'HIKARI',
      bankName = 'Hikari Bank',
      note = '',
      memo = '',
      method = 'Chuyển khoản nhanh 24/7',
      pin,
      authMethod = 'pin',
      saveBeneficiary = false,
      category,
      targetCharacterId = '',
      sourceType = 'manual_transfer',
      sourceChatId = '',
    } = req.body as {
      sourceAccountId?: string;
      sourceCardId?: string;
      clientTxId?: string;
      idempotencyKey?: string;
      amount?: number;
      counterparty?: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      note?: string;
      memo?: string;
      method?: string;
      pin?: string;
      authMethod?: 'pin' | 'biometric';
      saveBeneficiary?: boolean;
      category?: string;
      targetCharacterId?: string;
      sourceType?: string;
      sourceChatId?: string;
    };

    const resolvedIdem = (idempotencyKey || clientTxId || '').trim();
    if (resolvedIdem) {
      const existingTx = db
        .prepare('SELECT * FROM banking_transactions_demo WHERE idempotency_key = ? OR client_tx_id = ? LIMIT 1')
        .get(resolvedIdem, resolvedIdem) as Record<string, unknown> | undefined;
      if (existingTx) {
        let parsedReceipt = {};
        try {
          parsedReceipt = JSON.parse(String(existingTx.receipt_json || '{}'));
        } catch {
          parsedReceipt = {};
        }
        res.json({
          ...getOverviewPayload(),
          transaction: existingTx,
          receipt: parsedReceipt,
          idempotentHit: true,
        });
        return;
      }
    }

    let resolvedSource: ReturnType<typeof resolveUserPaymentSource>;
    try {
      resolvedSource = resolveUserPaymentSource({ sourceAccountId, sourceCardId });
    } catch (err) {
      if (err instanceof BankingHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }

    const srcAcc = resolvedSource.account;
    const srcCard = resolvedSource.card;

    const numAmount = Math.round(Number(amount || 0));
    const cleanCounterparty = (counterparty || '').trim();
    if (!Number.isFinite(numAmount) || numAmount < 1000) {
      res.status(400).json({ error: 'Số tiền chuyển tối thiểu là 1.000 VNĐ' });
      return;
    }
    if (!cleanCounterparty) {
      res.status(400).json({ error: 'Vui lòng xác nhận thông tin người nhận' });
      return;
    }

    const avail = Number(srcAcc.available_balance ?? srcAcc.balance ?? 0);
    const dailyLimit = Math.min(
      Number(srcAcc.daily_limit || 100000000),
      srcCard ? Number(srcCard.daily_limit || 100000000) : Number.POSITIVE_INFINITY
    );

    // PIN verification
    const pinHash = String(srcAcc.pin_hash || '');
    if (pinHash && authMethod !== 'biometric') {
      if (!pin || hashSecret(pin) !== pinHash) {
        db.prepare('UPDATE banking_security_state SET failed_pin_count = COALESCE(failed_pin_count, 0) + 1').run();
        res.status(401).json({ error: 'Mã PIN giao dịch không chính xác' });
        return;
      }
    }

    const fee = srcCard
      ? calculateCardFeeForTx({ card: srcCard, amount: numAmount, kind: 'transfer', transferMethod: method })
      : method.includes('Hỏa tốc')
      ? 11000
      : 0;
    const totalDebit = numAmount + fee;

    let cardLimitCheck: { spentTodayBefore: number; todayStr: string } | null = null;
    if (srcCard) {
      try {
        cardLimitCheck = validateCardBeforeSpend({ card: srcCard, amount: numAmount, fee, kind: 'transfer' });
      } catch (err) {
        if (err instanceof CardEngineHttpError) {
          logFailedTx({
            accountId: String(srcAcc.id),
            amount: numAmount,
            counterparty: cleanCounterparty,
            accountNumber,
            bankName,
            note,
            reason: err.message,
            senderName: String(srcAcc.holder_name),
            senderAccount: String(srcAcc.account_number),
          });
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        throw err;
      }
    }

    if (totalDebit > avail) {
      logFailedTx({
        accountId: String(srcAcc.id),
        amount: numAmount,
        counterparty: cleanCounterparty,
        accountNumber,
        bankName,
        note,
        reason: 'Số dư khả dụng không đủ',
        senderName: String(srcAcc.holder_name),
        senderAccount: String(srcAcc.account_number),
      });
      res.status(400).json({ error: 'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.' });
      return;
    }

    if (numAmount > dailyLimit) {
      logFailedTx({
        accountId: String(srcAcc.id),
        amount: numAmount,
        counterparty: cleanCounterparty,
        accountNumber,
        bankName,
        note,
        reason: 'Vượt hạn mức giao dịch/ngày',
        senderName: String(srcAcc.holder_name),
        senderAccount: String(srcAcc.account_number),
      });
      res.status(400).json({ error: `Giao dịch vượt hạn mức ngày (${formatVndServer(dailyLimit)})` });
      return;
    }

    const sec = db.prepare('SELECT * FROM banking_security_state LIMIT 1').get() as
      | { unusual_alert_active?: number; notif_balance?: number }
      | undefined;
    if (sec?.unusual_alert_active && numAmount >= 50000000 && !pin && authMethod !== 'biometric') {
      res.status(403).json({ error: 'Giao dịch giá trị lớn yêu cầu xác thực PIN hoặc Sinh trắc học' });
      return;
    }

    // Check if target is internal user sub-account OR AI character account
    const normTargetDigits = normalizeAccountDigits(accountNumber);
    const allAccounts = db.prepare('SELECT * FROM banking_accounts_demo').all() as Array<Record<string, unknown>>;
    const matchedTarget =
      allAccounts.find((a) => targetCharacterId && a.character_id === targetCharacterId && a.owner_type === 'ai') ||
      (normTargetDigits
        ? allAccounts.find((a) => normalizeAccountDigits(String(a.account_number || '')) === normTargetDigits && a.id !== srcAcc.id)
        : undefined);

    const isAiTarget = matchedTarget?.owner_type === 'ai';
    const isInternalSub = matchedTarget?.owner_type === 'user';

    const txId = bankUid('tx');
    const now = new Date().toISOString();
    const refCode = genBankRefCode();
    const cleanNote = (note || `Chuyển tiền tới ${cleanCounterparty}`).trim();
    const fullNote = memo ? `${cleanNote} (${memo.trim()})` : cleanNote;
    const resolvedCategory = category || inferSpendingCategory(`${cleanNote} ${cleanCounterparty}`);
    const billTemplate: BillTemplateType = isAiTarget ? 'ai_tx' : 'transfer';

    const senderAccountStr = String(srcAcc.account_number);
    const recipientAccountStr = accountNumber || String(matchedTarget?.account_number || '8800-XXXX');
    const receiptSig = signReceiptPayload({
      txId,
      refCode,
      amount: numAmount,
      fee,
      totalAmount: totalDebit,
      senderAccount: senderAccountStr,
      recipientAccount: recipientAccountStr,
      createdAt: now,
      status: 'Thành công',
    });

    const receipt: Record<string, unknown> = {
      txId,
      template: billTemplate,
      refCode,
      channel: srcCard
        ? `${method || 'Chuyển nhanh 24/7'} · Thẻ •••• ${resolvedSource.sourceCardLast4}`
        : method || (bankCode === 'HIKARI' || bankCode === 'PHONEBANK' ? 'Chuyển khoản nội bộ Hikari' : 'Chuyển nhanh Napas 247'),
      bankCode,
      bankName: BANK_NAME_MAP[bankCode] || bankName || 'Hikari Bank',
      accountNumber: recipientAccountStr,
      recipientName: cleanCounterparty,
      recipientAccount: recipientAccountStr,
      recipientAvatar: String(matchedTarget?.avatar || ''),
      senderName: String(srcAcc.holder_name),
      senderAccount: senderAccountStr,
      senderAvatar: String(srcAcc.avatar || ''),
      sourceAccountId: String(srcAcc.id),
      sourceAccountNickname: String(srcAcc.nickname || srcAcc.account_type || ''),
      sourceCardId: resolvedSource.sourceCardId,
      sourceCardLast4: resolvedSource.sourceCardLast4,
      sourceCardNickname: srcCard ? String(srcCard.card_nickname || srcCard.card_name || '') : '',
      amount: numAmount,
      fee,
      totalAmount: totalDebit,
      note: fullNote,
      category: resolvedCategory,
      createdAt: now,
      completedAt: now,
      status: 'Thành công',
      isAiTx: isAiTarget,
      characterId: isAiTarget ? String(matchedTarget?.character_id || '') : '',
      sourceType,
      sourceChatId,
      signature: receiptSig,
    };

    let cardPostEffects = { cashbackAmount: 0, pointsEarned: 0 };

    const runTx = db.transaction(() => {
      // Re-read authoritative balance inside atomic SQLite transaction
      const freshSrc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(srcAcc.id)) as
        | Record<string, unknown>
        | undefined;
      if (!freshSrc) {
        throw new BankingHttpError(404, 'Không tìm thấy tài khoản nguồn hợp lệ');
      }
      const freshBal = Number(freshSrc.balance || 0);
      const freshAvail = Number(freshSrc.available_balance ?? freshSrc.balance ?? 0);
      if (freshAvail < totalDebit) {
        throw new BankingHttpError(400, 'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.');
      }

      const nextSrcBal = freshBal - totalDebit;
      const nextSrcAvail = freshAvail - totalDebit;

      db.prepare(
        'UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_expense = COALESCE(monthly_expense, 0) + ? WHERE id = ?'
      ).run(nextSrcBal, nextSrcAvail, totalDebit, String(srcAcc.id));

      if (srcCard && cardLimitCheck) {
        cardPostEffects = applyCardPostSpendEffectsInTx({
          card: srcCard,
          acc: freshSrc,
          txId,
          baseAmount: numAmount,
          totalDebit,
          spentTodayBefore: cardLimitCheck.spentTodayBefore,
          todayStr: cardLimitCheck.todayStr,
          merchant: cleanCounterparty,
          category: resolvedCategory,
          kind: 'transfer',
          now,
        });
        if (cardPostEffects.pointsEarned > 0 || cardPostEffects.cashbackAmount > 0) {
          receipt.pointsEarned = cardPostEffects.pointsEarned;
          receipt.cashbackAmount = cardPostEffects.cashbackAmount;
        }
      }

      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
          category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
          receipt_json, bill_template, sender_name, sender_account, sender_avatar, recipient_avatar,
          client_tx_id, idempotency_key, target_account_id, is_ai_tx, receipt_sig, source_type, source_chat_id,
          source_card_id, source_card_last4
        ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        String(srcAcc.id),
        numAmount,
        cleanCounterparty,
        fullNote,
        now,
        now,
        resolvedCategory,
        String(receipt.channel),
        String(receipt.bankName),
        String(receipt.accountNumber),
        fee,
        totalDebit,
        nextSrcBal,
        refCode,
        JSON.stringify(receipt),
        billTemplate,
        String(receipt.senderName),
        String(receipt.senderAccount),
        String(receipt.senderAvatar),
        String(receipt.recipientAvatar),
        resolvedIdem,
        resolvedIdem,
        matchedTarget ? String(matchedTarget.id) : '',
        isAiTarget ? 1 : 0,
        receiptSig,
        sourceType,
        sourceChatId,
        resolvedSource.sourceCardId,
        resolvedSource.sourceCardLast4
      );

      writeLedgerAudit({
        operation: 'player_transfer_debit',
        txId,
        accountId: String(srcAcc.id),
        delta: -totalDebit,
        balanceBefore: freshBal,
        balanceAfter: nextSrcBal,
        detail: `${cleanCounterparty}: ${fullNote}`,
      });
      recordReceiptRecord({ transactionId: txId, receiptType: billTemplate });

      // Credit internal target (user sub-account or CHAR account!)
      if (matchedTarget) {
        const freshTgt = db.prepare('SELECT balance, available_balance FROM banking_accounts_demo WHERE id = ?').get(String(matchedTarget.id)) as
          | { balance: number; available_balance: number }
          | undefined;
        const tgtBefore = Number(freshTgt?.balance ?? matchedTarget.balance ?? 0);
        const tgtBal = tgtBefore + numAmount;
        const tgtAvail = Number(freshTgt?.available_balance ?? tgtBefore) + numAmount;
        db.prepare(
          'UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_income = COALESCE(monthly_income, 0) + ? WHERE id = ?'
        ).run(tgtBal, tgtAvail, numAmount, String(matchedTarget.id));

        const targetTxId = bankUid('tx');
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
            category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
            receipt_json, bill_template, linked_ref, sender_name, sender_account, sender_avatar, recipient_avatar,
            is_ai_tx, receipt_sig, source_type, source_chat_id, source_card_id, source_card_last4
          ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, ?, 'Thu nhập', ?, 'Hikari Bank', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetTxId,
          String(matchedTarget.id),
          numAmount,
          String(srcAcc.holder_name),
          fullNote,
          now,
          now,
          receipt.channel,
          senderAccountStr,
          numAmount,
          tgtBal,
          refCode,
          JSON.stringify(receipt),
          isAiTarget ? 'ai_tx' : 'receive',
          txId,
          String(srcAcc.holder_name),
          senderAccountStr,
          String(srcAcc.avatar || ''),
          String(matchedTarget.avatar || ''),
          isAiTarget ? 1 : 0,
          receiptSig,
          sourceType,
          sourceChatId,
          resolvedSource.sourceCardId,
          resolvedSource.sourceCardLast4
        );

        writeLedgerAudit({
          operation: 'internal_transfer_credit',
          txId: targetTxId,
          accountId: String(matchedTarget.id),
          delta: numAmount,
          balanceBefore: tgtBefore,
          balanceAfter: tgtBal,
          detail: fullNote,
        });
      }

      if (saveBeneficiary && receipt.accountNumber) {
        const existingBen = db
          .prepare("SELECT id FROM banking_beneficiaries WHERE REPLACE(REPLACE(account_number, '-', ''), ' ', '') = ?")
          .get(normalizeAccountDigits(String(receipt.accountNumber))) as { id: string } | undefined;
        if (existingBen) {
          db.prepare('UPDATE banking_beneficiaries SET last_used_at = ?, name = ? WHERE id = ?').run(now, cleanCounterparty, existingBen.id);
        } else {
          const isInternalCode = bankCode === 'HIKARI' || bankCode === 'PHONEBANK' ? 1 : 0;
          db.prepare(`
            INSERT INTO banking_beneficiaries (id, name, account_number, bank_code, bank_name, is_internal, alias, is_favorite, last_used_at)
            VALUES (?, ?, ?, ?, ?, ?, '', 0, ?)
          `).run(bankUid('ben'), cleanCounterparty, receipt.accountNumber, isInternalCode ? 'HIKARI' : bankCode, receipt.bankName, isInternalCode, now);
        }
      }

      // Reset failed pin & award loyalty points
      db.prepare('UPDATE banking_security_state SET failed_pin_count = 0, reward_points = COALESCE(reward_points, 0) + ?').run(
        Math.max(5, Math.min(120, Math.floor(numAmount / 100000)))
      );

      if (sec?.notif_balance !== 0) {
        pushBankNotification(
          'transfer',
          `Chuyển tiền thành công -${formatVndServer(totalDebit)}`,
          `Tới ${cleanCounterparty} (${receipt.bankName}) · Mã: ${refCode}`,
          -totalDebit,
          txId
        );
      }
    });

    try {
      runTx();
    } catch (err) {
      if (err instanceof BankingHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Two-way AI integration: send bill card + CHAR reaction in YumeChat if target is a CHAR
    if (isAiTarget && matchedTarget?.character_id) {
      sendUserTransferNoticeToAiChat({
        characterId: String(matchedTarget.character_id),
        amount: numAmount,
        note: fullNote,
        refCode,
        txId,
        receipt: receipt as unknown as Parameters<typeof sendUserTransferNoticeToAiChat>[0]['receipt'],
        senderName: String(srcAcc.holder_name),
      });
    }

    res.json({
      ...getOverviewPayload(),
      transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId),
      receipt,
      cashbackEarned: cardPostEffects.cashbackAmount,
      pointsEarned: cardPostEffects.pointsEarned,
      creditedInternal: isInternalSub || isAiTarget,
    });
  });

  // 4. Multi-Account Management (Create sub-account / receive-only, update, close)
  router.post('/accounts', (req: Request, res: Response) => {
    const {
      nickname = 'Tài khoản phụ mới',
      account_role = 'sub',
      package_tier = 'Standard',
      initial_deposit = 0,
      avatar = '/src/assets/images/char_sakura_1794880090451.jpg',
    } = req.body as {
      nickname?: string;
      account_role?: 'sub' | 'receive_only';
      package_tier?: string;
      initial_deposit?: number;
      avatar?: string;
    };

    const primary = db
      .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    if (!primary) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản chính' });
      return;
    }

    const deposit = Math.max(0, Math.round(Number(initial_deposit || 0)));
    const primaryAvail = Number(primary.available_balance ?? primary.balance ?? 0);
    if (deposit > primaryAvail) {
      res.status(400).json({ error: 'Số dư tài khoản chính không đủ để nạp khởi tạo' });
      return;
    }

    const id = bankUid('bank');
    const now = new Date().toISOString();
    const accNum = `8800-2026-${Math.floor(1000 + Math.random() * 8999)}`;
    const accountType = account_role === 'receive_only' ? 'Tài khoản Chỉ nhận tiền' : 'Tài khoản Phụ Thanh toán';

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO banking_accounts_demo (
          id, bank_name, account_number, holder_name, balance, pin_hash,
          account_type, available_balance, held_balance, daily_limit, monthly_limit, status, opened_at,
          nickname, avatar, is_hidden, is_primary, package_tier, owner_type, character_id, account_role
        ) VALUES (?, 'PhoneBank Premier', ?, ?, ?, '', ?, ?, 0, 50000000, 200000000, 'Đang hoạt động', ?, ?, ?, 0, 0, ?, 'user', '', ?)
      `).run(
        id,
        accNum,
        String(primary.holder_name),
        deposit,
        accountType,
        deposit,
        now.slice(0, 10),
        nickname.trim() || accountType,
        avatar,
        package_tier,
        account_role
      );

      if (deposit > 0) {
        const newPBal = Number(primary.balance || 0) - deposit;
        const newPAvail = primaryAvail - deposit;
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(
          newPBal,
          newPAvail,
          String(primary.id)
        );
        const refCode = genBankRefCode();
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code,
            receipt_json, bill_template, sender_name, sender_account
          ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, 'Thu nhập', 'Chuyển nội bộ', 'PhoneBank Premier', ?, 0, ?, ?, '{}', 'receive', ?, ?)
        `).run(
          bankUid('tx'),
          id,
          deposit,
          String(primary.holder_name),
          `Chuyển vốn mở ${nickname.trim()}`,
          now,
          String(primary.account_number),
          deposit,
          refCode,
          String(primary.holder_name),
          String(primary.account_number)
        );
      }

      pushBankNotification('system', 'Mở tài khoản mới thành công', `${nickname.trim()} · STK ${accNum}`, deposit, id);
    });
    tx();
    res.json(getOverviewPayload());
  });

  router.patch('/accounts/:id', (req: Request, res: Response) => {
    const { nickname, avatar, is_hidden, daily_limit, monthly_limit, status } = req.body as {
      nickname?: string;
      avatar?: string;
      is_hidden?: number;
      daily_limit?: number;
      monthly_limit?: number;
      status?: string;
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (nickname !== undefined) {
      sets.push('nickname = ?');
      vals.push(nickname.trim().slice(0, 40));
    }
    if (avatar !== undefined) {
      sets.push('avatar = ?');
      vals.push(avatar);
    }
    if (is_hidden !== undefined) {
      sets.push('is_hidden = ?');
      vals.push(is_hidden ? 1 : 0);
    }
    if (daily_limit !== undefined) {
      sets.push('daily_limit = ?');
      vals.push(Math.max(5000000, Number(daily_limit)));
    }
    if (monthly_limit !== undefined) {
      sets.push('monthly_limit = ?');
      vals.push(Math.max(20000000, Number(monthly_limit)));
    }
    if (status !== undefined) {
      sets.push('status = ?');
      vals.push(status);
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE banking_accounts_demo SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(getOverviewPayload());
  });

  router.post('/accounts/:id/set-primary', (req: Request, res: Response) => {
    const target = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản' });
      return;
    }
    if (String(target.account_role || 'payment') === 'receive_only') {
      res.status(400).json({ error: 'Tài khoản chỉ nhận tiền không thể đặt làm tài khoản chính.' });
      return;
    }
    if (String(target.status || 'Đang hoạt động').toLowerCase().includes('khóa')) {
      res.status(400).json({ error: 'Tài khoản đang bị khóa, không thể đặt làm tài khoản chính.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE banking_accounts_demo SET is_primary = 0 WHERE owner_type = 'user'").run();
      db.prepare('UPDATE banking_accounts_demo SET is_primary = 1 WHERE id = ?').run(String(target.id));
      pushBankNotification(
        'system',
        'Đã đổi tài khoản chính',
        `${String(target.nickname || target.account_type)} (${String(target.account_number)}) hiện là tài khoản chính.`,
        0,
        String(target.id)
      );
    });
    tx();
    res.json(getOverviewPayload());
  });

  router.post('/accounts/:id/close', (req: Request, res: Response) => {
    const target = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản' });
      return;
    }
    if (Number(target.is_primary) === 1) {
      res.status(400).json({ error: 'Không thể đóng tài khoản chính đang hoạt động.' });
      return;
    }
    const primary = db
      .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' AND id != ? ORDER BY is_primary DESC LIMIT 1")
      .get(req.params.id) as Record<string, unknown> | undefined;

    const rem = Number(target.balance || 0);
    const tx = db.transaction(() => {
      if (primary) {
        db.prepare('UPDATE banking_cards SET account_id = ? WHERE account_id = ?').run(String(primary.id), String(target.id));
        if (rem > 0) {
          db.prepare('UPDATE banking_accounts_demo SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(
            rem,
            rem,
            String(primary.id)
          );
        }
      }
      db.prepare('DELETE FROM banking_accounts_demo WHERE id = ?').run(req.params.id);
      pushBankNotification('system', 'Đã đóng tài khoản phụ', `Số dư còn lại ${formatVndServer(rem)} đã được chuyển về tài khoản chính.`, rem, '');
    });
    tx();
    res.json(getOverviewPayload());
  });

  // 5. Update Account Limits (Primary)
  router.patch('/account/limits', (req: Request, res: Response) => {
    const { daily_limit, monthly_limit, accountId } = req.body as {
      daily_limit?: number;
      monthly_limit?: number;
      accountId?: string;
    };
    const d = Math.max(5000000, Math.min(500000000, Number(daily_limit || 100000000)));
    const m = Math.max(d, Math.min(2000000000, Number(monthly_limit || 500000000)));
    const id = accountId || 'bank_1';
    db.prepare('UPDATE banking_accounts_demo SET daily_limit = ?, monthly_limit = ? WHERE id = ?').run(d, m, id);
    pushBankNotification('security', 'Cập nhật hạn mức giao dịch', `Hạn mức ngày: ${formatVndServer(d)} · Tháng: ${formatVndServer(m)}`, 0, '');
    res.json(getOverviewPayload());
  });

  // 6. Test/Demo money inflows are strictly disabled per app rules
  router.post('/receive-demo', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Chức năng nhận tiền test / mô phỏng đã bị tắt. Chỉ nhận tiền khi nhân vật CHAR đồng ý chuyển và gửi biên lai trong YumeChat.',
    });
  });

  router.post('/deposit-demo', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Chức năng nạp tiền test / mô phỏng đã bị tắt.',
    });
  });

  router.post('/withdraw', (req: Request, res: Response) => {
    const {
      amount = 500000,
      counterparty = 'ATM Hikari Bank',
      note = 'Rút tiền tại ATM Hikari',
      accountId,
      sourceCardId,
      idempotencyKey,
    } = req.body as {
      amount?: number;
      counterparty?: string;
      note?: string;
      accountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    };
    const result = executeSimulatedDepositOrWithdraw({
      mode: 'withdraw',
      accountId,
      sourceCardId,
      amount: Number(amount),
      counterparty,
      note,
      idempotencyKey,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({
      ...getOverviewPayload(),
      transaction: result.transaction,
      receipt: result.receipt,
      cashbackEarned: result.cashbackEarned || 0,
      pointsEarned: result.pointsEarned || 0,
      idempotentHit: Boolean(result.idempotentHit),
    });
  });

  // 6B. Direct CHAR-send & CHAR-request endpoints disabled (CHAR transfers only occur via YumeChat agreement + bill)
  router.post('/char-send', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Không thể gửi tiền trực tiếp từ nút bấm. Hãy nhắn tin cho nhân vật CHAR trong YumeChat; khi nhân vật đồng ý và gửi biên lai thì tiền mới về tài khoản.',
    });
  });

  router.get('/char-requests', (_req: Request, res: Response) => {
    res.json({ requests: [] });
  });

  router.post('/char-requests', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Tính năng yêu cầu chuyển tiền đã bị tắt. Hãy nhắn tin trực tiếp với nhân vật CHAR trong YumeChat.',
    });
  });

  router.post('/char-requests/:id/respond', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Tính năng yêu cầu chuyển tiền đã bị tắt.',
    });
  });

  // 7. Beneficiaries (pin favorite, create, delete)
  router.post('/beneficiaries', (req: Request, res: Response) => {
    const { name, account_number, bank_code = 'PHONEBANK', bank_name = 'PhoneBank Premier', alias = '', is_favorite = 0 } = req.body as {
      name?: string;
      account_number?: string;
      bank_code?: string;
      bank_name?: string;
      alias?: string;
      is_favorite?: number;
    };
    if (!name?.trim() || !account_number?.trim()) {
      res.status(400).json({ error: 'Thiếu tên hoặc số tài khoản người thụ hưởng' });
      return;
    }
    const id = bankUid('ben');
    db.prepare(`
      INSERT INTO banking_beneficiaries (id, name, account_number, bank_code, bank_name, is_internal, alias, is_favorite, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), account_number.trim(), bank_code, bank_name, bank_code === 'PHONEBANK' ? 1 : 0, alias.trim(), is_favorite ? 1 : 0, new Date().toISOString());
    res.json(getOverviewPayload());
  });

  router.post('/beneficiaries/:id/pin', (req: Request, res: Response) => {
    const ben = db.prepare('SELECT is_favorite FROM banking_beneficiaries WHERE id = ?').get(req.params.id) as { is_favorite: number } | undefined;
    if (ben) {
      db.prepare('UPDATE banking_beneficiaries SET is_favorite = ? WHERE id = ?').run(ben.is_favorite ? 0 : 1, req.params.id);
    }
    res.json(getOverviewPayload());
  });

  router.delete('/beneficiaries/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM banking_beneficiaries WHERE id = ?').run(req.params.id);
    res.json(getOverviewPayload());
  });

  // 8. Bank Cards (Advanced Anime Bank Card Ecosystem + Secure Vault & Universal Gateway)
  router.post('/cards', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      bank_id?: string;
      card_tier?: string;
      card_category?: 'debit' | 'credit';
      card_type?: string;
      card_name?: string;
      card_nickname?: string;
      account_id?: string;
      design_theme?: string;
      pin?: string;
      daily_limit?: number;
      monthly_limit?: number;
    };
    try {
      const created = issueAdvancedBankCard({
        bankId: body.bank_id,
        cardTier: body.card_tier,
        cardCategory: body.card_category,
        cardType: body.card_type,
        cardNickname: body.card_nickname || body.card_name,
        accountId: body.account_id,
        designTheme: body.design_theme,
        pin: body.pin,
        dailyLimit: body.daily_limit,
        monthlyLimit: body.monthly_limit,
      });
      const overview = getOverviewPayload();
      const issuedCard =
        overview.cards.find((c) => (c as { id?: string }).id === created.cardId) || overview.cards[0];
      res.json({ ...overview, issuedCard, issuedMeta: created });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.errorTitle || err.message, reason: err.reason || err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/lookup', (req: Request, res: Response) => {
    const { cardId, cardNumber } = (req.body || {}) as { cardId?: string; cardNumber?: string };
    res.json(lookupCardPublicInfo({ cardId, cardNumber }));
  });

  router.post('/cards/charge', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      cardId?: string;
      cardNumber?: string;
      holderName?: string;
      expiry?: string;
      cvv?: string;
      merchant?: string;
      amount?: number;
      category?: string;
      partnerId?: string;
      voucherId?: string;
      billId?: string;
      channelType?: 'pos' | 'online' | 'partner' | 'intl';
      appSource?: string;
      idempotencyKey?: string;
    };
    try {
      const result = processUniversalCardPayment({
        cardId: body.cardId,
        cardNumber: body.cardNumber,
        holderName: body.holderName,
        expiry: body.expiry,
        cvv: body.cvv,
        merchant: body.merchant || '',
        amount: Number(body.amount || 0),
        category: body.category,
        partnerId: body.partnerId,
        voucherId: body.voucherId,
        billId: body.billId,
        channelType: body.channelType || 'online',
        appSource: body.appSource,
        idempotencyKey: body.idempotencyKey,
      });
      res.json({
        ...getOverviewPayload(),
        ...result,
      });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({
          error: err.errorTitle || 'GIAO DỊCH BỊ TỪ CHỐI',
          reason: err.reason || err.message,
          code: err.code,
        });
        return;
      }
      throw err;
    }
  });

  router.get('/cards/bills', (_req: Request, res: Response) => {
    const cardBills = db
      .prepare("SELECT * FROM banking_card_bills ORDER BY CASE WHEN status = 'unpaid' THEN 0 ELSE 1 END, due_date ASC, created_at ASC")
      .all();
    res.json({ cardBills });
  });

  router.post('/cards/:id/reveal', (req: Request, res: Response) => {
    const { pin } = (req.body || {}) as { pin?: string };
    try {
      const revealed = revealCardSensitiveInfo(req.params.id, pin || '');
      res.json(revealed);
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/pin', (req: Request, res: Response) => {
    const { currentPin, newPin } = (req.body || {}) as { currentPin?: string; newPin?: string };
    try {
      changeCardPin(req.params.id, currentPin || '', newPin || '');
      res.json({ ...getOverviewPayload(), ok: true });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/cancel', (req: Request, res: Response) => {
    const { pin } = (req.body || {}) as { pin?: string };
    try {
      cancelBankCard(req.params.id, pin || '');
      res.json({ ...getOverviewPayload(), ok: true });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/reissue', (req: Request, res: Response) => {
    const { pin } = (req.body || {}) as { pin?: string };
    try {
      const reissued = reissueBankCard(req.params.id, pin || '');
      const overview = getOverviewPayload();
      const issuedCard =
        overview.cards.find((c) => (c as { id?: string }).id === reissued.newCardId) || overview.cards[0];
      res.json({ ...overview, issuedCard, reissued });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/set-primary', (req: Request, res: Response) => {
    const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!card) {
      res.status(404).json({ error: 'Không tìm thấy thẻ' });
      return;
    }
    if (String(card.status || 'active') !== 'active') {
      res.status(400).json({ error: 'Không thể đặt thẻ đang bị khóa hoặc đã hủy làm thẻ chính.' });
      return;
    }
    if (isCardExpired(String(card.expiry || ''))) {
      res.status(400).json({ error: 'Thẻ đã hết hạn không thể đặt làm thẻ chính.' });
      return;
    }
    if (String(card.linked_status || 'linked') === 'unlinked' || !String(card.account_id || '').trim()) {
      res.status(400).json({ error: 'Thẻ đang ngưng liên kết tài khoản không thể đặt làm thẻ chính.' });
      return;
    }
    const linkedAcc = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(String(card.account_id || '')) as
      | Record<string, unknown>
      | undefined;
    if (!linkedAcc || String(linkedAcc.account_role || 'payment') === 'receive_only') {
      res.status(400).json({ error: 'Tài khoản liên kết của thẻ không hỗ trợ thanh toán.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE banking_cards SET is_primary = 0').run();
      db.prepare('UPDATE banking_cards SET is_primary = 1 WHERE id = ?').run(String(card.id));
      pushBankNotification(
        'card',
        'Đã đổi thẻ mặc định',
        `Thẻ ${String(card.card_nickname || card.card_name)} (•••• ${String(card.last4)}) hiện là thẻ chính.`,
        0,
        String(card.id)
      );
    });
    tx();
    res.json(getOverviewPayload());
  });

  router.patch('/cards/:id', (req: Request, res: Response) => {
    const {
      card_name,
      card_nickname,
      account_id,
      status,
      online_payment_enabled,
      contactless_enabled,
      intl_payment_enabled,
      per_tx_limit,
      daily_limit,
      monthly_limit,
      transfer_limit,
      withdraw_limit,
      online_limit,
      design_theme,
      pin,
    } = req.body as {
      card_name?: string;
      card_nickname?: string;
      account_id?: string;
      status?: 'active' | 'locked';
      online_payment_enabled?: number;
      contactless_enabled?: number;
      intl_payment_enabled?: number;
      per_tx_limit?: number;
      daily_limit?: number;
      monthly_limit?: number;
      transfer_limit?: number;
      withdraw_limit?: number;
      online_limit?: number;
      design_theme?: string;
      pin?: string;
    };

    const existing = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy thẻ' });
      return;
    }
    if (String(existing.status || 'active') === 'cancelled') {
      res.status(400).json({ error: 'Thẻ đã bị hủy vĩnh viễn, không thể thay đổi cài đặt.', code: 'CARD_CANCELLED' });
      return;
    }

    const isUnlocking = status === 'active' && String(existing.status || 'active') === 'locked';
    const isSecurityChange =
      isUnlocking ||
      online_payment_enabled !== undefined ||
      contactless_enabled !== undefined ||
      intl_payment_enabled !== undefined ||
      per_tx_limit !== undefined ||
      daily_limit !== undefined ||
      monthly_limit !== undefined ||
      transfer_limit !== undefined ||
      withdraw_limit !== undefined ||
      online_limit !== undefined;

    if (isSecurityChange) {
      try {
        verifyCardSecurityPin(existing, pin);
      } catch (err) {
        if (err instanceof CardEngineHttpError) {
          res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
          return;
        }
        throw err;
      }
    }

    const now = new Date().toISOString();
    const sets: string[] = [];
    const vals: unknown[] = [];
    const nextNick = (card_nickname !== undefined ? card_nickname : card_name)?.trim().slice(0, 40);
    if (nextNick) {
      sets.push('card_nickname = ?', 'card_name = ?');
      vals.push(nextNick, nextNick);
    }
    if (design_theme?.trim()) {
      sets.push('design_theme = ?');
      vals.push(design_theme.trim());
    }
    if (account_id !== undefined && account_id.trim()) {
      const targetAcc = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(account_id.trim()) as
        | Record<string, unknown>
        | undefined;
      if (!targetAcc) {
        res.status(404).json({ error: 'Không tìm thấy tài khoản liên kết' });
        return;
      }
      if (String(targetAcc.account_role || 'payment') === 'receive_only') {
        res.status(400).json({ error: 'Không thể liên kết thẻ với tài khoản chỉ nhận tiền.' });
        return;
      }
      sets.push('account_id = ?', "linked_status = 'linked'", 'holder_name = ?');
      vals.push(String(targetAcc.id), String(targetAcc.holder_name || 'MINH ANH').toUpperCase());
    }
    if (status !== undefined && (status === 'active' || status === 'locked')) {
      sets.push('status = ?');
      vals.push(status);
      if (status === 'locked' && String(existing.status || 'active') !== 'locked') {
        sets.push('locked_at = ?');
        vals.push(now);
      } else if (isUnlocking) {
        sets.push('unlocked_at = ?');
        vals.push(now);
      }
    }
    if (online_payment_enabled !== undefined) {
      sets.push('online_payment_enabled = ?');
      vals.push(online_payment_enabled ? 1 : 0);
    }
    if (contactless_enabled !== undefined) {
      sets.push('contactless_enabled = ?');
      vals.push(contactless_enabled ? 1 : 0);
    }
    if (intl_payment_enabled !== undefined) {
      sets.push('intl_payment_enabled = ?');
      vals.push(intl_payment_enabled ? 1 : 0);
    }
    if (per_tx_limit !== undefined) {
      sets.push('per_tx_limit = ?');
      vals.push(Math.max(500000, Math.round(Number(per_tx_limit))));
    }
    if (daily_limit !== undefined) {
      sets.push('daily_limit = ?');
      vals.push(Math.max(1000000, Math.round(Number(daily_limit))));
    }
    if (monthly_limit !== undefined) {
      sets.push('monthly_limit = ?');
      vals.push(Math.max(5000000, Math.round(Number(monthly_limit))));
    }
    if (transfer_limit !== undefined) {
      sets.push('transfer_limit = ?');
      vals.push(Math.max(1000000, Math.round(Number(transfer_limit))));
    }
    if (withdraw_limit !== undefined) {
      sets.push('withdraw_limit = ?');
      vals.push(Math.max(1000000, Math.round(Number(withdraw_limit))));
    }
    if (online_limit !== undefined) {
      sets.push('online_limit = ?');
      vals.push(Math.max(1000000, Math.round(Number(online_limit))));
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE banking_cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      if (status === 'locked' && String(existing.status || 'active') !== 'locked') {
        pushBankNotification(
          'security',
          'Đã khóa thẻ thanh toán',
          `Thẻ ${String(existing.card_nickname || existing.card_name)} (•••• ${String(existing.last4)}) đã được khóa. Mọi giao dịch qua thẻ này sẽ bị từ chối.`,
          0,
          String(existing.id)
        );
      } else if (isUnlocking) {
        pushBankNotification(
          'security',
          'Đã mở khóa thẻ',
          `Thẻ ${String(existing.card_nickname || existing.card_name)} (•••• ${String(existing.last4)}) đã hoạt động trở lại.`,
          0,
          String(existing.id)
        );
      }

      if (status === 'locked' && Number(existing.is_primary) === 1) {
        db.prepare('UPDATE banking_cards SET is_primary = 0 WHERE id = ?').run(req.params.id);
        const replacement = db
          .prepare("SELECT id, expiry FROM banking_cards WHERE id != ? AND status = 'active' AND COALESCE(linked_status, 'linked') = 'linked' ORDER BY created_at ASC")
          .all(req.params.id) as Array<{ id: string; expiry: string }>;
        const validRep = replacement.find((c) => !isCardExpired(c.expiry));
        if (validRep) {
          db.prepare('UPDATE banking_cards SET is_primary = 1 WHERE id = ?').run(validRep.id);
        }
      }
    }
    res.json(getOverviewPayload());
  });

  const handleCardPay = (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      merchant?: string;
      amount?: number;
      category?: string;
      partnerId?: string;
      voucherId?: string;
      billId?: string;
      channelType?: 'online' | 'pos' | 'intl';
      idempotencyKey?: string;
    };
    try {
      const result = executeCardPaymentTransaction({
        cardId: req.params.id,
        merchant: body.merchant || '',
        amount: Number(body.amount || 0),
        category: body.category,
        partnerId: body.partnerId,
        voucherId: body.voucherId,
        billId: body.billId,
        channelType: body.channelType || 'online',
        idempotencyKey: body.idempotencyKey,
      });
      res.json({
        ...getOverviewPayload(),
        ...result,
      });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({
          error: err.errorTitle || err.message,
          reason: err.reason || err.message,
          code: err.code,
        });
        return;
      }
      throw err;
    }
  };

  router.post('/cards/:id/pay-demo', handleCardPay);
  router.post('/cards/:id/pay', handleCardPay);

  router.post('/cards/:id/upgrade', (req: Request, res: Response) => {
    const { targetTier } = (req.body || {}) as { targetTier?: string };
    try {
      const result = upgradeBankCardTier(req.params.id, targetTier);
      const overview = getOverviewPayload();
      const upgradedCard = (overview.cards || []).find(
        (c) => String((c as Record<string, unknown>).id || '') === result.cardId
      );
      res.json({
        ...overview,
        upgradedCard,
        fromTier: result.previousTier,
        toTier: result.newTier,
        policy: result.policy,
      });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/interest/claim', (req: Request, res: Response) => {
    try {
      const result = claimCardInterestPayout(req.params.id);
      res.json({ ...getOverviewPayload(), ...result });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/rewards/redeem', (req: Request, res: Response) => {
    const { catalogId } = (req.body || {}) as { catalogId?: string };
    if (!catalogId) {
      res.status(400).json({ error: 'Vui lòng chọn phần quà muốn đổi' });
      return;
    }
    try {
      const result = redeemCardRewardItem(req.params.id, catalogId);
      res.json({ ...getOverviewPayload(), redeemed: result });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/link', (req: Request, res: Response) => {
    const { accountId } = (req.body || {}) as { accountId?: string };
    try {
      const card = setCardLinkStatus(req.params.id, 'link', accountId);
      res.json({ ...getOverviewPayload(), card });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  router.post('/cards/:id/unlink', (req: Request, res: Response) => {
    try {
      const card = setCardLinkStatus(req.params.id, 'unlink');
      res.json({ ...getOverviewPayload(), card });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  // 9. Savings & Deposits (Không kỳ hạn, 1 tuần, 1/3/6/9/12/24 tháng, Nạp thêm, Rút trước hạn, Tất toán)
  router.post('/savings', (req: Request, res: Response) => {
    const {
      product_type = 'online',
      product_name,
      principal,
      interest_rate = 5.5,
      term_months = 6,
      auto_renew = 1,
      accountId = 'bank_1',
    } = req.body as {
      product_type?: string;
      product_name?: string;
      principal?: number;
      interest_rate?: number;
      term_months?: number;
      auto_renew?: number;
      accountId?: string;
    };
    const p = Math.round(Number(principal || 0));
    if (!Number.isFinite(p) || p < 500000) {
      res.status(400).json({ error: 'Số tiền gửi tiết kiệm tối thiểu là 500.000 VNĐ' });
      return;
    }
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(accountId) as Record<string, unknown> | undefined;
    if (!acc || Number(acc.available_balance ?? acc.balance ?? 0) < p) {
      res.status(400).json({ error: 'Số dư khả dụng không đủ để mở sổ tiết kiệm' });
      return;
    }

    const term = Math.max(0, Number(term_months));
    const rate = Number(interest_rate);
    const opened = new Date();
    const mat = new Date(opened);
    if (term === 0.25) mat.setDate(mat.getDate() + 7);
    else if (term === 0) mat.setMonth(mat.getMonth() + 12);
    else mat.setMonth(mat.getMonth() + Math.round(term));

    const effMonths = term === 0 ? 1 : term;
    const expected = Math.round(p * (rate / 100) * (effMonths / 12));
    const id = bankUid('sav');
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const now = opened.toISOString();
    const newBal = Number(acc.balance || 0) - p;
    const newAvail = Number(acc.available_balance ?? acc.balance ?? 0) - p;
    const finalName = product_name || (term === 0 ? 'Tiết kiệm Không kỳ hạn' : term === 0.25 ? 'Tiết kiệm 1 tuần' : `Tiết kiệm Online ${term} tháng`);

    const savOpenSig = signReceiptPayload({
      txId,
      refCode,
      amount: p,
      fee: 0,
      totalAmount: p,
      senderAccount: String(acc.account_number),
      recipientAccount: `Lãi suất ${rate}%/năm`,
      createdAt: now,
      status: 'Thành công',
    });
    const receipt = {
      txId,
      template: 'savings_open' as BillTemplateType,
      refCode,
      channel: 'Tiết kiệm số Premier',
      bankName: 'PhoneBank Savings',
      accountNumber: id.toUpperCase(),
      senderName: String(acc.holder_name),
      senderAccount: String(acc.account_number),
      recipientName: finalName,
      recipientAccount: `Lãi suất ${rate}%/năm`,
      amount: p,
      fee: 0,
      totalAmount: p,
      note: `Mở sổ ${finalName} · Kỳ hạn ${term === 0 ? 'Linh hoạt' : term === 0.25 ? '1 tuần' : `${term} tháng`}`,
      createdAt: now,
      status: 'Thành công',
      signature: savOpenSig,
    };

    const run = db.transaction(() => {
      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
      db.prepare(`
        INSERT INTO banking_savings (
          id, account_id, product_type, product_name, principal, interest_rate, term_months,
          opened_at, maturity_date, expected_interest, auto_renew, status, settled_at, actual_payout
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '', 0)
      `).run(id, String(acc.id), product_type, finalName, p, rate, term, now.slice(0, 10), mat.toISOString().slice(0, 10), expected, auto_renew ? 1 : 0);

      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, balance_after, ref_code,
          receipt_json, bill_template, sender_name, sender_account, receipt_sig
        ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, 'Tiết kiệm', 'Tiết kiệm số', 'PhoneBank Savings', ?, 0, ?, ?, ?, 'savings_open', ?, ?, ?)
      `).run(txId, String(acc.id), p, finalName, receipt.note, now, id.toUpperCase(), newBal, refCode, JSON.stringify(receipt), String(acc.holder_name), String(acc.account_number), savOpenSig);

      pushBankNotification('savings', 'Mở sổ tiết kiệm thành công', `${finalName} · Gốc ${formatVndServer(p)}`, -p, txId);
    });
    run();
    res.json({ ...getOverviewPayload(), transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId), receipt });
  });

  router.post('/savings/:id/deposit', (req: Request, res: Response) => {
    const { amount } = req.body as { amount?: number };
    const amt = Math.round(Number(amount || 0));
    const sav = db.prepare("SELECT * FROM banking_savings WHERE id = ? AND status = 'active'").get(req.params.id) as Record<string, unknown> | undefined;
    if (!sav) {
      res.status(404).json({ error: 'Không tìm thấy sổ tiết kiệm đang hoạt động' });
      return;
    }
    if (amt < 100000) {
      res.status(400).json({ error: 'Nạp thêm tối thiểu 100.000 VNĐ' });
      return;
    }
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(sav.account_id)) as Record<string, unknown>;
    if (Number(acc.available_balance ?? acc.balance ?? 0) < amt) {
      res.status(400).json({ error: 'Số dư khả dụng không đủ' });
      return;
    }
    const newPrincipal = Number(sav.principal) + amt;
    const effM = Number(sav.term_months) === 0 ? 1 : Number(sav.term_months);
    const newExp = Math.round(newPrincipal * (Number(sav.interest_rate) / 100) * (effM / 12));
    const newBal = Number(acc.balance) - amt;
    const newAvail = Number(acc.available_balance ?? acc.balance) - amt;
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const now = new Date().toISOString();

    const run = db.transaction(() => {
      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
      db.prepare('UPDATE banking_savings SET principal = ?, expected_interest = ? WHERE id = ?').run(newPrincipal, newExp, String(sav.id));
      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template
        ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, 'Tiết kiệm', 'Nạp thêm tiết kiệm', 'PhoneBank Savings', ?, 0, ?, ?, 'savings_open')
      `).run(txId, String(acc.id), amt, String(sav.product_name), `Nạp thêm gốc tiết kiệm`, now, String(sav.id).toUpperCase(), newBal, refCode);
      pushBankNotification('savings', 'Nạp thêm tiết kiệm', `+${formatVndServer(amt)} vào ${String(sav.product_name)}`, -amt, txId);
    });
    run();
    res.json(getOverviewPayload());
  });

  router.patch('/savings/:id', (req: Request, res: Response) => {
    const { auto_renew } = req.body as { auto_renew?: number };
    db.prepare('UPDATE banking_savings SET auto_renew = ? WHERE id = ?').run(auto_renew ? 1 : 0, req.params.id);
    res.json(getOverviewPayload());
  });

  // Early withdrawal OR normal settlement
  const settleOrEarlyWithdraw = (id: string, isEarly: boolean, res: Response) => {
    const sav = db.prepare("SELECT * FROM banking_savings WHERE id = ? AND status = 'active'").get(id) as Record<string, unknown> | undefined;
    if (!sav) {
      res.status(404).json({ error: 'Sổ tiết kiệm không tồn tại hoặc đã tất toán' });
      return;
    }
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(sav.account_id)) as Record<string, unknown>;
    const principal = Number(sav.principal || 0);
    // Early withdrawal pays non-term demand rate 0.5%/year; normal settlement pays expected_interest
    const interest = isEarly ? Math.round(principal * 0.005 * (1 / 12)) : Number(sav.expected_interest || 0);
    const payout = principal + interest;
    const newBal = Number(acc.balance) + payout;
    const newAvail = Number(acc.available_balance ?? acc.balance) + payout;
    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const label = isEarly ? 'Rút tiết kiệm trước hạn' : 'Tất toán sổ tiết kiệm';

    const savSettleSig = signReceiptPayload({
      txId,
      refCode,
      amount: payout,
      fee: 0,
      totalAmount: payout,
      senderAccount: String(sav.id).toUpperCase(),
      recipientAccount: String(acc.account_number),
      createdAt: now,
      status: 'Thành công',
    });
    const receipt = {
      txId,
      template: 'savings_settle' as BillTemplateType,
      refCode,
      channel: label,
      bankName: 'PhoneBank Savings',
      accountNumber: String(sav.id).toUpperCase(),
      senderName: 'PhoneBank Savings',
      senderAccount: String(sav.id).toUpperCase(),
      recipientName: String(acc.holder_name),
      recipientAccount: String(acc.account_number),
      amount: payout,
      fee: 0,
      totalAmount: payout,
      note: `${label} ${String(sav.product_name)} (Gốc ${formatVndServer(principal)} + Lãi ${formatVndServer(interest)})`,
      createdAt: now,
      status: 'Thành công',
      signature: savSettleSig,
    };

    const run = db.transaction(() => {
      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
      db.prepare("UPDATE banking_savings SET status = 'settled', settled_at = ?, actual_payout = ? WHERE id = ?").run(now, payout, String(sav.id));
      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, balance_after, ref_code, receipt_json, bill_template, sender_name, sender_account, receipt_sig
        ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, 'Tiền lãi', ?, 'PhoneBank Savings', ?, 0, ?, ?, ?, 'savings_settle', 'PhoneBank Savings', ?, ?)
      `).run(txId, String(acc.id), payout, String(sav.product_name), receipt.note, now, label, String(sav.id).toUpperCase(), newBal, refCode, JSON.stringify(receipt), String(sav.id).toUpperCase(), savSettleSig);
      pushBankNotification('interest', label, `Đã nhận ${formatVndServer(payout)} về tài khoản thanh toán`, payout, txId);
    });
    run();
    res.json({ ...getOverviewPayload(), transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId), receipt });
  };

  router.post('/savings/:id/early-withdraw', (req: Request, res: Response) => settleOrEarlyWithdraw(req.params.id, true, res));
  router.post('/savings/:id/settle', (req: Request, res: Response) => settleOrEarlyWithdraw(req.params.id, false, res));

  // 10. Loans & Debt (Personal, Consumer, Short-term, Long-term, AI Character Borrow/Lend + Early Payoff)
  router.post('/loans', (req: Request, res: Response) => {
    const {
      loan_type = 'consumer',
      loan_name,
      principal,
      interest_rate = 11.5,
      term_months = 12,
      counterparty_char_id = '',
      direction = 'borrow',
    } = req.body as {
      loan_type?: string;
      loan_name?: string;
      principal?: number;
      interest_rate?: number;
      term_months?: number;
      counterparty_char_id?: string;
      direction?: 'borrow' | 'lend';
    };

    const p = Math.round(Number(principal || 0));
    if (!Number.isFinite(p) || p < 500000) {
      res.status(400).json({ error: 'Khoản vay tối thiểu là 500.000 VNĐ' });
      return;
    }

    const userAcc = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = 'bank_1'").get() as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = bankUid('loan');
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const rate = counterparty_char_id ? Number(interest_rate || 0) : Number(interest_rate || 11.5);
    const term = Math.max(1, Math.round(Number(term_months || 6)));
    const { monthlyPayment, schedule } = buildLoanSchedule(p, rate, term, now, 0);
    const nextDue = schedule[0]?.dueDate || new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    // Disallow bypassing YumeChat to borrow/lend via instant CHAR loan form or leaking CHAR balance
    if (counterparty_char_id) {
      res.status(403).json({
        error: 'Không hỗ trợ vay trực tiếp từ biểu mẫu CHAR. Hãy nhắn tin hỏi vay trực tiếp với nhân vật CHAR trong YumeChat.',
      });
      return;
    }
    const aiAcc = null as Record<string, unknown> | null;

    const loanTitle =
      loan_name ||
      (aiAcc
        ? direction === 'borrow'
          ? `Vay từ ${String(aiAcc.holder_name)}`
          : `Cho ${String(aiAcc.holder_name)} vay`
        : 'Khoản vay PhoneBank Premier');

    const run = db.transaction(() => {
      db.prepare(`
        INSERT INTO banking_loans (
          id, account_id, loan_type, loan_name, principal, remaining_balance,
          interest_rate, term_months, monthly_payment, paid_months, next_due_date,
          status, schedule_json, created_at, counterparty_char_id, direction
        ) VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?, ?)
      `).run(id, loan_type, loanTitle, p, p, rate, term, monthlyPayment, nextDue, JSON.stringify(schedule), now, counterparty_char_id, direction);

      if (direction === 'borrow') {
        const newBal = Number(userAcc.balance) + p;
        const newAvail = Number(userAcc.available_balance ?? userAcc.balance) + p;
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, 'bank_1');
        if (aiAcc) {
          db.prepare('UPDATE banking_accounts_demo SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ?').run(p, p, String(aiAcc.id));
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template, is_ai_tx
          ) VALUES (?, 'bank_1', 'income', ?, ?, ?, 'Thành công', ?, 'Giải ngân', 'Tín dụng Premier', 'PhoneBank Credit', ?, 0, ?, ?, ?, ?)
        `).run(txId, p, aiAcc ? String(aiAcc.holder_name) : 'PhoneBank Credit', `Giải ngân ${loanTitle}`, now, id.toUpperCase(), newBal, refCode, aiAcc ? 'ai_tx' : 'receive', aiAcc ? 1 : 0);
        pushBankNotification('loan', 'Giải ngân khoản vay thành công', `+${formatVndServer(p)} từ ${loanTitle}`, p, txId);
      } else {
        const newBal = Number(userAcc.balance) - p;
        const newAvail = Number(userAcc.available_balance ?? userAcc.balance) - p;
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, 'bank_1');
        if (aiAcc) {
          db.prepare('UPDATE banking_accounts_demo SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(p, p, String(aiAcc.id));
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template, is_ai_tx
          ) VALUES (?, 'bank_1', 'expense', ?, ?, ?, 'Thành công', ?, 'Chuyển khoản', 'Cho vay AI', 'PhoneBank Premier', ?, 0, ?, ?, 'ai_tx', 1)
        `).run(txId, p, aiAcc ? String(aiAcc.holder_name) : loanTitle, loanTitle, now, String(aiAcc?.account_number || ''), newBal, refCode);
        pushBankNotification('loan', 'Đã giải ngân cho nhân vật AI vay', `-${formatVndServer(p)} tới ${String(aiAcc?.holder_name || '')}`, -p, txId);
      }
    });
    run();
    res.json(getOverviewPayload());
  });

  const handleLoanRepay = (id: string, earlyPayoff: boolean, res: Response) => {
    const loan = db.prepare("SELECT * FROM banking_loans WHERE id = ? AND status = 'active'").get(id) as Record<string, unknown> | undefined;
    if (!loan) {
      res.status(404).json({ error: 'Khoản vay không tồn tại hoặc đã tất toán' });
      return;
    }
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(loan.account_id)) as Record<string, unknown>;
    const direction = String(loan.direction || 'borrow');
    const schedule = JSON.parse(String(loan.schedule_json || '[]')) as Array<{
      month: number;
      dueDate: string;
      principalDue: number;
      interestDue: number;
      totalDue: number;
      remainingBalance: number;
      paid: boolean;
      paidAt: string;
    }>;

    const remaining = Number(loan.remaining_balance || 0);
    const nextIdx = schedule.findIndex((s) => !s.paid);
    const payAmt = earlyPayoff ? remaining : nextIdx >= 0 ? schedule[nextIdx].totalDue : Math.min(remaining, Number(loan.monthly_payment));
    const principalPart = earlyPayoff ? remaining : nextIdx >= 0 ? schedule[nextIdx].principalDue : payAmt;

    const charId = String(loan.counterparty_char_id || '');
    const aiAcc = charId
      ? (db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?").get(charId) as Record<string, unknown> | undefined)
      : undefined;

    if (direction === 'borrow') {
      if (Number(acc.available_balance ?? acc.balance) < payAmt) {
        res.status(400).json({ error: 'Số dư khả dụng không đủ để thanh toán khoản vay' });
        return;
      }
    } else if (aiAcc && Number(aiAcc.available_balance ?? aiAcc.balance) < payAmt) {
      res.status(400).json({ error: `${String(aiAcc.holder_name)} hiện chưa đủ số dư để hoàn trả kỳ này` });
      return;
    }

    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const newRemaining = earlyPayoff ? 0 : Math.max(0, remaining - principalPart);
    const nextPaidMonths = earlyPayoff ? Number(loan.term_months) : Number(loan.paid_months || 0) + 1;
    if (earlyPayoff) {
      schedule.forEach((s) => {
        s.paid = true;
        s.paidAt = s.paidAt || now;
      });
    } else if (nextIdx >= 0) {
      schedule[nextIdx].paid = true;
      schedule[nextIdx].paidAt = now;
    }
    const nextUnpaid = schedule.find((s) => !s.paid);
    const nextStatus = newRemaining <= 0 || !nextUnpaid ? 'paid_off' : 'active';

    const loanSenderAccount = direction === 'borrow' ? String(acc.account_number) : String(aiAcc?.account_number || '');
    const loanRecipientAccount = String(loan.id).toUpperCase();
    const loanSig = signReceiptPayload({
      txId,
      refCode,
      amount: payAmt,
      fee: 0,
      totalAmount: payAmt,
      senderAccount: loanSenderAccount,
      recipientAccount: loanRecipientAccount,
      createdAt: now,
      status: 'Thành công',
    });
    const receipt = {
      txId,
      template: 'loan_pay' as BillTemplateType,
      refCode,
      channel: earlyPayoff ? 'Tất toán khoản vay' : 'Thanh toán kỳ hạn vay',
      bankName: 'PhoneBank Credit',
      accountNumber: loanRecipientAccount,
      senderName: direction === 'borrow' ? String(acc.holder_name) : String(aiAcc?.holder_name || 'AI'),
      senderAccount: loanSenderAccount,
      recipientName: direction === 'borrow' ? String(aiAcc?.holder_name || 'PhoneBank Credit') : String(acc.holder_name),
      recipientAccount: loanRecipientAccount,
      amount: payAmt,
      fee: 0,
      totalAmount: payAmt,
      note: `${earlyPayoff ? 'Tất toán' : `Trả kỳ ${nextPaidMonths}/${String(loan.term_months)}`} · ${String(loan.loan_name)}`,
      createdAt: now,
      status: 'Thành công',
      signature: loanSig,
    };

    const run = db.transaction(() => {
      if (direction === 'borrow') {
        const newBal = Number(acc.balance) - payAmt;
        const newAvail = Number(acc.available_balance ?? acc.balance) - payAmt;
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
        if (aiAcc) {
          db.prepare('UPDATE banking_accounts_demo SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(payAmt, payAmt, String(aiAcc.id));
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, receipt_json, bill_template, sender_name, sender_account, receipt_sig
          ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, 'Trả nợ vay', ?, 'PhoneBank Credit', ?, 0, ?, ?, ?, 'loan_pay', ?, ?, ?)
        `).run(txId, String(acc.id), payAmt, receipt.recipientName, receipt.note, now, receipt.channel, receipt.accountNumber, newBal, refCode, JSON.stringify(receipt), receipt.senderName, receipt.senderAccount, loanSig);
        pushBankNotification('loan', receipt.channel, `-${formatVndServer(payAmt)} · ${String(loan.loan_name)}`, -payAmt, txId);
      } else {
        const newBal = Number(acc.balance) + payAmt;
        const newAvail = Number(acc.available_balance ?? acc.balance) + payAmt;
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
        if (aiAcc) {
          db.prepare('UPDATE banking_accounts_demo SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ?').run(payAmt, payAmt, String(aiAcc.id));
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, receipt_json, bill_template, is_ai_tx, receipt_sig
          ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, 'Thu hồi nợ AI', ?, 'PhoneBank Premier', ?, 0, ?, ?, ?, 'ai_tx', 1, ?)
        `).run(txId, String(acc.id), payAmt, String(aiAcc?.holder_name || 'AI'), receipt.note, now, receipt.channel, receipt.accountNumber, newBal, refCode, JSON.stringify(receipt), loanSig);
        pushBankNotification('receive', `${String(aiAcc?.holder_name || 'AI')} trả nợ`, `+${formatVndServer(payAmt)} · ${String(loan.loan_name)}`, payAmt, txId);
      }

      db.prepare(`
        UPDATE banking_loans SET remaining_balance = ?, paid_months = ?, next_due_date = ?, status = ?, schedule_json = ? WHERE id = ?
      `).run(newRemaining, nextPaidMonths, nextUnpaid?.dueDate || String(loan.next_due_date), nextStatus, JSON.stringify(schedule), String(loan.id));
    });
    run();
    res.json({ ...getOverviewPayload(), transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId), receipt });
  };

  router.post('/loans/:id/pay', (req: Request, res: Response) => handleLoanRepay(req.params.id, false, res));
  router.post('/loans/:id/early-payoff', (req: Request, res: Response) => handleLoanRepay(req.params.id, true, res));

  // 11. Bills (10 categories + lookup + recurring + AI recurring bills)
  router.post('/bills/lookup', (req: Request, res: Response) => {
    const { bill_type = 'Điện', customer_code = '' } = req.body as { bill_type?: string; customer_code?: string };
    const code = customer_code.trim().toUpperCase();
    if (code.length < 4) {
      res.status(400).json({ error: 'Mã khách hàng cần tối thiểu 4 ký tự' });
      return;
    }
    const existing = db.prepare('SELECT * FROM banking_bills_demo WHERE UPPER(customer_code) = ?').get(code) as Record<string, unknown> | undefined;
    if (existing) {
      res.json({ found: true, bill: existing });
      return;
    }
    const baseAmounts: Record<string, number> = {
      Điện: 485000,
      Nước: 162000,
      Internet: 290000,
      'Truyền hình': 140000,
      'Điện thoại': 210000,
      'Học phí': 1850000,
      'Viện phí': 740000,
      'Thuê nhà': 4500000,
      'Mua sắm': 590000,
      'Dịch vụ khác': 320000,
    };
    const amount = baseAmounts[bill_type] || 350000;
    const provider = `${bill_type} Premier Service (${code})`;
    res.json({
      found: true,
      bill: {
        provider,
        bill_type,
        amount,
        customer_code: code,
        due_date: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      },
    });
  });

  router.post('/bills', (req: Request, res: Response) => {
    const { provider, bill_type, amount, due_date, customer_code = '', recurring_enabled = 0 } = req.body as {
      provider?: string;
      bill_type?: string;
      amount?: number;
      due_date?: string;
      customer_code?: string;
      recurring_enabled?: number;
    };
    if (!provider?.trim() || !bill_type?.trim() || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: 'Thông tin hóa đơn chưa hợp lệ' });
      return;
    }
    const id = bankUid('bill');
    db.prepare(`
      INSERT INTO banking_bills_demo (id, provider, bill_type, amount, due_date, is_paid, paid_at, customer_code, is_saved, recurring_enabled, recurring_day)
      VALUES (?, ?, ?, ?, ?, 0, '', ?, 1, ?, 15)
    `).run(id, provider.trim(), bill_type.trim(), Math.round(Number(amount)), due_date || new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), customer_code.trim(), recurring_enabled ? 1 : 0);
    res.json(getOverviewPayload());
  });

  router.patch('/bills/:id', (req: Request, res: Response) => {
    const { recurring_enabled, is_saved } = req.body as { recurring_enabled?: number; is_saved?: number };
    if (recurring_enabled !== undefined) {
      db.prepare('UPDATE banking_bills_demo SET recurring_enabled = ? WHERE id = ?').run(recurring_enabled ? 1 : 0, req.params.id);
    }
    if (is_saved !== undefined) {
      db.prepare('UPDATE banking_bills_demo SET is_saved = ? WHERE id = ?').run(is_saved ? 1 : 0, req.params.id);
    }
    res.json(getOverviewPayload());
  });

  router.post('/bills/:id/pay', (req: Request, res: Response) => {
    const { sourceAccountId, sourceCardId, idempotencyKey } = (req.body || {}) as {
      sourceAccountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    };

    const resolvedIdem = (idempotencyKey || '').trim();
    if (resolvedIdem) {
      const existingTx = db
        .prepare('SELECT * FROM banking_transactions_demo WHERE idempotency_key = ? LIMIT 1')
        .get(resolvedIdem) as Record<string, unknown> | undefined;
      if (existingTx) {
        let parsedReceipt = {};
        try {
          parsedReceipt = JSON.parse(String(existingTx.receipt_json || '{}'));
        } catch {
          parsedReceipt = {};
        }
        res.json({ ...getOverviewPayload(), transaction: existingTx, receipt: parsedReceipt, idempotentHit: true });
        return;
      }
    }

    const bill = db.prepare('SELECT * FROM banking_bills_demo WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!bill) {
      res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
      return;
    }
    if (bill.is_paid) {
      res.status(400).json({ error: 'Hóa đơn này đã được thanh toán' });
      return;
    }

    let resolvedSource: ReturnType<typeof resolveUserPaymentSource>;
    try {
      resolvedSource = resolveUserPaymentSource({ sourceAccountId, sourceCardId });
    } catch (err) {
      if (err instanceof BankingHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }

    const acc = resolvedSource.account;
    const srcCard = resolvedSource.card;
    const amt = Number(bill.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: 'Hóa đơn 0đ không cần thanh toán.' });
      return;
    }
    const fee = srcCard ? calculateCardFeeForTx({ card: srcCard, amount: amt, kind: 'bill' }) : 0;
    const totalDebit = amt + fee;

    let cardLimitCheck: { spentTodayBefore: number; todayStr: string } | null = null;
    if (srcCard) {
      try {
        cardLimitCheck = validateCardBeforeSpend({ card: srcCard, amount: amt, fee, kind: 'bill' });
      } catch (err) {
        if (err instanceof CardEngineHttpError) {
          res.status(err.statusCode).json({ error: err.message, code: err.code });
          return;
        }
        throw err;
      }
    }

    if (Number(acc.available_balance ?? acc.balance) < totalDebit) {
      res.status(400).json({ error: 'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.' });
      return;
    }
    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();
    const cat = inferSpendingCategory(`${String(bill.bill_type)} ${String(bill.provider)}`);
    const billRecipientAcc = String(bill.customer_code || bill.id);
    const billSig = signReceiptPayload({
      txId,
      refCode,
      amount: amt,
      fee,
      totalAmount: totalDebit,
      senderAccount: String(acc.account_number),
      recipientAccount: billRecipientAcc,
      createdAt: now,
      status: 'Thành công',
    });
    const receipt: Record<string, unknown> = {
      txId,
      template: 'bill' as BillTemplateType,
      refCode,
      channel: srcCard ? `Thanh toán hóa đơn · Thẻ •••• ${resolvedSource.sourceCardLast4}` : 'Thanh toán hóa đơn',
      bankName: String(bill.provider),
      accountNumber: billRecipientAcc,
      senderName: String(acc.holder_name),
      senderAccount: String(acc.account_number),
      sourceAccountId: String(acc.id),
      sourceAccountNickname: String(acc.nickname || acc.account_type || ''),
      sourceCardId: resolvedSource.sourceCardId,
      sourceCardLast4: resolvedSource.sourceCardLast4,
      sourceCardNickname: srcCard ? String(srcCard.card_nickname || srcCard.card_name || '') : '',
      recipientName: String(bill.provider),
      recipientAccount: billRecipientAcc,
      amount: amt,
      fee,
      totalAmount: totalDebit,
      note: `Thanh toán ${String(bill.bill_type)} · Mã KH ${String(bill.customer_code || '-')}`,
      createdAt: now,
      status: 'Thành công',
      signature: billSig,
    };

    let cardPostEffects = { cashbackAmount: 0, pointsEarned: 0 };

    const run = db.transaction(() => {
      const freshBill = db.prepare('SELECT is_paid FROM banking_bills_demo WHERE id = ?').get(String(bill.id)) as { is_paid: number } | undefined;
      if (freshBill?.is_paid) {
        throw new BankingHttpError(400, 'Hóa đơn này đã được thanh toán');
      }
      const freshAcc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get(String(acc.id)) as
        | Record<string, unknown>
        | undefined;
      if (!freshAcc || Number(freshAcc.available_balance ?? freshAcc.balance ?? 0) < totalDebit) {
        throw new BankingHttpError(400, 'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.');
      }
      const nextBal = Number(freshAcc.balance || 0) - totalDebit;
      const nextAvail = Number(freshAcc.available_balance ?? freshAcc.balance ?? 0) - totalDebit;

      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(nextBal, nextAvail, String(acc.id));
      if (srcCard && cardLimitCheck) {
        cardPostEffects = applyCardPostSpendEffectsInTx({
          card: srcCard,
          acc: freshAcc,
          txId,
          baseAmount: amt,
          totalDebit,
          spentTodayBefore: cardLimitCheck.spentTodayBefore,
          todayStr: cardLimitCheck.todayStr,
          merchant: String(bill.provider),
          category: cat,
          kind: 'bill',
          now,
        });
        if (cardPostEffects.pointsEarned > 0 || cardPostEffects.cashbackAmount > 0) {
          receipt.pointsEarned = cardPostEffects.pointsEarned;
          receipt.cashbackAmount = cardPostEffects.cashbackAmount;
        }
      }
      db.prepare('UPDATE banking_bills_demo SET is_paid = 1, paid_at = ? WHERE id = ?').run(now, String(bill.id));
      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
          receipt_json, bill_template, sender_name, sender_account, receipt_sig, idempotency_key,
          source_card_id, source_card_last4
        ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bill', ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        String(acc.id),
        amt,
        String(bill.provider),
        String(receipt.note),
        now,
        cat,
        String(receipt.channel),
        String(bill.provider),
        String(receipt.accountNumber),
        fee,
        totalDebit,
        nextBal,
        refCode,
        JSON.stringify(receipt),
        String(receipt.senderName),
        String(receipt.senderAccount),
        billSig,
        resolvedIdem,
        resolvedSource.sourceCardId,
        resolvedSource.sourceCardLast4
      );
      pushBankNotification('bill', `Thanh toán ${String(bill.bill_type)}`, `-${formatVndServer(totalDebit)} tới ${String(bill.provider)}`, -totalDebit, txId);
    });
    try {
      run();
    } catch (err) {
      if (err instanceof BankingHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
    res.json({
      ...getOverviewPayload(),
      transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId),
      receipt,
      cashbackEarned: cardPostEffects.cashbackAmount,
      pointsEarned: cardPostEffects.pointsEarned,
    });
  });

  // Pay AI character's own recurring bill (from AI character's account OR user pays for AI)
  router.post('/ai-bills/:id/pay', (req: Request, res: Response) => {
    const { payer = 'ai' } = req.body as { payer?: 'ai' | 'user' };
    const aiBill = db.prepare('SELECT * FROM banking_ai_bills WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!aiBill) {
      res.status(404).json({ error: 'Không tìm thấy hóa đơn AI' });
      return;
    }
    if (aiBill.is_paid) {
      res.status(400).json({ error: 'Hóa đơn đã thanh toán' });
      return;
    }
    const amt = Number(aiBill.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: 'Hóa đơn 0đ không thể thực hiện thanh toán.' });
      return;
    }
    const charId = String(aiBill.character_id);
    ensureAiCharacterBankAccount(db, charId);
    const payerAcc =
      payer === 'user'
        ? (db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC LIMIT 1").get() as Record<string, unknown>)
        : (db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?").get(charId) as Record<string, unknown>);

    if (!payerAcc || Number(payerAcc.available_balance ?? payerAcc.balance) < amt) {
      res.status(400).json({ error: 'Số dư không đủ để thanh toán hóa đơn này' });
      return;
    }
    const newBal = Number(payerAcc.balance) - amt;
    const newAvail = Number(payerAcc.available_balance ?? payerAcc.balance) - amt;
    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();

    const run = db.transaction(() => {
      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(payerAcc.id));
      db.prepare('UPDATE banking_ai_bills SET is_paid = 1 WHERE id = ?').run(String(aiBill.id));
      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template, is_ai_tx
        ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, ?, 'Hóa đơn định kỳ AI', 'Hikari Bank', ?, 0, ?, ?, 'ai_tx', 1)
      `).run(txId, String(payerAcc.id), amt, String(aiBill.title), `Thanh toán ${String(aiBill.title)}`, now, inferSpendingCategory(String(aiBill.bill_type)), String(aiBill.id), newBal, refCode);
    });
    run();
    res.json(getOverviewPayload());
  });

  // 12. Phone Top-up (Two-way synced with Anime Telecom SIMs)
  router.post('/topup', (req: Request, res: Response) => {
    const {
      simId,
      carrierId,
      carrier,
      phone,
      amount = 100000,
      sourceAccountId,
      sourceCardId,
      idempotencyKey,
    } = req.body as {
      simId?: string;
      carrierId?: string;
      carrier?: string;
      phone?: string;
      amount?: number;
      sourceAccountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    };

    try {
      const resolvedCarrierId =
        carrierId ||
        (carrier && ['hoshi', 'sakura', 'akuma', 'aoi', 'tsuki'].includes(carrier.toLowerCase())
          ? carrier.toLowerCase()
          : undefined);
      const result = topupUserSim({
        simId,
        phone,
        carrierId: resolvedCarrierId,
        amount,
        sourceAccountId,
        sourceCardId,
        idempotencyKey,
        origin: 'banking',
      });
      res.json({
        ...getOverviewPayload(),
        telecomOverview: result,
        transaction: result.transaction,
        telecomTransaction: result.telecomTransaction,
        receipt: result.receipt,
        idempotentHit: Boolean((result as { idempotentHit?: boolean }).idempotentHit),
      });
    } catch (err) {
      if (err instanceof TelecomHttpError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code, ...(err.extra || {}) });
        return;
      }
      if (err instanceof BankingHttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // 13. Investments Trade (Buy / Sell)
  router.post('/investments/trade', (req: Request, res: Response) => {
    const { asset_code = 'PBFUND', side = 'buy', amount = 500000 } = req.body as {
      asset_code?: string;
      side?: 'buy' | 'sell';
      amount?: number;
    };
    const asset = INVESTMENT_ASSETS[asset_code];
    if (!asset) {
      res.status(400).json({ error: 'Mã tài sản đầu tư không hợp lệ' });
      return;
    }
    const amt = Math.round(Number(amount || 0));
    if (amt < 100000) {
      res.status(400).json({ error: 'Giá trị giao dịch đầu tư tối thiểu 100.000 VNĐ' });
      return;
    }
    const acc = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = 'bank_1'").get() as Record<string, unknown>;
    const existing = db.prepare("SELECT * FROM banking_investments WHERE asset_code = ? AND status = 'active' LIMIT 1").get(asset_code) as
      | Record<string, unknown>
      | undefined;
    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();

    if (side === 'buy') {
      if (Number(acc.available_balance ?? acc.balance) < amt) {
        res.status(400).json({ error: 'Số dư khả dụng không đủ để đặt lệnh mua' });
        return;
      }
      const addUnits = Number((amt / asset.current_price).toFixed(4));
      const newBal = Number(acc.balance) - amt;
      const newAvail = Number(acc.available_balance ?? acc.balance) - amt;
      const run = db.transaction(() => {
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, 'bank_1');
        if (existing) {
          const totalUnits = Number(existing.units) + addUnits;
          const totalInvested = Number(existing.invested_amount) + amt;
          const avgPrice = Math.round(totalInvested / totalUnits);
          db.prepare('UPDATE banking_investments SET units = ?, avg_buy_price = ?, current_price = ?, invested_amount = ?, updated_at = ? WHERE id = ?').run(
            totalUnits,
            avgPrice,
            asset.current_price,
            totalInvested,
            now,
            String(existing.id)
          );
        } else {
          db.prepare(`
            INSERT INTO banking_investments (id, account_id, asset_code, asset_name, asset_type, units, avg_buy_price, current_price, invested_amount, status, updated_at)
            VALUES (?, 'bank_1', ?, ?, ?, ?, ?, ?, ?, 'active', ?)
          `).run(bankUid('inv'), asset_code, asset.asset_name, asset.asset_type, addUnits, asset.current_price, asset.current_price, amt, now);
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template
          ) VALUES (?, 'bank_1', 'expense', ?, ?, ?, 'Thành công', ?, 'Đầu tư', 'Đầu tư Premier', 'PhoneBank Invest', ?, 0, ?, ?, 'shopping')
        `).run(txId, amt, asset.asset_name, `Mua ${addUnits} đơn vị ${asset_code}`, now, asset_code, newBal, refCode);
        pushBankNotification('system', `Khớp lệnh mua ${asset_code}`, `-${formatVndServer(amt)} (${addUnits} đơn vị)`, -amt, txId);
      });
      run();
    } else {
      if (!existing) {
        res.status(400).json({ error: 'Bạn chưa sở hữu tài sản này để bán' });
        return;
      }
      const curVal = Math.round(Number(existing.units) * asset.current_price);
      const sellVal = Math.min(amt, curVal);
      const sellUnits = Number((sellVal / asset.current_price).toFixed(4));
      const remUnits = Math.max(0, Number((Number(existing.units) - sellUnits).toFixed(4)));
      const newBal = Number(acc.balance) + sellVal;
      const newAvail = Number(acc.available_balance ?? acc.balance) + sellVal;
      const run = db.transaction(() => {
        db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, 'bank_1');
        if (remUnits <= 0.0001) {
          db.prepare("UPDATE banking_investments SET units = 0, invested_amount = 0, status = 'closed', updated_at = ? WHERE id = ?").run(now, String(existing.id));
        } else {
          const ratio = remUnits / Number(existing.units);
          db.prepare('UPDATE banking_investments SET units = ?, invested_amount = ?, updated_at = ? WHERE id = ?').run(
            remUnits,
            Math.round(Number(existing.invested_amount) * ratio),
            now,
            String(existing.id)
          );
        }
        db.prepare(`
          INSERT INTO banking_transactions_demo (
            id, account_id, tx_type, amount, counterparty, note, status, created_at,
            category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template
          ) VALUES (?, 'bank_1', 'income', ?, ?, ?, 'Thành công', ?, 'Đầu tư', 'Đầu tư Premier', 'PhoneBank Invest', ?, 0, ?, ?, 'receive')
        `).run(txId, sellVal, asset.asset_name, `Bán ${sellUnits} đơn vị ${asset_code}`, now, asset_code, newBal, refCode);
        pushBankNotification('receive', `Khớp lệnh bán ${asset_code}`, `+${formatVndServer(sellVal)} về tài khoản`, sellVal, txId);
      });
      run();
    }
    res.json(getOverviewPayload());
  });

  // 14. Savings Goals & Budgets & Expense Categories
  router.post('/goals', (req: Request, res: Response) => {
    const { title, target_amount, deadline, category = 'Khác' } = req.body as {
      title?: string;
      target_amount?: number;
      deadline?: string;
      category?: string;
    };
    if (!title?.trim() || !target_amount || Number(target_amount) < 100000) {
      res.status(400).json({ error: 'Tên mục tiêu hoặc số tiền đích không hợp lệ' });
      return;
    }
    db.prepare(`
      INSERT INTO banking_savings_goals (id, account_id, title, target_amount, current_amount, deadline, category, auto_save_amount, status, created_at)
      VALUES (?, 'bank_1', ?, ?, 0, ?, ?, 0, 'active', ?)
    `).run(bankUid('goal'), title.trim(), Math.round(Number(target_amount)), deadline || '2027-12-31', category, new Date().toISOString());
    res.json(getOverviewPayload());
  });

  router.post('/goals/:id/contribute', (req: Request, res: Response) => {
    const { amount } = req.body as { amount?: number };
    const amt = Math.round(Number(amount || 0));
    const goal = db.prepare('SELECT * FROM banking_savings_goals WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!goal || amt < 50000) {
      res.status(400).json({ error: 'Số tiền góp mục tiêu tối thiểu 50.000 VNĐ' });
      return;
    }
    const acc = db.prepare("SELECT * FROM banking_accounts_demo WHERE id = 'bank_1'").get() as Record<string, unknown>;
    if (Number(acc.available_balance ?? acc.balance) < amt) {
      res.status(400).json({ error: 'Số dư khả dụng không đủ' });
      return;
    }
    const newBal = Number(acc.balance) - amt;
    const newAvail = Number(acc.available_balance ?? acc.balance) - amt;
    const nextAmt = Number(goal.current_amount || 0) + amt;
    const nextStatus = nextAmt >= Number(goal.target_amount) ? 'completed' : 'active';
    const now = new Date().toISOString();
    const txId = bankUid('tx');
    const refCode = genBankRefCode();

    const run = db.transaction(() => {
      db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, 'bank_1');
      db.prepare('UPDATE banking_savings_goals SET current_amount = ?, status = ? WHERE id = ?').run(nextAmt, nextStatus, String(goal.id));
      db.prepare(`
        INSERT INTO banking_transactions_demo (
          id, account_id, tx_type, amount, counterparty, note, status, created_at,
          category, channel, bank_name, account_number, fee, balance_after, ref_code, bill_template
        ) VALUES (?, 'bank_1', 'expense', ?, ?, ?, 'Thành công', ?, 'Tiết kiệm', 'Mục tiêu tài chính', 'PhoneBank Goals', ?, 0, ?, ?, 'savings_open')
      `).run(txId, amt, String(goal.title), `Góp quỹ mục tiêu: ${String(goal.title)}`, now, String(goal.id).toUpperCase(), newBal, refCode);
    });
    run();
    res.json(getOverviewPayload());
  });

  router.delete('/goals/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM banking_savings_goals WHERE id = ?').run(req.params.id);
    res.json(getOverviewPayload());
  });

  router.patch('/transactions/:id/category', (req: Request, res: Response) => {
    const { category } = req.body as { category?: string };
    if (category) {
      db.prepare('UPDATE banking_transactions_demo SET category = ? WHERE id = ?').run(category, req.params.id);
    }
    res.json(getOverviewPayload());
  });

  router.post('/budgets', (req: Request, res: Response) => {
    const { category, monthly_limit, alert_threshold = 80 } = req.body as {
      category?: string;
      monthly_limit?: number;
      alert_threshold?: number;
    };
    if (!category || !monthly_limit || Number(monthly_limit) <= 0) {
      res.status(400).json({ error: 'Thông tin ngân sách chưa hợp lệ' });
      return;
    }
    db.prepare(`
      INSERT INTO banking_budgets (id, category, monthly_limit, alert_threshold)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit, alert_threshold = excluded.alert_threshold
    `).run(bankUid('bud'), category, Math.round(Number(monthly_limit)), Number(alert_threshold));
    res.json(getOverviewPayload());
  });

  // 15. QR Banking & Payment Requests (supports both HIKARI_OS and legacy PHONEBANK QR)
  router.post('/qr/validate', (req: Request, res: Response) => {
    const { payload = '' } = req.body as { payload?: string };
    const clean = payload.trim();
    if (!clean.startsWith('HIKARI_OS|') && !clean.startsWith('PHONEBANK|')) {
      res.status(400).json({ valid: false, error: 'Mã QR không đúng định dạng mô phỏng Hikari Bank hợp lệ' });
      return;
    }
    const parts = clean.split('|');
    const accountNumber = parts[1] || '';
    const digits = normalizeAccountDigits(accountNumber);
    if (digits.length < 6) {
      res.status(400).json({ valid: false, error: 'Mã QR chứa số tài khoản không hợp lệ' });
      return;
    }

    let recipientName = '';
    let amount = 0;
    let note = '';
    const part2IsNum = parts[2] !== undefined && /^\d+$/.test(parts[2].trim());
    if (part2IsNum && parts.length <= 4) {
      amount = Math.max(0, Math.round(Number(parts[2] || 0)));
      note = parts[3] || '';
    } else {
      recipientName = parts[2] || '';
      amount = parts[3] ? Math.max(0, Math.round(Number(parts[3]))) : 0;
      note = parts[4] || '';
    }

    const allAccounts = db.prepare('SELECT account_number, holder_name, character_id, owner_type FROM banking_accounts_demo').all() as Array<{
      account_number: string;
      holder_name: string;
      character_id?: string;
      owner_type?: string;
    }>;
    const matched = allAccounts.find((a) => normalizeAccountDigits(a.account_number) === digits);
    if (!recipientName && matched) {
      recipientName = matched.holder_name.toUpperCase();
    }

    res.json({
      valid: true,
      accountNumber,
      recipientName: recipientName || 'NGƯỜI NHẬN HIKARI BANK',
      bankCode: 'HIKARI',
      bankName: 'Hikari Bank',
      isAi: matched?.owner_type === 'ai',
      characterId: matched?.character_id || '',
      amount,
      note,
    });
  });

  router.post('/payment-requests', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Tính năng tạo yêu cầu chuyển tiền đã bị tắt.',
    });
  });

  // 16. Notifications
  router.patch('/notifications/read-all', (_req: Request, res: Response) => {
    db.prepare('UPDATE banking_notifications SET is_read = 1').run();
    res.json(getOverviewPayload());
  });

  router.patch('/notifications/:id/read', (req: Request, res: Response) => {
    db.prepare('UPDATE banking_notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json(getOverviewPayload());
  });

  // 17. Customer Profile, Security, App Lock & Support Center
  router.patch('/profile', (req: Request, res: Response) => {
    const { holder_name, avatar, dob, phone, email, address } = req.body as {
      holder_name?: string;
      avatar?: string;
      dob?: string;
      phone?: string;
      email?: string;
      address?: string;
    };
    if (holder_name?.trim()) {
      const cleanName = holder_name.trim();
      db.prepare("UPDATE banking_accounts_demo SET holder_name = ? WHERE owner_type = 'user'").run(cleanName);
      db.prepare(
        "UPDATE banking_cards SET holder_name = ? WHERE account_id IN (SELECT id FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user') OR account_id = '' OR account_id IS NULL"
      ).run(cleanName.toUpperCase());
    }
    if (avatar !== undefined) {
      db.prepare("UPDATE banking_accounts_demo SET avatar = ? WHERE id = 'bank_1'").run(avatar);
    }
    const secSets: string[] = [];
    const secVals: unknown[] = [];
    if (dob !== undefined) {
      secSets.push('dob = ?');
      secVals.push(dob);
    }
    if (phone !== undefined) {
      secSets.push('phone = ?');
      secVals.push(phone);
    }
    if (email !== undefined) {
      secSets.push('email = ?');
      secVals.push(email);
    }
    if (address !== undefined) {
      secSets.push('address = ?');
      secVals.push(address);
    }
    if (secSets.length > 0) {
      db.prepare(`UPDATE banking_security_state SET ${secSets.join(', ')}`).run(...secVals);
    }
    res.json(getOverviewPayload());
  });

  router.post('/pin', (req: Request, res: Response) => {
    const { pin = '' } = req.body as { pin?: string };
    if (!/^\d{4,6}$/.test(pin)) {
      res.status(400).json({ error: 'Mã PIN giao dịch cần 4–6 chữ số' });
      return;
    }
    db.prepare("UPDATE banking_accounts_demo SET pin_hash = ? WHERE owner_type = 'user'").run(hashSecret(pin));
    pushBankNotification('security', 'Cập nhật mã PIN SmartOTP', 'Mã PIN giao dịch PhoneBank Premier đã được thay đổi.', 0, '');
    res.json(getOverviewPayload());
  });

  router.post('/security/password', (req: Request, res: Response) => {
    const { newPassword = '' } = req.body as { newPassword?: string };
    if (newPassword.trim().length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 6 ký tự' });
      return;
    }
    db.prepare('UPDATE banking_security_state SET login_password_hash = ?').run(hashSecret(newPassword.trim()));
    pushBankNotification('security', 'Đổi mật khẩu đăng nhập thành công', 'Mật khẩu bảo vệ ứng dụng PhoneBank đã được cập nhật.', 0, '');
    res.json(getOverviewPayload());
  });

  router.post('/security/lock', (_req: Request, res: Response) => {
    db.prepare('UPDATE banking_security_state SET is_logged_out = 1').run();
    res.json(getOverviewPayload());
  });

  router.post('/security/unlock', (req: Request, res: Response) => {
    const { secret = '', method = 'pin' } = req.body as { secret?: string; method?: 'pin' | 'password' | 'biometric' };
    const acc = db.prepare("SELECT pin_hash FROM banking_accounts_demo WHERE id = 'bank_1'").get() as { pin_hash?: string } | undefined;
    const sec = db.prepare('SELECT login_password_hash, biometric_enabled FROM banking_security_state LIMIT 1').get() as
      | { login_password_hash?: string; biometric_enabled?: number }
      | undefined;

    if (method === 'biometric') {
      if (!sec?.biometric_enabled) {
        res.status(400).json({ error: 'Sinh trắc học chưa được bật' });
        return;
      }
      db.prepare('UPDATE banking_security_state SET is_logged_out = 0, failed_pin_count = 0').run();
      res.json(getOverviewPayload());
      return;
    }

    if (method === 'pin') {
      if (!acc?.pin_hash) {
        // If user hasn't set custom PIN yet, accept 123456 or any 6-digit demo unlock
        if (secret === '123456' || /^\d{4,6}$/.test(secret)) {
          db.prepare('UPDATE banking_security_state SET is_logged_out = 0, failed_pin_count = 0').run();
          res.json(getOverviewPayload());
          return;
        }
      } else if (hashSecret(secret) === acc.pin_hash) {
        db.prepare('UPDATE banking_security_state SET is_logged_out = 0, failed_pin_count = 0').run();
        res.json(getOverviewPayload());
        return;
      }
      db.prepare('UPDATE banking_security_state SET failed_pin_count = COALESCE(failed_pin_count, 0) + 1').run();
      res.status(401).json({ error: 'Mã PIN mở khóa không chính xác' });
      return;
    }

    if (sec?.login_password_hash && hashSecret(secret) === sec.login_password_hash) {
      db.prepare('UPDATE banking_security_state SET is_logged_out = 0, failed_pin_count = 0').run();
      res.json(getOverviewPayload());
      return;
    }
    res.status(401).json({ error: 'Mật khẩu đăng nhập không chính xác' });
  });

  router.patch('/security/settings', (req: Request, res: Response) => {
    const { biometric_enabled, notif_balance, notif_security, notif_promo, unusual_alert_active, app_lock_enabled, removeDeviceId } = req.body as {
      biometric_enabled?: number;
      notif_balance?: number;
      notif_security?: number;
      notif_promo?: number;
      unusual_alert_active?: number;
      app_lock_enabled?: number;
      removeDeviceId?: string;
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (biometric_enabled !== undefined) {
      sets.push('biometric_enabled = ?');
      vals.push(biometric_enabled ? 1 : 0);
    }
    if (notif_balance !== undefined) {
      sets.push('notif_balance = ?');
      vals.push(notif_balance ? 1 : 0);
    }
    if (notif_security !== undefined) {
      sets.push('notif_security = ?');
      vals.push(notif_security ? 1 : 0);
    }
    if (notif_promo !== undefined) {
      sets.push('notif_promo = ?');
      vals.push(notif_promo ? 1 : 0);
    }
    if (unusual_alert_active !== undefined) {
      sets.push('unusual_alert_active = ?');
      vals.push(unusual_alert_active ? 1 : 0);
    }
    if (app_lock_enabled !== undefined) {
      sets.push('app_lock_enabled = ?');
      vals.push(app_lock_enabled ? 1 : 0);
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE banking_security_state SET ${sets.join(', ')}`).run(...vals);
    }
    if (removeDeviceId) {
      const sec = db.prepare('SELECT devices_json FROM banking_security_state LIMIT 1').get() as { devices_json?: string } | undefined;
      try {
        const list = JSON.parse(sec?.devices_json || '[]') as Array<{ id: string; current?: boolean }>;
        const next = list.filter((d) => d.id !== removeDeviceId || d.current);
        db.prepare('UPDATE banking_security_state SET devices_json = ?').run(JSON.stringify(next));
      } catch {
        // ignore
      }
    }
    res.json(getOverviewPayload());
  });

  // 18. Support Center (Tickets & Live AI Support Chat)
  router.post('/support/tickets', (req: Request, res: Response) => {
    const { category = 'Hỗ trợ giao dịch', subject, description, tx_ref = '' } = req.body as {
      category?: string;
      subject?: string;
      description?: string;
      tx_ref?: string;
    };
    if (!subject?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập tiêu đề và mô tả vấn đề' });
      return;
    }
    const now = new Date().toISOString();
    const id = bankUid('tkt');
    const autoReply = tx_ref
      ? `PhoneBank CSKH đã ghi nhận mã tra soát ${tx_ref}. Trạng thái đối soát đang được kiểm tra tự động và sẽ cập nhật trong 2 giờ.`
      : 'PhoneBank CSKH đã tiếp nhận yêu cầu hỗ trợ của bạn. Bộ phận nghiệp vụ đang xử lý.';

    db.prepare(`
      INSERT INTO banking_support_tickets (id, category, subject, description, tx_ref, status, admin_reply, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?)
    `).run(id, category, subject.trim(), description.trim(), tx_ref.trim(), autoReply, now, now);
    pushBankNotification('system', 'Đã tiếp nhận yêu cầu hỗ trợ', `${subject.trim()} (${id.toUpperCase()})`, 0, '');
    res.json(getOverviewPayload());
  });

  router.post('/support/ai-chat', async (req: Request, res: Response) => {
    try {
      const { question = '' } = req.body as { question?: string };
      if (!question.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập nội dung câu hỏi' });
        return;
      }
      const overview = getOverviewPayload();
      const acc = overview.account as Record<string, unknown> | null;
      const stats = overview.computedStats;
      const recentTxs = (overview.transactions as Array<Record<string, unknown>>).slice(0, 8).map((t) => ({
        ref_code: String(t.ref_code || ''),
        counterparty: String(t.counterparty || ''),
        amount: Number(t.amount || 0),
        tx_type: String(t.tx_type || ''),
        status: String(t.status || ''),
        created_at: String(t.created_at || ''),
      }));

      const reply = await generateBankingSupportReply(question.trim(), {
        holderName: String(acc?.holder_name || 'Khách hàng'),
        tierName: stats.tierName,
        availableBalance: stats.availableBalance,
        totalSavings: stats.totalSavings,
        totalDebt: stats.totalDebt,
        recentTxs,
      });
      res.json({ reply });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Trợ lý CSKH tạm thời bận' });
    }
  });

  // 19. Verify Simulated Transaction & Persist High-Res Bill PNG
  router.get('/verify-tx/:refOrId', (req: Request, res: Response) => {
    const key = String(req.params.refOrId || '').trim();
    if (!key) {
      res.status(400).json({ valid: false, simulated: true, signatureVerified: false, error: 'Thiếu mã giao dịch cần kiểm tra' });
      return;
    }
    const tx = db
      .prepare('SELECT * FROM banking_transactions_demo WHERE id = ? OR UPPER(ref_code) = UPPER(?) ORDER BY created_at DESC LIMIT 1')
      .get(key, key) as Record<string, unknown> | undefined;

    if (!tx) {
      res.status(404).json({ valid: false, simulated: true, signatureVerified: false, error: 'Không tìm thấy giao dịch trong hệ thống PhoneBank' });
      return;
    }

    let receipt: Record<string, unknown> = {};
    try {
      receipt = JSON.parse(String(tx.receipt_json || '{}')) as Record<string, unknown>;
    } catch {
      receipt = {};
    }

    const storedSig = String(tx.receipt_sig || receipt.signature || '');
    let signatureVerified = false;
    if (storedSig) {
      const feeVal = Number(receipt.fee ?? tx.fee ?? 0);
      const amtVal = Number(receipt.amount ?? tx.amount ?? 0);
      const totalVal = Number(receipt.totalAmount ?? amtVal + feeVal);
      signatureVerified = verifyLegacyOrV3Signature(storedSig, {
        txId: String(receipt.txId || tx.id),
        refCode: String(receipt.refCode || tx.ref_code || ''),
        amount: amtVal,
        fee: feeVal,
        totalAmount: totalVal,
        senderAccount: String(receipt.senderAccount || tx.sender_account || ''),
        recipientAccount: String(receipt.recipientAccount || tx.account_number || ''),
        createdAt: String(receipt.createdAt || tx.created_at || ''),
        status: String(receipt.status || tx.status || ''),
      });
    } else {
      signatureVerified = Boolean(tx.ref_code && tx.status);
    }

    const isFailedOrPending = /thất bại|đang xử lý/i.test(String(tx.status || ''));
    res.json({
      valid: !isFailedOrPending,
      simulated: true,
      signatureVerified,
      transaction: tx,
      receipt,
    });
  });

  router.post('/transactions/:id/bill-image', (req: Request, res: Response) => {
    const { dataUrl = '' } = req.body as { dataUrl?: string };
    if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 4_500_000) {
      res.status(400).json({ error: 'Ảnh biên lai PNG không hợp lệ hoặc vượt quá dung lượng cho phép' });
      return;
    }
    const tx = db.prepare('SELECT id, linked_ref, status FROM banking_transactions_demo WHERE id = ?').get(req.params.id) as
      | { id: string; linked_ref?: string; status?: string }
      | undefined;
    if (!tx) {
      res.status(404).json({ error: 'Không tìm thấy giao dịch' });
      return;
    }
    if (/thất bại|đang xử lý/i.test(String(tx.status || ''))) {
      res.status(400).json({ error: 'Không thể lưu biên lai thành công cho giao dịch đang xử lý hoặc thất bại' });
      return;
    }
    db.prepare('UPDATE banking_transactions_demo SET bill_image_url = ? WHERE id = ?').run(dataUrl, tx.id);
    db.prepare('UPDATE banking_receipts SET image_reference = ? WHERE transaction_id = ?').run(`mem:${tx.id}`, tx.id);
    if (tx.linked_ref) {
      db.prepare('UPDATE banking_transactions_demo SET bill_image_url = ? WHERE id = ?').run(dataUrl, tx.linked_ref);
    }
    res.json({ ok: true, id: tx.id });
  });

  // 20. Onboarding, UI Preferences & UI-Only Reset
  router.post('/onboarding', (req: Request, res: Response) => {
    const { holder_name, avatar } = req.body as { holder_name?: string; avatar?: string };
    const code = `HK-CID-${String(Math.floor(100000 + Math.random() * 899999))}`;
    if (holder_name?.trim()) {
      const cleanName = holder_name.trim();
      db.prepare("UPDATE banking_accounts_demo SET holder_name = ? WHERE owner_type = 'user'").run(cleanName);
      db.prepare(
        "UPDATE banking_cards SET holder_name = ? WHERE account_id IN (SELECT id FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user') OR account_id = '' OR account_id IS NULL"
      ).run(cleanName.toUpperCase());
    }
    if (avatar) {
      db.prepare("UPDATE banking_accounts_demo SET avatar = ? WHERE owner_type = 'user'").run(avatar);
    }
    db.prepare('UPDATE banking_security_state SET customer_code = ?, onboarding_completed = 1').run(code);
    pushBankNotification('system', 'Chào mừng đến với Hikari Bank', `Hồ sơ khách hàng ${code} đã sẵn sàng.`, 0, '');
    res.json(getOverviewPayload());
  });

  router.patch('/preferences', (req: Request, res: Response) => {
    const {
      theme_id,
      assistant_char_id,
      assistant_outfit,
      assistant_expression,
      unlock_outfit,
      dashboard_wallpaper,
      inactivity_lock_sec,
      privacy_hide_balance,
      hikari_banner_dismissed,
      onboarding_completed,
    } = req.body as {
      theme_id?: string;
      assistant_char_id?: string;
      assistant_outfit?: string;
      assistant_expression?: string;
      unlock_outfit?: string;
      dashboard_wallpaper?: string;
      inactivity_lock_sec?: number;
      privacy_hide_balance?: boolean | number;
      hikari_banner_dismissed?: boolean | number;
      onboarding_completed?: boolean | number;
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (theme_id) {
      sets.push('theme_id = ?');
      vals.push(theme_id);
    }
    if (assistant_char_id) {
      sets.push('assistant_char_id = ?');
      vals.push(assistant_char_id);
    }
    if (assistant_outfit) {
      sets.push('assistant_outfit = ?');
      vals.push(assistant_outfit);
    }
    if (assistant_expression) {
      sets.push('assistant_expression = ?');
      vals.push(assistant_expression);
    }
    if (dashboard_wallpaper) {
      sets.push('dashboard_wallpaper = ?');
      vals.push(dashboard_wallpaper);
    }
    if (inactivity_lock_sec !== undefined) {
      const secVal = Math.round(Number(inactivity_lock_sec));
      sets.push('inactivity_lock_sec = ?');
      vals.push(secVal <= 0 ? 0 : Math.max(30, Math.min(3600, secVal)));
    }
    if (privacy_hide_balance !== undefined) {
      sets.push('privacy_hide_balance = ?');
      vals.push(privacy_hide_balance ? 1 : 0);
    }
    if (hikari_banner_dismissed !== undefined) {
      sets.push('hikari_banner_dismissed = ?');
      vals.push(hikari_banner_dismissed ? 1 : 0);
    }
    if (onboarding_completed !== undefined) {
      sets.push('onboarding_completed = ?');
      vals.push(onboarding_completed ? 1 : 0);
    }

    if (unlock_outfit) {
      const row = db.prepare('SELECT unlocked_outfits_json FROM banking_security_state LIMIT 1').get() as { unlocked_outfits_json?: string } | undefined;
      let list = ['teller_classic', 'spring_kimono', 'premier_suit'];
      try {
        const parsed = JSON.parse(row?.unlocked_outfits_json || '[]');
        if (Array.isArray(parsed)) list = parsed.map(String);
      } catch {
        // ignore
      }
      if (!list.includes(unlock_outfit)) list.push(unlock_outfit);
      sets.push('unlocked_outfits_json = ?');
      vals.push(JSON.stringify(list));
    }

    if (sets.length > 0) {
      db.prepare(`UPDATE banking_security_state SET ${sets.join(', ')}`).run(...vals);
    }
    res.json(getOverviewPayload());
  });

  router.post('/reset-ui', (_req: Request, res: Response) => {
    db.prepare(`
      UPDATE banking_security_state
      SET theme_id = 'coral',
          assistant_char_id = 'hikari_chan',
          assistant_outfit = 'teller_classic',
          assistant_expression = 'cheerful',
          dashboard_wallpaper = 'skyline',
          inactivity_lock_sec = 180,
          privacy_hide_balance = 0,
          hikari_banner_dismissed = 0
    `).run();
    res.json(getOverviewPayload());
  });

  // 21. Reset Demo
  router.post('/reset-demo', (_req: Request, res: Response) => {
    seedBankingDemoData(db, true);
    res.json(getOverviewPayload());
  });

  return router;
}
