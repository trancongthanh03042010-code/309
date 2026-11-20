import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Shield,
  Sparkles,
  Tv,
  Unlink,
  XCircle,
} from 'lucide-react';
import {
  ApiHttpError,
  emitYoutubeSyncEvent,
  osApi,
} from '../../services/api';
import type {
  YouTubeInvoiceItem,
  YouTubePlanConfig,
  YouTubeStreamingOverview,
} from '../../types/os';
import type { YouTubeCheckoutIntent } from './YouTubePremiumCheckoutModal';

interface YouTubePremiumViewProps {
  overview: YouTubeStreamingOverview | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenCheckout: (intent: YouTubeCheckoutIntent) => void;
  onToast: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatVnd(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')}đ`;
}

function formatDateVi(iso?: string): string {
  if (!iso) return 'Chưa có';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa có';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PLAN_RANK: Record<string, number> = {
  free: 0,
  basic: 1,
  standard: 2,
  premium: 3,
};

export function YouTubePremiumView({
  overview,
  loading,
  onRefresh,
  onOpenCheckout,
  onToast,
}: YouTubePremiumViewProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<YouTubeInvoiceItem | null>(null);

  if (loading && !overview) {
    return (
      <div className="p-6 text-center text-xs text-zinc-400">
        Đang tải thông tin YouTube Premium & Gói thành viên...
      </div>
    );
  }

  const membership = overview?.membership;
  const plans = (overview?.plans || []).filter((p) => p.id !== 'free');
  const invoices = overview?.invoices || [];
  const currentEffectivePlanId = membership?.effectivePlanId || 'free';
  const isActive = membership?.status === 'active' && currentEffectivePlanId !== 'free';
  const savedCard = membership?.savedCard || null;
  const isCardBlocked = Boolean(savedCard && savedCard.liveStatus !== 'active');

  const handleToggleAutoRenew = async () => {
    if (!membership || busyAction) return;
    if (!membership.autoRenew && !savedCard) {
      onOpenCheckout({ kind: 'save_method' });
      return;
    }
    setBusyAction('autorenew');
    try {
      await osApi.toggleYoutubeAutoRenew(!membership.autoRenew, savedCard?.cardId);
      emitYoutubeSyncEvent('autorenew_toggled');
      await onRefresh();
      onToast(
        'Tự động gia hạn',
        !membership.autoRenew ? 'Đã bật tự động gia hạn hàng tháng.' : 'Đã tắt tự động gia hạn.',
        'success'
      );
    } catch (err) {
      onToast(
        'Không thể cập nhật',
        err instanceof ApiHttpError ? err.reason || err.message : 'Vui lòng kiểm tra lại thẻ đã lưu.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (busyAction) return;
    setBusyAction('cancel');
    try {
      await osApi.cancelYoutubePremium();
      setConfirmCancel(false);
      emitYoutubeSyncEvent('subscription_cancelled');
      await onRefresh();
      onToast(
        'Đã hủy gia hạn',
        'Gói của bạn vẫn giữ quyền lợi cho tới hết chu kỳ hiện tại.',
        'info'
      );
    } catch (err) {
      onToast('Lỗi', err instanceof Error ? err.message : 'Không thể hủy gói.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnlinkCard = async () => {
    if (busyAction) return;
    setBusyAction('unlink');
    try {
      await osApi.updateYoutubePaymentMethod({ unlink: true });
      emitYoutubeSyncEvent('card_unlinked');
      await onRefresh();
      onToast('Phương thức thanh toán', 'Đã gỡ thẻ thanh toán khỏi YouTube.', 'info');
    } catch (err) {
      onToast('Lỗi', err instanceof Error ? err.message : 'Không thể gỡ thẻ.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSimulateRenewalCycle = async () => {
    if (busyAction) return;
    setBusyAction('simulate');
    try {
      const res = await osApi.simulateYoutubeBillingCycle();
      emitYoutubeSyncEvent('cycle_simulated');
      await onRefresh();
      const evt = res.overview.lifecycleEvent;
      if (evt) {
        onToast(
          evt.type === 'renewed' ? 'Gia hạn thành công' : 'Thông báo chu kỳ gói',
          evt.message,
          evt.type === 'renewed' ? 'success' : evt.type === 'renew_failed' ? 'error' : 'info'
        );
      }
    } catch (err) {
      onToast('Không thể kiểm tra', err instanceof Error ? err.message : 'Gói chưa kích hoạt.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const getPlanCta = (plan: YouTubePlanConfig) => {
    if (!isActive) {
      return {
        label: `Đăng ký ${plan.name}`,
        actionLabel: `Đăng ký YouTube ${plan.name}`,
      };
    }
    const curRank = PLAN_RANK[currentEffectivePlanId] || 0;
    const targetRank = PLAN_RANK[plan.id] || 0;
    if (targetRank === curRank) {
      return {
        label: 'Gia hạn thêm 1 tháng',
        actionLabel: `Gia hạn YouTube ${plan.name}`,
      };
    }
    if (targetRank > curRank) {
      return {
        label: `Nâng cấp lên ${plan.name}`,
        actionLabel: `Nâng cấp lên YouTube ${plan.name}`,
      };
    }
    return {
      label: `Chuyển xuống ${plan.name}`,
      actionLabel: `Chuyển sang gói YouTube ${plan.name}`,
    };
  };

  return (
    <div className="p-3.5 sm:p-4 space-y-5 pb-6 max-w-5xl mx-auto">
      {/* Hero Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-rose-950/90 via-zinc-900 to-zinc-950 border border-rose-500/25 p-4 sm:p-5 space-y-2.5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">YouTube Premium & Cinema</h2>
              <p className="text-[11px] text-rose-200/80">Không quảng cáo · Phim & Series độc quyền · Độ phân giải lên tới 4K</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white"
            title="Đồng bộ trạng thái gói"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tài khoản -> Gói thành viên */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100">Tài khoản · Gói thành viên</h3>
          {isActive && (
            <button
              type="button"
              disabled={busyAction === 'simulate'}
              onClick={() => void handleSimulateRenewalCycle()}
              className="min-h-[36px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Kiểm tra đến hạn / Gia hạn</span>
            </button>
          )}
        </div>

        <div className="rounded-3xl bg-zinc-900/90 border border-white/10 p-4 space-y-3.5">
          {/* Status Row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white">
                  Gói hiện tại: {membership?.planName || 'Miễn phí'}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : membership?.status === 'expired'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {isActive ? 'Đang hoạt động' : membership?.status === 'expired' ? 'Đã hết hạn' : 'Miễn phí'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Chất lượng tối đa {membership?.maxQuality || '480p'} · {membership?.deviceLimit || 1} thiết bị ·{' '}
                {membership?.adFree ? 'Không quảng cáo' : 'Có quảng cáo'} ·{' '}
                {membership?.downloadEnabled ? 'Cho phép tải xuống' : 'Chưa hỗ trợ tải xuống'}
              </p>
            </div>
          </div>

          {/* Renewal Failure / Expiry Warning */}
          {membership?.lastRenewalError && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-3 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Cảnh báo trạng thái gói</p>
                <p className="text-[11px] mt-0.5 leading-relaxed">{membership.lastRenewalError}</p>
              </div>
            </div>
          )}

          {/* Dates & Auto Renew Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-2xl bg-zinc-950/70 border border-white/5 p-3">
              <p className="text-[10.5px] text-zinc-500">Ngày đăng ký</p>
              <p className="font-bold text-zinc-200 mt-0.5">{formatDateVi(membership?.subscribedAt)}</p>
            </div>
            <div className="rounded-2xl bg-zinc-950/70 border border-white/5 p-3">
              <p className="text-[10.5px] text-zinc-500">Ngày hết hạn</p>
              <p className="font-bold text-zinc-200 mt-0.5">{formatDateVi(membership?.expiresAt)}</p>
            </div>
            <div className="rounded-2xl bg-zinc-950/70 border border-white/5 p-3">
              <p className="text-[10.5px] text-zinc-500">Thanh toán tiếp theo</p>
              <p className="font-bold text-zinc-200 mt-0.5">
                {membership?.autoRenew && membership?.nextBillingAt ? formatDateVi(membership.nextBillingAt) : 'Không gia hạn'}
              </p>
            </div>
            <div className="rounded-2xl bg-zinc-950/70 border border-white/5 p-3">
              <p className="text-[10.5px] text-zinc-500">Tự động gia hạn</p>
              <p className={`font-bold mt-0.5 ${membership?.autoRenew ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {membership?.autoRenew ? 'Đang bật' : 'Đang tắt'}
              </p>
            </div>
          </div>

          {/* Saved Payment Method Box (Real-time synced with Hikari Bank lock status) */}
          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-rose-400" />
                <span>Phương thức thanh toán đã lưu</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenCheckout({ kind: 'save_method' })}
                  className="min-h-[36px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold text-white"
                >
                  {savedCard ? 'Đổi thẻ' : 'Liên kết thẻ'}
                </button>
                {savedCard && (
                  <button
                    type="button"
                    disabled={busyAction === 'unlink'}
                    onClick={() => void handleUnlinkCard()}
                    className="min-h-[36px] px-2.5 rounded-xl bg-zinc-800 hover:bg-rose-500/20 text-[11px] font-semibold text-zinc-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Gỡ thẻ</span>
                  </button>
                )}
              </div>
            </div>

            {savedCard ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">
                      {savedCard.bankName} · {savedCard.cardNickname} ({savedCard.cardCategory.toUpperCase()})
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      {savedCard.maskedNumber} · HSD {savedCard.expiry}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${
                      savedCard.liveStatus === 'active'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {savedCard.liveStatus !== 'active' && <Lock className="w-3 h-3" />}
                    <span>
                      {savedCard.liveStatus === 'active'
                        ? 'Hoạt động'
                        : savedCard.liveStatus === 'locked'
                        ? 'Đang bị khóa'
                        : savedCard.liveStatus === 'cancelled'
                        ? 'Đã hủy'
                        : 'Không khả dụng'}
                    </span>
                  </span>
                </div>
                {isCardBlocked && (
                  <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-2.5 text-[11px] text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      {savedCard.statusReason} Tính năng tự động gia hạn sẽ không thể trừ tiền cho tới khi bạn mở khóa thẻ trong Hikari Bank hoặc đổi sang thẻ khác.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Chưa liên kết thẻ ngân hàng nào. Thông tin thẻ đầy đủ và mã CVV không bao giờ được lưu lại.
              </p>
            )}
          </div>

          {/* Membership Action Buttons */}
          {isActive && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busyAction === 'autorenew'}
                onClick={() => void handleToggleAutoRenew()}
                className={`min-h-[44px] flex-1 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${
                  membership?.autoRenew
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-800 border-white/10 text-zinc-200'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{membership?.autoRenew ? 'Tự động gia hạn: BẬT' : 'Bật tự động gia hạn'}</span>
              </button>

              {!confirmCancel ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-800 hover:bg-rose-500/20 border border-white/10 text-xs font-bold text-rose-300"
                >
                  Hủy đăng ký
                </button>
              ) : (
                <div className="w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-amber-200">
                    Xác nhận hủy gia hạn? Bạn vẫn xem được quyền lợi tới hết {formatDateVi(membership?.expiresAt)}.
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="min-h-[38px] px-3 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300"
                    >
                      Giữ lại
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === 'cancel'}
                      onClick={() => void handleCancelSubscription()}
                      className="min-h-[38px] px-3 rounded-xl bg-rose-600 text-xs font-bold text-white"
                    >
                      Xác nhận hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Plans Comparison Showcase */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-100">Các gói thành viên YouTube Premium</h3>
          <p className="text-xs text-zinc-400">Chọn gói phù hợp · Nâng cấp hoặc chuyển đổi linh hoạt</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plans.map((plan) => {
            const isCurrent = isActive && currentEffectivePlanId === plan.id;
            const cta = getPlanCta(plan);
            const highlight = plan.id === 'standard' || plan.id === 'premium';

            return (
              <div
                key={plan.id}
                className={`rounded-3xl border p-4 flex flex-col justify-between gap-4 ${
                  isCurrent
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : plan.id === 'premium'
                    ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-zinc-900'
                    : highlight
                    ? 'border-rose-500/40 bg-zinc-900'
                    : 'border-white/10 bg-zinc-900/80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white">Gói {plan.name}</span>
                      {plan.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-600 text-white">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đang dùng
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-2xl font-black text-white tabular-nums">
                      {formatVnd(plan.price)}
                      <span className="text-xs font-medium text-zinc-400"> / tháng</span>
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">{plan.tagline}</p>
                  </div>

                  <div className="text-[11px] text-zinc-300 flex items-center gap-2 border-y border-white/10 py-2">
                    <span className="flex items-center gap-1 font-semibold">
                      <Tv className="w-3.5 h-3.5 text-rose-400" /> {plan.maxQuality}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{plan.maxDevices} thiết bị</span>
                    {plan.downloadSupported && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1 text-emerald-300">
                          <Download className="w-3 h-3" /> Tải xuống
                        </span>
                      </>
                    )}
                  </div>

                  <ul className="space-y-2 text-xs text-zinc-200">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onOpenCheckout({
                      kind: 'plan',
                      plan,
                      actionLabel: cta.actionLabel,
                    })
                  }
                  className={`w-full min-h-[46px] px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-transform active:scale-[0.98] ${
                    plan.id === 'premium'
                      ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-lg shadow-rose-600/20'
                      : isCurrent
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/15'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{cta.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Billing & Invoice History */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-rose-400" />
          <span>Lịch sử thanh toán & Hóa đơn</span>
        </h3>

        {invoices.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 text-center text-xs text-zinc-400">
            Chưa phát sinh giao dịch thanh toán hoặc hóa đơn YouTube Premium nào.
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const isFailed = inv.status === 'failed';
              const isCancelled = inv.status === 'cancelled';
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => setSelectedInvoice(inv)}
                  className="w-full min-h-[60px] rounded-2xl bg-zinc-900/80 border border-white/10 hover:border-white/25 p-3 text-left flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-bold text-white truncate">{inv.title}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {inv.invoiceCode} · {formatDateVi(inv.createdAt)}
                      {inv.cardLast4 ? ` · Thẻ •••• ${inv.cardLast4}` : ''}
                    </p>
                    {isFailed && inv.failureReason && (
                      <p className="text-[11px] text-rose-400 truncate">{inv.failureReason}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-extrabold tabular-nums ${
                        isFailed ? 'text-rose-400' : isCancelled ? 'text-zinc-400' : 'text-emerald-400'
                      }`}
                    >
                      {inv.amount > 0 ? formatVnd(inv.amount) : '0đ'}
                    </p>
                    <p className="text-[10.5px] text-zinc-400">
                      {isFailed ? 'Thất bại' : isCancelled ? 'Đã hủy' : 'Thành công'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Invoice Receipt Detail Modal */}
      {selectedInvoice && (
        <div
          onClick={() => setSelectedInvoice(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/15 p-4 space-y-3 text-xs text-zinc-200 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">Hóa đơn điện tử YouTube</span>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 flex items-center justify-center"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl bg-zinc-900 p-3 space-y-2 border border-white/10">
              <div className="flex justify-between">
                <span className="text-zinc-400">Mã hóa đơn</span>
                <span className="font-mono font-bold text-white">{selectedInvoice.invoiceCode}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">Nội dung</span>
                <span className="font-semibold text-right text-white">{selectedInvoice.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Số tiền</span>
                <span className="font-bold tabular-nums text-white">{formatVnd(selectedInvoice.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Trạng thái</span>
                <span
                  className={`font-bold ${
                    selectedInvoice.status === 'paid'
                      ? 'text-emerald-400'
                      : selectedInvoice.status === 'failed'
                      ? 'text-rose-400'
                      : 'text-zinc-400'
                  }`}
                >
                  {selectedInvoice.status === 'paid'
                    ? 'Đã thanh toán'
                    : selectedInvoice.status === 'failed'
                    ? 'Thanh toán thất bại'
                    : 'Đã hủy'}
                </span>
              </div>
              {selectedInvoice.cardLast4 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Thẻ thanh toán</span>
                  <span>
                    {selectedInvoice.bankName} •••• {selectedInvoice.cardLast4}
                  </span>
                </div>
              )}
              {selectedInvoice.periodStart && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Chu kỳ hiệu lực</span>
                  <span>
                    {formatDateVi(selectedInvoice.periodStart)} – {formatDateVi(selectedInvoice.periodEnd)}
                  </span>
                </div>
              )}
              {selectedInvoice.failureReason && (
                <div className="pt-1 border-t border-white/10 text-rose-300">
                  Lý do: {selectedInvoice.failureReason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
