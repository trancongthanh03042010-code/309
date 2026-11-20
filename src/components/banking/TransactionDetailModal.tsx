import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { BankingAccountDemo, BankingTransactionDemo } from '../../types/os';
import type { HikariThemePalette } from './HikariBrand';
import {
  formatTimeAgoOrDate,
  formatVnd,
  isSuccessBillableTx,
  maskAccountNumber,
} from './utils';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual_transfer: 'Chuyển khoản trực tiếp',
  char_request: 'Yêu cầu CHAR chuyển tiền',
  char_transfer: 'CHAR chủ động chuyển tiền',
  yumechat: 'Đồng bộ từ YumeChat',
  savings: 'Tiết kiệm số Hikari',
  loan: 'Vay vốn Hikari',
  bill: 'Thanh toán hóa đơn',
  topup: 'Nạp tiền điện thoại',
  card: 'Thanh toán thẻ Hikari',
  deposit_demo: 'Nạp tiền mô phỏng',
  withdraw_demo: 'Rút tiền mô phỏng',
};

interface TransactionDetailModalProps {
  tx: BankingTransactionDemo | null;
  account: BankingAccountDemo | null;
  aiAccounts: BankingAccountDemo[];
  theme: HikariThemePalette;
  onClose: () => void;
  onOpenBillPreview: (tx: BankingTransactionDemo) => void;
  onQuickShareTx?: (tx: BankingTransactionDemo) => void;
  onOpenChat?: (conversationId?: string, characterId?: string) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function TransactionDetailModal({
  tx,
  account,
  aiAccounts,
  theme,
  onClose,
  onOpenBillPreview,
  onQuickShareTx,
  onOpenChat,
  onShowToast,
}: TransactionDetailModalProps) {
  const [copiedRef, setCopiedRef] = useState(false);

  const parsedReceipt = useMemo(() => {
    if (!tx?.receipt_json) return {} as Record<string, unknown>;
    try {
      return JSON.parse(tx.receipt_json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [tx]);

  if (!tx) return null;

  const billable = isSuccessBillableTx(tx);
  const statusLow = String(tx.status || '').toLowerCase();
  const isFailed = statusLow.includes('thất bại') || statusLow.includes('lỗi') || tx.bill_template === 'failed';
  const isPending = !isFailed && (statusLow.includes('đang xử lý') || statusLow.includes('pending'));
  const isIncome = tx.tx_type === 'income';

  const refCode = tx.ref_code || String(parsedReceipt.refCode || tx.id.toUpperCase());
  const fee = Math.max(0, Math.round(Number(tx.fee ?? parsedReceipt.fee ?? 0)));
  const baseAmount = Math.max(0, Math.round(Number(parsedReceipt.amount ?? tx.amount ?? 0)));
  const totalAmount = Math.max(0, Math.round(Number(tx.total_debit ?? parsedReceipt.totalAmount ?? baseAmount + fee)));

  const senderName = String(
    tx.sender_name || parsedReceipt.senderName || (isIncome ? tx.counterparty : account?.holder_name || 'Minh Anh')
  );
  const senderAcc = String(
    tx.sender_account || parsedReceipt.senderAccount || (isIncome ? tx.account_number || '-' : account?.account_number || '8800-2026-9901')
  );
  const recipientName = String(
    parsedReceipt.recipientName || (isIncome ? account?.holder_name || 'Minh Anh' : tx.counterparty)
  );
  const recipientAcc = String(
    parsedReceipt.recipientAccount || (isIncome ? account?.account_number || '8800-2026-9901' : tx.account_number || '-')
  );

  const senderAvatar = tx.sender_avatar || String(parsedReceipt.senderAvatar || '');
  const recipientAvatar = tx.recipient_avatar || String(parsedReceipt.recipientAvatar || '');

  const matchedChar = aiAccounts.find(
    (a) =>
      a.holder_name.toLowerCase() === tx.counterparty.toLowerCase() ||
      a.account_number === tx.account_number ||
      a.account_number === tx.sender_account
  );
  const canOpenChat = Boolean(onOpenChat && (tx.source_chat_id || tx.is_ai_tx || matchedChar?.character_id));
  const sourceLabel = SOURCE_TYPE_LABELS[tx.source_type || ''] || tx.channel || 'Hikari Bank 24/7';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${theme.cardBg} ${theme.textPrimary}`}
      >
        {/* Header */}
        <div className={`px-5 py-4 bg-gradient-to-r ${theme.heroGradient} text-white flex items-center justify-between gap-2 shrink-0`}>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold">
              Chi tiết giao dịch · Mô phỏng Phone OS
            </p>
            <h3 className="text-base font-extrabold truncate mt-0.5">{tx.counterparty}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Details */}
        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5">
          {/* Amount & Status Card */}
          <div className={`rounded-2xl border p-4 text-center space-y-2 ${theme.subCardBg}`}>
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold">
              {isFailed ? (
                <>
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span className="text-rose-500">Thất bại</span>
                </>
              ) : isPending ? (
                <>
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-500">Đang xử lý</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-500">{tx.status || 'Thành công'}</span>
                </>
              )}
              <span className={theme.textSecondary}>· {formatTimeAgoOrDate(tx.created_at)}</span>
            </div>

            <p
              className={`text-2xl font-black tabular-nums break-all ${
                isFailed ? 'text-rose-500' : isIncome ? 'text-emerald-500' : theme.textPrimary
              }`}
            >
              {isFailed ? '' : isIncome ? '+' : '-'}
              {formatVnd(baseAmount)}
            </p>

            {tx.failure_reason && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-500 font-semibold flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Lý do: {tx.failure_reason}</span>
              </div>
            )}
          </div>

          {/* Sender / Receiver Cards */}
          <div className="grid grid-cols-1 gap-2">
            <div className={`rounded-2xl border p-3 flex items-center justify-between gap-2.5 ${theme.subCardBg}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#E14B5A]/15 text-[#E14B5A] flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold ${theme.textSecondary}`}>Người chuyển</p>
                  <p className="text-xs font-bold truncate">{senderName}</p>
                  <p className={`text-[11px] font-mono ${theme.textSecondary}`}>
                    {maskAccountNumber(senderAcc)} · {String(parsedReceipt.senderBank || 'Hikari Bank')}
                  </p>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-3 flex items-center justify-between gap-2.5 ${theme.subCardBg}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                {recipientAvatar ? (
                  <img src={recipientAvatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold ${theme.textSecondary}`}>Người nhận</p>
                  <p className="text-xs font-bold truncate">{recipientName}</p>
                  <p className={`text-[11px] font-mono ${theme.textSecondary}`}>
                    {maskAccountNumber(recipientAcc)} · {tx.bank_name || 'Hikari Bank'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata Table */}
          <div className={`rounded-2xl border p-3.5 space-y-2.5 text-xs ${theme.subCardBg}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={theme.textSecondary}>Mã tham chiếu</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(refCode).catch(() => {});
                  setCopiedRef(true);
                  onShowToast('Đã sao chép mã GD', refCode, 'info');
                  setTimeout(() => setCopiedRef(false), 1600);
                }}
                className="font-mono font-bold flex items-center gap-1 text-[#E14B5A]"
              >
                <span>{refCode}</span>
                {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={theme.textSecondary}>Phí giao dịch</span>
              <span className="font-semibold tabular-nums">{fee === 0 ? '0 VNĐ (Miễn phí)' : formatVnd(fee)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={theme.textSecondary}>Tổng thanh toán</span>
              <span className="font-extrabold tabular-nums">{formatVnd(totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={theme.textSecondary}>Nguồn giao dịch</span>
              <span className="font-semibold text-right">{sourceLabel}</span>
            </div>
            {(tx.source_card_last4 || typeof parsedReceipt.sourceCardLast4 === 'string') && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Thẻ thanh toán</span>
                <span className="font-mono font-bold text-right">
                  {typeof parsedReceipt.cardBankName === 'string' && parsedReceipt.cardBankName
                    ? `${parsedReceipt.cardBankName} · `
                    : 'Hikari '}
                  •••• {tx.source_card_last4 || String(parsedReceipt.sourceCardLast4)}
                </span>
              </div>
            )}
            {Number(parsedReceipt.discountAmount || 0) > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Giảm giá ưu đãi</span>
                <span className="font-bold tabular-nums text-emerald-500">
                  -{formatVnd(Number(parsedReceipt.discountAmount))}
                </span>
              </div>
            )}
            {Number(parsedReceipt.cashbackAmount || 0) > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Hoàn tiền Cashback</span>
                <span className="font-bold tabular-nums text-emerald-500">
                  +{formatVnd(Number(parsedReceipt.cashbackAmount))}
                </span>
              </div>
            )}
            {Number(parsedReceipt.pointsEarned || 0) > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Điểm thưởng nhận được</span>
                <span className="font-bold tabular-nums text-amber-500">
                  +{Number(parsedReceipt.pointsEarned).toLocaleString('de-DE')} điểm
                </span>
              </div>
            )}
            {typeof parsedReceipt.simBalanceAfter === 'number' && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Số dư SIM (trước → sau)</span>
                <span className="font-bold tabular-nums text-emerald-500">
                  {formatVnd(Number(parsedReceipt.simBalanceBefore || 0))} → {formatVnd(Number(parsedReceipt.simBalanceAfter))}
                </span>
              </div>
            )}
            {tx.completed_at && (
              <div className="flex items-center justify-between gap-2">
                <span className={theme.textSecondary}>Hoàn tất lúc</span>
                <span className="font-mono text-[11px] tabular-nums">{formatTimeAgoOrDate(tx.completed_at)}</span>
              </div>
            )}
            <div className={`pt-2 border-t ${theme.border} space-y-1`}>
              <span className={`block ${theme.textSecondary}`}>Nội dung giao dịch</span>
              <p className="font-semibold leading-relaxed">{tx.note || '-'}</p>
            </div>
          </div>

          {!billable && (
            <div className={`rounded-2xl border p-3 text-xs flex items-start gap-2 ${theme.badgeWarning}`}>
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Biên lai mô phỏng PNG chỉ được cấp cho giao dịch đã hoàn tất (<strong>Thành công</strong>). Giao dịch đang xử lý hoặc thất bại không xuất chứng từ nhận tiền.
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`p-3.5 border-t space-y-2 shrink-0 ${theme.border}`}>
          {canOpenChat && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenChat?.(tx.source_chat_id || undefined, matchedChar?.character_id || undefined);
              }}
              className={`w-full min-h-[44px] rounded-xl border font-bold text-xs flex items-center justify-center gap-2 ${theme.subCardBg} hover:border-[#E14B5A]`}
            >
              <MessageCircle className="w-4 h-4 text-[#E14B5A]" />
              <span>Mở đoạn chat CHAR trong YumeChat</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!billable}
              onClick={() => {
                if (!billable) return;
                onClose();
                onOpenBillPreview(tx);
              }}
              className="min-h-[44px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap px-3"
            >
              <FileImage className="w-4 h-4 shrink-0" />
              <span>Xem biên lai PNG</span>
            </button>

            <button
              type="button"
              disabled={!billable || !onQuickShareTx}
              onClick={() => {
                if (!billable || !onQuickShareTx) return;
                onQuickShareTx(tx);
              }}
              className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap px-3"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>Chia sẻ biên lai</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
