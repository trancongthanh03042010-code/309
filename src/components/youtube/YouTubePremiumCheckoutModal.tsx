import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Keyboard,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ApiHttpError,
  BANKING_SYNC_EVENT,
  emitBankingSyncEvent,
  emitYoutubeSyncEvent,
  osApi,
} from '../../services/api';
import type {
  BankingCardItem,
  BankingOverviewPayload,
  CardLookupResult,
  YouTubeMovieItem,
  YouTubePlanConfig,
  YouTubeStreamingOverview,
} from '../../types/os';
import { BankBrandEmblem } from '../banking/cards/BankCardVisual';

export type YouTubeCheckoutIntent =
  | {
      kind: 'plan';
      plan: YouTubePlanConfig;
      actionLabel: string;
    }
  | {
      kind: 'movie';
      movie: YouTubeMovieItem;
      mode: 'rent' | 'buy';
    }
  | {
      kind: 'save_method';
    };

interface YouTubePremiumCheckoutModalProps {
  open: boolean;
  intent: YouTubeCheckoutIntent | null;
  currentSavedCardId?: string;
  onClose: () => void;
  onCompleted: (overview: YouTubeStreamingOverview, message: string) => void;
}

function formatVnd(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')}đ`;
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

function isCardExpired(expiry: string): boolean {
  const m = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[1]);
  const yy = 2000 + Number(m[2]);
  if (mm < 1 || mm > 12) return true;
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  return yy < curY || (yy === curY && mm < curM);
}

function makeIdemKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function YouTubePremiumCheckoutModal({
  open,
  intent,
  currentSavedCardId,
  onClose,
  onCompleted,
}: YouTubePremiumCheckoutModalProps) {
  const [bankingOverview, setBankingOverview] = useState<BankingOverviewPayload | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [mode, setMode] = useState<'saved' | 'manual'>('saved');
  const [selectedCardId, setSelectedCardId] = useState('');

  const [panInput, setPanInput] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [showCvv, setShowCvv] = useState(false);

  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const [autoRenewConsent, setAutoRenewConsent] = useState(false);

  const [lookupResult, setLookupResult] = useState<CardLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ title: string; message: string; code?: string } | null>(null);
  const idemKeyRef = useRef<string>(makeIdemKey('yt_pay'));

  const loadCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const res = await osApi.banking.getOverview();
      setBankingOverview(res);
      setSelectedCardId((prev) => {
        const list = (res.cards || []).filter((c) => c.status !== 'cancelled');
        if (prev && list.some((c) => c.id === prev)) return prev;
        if (currentSavedCardId && list.some((c) => c.id === currentSavedCardId)) return currentSavedCardId;
        return (
          list.find((c) => Number(c.is_primary) === 1 && c.status === 'active')?.id ||
          list.find((c) => c.status === 'active')?.id ||
          list[0]?.id ||
          ''
        );
      });
    } catch {
      // handled on submit
    } finally {
      setLoadingCards(false);
    }
  }, [currentSavedCardId]);

  useEffect(() => {
    if (!open) return;
    setErrorBanner(null);
    setBusy(false);
    setAutoRenewConsent(false);
    setSavePaymentMethod(true);
    idemKeyRef.current = makeIdemKey('yt_pay');
    void loadCards();
  }, [open, intent, loadCards]);

  useEffect(() => {
    if (!open) return;
    const onSync = () => void loadCards();
    window.addEventListener(BANKING_SYNC_EVENT, onSync);
    return () => window.removeEventListener(BANKING_SYNC_EVENT, onSync);
  }, [open, loadCards]);

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
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, mode, cleanPan]);

  const cards = useMemo(() => bankingOverview?.cards || [], [bankingOverview?.cards]);
  const accounts = useMemo(() => bankingOverview?.accounts || [], [bankingOverview?.accounts]);
  const selectedCard: BankingCardItem | null = useMemo(
    () => cards.find((c) => c.id === selectedCardId) || null,
    [cards, selectedCardId]
  );

  if (!open || !intent) return null;

  const amount =
    intent.kind === 'plan'
      ? intent.plan.price
      : intent.kind === 'movie'
      ? intent.mode === 'buy'
        ? intent.movie.buyPrice
        : intent.movie.rentPrice
      : 0;

  const headerTitle =
    intent.kind === 'plan'
      ? intent.actionLabel
      : intent.kind === 'movie'
      ? intent.mode === 'buy'
        ? `Mua phim: ${intent.movie.title}`
        : `Thuê phim 72h: ${intent.movie.title}`
      : 'Liên kết / Cập nhật thẻ thanh toán';

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (busy) return;
    setErrorBanner(null);

    if (mode === 'saved') {
      if (!selectedCard) {
        setErrorBanner({ title: 'Chưa chọn thẻ', message: 'Vui lòng chọn một thẻ ngân hàng Hikari Bank.' });
        return;
      }
    } else {
      if (cleanPan.length !== 16) {
        setErrorBanner({ title: 'Số thẻ không hợp lệ', message: 'Số thẻ ngân hàng phải gồm đủ 16 chữ số.' });
        return;
      }
      if (!holderName.trim()) {
        setErrorBanner({ title: 'Thiếu tên chủ thẻ', message: 'Vui lòng nhập tên chủ thẻ in trên thẻ.' });
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry.trim())) {
        setErrorBanner({ title: 'Ngày hết hạn sai', message: 'Ngày hết hạn phải theo định dạng MM/YY.' });
        return;
      }
      if (!/^\d{3,4}$/.test(cvv.trim())) {
        setErrorBanner({ title: 'Thiếu mã CVV', message: 'Mã bảo mật CVV phải gồm 3 chữ số ở mặt sau thẻ.' });
        return;
      }
    }

    const cardPayload =
      mode === 'saved'
        ? { cardId: selectedCard!.id }
        : {
            cardNumber: cleanPan,
            holderName: holderName.trim(),
            expiry: expiry.trim(),
            cvv: cvv.trim(),
          };

    setBusy(true);
    try {
      if (intent.kind === 'save_method') {
        const res = await osApi.updateYoutubePaymentMethod(cardPayload);
        emitYoutubeSyncEvent('payment_method_updated');
        onCompleted(res.overview, 'Đã lưu phương thức thanh toán cho YouTube Premium.');
        onClose();
        return;
      }

      if (intent.kind === 'plan') {
        const res = await osApi.subscribeYoutubePremium({
          planId: intent.plan.id,
          autoRenew: autoRenewConsent,
          savePaymentMethod: savePaymentMethod || autoRenewConsent,
          ...cardPayload,
          idempotencyKey: idemKeyRef.current,
        });
        emitBankingSyncEvent('youtube_checkout');
        emitYoutubeSyncEvent('subscription_updated');
        onCompleted(res.overview, `Đã kích hoạt gói YouTube ${intent.plan.name} thành công!`);
        onClose();
        return;
      }

      const res = await osApi.purchaseYoutubeMovie(intent.movie.id, {
        mode: intent.mode,
        ...cardPayload,
        idempotencyKey: idemKeyRef.current,
      });
      emitBankingSyncEvent('youtube_movie_checkout');
      emitYoutubeSyncEvent('movie_unlocked');
      onCompleted(
        res.overview,
        intent.mode === 'buy'
          ? `Đã mua thành công "${intent.movie.title}"!`
          : `Đã thuê 72 giờ phim "${intent.movie.title}"!`
      );
      onClose();
    } catch (err) {
      idemKeyRef.current = makeIdemKey('yt_pay_retry');
      emitBankingSyncEvent('youtube_checkout_failed');
      if (err instanceof ApiHttpError) {
        const title =
          err.code === 'CARD_LOCKED'
            ? 'Thẻ đang bị khóa'
            : err.code === 'INSUFFICIENT_FUNDS' || err.code === 'INSUFFICIENT_BALANCE'
            ? 'Số dư không đủ'
            : err.code === 'INVALID_CVV'
            ? 'Mã CVV không đúng'
            : err.code === 'CARD_EXPIRED' || err.code === 'INVALID_EXPIRY'
            ? 'Thẻ hết hạn / Sai hạn thẻ'
            : 'Thanh toán bị từ chối';
        setErrorBanner({
          title,
          message: err.reason || err.message,
          code: err.code,
        });
      } else {
        setErrorBanner({
          title: 'Lỗi thanh toán',
          message: err instanceof Error ? err.message : 'Không thể xử lý giao dịch.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-2.5 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-zinc-950 text-zinc-100 border border-white/10 p-4 space-y-3.5 max-h-[92vh] overflow-y-auto os-scroll shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-rose-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Thanh toán thẻ · Hikari Bank</span>
            </div>
            <h3 className="text-base font-bold mt-0.5 leading-snug">{headerTitle}</h3>
            {intent.kind === 'plan' && (
              <p className="text-xs text-zinc-400 mt-0.5">
                Tối đa {intent.plan.maxQuality} · {intent.plan.maxDevices} thiết bị · Chu kỳ 30 ngày
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Amount */}
        {intent.kind !== 'save_method' && (
          <div className="rounded-2xl bg-gradient-to-br from-rose-600/20 via-zinc-900 to-zinc-900 border border-rose-500/25 p-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-zinc-400">Tổng thanh toán</p>
              <p className="text-xl font-black tabular-nums text-white">{formatVnd(amount)}</p>
            </div>
            <div className="text-right text-[11px] text-zinc-300">
              <p className="font-semibold flex items-center justify-end gap-1 text-amber-300">
                <Crown className="w-3.5 h-3.5" />
                <span>YouTube Pay</span>
              </p>
              <p className="text-zinc-400">Trừ trực tiếp qua thẻ ngân hàng</p>
            </div>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-white/10">
          <button
            type="button"
            onClick={() => {
              setMode('saved');
              setErrorBanner(null);
            }}
            className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'saved' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Thẻ đã liên kết</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setErrorBanner(null);
            }}
            className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'manual' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Nhập thẻ mới</span>
          </button>
        </div>

        {/* Mode 1: Linked Cards */}
        {mode === 'saved' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Chọn thẻ Debit / Credit từ Hikari Bank</span>
              <button
                type="button"
                onClick={() => void loadCards()}
                className="min-h-[32px] px-2 rounded-lg text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingCards ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>
            </div>

            {loadingCards && cards.length === 0 ? (
              <p className="text-xs text-center text-zinc-400 py-5">Đang đồng bộ danh sách thẻ Hikari Bank...</p>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-center space-y-1">
                <p className="text-xs font-bold">Chưa có thẻ ngân hàng nào</p>
                <p className="text-[11px] text-zinc-400">
                  Mở ứng dụng Hikari Bank để phát hành thẻ Debit hoặc Credit trước khi thanh toán.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto os-scroll pr-0.5">
                {cards.map((c) => {
                  const isCancelled = c.status === 'cancelled';
                  const isLocked = c.status === 'locked';
                  const isExpired = isCardExpired(c.expiry);
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
                        setErrorBanner(null);
                      }}
                      className={`w-full min-h-[64px] rounded-2xl border p-3 text-left transition-colors flex items-center justify-between gap-2.5 ${
                        isCancelled
                          ? 'opacity-45 cursor-not-allowed bg-zinc-900/40 border-white/5'
                          : selected
                          ? 'border-rose-500 bg-rose-500/10 ring-1 ring-rose-500/40'
                          : 'border-white/10 bg-zinc-900/70 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
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
                            <span className="text-xs font-bold truncate text-white">
                              {c.card_nickname || c.card_name}
                            </span>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                              {c.card_category === 'credit' ? 'Credit' : 'Debit'}
                            </span>
                            {isLocked && (
                              <span className="text-[10px] font-bold text-rose-400 flex items-center gap-0.5">
                                <Lock className="w-3 h-3" /> Đang khóa
                              </span>
                            )}
                            {isExpired && !isCancelled && (
                              <span className="text-[10px] font-bold text-amber-400">Hết hạn</span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            {c.masked_number || `•••• •••• •••• ${c.last4}`} · HSD {c.expiry}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-extrabold tabular-nums text-emerald-400">
                          {formatVnd(balance)}
                        </p>
                        <p className="text-[10px] text-zinc-400">{c.status === 'active' ? 'Khả dụng' : 'Không dùng được'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Mode 2: Manual Card Entry */
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">CARD NUMBER (16 số)</label>
              <input
                value={panInput}
                onChange={(e) => setPanInput(formatPanInput(e.target.value))}
                placeholder="4532 8810 0000 1234"
                inputMode="numeric"
                className="w-full min-h-[44px] px-3 rounded-xl border border-white/15 bg-zinc-900 text-xs font-mono font-bold tracking-wider text-white outline-none focus:border-rose-500"
              />
              {lookupLoading && <p className="text-[11px] text-zinc-400 mt-1">Đang kiểm tra thẻ trên Hikari Bank...</p>}
              {!lookupLoading && lookupResult && cleanPan.length === 16 && (
                <div
                  className={`mt-1.5 rounded-xl border p-2.5 text-[11px] flex items-center justify-between gap-2 ${
                    lookupResult.found
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {lookupResult.found ? (
                    <>
                      <div className="min-w-0">
                        <p className="font-bold truncate">
                          {lookupResult.bankName} · {(lookupResult.cardCategory || 'debit').toUpperCase()} · {lookupResult.tierLabel}
                        </p>
                        <p className="text-[10px] opacity-80 truncate">Chủ thẻ: {lookupResult.holderName}</p>
                      </div>
                      <span className="font-bold shrink-0">
                        {lookupResult.status === 'active'
                          ? 'Hoạt động'
                          : lookupResult.status === 'locked'
                          ? 'Đang khóa'
                          : 'Đã hủy'}
                      </span>
                    </>
                  ) : (
                    <span>Số thẻ không tồn tại trong hệ thống ngân hàng PHONE OS.</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">CARD HOLDER (Tên chủ thẻ)</label>
              <input
                value={holderName}
                onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                placeholder="VD: MINH ANH"
                className="w-full min-h-[44px] px-3 rounded-xl border border-white/15 bg-zinc-900 text-xs font-bold uppercase text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">EXPIRY DATE (MM/YY)</label>
                <input
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiryInput(e.target.value))}
                  placeholder="09/29"
                  inputMode="numeric"
                  className="w-full min-h-[44px] px-3 rounded-xl border border-white/15 bg-zinc-900 text-xs font-mono font-bold text-white outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">CVV / CVC</label>
                <div className="relative">
                  <input
                    type={showCvv ? 'text' : 'password'}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    inputMode="numeric"
                    className="w-full min-h-[44px] px-3 pr-10 rounded-xl border border-white/15 bg-zinc-900 text-xs font-mono font-bold text-white outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvv((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white"
                  >
                    {showCvv ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Opt-in Save Payment Method & Auto-Renew Consent */}
        {intent.kind === 'plan' && (
          <div className="rounded-2xl bg-zinc-900/80 border border-white/10 p-3 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={savePaymentMethod}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSavePaymentMethod(checked);
                  if (!checked) setAutoRenewConsent(false);
                }}
                className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
              />
              <span className="text-xs text-zinc-200 leading-snug">
                Lưu thẻ dưới dạng mã hóa (không lưu số thẻ đầy đủ và CVV) để dùng cho lần thanh toán tiếp theo
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={autoRenewConsent}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAutoRenewConsent(checked);
                  if (checked) setSavePaymentMethod(true);
                }}
                className="mt-0.5 w-4 h-4 accent-rose-600 rounded"
              />
              <span className="text-xs text-zinc-200 leading-snug">
                Đồng ý <strong className="text-white">tự động gia hạn hàng tháng</strong> ({formatVnd(intent.plan.price)}/tháng). Có thể hủy bất kỳ lúc nào.
              </span>
            </label>
          </div>
        )}

        {/* Error Display */}
        {errorBanner && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-3 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="font-bold text-rose-300">{errorBanner.title}</p>
              <p className="text-[11px] leading-relaxed">{errorBanner.message}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 rounded-xl border border-white/15 bg-zinc-900 text-xs font-bold text-zinc-300"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || (mode === 'saved' && !selectedCard)}
            onClick={() => void handleSubmit()}
            className="flex-1 min-h-[46px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-45 shadow-lg shadow-rose-600/25"
          >
            {busy ? (
              <span>Đang xác thực với ngân hàng...</span>
            ) : intent.kind === 'save_method' ? (
              <span>Lưu thẻ thanh toán</span>
            ) : (
              <span>Thanh toán ngay · {formatVnd(amount)}</span>
            )}
          </button>
        </div>

        <p className="text-[10.5px] text-center text-zinc-500 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Kết nối trực tiếp với ví thẻ Hikari Bank · Kiểm tra khóa thẻ, CVV & số dư thực</span>
        </p>
      </div>
    </div>
  );
}
