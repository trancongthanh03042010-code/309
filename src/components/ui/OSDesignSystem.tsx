import React from 'react';
import { AlertCircle, ArrowLeft, RefreshCw, WifiOff, Inbox } from 'lucide-react';

/**
 * Shared Premium iOS-inspired UI Kit for PHONE OS 4.0
 * Follows semantic design tokens, 44px minimum touch targets, zero-pill static metadata, and hairline dividers.
 */

export function OSAppHeader({
  title,
  subtitle,
  onBack,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 py-2.5 bg-[var(--os-surface)]/95 backdrop-blur-md border-b border-[var(--os-border)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-xl text-[var(--os-primary)] hover:bg-[var(--os-surface-elevated)] active:scale-95 transition-transform shrink-0"
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-base font-bold text-[var(--os-text)] truncate">{title}</h1>
          {subtitle && (
            <p className="text-[11px] text-[var(--os-muted)] truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {rightAction && <div className="shrink-0 flex items-center gap-1.5">{rightAction}</div>}
    </header>
  );
}

export function OSSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="p-1 rounded-xl bg-[var(--os-surface-elevated)] flex items-center gap-1">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              active
                ? 'bg-[var(--os-surface)] text-[var(--os-text)] shadow-sm'
                : 'text-[var(--os-muted)] hover:text-[var(--os-text)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function OSGroupedList({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {title && (
        <h2 className="px-2 text-[11px] font-semibold text-[var(--os-muted)]">
          {title}
        </h2>
      )}
      <div className="rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] divide-y divide-[var(--os-border)] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

export function OSListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  danger = false,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-full min-h-[54px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left ${
        onClick ? 'hover:bg-[var(--os-surface-elevated)]/70 active:bg-[var(--os-surface-elevated)] transition-colors' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${danger ? 'text-[var(--os-danger)]' : 'text-[var(--os-text)]'}`}>
            {title}
          </p>
          {subtitle && <p className="text-[11px] text-[var(--os-muted)] truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1.5">{trailing}</div>}
    </Tag>
  );
}

export function OSSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-45 ${
        checked ? 'bg-[var(--os-success)]' : 'bg-[var(--os-secondary)]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function OSRealityLabel({
  type,
  detail,
}: {
  type: 'A' | 'B' | 'C' | 'D' | 'A/B' | 'B/C' | 'B/D';
  detail?: string;
}) {
  const map: Record<string, string> = {
    A: 'Loại A · Nội bộ PHONE OS',
    B: 'Loại B · Dịch vụ ngoài',
    C: 'Loại C · Thiết bị/Quyền trình duyệt',
    D: 'Loại D · Mô phỏng (dữ liệu demo)',
    'A/B': 'Loại A/B · Nội bộ + API chính thức',
    'B/C': 'Loại B/C · API chính thức + Nền tảng',
    'B/D': 'Loại B/D · Khám phá + Liên kết hợp pháp',
  };
  return (
    <p className="text-[11px] text-[var(--os-muted)] leading-snug">
      <span className="font-semibold text-[var(--os-text)]">{map[type]}</span>
      {detail ? ` · ${detail}` : ''}
    </p>
  );
}

export function OSStateView({
  mode,
  title,
  message,
  onRetry,
}: {
  mode: 'loading' | 'empty' | 'offline' | 'error';
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  if (mode === 'loading') {
    return (
      <div className="p-4 space-y-3" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-[var(--os-surface-elevated)] animate-pulse" />
        ))}
      </div>
    );
  }
  const Icon = mode === 'offline' ? WifiOff : mode === 'error' ? AlertCircle : Inbox;
  return (
    <div className="py-12 px-6 text-center flex flex-col items-center justify-center gap-2.5">
      <div className="w-11 h-11 rounded-2xl bg-[var(--os-surface-elevated)] flex items-center justify-center text-[var(--os-muted)]">
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold text-[var(--os-text)]">
        {title || (mode === 'offline' ? 'Đang ngoại tuyến' : mode === 'error' ? 'Đã xảy ra lỗi' : 'Chưa có dữ liệu')}
      </p>
      {message && <p className="text-xs text-[var(--os-muted)] max-w-xs leading-relaxed">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-4 py-2 rounded-xl bg-[var(--os-primary)] text-white text-xs font-semibold flex items-center gap-1.5 min-h-[40px]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      )}
    </div>
  );
}
