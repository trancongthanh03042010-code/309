import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  ShieldAlert,
  Shirt,
  Smile,
  TrendingUp,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type { BankingOverviewPayload, BankingThemeId } from '../../types/os';
import {
  formatVnd,
  HIKARI_AVATAR_TELLER,
  HIKARI_BANNER_SKYLINE,
} from './utils';

export interface HikariThemePalette {
  id: BankingThemeId;
  name: string;
  jpLabel: string;
  isDark: boolean;
  pageBg: string;
  cardBg: string;
  subCardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accentHex: string;
  accentClass: string;
  accentBgSoft: string;
  heroGradient: string;
  navBg: string;
  inputClass: string;
  selectOptionBg: string;
  selectOptionText: string;
  progressTrackBg: string;
  chipInactive: string;
  badgePrimary: string;
  badgeSuccess: string;
  badgeWarning: string;
  badgeDanger: string;
  badgeInfo: string;
  badgeNeutral: string;
}

export const HIKARI_THEMES: Record<BankingThemeId, HikariThemePalette> = {
  coral: {
    id: 'coral',
    name: 'Hikari Coral',
    jpLabel: 'ひかり珊瑚',
    isDark: false,
    pageBg: 'bg-[#F8F6F5] text-slate-900',
    cardBg: 'bg-white border-slate-200/80 text-slate-900',
    subCardBg: 'bg-slate-50 border-slate-200/70 text-slate-900',
    border: 'border-slate-200/80',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-500',
    accentHex: '#E14B5A',
    accentClass: 'text-[#E14B5A]',
    accentBgSoft: 'bg-[#E14B5A]/10 text-[#C83242]',
    heroGradient: 'from-[#E14B5A] via-[#D0384A] to-[#8F1D30]',
    navBg: 'bg-white/95 border-slate-200/90',
    inputClass: 'bg-slate-100 text-slate-900 placeholder:text-slate-400 border-slate-200 focus:border-[#E14B5A]',
    selectOptionBg: '#FFFFFF',
    selectOptionText: '#0F172A',
    progressTrackBg: 'bg-slate-200',
    chipInactive: 'bg-slate-100 text-slate-700 border-slate-200',
    badgePrimary: 'bg-[#E14B5A]/12 text-[#C83242] border-[#E14B5A]/25',
    badgeSuccess: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeWarning: 'bg-amber-50 text-amber-800 border-amber-200',
    badgeDanger: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeInfo: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeNeutral: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  sakura: {
    id: 'sakura',
    name: 'Sakura Blossom',
    jpLabel: '桜プレミアム',
    isDark: false,
    pageBg: 'bg-[#FDF6F8] text-slate-900',
    cardBg: 'bg-white border-rose-200/70 text-slate-900',
    subCardBg: 'bg-rose-50/60 border-rose-200/60 text-slate-900',
    border: 'border-rose-200/70',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-500',
    accentHex: '#DB5A82',
    accentClass: 'text-[#DB5A82]',
    accentBgSoft: 'bg-[#DB5A82]/10 text-[#B83B63]',
    heroGradient: 'from-[#DB5A82] via-[#C24069] to-[#7D1D41]',
    navBg: 'bg-white/95 border-rose-200/80',
    inputClass: 'bg-rose-50/70 text-slate-900 placeholder:text-slate-400 border-rose-200 focus:border-[#DB5A82]',
    selectOptionBg: '#FFFFFF',
    selectOptionText: '#0F172A',
    progressTrackBg: 'bg-rose-100',
    chipInactive: 'bg-rose-50 text-slate-700 border-rose-200',
    badgePrimary: 'bg-[#DB5A82]/12 text-[#B83B63] border-[#DB5A82]/25',
    badgeSuccess: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeWarning: 'bg-amber-50 text-amber-800 border-amber-200',
    badgeDanger: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeInfo: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeNeutral: 'bg-rose-50 text-slate-600 border-rose-200',
  },
  sumi: {
    id: 'sumi',
    name: 'Midnight Sumi',
    jpLabel: '墨ダーク',
    isDark: true,
    pageBg: 'bg-[#10131C] text-slate-100',
    cardBg: 'bg-[#181D2A] border-slate-700/70 text-slate-100',
    subCardBg: 'bg-[#202637] border-slate-700/60 text-slate-100',
    border: 'border-slate-700/70',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-400',
    accentHex: '#FB7185',
    accentClass: 'text-rose-400',
    accentBgSoft: 'bg-rose-500/15 text-rose-300',
    heroGradient: 'from-[#2A1B2E] via-[#511D35] to-[#111827]',
    navBg: 'bg-[#141824]/95 border-slate-800',
    inputClass: 'bg-[#202637] text-slate-100 placeholder:text-slate-400 border-slate-700 focus:border-rose-400',
    selectOptionBg: '#1E2434',
    selectOptionText: '#F1F5F9',
    progressTrackBg: 'bg-slate-800',
    chipInactive: 'bg-[#202637] text-slate-200 border-slate-700',
    badgePrimary: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    badgeSuccess: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70',
    badgeWarning: 'bg-amber-950/60 text-amber-300 border-amber-800/70',
    badgeDanger: 'bg-rose-950/60 text-rose-300 border-rose-800/70',
    badgeInfo: 'bg-sky-950/60 text-sky-300 border-sky-800/70',
    badgeNeutral: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  sunrise: {
    id: 'sunrise',
    name: 'Tokyo Sunrise',
    jpLabel: '東京サンライズ',
    isDark: false,
    pageBg: 'bg-[#FAF8F4] text-slate-900',
    cardBg: 'bg-white border-amber-200/70 text-slate-900',
    subCardBg: 'bg-amber-50/50 border-amber-200/60 text-slate-900',
    border: 'border-amber-200/70',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-500',
    accentHex: '#D97706',
    accentClass: 'text-amber-600',
    accentBgSoft: 'bg-amber-500/10 text-amber-700',
    heroGradient: 'from-[#D97706] via-[#DC4C46] to-[#991B2E]',
    navBg: 'bg-white/95 border-amber-200/80',
    inputClass: 'bg-amber-50/60 text-slate-900 placeholder:text-slate-400 border-amber-200 focus:border-amber-600',
    selectOptionBg: '#FFFFFF',
    selectOptionText: '#0F172A',
    progressTrackBg: 'bg-amber-100',
    chipInactive: 'bg-amber-50 text-slate-700 border-amber-200',
    badgePrimary: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
    badgeSuccess: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeWarning: 'bg-amber-50 text-amber-800 border-amber-200',
    badgeDanger: 'bg-rose-50 text-rose-700 border-rose-200',
    badgeInfo: 'bg-sky-50 text-sky-700 border-sky-200',
    badgeNeutral: 'bg-amber-50 text-slate-600 border-amber-200',
  },
};

export const HIKARI_WALLPAPERS = [
  { id: 'skyline', label: 'Tokyo Sunrise', image: HIKARI_BANNER_SKYLINE, previewClass: 'from-[#E14B5A] to-[#8F1D30]' },
  { id: 'minimal', label: 'Tối giản San hô', image: '', previewClass: 'from-rose-500 to-rose-700' },
  { id: 'sakura', label: 'Cánh hoa Sakura', image: '', previewClass: 'from-pink-400 to-rose-500' },
  { id: 'sumi', label: 'Đêm Tokyo Sumi', image: '', previewClass: 'from-slate-800 to-slate-950' },
];

export const ASSISTANT_OUTFITS = [
  { id: 'teller_classic', label: 'Đồng phục Giao dịch viên' },
  { id: 'spring_kimono', label: 'Kimono Mùa Xuân' },
  { id: 'premier_suit', label: 'Vest Premier Thanh lịch' },
];

export const ASSISTANT_EXPRESSIONS = [
  { id: 'cheerful', label: 'Tươi cười (Ohayō)' },
  { id: 'calm', label: 'Điềm tĩnh chuyên nghiệp' },
  { id: 'encouraging', label: 'Cổ vũ tiết kiệm' },
  { id: 'focused', label: 'Tập trung kiểm tra' },
];

export function getThemePalette(themeId?: string): HikariThemePalette {
  if (themeId && themeId in HIKARI_THEMES) {
    return HIKARI_THEMES[themeId as BankingThemeId];
  }
  return HIKARI_THEMES.coral;
}

export function HikariLogo({
  variant = 'coral',
  size = 36,
  className = '',
}: {
  variant?: 'coral' | 'white' | 'dark';
  size?: number;
  className?: string;
}) {
  const bg =
    variant === 'white'
      ? 'rgba(255,255,255,0.2)'
      : variant === 'dark'
      ? '#1E293B'
      : '#E14B5A';
  const ring = variant === 'white' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-label="Hikari Bank Logo"
    >
      <rect x="2" y="2" width="44" height="44" rx="13" fill={bg} stroke={ring} strokeWidth="1.5" />
      <circle cx="24" cy="18" r="6" fill="#FCD34D" fillOpacity="0.92" />
      <path
        d="M24 7V10M15.5 10.5L17.6 12.6M32.5 10.5L30.4 12.6M11 18H14M34 18H37"
        stroke="#FDE68A"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M15 21.5V37M33 21.5V37M15 29H33"
        stroke="#FFFFFF"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HikariStarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.5L14.4 9.6L22.5 12L14.4 14.4L12 22.5L9.6 14.4L1.5 12L9.6 9.6L12 1.5Z" />
    </svg>
  );
}

export function HikariAssistantModal({
  open,
  onClose,
  overview,
  onUpdated,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  overview: BankingOverviewPayload | null;
  onUpdated: (next: BankingOverviewPayload) => void;
  theme: HikariThemePalette;
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user'; text: string }>>([
    {
      role: 'assistant',
      text: 'Xin chào! Mình là Hikari-chan — Giao dịch viên hướng dẫn của Hikari Bank (ひかり銀行). Mình có thể giải thích tính năng, tổng hợp chi tiêu chỉ đọc và hỗ trợ quy trình giao dịch mô phỏng cho bạn.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const prefs = overview?.preferences;
  const outfit = prefs?.assistant_outfit || 'teller_classic';
  const expression = prefs?.assistant_expression || 'cheerful';

  const statsSummary = useMemo(() => {
    const st = overview?.computedStats;
    const budgets = overview?.budgets || [];
    const monthlyExp = st?.monthlyExpense || 0;
    const totalBudget = budgets.reduce((s, b) => s + Number(b.monthly_limit || 0), 0);
    const overPct = totalBudget > 0 ? Math.round((monthlyExp / totalBudget) * 100) : 0;
    return {
      balance: st?.availableBalance || 0,
      monthlyIncome: st?.monthlyIncome || 0,
      monthlyExpense: monthlyExp,
      overPct,
    };
  }, [overview]);

  if (!open) return null;

  const handleAsk = async (qText?: string) => {
    const q = (qText ?? question).trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    if (!qText) setQuestion('');
    setLoading(true);
    try {
      const res = await osApi.banking.askSupportAi(q);
      setMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Hệ thống trợ lý tạm bận, bạn thử lại nhé.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const updatePref = async (patch: { assistant_outfit?: string; assistant_expression?: string }) => {
    setSavingPref(true);
    try {
      const next = await osApi.banking.updatePreferences(patch);
      onUpdated(next);
    } finally {
      setSavingPref(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={`w-full max-w-md max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden ${theme.cardBg} ${theme.textPrimary}`}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${theme.heroGradient} text-white px-5 py-4 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={HIKARI_AVATAR_TELLER}
              alt="Hikari-chan"
              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-white/40 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-base truncate">Hikari-chan</p>
                <HikariStarIcon className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              </div>
              <p className="text-xs text-white/85 truncate">
                {ASSISTANT_OUTFITS.find((o) => o.id === outfit)?.label} · {ASSISTANT_EXPRESSIONS.find((e) => e.id === expression)?.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Strict Simulation Guard Notice */}
          <div className={`rounded-2xl border px-3.5 py-2.5 text-xs flex items-start gap-2.5 ${theme.subCardBg}`}>
            <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${theme.accentClass}`} />
            <p className={theme.textSecondary}>
              Chế độ trợ lý chỉ đọc: Hikari-chan giải thích quy trình và tóm tắt số liệu, không tự ý sửa số dư hay thực hiện chuyển tiền thay bạn.
            </p>
          </div>

          {/* Read-only Insights */}
          <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.subCardBg}`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold flex items-center gap-1.5 ${theme.textPrimary}`}>
                <TrendingUp className={`w-4 h-4 ${theme.accentClass}`} />
                Tổng quan tài chính tháng này
              </span>
              <span className={`font-mono-num font-semibold ${theme.accentClass}`}>
                {statsSummary.overPct > 0 ? `${statsSummary.overPct}% ngân sách` : 'Ổn định'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                <p className={`text-[10px] ${theme.textSecondary}`}>Khả dụng</p>
                <p className="text-xs font-bold tabular-nums mt-0.5 truncate">{formatVnd(statsSummary.balance)}</p>
              </div>
              <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                <p className={`text-[10px] ${theme.textSecondary}`}>Thu tháng</p>
                <p className="text-xs font-bold text-emerald-500 tabular-nums mt-0.5 truncate">+{formatVnd(statsSummary.monthlyIncome)}</p>
              </div>
              <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                <p className={`text-[10px] ${theme.textSecondary}`}>Chi tháng</p>
                <p className="text-xs font-bold text-rose-500 tabular-nums mt-0.5 truncate">-{formatVnd(statsSummary.monthlyExpense)}</p>
              </div>
            </div>
          </div>

          {/* Outfit & Expression */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${theme.textSecondary}`}>
                <Shirt className="w-3.5 h-3.5" /> Trang phục Hikari-chan
              </span>
              {savingPref && <Loader2 className="w-3.5 h-3.5 animate-spin opacity-60" />}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ASSISTANT_OUTFITS.map((o) => {
                const active = o.id === outfit;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => updatePref({ assistant_outfit: o.id })}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl text-[11px] font-semibold border transition text-center ${
                      active
                        ? 'bg-[#E14B5A] text-white border-[#E14B5A]'
                        : `${theme.subCardBg} ${theme.textPrimary}`
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            <span className={`text-xs font-semibold flex items-center gap-1.5 pt-1 ${theme.textSecondary}`}>
              <Smile className="w-3.5 h-3.5" /> Biểu cảm giao tiếp
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {ASSISTANT_EXPRESSIONS.map((e) => {
                const active = e.id === expression;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => updatePref({ assistant_expression: e.id })}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition ${
                      active
                        ? 'bg-[#E14B5A] text-white border-[#E14B5A]'
                        : `${theme.subCardBg} ${theme.textPrimary}`
                    }`}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Suggested Prompts */}
          <div className="space-y-1.5">
            <p className={`text-xs font-semibold flex items-center gap-1.5 ${theme.textSecondary}`}>
              <HelpCircle className="w-3.5 h-3.5" /> Gợi ý hỏi nhanh
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Cách đặt thẻ chính và đổi nguồn thanh toán?',
                'Tại sao giao dịch lỗi không có biên lai PNG?',
                'Nhận xét chi tiêu tháng này giúp mình',
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleAsk(s)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium text-left transition ${theme.subCardBg} hover:border-[#E14B5A]/50`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Chat history */}
          <div className="space-y-2.5 pt-1">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#E14B5A] text-white'
                      : `${theme.subCardBg} border ${theme.textPrimary}`
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className={`rounded-2xl px-3.5 py-2.5 text-xs border flex items-center gap-2 ${theme.subCardBg}`}>
                  <Sparkles className="w-3.5 h-3.5 animate-pulse text-[#E14B5A]" />
                  <span>Hikari-chan đang kiểm tra dữ liệu...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className={`p-3 border-t flex items-center gap-2 ${theme.border}`}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk();
            }}
            placeholder="Hỏi Hikari-chan về ngân hàng..."
            className={`flex-1 min-h-[44px] rounded-xl px-3.5 text-sm border outline-none focus:border-[#E14B5A] ${theme.subCardBg} ${theme.textPrimary}`}
          />
          <button
            type="button"
            onClick={() => handleAsk()}
            disabled={loading || !question.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#E14B5A] text-white font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
