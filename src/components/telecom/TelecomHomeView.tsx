import React from 'react';
import {
  ArrowRight,
  Bell,
  ChevronRight,
  Crown,
  Package,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
} from 'lucide-react';
import type {
  TelecomCarrier,
  TelecomCatalogSim,
  TelecomPackage,
  TelecomTransaction,
  TelecomUserSim,
} from '../../types/os';
import { formatTimeAgoOrDate, formatVnd } from '../banking/utils';
import {
  AnimeTelecomEmblem,
  CarrierLogo,
  formatDataQuota,
  formatPhoneDisplay,
  parseCarrierTheme,
} from './CarrierBrand';

interface TelecomHomeViewProps {
  userName: string;
  userAvatar: string;
  primarySim: TelecomUserSim | null;
  userSims: TelecomUserSim[];
  carriers: TelecomCarrier[];
  catalog: TelecomCatalogSim[];
  packages: TelecomPackage[];
  transactions: TelecomTransaction[];
  unreadNotifCount: number;
  onOpenNotifications: () => void;
  onOpenProfileSettings: () => void;
  onOpenTopup: (simId?: string) => void;
  onNavigateTab: (tab: 'home' | 'store' | 'mysims' | 'packages', opts?: { carrierId?: string; simId?: string }) => void;
  onOpenCarrierModal: (carrier: TelecomCarrier) => void;
  onSelectSimDetail: (sim: TelecomUserSim) => void;
  onSelectCatalogSim: (sim: TelecomCatalogSim) => void;
  onSelectPackage: (pkg: TelecomPackage) => void;
  onOpenHistory: (simId?: string) => void;
  onOpenBill: (tx: TelecomTransaction) => void;
}

export function TelecomHomeView({
  userName,
  userAvatar,
  primarySim,
  userSims,
  carriers,
  catalog,
  packages,
  transactions,
  unreadNotifCount,
  onOpenNotifications,
  onOpenProfileSettings,
  onOpenTopup,
  onNavigateTab,
  onOpenCarrierModal,
  onSelectSimDetail,
  onSelectCatalogSim,
  onSelectPackage,
  onOpenHistory,
  onOpenBill,
}: TelecomHomeViewProps) {
  const primaryCarrier = carriers.find((c) => c.id === primarySim?.carrier_id) || carriers[0] || null;
  const primaryTheme = parseCarrierTheme(primaryCarrier?.theme_json);
  const availableStoreSims = catalog.filter((s) => s.status === 'available').slice(0, 6);
  const featuredPackages = packages.filter((p) => Number(p.is_featured) === 1).slice(0, 4);
  const activeSims = userSims.filter((s) => s.status !== 'cancelled');

  return (
    <div className="p-3.5 pb-6 space-y-4">
      {/* Top App Header */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <AnimeTelecomEmblem size={38} />
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-tight truncate">ANIME TELECOM</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Viễn thông Anime · Đồng bộ Hikari Bank
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="Thông báo Telecom"
            className="relative w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] flex items-center justify-center hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfileSettings}
            aria-label="Hồ sơ và cài đặt"
            className="h-11 pl-1.5 pr-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-7 h-7 rounded-xl object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </header>

      {/* Primary SIM Hero Card */}
      {primarySim ? (
        <section
          className={`rounded-3xl bg-gradient-to-br ${primaryTheme.gradient} text-white p-4 shadow-xl border border-white/10 space-y-3.5`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CarrierLogo variant={primaryCarrier?.logo_variant || primarySim.carrier_id} size={42} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-amber-200 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" />
                  <span>SIM CHÍNH · {primaryCarrier?.name || primarySim.carrier_name}</span>
                </p>
                <p className="text-xl font-black tracking-tight tabular-nums mt-0.5">
                  {formatPhoneDisplay(primarySim.phone_number)}
                </p>
                <p className="text-[11px] text-white/80 truncate">
                  {primarySim.alias_name} · {primarySim.sim_type}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectSimDetail(primarySim)}
              className="min-h-[38px] px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-bold shrink-0"
            >
              Chi tiết
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 bg-black/25 rounded-2xl p-3 border border-white/10">
            <div>
              <p className="text-[10px] text-white/70 uppercase tracking-wide font-semibold">Số dư SIM chính</p>
              <p className="text-base font-black tabular-nums mt-0.5">{formatVnd(primarySim.sim_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/70 uppercase tracking-wide font-semibold">Gói đang dùng</p>
              {primarySim.primary_package ? (
                <p className="text-xs font-extrabold mt-0.5 truncate">
                  {primarySim.primary_package.package_name}
                  <span className="block text-[10px] font-medium text-emerald-200 tabular-nums">
                    {primarySim.primary_package.data_remaining_mb > 0
                      ? `Còn ${formatDataQuota(primarySim.primary_package.data_remaining_mb)}`
                      : `Còn ${primarySim.primary_package.voice_remaining_min} phút`}
                  </span>
                </p>
              ) : (
                <p className="text-xs font-semibold text-white/75 mt-0.5">Chưa đăng ký gói</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenTopup(primarySim.id)}
              className="min-h-[44px] rounded-2xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-black flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nạp tiền SIM</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('mysims')}
              className="min-h-[44px] rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Smartphone className="w-4 h-4" />
              <span>Quản lý ({activeSims.length} SIM)</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl bg-gradient-to-br from-indigo-900 to-purple-900 text-white p-5 space-y-3">
          <p className="text-sm font-black">Chưa có SIM chính đang hoạt động</p>
          <p className="text-xs text-white/80">Khám phá kho SIM số đẹp của 5 nhà mạng anime để kích hoạt ngay.</p>
          <button
            type="button"
            onClick={() => onNavigateTab('store')}
            className="min-h-[44px] px-4 rounded-2xl bg-white text-slate-900 text-xs font-black"
          >
            Chọn mua SIM mới
          </button>
        </section>
      )}

      {/* Quick Actions */}
      <section className="grid grid-cols-4 gap-2">
        {[
          { label: 'Mua SIM', icon: Smartphone, color: 'text-indigo-500 bg-indigo-500/10', onClick: () => onNavigateTab('store') },
          { label: 'Nạp tiền', icon: Plus, color: 'text-emerald-500 bg-emerald-500/10', onClick: () => onOpenTopup(primarySim?.id) },
          { label: 'Gói cước', icon: Wifi, color: 'text-purple-500 bg-purple-500/10', onClick: () => onNavigateTab('packages') },
          { label: 'Lịch sử', icon: Receipt, color: 'text-amber-500 bg-amber-500/10', onClick: () => onOpenHistory() },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="min-h-[68px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-2 flex flex-col items-center justify-center gap-1.5 hover:border-indigo-500/50"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold">{item.label}</span>
            </button>
          );
        })}
      </section>

      {/* My SIMs List Preview */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            SIM của tôi ({activeSims.length})
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('mysims')}
            className="text-xs font-bold text-indigo-500 flex items-center gap-0.5 min-h-[36px]"
          >
            <span>Tất cả</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {activeSims.slice(0, 3).map((sim) => {
            const carrier = carriers.find((c) => c.id === sim.carrier_id);
            const isPrim = Number(sim.is_primary) === 1;
            return (
              <button
                key={sim.id}
                type="button"
                onClick={() => onSelectSimDetail(sim)}
                className="w-full min-h-[64px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 flex items-center justify-between gap-2.5 text-left hover:border-indigo-500/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CarrierLogo variant={carrier?.logo_variant || sim.carrier_id} size={38} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-black tabular-nums truncate">
                      {formatPhoneDisplay(sim.phone_number)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      <span className={isPrim ? 'text-indigo-500 font-bold' : 'font-semibold'}>
                        {isPrim ? 'SIM CHÍNH' : 'SIM PHỤ'}
                      </span>
                      {' · '}
                      {carrier?.name || sim.carrier_id}
                      {' · '}
                      {sim.status === 'locked' ? 'Đang khóa' : 'Hoạt động'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-extrabold tabular-nums">{formatVnd(sim.sim_balance)}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Số dư SIM</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5 Anime Carriers */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Hệ sinh thái 5 Nhà mạng Anime
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Chạm để xem chi tiết</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {carriers.map((c) => {
            const theme = parseCarrierTheme(c.theme_json);
            const count = catalog.filter((s) => s.carrier_id === c.id && s.status === 'available').length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenCarrierModal(c)}
                className={`min-w-[148px] rounded-2xl bg-gradient-to-br ${theme.gradient} text-white p-3 text-left shrink-0 shadow-md border border-white/10 space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <CarrierLogo variant={c.logo_variant} size={32} />
                  <span className="text-[10px] font-bold text-white/80">{c.code}</span>
                </div>
                <div>
                  <p className="text-xs font-black truncate">{c.name}</p>
                  <p className="text-[10px] text-white/80 truncate">{c.jp_name}</p>
                  <p className="text-[10px] text-amber-200 font-semibold mt-1 tabular-nums">{count} SIM sẵn sàng</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Vanity SIMs */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>SIM Số Đẹp · VIP · Limited</span>
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('store')}
            className="text-xs font-bold text-indigo-500 flex items-center gap-0.5 min-h-[36px]"
          >
            <span>Kho SIM</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {availableStoreSims.map((sim) => {
            const carrier = carriers.find((c) => c.id === sim.carrier_id);
            return (
              <button
                key={sim.id}
                type="button"
                onClick={() => onSelectCatalogSim(sim)}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 text-left space-y-2 hover:border-indigo-500/50"
              >
                <div className="flex items-center justify-between gap-1">
                  <CarrierLogo variant={carrier?.logo_variant || sim.carrier_id} size={26} />
                  <span className="text-[10px] font-bold text-indigo-500">{sim.tier_label}</span>
                </div>
                <div>
                  <p className="text-sm font-black tabular-nums tracking-tight">
                    {formatPhoneDisplay(sim.phone_number)}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {carrier?.name} · {sim.sim_type}
                  </p>
                </div>
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-black text-rose-500 tabular-nums">{formatVnd(sim.price)}</span>
                  <span className="text-[10px] font-semibold text-emerald-500">+{formatVnd(sim.initial_balance)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Packages */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-purple-500" />
            <span>Gói cước nổi bật</span>
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('packages')}
            className="text-xs font-bold text-indigo-500 flex items-center gap-0.5 min-h-[36px]"
          >
            <span>Tất cả gói</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {featuredPackages.map((pkg) => {
            const carrier = carriers.find((c) => c.id === pkg.carrier_id);
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => onSelectPackage(pkg)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 flex items-center justify-between gap-2.5 text-left hover:border-purple-500/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CarrierLogo variant={carrier?.logo_variant || pkg.carrier_id} size={34} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold truncate">
                      {pkg.name}
                      {pkg.badge_text ? (
                        <span className="text-[10px] font-bold text-purple-500 ml-1.5">· {pkg.badge_text}</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {carrier?.name} · {pkg.validity_days} ngày
                      {pkg.data_mb > 0 ? ` · ${formatDataQuota(pkg.data_mb)}` : ''}
                      {pkg.voice_minutes > 0 ? ` · ${pkg.voice_minutes}p thoại` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-indigo-500 tabular-nums shrink-0">{formatVnd(pkg.price)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Telecom Transactions */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Giao dịch gần đây
          </h2>
          <button
            type="button"
            onClick={() => onOpenHistory()}
            className="text-xs font-bold text-indigo-500 flex items-center gap-0.5 min-h-[36px]"
          >
            <span>Xem tất cả</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {transactions.slice(0, 4).map((tx) => {
            const carrier = carriers.find((c) => c.id === tx.carrier_id);
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onOpenBill(tx)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 flex items-center justify-between gap-2.5 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CarrierLogo variant={carrier?.logo_variant || tx.carrier_id} size={32} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{tx.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                      {formatPhoneDisplay(tx.phone_number)} · {formatTimeAgoOrDate(tx.created_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black tabular-nums text-slate-900 dark:text-slate-100">
                    {formatVnd(tx.total_amount)}
                  </p>
                  <p className="text-[10px] font-semibold text-emerald-500">{tx.ref_code}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <span>
          Mọi giao dịch mua SIM & nạp tiền được đồng bộ hai chiều tức thì với sổ cái Hikari Banking. Mỗi SIM duy trì số dư độc lập.
        </span>
      </div>
    </div>
  );
}
