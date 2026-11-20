import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Keyboard,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { ApiHttpError, BANKING_SYNC_EVENT, emitBankingSyncEvent, osApi } from '../../../services/api';
import type { BankingCardItem, BankingOverviewPayload, CardLookupResult } from '../../../types/os';
import { formatVnd, isCardExpired } from '../utils';
import { BankBrandEmblem } from './BankCardVisual';

export interface UniversalCardCheckoutModalProps {
  open: boolean;
  title: string;
  merchant: string;
  category: string;
  amount: number;
  channelType?: 'online' | 'pos' | 'intl';
  appSource: string;
  onClose: () => void;
  onSuccess: (result: Awaited<ReturnType<typeof osApi.banking.chargeCard>>) => Promise<void> | void;
}

function formatPanInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function makeIdemKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function UniversalCardCheckoutModal({
  open,
  title,
  merchant,
  category,
  amount,
  channelType = 'online',
  appSource,
  onClose,
  onSuccess,
}: UniversalCardCheckoutModalProps) {
  const [overview, setOverview] = useState<BankingOverviewPayload | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [mode, setMode] = useState<'saved' | 'manual'>('saved');
  const [selectedCardId, setSelectedCardId] = useState('');

  // Manual PAN entry state
  const [panInput, setPanInput] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [showCvv, setShowCvv] = useState(false);

  const [lookupResult, setLookupResult] = useState<CardLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const idemKeyRef = useRef<string>(makeIdemKey('cgw'));

  const loadCards = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await osApi.banking.getOverview();
      setOverview(res);
      setSelectedCardId((prev) => {
        const list = (res.cards || []).filter((c) => c.status !== 'cancelled');
        if (prev && list.some((c) => c.id === prev)) return prev;
        return (
          list.find((c) => Number(c.is_primary) === 1 && c.status === 'active')?.id ||
          list.find((c) => c.status === 'active')?.id ||
          list[0]?.id ||
          ''
        );
      });
    } catch {
      // handled in submit if unavailable
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setBusy(false);
    idemKeyRef.current = makeIdemKey('cgw');
    void loadCards();
  }, [open, amount, merchant, loadCards]);

  useEffect(() => {
    if (!open) return;
    const onSync = () => void loadCards();
    window.addEventListener(BANKING_SYNC_EVENT, onSync);
    return () => window.removeEventListener(BANKING_SYNC_EVENT, onSync);
  }, [open, loadCards]);

  // Debounced card lookup when user enters 16 digits
  const cleanPan = useMemo(() => panInput.replace(/\D/g, ''), [panInput]);
  useEffect(() => {
    if (!open || mode !== 'manual' || cleanPan.length < 16) {
      setLookupResult(null);
      setLookupLoading(false);
      return;
    }
    let cancelled = false;
    setLookupLoading(true);
    const timer = window.setTimeout(() => {
      osApi.banking
        .lookupCard({ cardNumber: cleanPan })
        .then((res) => {
          if (!cancelled) setLookupResult(res);
        })
        .catch(() => {
          if (!cancelled) setLookupResult({ found: false });
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, mode, cleanPan]);

  const cards = useMemo(() => overview?.cards || [], [overview?.cards]);
  const accounts = useMemo(() => overview?.accounts || [], [overview?.accounts]);

  const selectedCard: BankingCardItem | null = useMemo(
    () => cards.find((c) => c.id === selectedCardId) || null,
    [cards, selectedCardId]
  );

  const handleCharge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (busy) return;
    setErrorMsg(null);

    if (mode === 'saved') {
      if (!selectedCard) {
        setErrorMsg('Vui lòng chọn một thẻ ngân hàng để thanh toán.');
        return;
      }
    } else {
      if (cleanPan.length !== 16) {
        setErrorMsg('Số thẻ phải gồm đủ 16 chữ số.');
        return;
      }
      if (!holderName.trim()) {
        setErrorMsg('Vui lòng nhập tên chủ thẻ.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry.trim())) {
        setErrorMsg('Ngày hết hạn phải theo định dạng MM/YY.');
        return;
      }
      if (!/^\d{3,4}$/.test(cvv.trim())) {
        setErrorMsg('Mã CVV phải gồm 3 chữ số ở mặt sau thẻ.');
        return;
      }
    }

    setBusy(true);
    try {
      const res = await osApi.banking.chargeCard({
        ...(mode === 'saved'
          ? { cardId: selectedCard!.id }
          : {
              cardNumber: cleanPan,
              holderName: holderName.trim(),
              expiry: expiry.trim(),
              cvv: cvv.trim(),
            }),
        amount,
        merchant,
        category,
        channelType,
        appSource,
        idempotencyKey: idemKeyRef.current,
      });
      emitBankingSyncEvent('card_gateway');
      await onSuccess(res);
      onClose();
    } catch (err) {
      idemKeyRef.current = makeIdemKey('cgw_retry');
      emitBankingSyncEvent('card_gateway');
      if (err instanceof ApiHttpError) {
        setErrorMsg(err.reason || err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Thanh toán thẻ thất bại.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#16171F] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3.5 max-h-[90vh] overflow-y-auto os-scroll shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500">
                Cổng Thanh Toán Thẻ · Hikari Pay
              </span>
            </div>
            <h3 className="text-sm font-black truncate mt-0.5">{title}</h3>
            <p className="text-[11px] text-zinc-500 truncate">
              Đơn vị: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{merchant}</span> · {category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Banner */}
        <div className="rounded-2xl bg-gradient-to-br from-[#1F2437] to-[#11131D] text-white p-3.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-zinc-300">Tổng thanh toán</p>
            <p className="text-lg font-black tabular-nums text-rose-300">{formatVnd(amount)}</p>
          </div>
          <div className="text-right text-[10.5px] text-zinc-300">
            <p className="font-bold text-white flex items-center justify-end gap-1">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Hoàn tiền & Điểm</span>
            </p>
            <p>Tính theo hạng thẻ thực</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => {
              setMode('saved');
              setErrorMsg(null);
            }}
            className={`min-h-[38px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'saved'
                ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-zinc-500'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Chọn thẻ đã phát hành</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setErrorMsg(null);
            }}
            className={`min-h-[38px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'manual'
                ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-zinc-500'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Nhập thông tin thẻ</span>
          </button>
        </div>

        {/* Saved Cards List */}
        {mode === 'saved' ? (
          <div className="space-y-2">
            {loadingOverview && cards.length === 0 ? (
              <p className="text-xs text-center text-zinc-500 py-4">Đang tải danh sách thẻ Hikari Bank...</p>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 text-center space-y-1">
                <p className="text-xs font-bold">Chưa có thẻ ngân hàng nào</p>
                <p className="text-[11px] text-zinc-500">
                  Mở ứng dụng Hikari Bank → Thẻ & Tài khoản để phát hành thẻ.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto os-scroll pr-0.5">
                {cards.map((c) => {
                  const isCancelled = c.status === 'cancelled';
                  const isLocked = c.status === 'locked';
                  const isExpired = isCardExpired(c.expiry);
                  const isUnlinked = c.linked_status === 'unlinked' || !c.account_id;
                  const acc = accounts.find((a) => a.id === c.account_id);
                  const balance = Number(c.linked_balance ?? acc?.available_balance ?? acc?.balance ?? 0);
                  const selected = selectedCardId === c.id;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isCancelled}
                      onClick={() => {
                        setSelectedCardId(c.id);
                        setErrorMsg(null);
                      }}
                      className={`w-full rounded-2xl border p-2.5 text-left transition-colors flex items-center justify-between gap-2.5 ${
                        isCancelled
                          ? 'opacity-45 cursor-not-allowed bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800'
                          : selected
                          ? 'border-rose-500 bg-rose-500/5 ring-1 ring-rose-500/40'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:border-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                          style={{
                            background: `linear-gradient(135deg, ${c.bank_primary_color || '#E14B5A'}, ${
                              c.bank_secondary_color || '#1E293B'
                            })`,
                          }}
                        >
                          <BankBrandEmblem bankId={c.bank_id} size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-extrabold truncate">
                              {c.card_nickname || c.card_name}
                            </span>
                            <span className="text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800">
                              {c.card_category === 'credit' ? 'CREDIT' : 'DEBIT'}
                            </span>
                            {isLocked && (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> ĐANG KHÓA
                              </span>
                            )}
                            {isCancelled && (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-500">
                                ĐÃ HỦY
                              </span>
                            )}
                            {isExpired && !isCancelled && (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                                HẾT HẠN
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                            {c.masked_number || `•••• •••• •••• ${c.last4}`} · HSD {c.expiry}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          {isUnlinked ? 'Chưa LK' : formatVnd(balance)}
                        </p>
                        <p className="text-[10px] text-zinc-500">Hoàn {c.cashback_rate || 0}%</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Manual Card Entry */
          <form onSubmit={handleCharge} className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-zinc-500 block mb-1">Số thẻ (16 chữ số)</label>
              <input
                value={panInput}
                onChange={(e) => setPanInput(formatPanInput(e.target.value))}
                placeholder="4532 8810 0000 1234"
                inputMode="numeric"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono font-bold tracking-wider outline-none focus:border-rose-500"
              />
              {lookupLoading && (
                <p className="text-[10.5px] text-zinc-500 mt-1">Đang tra cứu thông tin thẻ trong hệ thống...</p>
              )}
              {!lookupLoading && lookupResult && cleanPan.length === 16 && (
                <div
                  className={`mt-1.5 rounded-xl border p-2 flex items-center justify-between gap-2 text-[11px] ${
                    lookupResult.found
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {lookupResult.found ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <BankBrandEmblem
                          bankId={
                            lookupResult.bankShortCode === 'SK'
                              ? 'sakura'
                              : lookupResult.bankShortCode === 'AK'
                              ? 'akuma'
                              : lookupResult.bankShortCode === 'TK'
                              ? 'tsuki'
                              : lookupResult.bankShortCode === 'AO'
                              ? 'aoi'
                              : 'hikari'
                          }
                          size={20}
                        />
                        <div className="min-w-0">
                          <p className="font-bold truncate">
                            {lookupResult.bankName} · {lookupResult.tierLabel} ({(lookupResult.cardCategory || 'debit').toUpperCase()})
                          </p>
                          <p className="text-[10px] opacity-85 truncate">
                            {lookupResult.maskedNumber} · Chủ thẻ: {lookupResult.holderName}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                          lookupResult.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {lookupResult.status === 'active'
                          ? 'Hoạt động'
                          : lookupResult.status === 'locked'
                          ? 'Đang khóa'
                          : 'Đã hủy'}
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold">Không tìm thấy số thẻ này trong kho thẻ Hikari Bank.</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-500 block mb-1">Tên chủ thẻ (in trên thẻ)</label>
              <input
                value={holderName}
                onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                placeholder="VD: MINH ANH"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-bold uppercase outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">Ngày hết hạn (MM/YY)</label>
                <input
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiryInput(e.target.value))}
                  placeholder="09/29"
                  inputMode="numeric"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono font-bold outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-zinc-500 block mb-1">Mã bảo mật (CVV)</label>
                <div className="relative">
                  <input
                    type={showCvv ? 'text' : 'password'}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    inputMode="numeric"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono font-bold outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvv((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showCvv ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Prominent Server Rejection / Error Banner */}
        {errorMsg && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-black">Thanh toán bị từ chối</p>
              <p className="text-[11px] leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || (mode === 'saved' && !selectedCard)}
            onClick={() => void handleCharge()}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            {busy ? (
              <span>Đang xác thực & trừ tiền...</span>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5" />
                <span>Xác nhận thanh toán {formatVnd(amount)}</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[10px] text-center text-zinc-500 flex items-center justify-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span>Giao dịch được kiểm tra trạng thái thẻ, hạn mức & số dư mô phỏng theo thời gian thực.</span>
        </p>
      </div>
    </div>
  );
}
