import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Package,
  Plus,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { emitTelecomSyncEvent, osApi } from '../../services/api';
import type {
  TelecomCarrier,
  TelecomOverviewPayload,
  TelecomPackage,
  TelecomTransaction,
  TelecomUserSim,
} from '../../types/os';
import { formatVnd } from '../banking/utils';
import {
  CarrierLogo,
  formatDataQuota,
  formatPhoneDisplay,
  PACKAGE_TYPE_OPTIONS,
  parseJsonArray,
} from './CarrierBrand';

interface TelecomPackagesViewProps {
  carriers: TelecomCarrier[];
  packages: TelecomPackage[];
  userSims: TelecomUserSim[];
  initialCarrierId?: string;
  initialSimId?: string;
  selectedPackage: TelecomPackage | null;
  onSelectPackage: (pkg: TelecomPackage | null) => void;
  onOverviewUpdate: (overview: TelecomOverviewPayload, tx?: TelecomTransaction) => void;
  onQuickTopupSim: (simId: string, suggestedAmount?: number) => void;
  onOpenStoreForCarrier: (carrierId: string) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function TelecomPackagesView({
  carriers,
  packages,
  userSims,
  initialCarrierId = 'all',
  initialSimId,
  selectedPackage,
  onSelectPackage,
  onOverviewUpdate,
  onQuickTopupSim,
  onOpenStoreForCarrier,
  onShowToast,
  onRequestConfirm,
}: TelecomPackagesViewProps) {
  const activeSims = useMemo(() => userSims.filter((s) => s.status === 'active'), [userSims]);
  const [targetSimId, setTargetSimId] = useState<string>('');
  const [carrierFilter, setCarrierFilter] = useState<string>(initialCarrierId || 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [buyBusy, setBuyBusy] = useState(false);

  useEffect(() => {
    const preferred =
      (initialSimId && activeSims.find((s) => s.id === initialSimId)) ||
      activeSims.find((s) => Number(s.is_primary) === 1) ||
      activeSims[0];
    setTargetSimId(preferred?.id || '');
  }, [initialSimId, activeSims]);

  useEffect(() => {
    if (initialCarrierId) setCarrierFilter(initialCarrierId);
  }, [initialCarrierId]);

  const targetSim = useMemo(
    () => activeSims.find((s) => s.id === targetSimId) || activeSims[0] || null,
    [activeSims, targetSimId]
  );

  const filteredPackages = useMemo(() => {
    return packages.filter((p) => {
      if (carrierFilter !== 'all' && p.carrier_id !== carrierFilter) return false;
      if (typeFilter !== 'all' && p.package_type !== typeFilter) return false;
      return true;
    });
  }, [packages, carrierFilter, typeFilter]);

  const executeBuyPackage = async (pkg: TelecomPackage, sim: TelecomUserSim, confirmReplace: boolean) => {
    setBuyBusy(true);
    try {
      const idempotencyKey = `atpkg_${sim.id}_${pkg.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const res = await osApi.telecom.buyPackage({
        simId: sim.id,
        packageId: pkg.id,
        confirmReplace,
        idempotencyKey,
      });
      emitTelecomSyncEvent('telecom');
      onShowToast(
        'Đăng ký gói cước thành công',
        `Gói ${pkg.name} đã kích hoạt trên ${formatPhoneDisplay(sim.phone_number)} (trừ ${formatVnd(pkg.price)} từ số dư SIM).`,
        'success'
      );
      onSelectPackage(null);
      onOverviewUpdate(res, res.transaction);
    } catch (err) {
      const e = err as Error & { code?: string; details?: Record<string, unknown> };
      if (e.code === 'ACTIVE_PACKAGE_EXISTS') {
        onRequestConfirm({
          title: 'Xác nhận thay thế gói cước',
          message: e.message,
          destructive: true,
          onConfirm: async () => {
            await executeBuyPackage(pkg, sim, true);
          },
        });
      } else {
        onShowToast('Đăng ký gói thất bại', e.message || 'Không thể đăng ký gói', 'error');
      }
    } finally {
      setBuyBusy(false);
    }
  };

  return (
    <div className="p-3.5 pb-6 space-y-3.5">
      <div>
        <h2 className="text-base font-black tracking-tight flex items-center gap-1.5">
          <Package className="w-4 h-4 text-purple-500" />
          <span>Gói cước viễn thông Anime</span>
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Thanh toán trực tiếp bằng số dư riêng trên từng SIM (không trừ vào ví Hikari Bank)
        </p>
      </div>

      {/* Target SIM Selector */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 space-y-2">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">SIM nhận gói cước</p>
        {activeSims.length === 0 ? (
          <p className="text-xs text-rose-500 font-semibold">Bạn chưa có SIM đang hoạt động.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeSims.map((s) => {
              const c = carriers.find((x) => x.id === s.carrier_id);
              const active = s.id === targetSim?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setTargetSimId(s.id);
                    setCarrierFilter(s.carrier_id);
                  }}
                  className={`min-w-[185px] min-h-[54px] rounded-xl border p-2.5 flex items-center gap-2 text-left shrink-0 ${
                    active
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20'
                  }`}
                >
                  <CarrierLogo variant={c?.logo_variant || s.carrier_id} size={28} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black tabular-nums truncate">
                      {formatPhoneDisplay(s.phone_number)}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                      {Number(s.is_primary) === 1 ? 'SIM CHÍNH' : 'SIM PHỤ'} · {formatVnd(s.sim_balance)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCarrierFilter('all')}
            className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold shrink-0 border ${
              carrierFilter === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            Tất cả nhà mạng
          </button>
          {carriers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCarrierFilter(c.id)}
              className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold shrink-0 border flex items-center gap-1.5 ${
                carrierFilter === c.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <CarrierLogo variant={c.logo_variant} size={18} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {PACKAGE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTypeFilter(opt.id)}
              className={`min-h-[34px] px-3 rounded-xl text-[11px] font-bold shrink-0 border ${
                typeFilter === opt.id
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Package Cards */}
      <div className="space-y-2.5">
        {filteredPackages.map((pkg) => {
          const carrier = carriers.find((c) => c.id === pkg.carrier_id);
          const benefits = parseJsonArray<string>(pkg.benefits_json);
          return (
            <div
              key={pkg.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3.5 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CarrierLogo variant={carrier?.logo_variant || pkg.carrier_id} size={36} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-black truncate">
                      {pkg.name}
                      {pkg.badge_text ? (
                        <span className="ml-1.5 text-[10px] font-bold text-purple-500">· {pkg.badge_text}</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {carrier?.name} · Chu kỳ {pkg.validity_days} ngày
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-indigo-500 tabular-nums">{formatVnd(pkg.price)}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">{pkg.package_type}</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                {benefits.slice(0, 3).map((b, i) => (
                  <p key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{b}</span>
                  </p>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {pkg.data_mb > 0 ? `Data ${formatDataQuota(pkg.data_mb)}` : ''}
                  {pkg.data_mb > 0 && pkg.voice_minutes > 0 ? ' · ' : ''}
                  {pkg.voice_minutes > 0 ? `${pkg.voice_minutes} phút` : ''}
                  {pkg.sms_count > 0 ? ` · ${pkg.sms_count} SMS` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectPackage(pkg)}
                  className="min-h-[40px] px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold"
                >
                  Đăng ký
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Package Detail & Purchase Modal */}
      {selectedPackage && (
        <div
          onClick={() => onSelectPackage(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
          >
            {(() => {
              const carrier = carriers.find((c) => c.id === selectedPackage.carrier_id);
              const benefits = parseJsonArray<string>(selectedPackage.benefits_json);
              const matchingSims = activeSims.filter((s) => s.carrier_id === selectedPackage.carrier_id);
              const effectiveSim =
                targetSim && targetSim.carrier_id === selectedPackage.carrier_id
                  ? targetSim
                  : matchingSims[0] || null;
              const simBalance = Number(effectiveSim?.sim_balance || 0);
              const shortfall = Math.max(0, selectedPackage.price - simBalance);

              return (
                <>
                  <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CarrierLogo variant={carrier?.logo_variant || selectedPackage.carrier_id} size={40} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-purple-500">{carrier?.name}</p>
                        <h3 className="text-base font-black truncate">{selectedPackage.name}</h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectPackage(null)}
                      className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5 text-xs">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Giá gói cước</span>
                        <span className="text-lg font-black text-indigo-500 tabular-nums">
                          {formatVnd(selectedPackage.price)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Hạn sử dụng</span>
                        <span className="font-bold">{selectedPackage.validity_days} ngày</span>
                      </div>
                      {selectedPackage.data_mb > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Lưu lượng Data</span>
                          <span className="font-bold">{formatDataQuota(selectedPackage.data_mb)}</span>
                        </div>
                      )}
                      {selectedPackage.voice_minutes > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Phút thoại</span>
                          <span className="font-bold">{selectedPackage.voice_minutes} phút</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="font-bold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                        <span>Quyền lợi gói</span>
                      </p>
                      {benefits.map((b, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{b}</span>
                        </p>
                      ))}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">{selectedPackage.terms_text}</p>
                    </div>

                    {!effectiveSim ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5 text-amber-600 dark:text-amber-300">
                        <p className="font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Bạn chưa sở hữu SIM nào của {carrier?.name}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const cid = selectedPackage.carrier_id;
                            onSelectPackage(null);
                            onOpenStoreForCarrier(cid);
                          }}
                          className="w-full min-h-[42px] rounded-xl bg-amber-500 text-white text-xs font-extrabold"
                        >
                          Mua SIM {carrier?.name} ngay
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 space-y-1.5">
                          <p className="font-bold text-slate-500 dark:text-slate-400">SIM áp dụng & Thanh toán từ số dư SIM</p>
                          <div className="flex items-center justify-between">
                            <span className="font-black tabular-nums">{formatPhoneDisplay(effectiveSim.phone_number)}</span>
                            <span className="font-extrabold tabular-nums text-emerald-500">
                              Số dư: {formatVnd(effectiveSim.sim_balance)}
                            </span>
                          </div>
                          {matchingSims.length > 1 && (
                            <select
                              value={effectiveSim.id}
                              onChange={(e) => setTargetSimId(e.target.value)}
                              className="w-full min-h-[38px] mt-1 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E1E2B] text-xs font-bold outline-none"
                            >
                              {matchingSims.map((ms) => (
                                <option key={ms.id} value={ms.id}>
                                  {formatPhoneDisplay(ms.phone_number)} · {formatVnd(ms.sim_balance)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {shortfall > 0 && (
                          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2.5 text-rose-500">
                            <p className="font-bold flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>
                                Số dư SIM còn thiếu {formatVnd(shortfall)} để đăng ký gói {selectedPackage.name}.
                              </span>
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const simId = effectiveSim.id;
                                onSelectPackage(null);
                                onQuickTopupSim(simId, shortfall);
                              }}
                              className="w-full min-h-[42px] rounded-xl bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Nạp tiền vào SIM ngay (qua Hikari Bank)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {effectiveSim && shortfall === 0 && (
                    <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        disabled={buyBusy}
                        onClick={() => void executeBuyPackage(selectedPackage, effectiveSim, false)}
                        className="w-full min-h-[48px] rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-45 text-white text-sm font-black flex items-center justify-center gap-1.5"
                      >
                        <Wifi className="w-4 h-4" />
                        <span>
                          {buyBusy
                            ? 'Đang kích hoạt gói...'
                            : `Trừ ${formatVnd(selectedPackage.price)} từ số dư SIM`}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
