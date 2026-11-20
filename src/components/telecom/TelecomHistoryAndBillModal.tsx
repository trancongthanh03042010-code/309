import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  History,
  Landmark,
  Search,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  SharePayload,
  TelecomCarrier,
  TelecomNotification,
  TelecomOverviewPayload,
  TelecomTransaction,
  TelecomUserSim,
} from '../../types/os';
import { downloadDataUrlAsPng, renderBillToPngDataUrl } from '../banking/billRenderer';
import { formatTimeAgoOrDate, formatVnd } from '../banking/utils';
import { CarrierLogo, formatPhoneDisplay } from './CarrierBrand';

export async function renderTelecomBillPngDataUrl(
  tx: TelecomTransaction,
  carrier: TelecomCarrier | undefined,
  userName: string
): Promise<string> {
  const isBankPay = tx.payment_channel === 'bank';
  const simInfoLine = `Số dư SIM: ${formatVnd(tx.sim_balance_before)} → ${formatVnd(tx.sim_balance_after)}`;
  const fullNote = `${tx.description} (${simInfoLine})`;
  return renderBillToPngDataUrl({
    txId: tx.transaction_id || tx.id,
    template: tx.tx_type === 'topup' ? 'topup' : 'bill',
    refCode: tx.ref_code,
    amount: tx.amount,
    fee: tx.fee,
    totalAmount: tx.total_amount,
    senderName: userName,
    senderAccount: isBankPay ? tx.bank_source_label || 'Hikari Bank' : formatPhoneDisplay(tx.phone_number),
    senderBank: isBankPay ? 'Hikari Bank' : carrier?.name || 'Anime Telecom',
    recipientName: carrier?.name || tx.carrier_id.toUpperCase(),
    recipientAccount: formatPhoneDisplay(tx.phone_number),
    bankName: `${carrier?.name || 'Anime Telecom'} · ANIME TELECOM`,
    channel: tx.tx_type === 'buy_sim' ? 'Mua SIM Số Đẹp' : tx.tx_type === 'topup' ? 'Nạp tiền SIM' : 'Đăng ký Gói cước',
    note: fullNote,
    createdAt: tx.created_at,
    status: tx.status,
    sourceCardLast4: tx.card_last4 || undefined,
  });
}

export function TelecomBillModal({
  tx,
  carriers,
  userName,
  onClose,
  onShare,
  onShowToast,
}: {
  tx: TelecomTransaction | null;
  carriers: TelecomCarrier[];
  userName: string;
  onClose: () => void;
  onShare: (payload: SharePayload) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}) {
  const [pngUrl, setPngUrl] = useState('');
  const carrier = carriers.find((c) => c.id === tx?.carrier_id);

  useEffect(() => {
    let cancelled = false;
    if (!tx) {
      setPngUrl('');
      return;
    }
    void renderTelecomBillPngDataUrl(tx, carrier, userName).then((url) => {
      if (!cancelled) setPngUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [tx, carrier, userName]);

  if (!tx) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <CarrierLogo variant={carrier?.logo_variant || tx.carrier_id} size={34} />
            <div className="min-w-0">
              <p className="text-xs font-black truncate">{tx.title}</p>
              <p className="text-[11px] text-emerald-500 font-bold tabular-nums">
                {tx.ref_code} · {tx.status}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 text-center space-y-1">
            <p className="text-[11px] font-bold text-emerald-500 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>{tx.status}</span>
            </p>
            <p className="text-2xl font-black tabular-nums">{formatVnd(tx.total_amount)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {formatTimeAgoOrDate(tx.created_at)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Nhà mạng Anime</span>
              <span className="font-bold">{carrier?.name || tx.carrier_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Số thuê bao</span>
              <span className="font-black tabular-nums">{formatPhoneDisplay(tx.phone_number)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Mã giao dịch / Tham chiếu</span>
              <span className="font-mono font-bold text-indigo-500">{tx.ref_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Số tiền gốc / Phí</span>
              <span className="font-bold tabular-nums">
                {formatVnd(tx.amount)} / {formatVnd(tx.fee)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Nguồn thanh toán</span>
              <span className="font-bold text-right">{tx.bank_source_label || '-'}</span>
            </div>
            {tx.card_last4 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Thẻ Hikari</span>
                <span className="font-mono font-bold">•••• {tx.card_last4}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Số dư SIM trước GD</span>
              <span className="font-bold tabular-nums">{formatVnd(tx.sim_balance_before)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Số dư SIM sau GD</span>
              <span className="font-black text-emerald-500 tabular-nums">{formatVnd(tx.sim_balance_after)}</span>
            </div>
          </div>

          {pngUrl && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white">
              <img src={pngUrl} alt={`Biên lai ${tx.ref_code}`} className="w-full h-auto block" />
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            disabled={!pngUrl}
            onClick={() => {
              downloadDataUrlAsPng(pngUrl, `AnimeTelecom-${tx.ref_code}.png`);
              onShowToast('Đã tải biên lai PNG', `AnimeTelecom-${tx.ref_code}.png`, 'success');
            }}
            className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Tải ảnh PNG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onShare({
                title: `Biên lai Anime Telecom · ${tx.ref_code}`,
                text: `${tx.title} · ${formatPhoneDisplay(tx.phone_number)} · ${formatVnd(tx.total_amount)}`,
                mediaUrl: pngUrl || undefined,
                mediaType: pngUrl ? 'photo' : undefined,
                sourceApp: 'Anime Telecom',
              });
            }}
            className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function TelecomHistoryDrawer({
  open,
  initialSimId,
  transactions,
  carriers,
  userSims,
  onClose,
  onOpenBill,
}: {
  open: boolean;
  initialSimId?: string;
  transactions: TelecomTransaction[];
  carriers: TelecomCarrier[];
  userSims: TelecomUserSim[];
  onClose: () => void;
  onOpenBill: (tx: TelecomTransaction) => void;
}) {
  const [simFilter, setSimFilter] = useState(initialSimId || 'all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'buy_sim' | 'topup' | 'buy_package'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setSimFilter(initialSimId || 'all');
  }, [open, initialSimId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (simFilter !== 'all' && t.sim_id !== simFilter) return false;
      if (typeFilter !== 'all' && t.tx_type !== typeFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.phone_number} ${t.ref_code} ${t.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, simFilter, typeFilter, query]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            <h3 className="text-sm font-extrabold">Lịch sử giao dịch & Hóa đơn</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm số SIM, mã giao dịch AT..."
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={simFilter}
              onChange={(e) => setSimFilter(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1E1E2B] text-xs font-bold outline-none"
            >
              <option value="all">Tất cả SIM</option>
              {userSims.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatPhoneDisplay(s.phone_number)}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'buy_sim' | 'topup' | 'buy_package')}
              className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1E1E2B] text-xs font-bold outline-none"
            >
              <option value="all">Loại GD: Tất cả</option>
              <option value="topup">Nạp tiền SIM</option>
              <option value="buy_sim">Mua SIM số đẹp</option>
              <option value="buy_package">Mua gói cước</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-8">Chưa có giao dịch khớp bộ lọc.</p>
          ) : (
            filtered.map((tx) => {
              const carrier = carriers.find((c) => c.id === tx.carrier_id);
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onOpenBill(tx)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 flex items-center justify-between gap-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CarrierLogo variant={carrier?.logo_variant || tx.carrier_id} size={34} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold truncate">{tx.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                        {formatPhoneDisplay(tx.phone_number)} · {formatTimeAgoOrDate(tx.created_at)}
                      </p>
                      <p className="text-[10px] text-indigo-500 font-mono">{tx.ref_code}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black tabular-nums">{formatVnd(tx.total_amount)}</p>
                    <p className="text-[10px] text-emerald-500 font-semibold">Xem bill →</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function TelecomNotificationsDrawer({
  open,
  notifications,
  onClose,
  onMarkAllRead,
}: {
  open: boolean;
  notifications: TelecomNotification[];
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-500" />
            <h3 className="text-sm font-extrabold">Thông báo Anime Telecom</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-[11px] font-bold text-indigo-500 px-2 py-1"
            >
              Đọc hết
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2">
          {notifications.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-8">Chưa có thông báo nào.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl border p-3 text-xs space-y-1 ${
                  n.is_read
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.03]'
                    : 'border-indigo-500/40 bg-indigo-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold">{n.title}</p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {formatTimeAgoOrDate(n.created_at)}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{n.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function TelecomProfileSettingsModal({
  open,
  userName,
  userAvatar,
  bankAccounts,
  userSims,
  onClose,
  onSyncNow,
  onOpenBankingApp,
  onOpenHistory,
}: {
  open: boolean;
  userName: string;
  userAvatar: string;
  bankAccounts: BankingAccountDemo[];
  userSims: TelecomUserSim[];
  onClose: () => void;
  onSyncNow: () => Promise<TelecomOverviewPayload | void>;
  onOpenBankingApp: () => void;
  onOpenHistory: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  if (!open) return null;

  const activeCount = userSims.filter((s) => s.status === 'active').length;
  const totalSimBalance = userSims
    .filter((s) => s.status !== 'cancelled')
    .reduce((sum, s) => sum + Number(s.sim_balance || 0), 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-500" />
            <h3 className="text-sm font-extrabold">Hồ sơ & Đồng bộ Hikari Bank</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 flex items-center gap-3">
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-12 h-12 rounded-2xl object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-base flex items-center justify-center">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-black truncate">{userName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Đang sở hữu {activeCount} SIM hoạt động · Tổng số dư các SIM: {formatVnd(totalSimBalance)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-rose-500">
              <Landmark className="w-4 h-4" />
              <span>Tài khoản Hikari Bank liên kết ({bankAccounts.length})</span>
            </p>
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between py-1 border-b last:border-0 border-slate-200 dark:border-slate-800">
                <div>
                  <p className="font-bold">{acc.nickname || acc.account_type || 'Tài khoản chính'}</p>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{acc.account_number}</p>
                </div>
                <span className="font-black tabular-nums">{formatVnd(acc.available_balance ?? acc.balance)}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Chế độ đồng bộ hai chiều đang bật. Mọi giao dịch nạp tiền từ Hikari Bank hay Anime Telecom đều cập nhật chung trên 1 cơ sở dữ liệu.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await onSyncNow();
                } finally {
                  setSyncing(false);
                }
              }}
              className="min-h-[44px] rounded-xl bg-indigo-600 text-white font-bold"
            >
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ lại dữ liệu ngay'}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHistory();
              }}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 font-bold"
            >
              Xem toàn bộ hóa đơn & lịch sử Telecom
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBankingApp();
              }}
              className="min-h-[44px] rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 font-bold"
            >
              Mở ứng dụng Hikari Bank →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
