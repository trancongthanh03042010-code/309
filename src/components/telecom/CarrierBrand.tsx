import React from 'react';
import {
  CheckCircle2,
  Crown,
  Gift,
  Globe,
  PhoneCall,
  Sparkles,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { TelecomCarrier, TelecomSimTier } from '../../types/os';
import { formatVnd } from '../banking/utils';

export interface ParsedCarrierTheme {
  primary: string;
  secondary: string;
  dark: string;
  accentText: string;
  gradient: string;
  softBg: string;
}

export const DEFAULT_CARRIER_THEME: ParsedCarrierTheme = {
  primary: '#6366F1',
  secondary: '#A855F7',
  dark: '#0F172A',
  accentText: '#C084FC',
  gradient: 'from-slate-950 via-indigo-950 to-purple-900',
  softBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
};

export function parseCarrierTheme(themeJson?: string): ParsedCarrierTheme {
  if (!themeJson) return DEFAULT_CARRIER_THEME;
  try {
    return { ...DEFAULT_CARRIER_THEME, ...(JSON.parse(themeJson) as Partial<ParsedCarrierTheme>) };
  } catch {
    return DEFAULT_CARRIER_THEME;
  }
}

export function parseJsonArray<T = string>(raw?: string): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function formatPhoneDisplay(phone?: string): string {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return phone || '-';
}

export function formatDataQuota(mb?: number): string {
  const n = Number(mb || 0);
  if (n <= 0) return '0 MB';
  if (n >= 1024) {
    const gb = n / 1024;
    return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`;
  }
  return `${Math.round(n)} MB`;
}

export const TOPUP_DENOMINATIONS = [10000, 20000, 50000, 100000, 200000, 500000, 1000000];

export const SIM_TIER_OPTIONS: Array<{ id: 'all' | TelecomSimTier; label: string }> = [
  { id: 'all', label: 'Tất cả loại SIM' },
  { id: 'normal', label: 'SIM thường' },
  { id: 'easy', label: 'Dễ nhớ' },
  { id: 'tam_hoa', label: 'Tam hoa' },
  { id: 'tu_quy', label: 'Tứ quý' },
  { id: 'ngu_quy', label: 'Ngũ quý' },
  { id: 'luc_quy', label: 'Lục quý' },
  { id: 'progressive', label: 'Số tiến' },
  { id: 'repeating', label: 'Số lặp' },
  { id: 'symmetric', label: 'Đối xứng' },
  { id: 'vip', label: 'VIP' },
  { id: 'premium', label: 'Premium' },
  { id: 'limited', label: 'Limited' },
];

export const PACKAGE_TYPE_OPTIONS: Array<{ id: 'all' | 'data' | 'voice' | 'sms' | 'combo' | 'limited'; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'data', label: 'Data' },
  { id: 'voice', label: 'Thoại' },
  { id: 'sms', label: 'SMS' },
  { id: 'combo', label: 'Combo' },
  { id: 'limited', label: 'Sự kiện' },
];

export function CarrierLogo({
  variant,
  size = 36,
  className = '',
}: {
  variant?: string;
  size?: number;
  className?: string;
}) {
  const v = String(variant || 'hoshi').toLowerCase();

  if (v === 'sakura') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-label="Sakura Connect Logo">
        <defs>
          <linearGradient id="sakuraGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F472B6" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#sakuraGrad)" />
        <g transform="translate(20 20)" fill="#FFF1F2">
          <path d="M0,-11 C4,-9 5,-4 0,0 C-5,-4 -4,-9 0,-11 Z" />
          <path d="M0,-11 C4,-9 5,-4 0,0 C-5,-4 -4,-9 0,-11 Z" transform="rotate(72)" />
          <path d="M0,-11 C4,-9 5,-4 0,0 C-5,-4 -4,-9 0,-11 Z" transform="rotate(144)" />
          <path d="M0,-11 C4,-9 5,-4 0,0 C-5,-4 -4,-9 0,-11 Z" transform="rotate(216)" />
          <path d="M0,-11 C4,-9 5,-4 0,0 C-5,-4 -4,-9 0,-11 Z" transform="rotate(288)" />
          <circle r="2.4" fill="#FDE047" />
        </g>
      </svg>
    );
  }

  if (v === 'akuma') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-label="Akuma Network Logo">
        <defs>
          <linearGradient id="akumaGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#18181B" />
            <stop offset="55%" stopColor="#7F1D1D" />
            <stop offset="100%" stopColor="#581C87" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#akumaGrad)" stroke="#EF4444" strokeOpacity="0.45" />
        <path
          d="M11 11 L16 18 L20 12 L24 18 L29 11 L27 25 L20 30 L13 25 Z"
          fill="none"
          stroke="#FCA5A5"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="22" r="2.5" fill="#EF4444" />
      </svg>
    );
  }

  if (v === 'aoi') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-label="Aoi Telecom Logo">
        <defs>
          <linearGradient id="aoiGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#aoiGrad)" />
        <path
          d="M8 22 C13 15, 19 15, 23 20 C26 24, 30 23, 33 18"
          fill="none"
          stroke="#F0F9FF"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M9 28 C14 23, 19 23, 24 27 C27 29, 30 28, 32 25"
          fill="none"
          stroke="#BAE6FD"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="28" cy="12" r="2.4" fill="#FFFFFF" />
      </svg>
    );
  }

  if (v === 'tsuki') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-label="Tsuki Mobile Logo">
        <defs>
          <linearGradient id="tsukiGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#312E81" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#tsukiGrad)" stroke="#CBD5E1" strokeOpacity="0.4" />
        <path
          d="M23 10 A10 10 0 1 0 30 26 A8 8 0 1 1 23 10 Z"
          fill="#F8FAFC"
        />
        <circle cx="28" cy="13" r="1.5" fill="#C7D2FE" />
        <circle cx="31" cy="18" r="1.1" fill="#E2E8F0" />
      </svg>
    );
  }

  // Default: Hoshi Mobile
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-label="Hoshi Mobile Logo">
      <defs>
        <linearGradient id="hoshiGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#hoshiGrad)" stroke="#A78BFA" strokeOpacity="0.5" />
      <ellipse cx="20" cy="20" rx="13" ry="5.5" transform="rotate(-24 20 20)" fill="none" stroke="#C4B5FD" strokeWidth="1.5" />
      <path d="M20 9 L22.4 17 L30 20 L22.4 23 L20 31 L17.6 23 L10 20 L17.6 17 Z" fill="#F8FAFC" />
    </svg>
  );
}

export function AnimeTelecomEmblem({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Anime Telecom Logo">
      <defs>
        <linearGradient id="atEmblem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="55%" stopColor="#9333EA" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#atEmblem)" />
      <path d="M12 28 L12 24 M17.5 28 L17.5 19 M23 28 L23 14 M28.5 28 L28.5 10" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="12" cy="14" r="2.2" fill="#FDE047" />
    </svg>
  );
}

export function CarrierDetailModal({
  carrier,
  simCount,
  packageCount,
  onClose,
  onBrowseSims,
  onBrowsePackages,
}: {
  carrier: TelecomCarrier | null;
  simCount: number;
  packageCount: number;
  onClose: () => void;
  onBrowseSims: (carrierId: string) => void;
  onBrowsePackages: (carrierId: string) => void;
}) {
  if (!carrier) return null;
  const theme = parseCarrierTheme(carrier.theme_json);
  let info: {
    coverage?: string;
    hotline?: string;
    speedCap?: string;
    roaming?: string;
    specialLines?: string[];
  } = {};
  try {
    info = JSON.parse(carrier.service_info_json || '{}');
  } catch {
    info = {};
  }
  const promos = parseJsonArray<{ title: string; detail: string }>(carrier.promotions_json);
  const prefixes = parseJsonArray<string>(carrier.prefixes_json);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Thematic Carrier Banner */}
        <div className={`bg-gradient-to-br ${theme.gradient} text-white p-5 relative overflow-hidden shrink-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <CarrierLogo variant={carrier.logo_variant} size={48} className="shrink-0 shadow-lg" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wider text-white/80 uppercase">{carrier.jp_name}</p>
                <h3 className="text-lg font-black tracking-tight truncate">{carrier.name}</h3>
                <p className="text-xs text-white/85 mt-0.5">{carrier.tagline}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center bg-black/25 rounded-2xl p-2.5 border border-white/10">
            <div>
              <p className="text-[10px] text-white/70">Đầu số</p>
              <p className="text-xs font-bold tabular-nums">{prefixes.join(' · ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/70">SIM mở bán</p>
              <p className="text-xs font-bold tabular-nums">{simCount} số đẹp</p>
            </div>
            <div>
              <p className="text-[10px] text-white/70">Gói cước</p>
              <p className="text-xs font-bold tabular-nums">{packageCount} gói</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Định vị & Lịch sử thương hiệu</span>
            </p>
            <p className="text-xs font-semibold leading-relaxed">{carrier.positioning}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{carrier.history_lore}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2.5 text-xs">
            <p className="font-bold flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span>Thông tin dịch vụ & Hạ tầng</span>
            </p>
            <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
              <p className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
                <span>{info.coverage}</span>
              </p>
              <p className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Tốc độ tối đa: <strong>{info.speedCap}</strong></span>
              </p>
              <p className="flex items-start gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <span>Tổng đài: <strong>{info.hotline}</strong></span>
              </p>
              {info.specialLines && info.specialLines.length > 0 && (
                <p className="flex items-start gap-2">
                  <Crown className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                  <span>Dòng SIM đặc biệt: <strong>{info.specialLines.join(' · ')}</strong></span>
                </p>
              )}
            </div>
          </div>

          {promos.length > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 space-y-2">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
                <Gift className="w-4 h-4" />
                <span>Chương trình khuyến mãi</span>
              </p>
              {promos.map((pr, idx) => (
                <div key={idx} className="text-xs space-y-0.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{pr.title}</span>
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 pl-5">{pr.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onBrowseSims(carrier.id);
            }}
            className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3"
          >
            Xem kho SIM ({simCount})
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onBrowsePackages(carrier.id);
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold px-3 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            Xem gói cước ({packageCount})
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatMoneyShort(n: number): string {
  return formatVnd(n);
}
