import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Smartphone, X } from 'lucide-react';
import { emitTelecomSyncEvent, osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingCardItem,
  TelecomCarrier,
  TelecomOverviewPayload,
  TelecomTransaction,
  TelecomUserSim,
} from '../../types/os';
import { getThemePalette } from '../banking/HikariBrand';
import { PaymentSourceSelector, resolveDefaultPaymentSource } from '../banking/PaymentSourceSelector';
import { formatVnd, isCardExpired } from '../banking/utils';
import { CarrierLogo, formatPhoneDisplay, TOPUP_DENOMINATIONS } from './CarrierBrand';

interface TelecomTopupModalProps {
  open: boolean;
  initialSimId?: string;
  initialAmount?: number;
  carriers: TelecomCarrier[];
  userSims: TelecomUserSim[];
  accounts: BankingAccountDemo[];
  cards: BankingCardItem[];
  onClose: () => void;
  onSuccess: (overview: TelecomOverviewPayload, tx?: TelecomTransaction) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function TelecomTopupModal({
  open,
  initialSimId,
  initialAmount,
  carriers,
  userSims,
  accounts,
  cards,
  onClose,
  onSuccess,
  onShowToast,
}: TelecomTopupModalProps) {
  const bankTheme = useMemo(() => getThemePalette('coral'), []);
  const activeSims = useMemo(() => userSims.filter((s) => s.status === 'active'), [userSims]);
  const [selectedSimId, setSelectedSimId] = useState<string>('');
  const [amount, setAmount] = useState<number>(initialAmount || 100000);
  const [paySource, setPaySource] = useState<{ accountId: string; cardId?: string }>(() =>
    resolveDefaultPaymentSource(accounts, cards)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const preferred =
      (initialSimId && activeSims.find((s) => s.id === initialSimId)) ||
      activeSims.find((s) => Number(s.is_primary) === 1) ||
      activeSims[0];
    setSelectedSimId(preferred?.id || '');
    if (initialAmount && initialAmount >= 10000) {
      const snapped = TOPUP_DENOMINATIONS.find((d) => d >= initialAmount) || 100000;
      setAmount(snapped);
    }
    setPaySource(resolveDefaultPaymentSource(accounts, cards));
  }, [open, initialSimId, initialAmount, activeSims, accounts, cards]);

  const selectedSim = useMemo(
    () => userSims.find((s) => s.id === selectedSimId) || null,
    [userSims, selectedSimId]
  );
  const selectedCarrier = useMemo(
    () => carriers.find((c) => c.id === selectedSim?.carrier_id) || null,
    [carriers, selectedSim]
  );

  const payCard = useMemo(
    () => (paySource.cardId ? cards.find((c) => c.id === paySource.cardId) || null : null),
    [cards, paySource.cardId]
  );
  const payAccount = useMemo(() => {
    if (payCard?.account_id) {
      const linked = accounts.find((a) => a.id === payCard.account_id);
      if (linked) return linked;
    }
    return accounts.find((a) => a.id === paySource.accountId) || accounts[0] || null;
  }, [accounts, payCard, paySource.accountId]);

  const payAvailable = Number(payAccount?.available_balance ?? payAccount?.balance ?? 0);
  const payInvalid =
    !payAccount ||
    payAccount.account_role === 'receive_only' ||
    payAccount.status === 'locked' ||
    (payCard ? payCard.status === 'locked' || isCardExpired(payCard.expiry) : false);

  if (!open) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!selectedSim || selectedSim.status !== 'active') {
      showError('SIM chưa sẵn sàng', 'Vui lòng chọn một SIM đang hoạt động để nạp tiền.');
      return;
    }
    if (payInvalid) {
      showError('Nguồn thanh toán không hợp lệ', 'Vui lòng chọn tài khoản hoặc thẻ Hikari Bank đang hoạt động.');
      return;
    }
    if (amount > payAvailable) {
      showError('Số dư Hikari Bank không đủ', 'Vui lòng chọn tài khoản khác hoặc giảm mệnh giá nạp.');
      return;
    }

    setBusy(true);
    try {
      const idempotencyKey = `attop_${selectedSim.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await osApi.telecom.topupSim({
        simId: selectedSim.id,
        carrierId: selectedSim.carrier_id,
        amount,
        sourceAccountId: payAccount?.id,
        sourceCardId: payCard?.id,
        idempotencyKey,
      });
      emitTelecomSyncEvent('telecom');
      onShowToast(
        'Nạp tiền thành công',
        `+${formatVnd(amount)} vào ${formatPhoneDisplay(selectedSim.phone_number)} (${selectedCarrier?.name || selectedSim.carrier_id}).`,
        'success'
      );
      onSuccess(res, res.telecomTransaction);
      onClose();
    } catch (err) {
      showError('Nạp tiền thất bại', err instanceof Error ? err.message : 'Không thể nạp tiền');
    } finally {
      setBusy(false);
    }
  };

  function showError(title: string, msg: string) {
    onShowToast(title, msg, 'error');
  }

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
            <Smartphone className="w-5 h-5 text-indigo-500" />
            <div>
              <h3 className="text-sm font-extrabold">Nạp tiền SIM · Hikari Bank Sync</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Đồng bộ trực tiếp với tài khoản Hikari Bank · 0đ phí
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          {activeSims.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs flex items-start gap-2.5 text-amber-600 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Bạn chưa có SIM nào đang hoạt động. Hãy mua SIM mới trong Cửa hàng SIM hoặc mở khóa SIM.</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                  Chọn SIM nhận tiền
                </label>
                <div className="space-y-1.5">
                  {userSims.map((sim) => {
                    const carrier = carriers.find((c) => c.id === sim.carrier_id);
                    const disabled = sim.status !== 'active';
                    const active = sim.id === selectedSimId;
                    return (
                      <button
                        key={sim.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedSimId(sim.id)}
                        className={`w-full min-h-[54px] rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-left transition-colors ${
                          active
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5'
                        } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CarrierLogo variant={carrier?.logo_variant || sim.carrier_id} size={34} className="shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold tabular-nums truncate">
                              {formatPhoneDisplay(sim.phone_number)}
                              <span className="ml-1.5 text-[10px] font-bold text-indigo-500">
                                {Number(sim.is_primary) === 1 ? '· SIM CHÍNH' : '· SIM PHỤ'}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {carrier?.name || sim.carrier_id} · Số dư SIM: {formatVnd(sim.sim_balance)}
                              {disabled ? ` (${sim.status === 'locked' ? 'Đang khóa' : 'Đã hủy'})` : ''}
                            </p>
                          </div>
                        </div>
                        {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                  Mệnh giá nạp
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TOPUP_DENOMINATIONS.map((val) => {
                    const active = amount === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAmount(val)}
                        className={`min-h-[44px] rounded-xl text-xs font-extrabold tabular-nums border transition-colors ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5'
                        }`}
                      >
                        {formatVnd(val)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <PaymentSourceSelector
                accounts={accounts}
                cards={cards}
                selectedAccountId={payAccount?.id || paySource.accountId}
                selectedCardId={payCard?.id}
                requiredAmount={amount}
                theme={bankTheme}
                label="Nguồn thanh toán từ Hikari Bank"
                onSelect={setPaySource}
              />

              {selectedSim && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Số dư SIM hiện tại</span>
                    <span className="font-bold tabular-nums">{formatVnd(selectedSim.sim_balance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Số dư SIM sau nạp</span>
                    <span className="font-extrabold text-emerald-500 tabular-nums">
                      {formatVnd(Number(selectedSim.sim_balance || 0) + amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Thanh toán từ Hikari Bank</span>
                    <span className="font-extrabold text-rose-500 tabular-nums">-{formatVnd(amount)}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !selectedSim || payInvalid || amount > payAvailable}
                className="w-full min-h-[48px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-sm font-extrabold"
              >
                {busy ? 'Đang xử lý giao dịch...' : `Xác nhận nạp ${formatVnd(amount)}`}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
