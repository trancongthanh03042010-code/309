import React from 'react';
import { Ban, Lock, Link2Off, Wifi } from 'lucide-react';
import type { BankBrandId, BankingCardItem, CardTierId } from '../../../types/os';

export const CARD_DESIGN_THEMES: Record<string, { label: string; primary: string; secondary: string }> = {
  default: { label: 'Mặc định ngân hàng', primary: '', secondary: '' },
  hikari_coral: { label: 'Hikari Coral', primary: '#E14B5A', secondary: '#7F1D2E' },
  sakura_blossom: { label: 'Sakura Blossom', primary: '#F472B6', secondary: '#9D174D' },
  midnight_luxury: { label: 'Midnight Luxury', primary: '#1E293B', secondary: '#090D16' },
  cyber_neon: { label: 'Cyber Neon', primary: '#6366F1', secondary: '#1E1B4B' },
  gold_premier: { label: 'Gold Premier', primary: '#D97706', secondary: '#451A03' },
};

export const TIER_VISUAL_META: Record<
  CardTierId,
  { label: string; sheen: string; chipColor: string; textTone: string; borderAccent: string }
> = {
  standard: {
    label: 'STANDARD',
    sheen: 'from-white/10 via-transparent to-black/25',
    chipColor: 'from-amber-200 to-amber-400',
    textTone: 'text-white',
    borderAccent: 'border-white/20',
  },
  silver: {
    label: 'SILVER',
    sheen: 'from-slate-200/35 via-white/10 to-slate-900/35',
    chipColor: 'from-slate-100 to-slate-300',
    textTone: 'text-white',
    borderAccent: 'border-slate-200/45',
  },
  gold: {
    label: 'GOLD',
    sheen: 'from-amber-300/35 via-yellow-100/15 to-amber-900/40',
    chipColor: 'from-yellow-200 to-amber-500',
    textTone: 'text-white',
    borderAccent: 'border-amber-300/55',
  },
  platinum: {
    label: 'PLATINUM',
    sheen: 'from-sky-200/30 via-white/15 to-slate-950/45',
    chipColor: 'from-slate-100 to-cyan-200',
    textTone: 'text-white',
    borderAccent: 'border-cyan-200/50',
  },
  diamond: {
    label: 'DIAMOND',
    sheen: 'from-cyan-300/35 via-indigo-200/15 to-slate-950/55',
    chipColor: 'from-cyan-100 to-sky-300',
    textTone: 'text-white',
    borderAccent: 'border-cyan-300/60',
  },
  infinite: {
    label: 'INFINITE',
    sheen: 'from-amber-400/25 via-rose-400/15 to-black/70',
    chipColor: 'from-amber-200 via-yellow-400 to-amber-500',
    textTone: 'text-amber-50',
    borderAccent: 'border-amber-400/65',
  },
};

export function BankBrandEmblem({
  bankId,
  size = 28,
  className = '',
}: {
  bankId?: BankBrandId | string;
  size?: number;
  className?: string;
}) {
  const id = String(bankId || 'hikari') as BankBrandId;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {id === 'hikari' && (
        <>
          <rect x="2" y="2" width="32" height="32" rx="9" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.4)" />
          <circle cx="18" cy="14" r="5" fill="#FDE047" />
          <path d="M18 5V7.5M11.6 7.6L13.4 9.4M24.4 7.6L22.6 9.4M8.5 14H11M25 14H27.5" stroke="#FEF08A" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M12.5 18.5V28.5M23.5 18.5V28.5M12.5 23.5H23.5" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {id === 'sakura' && (
        <>
          <rect x="2" y="2" width="32" height="32" rx="9" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.42)" />
          <path d="M18 7.5C20.5 10.5 21.2 13.5 18 16.5C14.8 13.5 15.5 10.5 18 7.5Z" fill="#FFE4E6" />
          <path d="M27.5 14.5C24.5 17 21.5 17.5 18.8 15C21 12.2 24.5 12 27.5 14.5Z" fill="#FECDD3" />
          <path d="M24 26.5C20.5 25.8 18.5 23.5 18.8 19.5C22.2 20 24.2 22.8 24 26.5Z" fill="#FFE4E6" />
          <path d="M12 26.5C11.8 22.8 13.8 20 17.2 19.5C17.5 23.5 15.5 25.8 12 26.5Z" fill="#FECDD3" />
          <path d="M8.5 14.5C11.5 12 15 12.2 17.2 15C14.5 17.5 11.5 17 8.5 14.5Z" fill="#FFE4E6" />
          <circle cx="18" cy="17.2" r="2.1" fill="#FDE047" />
        </>
      )}
      {id === 'akuma' && (
        <>
          <rect x="2" y="2" width="32" height="32" rx="9" fill="rgba(220,38,38,0.22)" stroke="rgba(248,113,113,0.48)" />
          <path
            d="M9 11L15.5 16L18 9.5L20.5 16L27 11L24 22.5L18 28L12 22.5L9 11Z"
            fill="rgba(248,113,113,0.9)"
            stroke="#FFFFFF"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="19.5" r="2.2" fill="#FEF08A" />
        </>
      )}
      {id === 'tsuki' && (
        <>
          <rect x="2" y="2" width="32" height="32" rx="9" fill="rgba(167,139,250,0.2)" stroke="rgba(196,181,253,0.45)" />
          <path
            d="M21.5 9.8C16.8 10.2 13.4 14.2 13.8 18.9C14.2 23.4 18 26.7 22.5 26.5C18.5 27.9 13.9 26.3 11.8 22.4C9.5 18.2 11.1 12.9 15.3 10.6C17.3 9.5 19.5 9.3 21.5 9.8Z"
            fill="#FDE68A"
          />
          <circle cx="24" cy="13.5" r="1.6" fill="#E0E7FF" />
          <circle cx="25.5" cy="19.5" r="1.1" fill="#C4B5FD" />
        </>
      )}
      {id === 'aoi' && (
        <>
          <rect x="2" y="2" width="32" height="32" rx="9" fill="rgba(34,211,238,0.2)" stroke="rgba(165,243,252,0.48)" />
          <path d="M8.5 20.5C11.5 16 15.5 15 19 18C22 20.5 25 19.5 27.5 16" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M9.5 25C12.5 21.5 16 21 19 23.2C22 25.4 25 24.4 27 21.5" stroke="#A5F3FC" strokeWidth="2.1" strokeLinecap="round" />
          <circle cx="24.5" cy="11.5" r="2.2" fill="#E0F2FE" />
        </>
      )}
    </svg>
  );
}

interface BankCardVisualProps {
  card: BankingCardItem;
  compact?: boolean;
  isSelected?: boolean;
  revealedPan?: string;
  revealedCvv?: string;
  onClick?: () => void;
}

export function BankCardVisual({
  card,
  compact = false,
  isSelected = false,
  revealedPan,
  revealedCvv,
  onClick,
}: BankCardVisualProps) {
  const tierId = (card.card_tier || 'standard') as CardTierId;
  const tierMeta = TIER_VISUAL_META[tierId] || TIER_VISUAL_META.standard;
  const themePreset = CARD_DESIGN_THEMES[card.design_theme || ''] || null;
  const primaryHex = themePreset?.primary || card.bank_primary_color || '#E14B5A';
  const secondaryHex = themePreset?.secondary || card.bank_secondary_color || '#7F1D2E';
  const accentHex = card.bank_accent_color || '#FDE047';
  const isCancelled = card.status === 'cancelled';
  const isLocked = card.status === 'locked';
  const isUnlinked = card.linked_status === 'unlinked' || !card.account_id;
  const categoryLabel =
    card.card_category === 'credit' || card.card_type === 'credit' ? 'CREDIT' : 'DEBIT';
  const issuedDate = (card.issued_at || card.created_at || '').slice(0, 10);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: `linear-gradient(135deg, ${primaryHex} 0%, ${secondaryHex} 100%)`,
      }}
      className={`relative rounded-2xl border overflow-hidden select-none transition-all ${tierMeta.borderAccent} ${
        tierMeta.textTone
      } ${compact ? 'p-4 min-h-[168px]' : 'p-5 min-h-[196px]'} ${
        isSelected ? 'ring-2 ring-offset-2 ring-[#E14B5A] shadow-xl scale-[1.01]' : 'shadow-lg'
      } ${isCancelled ? 'opacity-70 grayscale-[65%]' : ''} ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      {/* Metallic & Tier Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-tr ${tierMeta.sheen} pointer-events-none`} />
      {tierId === 'diamond' && (
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(120deg, transparent 22%, rgba(255,255,255,0.42) 38%, transparent 52%)',
          }}
        />
      )}
      {tierId === 'infinite' && (
        <div
          className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full opacity-30 blur-xl pointer-events-none"
          style={{ background: accentHex }}
        />
      )}

      <div className="relative z-10 flex flex-col justify-between h-full min-h-[144px] gap-3">
        {/* Top Row: Bank Identity + Category & Tier */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BankBrandEmblem bankId={card.bank_id} size={compact ? 30 : 34} />
            <div className="min-w-0">
              <p className="text-xs font-extrabold tracking-tight truncate">
                {card.bank_name || 'Hikari Bank'}
              </p>
              <p className="text-[10px] text-white/75 truncate font-medium">
                {card.card_nickname || card.card_name}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1">
              <span className="inline-block px-1.5 py-0.5 rounded-md text-[9.5px] font-black tracking-wider bg-white/15 border border-white/25">
                {categoryLabel}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider bg-black/25 border border-white/20">
                {tierMeta.label}
              </span>
            </div>
            {Number(card.is_primary) === 1 && !isCancelled && (
              <p className="text-[9.5px] font-bold text-amber-200 mt-0.5">THẺ CHÍNH</p>
            )}
          </div>
        </div>

        {/* Middle Row: EMV Chip + Contactless + Number */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-6 rounded-md bg-gradient-to-br ${tierMeta.chipColor} border border-white/40 shadow-inner`}
              />
              {Number(card.contactless_enabled ?? 1) === 1 && !isCancelled && (
                <Wifi className="w-4 h-4 rotate-90 text-white/80" />
              )}
            </div>
            {(isCancelled || isLocked || isUnlinked) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/55 border border-white/25 text-[10px] font-bold text-rose-200">
                {isCancelled ? (
                  <Ban className="w-3 h-3" />
                ) : isLocked ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Link2Off className="w-3 h-3" />
                )}
                {isCancelled ? 'ĐÃ HỦY' : isLocked ? 'ĐÃ KHÓA' : 'NGƯNG LIÊN KẾT'}
              </span>
            )}
          </div>

          <p
            className={`${compact ? 'text-base' : 'text-lg'} font-mono font-bold tracking-[0.14em] tabular-nums ${
              isCancelled ? 'line-through opacity-80' : ''
            }`}
          >
            {revealedPan || card.masked_number}
          </p>
        </div>

        {/* Bottom Row: Holder + Dates/CVV + Rewards/Network */}
        <div className="flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-white/65">Chủ thẻ</p>
            <p className="text-xs font-extrabold tracking-wide uppercase truncate">{card.holder_name}</p>
            {issuedDate && (
              <p className="text-[9px] text-white/65 font-mono tabular-nums mt-0.5">
                Phát hành {issuedDate}
              </p>
            )}
          </div>
          <div className="text-center shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-white/65">Hiệu lực</p>
            <p className="text-xs font-mono font-bold tabular-nums">{card.expiry}</p>
            <p className="text-[9.5px] font-mono font-bold text-white/85 tabular-nums mt-0.5">
              CVV {revealedCvv || '•••'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold text-amber-200 tabular-nums">
              {Number(card.cashback_rate || 0) > 0 ? `Hoàn ${card.cashback_rate}%` : 'Cơ bản'}
            </p>
            <p className="text-[10px] font-extrabold tracking-wider text-white/90">
              {card.network_brand || 'HIKARI PAY'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

