import React from 'react';
import {
  Phone,
  MessageCircle,
  Compass,
  Camera,
  Image,
  Sparkles,
  HeartHandshake,
  Bot,
  Users,
  Mail,
  Calendar,
  CheckSquare,
  FileText,
  FolderOpen,
  MapPin,
  CloudSun,
  Clock,
  Calculator,
  Music2,
  Film,
  Mic,
  ScanText,
  ShoppingBag,
  Settings,
  Activity,
  Wallet,
  KeyRound,
  Languages,
  Newspaper,
  BookOpen,
  Zap,
  Gamepad2,
  Podcast,
  ShoppingCart,
  UtensilsCrossed,
  Landmark,
  Car,
  FileSpreadsheet,
  Globe2,
  Home,
  PlaySquare,
  Clapperboard,
  Disc3,
  Radio,
} from 'lucide-react';
import type { AppId } from '../types/os';

export interface AppThemeMeta {
  bg: string;
  accent: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export const APP_META: Record<AppId, AppThemeMeta> = {
  phone: { bg: 'from-emerald-500 to-teal-600', accent: '#10B981', icon: Phone },
  messages: { bg: 'from-violet-500 to-purple-600', accent: '#A78BFA', icon: MessageCircle },
  browser: { bg: 'from-sky-500 to-blue-600', accent: '#38BDF8', icon: Compass },
  camera: { bg: 'from-zinc-700 to-zinc-900', accent: '#71717A', icon: Camera },
  photos: { bg: 'from-pink-500 to-rose-500', accent: '#F472B6', icon: Image },
  characters: { bg: 'from-fuchsia-500 to-purple-600', accent: '#D946EF', icon: Sparkles },
  social: { bg: 'from-rose-500 to-pink-600', accent: '#FB7185', icon: HeartHandshake },
  assistant: { bg: 'from-indigo-500 to-violet-600', accent: '#818CF8', icon: Bot },
  contacts: { bg: 'from-amber-500 to-orange-600', accent: '#F59E0B', icon: Users },
  mail: { bg: 'from-blue-500 to-indigo-600', accent: '#3B82F6', icon: Mail },
  calendar: { bg: 'from-red-500 to-rose-600', accent: '#EF4444', icon: Calendar },
  reminders: { bg: 'from-orange-500 to-amber-600', accent: '#F97316', icon: CheckSquare },
  notes: { bg: 'from-yellow-500 to-amber-500', accent: '#EAB308', icon: FileText },
  files: { bg: 'from-cyan-500 to-sky-600', accent: '#06B6D4', icon: FolderOpen },
  maps: { bg: 'from-teal-500 to-emerald-600', accent: '#14B8A6', icon: MapPin },
  weather: { bg: 'from-sky-400 to-indigo-500', accent: '#38BDF8', icon: CloudSun },
  clock: { bg: 'from-slate-700 to-slate-900', accent: '#64748B', icon: Clock },
  calculator: { bg: 'from-neutral-700 to-neutral-900', accent: '#F59E0B', icon: Calculator },
  music: { bg: 'from-pink-600 to-purple-700', accent: '#EC4899', icon: Music2 },
  video: { bg: 'from-purple-600 to-indigo-700', accent: '#8B5CF6', icon: Film },
  recorder: { bg: 'from-rose-600 to-red-700', accent: '#E11D48', icon: Mic },
  scanner: { bg: 'from-emerald-600 to-cyan-700', accent: '#059669', icon: ScanText },
  appstore: { bg: 'from-blue-600 to-cyan-500', accent: '#2563EB', icon: ShoppingBag },
  settings: { bg: 'from-zinc-600 to-slate-800', accent: '#71717A', icon: Settings },
  health: { bg: 'from-rose-500 to-red-500', accent: '#F43F5E', icon: Activity },
  wallet: { bg: 'from-indigo-600 to-slate-800', accent: '#6366F1', icon: Wallet },
  passwords: { bg: 'from-slate-700 to-zinc-900', accent: '#A78BFA', icon: KeyRound },
  translate: { bg: 'from-cyan-600 to-blue-600', accent: '#0891B2', icon: Languages },
  news: { bg: 'from-orange-600 to-red-600', accent: '#EA580C', icon: Newspaper },
  books: { bg: 'from-amber-600 to-orange-700', accent: '#D97706', icon: BookOpen },
  shortcuts: { bg: 'from-violet-600 to-fuchsia-600', accent: '#7C3AED', icon: Zap },
  games: { bg: 'from-purple-500 to-pink-500', accent: '#C084FC', icon: Gamepad2 },
  podcast: { bg: 'from-purple-600 to-fuchsia-600', accent: '#9333EA', icon: Podcast },
  shopping: { bg: 'from-orange-500 to-rose-500', accent: '#F97316', icon: ShoppingCart },
  food: { bg: 'from-emerald-500 to-lime-600', accent: '#10B981', icon: UtensilsCrossed },
  banking: { bg: 'from-[#E14B5A] to-[#B8283B]', accent: '#E14B5A', icon: Landmark },
  ride: { bg: 'from-teal-500 to-cyan-600', accent: '#0D9488', icon: Car },
  office: { bg: 'from-sky-600 to-blue-700', accent: '#0284C7', icon: FileSpreadsheet },
  community: { bg: 'from-indigo-500 to-purple-600', accent: '#6366F1', icon: Globe2 },
  smarthome: { bg: 'from-amber-500 to-yellow-600', accent: '#D97706', icon: Home },
  youtube: { bg: 'from-red-600 to-rose-700', accent: '#EF4444', icon: PlaySquare },
  movies: { bg: 'from-slate-800 to-indigo-900', accent: '#6366F1', icon: Clapperboard },
  musichub: { bg: 'from-emerald-500 to-cyan-600', accent: '#10B981', icon: Disc3 },
  telecom: { bg: 'from-indigo-600 via-purple-600 to-pink-500', accent: '#8B5CF6', icon: Radio },
};

export function AppIconTile({
  appId,
  size = 'md',
  iconScale = 'medium',
  badge = 0,
}: {
  appId: AppId;
  size?: 'sm' | 'md' | 'lg';
  iconScale?: 'compact' | 'medium' | 'large';
  badge?: number;
}) {
  const meta = APP_META[appId] || APP_META.settings;
  const Icon = meta.icon;
  const mdSize =
    iconScale === 'compact'
      ? 'w-11 h-11 rounded-[14px]'
      : iconScale === 'large'
        ? 'w-14 h-14 rounded-[18px]'
        : 'w-[52px] h-[52px] rounded-[16px]';
  const sizeClass =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl'
      : size === 'lg'
        ? 'w-16 h-16 rounded-[20px]'
        : mdSize;
  const mdIcon =
    iconScale === 'compact' ? 'w-5 h-5' : iconScale === 'large' ? 'w-7 h-7' : 'w-6 h-6';
  const iconClass =
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : mdIcon;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <div
        className={`${sizeClass} bg-gradient-to-br ${meta.bg} flex items-center justify-center text-white shadow-md shadow-black/20 ring-1 ring-white/15 transition-transform duration-150`}
      >
        <Icon className={iconClass} strokeWidth={1.9} />
      </div>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono-num flex items-center justify-center ring-2 ring-black/30">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </div>
  );
}
