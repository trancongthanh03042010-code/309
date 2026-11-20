import type { BankingTransactionDemo, BillTemplateType } from '../../types/os';
import { formatVnd, inferBillTemplate, maskAccountNumber } from './utils';

export interface BillRenderInput {
  txId?: string;
  template?: BillTemplateType;
  refCode: string;
  amount: number;
  fee?: number;
  totalAmount?: number;
  senderName: string;
  senderAccount: string;
  senderBank?: string;
  senderAvatar?: string;
  recipientName: string;
  recipientAccount: string;
  recipientAvatar?: string;
  bankName: string;
  channel: string;
  note: string;
  createdAt: string;
  status: string;
  signature?: string;
  sourceCardLast4?: string;
  cashbackAmount?: number;
  pointsEarned?: number;
  simBalanceBefore?: number;
  simBalanceAfter?: number;
}

const FONT_SANS = '"Plus Jakarta Sans", "Be Vietnam Pro", "Noto Sans JP", system-ui, -apple-system, sans-serif';
const FONT_MONO = '"JetBrains Mono", "Plus Jakarta Sans", monospace';

const TEMPLATE_THEME: Record<
  BillTemplateType,
  { title: string; badge: string; accent: string; softBg: string; stamp: string }
> = {
  transfer: { title: 'BIÊN LAI CHUYỂN TIỀN', badge: 'HIKARI 24/7 · CHUYỂN KHOẢN', accent: '#E14B5A', softBg: '#FFF1F2', stamp: 'THÀNH CÔNG' },
  receive: { title: 'BIÊN LAI NHẬN TIỀN', badge: 'TIỀN VÀO TÀI KHOẢN HIKARI', accent: '#047857', softBg: '#ECFDF5', stamp: 'THÀNH CÔNG' },
  topup: { title: 'BIÊN LAI NẠP ĐIỆN THOẠI', badge: 'VIỄN THÔNG · TOP-UP', accent: '#D97706', softBg: '#FFFBEB', stamp: 'THÀNH CÔNG' },
  bill: { title: 'BIÊN LAI THANH TOÁN', badge: 'THANH TOÁN HÓA ĐƠN HIKARI', accent: '#E14B5A', softBg: '#FFF1F2', stamp: 'THÀNH CÔNG' },
  shopping: { title: 'BIÊN LAI MUA SẮM', badge: 'THANH TOÁN THẺ / QR', accent: '#DB5A82', softBg: '#FDF2F8', stamp: 'THÀNH CÔNG' },
  withdraw: { title: 'BIÊN LAI RÚT TIỀN', badge: 'RÚT TIỀN MÔ PHỎNG HIKARI', accent: '#334155', softBg: '#F1F5F9', stamp: 'THÀNH CÔNG' },
  savings_open: { title: 'XÁC NHẬN MỞ TIẾT KIỆM', badge: 'TIẾT KIỆM SỐ HIKARI', accent: '#0F766E', softBg: '#F0FDFA', stamp: 'THÀNH CÔNG' },
  savings_settle: { title: 'BIÊN LAI TẤT TOÁN', badge: 'TRẢ GỐC & LÃI HIKARI', accent: '#047857', softBg: '#ECFDF5', stamp: 'THÀNH CÔNG' },
  loan_pay: { title: 'BIÊN LAI TRẢ NỢ VAY', badge: 'TÍN DỤNG HIKARI BANK', accent: '#B8283B', softBg: '#FFF1F2', stamp: 'THÀNH CÔNG' },
  ai_tx: { title: 'BIÊN LAI CHUYỂN TIỀN', badge: 'HIKARI BANK × YUMECHAT CHAR', accent: '#E14B5A', softBg: '#FFF1F2', stamp: 'THÀNH CÔNG' },
  refund: { title: 'BIÊN LAI HOÀN TIỀN', badge: 'HOÀN TIỀN TỰ ĐỘNG HIKARI', accent: '#047857', softBg: '#ECFDF5', stamp: 'THÀNH CÔNG' },
  failed: { title: 'BIÊN LAI GIAO DỊCH LỖI', badge: 'GIAO DỊCH BỊ TỪ CHỐI', accent: '#DC2626', softBg: '#FEF2F2', stamp: 'THẤT BẠI' },
};

function resolveStatusVisual(statusRaw: string, template: BillTemplateType) {
  const low = String(statusRaw || '').toLowerCase();
  if (template === 'failed' || low.includes('thất bại') || low.includes('lỗi') || low.includes('từ chối')) {
    return { label: 'THẤT BẠI', bg: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C', dot: '#DC2626' };
  }
  if (low.includes('đang xử lý') || low.includes('chờ') || low.includes('pending')) {
    return { label: 'ĐANG XỬ LÝ', bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', dot: '#D97706' };
  }
  return { label: 'THÀNH CÔNG', bg: '#D1FAE5', border: '#6EE7B7', text: '#047857', dot: '#10B981' };
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 4): string[] {
  const normalized = String(text || '-').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return ['-'];

  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!line && ctx.measureText(w).width > maxWidth) {
      let chunk = '';
      for (const ch of w) {
        if (ctx.measureText(chunk + ch).width <= maxWidth) {
          chunk += ch;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
          if (lines.length >= maxLines) break;
        }
      }
      line = lines.length < maxLines ? chunk : '';
      if (lines.length >= maxLines) break;
      continue;
    }

    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && ctx.measureText(lines[maxLines - 1]).width > maxWidth) {
    let s = lines[maxLines - 1];
    while (s.length > 3 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
    lines[maxLines - 1] = `${s}…`;
  }
  return lines;
}

function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAvatarOrInitial(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  name: string,
  cx: number,
  cy: number,
  radius: number,
  bgHex: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = bgHex;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const initial = (String(name || 'H').trim().charAt(0) || 'H').toUpperCase();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(radius * 0.9)}px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, cy + 1);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHikariVectorLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  drawRoundRect(ctx, x, y, size, size, 14);
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(253,224,71,0.18)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const cx = x + size / 2;
  const sunY = y + size * 0.36;
  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.arc(cx, sunY, size * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Stylized Sun Rays
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const rays = [
    [0, -1],
    [-0.7, -0.7],
    [0.7, -0.7],
    [-1, 0],
    [1, 0],
  ];
  for (const [rx, ry] of rays) {
    ctx.beginPath();
    ctx.moveTo(cx + rx * size * 0.21, sunY + ry * size * 0.21);
    ctx.lineTo(cx + rx * size * 0.29, sunY + ry * size * 0.29);
    ctx.stroke();
  }

  // Stylized "H" Monogram below sun
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  const leftX = cx - size * 0.18;
  const rightX = cx + size * 0.18;
  const topY = y + size * 0.45;
  const botY = y + size * 0.79;
  const midY = (topY + botY) / 2;
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(leftX, botY);
  ctx.moveTo(rightX, topY);
  ctx.lineTo(rightX, botY);
  ctx.moveTo(leftX, midY);
  ctx.lineTo(rightX, midY);
  ctx.stroke();
  ctx.restore();
}

function drawSimQrMatrix(
  ctx: CanvasRenderingContext2D,
  payload: string,
  qrX: number,
  qrY: number,
  qrSize: number,
  accentColor: string
) {
  const cells = 21;
  const cellPx = qrSize / cells;
  let seed = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    seed ^= payload.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const drawFinder = (cx: number, cy: number) => {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(qrX + cx * cellPx, qrY + cy * cellPx, 7 * cellPx, 7 * cellPx);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrX + (cx + 1) * cellPx, qrY + (cy + 1) * cellPx, 5 * cellPx, 5 * cellPx);
    ctx.fillStyle = accentColor;
    ctx.fillRect(qrX + (cx + 2) * cellPx, qrY + (cy + 2) * cellPx, 3 * cellPx, 3 * cellPx);
  };
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inFinder = (r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8);
      if (inFinder) continue;
      seed = Math.imul(seed ^ (r * 31 + c * 17), 16777619);
      if ((seed >>> 0) % 2 === 0) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(qrX + c * cellPx, qrY + r * cellPx, cellPx - 0.3, cellPx - 0.3);
      }
    }
  }
  drawFinder(0, 0);
  drawFinder(cells - 7, 0);
  drawFinder(0, cells - 7);
}

export function txToBillInput(
  tx: BankingTransactionDemo,
  accountHolder = 'Minh Anh',
  accountNumber = '8800-2026-9901'
): BillRenderInput {
  let receipt: Record<string, unknown> = {};
  try {
    receipt = JSON.parse(tx.receipt_json || '{}') as Record<string, unknown>;
  } catch {
    receipt = {};
  }
  const template = (receipt.template as BillTemplateType) || inferBillTemplate(tx);
  const isIncome = tx.tx_type === 'income';
  const fee = Number(tx.fee ?? receipt.fee ?? 0);
  const rawAmount = Number(tx.amount || 0);
  const baseAmount =
    typeof receipt.amount === 'number'
      ? Number(receipt.amount)
      : fee > 0 && rawAmount > fee && tx.tx_type === 'expense'
      ? rawAmount - fee
      : rawAmount;
  const totalAmount =
    typeof receipt.totalAmount === 'number' ? Number(receipt.totalAmount) : baseAmount + fee;

  return {
    txId: tx.id,
    template,
    refCode: String(tx.ref_code || receipt.refCode || tx.id.toUpperCase()),
    amount: baseAmount,
    fee,
    totalAmount,
    senderName: String(tx.sender_name || receipt.senderName || (isIncome ? tx.counterparty : accountHolder)),
    senderAccount: String(tx.sender_account || receipt.senderAccount || (isIncome ? tx.account_number || '-' : accountNumber)),
    senderBank: String(receipt.senderBank || 'Hikari Bank'),
    senderAvatar: tx.sender_avatar || String(receipt.senderAvatar || ''),
    recipientName: String(receipt.recipientName || (isIncome ? accountHolder : tx.counterparty)),
    recipientAccount: String(receipt.recipientAccount || (isIncome ? accountNumber : tx.account_number || '-')),
    recipientAvatar: tx.recipient_avatar || String(receipt.recipientAvatar || ''),
    bankName: String(tx.bank_name || receipt.bankName || 'Hikari Bank'),
    channel: String(tx.channel || receipt.channel || 'Chuyển khoản 24/7'),
    note: String(tx.note || receipt.note || '-'),
    createdAt: tx.created_at || String(receipt.createdAt || new Date().toISOString()),
    status: tx.status || String(receipt.status || 'Thành công'),
    signature: tx.receipt_sig || String(receipt.signature || ''),
    sourceCardLast4: tx.source_card_last4 || (typeof receipt.sourceCardLast4 === 'string' ? receipt.sourceCardLast4 : ''),
    cashbackAmount: typeof receipt.cashbackAmount === 'number' ? receipt.cashbackAmount : undefined,
    pointsEarned: typeof receipt.pointsEarned === 'number' ? receipt.pointsEarned : undefined,
    simBalanceBefore: typeof receipt.simBalanceBefore === 'number' ? receipt.simBalanceBefore : undefined,
    simBalanceAfter: typeof receipt.simBalanceAfter === 'number' ? receipt.simBalanceAfter : undefined,
  };
}

export async function renderBillToPngDataUrl(input: BillRenderInput): Promise<string> {
  try {
    await document.fonts?.ready;
  } catch {
    // fallback
  }

  const W = 800;
  const dpr = 2;
  const tmpl = input.template || 'transfer';
  const theme = TEMPLATE_THEME[tmpl] || TEMPLATE_THEME.transfer;
  const statusVis = resolveStatusVisual(input.status, tmpl);
  const isFailed = statusVis.label === 'THẤT BẠI';

  const fee = Math.max(0, Math.round(Number(input.fee || 0)));
  const baseAmount = Math.max(0, Math.round(Number(input.amount || 0)));
  const totalAmount = Math.max(0, Math.round(Number(input.totalAmount ?? baseAmount + fee)));

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  let noteLines = [String(input.note || '-').trim() || '-'];
  if (mCtx) {
    mCtx.font = `600 14.5px ${FONT_SANS}`;
    noteLines = wrapCanvasText(mCtx, input.note || '-', 430, 4);
  }
  const extraNoteHeight = Math.max(0, (noteLines.length - 1) * 21);
  const extraCardHeight =
    (input.sourceCardLast4 ? 44 : 0) +
    (typeof input.simBalanceAfter === 'number' ? 44 : 0) +
    (Number(input.cashbackAmount || 0) > 0 ? 44 : 0) +
    (Number(input.pointsEarned || 0) > 0 ? 44 : 0);

  const H = 1105 + extraNoteHeight + extraCardHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'alphabetic';

  // Warm Hikari ivory backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#FDF2F4');
  bgGrad.addColorStop(0.55, '#FAF8F6');
  bgGrad.addColorStop(1, '#F8FAFC');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer card with refined elevation shadow
  const cardX = 28;
  const cardY = 24;
  const cardW = W - 56;
  const cardH = H - 48;
  ctx.save();
  ctx.shadowColor = 'rgba(136, 19, 55, 0.14)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = '#FCFBF7';
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#F3D8DC';
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.stroke();

  // Hikari Coral Header Banner
  const headerH = 220;
  ctx.save();
  drawRoundRect(ctx, cardX, cardY, cardW, headerH, 28);
  ctx.clip();
  const hdrGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
  hdrGrad.addColorStop(0, '#1E293B');
  hdrGrad.addColorStop(0.45, '#9F1D35');
  hdrGrad.addColorStop(1, isFailed ? '#DC2626' : '#E14B5A');
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(cardX, cardY, cardW, headerH);

  // Subtle sunrise glow + geometric Japanese crest rings
  const sheen = ctx.createRadialGradient(cardX + cardW * 0.85, cardY + 35, 10, cardX + cardW * 0.85, cardY + 35, 270);
  sheen.addColorStop(0, 'rgba(253, 224, 71, 0.22)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cardX, cardY, cardW, headerH);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cardX + cardW - 60, cardY + 60, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cardX + cardW - 60, cardY + 60, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Hikari Sun + H Logo + Bank Brand
  drawHikariVectorLogo(ctx, 60, 48, 50);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 18px ${FONT_SANS}`;
  ctx.fillText('HIKARI BANK · ひかり銀行', 124, 68);
  ctx.fillStyle = '#FDE68A';
  ctx.font = `700 11.5px ${FONT_SANS}`;
  ctx.fillText('Your Life, Your Journey. · ' + theme.badge, 124, 89);

  // Top-right explicit Simulation Stamp
  const simLabel = 'BIÊN LAI MÔ PHỎNG – PHONE OS';
  ctx.font = `800 10.5px ${FONT_SANS}`;
  const simTextW = ctx.measureText(simLabel).width;
  const simPillW = simTextW + 24;
  const simPillX = cardX + cardW - 28 - simPillW;
  drawRoundRect(ctx, simPillX, 50, simPillW, 26, 13);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(simLabel, simPillX + simPillW / 2, 67);

  // Main Receipt Title + Status
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 25px ${FONT_SANS}`;
  ctx.fillText(theme.title, 60, 148);

  ctx.font = `800 12px ${FONT_SANS}`;
  const stW = ctx.measureText(statusVis.label).width + 36;
  drawRoundRect(ctx, 60, 168, stW, 28, 14);
  ctx.fillStyle = statusVis.bg;
  ctx.fill();
  ctx.strokeStyle = statusVis.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = statusVis.dot;
  ctx.beginPath();
  ctx.arc(75, 182, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = statusVis.text;
  ctx.fillText(statusVis.label, 86, 186);

  const dt = new Date(input.createdAt || Date.now());
  const validDt = Number.isNaN(dt.getTime()) ? new Date() : dt;
  const clockStr = validDt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = validDt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.fillStyle = '#FFE4E6';
  ctx.font = `600 12.5px ${FONT_MONO}`;
  ctx.fillText(`${clockStr} · ${dateStr}`, 60 + stW + 14, 186);

  // Amount Highlight Card with Auto-Fit Font Scaling (supports multi-billion/trillion VNĐ)
  const amtBoxY = 262;
  const amtBoxH = 150;
  drawRoundRect(ctx, 56, amtBoxY, W - 112, amtBoxH, 20);
  ctx.fillStyle = isFailed ? '#FEF2F2' : '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = isFailed ? '#FECACA' : '#F3D8DC';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = `700 12px ${FONT_SANS}`;
  ctx.fillText('SỐ TIỀN GIAO DỊCH', W / 2, amtBoxY + 32);

  const amtText = formatVnd(baseAmount);
  let amtFontSize = 42;
  while (amtFontSize > 20) {
    ctx.font = `800 ${amtFontSize}px ${FONT_SANS}`;
    if (ctx.measureText(amtText).width <= W - 160) break;
    amtFontSize -= 2;
  }
  ctx.fillStyle = isFailed ? '#DC2626' : '#0F172A';
  ctx.fillText(amtText, W / 2, amtBoxY + 86);

  ctx.fillStyle = '#475569';
  ctx.font = `600 13px ${FONT_SANS}`;
  const feeDisplay = fee === 0 ? '0 VNĐ' : formatVnd(fee);
  ctx.fillText(`Phí: ${feeDisplay}   ·   Tổng thanh toán: ${formatVnd(totalAmount)}`, W / 2, amtBoxY + 122);

  // Load Sender & Recipient Avatars
  const [senderImg, recipientImg] = await Promise.all([
    loadImageSafe(input.senderAvatar),
    loadImageSafe(input.recipientAvatar),
  ]);

  const partyY = 432;
  const partyGap = 14;
  const partyW = (W - 112 - partyGap) / 2;
  const partyH = 122;

  const drawPartyCard = (
    x: number,
    y: number,
    heading: string,
    name: string,
    accRaw: string,
    bank: string,
    img: HTMLImageElement | null,
    badgeColor: string
  ) => {
    drawRoundRect(ctx, x, y, partyW, partyH, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = `700 11px ${FONT_SANS}`;
    ctx.fillText(heading, x + 16, y + 24);

    drawAvatarOrInitial(ctx, img, name, x + 36, y + 66, 20, badgeColor);

    const textX = x + 66;
    const textMaxW = partyW - 80;
    ctx.fillStyle = '#0F172A';
    ctx.font = `800 14px ${FONT_SANS}`;
    const nameLines = wrapCanvasText(ctx, name || '-', textMaxW, 1);
    ctx.fillText(nameLines[0], textX, y + 54);

    ctx.fillStyle = '#334155';
    ctx.font = `600 12.5px ${FONT_MONO}`;
    ctx.fillText(maskAccountNumber(accRaw), textX, y + 75);

    ctx.fillStyle = '#E14B5A';
    ctx.font = `700 11.5px ${FONT_SANS}`;
    const bankLines = wrapCanvasText(ctx, bank || 'Hikari Bank', textMaxW, 1);
    ctx.fillText(bankLines[0], textX, y + 97);
  };

  drawPartyCard(
    56,
    partyY,
    'NGƯỜI CHUYỂN',
    input.senderName,
    input.senderAccount,
    input.senderBank || 'Hikari Bank',
    senderImg,
    '#E14B5A'
  );
  drawPartyCard(
    56 + partyW + partyGap,
    partyY,
    'NGƯỜI NHẬN',
    input.recipientName,
    input.recipientAccount,
    input.bankName || 'Hikari Bank',
    recipientImg,
    '#0F172A'
  );

  // Transaction Details List
  let y = partyY + partyH + 34;
  const drawDetailRow = (label: string, val: string, color = '#0F172A', mono = false) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = `600 13.5px ${FONT_SANS}`;
    ctx.fillText(label, 60, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = mono ? `700 14px ${FONT_MONO}` : `700 14.5px ${FONT_SANS}`;
    const fitted = wrapCanvasText(ctx, val, 420, 1)[0];
    ctx.fillText(fitted, W - 60, y);

    y += 16;
    ctx.strokeStyle = '#EFE7E8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(W - 60, y);
    ctx.stroke();
    y += 28;
  };

  drawDetailRow('Ngày giao dịch', dateStr, '#0F172A', true);
  drawDetailRow('Thời gian giao dịch', clockStr, '#0F172A', true);
  drawDetailRow('Phương thức giao dịch', input.channel || 'Chuyển khoản 24/7');
  if (input.sourceCardLast4) {
    drawDetailRow('Thẻ thanh toán', `Hikari •••• ${input.sourceCardLast4}`, '#0F172A', true);
  }
  if (typeof input.simBalanceAfter === 'number') {
    drawDetailRow(
      'Số dư SIM (trước → sau)',
      `${formatVnd(Number(input.simBalanceBefore || 0))} → ${formatVnd(input.simBalanceAfter)}`,
      '#047857',
      true
    );
  }
  drawDetailRow('Số tiền chuyển', formatVnd(baseAmount), '#0F172A', true);
  drawDetailRow('Phí giao dịch', fee === 0 ? '0 VNĐ (Miễn phí)' : formatVnd(fee), fee === 0 ? '#059669' : '#0F172A', true);
  drawDetailRow('Tổng thanh toán', formatVnd(totalAmount), '#E14B5A', true);
  if (Number(input.cashbackAmount || 0) > 0) {
    drawDetailRow('Hoàn tiền Cashback', `+${formatVnd(Number(input.cashbackAmount))}`, '#047857', true);
  }
  if (Number(input.pointsEarned || 0) > 0) {
    drawDetailRow('Điểm thưởng thẻ', `+${Number(input.pointsEarned).toLocaleString('de-DE')} điểm`, '#B45309', true);
  }

  // Wrapped Transfer Note Row
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = `600 13.5px ${FONT_SANS}`;
  ctx.fillText('Nội dung chuyển khoản', 60, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F172A';
  ctx.font = `600 14.5px ${FONT_SANS}`;
  noteLines.forEach((line, idx) => {
    ctx.fillText(line, W - 60, y + idx * 21);
  });
  y += (noteLines.length - 1) * 21 + 16;
  ctx.strokeStyle = '#EFE7E8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(W - 60, y);
  ctx.stroke();
  y += 28;

  drawDetailRow('Mã giao dịch', input.refCode, theme.accent, true);

  // Bottom Simulated Verification QR & Explicit Disclaimer Footer
  const footerY = H - 156;
  drawRoundRect(ctx, 56, footerY, W - 112, 108, 18);
  ctx.fillStyle = '#FAF5F6';
  ctx.fill();
  ctx.strokeStyle = '#F3D8DC';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const qrSize = 74;
  const qrX = 74;
  const qrY = footerY + 17;
  drawRoundRect(ctx, qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  const simQrPayload = `HIKARI_OS_RECEIPT|${input.refCode}|${input.txId || input.refCode}`;
  drawSimQrMatrix(ctx, simQrPayload, qrX, qrY, qrSize, '#E14B5A');

  const infoX = qrX + qrSize + 24;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = `800 13.5px ${FONT_SANS}`;
  ctx.fillText('XÁC THỰC BIÊN LAI MÔ PHỎNG HIKARI BANK', infoX, footerY + 32);

  ctx.fillStyle = '#475569';
  ctx.font = `600 11.5px ${FONT_MONO}`;
  const sigText = input.signature
    ? `Ref: ${input.refCode} · Sig: ${input.signature.slice(0, 12).toUpperCase()}`
    : `Ref: ${input.refCode} · Hikari Ledger Sync`;
  ctx.fillText(sigText, infoX, footerY + 54);

  ctx.fillStyle = '#DC2626';
  ctx.font = `700 11.5px ${FONT_SANS}`;
  ctx.fillText('Biên lai mô phỏng Phone OS · Không phải chứng từ giao dịch ngân hàng thật', infoX, footerY + 80);

  return canvas.toDataURL('image/png');
}

export async function renderReceiptPreviewFromPayload(
  receipt: Record<string, unknown>,
  fallback?: { txId?: string; refCode?: string; amount?: number; createdAt?: string }
): Promise<string> {
  const fee = Number(receipt.fee || 0);
  const baseAmount = Number(receipt.amount ?? fallback?.amount ?? 0);
  const totalAmount = Number(receipt.totalAmount ?? baseAmount + fee);
  return renderBillToPngDataUrl({
    txId: String(receipt.txId || fallback?.txId || ''),
    template: (receipt.template as BillTemplateType) || 'ai_tx',
    refCode: String(receipt.refCode || fallback?.refCode || 'HK-SIM'),
    amount: baseAmount,
    fee,
    totalAmount,
    senderName: String(receipt.senderName || 'Hikari Bank User'),
    senderAccount: String(receipt.senderAccount || '8800-2026-9901'),
    senderBank: String(receipt.senderBank || 'Hikari Bank'),
    senderAvatar: String(receipt.senderAvatar || ''),
    recipientName: String(receipt.recipientName || 'Người nhận'),
    recipientAccount: String(receipt.recipientAccount || '8800-2026-0000'),
    recipientAvatar: String(receipt.recipientAvatar || ''),
    bankName: String(receipt.bankName || 'Hikari Bank'),
    channel: String(receipt.channel || 'Chuyển tiền 24/7'),
    note: String(receipt.note || '-'),
    createdAt: String(receipt.createdAt || fallback?.createdAt || new Date().toISOString()),
    status: String(receipt.status || 'Thành công'),
    signature: String(receipt.signature || ''),
    sourceCardLast4: typeof receipt.sourceCardLast4 === 'string' ? receipt.sourceCardLast4 : '',
    cashbackAmount: typeof receipt.cashbackAmount === 'number' ? receipt.cashbackAmount : undefined,
    pointsEarned: typeof receipt.pointsEarned === 'number' ? receipt.pointsEarned : undefined,
    simBalanceBefore: typeof receipt.simBalanceBefore === 'number' ? receipt.simBalanceBefore : undefined,
    simBalanceAfter: typeof receipt.simBalanceAfter === 'number' ? receipt.simBalanceAfter : undefined,
  });
}

export function renderQrCardPng(params: {
  accountNumber: string;
  holderName: string;
  amount?: number;
  note?: string;
  qrPayload: string;
}): string {
  const W = 540;
  const H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1E293B');
  grad.addColorStop(0.5, '#9F1D35');
  grad.addColorStop(1, '#E14B5A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawRoundRect(ctx, 32, 32, W - 64, H - 64, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#E14B5A';
  ctx.font = `800 22px ${FONT_SANS}`;
  ctx.fillText('HIKARI BANK SIM-QR', W / 2, 82);

  ctx.fillStyle = '#64748B';
  ctx.font = `600 14px ${FONT_SANS}`;
  ctx.fillText('Quét mã mô phỏng trong Phone OS 24/7', W / 2, 108);

  const qrSize = 260;
  const qrX = (W - qrSize) / 2;
  const qrY = 140;
  drawRoundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 20);
  ctx.fillStyle = '#FFF5F6';
  ctx.fill();
  ctx.strokeStyle = '#FECDD3';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawSimQrMatrix(ctx, params.qrPayload, qrX, qrY, qrSize, '#E14B5A');

  ctx.fillStyle = '#0F172A';
  ctx.font = `800 20px ${FONT_SANS}`;
  ctx.fillText(params.holderName.toUpperCase(), W / 2, 468);

  ctx.fillStyle = '#475569';
  ctx.font = `700 16px ${FONT_MONO}`;
  ctx.fillText(`STK: ${params.accountNumber}`, W / 2, 496);

  if (params.amount && params.amount > 0) {
    ctx.fillStyle = '#E14B5A';
    ctx.font = `800 24px ${FONT_SANS}`;
    ctx.fillText(formatVnd(params.amount), W / 2, 540);
  }
  if (params.note) {
    ctx.fillStyle = '#64748B';
    ctx.font = `500 14px ${FONT_SANS}`;
    ctx.fillText(params.note.slice(0, 40), W / 2, 572);
  }

  return canvas.toDataURL('image/png');
}

export function downloadDataUrlAsPng(dataUrl: string, filename: string) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
