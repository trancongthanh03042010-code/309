import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileImage,
  Headphones,
  Landmark,
  Layers,
  PiggyBank,
  QrCode,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type {
  BankingAccountDemo,
  BankingCardItem,
  BankingComputedStats,
  BankingTransactionDemo,
} from '../../types/os';
import { HikariLogo, type HikariThemePalette } from './HikariBrand';
import { BankBrandEmblem } from './cards/BankCardVisual';
import {
  formatTimeAgoOrDate,
  formatVnd,
  formatVndCompact,
  getTimeGreeting,
  HIKARI_AVATAR_TELLER,
  HIKARI_BANNER_SKYLINE,
} from './utils';

export type HomeNavTarget =
  | 'transfer'
  | 'receive'
  | 'qr'
  | 'bills'
  | 'topup'
  | 'savings'
  | 'cards'
  | 'card_benefits'
  | 'history'
  | 'accounts'
  | 'loans'
  | 'investments'
  | 'expenses'
  | 'archive'
  | 'notifications'
  | 'settings'
  | 'support';

interface BankingHomeViewProps {
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  aiAccounts: BankingAccountDemo[];
  primaryCard?: BankingCardItem | null;
  transactions: BankingTransactionDemo[];
  computedStats: BankingComputedStats;
  unreadNotifCount: number;
  hideBalance: boolean;
  customerCode?: string;
  dashboardWallpaper?: string;
  bannerDismissed?: boolean;
  theme: HikariThemePalette;
  onToggleHideBalance: () => void;
  onDismissBanner: () => void;
  onOpenAssistant: () => void;
  onSelectAccount: (accId: string) => void;
  onQuickCharTransfer?: (ai: BankingAccountDemo) => void;
  onQuickCharRequest?: (ai: BankingAccountDemo) => void;
  onNavigate: (target: HomeNavTarget) => void;
  onOpenBill: (tx: BankingTransactionDemo) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function BankingHomeView({
  account,
  accounts,
  aiAccounts,
  primaryCard,
  transactions,
  computedStats,
  unreadNotifCount,
  hideBalance,
  customerCode = 'HK-CID-202601',
  dashboardWallpaper = 'skyline',
  bannerDismissed = false,
  theme,
  onToggleHideBalance,
  onDismissBanner,
  onOpenAssistant,
  onSelectAccount,
  onNavigate,
  onOpenBill,
  onShowToast,
}: BankingHomeViewProps) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400_000);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [chartTab, setChartTab] = useState<'cashflow' | 'categories' | 'mom'>('cashflow');
  const [showAccountDetail, setShowAccountDetail] = useState(false);

  const visibleAccounts = accounts.filter((a) => !a.is_hidden);
  const activeAcc = account || visibleAccounts[0] || accounts[0] || null;

  const avatarByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of aiAccounts) {
      if (a.holder_name && a.avatar) map.set(a.holder_name.toLowerCase(), a.avatar);
    }
    return map;
  }, [aiAccounts]);

  const userAccountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);

  const filteredAnalytics = useMemo(() => {
    const now = Date.now();
    const minMs =
      period === 'week'
        ? now - 7 * 86400_000
        : period === 'month'
        ? now - 30 * 86400_000
        : period === 'year'
        ? now - 365 * 86400_000
        : new Date(customStart).getTime();
    const maxMs = period === 'custom' ? new Date(`${customEnd}T23:59:59`).getTime() : now + 86400_000;

    let income = 0;
    let expense = 0;
    const catTotals: Record<string, number> = {};
    const monthTotals: Record<string, { income: number; expense: number }> = {};

    for (const tx of transactions) {
      if (!userAccountIds.has(tx.account_id)) continue;
      if (tx.bill_template === 'failed' || String(tx.status).includes('Thất bại') || String(tx.status).includes('Đang xử lý')) continue;
      const t = new Date(tx.created_at).getTime();
      const monthKey = tx.created_at.slice(0, 7);
      if (!monthTotals[monthKey]) monthTotals[monthKey] = { income: 0, expense: 0 };
      if (tx.tx_type === 'income') monthTotals[monthKey].income += tx.amount;
      else monthTotals[monthKey].expense += tx.amount;

      if (t >= minMs && t <= maxMs) {
        if (tx.tx_type === 'income') income += tx.amount;
        else {
          expense += tx.amount;
          const cat = tx.category || 'Khác';
          catTotals[cat] = (catTotals[cat] || 0) + tx.amount;
        }
      }
    }

    const topCats = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const months = Object.entries(monthTotals)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-4);

    return { income, expense, net: income - expense, topCats, months };
  }, [transactions, userAccountIds, period, customStart, customEnd]);

  const recentUserTxs = useMemo(
    () => transactions.filter((tx) => userAccountIds.has(tx.account_id)).slice(0, 6),
    [transactions, userAccountIds]
  );

  const primaryQuickActions: Array<{
    id: HomeNavTarget;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = [
    { id: 'transfer', label: 'Chuyển tiền', icon: Send, tone: 'bg-[#E14B5A] text-white' },
    { id: 'receive', label: 'Nhận tiền', icon: ArrowDownLeft, tone: 'bg-emerald-600 text-white' },
    { id: 'cards', label: 'Thẻ Hikari', icon: CreditCard, tone: 'bg-[#DB5A82] text-white' },
    { id: 'qr', label: 'Quét QR', icon: QrCode, tone: 'bg-amber-600 text-white' },
    { id: 'bills', label: 'Hóa đơn', icon: Receipt, tone: 'bg-rose-700 text-white' },
    { id: 'topup', label: 'Nạp ĐT', icon: Smartphone, tone: 'bg-sky-600 text-white' },
    { id: 'savings', label: 'Tiết kiệm', icon: PiggyBank, tone: 'bg-teal-600 text-white' },
    { id: 'archive', label: 'Kho Bill', icon: FileImage, tone: 'bg-slate-800 text-white' },
  ];

  const copyAccountNumber = () => {
    if (!activeAcc?.account_number) return;
    navigator.clipboard?.writeText(activeAcc.account_number).catch(() => {});
    onShowToast('Đã sao chép STK', activeAcc.account_number, 'success');
  };

  return (
    <div className="space-y-4 pb-5">
      {/* A. Hikari Header & Main Balance Card */}
      <div className={`bg-gradient-to-br ${theme.heroGradient} text-white px-4 pt-3.5 pb-6 rounded-b-[28px] shadow-lg relative overflow-hidden`}>
        {dashboardWallpaper === 'skyline' && (
          <img
            src={HIKARI_BANNER_SKYLINE}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-overlay pointer-events-none"
          />
        )}

        <div className="relative z-10 flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <HikariLogo variant="white" size={40} />
            <div className="min-w-0">
              <p className="text-[11px] text-rose-100/90 font-medium truncate">
                {getTimeGreeting()} · Hikari Bank
              </p>
              <h1 className="text-sm font-extrabold tracking-tight truncate">
                {activeAcc?.holder_name || 'Minh Anh'} · <span className="font-mono font-semibold text-xs opacity-85">{customerCode}</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAssistant}
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center backdrop-blur-md"
              title="Trợ lý Hikari-chan"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('support')}
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center backdrop-blur-md"
              title="Hỗ trợ khách hàng"
            >
              <Headphones className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="relative w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center backdrop-blur-md"
              title="Thông báo Hikari Bank"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center backdrop-blur-md"
              title="Cài đặt & Giao diện"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Account Switcher if multiple accounts exist */}
        {visibleAccounts.length > 1 && (
          <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pb-2.5">
            {visibleAccounts.map((acc) => {
              const selected = activeAcc?.id === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSelectAccount(acc.id)}
                  className={`min-h-[34px] px-3 rounded-xl text-[11px] font-bold shrink-0 whitespace-nowrap transition-colors ${
                    selected
                      ? 'bg-white text-slate-900'
                      : 'bg-white/15 text-rose-50 hover:bg-white/25'
                  }`}
                >
                  {acc.nickname || acc.account_type}
                </button>
              );
            })}
          </div>
        )}

        {/* Main Account Card */}
        <div className="relative z-10 rounded-2xl bg-black/25 p-4 border border-white/20 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-100">
                <span>{activeAcc?.package_tier || `${computedStats.tierName} Hikari`}</span>
                <span>·</span>
                <span className="text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {activeAcc?.status || 'Đang hoạt động'}
                </span>
              </div>
              <p className="text-[11px] text-rose-100/80 mt-2.5 font-medium">Số dư khả dụng (Mô phỏng Phone OS)</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-2xl font-black tracking-tight tabular-nums break-all">
                  {formatVnd(activeAcc?.available_balance ?? activeAcc?.balance ?? 0, hideBalance)}
                </p>
                <button
                  type="button"
                  onClick={onToggleHideBalance}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 shrink-0"
                  title={hideBalance ? 'Hiện số dư' : 'Ẩn số dư'}
                >
                  {hideBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Wallet className="w-7 h-7 text-amber-200/85 shrink-0" />
          </div>

          <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={copyAccountNumber}
              className="flex items-center gap-1.5 font-mono font-bold text-white/95 hover:text-amber-200 min-h-[36px]"
            >
              <span className="tabular-nums">{activeAcc?.account_number || '8800-2026-9901'}</span>
              <Copy className="w-3.5 h-3.5 opacity-80" />
            </button>
            <button
              type="button"
              onClick={() => setShowAccountDetail((s) => !s)}
              className="min-h-[36px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-[11px] font-bold whitespace-nowrap"
            >
              {showAccountDetail ? 'Thu gọn' : 'Chi tiết TK'}
            </button>
          </div>

          {showAccountDetail && activeAcc && (
            <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-2 gap-2 text-[11px] text-rose-100">
              <div>
                <p className="opacity-70">Chủ tài khoản</p>
                <p className="font-bold text-white">{activeAcc.holder_name}</p>
              </div>
              <div>
                <p className="opacity-70">Hạn mức ngày</p>
                <p className="font-bold text-white tabular-nums">{formatVnd(activeAcc.daily_limit || 100000000)}</p>
              </div>
              <div>
                <p className="opacity-70">Loại tài khoản</p>
                <p className="font-bold text-white">{activeAcc.account_type || 'Thanh toán Hikari'}</p>
              </div>
              <div>
                <p className="opacity-70">Tiền phong tỏa</p>
                <p className="font-bold text-amber-300 tabular-nums">{formatVnd(activeAcc.held_balance || 0, hideBalance)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-3.5 space-y-4">
        {/* B. Dismissible Hikari-chan Welcome Card */}
        {!bannerDismissed && (
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${theme.cardBg}`}>
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={HIKARI_AVATAR_TELLER}
                  alt="Hikari-chan"
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-[#E14B5A]/30 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold truncate">Hikari Bank · ひかり銀行</p>
                  <p className={`text-[11px] line-clamp-2 mt-0.5 ${theme.textSecondary}`}>
                    Your Life, Your Journey. Hỏi Hikari-chan để tra cứu mẹo giao dịch và quản lý thẻ thông minh.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onOpenAssistant}
                  className="min-h-[38px] px-3 rounded-xl bg-[#E14B5A] text-white text-[11px] font-bold whitespace-nowrap"
                >
                  Hỏi Hikari
                </button>
                <button
                  type="button"
                  onClick={onDismissBanner}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${theme.subCardBg}`}
                  aria-label="Ẩn thẻ chào mừng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* C. Quick Access Grid (8 Primary Actions + Secondary Bar) */}
        <div className={`rounded-2xl p-3.5 border shadow-sm space-y-3 ${theme.cardBg}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Thao tác nhanh
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className={`text-[11px] font-bold flex items-center gap-0.5 ${theme.accentClass}`}
            >
              <span>Lịch sử GD</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {primaryQuickActions.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => onNavigate(act.id)}
                  className="flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl hover:opacity-90 transition-opacity min-h-[72px]"
                >
                  <div className={`w-11 h-11 rounded-2xl ${act.tone} flex items-center justify-center shadow-sm`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight whitespace-nowrap">
                    {act.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`grid grid-cols-4 gap-1.5 pt-2 border-t ${theme.border}`}>
            {(
              [
                { id: 'expenses', label: 'Chi tiêu', icon: BarChart3 },
                { id: 'accounts', label: 'Tài khoản', icon: Layers },
                { id: 'loans', label: 'Vay vốn', icon: Landmark },
                { id: 'investments', label: 'Đầu tư', icon: TrendingUp },
              ] as const
            ).map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onNavigate(s.id)}
                  className={`min-h-[38px] px-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 whitespace-nowrap ${theme.subCardBg}`}
                >
                  <Icon className="w-3.5 h-3.5 text-[#E14B5A] shrink-0" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* D. Active Card Privileges Strip */}
        {primaryCard && (
          <div className={`rounded-2xl p-3 border shadow-sm flex items-center justify-between gap-2.5 ${theme.cardBg}`}>
            <button
              type="button"
              onClick={() => onNavigate('cards')}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
            >
              <div
                style={{
                  background: `linear-gradient(135deg, ${primaryCard.bank_primary_color || '#E14B5A'}, ${primaryCard.bank_secondary_color || '#7F1D2E'})`,
                }}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              >
                <BankBrandEmblem bankId={primaryCard.bank_id} size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold truncate">
                  {primaryCard.bank_name || 'Hikari Bank'} · {primaryCard.tier_label || 'Standard'}
                </p>
                <p className={`text-[11px] truncate tabular-nums ${theme.textSecondary}`}>
                  •••• {primaryCard.last4} · Hoàn {Number(primaryCard.cashback_rate || 0)}% · Lãi{' '}
                  {Number(primaryCard.interest_rate || 0)}% · {Number(primaryCard.reward_points || 0).toLocaleString('de-DE')}đ
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('card_benefits')}
              className="min-h-[38px] px-3 rounded-xl bg-[#E14B5A] text-white text-[11px] font-bold shrink-0 whitespace-nowrap"
            >
              Ưu đãi thẻ
            </button>
          </div>
        )}

        {/* E. Financial Overview Card (8 synced live figures) */}
        <div className={`rounded-2xl p-3.5 border shadow-sm ${theme.cardBg}`}>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Tổng quan tài sản
            </h2>
            <span className={`text-[11px] font-bold ${theme.accentClass}`}>
              Hạng {computedStats.tierName}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Tổng tài sản', val: computedStats.totalAssets, accent: theme.accentClass },
              { label: 'Số dư khả dụng', val: computedStats.availableBalance, accent: theme.textPrimary },
              { label: 'Đang phong tỏa', val: computedStats.heldBalance, accent: 'text-amber-500' },
              { label: 'Tiền gửi tiết kiệm', val: computedStats.totalSavings, accent: 'text-teal-500' },
              { label: 'Tổng đã nhận', val: computedStats.totalReceived, accent: 'text-emerald-500' },
              { label: 'Tổng đã chuyển', val: computedStats.totalTransferred, accent: theme.textPrimary },
              { label: 'Thu nhập tháng', val: computedStats.monthlyIncome, accent: 'text-emerald-500' },
              { label: 'Chi tiêu tháng', val: computedStats.monthlyExpense, accent: 'text-rose-500' },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl p-2.5 border ${theme.subCardBg}`}>
                <p className={`text-[11px] font-medium ${theme.textSecondary}`}>{item.label}</p>
                <p className={`text-xs font-extrabold tabular-nums mt-0.5 truncate ${item.accent}`}>
                  {formatVnd(item.val, hideBalance)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* F. Financial Analytics */}
        <div className={`rounded-2xl p-3.5 border shadow-sm space-y-3 ${theme.cardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${theme.textSecondary}`}>
              <BarChart3 className="w-3.5 h-3.5 text-[#E14B5A]" />
              <span>Thống kê dòng tiền</span>
            </h2>
            <div className={`flex items-center gap-1 p-0.5 rounded-lg border ${theme.subCardBg}`}>
              {(
                [
                  { id: 'week', label: 'Tuần' },
                  { id: 'month', label: 'Tháng' },
                  { id: 'year', label: 'Năm' },
                  { id: 'custom', label: 'Tùy chọn' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap ${
                    period === p.id ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${theme.subCardBg}`}
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${theme.subCardBg}`}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <p className={`text-[10px] font-semibold ${theme.isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Tiền vào</p>
              <p className="text-xs font-extrabold text-emerald-500 tabular-nums mt-0.5">
                +{formatVndCompact(filteredAnalytics.income)}
              </p>
            </div>
            <div className="rounded-xl bg-rose-500/10 p-2.5">
              <p className={`text-[10px] font-semibold ${theme.isDark ? 'text-rose-300' : 'text-rose-700'}`}>Tiền ra</p>
              <p className="text-xs font-extrabold text-rose-500 tabular-nums mt-0.5">
                -{formatVndCompact(filteredAnalytics.expense)}
              </p>
            </div>
            <div className={`rounded-xl p-2.5 ${theme.accentBgSoft}`}>
              <p className="text-[10px] font-semibold">Ròng</p>
              <p className="text-xs font-extrabold tabular-nums mt-0.5">
                {filteredAnalytics.net >= 0 ? '+' : ''}
                {formatVndCompact(filteredAnalytics.net)}
              </p>
            </div>
          </div>

          <div className={`flex items-center gap-1 border-b pb-2 ${theme.border}`}>
            {(
              [
                { id: 'cashflow', label: 'Dòng tiền' },
                { id: 'categories', label: 'Danh mục chi' },
                { id: 'mom', label: 'Các tháng' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setChartTab(t.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                  chartTab === t.id ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {chartTab === 'cashflow' && (
            <div className="space-y-2.5 py-1">
              {(() => {
                const maxVal = Math.max(1, filteredAnalytics.income, filteredAnalytics.expense);
                const incW = Math.round((filteredAnalytics.income / maxVal) * 100);
                const expW = Math.round((filteredAnalytics.expense / maxVal) * 100);
                return (
                  <>
                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-1">
                        <span>Tiền vào trong kỳ</span>
                        <span className="text-emerald-500 tabular-nums">{formatVnd(filteredAnalytics.income, hideBalance)}</span>
                      </div>
                      <div className={`h-2.5 rounded-md overflow-hidden ${theme.subCardBg}`}>
                        <div className="h-full bg-emerald-500 rounded-md" style={{ width: `${incW}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-1">
                        <span>Tiền ra trong kỳ</span>
                        <span className="text-rose-500 tabular-nums">{formatVnd(filteredAnalytics.expense, hideBalance)}</span>
                      </div>
                      <div className={`h-2.5 rounded-md overflow-hidden ${theme.subCardBg}`}>
                        <div className="h-full bg-[#E14B5A] rounded-md" style={{ width: `${expW}%` }} />
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {chartTab === 'categories' && (
            <div className="space-y-2">
              {filteredAnalytics.topCats.length === 0 ? (
                <p className={`text-xs py-3 text-center ${theme.textSecondary}`}>
                  Chưa có khoản chi trong khoảng thời gian này
                </p>
              ) : (
                filteredAnalytics.topCats.map(([cat, amt]) => {
                  const pct = filteredAnalytics.expense > 0 ? Math.round((amt / filteredAnalytics.expense) * 100) : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span>{cat}</span>
                        <span className={`tabular-nums ${theme.textSecondary}`}>
                          {formatVnd(amt, hideBalance)} ({pct}%)
                        </span>
                      </div>
                      <div className={`h-2 rounded overflow-hidden ${theme.subCardBg}`}>
                        <div className="h-full bg-[#E14B5A] rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {chartTab === 'mom' && (
            <div className="grid grid-cols-4 gap-2 pt-1">
              {filteredAnalytics.months.map(([m, vals]) => {
                const maxM = Math.max(
                  1,
                  ...filteredAnalytics.months.map(([, v]) => Math.max(v.income, v.expense))
                );
                const incH = Math.max(8, Math.round((vals.income / maxM) * 56));
                const expH = Math.max(8, Math.round((vals.expense / maxM) * 56));
                return (
                  <div key={m} className="flex flex-col items-center gap-1">
                    <div className="h-16 flex items-end gap-1.5">
                      <div className="w-3 bg-emerald-500 rounded-t" style={{ height: `${incH}px` }} />
                      <div className="w-3 bg-[#E14B5A] rounded-t" style={{ height: `${expH}px` }} />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums ${theme.textSecondary}`}>
                      {m.slice(5)}/{m.slice(2, 4)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* G. Recent Transactions */}
        <div className={`rounded-2xl p-3.5 border shadow-sm space-y-2.5 ${theme.cardBg}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Giao dịch gần đây
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className={`text-xs font-bold flex items-center gap-0.5 ${theme.accentClass}`}
            >
              <span>Xem tất cả</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className={`divide-y ${theme.border}`}>
            {recentUserTxs.map((tx) => {
              const avatar =
                tx.sender_avatar ||
                tx.recipient_avatar ||
                avatarByName.get(tx.counterparty.toLowerCase()) ||
                '';
              const isIncome = tx.tx_type === 'income';
              const isFailed = tx.bill_template === 'failed' || String(tx.status).includes('Thất bại');
              const isPending = String(tx.status).includes('Đang xử lý');
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onOpenBill(tx)}
                  className="w-full py-2.5 flex items-center justify-between gap-2.5 text-left rounded-xl px-1 transition-opacity hover:opacity-85"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {avatar ? (
                      <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isFailed
                            ? 'bg-rose-500/15 text-rose-500'
                            : isIncome
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-[#E14B5A]/15 text-[#E14B5A]'
                        }`}
                      >
                        {isIncome ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{tx.counterparty}</p>
                      <p className={`text-[11px] truncate ${theme.textSecondary}`}>{tx.note}</p>
                      <p className={`text-[10px] mt-0.5 tabular-nums ${theme.textSecondary}`}>
                        {tx.status || 'Thành công'} · {formatTimeAgoOrDate(tx.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-extrabold tabular-nums ${
                        isFailed
                          ? 'text-rose-500'
                          : isPending
                          ? 'text-amber-500'
                          : isIncome
                          ? 'text-emerald-500'
                          : theme.textPrimary
                      }`}
                    >
                      {isFailed ? '' : isIncome ? '+' : '-'}
                      {formatVnd(tx.amount, hideBalance)}
                    </p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${theme.accentClass}`}>
                      Chi tiết →
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
