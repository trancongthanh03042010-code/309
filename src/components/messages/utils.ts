import type React from 'react';
import type { Character, ChatMessage, ResponseTuningOptions } from '../../types/os';

export function normalizeVi(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function safeJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return 'Hôm qua';
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return 'Hôm nay';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return 'Hôm qua';
  }
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isSameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getMessagePreviewText(msg?: ChatMessage): string {
  if (!msg) return 'Bắt đầu cuộc trò chuyện';
  if (msg.deleted_at) return 'Tin nhắn đã bị xóa';
  switch (msg.msg_type) {
    case 'image':
      return msg.content ? `[Hình ảnh] ${msg.content}` : '[Hình ảnh]';
    case 'video':
      return '[Video]';
    case 'voice':
      return '[Tin nhắn thoại]';
    case 'sticker':
      return msg.content?.startsWith('[GIF]') ? msg.content : `[Sticker] ${msg.content || ''}`;
    case 'location':
      return '[Vị trí đã chia sẻ]';
    case 'contact':
      return '[Danh thiếp]';
    case 'file':
      return `[Tệp] ${msg.content || 'Tài liệu'}`;
    case 'event':
      return `[Sự kiện] ${msg.content || ''}`;
    default:
      return msg.content || 'Tin nhắn mới';
  }
}

export function isGifAttachment(att: Record<string, unknown>): boolean {
  return att?.kind === 'gif' || typeof att?.gifId === 'string';
}

export function getCharacterScheduleActivity(char: Character | undefined): string {
  if (!char) return '';
  const items = safeJson<Array<{ time: string; activity: string }>>(char.schedule_json, []);
  if (items.length === 0) return char.activity_status || char.mood || 'Đang trực tuyến';
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  let best = items[0];
  let bestDiff = Infinity;
  for (const item of items) {
    const [h, m] = (item.time || '').split(':').map(Number);
    if (Number.isNaN(h)) continue;
    const mins = h * 60 + (m || 0);
    const diff = curMin >= mins ? curMin - mins : curMin + 1440 - mins;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  return best?.activity || char.activity_status || char.mood || 'Đang trực tuyến';
}

export interface TextToken {
  type: 'text' | 'italic' | 'mention' | 'url';
  value: string;
}

export function parseFormattedTokens(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const regex = /(https?:\/\/[^\s]+|\*[^*\n]+\*|@[\p{L}\p{N}_-]+(?:\s[\p{L}\p{N}_-]+)?)/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      tokens.push({ type: 'url', value: raw });
    } else if (raw.startsWith('*') && raw.endsWith('*') && raw.length > 2) {
      tokens.push({ type: 'italic', value: raw.slice(1, -1) });
    } else if (raw.startsWith('@')) {
      tokens.push({ type: 'mention', value: raw });
    } else {
      tokens.push({ type: 'text', value: raw });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return tokens;
}

export interface ConversationSettings {
  fontSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  enterToSend: boolean;
  hideMetersInRoleplay: boolean;
  responseLanguage?: string;
  tuning?: ResponseTuningOptions;
}

export const DEFAULT_TUNING: ResponseTuningOptions = {
  length: 'medium',
  detail: 'balanced',
  humor: 'balanced',
  proactivity: 'medium',
  narration: 'chat',
  pronouns: '',
  language: 'vi',
};

export const DEFAULT_CONV_SETTINGS: ConversationSettings = {
  fontSize: 'medium',
  soundEnabled: true,
  notificationsEnabled: true,
  enterToSend: true,
  hideMetersInRoleplay: false,
  responseLanguage: 'vi',
  tuning: DEFAULT_TUNING,
};

export interface RoleplayState {
  active: boolean;
  paused: boolean;
  genre: string;
  scenario: string;
  userRole: string;
  aiRole: string;
  moodTone: string;
  sceneTitle: string;
}

export const DEFAULT_ROLEPLAY_STATE: RoleplayState = {
  active: false,
  paused: false,
  genre: 'Đời thường',
  scenario: '',
  userRole: '',
  aiRole: '',
  moodTone: 'Nhẹ nhàng, tự nhiên',
  sceneTitle: '',
};

// Full 14 DokiChat Discovery Topics (matching Section III.5 + IV.2)
export const CHARACTER_GENRES = [
  'Anime',
  'Romance',
  'Fantasy',
  'School Life',
  'Slice of Life',
  'Adventure',
  'Mystery',
  'Horror',
  'Drama',
  'Comedy',
  'Action',
  'Roleplay',
  'Original Characters',
  'Custom AI',
];

export const DISCOVERY_TOPICS: Array<{
  id: string;
  label: string;
  subtitle: string;
  gradient: string;
  synonyms: string[];
}> = [
  { id: 'Anime', label: 'Anime', subtitle: 'Phong cách Nhật Bản', gradient: 'from-violet-500/20 to-fuchsia-500/20', synonyms: ['anime'] },
  { id: 'Romance', label: 'Romance', subtitle: 'Ngọt ngào & Rung động', gradient: 'from-pink-500/20 to-rose-500/20', synonyms: ['romance', 'lang man'] },
  { id: 'Fantasy', label: 'Fantasy', subtitle: 'Phép thuật & Thế giới khác', gradient: 'from-indigo-500/20 to-purple-500/20', synonyms: ['fantasy', 'huyen huyen'] },
  { id: 'School Life', label: 'School Life', subtitle: 'Thanh xuân học đường', gradient: 'from-sky-500/20 to-indigo-500/20', synonyms: ['school life', 'school', 'hoc duong'] },
  { id: 'Slice of Life', label: 'Slice of Life', subtitle: 'Nhẹ nhàng đời thường', gradient: 'from-emerald-500/20 to-teal-500/20', synonyms: ['slice of life', 'doi thuong'] },
  { id: 'Adventure', label: 'Adventure', subtitle: 'Thám hiểm kỳ thú', gradient: 'from-amber-500/20 to-orange-500/20', synonyms: ['adventure', 'phieu luu'] },
  { id: 'Mystery', label: 'Mystery', subtitle: 'Bí ẩn & Trinh thám', gradient: 'from-slate-500/25 to-violet-500/20', synonyms: ['mystery', 'trinh tham', 'bi an'] },
  { id: 'Horror', label: 'Horror', subtitle: 'Kinh dị & Rùng rợn', gradient: 'from-rose-900/30 to-zinc-800/30', synonyms: ['horror', 'kinh di'] },
  { id: 'Drama', label: 'Drama', subtitle: 'Cao trào cảm xúc', gradient: 'from-purple-600/20 to-rose-500/20', synonyms: ['drama', 'kich tinh'] },
  { id: 'Comedy', label: 'Comedy', subtitle: 'Vui nhộn & Hài hước', gradient: 'from-yellow-500/20 to-pink-500/20', synonyms: ['comedy', 'hai huoc'] },
  { id: 'Action', label: 'Action', subtitle: 'Hành động kịch tính', gradient: 'from-red-500/20 to-amber-500/20', synonyms: ['action', 'hanh dong'] },
  { id: 'Roleplay', label: 'Roleplay', subtitle: 'Nhập vai tương tác sâu', gradient: 'from-violet-600/20 to-cyan-500/20', synonyms: ['roleplay', 'nhap vai'] },
  { id: 'Original Characters', label: 'Original Characters', subtitle: 'Nguyên bản YumeChat', gradient: 'from-fuchsia-500/20 to-violet-500/20', synonyms: ['original characters', 'oc'] },
  { id: 'Custom AI', label: 'Custom AI', subtitle: 'Nhân vật tự tạo', gradient: 'from-teal-500/20 to-violet-500/20', synonyms: ['custom ai', 'custom', 'tu tao'] },
];

export function characterMatchesGenre(char: Character, topicOrGenre: string): boolean {
  const target = normalizeVi(topicOrGenre);
  if (!target) return true;
  if (target === 'custom ai' && char.is_custom === 1) return true;
  const topicMeta = DISCOVERY_TOPICS.find((t) => normalizeVi(t.id) === target);
  const terms = topicMeta ? topicMeta.synonyms : [target];
  const genres = safeJson<string[]>(char.genres_json, []).map((g) => normalizeVi(g));
  const combined = `${genres.join(' ')} ${normalizeVi(char.tagline)} ${normalizeVi(char.personality)}`;
  return terms.some((t) => genres.includes(t) || combined.includes(t));
}

export const DOKI_EMOTION_META: Record<string, { color: string; bg: string }> = {
  'Vui vẻ': { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100/80 dark:bg-amber-950/50' },
  'Buồn': { color: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-100/80 dark:bg-sky-950/50' },
  'Giận': { color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100/80 dark:bg-rose-950/50' },
  'Ngại ngùng': { color: 'text-pink-700 dark:text-pink-300', bg: 'bg-pink-100/80 dark:bg-pink-950/50' },
  'Bối rối': { color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100/80 dark:bg-indigo-950/50' },
  'Hào hứng': { color: 'text-fuchsia-700 dark:text-fuchsia-300', bg: 'bg-fuchsia-100/80 dark:bg-fuchsia-950/50' },
  'Lo lắng': { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100/80 dark:bg-orange-950/50' },
  'Ghen tuông': { color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100/80 dark:bg-purple-950/50' },
  'Thất vọng': { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-200/80 dark:bg-slate-800/70' },
  'Bình tĩnh': { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100/80 dark:bg-emerald-950/50' },
  'Quan tâm': { color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-100/80 dark:bg-violet-950/50' },
  'Bất ngờ': { color: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-100/80 dark:bg-cyan-950/50' },
};

export function getEmotionStyle(emotion?: string): { color: string; bg: string } {
  const key = (emotion || '').split('·')[0].trim();
  return DOKI_EMOTION_META[key] || {
    color: 'text-violet-700 dark:text-violet-300',
    bg: 'bg-violet-100/70 dark:bg-violet-950/40',
  };
}

export const RELATIONSHIP_MILESTONES: Array<{ level: number; stage: string; reward: string }> = [
  { level: 1, stage: 'Người quen mới', reward: 'Mở khóa trò chuyện đời thường & nhật ký cảm xúc' },
  { level: 2, stage: 'Bạn bè', reward: 'Nhân vật chủ động hỏi thăm theo lịch trình hằng ngày' },
  { level: 3, stage: 'Thân thiết', reward: 'Mở khóa xưng hô thân mật & gọi thoại AI biểu cảm' },
  { level: 4, stage: 'Đặc biệt', reward: 'Nhân vật ghi nhớ sâu các sự kiện & thói quen của bạn' },
  { level: 5, stage: 'Gắn kết sâu sắc', reward: 'Mở khóa toàn bộ nhánh cốt truyện nhập vai bí mật' },
];

export function makeFallbackAvatarDataUrl(label?: string): string {
  const ch = (label || 'AI').trim().charAt(0).toUpperCase() || 'A';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><text x="64" y="78" text-anchor="middle" font-family="sans-serif" font-size="52" font-weight="700" fill="#ffffff">${ch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function handleCharImgError(
  e: React.SyntheticEvent<HTMLImageElement>,
  fallbackLabel?: string
): void {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = makeFallbackAvatarDataUrl(fallbackLabel);
}

export const CHARACTER_AVATARS = [
  { label: 'Yuki', url: '/src/assets/images/char_yuki_1794880089308.jpg' },
  { label: 'Akira', url: '/src/assets/images/char_akira_1794880089961.jpg' },
  { label: 'Sakura', url: '/src/assets/images/char_sakura_1794880090451.jpg' },
  { label: 'Rin', url: '/src/assets/images/char_rin_1794880090553.jpg' },
  { label: 'Haruto', url: '/src/assets/images/char_haruto_detective_1795088464373.jpg' },
  { label: 'Lena', url: '/src/assets/images/char_lena_starlight_1795088463461.jpg' },
  { label: 'Sora', url: '/src/assets/images/char_sora_orbit_1795088463278.jpg' },
  { label: 'Momo', url: '/src/assets/images/char_momo_bakery_1795088463375.jpg' },
  { label: 'Ren', url: '/src/assets/images/char_ren_idol_1795088463885.jpg' },
  { label: 'Kaito', url: '/src/assets/images/char_kaito_athlete_1795088463135.jpg' },
  { label: 'Ryo', url: '/src/assets/images/char_ryo_ceo_1795088463672.jpg' },
  { label: 'Leon', url: '/src/assets/images/char_leon_knight_1795088462669.jpg' },
  { label: 'Rei', url: '/src/assets/images/char_rei_cyber_1795088463021.jpg' },
  { label: 'Hinata', url: '/src/assets/images/char_hinata_cafe_1795088463551.jpg' },
  { label: 'Mei', url: '/src/assets/images/char_mei_doctor_1795088463729.jpg' },
  { label: 'Kaede', url: '/src/assets/images/char_kaede_kendo_1795088464222.jpg' },
];

export const CHAT_WALLPAPERS = [
  { id: 'default', label: 'Mặc định', value: '' },
  { id: 'aurora', label: 'Cực quang Tím', value: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg' },
  { id: 'sakura', label: 'Hoàng hôn Sakura', value: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg' },
  { id: 'lavender_mist', label: 'Sương Lavender', value: 'linear-gradient(155deg, #f3e8ff 0%, #fce7f3 50%, #ede9fe 100%)' },
  { id: 'midnight', label: 'Đêm xanh thẳm', value: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)' },
  { id: 'warm', label: 'Nắng ấm dịu', value: 'linear-gradient(180deg, #fef3c7 0%, #fce7f3 100%)' },
];

export const BUBBLE_COLORS = [
  { label: 'Tím Iris', value: '#7C3AED' },
  { label: 'Hồng Sakura', value: '#EC4899' },
  { label: 'Oải Hương', value: '#8B5CF6' },
  { label: 'Xanh iOS', value: '#007AFF' },
  { label: 'Ngọc Lục Bảo', value: '#059669' },
  { label: 'Xám Than', value: '#3F3F46' },
];

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export const FULL_EMOJIS = [
  '😊', '🥰', '😂', '🥺', '😭', '😡', '🤔', '😴',
  '✨', '❤️', '💜', '🫶', '👍', '👏', '🙏', '🔥',
  '🌸', '🌧️', '☕', '🎧', '📸', '🌙', '⭐', '🎉',
];

export interface StickerItem {
  id: string;
  label: string;
  bg: string;
  accent: string;
  face: 'happy' | 'love' | 'cry' | 'cool' | 'sleepy' | 'sparkle' | 'shock' | 'hug';
}

export interface StickerPack {
  id: string;
  name: string;
  items: StickerItem[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'mochi_emotions',
    name: 'Mochi Cảm Xúc',
    items: [
      { id: 'stk_hi', label: 'Chào nè!', bg: '#EDE9FE', accent: '#7C3AED', face: 'happy' },
      { id: 'stk_love', label: 'Thương lắm', bg: '#FCE7F3', accent: '#DB2777', face: 'love' },
      { id: 'stk_hug', label: 'Ôm cái nào', bg: '#FFEDD5', accent: '#EA580C', face: 'hug' },
      { id: 'stk_sparkle', label: 'Tuyệt vời!', bg: '#FEF3C7', accent: '#D97706', face: 'sparkle' },
      { id: 'stk_cry', label: 'Huhu buồn quá', bg: '#E0F2FE', accent: '#0284C7', face: 'cry' },
      { id: 'stk_cool', label: 'Quá đỉnh', bg: '#ECFDF5', accent: '#059669', face: 'cool' },
      { id: 'stk_sleep', label: 'Ngủ ngon nha', bg: '#E0E7FF', accent: '#4338CA', face: 'sleepy' },
      { id: 'stk_shock', label: 'Ủa thật hả?!', bg: '#FEE2E2', accent: '#DC2626', face: 'shock' },
    ],
  },
  {
    id: 'chibi_reactions',
    name: 'Chibi Đời Thường',
    items: [
      { id: 'stk_coffee', label: 'Uống trà chiều', bg: '#FEF9C3', accent: '#B45309', face: 'happy' },
      { id: 'stk_cheer', label: 'Cố lên nhé!', bg: '#DCFCE7', accent: '#15803D', face: 'sparkle' },
      { id: 'stk_shy', label: 'Ngại quá đi', bg: '#FFE4E6', accent: '#E11D48', face: 'love' },
      { id: 'stk_ok', label: 'Nhất trí luôn', bg: '#DBEAFE', accent: '#1D4ED8', face: 'cool' },
    ],
  },
];

export const ALL_STICKERS = STICKER_PACKS.flatMap((p) => p.items);

export interface GifReactionItem {
  id: string;
  label: string;
  caption: string;
  gradient: string;
  accent: string;
  anim: 'pulse' | 'bounce' | 'float' | 'wiggle';
  symbol: string;
}

export const GIF_CATALOG: GifReactionItem[] = [
  { id: 'gif_ohayo', label: 'Chào buổi sáng', caption: 'Ohayo! Ngày mới rạng rỡ nhé', gradient: 'from-violet-500 to-pink-400', accent: '#F472B6', anim: 'float', symbol: '☀️' },
  { id: 'gif_blush', label: 'Đỏ mặt ngại ngùng', caption: 'Ơ kìa... làm người ta ngại quá', gradient: 'from-pink-500 to-rose-400', accent: '#FB7185', anim: 'pulse', symbol: '🌸' },
  { id: 'gif_clap', label: 'Vỗ tay hoan hô', caption: 'Tuyệt đỉnh luôn!', gradient: 'from-amber-400 to-pink-500', accent: '#FBBF24', anim: 'bounce', symbol: '👏' },
  { id: 'gif_heart', label: 'Bắn tim lung linh', caption: 'Gửi ngàn trái tim tới bạn', gradient: 'from-fuchsia-500 to-purple-600', accent: '#E879F9', anim: 'pulse', symbol: '💖' },
  { id: 'gif_wow', label: 'Ngạc nhiên cực độ', caption: 'Thật không thể tin nổi!', gradient: 'from-cyan-500 to-indigo-500', accent: '#38BDF8', anim: 'bounce', symbol: '✨' },
  { id: 'gif_tea', label: 'Thư giãn uống trà', caption: 'Nghỉ ngơi một chút thôi', gradient: 'from-emerald-500 to-teal-500', accent: '#34D399', anim: 'float', symbol: '🍵' },
  { id: 'gif_sleepy', label: 'Buồn ngủ gật', caption: 'Chúc ngủ ngon mơ đẹp nha', gradient: 'from-indigo-600 to-slate-800', accent: '#818CF8', anim: 'float', symbol: '🌙' },
  { id: 'gif_pout', label: 'Giận dỗi đáng yêu', caption: 'Hứ, không thèm nói nữa đâu!', gradient: 'from-rose-500 to-orange-500', accent: '#FB923C', anim: 'wiggle', symbol: '💢' },
];

