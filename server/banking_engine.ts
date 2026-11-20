import crypto from 'crypto';
import { db } from './db.ts';
import { AI_BANK_PROFILES, ensureAiCharacterBankAccount } from './db_banking.ts';
import {
  applyCardPostSpendEffectsInTx,
  calculateCardFeeForTx,
  CardEngineHttpError,
  computeCardStatsForRow,
  getCardSystemCatalogData,
  validateCardBeforeSpend,
} from './card_engine.ts';

export type BillTemplateType =
  | 'transfer'
  | 'receive'
  | 'topup'
  | 'bill'
  | 'shopping'
  | 'withdraw'
  | 'savings_open'
  | 'savings_settle'
  | 'loan_pay'
  | 'ai_tx'
  | 'refund'
  | 'failed';

export function bankUid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function genBankRefCode(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  for (let i = 0; i < 12; i++) {
    const rand = crypto.randomInt(100000, 999999);
    const candidate = `HK${datePart}${rand}`;
    try {
      const exists = db.prepare('SELECT 1 FROM banking_transactions_demo WHERE ref_code = ? LIMIT 1').get(candidate);
      if (!exists) return candidate;
    } catch {
      return candidate;
    }
  }
  return `HK${datePart}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function writeLedgerAudit(params: {
  operation: string;
  txId?: string;
  accountId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  status?: string;
  detail?: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO banking_ledger_audit (id, operation, tx_id, account_id, delta, balance_before, balance_after, status, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bankUid('audit'),
      params.operation,
      params.txId || '',
      params.accountId,
      Math.round(params.delta),
      Math.round(params.balanceBefore),
      Math.round(params.balanceAfter),
      params.status || 'ok',
      params.detail || '',
      new Date().toISOString()
    );
  } catch {
    // non-fatal
  }
}

export function recordReceiptRecord(params: {
  transactionId: string;
  receiptType: string;
  imageReference?: string;
}): string {
  const receiptId = bankUid('rcpt');
  try {
    db.prepare(`
      INSERT OR REPLACE INTO banking_receipts (receipt_id, transaction_id, receipt_type, render_version, created_at, image_reference)
      VALUES (?, ?, ?, '3.0', ?, ?)
    `).run(receiptId, params.transactionId, params.receiptType || 'transfer', new Date().toISOString(), params.imageReference || '');
  } catch {
    // non-fatal
  }
  return receiptId;
}

export function maskAccountServer(raw: string): string {
  const s = String(raw || '').trim();
  if (!s || s === '-') return '-';
  if (s.includes('•') || s.includes('XXXX')) return s;
  const digits = s.replace(/[^0-9A-Za-z]/g, '');
  if (digits.length <= 6) return s;
  return `${digits.slice(0, 4)}-••••-${digits.slice(-4)}`;
}

export function signReceiptPayload(payload: {
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

export function verifyLegacyOrV3Signature(
  storedSig: string,
  payload: {
    txId: string;
    refCode: string;
    amount: number;
    fee: number;
    totalAmount: number;
    senderAccount: string;
    recipientAccount: string;
    createdAt: string;
    status: string;
  }
): boolean {
  if (!storedSig) return false;
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
  const v3 = crypto.createHash('sha256').update(`HIKARI_BANK_SIM_V3:${canonical}`).digest('hex').slice(0, 24).toUpperCase();
  const v2 = crypto.createHash('sha256').update(`PHONEBANK_SIM_V2:${canonical}`).digest('hex').slice(0, 24).toUpperCase();
  return storedSig === v3 || storedSig === v2;
}

export function formatVndServer(amount: number): string {
  const rounded = Math.round(Number(amount || 0));
  return `${rounded.toLocaleString('de-DE')} VNĐ`;
}

export function normalizeAccountDigits(raw: string): string {
  return (raw || '').replace(/[^0-9]/g, '');
}

export function inferSpendingCategory(text: string): string {
  const s = (text || '').toLowerCase();
  if (/cà phê|coffee|ăn|uống|highlands|trà|phở|bún|nhà hàng|cơm|bánh|matcha|lẩu/.test(s)) return 'Ăn uống';
  if (/mua|shop|uniqlo|lazada|tiki|mall|áo|quần|giày|ảnh|phim màu|quà/.test(s)) return 'Mua sắm';
  if (/vé|phim|cgv|netflix|spotify|game|giải trí|nhạc|vinyl/.test(s)) return 'Giải trí';
  if (/grab|be|ride|xe|taxi|xăng|tàu|di chuyển|đi lại/.test(s)) return 'Đi lại';
  if (/nhà|thuê|điện|nước|internet|cáp quang|truyền hình|quản lý/.test(s)) return 'Nhà ở';
  if (/học|khóa|sách|trường|academy|giáo dục|học phí/.test(s)) return 'Học tập';
  if (/bệnh viện|thuốc|khám|y tế|viện phí|sức khỏe|bảo hiểm/.test(s)) return 'Sức khỏe';
  if (/du lịch|khách sạn|máy bay|vé tàu|resort|tokyo/.test(s)) return 'Du lịch';
  if (/chuyển|gửi|vay|nợ|trả|chia tiền/.test(s)) return 'Chuyển khoản';
  return 'Khác';
}

export function pushBankNotification(
  notif_type: string,
  title: string,
  body: string,
  amount = 0,
  ref_id = ''
): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO banking_notifications (id, notif_type, title, body, amount, is_read, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(bankUid('bnotif'), notif_type, title, body, amount, ref_id, now);
  db.prepare(`
    INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at)
    VALUES (?, 'banking', 'Hikari Bank', ?, ?, 'banking', ?, 0, 0, ?)
  `).run(bankUid('notif'), title, body, ref_id || 'banking', now);
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTextLines(str: string, maxChars: number, maxLines = 2): string[] {
  const words = String(str || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['-'];
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current ? `${current} ${w}` : w).length <= maxChars) {
      current = current ? `${current} ${w}` : w;
    } else {
      if (current) lines.push(current);
      current = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

const TEMPLATE_META: Record<BillTemplateType, { title: string; accent: string; badge: string; statusText: string }> = {
  transfer: { title: 'BIÊN LAI CHUYỂN TIỀN', accent: '#E14B5A', badge: 'CHUYỂN KHOẢN 24/7', statusText: 'THÀNH CÔNG' },
  receive: { title: 'CHỨNG TỪ NHẬN TIỀN', accent: '#10B981', badge: 'TIỀN VÀO TÀI KHOẢN', statusText: 'THÀNH CÔNG' },
  topup: { title: 'BIÊN LAI NẠP ĐIỆN THOẠI', accent: '#E14B5A', badge: 'TOP-UP VIỄN THÔNG', statusText: 'THÀNH CÔNG' },
  bill: { title: 'HÓA ĐƠN DỊCH VỤ', accent: '#D94352', badge: 'THANH TOÁN HÓA ĐƠN', statusText: 'THÀNH CÔNG' },
  shopping: { title: 'CHỨNG TỪ MUA SẮM', accent: '#C83246', badge: 'THANH TOÁN THẺ / QR', statusText: 'THÀNH CÔNG' },
  withdraw: { title: 'BIÊN LAI RÚT TIỀN', accent: '#1E293B', badge: 'RÚT TIỀN MÔ PHỎNG', statusText: 'THÀNH CÔNG' },
  savings_open: { title: 'XÁC NHẬN MỞ TIẾT KIỆM', accent: '#0D9488', badge: 'TIẾT KIỆM SỐ HIKARI', statusText: 'THÀNH CÔNG' },
  savings_settle: { title: 'TẤT TOÁN TIẾT KIỆM', accent: '#10B981', badge: 'TRẢ GỐC & LÃI', statusText: 'THÀNH CÔNG' },
  loan_pay: { title: 'BIÊN LAI THANH TOÁN VAY', accent: '#E14B5A', badge: 'TÍN DỤNG HIKARI', statusText: 'THÀNH CÔNG' },
  ai_tx: { title: 'CHUYỂN KHOẢN NHÂN VẬT', accent: '#E14B5A', badge: 'HIKARI · YUMECHAT SYNC', statusText: 'THÀNH CÔNG' },
  refund: { title: 'CHỨNG TỪ HOÀN TIỀN', accent: '#10B981', badge: 'HOÀN TIỀN TỰ ĐỘNG', statusText: 'THÀNH CÔNG' },
  failed: { title: 'THÔNG BÁO GIAO DỊCH LỖI', accent: '#B91C1C', badge: 'KHÔNG THÀNH CÔNG', statusText: 'THẤT BẠI' },
};

export interface ServerBillPayload {
  template: BillTemplateType;
  refCode: string;
  amount: number;
  fee?: number;
  totalAmount?: number;
  senderName: string;
  senderAccount: string;
  recipientName: string;
  recipientAccount: string;
  bankName: string;
  channel: string;
  note: string;
  createdAt: string;
  status: string;
}

export function renderBillSvgDataUrl(bill: ServerBillPayload): string {
  const meta = TEMPLATE_META[bill.template] || TEMPLATE_META.transfer;
  const noteLines = wrapTextLines(bill.note || 'Chuyển tiền Hikari Bank', 34, 2);
  const dt = new Date(bill.createdAt || Date.now());
  const dateStr = dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const clockStr = dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isFailed = bill.template === 'failed' || /thất bại|đang xử lý/i.test(bill.status || '');
  const feeVal = Math.max(0, Math.round(Number(bill.fee || 0)));
  const totalVal = Math.max(0, Math.round(Number(bill.totalAmount ?? Number(bill.amount || 0) + feeVal)));
  const feeStr = feeVal === 0 ? '0 VNĐ (Miễn phí)' : formatVndServer(feeVal);
  const amtText = formatVndServer(bill.amount);
  const amtFontSize = amtText.length > 18 ? 28 : amtText.length > 14 ? 32 : 36;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="980" viewBox="0 0 760 980">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22191D"/>
      <stop offset="52%" stop-color="#A82438"/>
      <stop offset="100%" stop-color="${isFailed ? '#991B1B' : '#E14B5A'}"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF5F5"/>
      <stop offset="100%" stop-color="#FAF7F2"/>
    </linearGradient>
  </defs>
  <rect width="760" height="980" fill="url(#bg)"/>
  <rect x="28" y="24" width="704" height="932" rx="28" fill="#FCFBF7" stroke="#F1DDE0" stroke-width="2"/>
  <path d="M28 52 a28 28 0 0 1 28 -28 h648 a28 28 0 0 1 28 28 v176 H28 Z" fill="url(#hdr)"/>
  <circle cx="670" cy="70" r="64" fill="#FFFFFF" opacity="0.08"/>
  <circle cx="705" cy="145" r="42" fill="#FDE68A" opacity="0.14"/>
  <rect x="64" y="50" width="46" height="46" rx="14" fill="#FFFFFF" opacity="0.18"/>
  <circle cx="87" cy="65" r="6" fill="#FDE68A"/>
  <text x="87" y="88" text-anchor="middle" font-family="Plus Jakarta Sans, Be Vietnam Pro, sans-serif" font-weight="800" font-size="18" fill="#FFFFFF">H</text>
  <text x="124" y="69" font-family="Plus Jakarta Sans, Be Vietnam Pro, sans-serif" font-weight="800" font-size="18" fill="#FFFFFF">HIKARI BANK · ひかり銀行</text>
  <text x="124" y="90" font-family="Be Vietnam Pro, sans-serif" font-weight="600" font-size="12" fill="#FFE4E6">${escapeXml(meta.badge)}</text>
  <rect x="506" y="54" width="194" height="28" rx="8" fill="#FFFFFF" opacity="0.16"/>
  <text x="603" y="72" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-weight="700" font-size="10.5" fill="#FDE68A">MÔ PHỎNG – PHONE OS</text>
  <text x="64" y="148" font-family="Plus Jakarta Sans, Be Vietnam Pro, sans-serif" font-weight="800" font-size="25" fill="#FFFFFF">${escapeXml(meta.title)}</text>
  <text x="64" y="178" font-family="Be Vietnam Pro, sans-serif" font-weight="600" font-size="13" fill="#FFF1F2">${escapeXml(bill.status || meta.statusText)} · ${escapeXml(clockStr)} · ${escapeXml(dateStr)}</text>

  <rect x="56" y="252" width="648" height="128" rx="20" fill="${isFailed ? '#FEF2F2' : '#FFF7F7'}" stroke="${isFailed ? '#FECACA' : '#F8D7DB'}" stroke-width="1.5"/>
  <text x="380" y="284" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-weight="600" font-size="12" fill="#6B7280">SỐ TIỀN GIAO DỊCH</text>
  <text x="380" y="332" text-anchor="middle" font-family="Plus Jakarta Sans, Be Vietnam Pro, sans-serif" font-weight="800" font-size="${amtFontSize}" fill="${isFailed ? '#DC2626' : '#1F2430'}">${escapeXml(amtText)}</text>
  <text x="380" y="360" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-weight="700" font-size="12" fill="${isFailed ? '#B91C1C' : '#059669'}">Tổng thanh toán: ${escapeXml(formatVndServer(totalVal))}</text>

  <g font-family="Be Vietnam Pro, sans-serif" font-size="14">
    <text x="64" y="422" fill="#6B7280" font-weight="500">Người chuyển</text>
    <text x="696" y="422" text-anchor="end" fill="#1F2430" font-weight="700">${escapeXml(bill.senderName)}</text>
    <text x="696" y="444" text-anchor="end" fill="#4B5563" font-size="12">${escapeXml(maskAccountServer(bill.senderAccount))} · Hikari Bank</text>
    <line x1="64" y1="464" x2="696" y2="464" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="498" fill="#6B7280" font-weight="500">Người nhận</text>
    <text x="696" y="498" text-anchor="end" fill="#1F2430" font-weight="700">${escapeXml(bill.recipientName)}</text>
    <text x="696" y="520" text-anchor="end" fill="#4B5563" font-size="12">${escapeXml(maskAccountServer(bill.recipientAccount))} · ${escapeXml(bill.bankName)}</text>
    <line x1="64" y1="540" x2="696" y2="540" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="574" fill="#6B7280" font-weight="500">Thời gian · Ngày</text>
    <text x="696" y="574" text-anchor="end" fill="#1F2430" font-weight="600">${escapeXml(clockStr)} · ${escapeXml(dateStr)}</text>
    <line x1="64" y1="594" x2="696" y2="594" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="628" fill="#6B7280" font-weight="500">Phương thức</text>
    <text x="696" y="628" text-anchor="end" fill="#1F2430" font-weight="600">${escapeXml(bill.channel)}</text>
    <line x1="64" y1="648" x2="696" y2="648" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="682" fill="#6B7280" font-weight="500">Phí giao dịch</text>
    <text x="696" y="682" text-anchor="end" fill="#059669" font-weight="700">${escapeXml(feeStr)}</text>
    <line x1="64" y1="702" x2="696" y2="702" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="736" fill="#6B7280" font-weight="500">Nội dung</text>
    <text x="696" y="736" text-anchor="end" fill="#1F2430" font-weight="600">${escapeXml(noteLines[0] || '-')}</text>
    ${noteLines[1] ? `<text x="696" y="758" text-anchor="end" fill="#1F2430" font-weight="600">${escapeXml(noteLines[1])}</text>` : ''}
    <line x1="64" y1="780" x2="696" y2="780" stroke="#F1E5E7" stroke-dasharray="5 5"/>

    <text x="64" y="814" fill="#6B7280" font-weight="500">Mã giao dịch</text>
    <text x="696" y="814" text-anchor="end" fill="#E14B5A" font-weight="800">${escapeXml(bill.refCode)}</text>
  </g>

  <rect x="64" y="846" width="632" height="82" rx="16" fill="#FAF6F6" stroke="#EFE2E4"/>
  <text x="86" y="878" font-family="Be Vietnam Pro, sans-serif" font-weight="700" font-size="13" fill="#1F2430">Biên lai mô phỏng Hikari Bank · Your Life, Your Journey.</text>
  <text x="86" y="900" font-family="Be Vietnam Pro, sans-serif" font-weight="500" font-size="12" fill="#6B7280">BIÊN LAI MÔ PHỎNG – PHONE OS · Không phải chứng từ ngân hàng thật.</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

export function computeTierForAssets(totalAssets: number): {
  tierName: 'Standard' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Private Banking';
  nextTier: string;
  nextThreshold: number;
  progressPct: number;
} {
  if (totalAssets >= 500000000) {
    return { tierName: 'Private Banking', nextTier: 'Private Banking (Tối đa)', nextThreshold: 500000000, progressPct: 100 };
  }
  if (totalAssets >= 200000000) {
    return { tierName: 'Diamond', nextTier: 'Private Banking', nextThreshold: 500000000, progressPct: Math.min(99, Math.round((totalAssets / 500000000) * 100)) };
  }
  if (totalAssets >= 80000000) {
    return { tierName: 'Platinum', nextTier: 'Diamond', nextThreshold: 200000000, progressPct: Math.min(99, Math.round((totalAssets / 200000000) * 100)) };
  }
  if (totalAssets >= 30000000) {
    return { tierName: 'Gold', nextTier: 'Platinum', nextThreshold: 80000000, progressPct: Math.min(99, Math.round((totalAssets / 80000000) * 100)) };
  }
  if (totalAssets >= 10000000) {
    return { tierName: 'Silver', nextTier: 'Gold', nextThreshold: 30000000, progressPct: Math.min(99, Math.round((totalAssets / 30000000) * 100)) };
  }
  return { tierName: 'Standard', nextTier: 'Silver', nextThreshold: 10000000, progressPct: Math.max(5, Math.round((totalAssets / 10000000) * 100)) };
}

export function getOverviewPayload() {
  // Ensure any new characters have AI bank accounts
  try {
    const missingChars = db
      .prepare(
        "SELECT id FROM characters WHERE id NOT IN (SELECT character_id FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id != '')"
      )
      .all() as Array<{ id: string }>;
    for (const c of missingChars) {
      ensureAiCharacterBankAccount(db, c.id);
    }
  } catch {
    // ignore
  }

  const rawAccounts = db
    .prepare("SELECT * FROM banking_accounts_demo ORDER BY CASE WHEN owner_type = 'user' THEN 0 ELSE 1 END, is_primary DESC, opened_at ASC")
    .all() as Array<Record<string, unknown>>;

  const sanitized: Array<Record<string, unknown>> = rawAccounts.map((row) => {
    const { pin_hash, ...rest } = row;
    return {
      ...rest,
      has_pin: Boolean(pin_hash),
    };
  });

  const userAccounts = sanitized.filter((a) => (a.owner_type || 'user') === 'user');
  const aiAccountsRaw = sanitized.filter((a) => a.owner_type === 'ai');

  const charRows = db.prepare('SELECT id, name, avatar, mood, personality FROM characters').all() as Array<{
    id: string;
    name: string;
    avatar: string;
    mood: string;
    personality: string;
  }>;
  const charMap = new Map(charRows.map((c) => [c.id, c]));

  const aiAccounts = aiAccountsRaw.map((acc) => {
    const ch = charMap.get(String(acc.character_id || ''));
    const preset = AI_BANK_PROFILES[String(acc.character_id || '')];
    return {
      id: acc.id,
      bank_name: acc.bank_name,
      account_number: acc.account_number,
      holder_name: acc.holder_name,
      account_type: acc.account_type,
      status: acc.status,
      opened_at: acc.opened_at,
      nickname: acc.nickname,
      avatar: acc.avatar || ch?.avatar || '',
      is_hidden: acc.is_hidden,
      is_primary: acc.is_primary,
      package_tier: acc.package_tier,
      owner_type: acc.owner_type,
      character_id: acc.character_id,
      account_role: acc.account_role,
      financial_personality: acc.financial_personality,
      character_name: ch?.name || acc.holder_name,
      character_mood: ch?.mood || '',
      personality_label: preset?.personalityLabel || String(acc.nickname || 'Tài khoản CHAR'),
    };
  });

  const primaryAccount = userAccounts.find((a) => Number(a.is_primary) === 1) || userAccounts[0] || null;

  const transactions = db
    .prepare(
      "SELECT * FROM banking_transactions_demo WHERE account_id IN (SELECT id FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user') ORDER BY created_at DESC LIMIT 200"
    )
    .all() as Array<Record<string, unknown>>;
  const bills = db.prepare('SELECT * FROM banking_bills_demo ORDER BY is_paid ASC, due_date ASC').all();
  const aiBills = db.prepare('SELECT * FROM banking_ai_bills ORDER BY is_paid ASC, due_date ASC').all();
  const beneficiaries = db
    .prepare('SELECT * FROM banking_beneficiaries ORDER BY is_favorite DESC, last_used_at DESC')
    .all();

  const userAccMap = new Map(userAccounts.map((a) => [String(a.id), a]));
  const primaryHolderName = String(primaryAccount?.holder_name || userAccounts[0]?.holder_name || 'MINH ANH');

  const savings = db.prepare('SELECT * FROM banking_savings ORDER BY status ASC, opened_at DESC').all() as Array<Record<string, unknown>>;
  const loans = db.prepare('SELECT * FROM banking_loans ORDER BY status ASC, created_at DESC').all() as Array<Record<string, unknown>>;
  const budgets = db.prepare('SELECT * FROM banking_budgets').all();
  const notifications = db.prepare('SELECT * FROM banking_notifications ORDER BY created_at DESC LIMIT 80').all();
  const paymentRequests: Array<Record<string, unknown>> = [];
  const investments = db.prepare("SELECT * FROM banking_investments WHERE status = 'active' ORDER BY updated_at DESC").all() as Array<Record<string, unknown>>;
  const savingsGoals = db.prepare('SELECT * FROM banking_savings_goals ORDER BY created_at DESC').all();
  const supportTickets = db.prepare('SELECT * FROM banking_support_tickets ORDER BY created_at DESC LIMIT 40').all();

  const preTotalAccountBalance = userAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const preTotalSavings = savings.filter((s) => s.status === 'active').reduce((acc, s) => acc + Number(s.principal || 0), 0);
  const preTotalInvestments = investments.reduce((acc, inv) => acc + Math.round(Number(inv.units || 0) * Number(inv.current_price || 0)), 0);
  const preTotalAssets = preTotalAccountBalance + preTotalSavings + preTotalInvestments;

  const rawCards = db.prepare('SELECT * FROM banking_cards ORDER BY is_primary DESC, created_at DESC').all() as Array<Record<string, unknown>>;
  const cards = rawCards.map(
    ({
      pin_hash,
      card_pin_hash,
      card_number_enc,
      card_number_hash,
      cvv_enc,
      cvv_hash,
      ...rest
    }) => {
      void card_number_enc;
      void card_number_hash;
      void cvv_enc;
      void cvv_hash;
      const linkedAcc = userAccMap.get(String(rest.account_id || ''));
      const syncedHolderName = String(linkedAcc?.holder_name || primaryHolderName || rest.holder_name || 'MINH ANH').toUpperCase();
      const computed = computeCardStatsForRow(rest, userAccMap, preTotalAssets);
      const hasPin = Boolean(card_pin_hash || pin_hash);
      return {
        ...rest,
        ...computed,
        holder_name: syncedHolderName,
        card_nickname: String(rest.card_nickname || rest.card_name || ''),
        card_category: (String(rest.card_category || 'debit') === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
        issued_at: String(rest.issued_at || String(rest.created_at || '').slice(0, 10)),
        locked_at: String(rest.locked_at || ''),
        unlocked_at: String(rest.unlocked_at || ''),
        cancelled_at: String(rest.cancelled_at || ''),
        replaced_by_card_id: String(rest.replaced_by_card_id || ''),
        intl_payment_enabled: Number(rest.intl_payment_enabled ?? 1),
        is_primary: Number(rest.is_primary || 0),
        cvv: '•••',
        has_pin: hasPin,
        has_card_pin: hasPin,
      };
    }
  );

  const rawSec = db.prepare('SELECT * FROM banking_security_state LIMIT 1').get() as Record<string, unknown> | undefined;
  let security: Record<string, unknown> | null = null;
  let preferences: Record<string, unknown> = {
    customer_code: 'HK-CID-202601',
    theme_id: 'coral',
    assistant_char_id: 'hikari_chan',
    assistant_outfit: 'teller_classic',
    assistant_expression: 'cheerful',
    unlocked_outfits: ['teller_classic', 'spring_kimono', 'premier_suit'],
    dashboard_wallpaper: 'skyline',
    inactivity_lock_sec: 180,
    privacy_hide_balance: false,
    hikari_banner_dismissed: false,
    onboarding_completed: true,
  };
  if (rawSec) {
    const { login_password_hash, ...rest } = rawSec;
    security = { ...rest, has_password: Boolean(login_password_hash) };
    let unlockedOutfits = ['teller_classic', 'spring_kimono', 'premier_suit'];
    try {
      const parsed = JSON.parse(String(rawSec.unlocked_outfits_json || '[]'));
      if (Array.isArray(parsed) && parsed.length > 0) unlockedOutfits = parsed.map(String);
    } catch {
      // ignore
    }
    preferences = {
      customer_code: String(rawSec.customer_code || 'HK-CID-202601'),
      theme_id: String(rawSec.theme_id || 'coral'),
      assistant_char_id: String(rawSec.assistant_char_id || 'hikari_chan'),
      assistant_outfit: String(rawSec.assistant_outfit || 'teller_classic'),
      assistant_expression: String(rawSec.assistant_expression || 'cheerful'),
      unlocked_outfits: unlockedOutfits,
      dashboard_wallpaper: String(rawSec.dashboard_wallpaper || 'skyline'),
      inactivity_lock_sec: Number(rawSec.inactivity_lock_sec ?? 180),
      privacy_hide_balance: Boolean(rawSec.privacy_hide_balance),
      hikari_banner_dismissed: Boolean(rawSec.hikari_banner_dismissed),
      onboarding_completed: rawSec.onboarding_completed === undefined ? true : Boolean(rawSec.onboarding_completed),
    };
  }

  let receipts: Array<Record<string, unknown>> = [];
  let auditLogs: Array<Record<string, unknown>> = [];
  try {
    receipts = db.prepare('SELECT * FROM banking_receipts ORDER BY created_at DESC LIMIT 80').all() as Array<Record<string, unknown>>;
    auditLogs = db.prepare('SELECT * FROM banking_ledger_audit ORDER BY created_at DESC LIMIT 30').all() as Array<Record<string, unknown>>;
  } catch {
    // ignore
  }

  // Dynamic financial stats across user accounts
  const userAccountIds = new Set(userAccounts.map((a) => String(a.id)));
  const totalAccountBalance = userAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const availableBalance = userAccounts.reduce((s, a) => s + Number(a.available_balance ?? a.balance ?? 0), 0);
  const heldBalance = userAccounts.reduce((s, a) => s + Number(a.held_balance || 0), 0);
  const totalSavings = savings.filter((s) => s.status === 'active').reduce((acc, s) => acc + Number(s.principal || 0), 0);
  const totalInvestments = investments.reduce((acc, inv) => acc + Math.round(Number(inv.units || 0) * Number(inv.current_price || 0)), 0);
  const totalDebt = loans
    .filter((l) => l.status === 'active' && (l.direction || 'borrow') === 'borrow')
    .reduce((acc, l) => acc + Number(l.remaining_balance || 0), 0);

  const now = new Date();
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let totalReceived = 0;
  let totalTransferred = 0;
  for (const tx of transactions) {
    if (!userAccountIds.has(String(tx.account_id || ''))) continue;
    if (String(tx.status || '').includes('Thất bại') || String(tx.status || '').includes('Đang xử lý') || String(tx.bill_template || '') === 'failed') continue;
    const rawAmt = Number(tx.amount || 0);
    let debitAmt = rawAmt;
    try {
      const r = JSON.parse(String(tx.receipt_json || '{}')) as { totalAmount?: number };
      if (typeof r.totalAmount === 'number' && Number.isFinite(r.totalAmount)) {
        debitAmt = r.totalAmount;
      }
    } catch {
      // keep rawAmt
    }
    const created = String(tx.created_at || '');
    if (tx.tx_type === 'income') {
      totalReceived += rawAmt;
      if (created.startsWith(thisMonthPrefix)) monthlyIncome += rawAmt;
    } else if (tx.tx_type === 'expense') {
      totalTransferred += debitAmt;
      if (created.startsWith(thisMonthPrefix)) monthlyExpense += debitAmt;
    }
  }

  const totalAssets = totalAccountBalance + totalSavings + totalInvestments;
  const tier = computeTierForAssets(totalAssets);

  if (primaryAccount && primaryAccount.package_tier !== `${tier.tierName} Hikari`) {
    try {
      db.prepare('UPDATE banking_accounts_demo SET package_tier = ? WHERE id = ?').run(`${tier.tierName} Hikari`, primaryAccount.id);
      primaryAccount.package_tier = `${tier.tierName} Hikari`;
    } catch {
      // ignore
    }
  }

  let telecomCarriers: Array<Record<string, unknown>> = [];
  let telecomSims: Array<Record<string, unknown>> = [];
  try {
    telecomCarriers = db
      .prepare('SELECT * FROM telecom_carriers WHERE is_active = 1 ORDER BY sort_order ASC')
      .all() as Array<Record<string, unknown>>;
    const cMap = new Map(telecomCarriers.map((c) => [String(c.id), c]));
    const rawSims = db
      .prepare("SELECT * FROM telecom_user_sims WHERE user_id = 'user_1' ORDER BY is_primary DESC, purchased_at ASC")
      .all() as Array<Record<string, unknown>>;
    telecomSims = rawSims.map((sim) => {
      const c = cMap.get(String(sim.carrier_id));
      return {
        ...sim,
        carrier_name: c ? String(c.name) : String(sim.carrier_id),
        carrier_code: c ? String(c.code) : String(sim.carrier_id).toUpperCase(),
        carrier_logo: c ? String(c.logo_variant) : String(sim.carrier_id),
      };
    });
  } catch {
    // telecom tables not yet initialized
  }

  const cardCatalogData = getCardSystemCatalogData();

  return {
    account: primaryAccount,
    accounts: userAccounts,
    aiAccounts,
    transactions,
    bills,
    aiBills,
    beneficiaries,
    cards,
    ...cardCatalogData,
    savings,
    loans,
    budgets,
    notifications,
    security,
    preferences,
    paymentRequests,
    charRequests: paymentRequests,
    investments,
    savingsGoals,
    supportTickets,
    receipts,
    auditLogs,
    telecomCarriers,
    telecomSims,
    computedStats: {
      totalAssets,
      availableBalance,
      heldBalance,
      totalSavings,
      totalInvestments,
      totalDebt,
      monthlyIncome,
      monthlyExpense,
      totalReceived,
      totalTransferred,
      tierName: tier.tierName,
      nextTier: tier.nextTier,
      nextThreshold: tier.nextThreshold,
      tierProgressPct: tier.progressPct,
    },
  };
}

function buildCharTransferReaction(params: {
  charName: string;
  personality: string;
  amount: number;
  refCode: string;
  note: string;
  scenario?: 'repay' | 'gift' | 'bonus' | 'refund' | 'split' | 'support' | 'request_accepted';
}): string {
  const amtText = formatVndServer(params.amount);
  switch (params.scenario) {
    case 'repay':
      return `Mình vừa chuyển trả ${amtText} qua Hikari Bank rồi nha (mã ${params.refCode}). Cảm ơn bạn đã tin tưởng cho mình mượn trước đó!`;
    case 'gift':
      return `Có món quà nhỏ ${amtText} gửi bạn từ Hikari Bank đây! Chúc bạn một ngày thật nhiều niềm vui nhé.`;
    case 'bonus':
      return `Mình vừa gửi bạn khoản thưởng ${amtText} (${params.note || 'Hikari Bank'}). Mã giao dịch ${params.refCode} đã hoàn tất rồi nhé!`;
    case 'split':
      return `Mình vừa chia lại phần ${amtText} qua Hikari Bank để sòng phẳng nha (${params.refCode}).`;
    case 'refund':
      return `Mình đã hoàn lại ${amtText} về tài khoản Hikari Bank của bạn rồi đó (mã ${params.refCode}). Kiểm tra giúp mình nhé!`;
    case 'request_accepted':
      return `Yêu cầu của bạn đã được mình xác nhận! Mình vừa chuyển ${amtText} qua Hikari Bank rồi nhé (mã ${params.refCode}).`;
    default:
      if (params.personality === 'cautious' || params.personality === 'frugal') {
        return `Mình đã kiểm tra kỹ và chuyển ${amtText} sang Hikari Bank cho bạn rồi (mã ${params.refCode}). Bạn xem lại biên lai nhé.`;
      }
      return `Mình vừa chuyển ${amtText} vào tài khoản Hikari Bank của bạn rồi nha! Mã giao dịch ${params.refCode}.`;
  }
}

function getOrCreateCharDmConversation(charId: string): { id: string; name: string; avatar: string } | null {
  try {
    const char = db.prepare('SELECT id, name, avatar FROM characters WHERE id = ?').get(charId) as
      | { id: string; name: string; avatar: string }
      | undefined;
    if (!char) return null;

    const existing = db
      .prepare('SELECT id FROM conversations WHERE character_id = ? AND is_group = 0 LIMIT 1')
      .get(char.id) as { id: string } | undefined;
    if (existing) {
      return { id: existing.id, name: char.name, avatar: char.avatar || '' };
    }
    const convId = bankUid('conv');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversations (id, title, is_group, avatar, character_id, updated_at, unread_count)
      VALUES (?, ?, 0, ?, ?, ?, 0)
    `).run(convId, char.name, char.avatar || '', char.id, now);
    return { id: convId, name: char.name, avatar: char.avatar || '' };
  } catch {
    return null;
  }
}

export function executeAiToUserTransfer(params: {
  characterId: string;
  targetAccountId?: string;
  amount: number;
  note: string;
  kind?: 'transfer' | 'loan' | 'split' | 'refund';
  scenario?: 'repay' | 'gift' | 'bonus' | 'refund' | 'split' | 'support' | 'request_accepted';
  sourceType?: 'char_transfer' | 'chat_request' | 'yumechat';
  sourceChatId?: string;
  idempotencyKey?: string;
  postToChat?: boolean;
}): {
  ok: boolean;
  reason?: string;
  idempotentHit?: boolean;
  transaction?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  billImageDataUrl?: string;
  newAiBalance?: number;
  sourceChatId?: string;
} {
  ensureAiCharacterBankAccount(db, params.characterId);
  const idem = (params.idempotencyKey || '').trim();
  if (idem) {
    const existing = db
      .prepare('SELECT * FROM banking_transactions_demo WHERE idempotency_key = ? LIMIT 1')
      .get(idem) as Record<string, unknown> | undefined;
    if (existing) {
      let parsedReceipt: Record<string, unknown> = {};
      try {
        parsedReceipt = JSON.parse(String(existing.receipt_json || '{}'));
      } catch {
        parsedReceipt = {};
      }
      return {
        ok: true,
        idempotentHit: true,
        transaction: existing,
        receipt: parsedReceipt,
        billImageDataUrl: String(existing.bill_image_url || '') || renderBillSvgDataUrl(parsedReceipt as unknown as ServerBillPayload),
        sourceChatId: String(existing.source_chat_id || ''),
      };
    }
  }

  const amount = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(amount) || amount < 1000) {
    return { ok: false, reason: 'Số tiền giao dịch tối thiểu là 1.000 VNĐ.' };
  }

  const aiAcc = db
    .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?")
    .get(params.characterId) as Record<string, unknown> | undefined;

  if (!aiAcc) {
    return { ok: false, reason: 'Nhân vật CHAR chưa có tài khoản ngân hàng hoạt động.' };
  }

  const aiAvailBefore = Number(aiAcc.available_balance ?? aiAcc.balance ?? 0);
  if (amount > aiAvailBefore) {
    return {
      ok: false,
      reason: `Số dư tài khoản của ${String(aiAcc.holder_name)} hiện chỉ còn ${formatVndServer(aiAvailBefore)}, không đủ để chuyển ${formatVndServer(amount)}.`,
    };
  }

  const targetAcc = (params.targetAccountId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(params.targetAccountId)
    : db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC LIMIT 1").get()) as
    | Record<string, unknown>
    | undefined;

  if (!targetAcc) {
    return { ok: false, reason: 'Không tìm thấy tài khoản nhận hợp lệ.' };
  }

  const now = new Date().toISOString();
  const refCode = genBankRefCode();
  const userTxId = bankUid('tx');
  const aiTxId = bankUid('tx');
  const cleanNote = (params.note || `${String(aiAcc.holder_name)} chuyển khoản qua Hikari Bank`).trim().slice(0, 120);
  const conv = getOrCreateCharDmConversation(params.characterId);
  const resolvedChatId = params.sourceChatId || conv?.id || '';
  const resolvedSourceType = params.sourceType || 'char_transfer';

  const aiBalBefore = Number(aiAcc.balance || 0);
  const userBalBefore = Number(targetAcc.balance || 0);
  const newAiBal = aiBalBefore - amount;
  const newAiAvail = aiAvailBefore - amount;
  const newUserBal = userBalBefore + amount;
  const newUserAvail = Number(targetAcc.available_balance ?? targetAcc.balance ?? 0) + amount;

  const receiptSig = signReceiptPayload({
    txId: userTxId,
    refCode,
    amount,
    fee: 0,
    totalAmount: amount,
    senderAccount: String(aiAcc.account_number),
    recipientAccount: String(targetAcc.account_number),
    createdAt: now,
    status: 'Thành công',
  });

  const receiptObj: ServerBillPayload & {
    txId: string;
    characterId: string;
    isAiTx: boolean;
    senderAvatar: string;
    recipientAvatar: string;
    totalAmount: number;
    signature: string;
    sourceType: string;
    sourceChatId: string;
  } = {
    txId: userTxId,
    characterId: params.characterId,
    isAiTx: true,
    template: 'ai_tx',
    refCode,
    amount,
    fee: 0,
    totalAmount: amount,
    senderName: String(aiAcc.holder_name),
    senderAccount: String(aiAcc.account_number),
    senderAvatar: String(aiAcc.avatar || ''),
    recipientName: String(targetAcc.holder_name),
    recipientAccount: String(targetAcc.account_number),
    recipientAvatar: String(targetAcc.avatar || ''),
    bankName: 'Hikari Bank',
    channel: params.kind === 'loan' ? 'Cho vay CHAR · Hikari' : 'Chuyển khoản CHAR · YumeChat',
    note: cleanNote,
    createdAt: now,
    status: 'Thành công',
    signature: receiptSig,
    sourceType: resolvedSourceType,
    sourceChatId: resolvedChatId,
  };

  const billImageDataUrl = renderBillSvgDataUrl(receiptObj);

  const runTx = db.transaction(() => {
    const freshAi = db.prepare('SELECT balance, available_balance FROM banking_accounts_demo WHERE id = ?').get(String(aiAcc.id)) as {
      balance: number;
      available_balance: number;
    };
    if (Number(freshAi.available_balance ?? freshAi.balance ?? 0) < amount) {
      throw new Error('INSUFFICIENT_CHAR_BALANCE');
    }

    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_expense = COALESCE(monthly_expense, 0) + ? WHERE id = ?').run(
      newAiBal,
      newAiAvail,
      amount,
      String(aiAcc.id)
    );
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ?, monthly_income = COALESCE(monthly_income, 0) + ? WHERE id = ?').run(
      newUserBal,
      newUserAvail,
      amount,
      String(targetAcc.id)
    );

    // User incoming transaction
    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, linked_ref, sender_name, sender_account, sender_avatar, recipient_avatar,
        is_ai_tx, receipt_sig, source_type, source_chat_id, idempotency_key, target_account_id
      ) VALUES (?, ?, 'income', ?, ?, ?, 'Thành công', ?, ?, ?, ?, 'Hikari Bank', ?, 0, ?, ?, ?, ?, 'ai_tx', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      userTxId,
      String(targetAcc.id),
      amount,
      String(aiAcc.holder_name),
      cleanNote,
      now,
      now,
      params.kind === 'loan' ? 'Vay từ CHAR' : 'Nhận từ CHAR',
      receiptObj.channel,
      String(aiAcc.account_number),
      amount,
      newUserBal,
      refCode,
      JSON.stringify(receiptObj),
      aiTxId,
      String(aiAcc.holder_name),
      String(aiAcc.account_number),
      String(aiAcc.avatar || ''),
      String(targetAcc.avatar || ''),
      receiptSig,
      resolvedSourceType,
      resolvedChatId,
      idem,
      String(aiAcc.id)
    );

    // CHAR outgoing transaction
    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, linked_ref, sender_name, sender_account, sender_avatar, recipient_avatar,
        is_ai_tx, receipt_sig, source_type, source_chat_id, target_account_id
      ) VALUES (?, ?, 'expense', ?, ?, ?, 'Thành công', ?, ?, 'Chuyển khoản', ?, 'Hikari Bank', ?, 0, ?, ?, ?, ?, 'ai_tx', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      aiTxId,
      String(aiAcc.id),
      amount,
      String(targetAcc.holder_name),
      cleanNote,
      now,
      now,
      receiptObj.channel,
      String(targetAcc.account_number),
      amount,
      newAiBal,
      refCode,
      JSON.stringify(receiptObj),
      userTxId,
      String(aiAcc.holder_name),
      String(aiAcc.account_number),
      String(aiAcc.avatar || ''),
      String(targetAcc.avatar || ''),
      receiptSig,
      resolvedSourceType,
      resolvedChatId,
      String(targetAcc.id)
    );

    writeLedgerAudit({
      operation: 'char_to_player_debit',
      txId: aiTxId,
      accountId: String(aiAcc.id),
      delta: -amount,
      balanceBefore: aiBalBefore,
      balanceAfter: newAiBal,
      detail: cleanNote,
    });
    writeLedgerAudit({
      operation: 'char_to_player_credit',
      txId: userTxId,
      accountId: String(targetAcc.id),
      delta: amount,
      balanceBefore: userBalBefore,
      balanceAfter: newUserBal,
      detail: cleanNote,
    });
    recordReceiptRecord({ transactionId: userTxId, receiptType: 'ai_tx' });

    if (params.kind === 'loan') {
      const nextDue = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO banking_loans (
          id, account_id, loan_type, loan_name, principal, remaining_balance,
          interest_rate, term_months, monthly_payment, paid_months, next_due_date,
          status, schedule_json, created_at, counterparty_char_id, direction
        ) VALUES (?, ?, 'ai_loan', ?, ?, ?, 0, 1, ?, 0, ?, 'active', '[]', ?, ?, 'borrow')
      `).run(
        bankUid('loan'),
        String(targetAcc.id),
        `Vay cá nhân từ ${String(aiAcc.holder_name)}`,
        amount,
        amount,
        amount,
        nextDue,
        now,
        params.characterId
      );
    }

    db.prepare('UPDATE banking_security_state SET reward_points = COALESCE(reward_points, 0) + ?').run(
      Math.max(5, Math.min(80, Math.floor(amount / 100000)))
    );

    pushBankNotification(
      'receive',
      `${String(aiAcc.holder_name)} vừa chuyển ${formatVndServer(amount)}`,
      `Nội dung: ${cleanNote} · Mã GD: ${refCode}`,
      amount,
      userTxId
    );
  });

  try {
    runTx();
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_CHAR_BALANCE') {
      return { ok: false, reason: `Số dư tài khoản của ${String(aiAcc.holder_name)} không đủ để thực hiện giao dịch.` };
    }
    throw err;
  }

  // Post interactive TX card + personality-matched CHAR reaction to YumeChat when requested
  if (params.postToChat && conv) {
    try {
      const billMsgId = bankUid('msg');
      const replyMsgId = bankUid('msg');
      const t2 = new Date(Date.now() + 250).toISOString();
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'image', ?, 'sent', ?)
      `).run(
        billMsgId,
        conv.id,
        params.characterId,
        conv.name,
        conv.avatar,
        `Đã chuyển ${formatVndServer(amount)} qua Hikari Bank (${cleanNote})`,
        JSON.stringify({
          dataUrl: billImageDataUrl,
          isBill: true,
          cardType: 'hikari_tx_card',
          direction: 'char_to_player',
          txId: userTxId,
          refCode,
          amount,
          status: 'Thành công',
          note: cleanNote,
          characterId: params.characterId,
          senderName: String(aiAcc.holder_name),
          recipientName: String(targetAcc.holder_name),
          receipt: receiptObj,
        }),
        now
      );

      const reactionText = buildCharTransferReaction({
        charName: conv.name,
        personality: String(aiAcc.financial_personality || 'balanced'),
        amount,
        refCode,
        note: cleanNote,
        scenario: params.scenario,
      });

      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?)
      `).run(replyMsgId, conv.id, params.characterId, conv.name, conv.avatar, reactionText, t2);

      db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ?, unread_count = unread_count + 1 WHERE id = ?').run(
        t2,
        replyMsgId,
        conv.id
      );
    } catch {
      // non-fatal
    }
  }

  return {
    ok: true,
    transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(userTxId) as Record<string, unknown>,
    receipt: receiptObj as unknown as Record<string, unknown>,
    billImageDataUrl,
    newAiBalance: newAiBal,
    sourceChatId: resolvedChatId,
  };
}

export function createAndEvaluateCharTransferRequest(params: {
  characterId: string;
  amount: number;
  note: string;
  description?: string;
  deadlineAt?: string;
  idempotencyKey?: string;
  targetAccountId?: string;
}): {
  ok: boolean;
  error?: string;
  request?: Record<string, unknown>;
  transaction?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  idempotentHit?: boolean;
} {
  ensureAiCharacterBankAccount(db, params.characterId);
  const idem = (params.idempotencyKey || '').trim();
  if (idem) {
    const existing = db
      .prepare('SELECT * FROM banking_payment_requests WHERE idempotency_key = ? LIMIT 1')
      .get(idem) as Record<string, unknown> | undefined;
    if (existing) {
      const tx = existing.transaction_id
        ? (db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(String(existing.transaction_id)) as Record<string, unknown> | undefined)
        : undefined;
      return { ok: true, idempotentHit: true, request: existing, transaction: tx };
    }
  }

  const amt = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(amt) || amt < 1000) {
    return { ok: false, error: 'Số tiền yêu cầu tối thiểu là 1.000 VNĐ.' };
  }

  const aiAcc = db
    .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?")
    .get(params.characterId) as Record<string, unknown> | undefined;
  if (!aiAcc) {
    return { ok: false, error: 'Không tìm thấy tài khoản ngân hàng của nhân vật CHAR.' };
  }

  const targetAcc = (params.targetAccountId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(params.targetAccountId)
    : db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC LIMIT 1").get()) as
    | Record<string, unknown>
    | undefined;
  if (!targetAcc) {
    return { ok: false, error: 'Không tìm thấy tài khoản nhận của người chơi.' };
  }

  const now = new Date().toISOString();
  const reqId = bankUid('payreq');
  const conv = getOrCreateCharDmConversation(params.characterId);
  const convId = conv?.id || '';
  const cleanNote = (params.note || 'Yêu cầu chuyển tiền qua Hikari Bank').trim().slice(0, 120);
  const cleanDesc = (params.description || '').trim().slice(0, 240);
  const deadline = params.deadlineAt || new Date(Date.now() + 24 * 3600_000).toISOString();
  const qrPayload = `HIKARI_OS|${String(targetAcc.account_number)}|${String(targetAcc.holder_name)}|${amt}|${cleanNote}`;

  const aiBalance = Number(aiAcc.available_balance ?? aiAcc.balance ?? 0);
  const personality = String(aiAcc.financial_personality || 'balanced');
  const rel = db
    .prepare('SELECT affection, trust, conflict FROM ai_relationships WHERE character_id = ?')
    .get(params.characterId) as { affection: number; trust: number; conflict: number } | undefined;
  const affection = rel?.affection ?? 60;
  const trust = rel?.trust ?? 60;
  const conflict = rel?.conflict ?? 0;

  let status: 'pending' | 'accepted' | 'declined' | 'counter_offered' = 'pending';
  let proposedAmount = 0;
  let responseMessage = '';
  let txResult: ReturnType<typeof executeAiToUserTransfer> | null = null;

  if (conflict >= 35 || trust < 25) {
    status = 'declined';
    responseMessage = `Hiện tại mình đang hơi bận và chưa tiện chuyển khoản ngay (${cleanNote}). Để lúc khác mình trao đổi thêm nhé.`;
  } else if (aiBalance < 1000) {
    status = 'declined';
    responseMessage = `Tài khoản Hikari Bank của mình hiện chỉ còn ${formatVndServer(aiBalance)}, không đủ để chuyển lúc này rồi.`;
  } else if (amt > aiBalance) {
    const canCounter = aiBalance >= 50000 && (personality === 'generous' || personality === 'wealthy' || personality === 'balanced' || affection >= 55);
    if (canCounter) {
      status = 'counter_offered';
      proposedAmount = Math.max(10000, Math.floor((aiBalance * (personality === 'generous' ? 0.7 : 0.5)) / 1000) * 1000);
      responseMessage = `Mình chưa đủ cả ${formatVndServer(amt)} ngay lúc này, nhưng mình có thể gửi trước ${formatVndServer(proposedAmount)}. Bạn xác nhận nhận mức này nhé?`;
    } else {
      status = 'declined';
      responseMessage = `Số dư hiện tại của mình (${formatVndServer(aiBalance)}) chưa đủ cho yêu cầu ${formatVndServer(amt)}. Mình xin phép từ chối đợt này nha.`;
    }
  } else if ((personality === 'cautious' || personality === 'frugal') && amt > aiBalance * 0.45 && trust < 78) {
    status = 'counter_offered';
    proposedAmount = Math.max(10000, Math.floor((aiBalance * 0.35) / 1000) * 1000);
    responseMessage = `Số tiền ${formatVndServer(amt)} hơi vượt kế hoạch chi tiêu của mình tuần này. Mình đề xuất gửi ${formatVndServer(proposedAmount)} nhé?`;
  } else {
    txResult = executeAiToUserTransfer({
      characterId: params.characterId,
      targetAccountId: String(targetAcc.id),
      amount: amt,
      note: cleanNote,
      sourceType: 'chat_request',
      sourceChatId: convId,
      scenario: 'request_accepted',
      postToChat: false,
    });
    if (txResult.ok) {
      status = 'accepted';
      responseMessage = buildCharTransferReaction({
        charName: String(aiAcc.holder_name),
        personality,
        amount: amt,
        refCode: String(txResult.receipt?.refCode || ''),
        note: cleanNote,
        scenario: 'request_accepted',
      });
    } else {
      status = 'declined';
      responseMessage = txResult.reason || 'Không thể thực hiện giao dịch lúc này.';
    }
  }

  db.prepare(`
    INSERT INTO banking_payment_requests (
      id, account_id, target_character_id, requester_name, amount, note, description,
      qr_payload, status, ref_tx_id, transaction_id, proposed_amount, response_message,
      responded_at, deadline_at, source_chat_id, idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reqId,
    String(targetAcc.id),
    params.characterId,
    String(targetAcc.holder_name),
    amt,
    cleanNote,
    cleanDesc,
    qrPayload,
    status,
    String(txResult?.transaction?.id || ''),
    String(txResult?.transaction?.id || ''),
    proposedAmount,
    responseMessage,
    now,
    deadline,
    convId,
    idem,
    now
  );

  // Sync request + response card to YumeChat
  if (conv) {
    try {
      const reqMsgId = bankUid('msg');
      const respMsgId = bankUid('msg');
      const t2 = new Date(Date.now() + 260).toISOString();
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, created_at
        ) VALUES (?, ?, 'user', 'user_1', ?, ?, ?, 'text', ?, 'sent', ?)
      `).run(
        reqMsgId,
        conv.id,
        String(targetAcc.holder_name),
        String(targetAcc.avatar || ''),
        `Yêu cầu chuyển tiền ${formatVndServer(amt)} · ${cleanNote}`,
        JSON.stringify({
          cardType: 'hikari_request_card',
          requestId: reqId,
          characterId: params.characterId,
          amount: amt,
          proposedAmount,
          note: cleanNote,
          status,
          txId: String(txResult?.transaction?.id || ''),
          refCode: String(txResult?.receipt?.refCode || ''),
        }),
        now
      );

      const charAttachment =
        status === 'accepted' && txResult?.receipt
          ? JSON.stringify({
              dataUrl: txResult.billImageDataUrl || '',
              isBill: true,
              cardType: 'hikari_tx_card',
              direction: 'char_to_player',
              txId: String(txResult.transaction?.id || ''),
              refCode: String(txResult.receipt.refCode || ''),
              amount: amt,
              status: 'Thành công',
              note: cleanNote,
              characterId: params.characterId,
              senderName: String(aiAcc.holder_name),
              recipientName: String(targetAcc.holder_name),
              receipt: txResult.receipt,
            })
          : JSON.stringify({
              cardType: 'hikari_request_card',
              requestId: reqId,
              characterId: params.characterId,
              amount: amt,
              proposedAmount,
              note: cleanNote,
              status,
            });

      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, ?, ?, 'sent', ?)
      `).run(
        respMsgId,
        conv.id,
        params.characterId,
        conv.name,
        conv.avatar,
        responseMessage,
        status === 'accepted' ? 'image' : 'text',
        charAttachment,
        t2
      );

      db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ?, unread_count = unread_count + 1 WHERE id = ?').run(
        t2,
        respMsgId,
        conv.id
      );
    } catch {
      // non-fatal
    }
  }

  if (status === 'declined') {
    pushBankNotification(
      'system',
      `${String(aiAcc.holder_name)} từ chối yêu cầu chuyển tiền`,
      `${formatVndServer(amt)} · ${responseMessage}`,
      0,
      reqId
    );
  } else if (status === 'counter_offered') {
    pushBankNotification(
      'system',
      `${String(aiAcc.holder_name)} đề xuất mức ${formatVndServer(proposedAmount)}`,
      `Yêu cầu gốc ${formatVndServer(amt)} · Chờ bạn xác nhận nhận`,
      proposedAmount,
      reqId
    );
  }

  const savedReq = db.prepare('SELECT * FROM banking_payment_requests WHERE id = ?').get(reqId) as Record<string, unknown>;
  return {
    ok: true,
    request: savedReq,
    transaction: txResult?.transaction,
    receipt: txResult?.receipt,
  };
}

export function respondToCharTransferRequest(params: {
  requestId: string;
  action: 'confirm' | 'cancel';
}): {
  ok: boolean;
  error?: string;
  request?: Record<string, unknown>;
  transaction?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
} {
  const reqRow = db
    .prepare('SELECT * FROM banking_payment_requests WHERE id = ?')
    .get(params.requestId) as Record<string, unknown> | undefined;
  if (!reqRow) {
    return { ok: false, error: 'Không tìm thấy yêu cầu chuyển tiền.' };
  }

  const curStatus = String(reqRow.status || '');
  if (params.action === 'cancel') {
    if (curStatus === 'accepted' || curStatus === 'cancelled') {
      return { ok: false, error: 'Yêu cầu này đã hoàn tất hoặc đã hủy trước đó.' };
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE banking_payment_requests SET status = 'cancelled', responded_at = ? WHERE id = ?").run(now, params.requestId);
    return {
      ok: true,
      request: db.prepare('SELECT * FROM banking_payment_requests WHERE id = ?').get(params.requestId) as Record<string, unknown>,
    };
  }

  if (curStatus !== 'counter_offered' || String(reqRow.transaction_id || '') !== '') {
    return { ok: false, error: 'Yêu cầu không ở trạng thái chờ xác nhận đề xuất mới.' };
  }

  const charId = String(reqRow.target_character_id || '');
  const finalAmount = Math.round(Number(reqRow.proposed_amount || reqRow.amount || 0));
  if (!charId || finalAmount < 1000) {
    return { ok: false, error: 'Dữ liệu đề xuất chưa hợp lệ để xác nhận.' };
  }

  const txRes = executeAiToUserTransfer({
    characterId: charId,
    targetAccountId: String(reqRow.account_id || 'bank_1'),
    amount: finalAmount,
    note: String(reqRow.note || 'Chuyển tiền theo đề xuất Hikari Bank'),
    sourceType: 'chat_request',
    sourceChatId: String(reqRow.source_chat_id || ''),
    scenario: 'request_accepted',
    idempotencyKey: `req_confirm_${params.requestId}`,
    postToChat: true,
  });

  if (!txRes.ok) {
    return { ok: false, error: txRes.reason || 'Không thể hoàn tất chuyển tiền.' };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE banking_payment_requests
    SET status = 'accepted', transaction_id = ?, ref_tx_id = ?, responded_at = ?, response_message = ?
    WHERE id = ?
  `).run(
    String(txRes.transaction?.id || ''),
    String(txRes.transaction?.id || ''),
    now,
    `Bạn đã xác nhận nhận ${formatVndServer(finalAmount)} từ đề xuất.`,
    params.requestId
  );

  return {
    ok: true,
    request: db.prepare('SELECT * FROM banking_payment_requests WHERE id = ?').get(params.requestId) as Record<string, unknown>,
    transaction: txRes.transaction,
    receipt: txRes.receipt,
  };
}

export function executeSimulatedDepositOrWithdraw(params: {
  mode: 'deposit' | 'withdraw';
  accountId?: string;
  sourceCardId?: string;
  amount: number;
  counterparty?: string;
  note?: string;
  idempotencyKey?: string;
}): {
  ok: boolean;
  error?: string;
  idempotentHit?: boolean;
  transaction?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  cashbackEarned?: number;
  pointsEarned?: number;
} {
  const idem = (params.idempotencyKey || '').trim();
  if (idem) {
    const existing = db
      .prepare('SELECT * FROM banking_transactions_demo WHERE idempotency_key = ? LIMIT 1')
      .get(idem) as Record<string, unknown> | undefined;
    if (existing) {
      let parsedReceipt = {};
      try {
        parsedReceipt = JSON.parse(String(existing.receipt_json || '{}'));
      } catch {
        parsedReceipt = {};
      }
      return { ok: true, idempotentHit: true, transaction: existing, receipt: parsedReceipt };
    }
  }

  const num = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(num) || num < 1000) {
    return { ok: false, error: 'Số tiền giao dịch tối thiểu là 1.000 VNĐ' };
  }

  let srcCard: Record<string, unknown> | null = null;
  if (params.mode === 'withdraw' && params.sourceCardId) {
    const foundCard = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.sourceCardId) as
      | Record<string, unknown>
      | undefined;
    if (!foundCard) {
      return { ok: false, error: 'Không tìm thấy thẻ nguồn đã chọn' };
    }
    if (String(foundCard.linked_status || 'linked') === 'unlinked' || !String(foundCard.account_id || '').trim()) {
      return { ok: false, error: 'Thẻ đang ngưng liên kết tài khoản thanh toán.' };
    }
    srcCard = foundCard;
  }

  const resolvedTargetAccountId = srcCard ? String(srcCard.account_id) : params.accountId;
  const acc = (resolvedTargetAccountId
    ? db.prepare("SELECT * FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(resolvedTargetAccountId)
    : db.prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'user' ORDER BY is_primary DESC LIMIT 1").get()) as
    | Record<string, unknown>
    | undefined;
  if (!acc) {
    return { ok: false, error: 'Không tìm thấy tài khoản hợp lệ' };
  }

  let fee = 0;
  let cardSpendCheck: { spentTodayBefore: number; todayStr: string } | null = null;
  if (srcCard && params.mode === 'withdraw') {
    fee = calculateCardFeeForTx({ card: srcCard, amount: num, kind: 'withdraw' });
    try {
      cardSpendCheck = validateCardBeforeSpend({ card: srcCard, amount: num, fee, kind: 'withdraw' });
    } catch (err) {
      if (err instanceof CardEngineHttpError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }

  const totalDebit = params.mode === 'withdraw' ? num + fee : num;
  const balBefore = Number(acc.balance || 0);
  const availBefore = Number(acc.available_balance ?? acc.balance ?? 0);
  if (params.mode === 'withdraw' && totalDebit > availBefore) {
    return {
      ok: false,
      error: `Số dư khả dụng (${formatVndServer(availBefore)}) không đủ để rút ${formatVndServer(num)}${fee > 0 ? ` + phí ${formatVndServer(fee)}` : ''}`,
    };
  }

  const newBal = params.mode === 'deposit' ? balBefore + num : balBefore - totalDebit;
  const newAvail = params.mode === 'deposit' ? availBefore + num : availBefore - totalDebit;
  const txId = bankUid('tx');
  const refCode = genBankRefCode();
  const now = new Date().toISOString();

  const isDeposit = params.mode === 'deposit';
  const senderName = isDeposit ? params.counterparty?.trim() || 'Quầy nạp Hikari Bank' : String(acc.holder_name);
  const senderAcc = isDeposit ? '8800-HIKARI-POS' : String(acc.account_number);
  const recipientName = isDeposit ? String(acc.holder_name) : params.counterparty?.trim() || 'ATM / Quầy Hikari Bank';
  const recipientAcc = isDeposit ? String(acc.account_number) : 'ATM-HIKARI-01';
  const note = params.note?.trim() || (isDeposit ? 'Nạp tiền vào tài khoản Hikari Bank' : 'Rút tiền từ tài khoản Hikari Bank');

  const sig = signReceiptPayload({
    txId,
    refCode,
    amount: num,
    fee,
    totalAmount: totalDebit,
    senderAccount: senderAcc,
    recipientAccount: recipientAcc,
    createdAt: now,
    status: 'Thành công',
  });

  const template: BillTemplateType = isDeposit ? 'receive' : 'withdraw';
  const channelLabel = isDeposit
    ? 'Nạp tiền mô phỏng 24/7'
    : srcCard
    ? `Rút tiền ATM · Thẻ •••• ${String(srcCard.last4 || '')}`
    : 'Rút tiền mô phỏng ATM';
  const receipt: Record<string, unknown> = {
    txId,
    template,
    refCode,
    channel: channelLabel,
    bankName: 'Hikari Bank',
    accountNumber: String(acc.account_number),
    senderName,
    senderAccount: senderAcc,
    sourceAccountId: String(acc.id),
    sourceAccountNickname: String(acc.nickname || acc.account_type || ''),
    sourceCardId: srcCard ? String(srcCard.id) : '',
    sourceCardLast4: srcCard ? String(srcCard.last4 || '') : '',
    sourceCardNickname: srcCard ? String(srcCard.card_nickname || srcCard.card_name || '') : '',
    recipientName,
    recipientAccount: recipientAcc,
    amount: num,
    fee,
    totalAmount: totalDebit,
    note,
    createdAt: now,
    status: 'Thành công',
    signature: sig,
  };

  let postEffects = { cashbackAmount: 0, pointsEarned: 0 };

  const run = db.transaction(() => {
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = ? WHERE id = ?').run(newBal, newAvail, String(acc.id));
    db.prepare(`
      INSERT INTO banking_transactions_demo (
        id, account_id, tx_type, amount, counterparty, note, status, created_at, completed_at,
        category, channel, bank_name, account_number, fee, total_debit, balance_after, ref_code,
        receipt_json, bill_template, sender_name, sender_account, receipt_sig, source_type, idempotency_key,
        source_card_id, source_card_last4
      ) VALUES (?, ?, ?, ?, ?, ?, 'Thành công', ?, ?, ?, ?, 'Hikari Bank', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      String(acc.id),
      isDeposit ? 'income' : 'expense',
      num,
      isDeposit ? senderName : recipientName,
      note,
      now,
      now,
      isDeposit ? 'Thu nhập' : 'Khác',
      channelLabel,
      String(acc.account_number),
      fee,
      totalDebit,
      newBal,
      refCode,
      JSON.stringify(receipt),
      template,
      senderName,
      senderAcc,
      sig,
      isDeposit ? 'deposit' : 'withdraw',
      idem,
      srcCard ? String(srcCard.id) : '',
      srcCard ? String(srcCard.last4 || '') : ''
    );

    if (srcCard && cardSpendCheck && !isDeposit) {
      postEffects = applyCardPostSpendEffectsInTx({
        card: srcCard,
        acc,
        txId,
        baseAmount: num,
        totalDebit,
        spentTodayBefore: cardSpendCheck.spentTodayBefore,
        todayStr: cardSpendCheck.todayStr,
        merchant: recipientName,
        category: 'Rút tiền',
        kind: 'withdraw',
        now,
      });
      if (postEffects.pointsEarned > 0 || postEffects.cashbackAmount > 0) {
        receipt.pointsEarned = postEffects.pointsEarned;
        receipt.cashbackAmount = postEffects.cashbackAmount;
        db.prepare('UPDATE banking_transactions_demo SET receipt_json = ? WHERE id = ?').run(JSON.stringify(receipt), txId);
      }
    }

    writeLedgerAudit({
      operation: isDeposit ? 'player_deposit' : 'player_withdraw',
      txId,
      accountId: String(acc.id),
      delta: isDeposit ? num : -totalDebit,
      balanceBefore: balBefore,
      balanceAfter: newBal,
      detail: note,
    });
    recordReceiptRecord({ transactionId: txId, receiptType: template });

    pushBankNotification(
      isDeposit ? 'receive' : 'transfer',
      `${isDeposit ? 'Nạp tiền' : 'Rút tiền'} ${isDeposit ? '+' : '-'}${formatVndServer(totalDebit)}`,
      `${note} · Mã GD: ${refCode}`,
      isDeposit ? num : -totalDebit,
      txId
    );
  });

  run();

  return {
    ok: true,
    transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId) as Record<string, unknown>,
    receipt,
    cashbackEarned: postEffects.cashbackAmount,
    pointsEarned: postEffects.pointsEarned,
  };
}

export function sendUserTransferNoticeToAiChat(params: {
  characterId: string;
  amount: number;
  note: string;
  refCode: string;
  txId: string;
  receipt: ServerBillPayload;
  senderName: string;
}): string {
  try {
    const char = db.prepare('SELECT id, name, avatar, personality FROM characters WHERE id = ?').get(params.characterId) as
      | { id: string; name: string; avatar: string; personality: string }
      | undefined;
    if (!char) return '';

    let conv = db
      .prepare('SELECT id FROM conversations WHERE character_id = ? AND is_group = 0 LIMIT 1')
      .get(char.id) as { id: string } | undefined;

    const now = new Date().toISOString();
    if (!conv) {
      const convId = bankUid('conv');
      db.prepare(`
        INSERT INTO conversations (id, title, is_group, avatar, character_id, updated_at, unread_count)
        VALUES (?, ?, 0, ?, ?, ?, 1)
      `).run(convId, char.name, char.avatar || '', char.id, now);
      conv = { id: convId };
    }

    const billUrl = renderBillSvgDataUrl(params.receipt);
    const billMsgId = bankUid('msg');
    const replyMsgId = bankUid('msg');
    const t2 = new Date(Date.now() + 250).toISOString();

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, created_at
      ) VALUES (?, ?, 'user', 'user_1', ?, '', ?, 'image', ?, 'sent', ?)
    `).run(
      billMsgId,
      conv.id,
      params.senderName,
      `Đã chuyển ${formatVndServer(params.amount)} qua Hikari Bank (${params.note || 'Chuyển khoản'})`,
      JSON.stringify({
        dataUrl: billUrl,
        isBill: true,
        cardType: 'hikari_tx_card',
        direction: 'player_to_char',
        txId: params.txId,
        refCode: params.refCode,
        amount: params.amount,
        status: 'Thành công',
        note: params.note || 'Chuyển khoản',
        characterId: params.characterId,
        senderName: params.senderName,
        recipientName: char.name,
        receipt: params.receipt,
      }),
      now
    );

    const reactionText =
      params.amount >= 5000000
        ? `Ơ kìa, mình vừa nhận được tận ${formatVndServer(params.amount)} qua Hikari Bank từ bạn luôn đó! Cảm ơn bạn nhiều lắm, có chuyện gì vui mà hào phóng thế?`
        : `Mình vừa nhận được ${formatVndServer(params.amount)} từ bạn rồi nhé (mã ${params.refCode}). Cảm ơn bạn nha!`;

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, created_at
      ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?)
    `).run(replyMsgId, conv.id, char.id, char.name, char.avatar || '', reactionText, t2);

    db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ?, unread_count = unread_count + 1 WHERE id = ?').run(
      t2,
      replyMsgId,
      conv.id
    );

    db.prepare('UPDATE banking_transactions_demo SET source_chat_id = ? WHERE id = ?').run(conv.id, params.txId);
    return conv.id;
  } catch {
    return '';
  }
}

function parseVietnameseMoneyAmount(text: string): number | null {
  const clean = text.toLowerCase().replace(/,/g, '.');
  // Check explicit millions: "2tr", "1.5 triệu", "2 trieu"
  const trMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|m)\b/);
  if (trMatch) {
    const val = parseFloat(trMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) return Math.round(val * 1_000_000);
  }
  // Check thousands: "500k", "200 nghìn", "150 ngàn"
  const kMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:k|ngàn|nghin|nghìn)\b/);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) return Math.round(val * 1_000);
  }
  // Check raw number >= 1000 with optional separators like 1.500.000 or 500000
  const dotNumMatch = clean.match(/\b(\d{1,3}(?:\.\d{3})+)(?:\s*(?:đ|d|vnd|vnđ))?/);
  if (dotNumMatch) {
    const val = Number(dotNumMatch[1].replace(/\./g, ''));
    if (Number.isFinite(val) && val >= 1000) return val;
  }
  const plainNumMatch = clean.match(/\b(\d{4,10})\b/);
  if (plainNumMatch) {
    const val = Number(plainNumMatch[1]);
    if (Number.isFinite(val) && val >= 1000) return val;
  }
  return null;
}

export const HIKARI_APPROVE_TAG = '[[HIKARI_APPROVE_TRANSFER]]';

export function stripHikariTransferTags(text: string): string {
  return String(text || '')
    .replace(/\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface PendingChatBankingTransfer {
  characterId: string;
  conversationId: string;
  amount: number;
  note: string;
  isLoan: boolean;
  characterName: string;
  aiAccountNumber: string;
}

export function prepareAiChatBankingContext(params: {
  characterId: string;
  conversationId: string;
  userText: string;
  character: { id: string; name: string; personality?: string };
}): {
  systemHintForGemini: string;
  pendingTransfer?: PendingChatBankingTransfer;
  resendReceipt?: {
    txId: string;
    refCode: string;
    amount: number;
    billImageDataUrl: string;
    receipt: Record<string, unknown>;
  };
} {
  ensureAiCharacterBankAccount(db, params.characterId);
  const aiAcc = db
    .prepare("SELECT * FROM banking_accounts_demo WHERE owner_type = 'ai' AND character_id = ?")
    .get(params.characterId) as Record<string, unknown> | undefined;

  if (!aiAcc) {
    return { systemHintForGemini: '' };
  }

  const aiBalance = Number(aiAcc.available_balance ?? aiAcc.balance ?? 0);
  const personality = String(aiAcc.financial_personality || 'balanced');
  const txt = (params.userText || '').trim();
  const lower = txt.toLowerCase();

  // Check if user asks character to RESEND a real past receipt
  const asksResendReceipt =
    /((gửi lại|xin lại|cho xem lại|xem lại|lấy lại|tìm lại|nhắc lại).{0,25}(bill|biên lai|hóa đơn|chứng từ|mã giao dịch|giao dịch)|(bill|biên lai|hóa đơn|chứng từ).{0,20}(cũ|trước|lúc nãy|vừa nãy|hôm trước|gần nhất|mới nhất|đã chuyển))/i.test(
      lower
    );

  if (asksResendReceipt) {
    const refMatch = txt.match(/\b(?:HK|PB)[A-Z0-9]{6,18}\b/i);
    const requestedRef = refMatch ? refMatch[0].toUpperCase() : '';
    const requestedAmount = parseVietnameseMoneyAmount(txt);
    const aiAccId = String(aiAcc.id);
    const aiHolder = String(aiAcc.holder_name || params.character.name);

    const candidates = db
      .prepare(
        `SELECT * FROM banking_transactions_demo
         WHERE status = 'Thành công'
           AND (account_id = ? OR target_account_id = ? OR counterparty = ? OR sender_name = ?)
         ORDER BY created_at DESC LIMIT 40`
      )
      .all(aiAccId, aiAccId, aiHolder, aiHolder) as Array<Record<string, unknown>>;

    const userSideFirst = candidates.sort((a, b) => {
      const aUser = String(a.account_id || '').startsWith('bank_') ? 0 : 1;
      const bUser = String(b.account_id || '').startsWith('bank_') ? 0 : 1;
      if (aUser !== bUser) return aUser - bUser;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    const matchedTx =
      (requestedRef
        ? userSideFirst.find((t) => String(t.ref_code || '').toUpperCase() === requestedRef)
        : undefined) ||
      (requestedAmount
        ? userSideFirst.find((t) => Number(t.amount || 0) === requestedAmount)
        : undefined) ||
      userSideFirst[0];

    if (!matchedTx) {
      return {
        systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Người dùng xin gửi lại biên lai giao dịch nhưng KHÔNG CÓ giao dịch chuyển khoản thật nào giữa bạn (${params.character.name}) và người dùng trong lịch sử ngân hàng. TUYỆT ĐỐI KHÔNG tự bịa mã giao dịch hay giả vờ đã gửi biên lai; hãy nói rõ chưa có giao dịch thành công nào gần đây.]`,
      };
    }

    let parsedReceipt: Record<string, unknown> = {};
    try {
      parsedReceipt = JSON.parse(String(matchedTx.receipt_json || '{}')) as Record<string, unknown>;
    } catch {
      parsedReceipt = {};
    }

    const txId = String(matchedTx.id);
    const refCode = String(matchedTx.ref_code || parsedReceipt.refCode || txId.toUpperCase());
    const feeVal = Number(matchedTx.fee ?? parsedReceipt.fee ?? 0);
    const amtVal = Number(parsedReceipt.amount ?? matchedTx.amount ?? 0);
    const totalVal = Number(parsedReceipt.totalAmount ?? amtVal + feeVal);
    const isIncomeForAcc = matchedTx.tx_type === 'income';
    const isAiAccRow = String(matchedTx.account_id) === aiAccId;
    const otherName = String(matchedTx.counterparty || 'Minh Anh');

    const normalizedReceipt: ServerBillPayload & Record<string, unknown> = {
      txId,
      characterId: params.characterId,
      isAiTx: true,
      template: (parsedReceipt.template as BillTemplateType) || 'ai_tx',
      refCode,
      amount: amtVal,
      fee: feeVal,
      totalAmount: totalVal,
      senderName: String(
        matchedTx.sender_name || parsedReceipt.senderName || (isAiAccRow ? (isIncomeForAcc ? otherName : aiHolder) : isIncomeForAcc ? otherName : 'Minh Anh')
      ),
      senderAccount: String(matchedTx.sender_account || parsedReceipt.senderAccount || String(aiAcc.account_number)),
      senderAvatar: String(matchedTx.sender_avatar || parsedReceipt.senderAvatar || ''),
      recipientName: String(
        parsedReceipt.recipientName || (isAiAccRow ? (isIncomeForAcc ? aiHolder : otherName) : isIncomeForAcc ? 'Minh Anh' : otherName)
      ),
      recipientAccount: String(parsedReceipt.recipientAccount || matchedTx.account_number || '-'),
      recipientAvatar: String(matchedTx.recipient_avatar || parsedReceipt.recipientAvatar || ''),
      bankName: String(matchedTx.bank_name || parsedReceipt.bankName || 'Hikari Bank'),
      channel: String(matchedTx.channel || parsedReceipt.channel || 'Chuyển khoản CHAR · YumeChat'),
      note: String(matchedTx.note || parsedReceipt.note || 'Chuyển khoản Hikari Bank'),
      createdAt: String(matchedTx.created_at || parsedReceipt.createdAt || new Date().toISOString()),
      status: String(matchedTx.status || 'Thành công'),
    };

    const storedPng = String(matchedTx.bill_image_url || '');
    const billImageDataUrl = storedPng.startsWith('data:image/') ? storedPng : renderBillSvgDataUrl(normalizedReceipt);

    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK ĐÃ TRUY XUẤT BIÊN LAI THẬT: Giao dịch mã ${refCode}, số tiền ${formatVndServer(amtVal)}, ngày ${new Date(String(normalizedReceipt.createdAt)).toLocaleString('vi-VN')}, nội dung "${String(normalizedReceipt.note)}". Hệ thống đã tự động đính kèm ảnh biên lai mô phỏng thật ngay sau tin nhắn của bạn, hãy xác nhận ngắn gọn với người dùng.]`,
      resendReceipt: {
        txId,
        refCode,
        amount: amtVal,
        billImageDataUrl,
        receipt: normalizedReceipt,
      },
    };
  }

  // Check if user is asking about balance or asking CHAR to transfer money
  const asksBalance =
    /(còn bao nhiêu tiền|số dư|tài khoản.*còn|có đủ tiền|check ví|xem ví|ví của (cậu|em|anh|bạn))/i.test(lower);
  const asksTransfer =
    /(chuyển khoản|chuyển cho|chuyển tiền|gửi tiền|gửi cho|bank cho|cho.*mượn|cho.*vay|ứng cho|chia tiền|trả lại|hoàn tiền|lì xì|send money|transfer)/i.test(
      lower
    );

  if (!asksBalance && !asksTransfer) {
    return {
      systemHintForGemini: `\n[Thông tin Hikari Bank của ${params.character.name}: STK ${String(aiAcc.account_number)}. TUYỆT ĐỐI không tiết lộ con số số dư tài khoản của bạn, không tự bịa đã chuyển khoản hoặc tự bịa biên lai nếu hệ thống chưa xác nhận giao dịch.]`,
    };
  }

  if (asksBalance && !asksTransfer) {
    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Người dùng đang hỏi về số dư hoặc tiền trong tài khoản của bạn. Theo nguyên tắc riêng tư, TUYỆT ĐỐI KHÔNG tiết lộ con số số dư tài khoản ngân hàng cụ thể; hãy trả lời khéo léo, tự nhiên theo tính cách nhân vật (${personality}).]`,
    };
  }

  // Player messaged CHAR asking CHAR to transfer money
  const parsedAmount = parseVietnameseMoneyAmount(txt);
  const rel = db
    .prepare('SELECT affection, trust, conflict FROM ai_relationships WHERE character_id = ?')
    .get(params.characterId) as { affection: number; trust: number; conflict: number } | undefined;

  const affection = rel?.affection ?? 55;
  const trust = rel?.trust ?? 55;
  const conflict = rel?.conflict ?? 0;

  // Missing amount
  if (!parsedAmount) {
    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Người dùng nhắn nhờ bạn chuyển tiền/cho vay nhưng CHƯA NÊU RÕ SỐ TIỀN cụ thể. Giao dịch CHƯA được thực hiện. Hãy hỏi lại người dùng muốn chuyển bao nhiêu tiền và lý do, và TUYỆT ĐỐI không tiết lộ số dư tài khoản của bạn.]`,
    };
  }

  // Conflict check
  if (conflict >= 35) {
    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Quan hệ hiện đang căng thẳng (conflict ${conflict}), giao dịch KHÔNG được phép thực hiện. Hãy từ chối khéo léo theo tâm trạng hiện tại, TUYỆT ĐỐI không gắn ${HIKARI_APPROVE_TAG}, không nói đã chuyển và không tiết lộ số dư.]`,
    };
  }

  const maxRatio =
    personality === 'generous' || personality === 'wealthy'
      ? 0.85
      : personality === 'cautious' || personality === 'frugal'
      ? 0.35
      : 0.6;

  if (parsedAmount > aiBalance) {
    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Giao dịch ${formatVndServer(parsedAmount)} KHÔNG THỂ THỰC HIỆN vì vượt quá khả năng tài chính hiện tại của bạn. TUYỆT ĐỐI không nói là đã chuyển, không tự bịa biên lai, không gắn ${HIKARI_APPROVE_TAG}, và KHÔNG tiết lộ con số số dư cụ thể; hãy từ chối khéo léo theo tính cách.]`,
    };
  }

  if (parsedAmount > aiBalance * maxRatio && trust < 65 && affection < 75) {
    return {
      systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK: Số tiền ${formatVndServer(parsedAmount)} vượt quá mức sẵn sàng chi của tính cách "${personality}" với mức độ tin tưởng hiện tại (${trust}/100). Hãy từ chối khéo hoặc đề nghị mức nhỏ hơn; TUYỆT ĐỐI không gắn ${HIKARI_APPROVE_TAG}, không nói đã chuyển và không tiết lộ số dư tài khoản.]`,
    };
  }

  const isLoan = /vay|mượn/i.test(lower);
  const transferNote = isLoan
    ? `${params.character.name} cho vay qua YumeChat`
    : `${params.character.name} chuyển khoản qua YumeChat`;

  return {
    systemHintForGemini: `\n[HỆ THỐNG HIKARI BANK — CHỜ BẠN QUYẾT ĐỊNH CHUYỂN TIỀN: Người dùng vừa nhắn tin nhờ bạn chuyển ${formatVndServer(parsedAmount)}${isLoan ? ' (hỏi vay/mượn)' : ''}. Tài khoản của bạn đủ khả năng thực hiện nếu bạn đồng ý.\n- BẠN TỰ QUYẾT ĐỊNH đồng ý hay từ chối dựa trên tính cách (${personality}), tâm trạng và mức độ tin tưởng (affection ${affection}, trust ${trust}).\n- NẾU BẠN ĐỒNG Ý CHUYỂN NGAY BÂY GIỜ: Trả lời đồng ý chuyển tiền tự nhiên (KHÔNG tự bịa mã giao dịch giả) VÀ đặt đúng thẻ ${HIKARI_APPROVE_TAG} ở cuối câu trả lời (hoặc approveTransfer=true trong metadata). Chỉ sau khi có xác nhận này hệ thống mới trừ tiền của bạn, gửi biên lai Hikari Bank thật vào chat và cộng tiền vào tài khoản người dùng.\n- NẾU BẠN TỪ CHỐI / CHƯA MUỐN CHUYỂN: Từ chối tự nhiên, TUYỆT ĐỐI KHÔNG gắn ${HIKARI_APPROVE_TAG} (approveTransfer=false) và không nói đã chuyển. TUYỆT ĐỐI KHÔNG tiết lộ con số số dư của bạn.]`,
    pendingTransfer: {
      characterId: params.characterId,
      conversationId: params.conversationId,
      amount: parsedAmount,
      note: transferNote,
      isLoan,
      characterName: params.character.name,
      aiAccountNumber: String(aiAcc.account_number),
    },
  };
}

export function finalizeAiChatBankingTransfer(params: {
  pendingTransfer?: PendingChatBankingTransfer;
  replyText: string;
  schemaApproved?: boolean;
}): {
  executedTransfer?: {
    txId: string;
    refCode: string;
    amount: number;
    billImageDataUrl: string;
    receipt: Record<string, unknown>;
  };
} {
  if (!params.pendingTransfer) return {};
  const hasTag = /\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/i.test(params.replyText || '');
  const approved = Boolean(params.schemaApproved || hasTag);
  if (!approved) return {};

  const transferRes = executeAiToUserTransfer({
    characterId: params.pendingTransfer.characterId,
    amount: params.pendingTransfer.amount,
    note: params.pendingTransfer.note,
    kind: params.pendingTransfer.isLoan ? 'loan' : 'transfer',
    sourceType: 'yumechat',
    sourceChatId: params.pendingTransfer.conversationId,
    postToChat: false,
  });

  if (!transferRes.ok || !transferRes.billImageDataUrl || !transferRes.receipt) {
    return {};
  }

  const refCode = String(transferRes.receipt.refCode || '');
  const txId = String(transferRes.receipt.txId || '');

  return {
    executedTransfer: {
      txId,
      refCode,
      amount: params.pendingTransfer.amount,
      billImageDataUrl: transferRes.billImageDataUrl,
      receipt: transferRes.receipt,
    },
  };
}

