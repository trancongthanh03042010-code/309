import React from 'react';
import { AlertTriangle, BadgeCheck, RefreshCw, Sparkles } from 'lucide-react';
import type { SocialReactionType } from '../../types/social';

export const REACTION_META: Record<
  SocialReactionType,
  { label: string; emoji: string; colorClass: string }
> = {
  like: { label: 'Thích', emoji: '👍', colorClass: 'text-indigo-500' },
  love: { label: 'Yêu thích', emoji: '❤️', colorClass: 'text-rose-500' },
  haha: { label: 'Haha', emoji: '😂', colorClass: 'text-amber-500' },
  wow: { label: 'Wow', emoji: '😮', colorClass: 'text-sky-500' },
  sad: { label: 'Buồn', emoji: '😢', colorClass: 'text-cyan-500' },
  angry: { label: 'Phẫn nộ', emoji: '😡', colorClass: 'text-orange-600' },
};

export const REACTION_LIST: SocialReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

export const SOCIAL_STICKERS = ['✨', '🌸', '🔥', '💯', '🎧', '☕', '📷', '🫶', '🎉', '🌙', '🌈', '👏'];

export function formatRelativeVi(iso: string): string {
  if (!iso) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 45) return 'Vừa xong';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function formatCompactCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

export function VerifiedBadge({ verified }: { verified?: number | boolean }) {
  if (!verified) return null;
  return <BadgeCheck className="w-3.5 h-3.5 text-sky-500 inline-block shrink-0" aria-label="Tài khoản đã xác minh" />;
}

export function UserAvatar({
  src,
  name,
  online,
  size = 'md',
  ring = false,
}: {
  src?: string;
  name: string;
  online?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
}) {
  const sizeCls =
    size === 'xs'
      ? 'w-7 h-7'
      : size === 'sm'
        ? 'w-9 h-9'
        : size === 'lg'
          ? 'w-14 h-14'
          : size === 'xl'
            ? 'w-20 h-20'
            : 'w-10 h-10';
  const fallback = '/src/assets/images/char_sakura_1794880090451.jpg';
  return (
    <div className={`relative shrink-0 ${ring ? 'p-[2px] rounded-full bg-gradient-to-tr from-indigo-500 via-fuchsia-500 to-rose-500' : ''}`}>
      <img
        src={src || fallback}
        alt={name}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = fallback;
        }}
        className={`${sizeCls} rounded-full object-cover bg-zinc-200 dark:bg-zinc-800 ${ring ? 'border-2 border-white dark:border-[#14161D]' : ''}`}
      />
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#14161D]" />
      )}
    </div>
  );
}

export function SocialSkeletonFeed() {
  return (
    <div className="p-3 space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/70 dark:border-zinc-800/80 p-3.5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2.5 w-20 rounded bg-zinc-100 dark:bg-zinc-800/70" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-44 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export function SocialEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-12 px-5 flex flex-col items-center text-center gap-2.5">
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
        {icon || <Sparkles className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-1 min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:scale-[0.98] transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SocialErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-10 px-5 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-rose-500">Không thể tải dữ liệu</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="min-h-[44px] px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Thử lại
      </button>
    </div>
  );
}
