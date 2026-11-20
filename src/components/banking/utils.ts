import type { BankingTransactionDemo, BillTemplateType } from '../../types/os';

export const HIKARI_AVATAR_TELLER = '/src/assets/images/hikari_teller_portrait_1795080144861.jpg';
export const HIKARI_BANNER_SKYLINE = '/src/assets/images/hikari_banner_skyline_1795080144709.jpg';

export function formatVnd(amount: number, masked = false): string {
  if (masked) return '•••••••• VNĐ';
  const rounded = Math.round(Number(amount || 0));
  return `${rounded.toLocaleString('de-DE')} VNĐ`;
}

export function formatVndCompact(amount: number): string {
  const n = Math.round(Number(amount || 0));
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}đ`;
}

export function formatShortDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTimeAgoOrDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng (Ohayō)';
  if (h < 14) return 'Chào buổi trưa (Konnichiwa)';
  if (h < 18) return 'Chào buổi chiều (Konbanwa)';
  return 'Chào buổi tối (Oyasumi)';
}

export function isSuccessBillableTx(tx?: Partial<BankingTransactionDemo> | null): boolean {
  if (!tx) return false;
  const st = String(tx.status || '').toLowerCase();
  if (st.includes('thất bại') || st.includes('lỗi') || st.includes('từ chối')) return false;
  if (st.includes('đang xử lý') || st.includes('chờ') || st.includes('pending')) return false;
  if (tx.bill_template === 'failed') return false;
  return true;
}

export const PARTNER_BANKS = [
  { code: 'HIKARI', name: 'Hikari Bank', short: 'HK', color: '#E14B5A' },
  { code: 'VCB', name: 'Vietcombank', short: 'VCB', color: '#059669' },
  { code: 'TCB', name: 'Techcombank', short: 'TCB', color: '#DC2626' },
  { code: 'MB', name: 'MB Bank', short: 'MB', color: '#1D4ED8' },
  { code: 'ACB', name: 'ACB', short: 'ACB', color: '#0284C7' },
  { code: 'BIDV', name: 'BIDV', short: 'BIDV', color: '#0F766E' },
  { code: 'VPB', name: 'VPBank', short: 'VPB', color: '#16A34A' },
  { code: 'TPB', name: 'TPBank', short: 'TPB', color: '#7C3AED' },
  { code: 'VTB', name: 'VietinBank', short: 'CTG', color: '#0369A1' },
];

export const TRANSFER_SUGGESTED_AMOUNTS = [100000, 200000, 500000, 1000000, 5000000, 10000000];

export const TRANSFER_NOTE_PRESETS = [
  'Chuyển tiền sinh hoạt',
  'Thanh toán tiền ăn uống',
  'Chia tiền hóa đơn nhóm',
  'Gửi tiết kiệm & hỗ trợ',
  'Thanh toán mua hàng',
  'Trả nợ / hoàn ứng',
];

export const TRANSFER_METHODS = [
  { id: 'internal', label: 'Chuyển khoản nội bộ Hikari Bank', fee: 0, speed: 'Tức thì (0đ)' },
  { id: 'napas247', label: 'Chuyển nhanh 24/7 Liên ngân hàng', fee: 0, speed: 'Nhanh 24/7 (0đ)' },
  { id: 'express', label: 'Chuyển tiền Hỏa tốc Ưu tiên', fee: 11000, speed: 'Ưu tiên (< 3s · 11.000đ)' },
  { id: 'regular', label: 'Chuyển tiền thông thường', fee: 0, speed: 'Trong ngày (0đ)' },
];

export const EXPENSE_CATEGORIES = [
  { name: 'Ăn uống', color: '#F59E0B', bg: 'bg-amber-500/15 text-amber-600' },
  { name: 'Mua sắm', color: '#EC4899', bg: 'bg-pink-500/15 text-pink-600' },
  { name: 'Giải trí', color: '#8B5CF6', bg: 'bg-violet-500/15 text-violet-600' },
  { name: 'Đi lại', color: '#06B6D4', bg: 'bg-cyan-500/15 text-cyan-600' },
  { name: 'Nhà ở', color: '#E14B5A', bg: 'bg-rose-500/15 text-rose-600' },
  { name: 'Sức khỏe', color: '#10B981', bg: 'bg-emerald-500/15 text-emerald-600' },
  { name: 'Học tập', color: '#6366F1', bg: 'bg-indigo-500/15 text-indigo-600' },
  { name: 'Du lịch', color: '#0EA5E9', bg: 'bg-sky-500/15 text-sky-600' },
  { name: 'Chuyển khoản', color: '#E14B5A', bg: 'bg-rose-600/15 text-rose-600' },
  { name: 'Khác', color: '#64748B', bg: 'bg-slate-500/15 text-slate-600' },
];

export const BILL_CATEGORIES = [
  'Điện',
  'Nước',
  'Internet',
  'Truyền hình',
  'Điện thoại',
  'Học phí',
  'Viện phí',
  'Thuê nhà',
  'Mua sắm',
  'Dịch vụ khác',
];

export const SAVINGS_PACKAGES = [
  { id: 'demand', name: 'Không kỳ hạn (Rút bất kỳ lúc nào)', product_type: 'demand', term_months: 0, rate: 1.2 },
  { id: '1w', name: 'Tiết kiệm Siêu ngắn 1 tuần', product_type: 'flexible', term_months: 0.25, rate: 2.5 },
  { id: '1m', name: 'Tiết kiệm Online 1 tháng', product_type: 'online', term_months: 1, rate: 4.1 },
  { id: '3m', name: 'Tiết kiệm Online 3 tháng', product_type: 'online', term_months: 3, rate: 4.8 },
  { id: '6m', name: 'Tiết kiệm Online 6 tháng', product_type: 'online', term_months: 6, rate: 5.6 },
  { id: '9m', name: 'Tiết kiệm Có kỳ hạn 9 tháng', product_type: 'term', term_months: 9, rate: 6.0 },
  { id: '12m', name: 'Tiết kiệm Tích lũy 12 tháng', product_type: 'accumulation', term_months: 12, rate: 6.5 },
  { id: '24m', name: 'Tiết kiệm Hikari Premier 24 tháng', product_type: 'term', term_months: 24, rate: 7.0 },
];

export const CARD_TIERS = [
  { type: 'hikari_classic', label: 'Hikari Classic Debit', theme: 'coral', annualFee: 'Miễn phí', gradient: 'from-[#E14B5A] via-[#C83242] to-[#881337]' },
  { type: 'hikari_premier', label: 'Hikari Premier Global', theme: 'sumi', annualFee: 'Miễn phí chuyển', gradient: 'from-[#1E293B] via-[#334155] to-[#0F172A]' },
  { type: 'hikari_anime', label: 'Hikari Anime Edition', theme: 'sakura', annualFee: 'Hoàn tiền 5%', gradient: 'from-[#DB5A82] via-[#EC4899] to-[#9D174D]' },
  { type: 'hikari_character', label: 'Hikari Character Edition', theme: 'sunrise', annualFee: 'Phiên bản CHAR', gradient: 'from-[#F59E0B] via-[#E14B5A] to-[#7C2D12]' },
  { type: 'domestic_debit', label: 'Hikari Classic Nội địa', theme: 'coral', annualFee: 'Miễn phí', gradient: 'from-[#E14B5A] via-[#C83242] to-[#881337]' },
  { type: 'international_debit', label: 'Hikari Global Quốc tế', theme: 'sumi', annualFee: 'Miễn phí năm đầu', gradient: 'from-[#1E293B] via-[#3B82F6] to-[#1E3A8A]' },
  { type: 'credit', label: 'Hikari Cashback Credit', theme: 'emerald', annualFee: 'Hoàn tiền 5%', gradient: 'from-[#0B2E2B] via-[#0F6E61] to-[#10B981]' },
  { type: 'premium', label: 'Hikari Premier Ưu tiên', theme: 'coral', annualFee: 'Đặc quyền Lounge', gradient: 'from-[#E14B5A] via-[#9F1239] to-[#4C0519]' },
  { type: 'platinum', label: 'Hikari World Platinum', theme: 'obsidian', annualFee: 'Hạn mức 150tr', gradient: 'from-[#0F172A] via-[#1E293B] to-[#334155]' },
  { type: 'black_edition', label: 'Hikari Black Private', theme: 'black', annualFee: 'Giới hạn 300tr+', gradient: 'from-[#050811] via-[#111827] to-[#1F2937]' },
];

export function getCardGradient(cardType?: string, designTheme?: string): string {
  const matched = CARD_TIERS.find((t) => t.type === cardType || t.theme === designTheme);
  return matched?.gradient || 'from-[#E14B5A] via-[#C83242] to-[#881337]';
}

export const INVESTMENT_CATALOG = [
  { asset_code: 'PBFUND', asset_name: 'Quỹ Mở Tăng Trưởng HK-VN30', asset_type: 'Quỹ mở', current_price: 45500, changePct: '+8.3%' },
  { asset_code: 'PBVN30', asset_name: 'Chứng chỉ Quỹ Cổ phiếu HK-Bluechip', asset_type: 'Cổ phiếu', current_price: 32800, changePct: '+4.6%' },
  { asset_code: 'GOLD99', asset_name: 'Vàng Kỹ Thuật Số 9999', asset_type: 'Vàng số', current_price: 8650000, changePct: '+5.5%' },
  { asset_code: 'TECHAI', asset_name: 'Quỹ Công Nghệ & AI Tokyo', asset_type: 'Quỹ chuyên đề', current_price: 58400, changePct: '+12.4%' },
];

export const BILL_TEMPLATE_LABELS: Record<BillTemplateType, string> = {
  transfer: 'Chuyển tiền',
  receive: 'Nhận tiền',
  topup: 'Nạp điện thoại',
  bill: 'Thanh toán hóa đơn',
  shopping: 'Mua sắm / Thẻ',
  withdraw: 'Rút tiền',
  savings_open: 'Mở tiết kiệm',
  savings_settle: 'Tất toán tiết kiệm',
  loan_pay: 'Trả nợ vay',
  ai_tx: 'Giao dịch Nhân vật CHAR',
  refund: 'Hoàn tiền',
  failed: 'Giao dịch lỗi',
};

export function inferBillTemplate(tx: BankingTransactionDemo): BillTemplateType {
  if (tx.bill_template) return tx.bill_template;
  if (String(tx.status || '').includes('Thất bại')) return 'failed';
  if (tx.is_ai_tx) return 'ai_tx';
  if (tx.tx_type === 'income') {
    if ((tx.category || '').includes('Tiền lãi')) return 'savings_settle';
    if ((tx.note || '').toLowerCase().includes('hoàn tiền')) return 'refund';
    return 'receive';
  }
  const cat = (tx.category || '').toLowerCase();
  const note = (tx.note || '').toLowerCase();
  if (note.includes('nạp tiền điện thoại') || (tx.channel || '').includes('Nạp tiền ĐT')) return 'topup';
  if (cat.includes('tiết kiệm')) return 'savings_open';
  if (cat.includes('trả nợ')) return 'loan_pay';
  if ((tx.channel || '').includes('Hóa đơn') || cat.includes('nhà ở') || cat.includes('sức khỏe') || cat.includes('học')) return 'bill';
  if ((tx.channel || '').includes('Thẻ') || cat.includes('mua sắm')) return 'shopping';
  return 'transfer';
}

export const TIER_ORDER = ['Standard', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Private Banking'] as const;

export const AVATAR_PRESETS = [
  '/src/assets/images/char_sakura_1794880090451.jpg',
  '/src/assets/images/char_yuki_1794880089308.jpg',
  '/src/assets/images/char_akira_1794880089961.jpg',
  '/src/assets/images/char_rin_1794880090553.jpg',
];

export function maskAccountNumber(raw?: string): string {
  const clean = String(raw || '').trim();
  if (!clean || clean === '-') return '••••-••••';
  if (clean.includes('•') || clean.includes('*')) return clean;
  const digits = clean.replace(/[^A-Za-z0-9]/g, '');
  if (digits.length <= 4) return clean;
  if (digits.length <= 7) {
    return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
  }
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length >= 3) {
      return `${parts[0]}-••••-${parts[parts.length - 1]}`;
    }
  }
  return `${digits.slice(0, 4)}-••••-${digits.slice(-4)}`;
}

export function isCardExpired(expiry?: string): boolean {
  const clean = String(expiry || '').trim();
  const match = clean.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  return year < curYear || (year === curYear && month < curMonth);
}

export async function dataUrlToPngFile(dataUrl: string, filename: string): Promise<File | null> {
  if (!dataUrl || typeof File === 'undefined') return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const safeName = filename.endsWith('.png') ? filename : `${filename}.png`;
    return new File([blob], safeName, { type: 'image/png' });
  } catch {
    return null;
  }
}

export async function sharePngViaNativeSystem(
  dataUrl: string,
  filename: string,
  title: string,
  text: string
): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }
  try {
    const file = await dataUrlToPngFile(dataUrl, filename);
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return 'shared';
    }
    await navigator.share({ title, text });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
    return 'unsupported';
  }
}
