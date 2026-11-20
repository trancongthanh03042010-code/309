import React, { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  Edit3,
  History,
  Lock,
  Plus,
  Smartphone,
  Trash2,
  Unlock,
  Wifi,
  X,
} from 'lucide-react';
import { emitTelecomSyncEvent, osApi } from '../../services/api';
import type { TelecomCarrier, TelecomOverviewPayload, TelecomUserSim } from '../../types/os';
import { formatShortDate, formatVnd } from '../banking/utils';
import { CarrierLogo, formatDataQuota, formatPhoneDisplay, parseCarrierTheme } from './CarrierBrand';

interface TelecomMySimsViewProps {
  carriers: TelecomCarrier[];
  userSims: TelecomUserSim[];
  selectedSim: TelecomUserSim | null;
  onSelectSim: (sim: TelecomUserSim | null) => void;
  onOverviewUpdate: (overview: TelecomOverviewPayload) => void;
  onOpenTopup: (simId: string) => void;
  onOpenBuyPackages: (simId: string, carrierId: string) => void;
  onOpenSimHistory: (simId: string) => void;
  onOpenStore: () => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function TelecomMySimsView({
  carriers,
  userSims,
  selectedSim,
  onSelectSim,
  onOverviewUpdate,
  onOpenTopup,
  onOpenBuyPackages,
  onOpenSimHistory,
  onOpenStore,
  onShowToast,
  onRequestConfirm,
}: TelecomMySimsViewProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState('');

  useEffect(() => {
    if (selectedSim) {
      setAliasDraft(selectedSim.alias_name || '');
      setEditingAlias(false);
    }
  }, [selectedSim]);

  const activeList = userSims.filter((s) => s.status !== 'cancelled');
  const cancelledList = userSims.filter((s) => s.status === 'cancelled');

  const handleSetPrimary = async (sim: TelecomUserSim) => {
    if (busyId) return;
    setBusyId(sim.id);
    try {
      const res = await osApi.telecom.setPrimarySim(sim.id);
      emitTelecomSyncEvent('telecom');
      onOverviewUpdate(res);
      const updated = res.userSims.find((s) => s.id === sim.id) || null;
      if (selectedSim?.id === sim.id) onSelectSim(updated);
      onShowToast('Đã đổi SIM chính', `${formatPhoneDisplay(sim.phone_number)} hiện là SIM CHÍNH mặc định.`, 'success');
    } catch (err) {
      onShowToast('Không thể đặt SIM chính', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAlias = async () => {
    if (!selectedSim || !aliasDraft.trim() || busyId) return;
    setBusyId(selectedSim.id);
    try {
      const res = await osApi.telecom.updateSim(selectedSim.id, { aliasName: aliasDraft.trim() });
      emitTelecomSyncEvent('telecom');
      onOverviewUpdate(res);
      const updated = res.userSims.find((s) => s.id === selectedSim.id) || null;
      onSelectSim(updated);
      setEditingAlias(false);
      onShowToast('Đã đổi tên SIM', `Tên gợi nhớ mới: ${aliasDraft.trim()}`, 'success');
    } catch (err) {
      onShowToast('Lỗi đổi tên', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleLock = (sim: TelecomUserSim) => {
    const nextStatus = sim.status === 'locked' ? 'active' : 'locked';
    onRequestConfirm({
      title: nextStatus === 'locked' ? 'Tạm khóa SIM?' : 'Mở khóa SIM?',
      message:
        nextStatus === 'locked'
          ? `SIM ${formatPhoneDisplay(sim.phone_number)} sẽ không thể nạp tiền hoặc đăng ký gói mới khi đang khóa.`
          : `Kích hoạt lại hoạt động bình thường cho SIM ${formatPhoneDisplay(sim.phone_number)}.`,
      destructive: nextStatus === 'locked',
      onConfirm: async () => {
        const res = await osApi.telecom.updateSim(sim.id, { status: nextStatus });
        emitTelecomSyncEvent('telecom');
        onOverviewUpdate(res);
        const updated = res.userSims.find((s) => s.id === sim.id) || null;
        if (selectedSim?.id === sim.id) onSelectSim(updated);
        onShowToast(
          nextStatus === 'locked' ? 'Đã tạm khóa SIM' : 'Đã mở khóa SIM',
          formatPhoneDisplay(sim.phone_number),
          'info'
        );
      },
    });
  };

  const handleCancelSim = (sim: TelecomUserSim) => {
    onRequestConfirm({
      title: 'Hủy SIM vĩnh viễn?',
      message: `Hủy vĩnh viễn số ${formatPhoneDisplay(sim.phone_number)}. Số dư SIM còn lại (${formatVnd(sim.sim_balance)}) sẽ ngừng giao dịch và không thể khôi phục.`,
      destructive: true,
      onConfirm: async () => {
        const res = await osApi.telecom.updateSim(sim.id, { status: 'cancelled' });
        emitTelecomSyncEvent('telecom');
        onOverviewUpdate(res);
        onSelectSim(null);
        onShowToast('Đã hủy SIM', formatPhoneDisplay(sim.phone_number), 'info');
      },
    });
  };

  return (
    <div className="p-3.5 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-indigo-500" />
            <span>Quản lý nhiều SIM ({activeList.length})</span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Mỗi SIM có số dư & gói cước độc lập · Chọn 1 SIM làm SIM chính
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenStore}
          className="min-h-[40px] px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Mua thêm SIM</span>
        </button>
      </div>

      <div className="space-y-3">
        {activeList.map((sim) => {
          const carrier = carriers.find((c) => c.id === sim.carrier_id);
          const theme = parseCarrierTheme(carrier?.theme_json);
          const isPrimary = Number(sim.is_primary) === 1;
          const activePkgs = sim.active_packages || [];

          return (
            <div
              key={sim.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] overflow-hidden shadow-sm"
            >
              {/* Card Header */}
              <div
                onClick={() => onSelectSim(sim)}
                className={`p-4 cursor-pointer ${
                  isPrimary ? `bg-gradient-to-br ${theme.gradient} text-white` : 'border-b border-slate-100 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CarrierLogo variant={carrier?.logo_variant || sim.carrier_id} size={40} className="shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-[11px] font-bold flex items-center gap-1 ${isPrimary ? 'text-amber-200' : 'text-indigo-500'}`}>
                        {isPrimary && <Crown className="w-3.5 h-3.5" />}
                        <span>{isPrimary ? 'SIM CHÍNH' : 'SIM PHỤ'}</span>
                        <span className={isPrimary ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}>
                          · {carrier?.name || sim.carrier_id}
                        </span>
                      </p>
                      <p className="text-lg font-black tabular-nums tracking-tight">
                        {formatPhoneDisplay(sim.phone_number)}
                      </p>
                      <p className={`text-[11px] truncate ${isPrimary ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                        {sim.alias_name} · {sim.sim_type} · {sim.status === 'locked' ? 'Đang tạm khóa' : 'Đang hoạt động'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[10px] ${isPrimary ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>
                      Số dư SIM
                    </p>
                    <p className="text-sm font-black tabular-nums">{formatVnd(sim.sim_balance)}</p>
                  </div>
                </div>
              </div>

              {/* Active Packages Summary */}
              <div className="p-3.5 space-y-3">
                {activePkgs.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-2.5 space-y-1 text-xs">
                    {activePkgs.map((up) => (
                      <div key={up.id} className="flex items-center justify-between gap-2">
                        <span className="font-bold text-indigo-500 truncate">{up.package_name}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          {up.data_remaining_mb > 0 ? `${formatDataQuota(up.data_remaining_mb)} · ` : ''}
                          HSD {formatShortDate(up.expires_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Chưa kích hoạt gói cước nào trên SIM này.</p>
                )}

                {/* Quick Controls */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={sim.status !== 'active'}
                    onClick={() => onOpenTopup(sim.id)}
                    className="min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nạp tiền</span>
                  </button>
                  <button
                    type="button"
                    disabled={sim.status !== 'active'}
                    onClick={() => onOpenBuyPackages(sim.id, sim.carrier_id)}
                    className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Wifi className="w-3.5 h-3.5 text-purple-500" />
                    <span>Mua gói</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectSim(sim)}
                    className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    Chi tiết
                  </button>
                </div>

                {!isPrimary && sim.status === 'active' && (
                  <button
                    type="button"
                    disabled={busyId === sim.id}
                    onClick={() => void handleSetPrimary(sim)}
                    className="w-full min-h-[40px] rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-500 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>{busyId === sim.id ? 'Đang cập nhật...' : 'Đặt làm SIM chính'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {cancelledList.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">SIM đã hủy ({cancelledList.length})</p>
          {cancelledList.map((sim) => (
            <div
              key={sim.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-white/[0.02] p-3 flex items-center justify-between opacity-65 text-xs"
            >
              <span className="font-bold tabular-nums">{formatPhoneDisplay(sim.phone_number)}</span>
              <span className="text-rose-500 font-semibold">Đã hủy</span>
            </div>
          ))}
        </div>
      )}

      {/* Detailed SIM Management Modal */}
      {selectedSim && (
        <div
          onClick={() => onSelectSim(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
          >
            {(() => {
              const carrier = carriers.find((c) => c.id === selectedSim.carrier_id);
              const theme = parseCarrierTheme(carrier?.theme_json);
              const isPrimary = Number(selectedSim.is_primary) === 1;
              return (
                <>
                  <div className={`bg-gradient-to-br ${theme.gradient} text-white p-5 shrink-0`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <CarrierLogo variant={carrier?.logo_variant || selectedSim.carrier_id} size={44} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-amber-200">
                            {isPrimary ? 'SIM CHÍNH' : 'SIM PHỤ'} · {carrier?.name}
                          </p>
                          <h3 className="text-xl font-black tabular-nums">
                            {formatPhoneDisplay(selectedSim.phone_number)}
                          </h3>
                          <p className="text-xs text-white/80">
                            {selectedSim.sim_type} · {selectedSim.status === 'active' ? 'Hoạt động' : selectedSim.status === 'locked' ? 'Đang khóa' : 'Đã hủy'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectSim(null)}
                        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
                    {/* Alias Rename */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500 dark:text-slate-400">Tên gợi nhớ</span>
                        {!editingAlias && (
                          <button
                            type="button"
                            onClick={() => setEditingAlias(true)}
                            className="text-indigo-500 font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Đổi tên</span>
                          </button>
                        )}
                      </div>
                      {editingAlias ? (
                        <div className="flex gap-2">
                          <input
                            value={aliasDraft}
                            onChange={(e) => setAliasDraft(e.target.value)}
                            maxLength={40}
                            className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-black/20 text-xs font-bold outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveAlias()}
                            className="min-h-[40px] px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            <span>Lưu</span>
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm font-extrabold">{selectedSim.alias_name}</p>
                      )}
                    </div>

                    {/* Financials */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Số dư SIM độc lập</span>
                        <span className="font-black text-emerald-500 tabular-nums text-sm">
                          {formatVnd(selectedSim.sim_balance)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Tổng tiền đã nạp</span>
                        <span className="font-bold tabular-nums">{formatVnd(selectedSim.total_topped_up)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Tổng chi tiêu gói cước</span>
                        <span className="font-bold tabular-nums">{formatVnd(selectedSim.total_spent)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Giá mua SIM</span>
                        <span className="font-bold tabular-nums">{formatVnd(selectedSim.purchase_price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Ngày kích hoạt</span>
                        <span className="font-mono">{formatShortDate(selectedSim.activated_at)}</span>
                      </div>
                    </div>

                    {/* Active Packages with Remaining Quota */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Dịch vụ & Gói cước đang hoạt động</p>
                      {(selectedSim.active_packages || []).length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 text-xs text-slate-500 dark:text-slate-400">
                          Chưa có gói cước đang chạy. Hãy nhấn “Mua gói” để dùng số dư SIM đăng ký.
                        </div>
                      ) : (
                        (selectedSim.active_packages || []).map((up) => {
                          const dataPct = up.data_total_mb > 0 ? Math.round((up.data_remaining_mb / up.data_total_mb) * 100) : 0;
                          const voicePct =
                            up.voice_total_min > 0 ? Math.round((up.voice_remaining_min / up.voice_total_min) * 100) : 0;
                          return (
                            <div
                              key={up.id}
                              className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-3.5 space-y-2 text-xs"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-black text-indigo-500">{up.package_name}</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  HSD {formatShortDate(up.expires_at)}
                                </span>
                              </div>
                              {up.data_total_mb > 0 && (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span>Data còn lại</span>
                                    <span className="font-bold tabular-nums">
                                      {formatDataQuota(up.data_remaining_mb)} / {formatDataQuota(up.data_total_mb)}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: `${dataPct}%` }} />
                                  </div>
                                </div>
                              )}
                              {up.voice_total_min > 0 && (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span>Phút thoại còn lại</span>
                                    <span className="font-bold tabular-nums">
                                      {up.voice_remaining_min} / {up.voice_total_min} phút
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${voicePct}%` }} />
                                  </div>
                                </div>
                              )}
                              {up.sms_total > 0 && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  SMS còn lại: <strong>{up.sms_remaining}</strong> / {up.sms_total} tin
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Action Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={selectedSim.status !== 'active'}
                        onClick={() => {
                          const id = selectedSim.id;
                          onSelectSim(null);
                          onOpenTopup(id);
                        }}
                        className="min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nạp tiền SIM</span>
                      </button>

                      <button
                        type="button"
                        disabled={selectedSim.status !== 'active'}
                        onClick={() => {
                          const id = selectedSim.id;
                          const cid = selectedSim.carrier_id;
                          onSelectSim(null);
                          onOpenBuyPackages(id, cid);
                        }}
                        className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <Wifi className="w-4 h-4 text-purple-500" />
                        <span>Mua gói cước</span>
                      </button>

                      {!isPrimary && selectedSim.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => void handleSetPrimary(selectedSim)}
                          className="min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Crown className="w-4 h-4" />
                          <span>Đặt SIM chính</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const id = selectedSim.id;
                          onSelectSim(null);
                          onOpenSimHistory(id);
                        }}
                        className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <History className="w-4 h-4" />
                        <span>Lịch sử SIM</span>
                      </button>

                      {selectedSim.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleToggleLock(selectedSim)}
                          className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          {selectedSim.status === 'locked' ? (
                            <>
                              <Unlock className="w-4 h-4 text-emerald-500" />
                              <span>Mở khóa SIM</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4 text-amber-500" />
                              <span>Tạm khóa SIM</span>
                            </>
                          )}
                        </button>
                      )}

                      {selectedSim.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleCancelSim(selectedSim)}
                          className="min-h-[44px] rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Hủy SIM</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
