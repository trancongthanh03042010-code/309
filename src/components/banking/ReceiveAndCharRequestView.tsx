import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Share2,
} from 'lucide-react';
import type {
  AiRelationshipRecord,
  BankingAccountDemo,
  BankingOverviewPayload,
  BankingPaymentRequest,
  BankingTransactionDemo,
  SharePayload,
} from '../../types/os';
import { downloadDataUrlAsPng, renderQrCardPng } from './billRenderer';
import type { HikariThemePalette } from './HikariBrand';
import { formatTimeAgoOrDate, formatVnd, maskAccountNumber } from './utils';

interface ReceiveAndCharRequestViewProps {
  initialSubTab?: 'receive' | 'char_request';
  initialCharId?: string | null;
  account: BankingAccountDemo | null;
  aiAccounts: BankingAccountDemo[];
  relationships: AiRelationshipRecord[];
  charRequests: BankingPaymentRequest[];
  transactions: BankingTransactionDemo[];
  theme: HikariThemePalette;
  onOverviewUpdate: (payload: BankingOverviewPayload) => void;
  onSelectTransaction: (tx: BankingTransactionDemo) => void;
  onShare: (payload: SharePayload) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function ReceiveAndCharRequestView({
  account,
  transactions,
  theme,
  onSelectTransaction,
  onShare,
  onShowToast,
}: ReceiveAndCharRequestViewProps) {
  const [qrAmount, setQrAmount] = useState('');
  const [qrNote, setQrNote] = useState('Chuyển tiền vào Hikari Bank');
  const [copiedStk, setCopiedStk] = useState(false);

  const receiveTxs = useMemo(
    () =>
      transactions
        .filter((t) => t.tx_type === 'income' && t.account_id === (account?.id || 'bank_1'))
        .slice(0, 6),
    [transactions, account?.id]
  );

  const qrPayload = useMemo(() => {
    const amt = Number(qrAmount) > 0 ? Math.round(Number(qrAmount)) : 0;
    return `HIKARI_OS|${account?.account_number || '8800-2026-9901'}|${account?.holder_name || 'Minh Anh'}|${amt}|${qrNote.trim()}`;
  }, [account?.account_number, account?.holder_name, qrAmount, qrNote]);

  const qrCardPng = useMemo(
    () =>
      renderQrCardPng({
        accountNumber: account?.account_number || '8800-2026-9901',
        holderName: account?.holder_name || 'Minh Anh',
        amount: Number(qrAmount) > 0 ? Math.round(Number(qrAmount)) : undefined,
        note: qrNote.trim() || undefined,
        qrPayload,
      }),
    [account?.account_number, account?.holder_name, qrAmount, qrNote, qrPayload]
  );

  return (
    <div className="p-3.5 space-y-3.5 pb-6">
      <div className="space-y-3.5">
        {/* Player Receive Card & QR */}
        <div className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className={`text-[11px] font-semibold ${theme.textSecondary}`}>Tài khoản nhận Hikari Bank</p>
              <p className="text-sm font-extrabold">{account?.holder_name || 'Minh Anh'}</p>
              <button
                type="button"
                onClick={() => {
                  if (!account?.account_number) return;
                  navigator.clipboard?.writeText(account.account_number).catch(() => {});
                  setCopiedStk(true);
                  onShowToast('Đã sao chép STK', account.account_number, 'success');
                  setTimeout(() => setCopiedStk(false), 1600);
                }}
                className="text-xs font-mono font-bold text-[#E14B5A] flex items-center gap-1 mt-0.5"
              >
                <span>{account?.account_number || '8800-2026-9901'}</span>
                {copiedStk ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <span className={`text-[11px] font-mono ${theme.textSecondary}`}>
              {maskAccountNumber(account?.account_number)}
            </span>
          </div>

          {qrCardPng && (
            <div className="flex justify-center">
              <img
                src={qrCardPng}
                alt="Hikari Bank Sim-QR"
                className="w-56 rounded-2xl shadow-md border border-rose-200/60"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Số tiền QR (tùy chọn)</label>
              <input
                type="number"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
                placeholder="Nhập tự do"
                className={`w-full min-h-[40px] px-3 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
              />
            </div>
            <div>
              <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Lời nhắn QR</label>
              <input
                value={qrNote}
                onChange={(e) => setQrNote(e.target.value)}
                className={`w-full min-h-[40px] px-3 rounded-xl border outline-none ${theme.inputClass}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                downloadDataUrlAsPng(qrCardPng, `HikariBank_QR_${account?.account_number || 'SimQR'}.png`);
                onShowToast('Đã tải ảnh QR', 'Mã QR Hikari Bank PNG đã được tải xuống.', 'success');
              }}
              className={`min-h-[44px] rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 ${theme.subCardBg}`}
            >
              <Download className="w-4 h-4 text-[#E14B5A]" />
              <span>Tải QR PNG</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onShare({
                  title: `QR Hikari Bank · ${account?.holder_name || 'Minh Anh'}`,
                  text: `STK: ${account?.account_number} · Hikari Bank\n${qrNote}`,
                  mediaUrl: qrCardPng,
                  mediaType: 'photo',
                  sourceApp: 'Hikari Bank',
                })
              }
              className="min-h-[44px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              <span>Chia sẻ QR</span>
            </button>
          </div>
        </div>

        {/* Recent Incoming */}
        {receiveTxs.length > 0 && (
          <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.textSecondary}`}>
              Tiền vào gần đây ({receiveTxs.length})
            </h4>
            <div className={`divide-y ${theme.border}`}>
              {receiveTxs.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onSelectTransaction(tx)}
                  className="w-full py-2.5 flex items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{tx.counterparty}</p>
                    <p className={`text-[11px] truncate ${theme.textSecondary}`}>
                      {tx.note} · {formatTimeAgoOrDate(tx.created_at)}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-500 tabular-nums shrink-0">
                    +{formatVnd(tx.amount)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

