import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Image as ImageIcon,
  Layers,
  MapPin,
  MessageCircle,
  MessageSquareQuote,
  Phone,
  Share2,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  Video,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AiRelationshipRecord, Character, RelationshipEventRecord } from '../../types/os';
import {
  formatRelativeTime,
  getCharacterScheduleActivity,
  getEmotionStyle,
  handleCharImgError,
  RELATIONSHIP_MILESTONES,
  safeJson,
} from './utils';
import { osApi } from '../../services/api';

interface CharacterProfileViewProps {
  character: Character;
  allCharacters?: Character[];
  hasExistingConversation?: boolean;
  relationship?: AiRelationshipRecord;
  relationshipEvents: RelationshipEventRecord[];
  onBack: () => void;
  onStartChat: (char: Character) => void;
  onStartChatWithStarter?: (char: Character, starterText: string) => void;
  onOpenRelatedProfile?: (char: Character) => void;
  onStartCall: (char: Character, isVideo: boolean) => void;
  onEditCharacter: (char: Character) => void;
  onShareCharacter: (char: Character) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRegisterOverlayBack?: (closer: (() => boolean) | null) => void;
}

interface GalleryItem {
  url: string;
  caption?: string;
  scene?: string;
}

interface StorylineItem {
  title: string;
  summary: string;
  hook?: string;
}

interface RelatedCharEntry {
  id?: string;
  name?: string;
  relation?: string;
}

function SectionCard({
  title,
  icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="doki-glass rounded-3xl overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-violet-500/5 transition-colors"
      >
        <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          {icon}
          <span>{title}</span>
          {badge && (
            <span className="px-2 py-0.5 rounded-lg bg-violet-100/80 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[10px] font-semibold">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-0.5 space-y-2.5">{children}</div>}
    </div>
  );
}

export function CharacterProfileView({
  character,
  allCharacters = [],
  hasExistingConversation = false,
  relationship,
  relationshipEvents,
  onBack,
  onStartChat,
  onStartChatWithStarter,
  onOpenRelatedProfile,
  onStartCall,
  onEditCharacter,
  onShareCharacter,
  onRefreshData,
  onShowToast,
  onRegisterOverlayBack,
}: CharacterProfileViewProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Nội dung không phù hợp');
  const [reportDetail, setReportDetail] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);

  useEffect(() => {
    setShowSecret(false);
    setLightboxItem(null);
    setLightboxZoomed(false);
  }, [character.id]);

  useEffect(() => {
    if (!onRegisterOverlayBack) return;
    onRegisterOverlayBack(() => {
      if (lightboxItem) {
        setLightboxItem(null);
        setLightboxZoomed(false);
        return true;
      }
      if (reportOpen) {
        setReportOpen(false);
        return true;
      }
      return false;
    });
    return () => onRegisterOverlayBack(null);
  }, [lightboxItem, reportOpen, onRegisterOverlayBack]);

  const bg = safeJson<{ occupation?: string; origin?: string; dailyRoutine?: string }>(character.background_json, {});
  const pObj = safeJson<{ traits?: string[]; values?: string; flaws?: string; boundaries?: string[] }>(character.personality_json, {});
  const genres = safeJson<string[]>(character.genres_json, []);
  const samples = safeJson<Array<{ user: string; ai: string }>>(character.sample_dialogues_json, []);
  const catchphrases = safeJson<string[]>(character.catchphrases_json, []);
  const starters = safeJson<string[]>(character.conversation_starters_json, []);
  const hangoutSpots = safeJson<string[]>(character.hangout_spots_json, []);
  const storylines = safeJson<StorylineItem[]>(character.storylines_json, []);
  const scheduleItems = safeJson<Array<{ time: string; activity: string }>>(character.schedule_json, []);

  const galleryItems = useMemo<GalleryItem[]>(() => {
    const raw = safeJson<Array<GalleryItem | string>>(character.gallery_json, []);
    const list: GalleryItem[] = [];
    const seenUrls = new Set<string>();
    const addItem = (item: GalleryItem) => {
      if (!item.url) return;
      if (seenUrls.has(item.url) && !item.caption && !item.scene) return;
      seenUrls.add(item.url);
      list.push(item);
    };
    for (const r of raw) {
      if (typeof r === 'string') {
        addItem({ url: r, scene: 'Khoảnh khắc nhân vật' });
      } else if (r && typeof r === 'object' && r.url) {
        addItem(r);
      }
    }
    if (list.length === 0) {
      addItem({
        url: character.avatar,
        caption: character.tagline || `${character.name} — Chân dung nhân vật`,
        scene: character.living_place || 'Chân dung chính',
      });
      if (character.cover_image && character.cover_image !== character.avatar) {
        addItem({
          url: character.cover_image,
          caption: character.scenario || 'Ảnh bìa không gian sống',
          scene: 'Ảnh bìa nhân vật',
        });
      }
    }
    return list;
  }, [character]);

  const relatedEntries = useMemo(() => {
    const rawA = safeJson<Array<RelatedCharEntry | string>>(character.related_characters_json, []);
    const rawB = safeJson<Array<RelatedCharEntry | string>>(character.other_relations_json, []);
    const merged = [...rawA, ...rawB];
    const seen = new Set<string>();
    const result: Array<{ entry: RelatedCharEntry; targetChar?: Character }> = [];
    for (const item of merged) {
      const entry: RelatedCharEntry =
        typeof item === 'string' ? { name: item } : { id: item?.id, name: item?.name, relation: item?.relation };
      const key = (entry.id || entry.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const targetChar = allCharacters.find(
        (c) =>
          c.id !== character.id &&
          ((entry.id && c.id === entry.id) ||
            (entry.name && c.name.toLowerCase().includes(entry.name.toLowerCase())))
      );
      result.push({ entry, targetChar });
    }
    return result;
  }, [character.id, character.related_characters_json, character.other_relations_json, allCharacters]);

  const emotionStyle = getEmotionStyle(character.mood);
  const charEvents = relationshipEvents.filter((e) => e.character_id === character.id).slice(0, 6);
  const currentRelLevel = character.relationship_level || 1;
  const currentRelXp = character.relationship_xp ?? 0;

  const genderLabel =
    character.gender === 'male' ? 'Nam' : character.gender === 'female' ? 'Nữ' : character.gender || 'Tự do';

  const toggleFavorite = async () => {
    const next = character.is_favorite ? 0 : 1;
    await osApi.updateCharacter(character.id, { is_favorite: next });
    await onRefreshData();
    onShowToast(character.name, next ? 'Đã thêm vào Yêu thích' : 'Đã bỏ Yêu thích', 'success');
  };

  const handleDuplicate = async () => {
    const cloned = await osApi.messagesV3.duplicateCharacter(character.id);
    await onRefreshData();
    onShowToast('Đã nhân bản', `Tạo bản sao "${cloned.name}" để bạn tùy chỉnh.`, 'success');
    onEditCharacter(cloned);
  };

  const handleHide = async () => {
    await osApi.messagesV3.updateCharacterV3(character.id, { is_hidden: 1 });
    await onRefreshData();
    onShowToast(character.name, 'Đã ẩn khỏi Khám phá');
    onBack();
  };

  const handleBlock = async () => {
    await osApi.messagesV3.updateCharacterV3(character.id, { is_blocked: 1 });
    await onRefreshData();
    onShowToast(character.name, 'Đã chặn nhân vật này');
    onBack();
  };

  const submitReport = async () => {
    await osApi.messagesV3.reportCharacter(character.id, reportReason, reportDetail);
    setReportOpen(false);
    setReportDetail('');
    onShowToast('Đã gửi báo cáo', 'Cảm ơn phản hồi của bạn.', 'success');
  };

  const basicFacts: Array<[string, string | undefined | number]> = [
    ['Họ và tên', character.full_name || character.name],
    ['Biệt danh', character.nickname],
    ['Sinh nhật', character.birthday],
    ['Tuổi & Giới tính', `${character.age || 20} tuổi · ${genderLabel}`],
    ['Cung hoàng đạo', character.zodiac],
    ['Chiều cao / Dáng', [character.height, character.body_type].filter(Boolean).join(' · ')],
    ['Màu & Kiểu tóc', [character.hair_color, character.hair_style].filter(Boolean).join(' · ')],
    ['Màu mắt', character.eye_color],
    ['Trang phục đặc trưng', character.outfit_style],
    ['Nghề nghiệp / Vai trò', character.occupation || bg.occupation || character.role_title],
    ['Nơi sống / Xuất thân', [character.living_place, bg.origin].filter(Boolean).join(' · ')],
    ['Tác giả', character.author || 'YumeChat Studio'],
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      {/* 1. PHẦN ĐẦU HỒ SƠ (HEADER + COVER + CTA) */}
      <div className="relative h-48 shrink-0 overflow-hidden bg-zinc-900">
        <img
          src={character.cover_image || character.avatar}
          alt={character.name}
          onError={(e) => handleCharImgError(e, character.name)}
          className="w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25" />

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-black/45 backdrop-blur-md text-white flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFavorite}
              className={`min-h-[44px] min-w-[44px] rounded-2xl bg-black/45 backdrop-blur-md flex items-center justify-center ${
                character.is_favorite ? 'text-pink-400' : 'text-white'
              }`}
              title="Yêu thích"
            >
              <Heart className={`w-4 h-4 ${character.is_favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onShareCharacter(character)}
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-black/45 backdrop-blur-md text-white flex items-center justify-center"
              title="Chia sẻ nhân vật"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
          <img
            src={character.avatar}
            alt={character.name}
            onError={(e) => handleCharImgError(e, character.name)}
            className="w-20 h-20 rounded-3xl object-cover ring-4 ring-white/90 dark:ring-zinc-900 shadow-xl shrink-0"
          />
          <div className="min-w-0 flex-1 text-white pb-0.5 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-display text-lg font-bold truncate">{character.name}</h2>
              {character.nickname && character.nickname !== character.name && (
                <span className="text-[11px] text-violet-200 font-medium">({character.nickname})</span>
              )}
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${emotionStyle.bg} ${emotionStyle.color}`}>
                {character.mood?.split('·')[0] || 'Bình tĩnh'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-200 truncate">
              {character.occupation || character.role_title || 'Bạn đồng hành AI'} · {genderLabel}, {character.age || 20} tuổi · {character.interactions_count} lượt
            </p>
            <p className="text-[11px] text-emerald-300 truncate font-medium">
              ● {getCharacterScheduleActivity(character)}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable 8-Section Deep Profile */}
      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-3">
        {/* Tagline & Genres Summary */}
        <div className="doki-glass rounded-3xl p-3.5 space-y-2.5 text-xs">
          {character.tagline && (
            <p className="text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">
              {character.tagline}
            </p>
          )}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-1 rounded-xl bg-violet-100/85 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[11px] font-medium"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Primary CTA Row */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onStartChat(character)}
              className="col-span-2 min-h-[44px] py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{hasExistingConversation ? 'Tiếp tục trò chuyện' : 'Bắt đầu trò chuyện'}</span>
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onStartCall(character, false)}
                className="min-h-[44px] rounded-2xl bg-white/80 dark:bg-zinc-900/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-900/40"
                title="Gọi thoại AI"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(character, true)}
                className="min-h-[44px] rounded-2xl bg-white/80 dark:bg-zinc-900/70 text-violet-600 dark:text-violet-400 flex items-center justify-center border border-violet-200/50 dark:border-violet-900/40"
                title="Gọi Video Avatar AI"
              >
                <Video className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. THÔNG TIN CƠ BẢN */}
        <SectionCard
          title="Thông tin cơ bản"
          icon={<User className="w-4 h-4 text-violet-500" />}
          defaultOpen
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {basicFacts
              .filter(([, val]) => Boolean(val && String(val).trim()))
              .map(([label, val]) => (
                <div
                  key={label}
                  className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/70"
                >
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">{label}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{val}</span>
                </div>
              ))}
          </div>
        </SectionCard>

        {/* 3. TÍNH CÁCH & TÂM LÝ */}
        <SectionCard
          title="Tính cách & Tâm lý"
          icon={<Sparkles className="w-4 h-4 text-pink-500" />}
          defaultOpen
        >
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{character.personality}</p>
          {pObj.traits && pObj.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pObj.traits.map((tr) => (
                <span
                  key={tr}
                  className="px-2.5 py-1 rounded-xl bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 text-[11px] font-medium"
                >
                  {tr}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {pObj.values && (
              <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
                <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 block">Giá trị sống</span>
                <p className="text-zinc-700 dark:text-zinc-300">{pObj.values}</p>
              </div>
            )}
            {(character.goals || character.fears || pObj.flaws) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {character.goals && (
                  <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">Mục tiêu</span>
                    <p className="text-zinc-700 dark:text-zinc-300">{character.goals}</p>
                  </div>
                )}
                {(character.fears || pObj.flaws) && (
                  <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">Nỗi sợ & Điểm yếu</span>
                    <p className="text-zinc-700 dark:text-zinc-300">{[character.fears, pObj.flaws].filter(Boolean).join(' · ')}</p>
                  </div>
                )}
              </div>
            )}
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60 space-y-1">
              <p className="text-zinc-700 dark:text-zinc-300">
                <strong className="text-emerald-600 dark:text-emerald-400">Yêu thích:</strong> {character.likes}
              </p>
              {character.dislikes && (
                <p className="text-zinc-700 dark:text-zinc-300">
                  <strong className="text-rose-600 dark:text-rose-400">Không thích:</strong> {character.dislikes}
                </p>
              )}
              {character.emotional_behavior && (
                <p className="text-zinc-600 dark:text-zinc-400">
                  <strong>Phản ứng cảm xúc:</strong> {character.emotional_behavior}
                </p>
              )}
              {pObj.boundaries && pObj.boundaries.length > 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  <strong>Giới hạn:</strong> {pObj.boundaries.join(' · ')}
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* 4. TIỂU SỬ & CỐT TRUYỆN */}
        <SectionCard
          title="Tiểu sử & Cốt truyện"
          icon={<BookOpen className="w-4 h-4 text-indigo-500" />}
          defaultOpen
        >
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{character.bio}</p>
          {character.past_story && (
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block">Quá khứ</span>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{character.past_story}</p>
            </div>
          )}
          {character.family_relations && (
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 block">Gia đình & Mối liên hệ</span>
              <p className="text-zinc-700 dark:text-zinc-300">{character.family_relations}</p>
            </div>
          )}
          {character.turning_events && (
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">Bước ngoặt cuộc đời</span>
              <p className="text-zinc-700 dark:text-zinc-300">{character.turning_events}</p>
            </div>
          )}
          {character.long_term_goal && (
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">Ước mơ dài hạn</span>
              <p className="text-zinc-700 dark:text-zinc-300">{character.long_term_goal}</p>
            </div>
          )}
          {character.world_rules && (
            <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/60">
              <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 block">Quy tắc thế giới</span>
              <p className="text-zinc-700 dark:text-zinc-300">{character.world_rules}</p>
            </div>
          )}
          <div className="p-3 rounded-2xl bg-white/75 dark:bg-zinc-900/60 space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-500 block">Bối cảnh gặp gỡ & Lời chào đầu</span>
            <p className="text-zinc-700 dark:text-zinc-300">{character.scenario}</p>
            <p className="italic text-violet-700 dark:text-violet-300">“{character.greeting}”</p>
          </div>
          {character.secrets && (
            <div className="p-3 rounded-2xl bg-rose-50/80 dark:bg-rose-950/35 border border-rose-200/70 dark:border-rose-900/50 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Bí mật ẩn giấu (Spoiler)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="px-2.5 py-1 rounded-xl bg-white/80 dark:bg-zinc-900 text-rose-600 dark:text-rose-300 text-[10px] font-semibold flex items-center gap-1"
                >
                  {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showSecret ? 'Ẩn bí mật' : 'Mở xem bí mật'}</span>
                </button>
              </div>
              {showSecret ? (
                <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed">{character.secrets}</p>
              ) : (
                <p className="text-[11px] text-zinc-500 italic">Nhấn “Mở xem bí mật” nếu bạn muốn biết trước tình tiết ẩn.</p>
              )}
            </div>
          )}
        </SectionCard>

        {/* 5. PHONG CÁCH GIAO TIẾP */}
        <SectionCard
          title="Phong cách giao tiếp"
          icon={<MessageSquareQuote className="w-4 h-4 text-sky-500" />}
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Xưng hô</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{character.pronouns || 'Mình - Bạn'}</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Gọi người dùng là</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{character.user_call_name || 'Bạn'}</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Giọng đọc AI</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                <span className="truncate">{character.voice_name || 'Kore'} · {character.voice_style || 'Warm'}</span>
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Nhịp độ & Độ dài</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {character.reply_length_default || 'Vừa phải'} · {character.intimacy_pace || 'Tự nhiên'}
              </span>
            </div>
          </div>

          {character.speaking_style && (
            <p className="text-zinc-700 dark:text-zinc-300">
              <strong>Cách nói chuyện:</strong> {character.speaking_style}
            </p>
          )}
          {character.favorite_topics && (
            <p className="text-zinc-600 dark:text-zinc-400">
              <strong>Chủ đề ưa thích:</strong> {character.favorite_topics}
            </p>
          )}

          {catchphrases.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 block">Câu cửa miệng</span>
              <div className="flex flex-wrap gap-1.5">
                {catchphrases.map((cp) => (
                  <span
                    key={cp}
                    className="px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-[11px] font-medium"
                  >
                    “{cp}”
                  </span>
                ))}
              </div>
            </div>
          )}

          {samples.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 block">Ví dụ hội thoại</span>
              {samples.map((s, idx) => (
                <div key={idx} className="p-2.5 rounded-2xl bg-white/70 dark:bg-zinc-900/55 space-y-1">
                  <p className="text-zinc-500">Bạn: {s.user}</p>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {character.name}: {s.ai}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 6. QUAN HỆ VỚI NGƯỜI DÙNG */}
        <SectionCard
          title="Quan hệ với bạn"
          icon={<Heart className="w-4 h-4 text-rose-500" />}
          badge={relationship?.stage || `Cấp ${currentRelLevel}`}
          defaultOpen
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                Cấp {currentRelLevel} · {relationship?.stage || 'Người quen mới'}
              </span>
              <span className="font-mono-num text-zinc-500">{currentRelXp}/100 XP</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(6, currentRelXp))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
            <div className="p-2 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Tình cảm</span>
              <span className="font-bold text-pink-600 font-mono-num">{relationship?.affection ?? 35}%</span>
            </div>
            <div className="p-2 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Tin tưởng</span>
              <span className="font-bold text-sky-600 font-mono-num">{relationship?.trust ?? 40}%</span>
            </div>
            <div className="p-2 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Thân quen</span>
              <span className="font-bold text-emerald-600 font-mono-num">{relationship?.familiarity ?? 30}%</span>
            </div>
            <div className="p-2 rounded-2xl bg-white/75 dark:bg-zinc-900/60">
              <span className="text-[10px] text-zinc-500 block">Tôn trọng</span>
              <span className="font-bold text-violet-600 font-mono-num">{relationship?.respect ?? 60}%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-zinc-500 block">Lộ trình gắn kết</span>
            {RELATIONSHIP_MILESTONES.map((m) => {
              const unlocked = currentRelLevel >= m.level;
              return (
                <div
                  key={m.level}
                  className={`p-2 rounded-2xl flex items-center justify-between gap-2 text-[11px] ${
                    unlocked
                      ? 'bg-violet-50/85 dark:bg-violet-950/40 text-zinc-800 dark:text-zinc-100'
                      : 'bg-white/50 dark:bg-zinc-900/35 text-zinc-400'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-bold">Cấp {m.level} · {m.stage}</span>
                    <p className="text-[10px] truncate opacity-85">{m.reward}</p>
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 ${unlocked ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {unlocked ? 'Đã mở' : 'Chưa mở'}
                  </span>
                </div>
              );
            })}
          </div>

          {charEvents.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 block">Dấu mốc cảm xúc gần đây</span>
              {charEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0 border-zinc-200/40 dark:border-zinc-800">
                  <div className="min-w-0">
                    <p className="text-zinc-700 dark:text-zinc-300 truncate">{ev.description}</p>
                    <p className="text-[10px] text-zinc-400">
                      {ev.emotion_tag || ev.event_type} · {formatRelativeTime(ev.created_at)}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono-num text-emerald-600 dark:text-emerald-400 shrink-0">
                    +{Math.max(1, ev.affection_delta + ev.trust_delta)} điểm
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 7. THƯ VIỆN ẢNH */}
        <SectionCard
          title="Thư viện ảnh"
          icon={<ImageIcon className="w-4 h-4 text-fuchsia-500" />}
          badge={`${galleryItems.length} ảnh`}
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-2">
            {galleryItems.map((item, idx) => (
              <button
                key={`${item.url}_${idx}`}
                type="button"
                onClick={() => {
                  setLightboxZoomed(false);
                  setLightboxItem(item);
                }}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 text-left"
              >
                <img
                  src={item.url}
                  alt={item.caption || character.name}
                  loading="lazy"
                  onError={(e) => handleCharImgError(e, character.name)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 text-white">
                  {item.scene && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/45 inline-block mb-0.5">
                      {item.scene}
                    </span>
                  )}
                  {item.caption && (
                    <p className="text-[10px] leading-snug line-clamp-2 opacity-95">{item.caption}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* 8. NỘI DUNG MỞ RỘNG */}
        <SectionCard
          title="Nội dung mở rộng"
          icon={<Compass className="w-4 h-4 text-emerald-500" />}
          defaultOpen
        >
          {/* Schedule Timeline */}
          {scheduleItems.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Lịch sinh hoạt trong ngày</span>
              </span>
              <div className="space-y-1">
                {scheduleItems.map((sc, i) => (
                  <div
                    key={`${sc.time}_${i}`}
                    className="flex items-center gap-2.5 p-2 rounded-2xl bg-white/70 dark:bg-zinc-900/55"
                  >
                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-mono-num text-[10px] font-bold shrink-0">
                      {sc.time}
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300">{sc.activity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hangout Spots */}
          {hangoutSpots.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-pink-500" />
                <span>Địa điểm thường lui tới</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {hangoutSpots.map((spot) => (
                  <span
                    key={spot}
                    className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium"
                  >
                    {spot}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Storylines */}
          {storylines.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-violet-500" />
                <span>Nhánh cốt truyện gợi ý</span>
              </span>
              {storylines.map((st, idx) => (
                <div
                  key={`${st.title}_${idx}`}
                  className="p-3 rounded-2xl bg-white/75 dark:bg-zinc-900/60 border border-violet-200/40 dark:border-violet-800/40 space-y-1.5"
                >
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">{st.title}</p>
                  <p className="text-zinc-600 dark:text-zinc-300">{st.summary}</p>
                  {st.hook && <p className="italic text-[11px] text-violet-600 dark:text-violet-300">“{st.hook}”</p>}
                  <button
                    type="button"
                    onClick={() => {
                      const starterText = st.hook || `Mình muốn bắt đầu cốt truyện "${st.title}": ${st.summary}`;
                      if (onStartChatWithStarter) {
                        onStartChatWithStarter(character, starterText);
                      } else {
                        onStartChat(character);
                      }
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-semibold"
                  >
                    Nhập vai nhánh này
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Conversation Starters */}
          {starters.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5 text-sky-500" />
                <span>Gợi ý mở đầu cuộc trò chuyện (Chạm để bắt đầu)</span>
              </span>
              <div className="space-y-1.5">
                {starters.map((starter, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (onStartChatWithStarter) {
                        onStartChatWithStarter(character, starter);
                      } else {
                        onStartChat(character);
                      }
                    }}
                    className="w-full min-h-[44px] p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-900/70 hover:bg-violet-50 dark:hover:bg-violet-950/40 border border-violet-200/50 dark:border-violet-800/40 text-left text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    “{starter}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Related Characters */}
          {relatedEntries.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span>Nhân vật liên quan</span>
              </span>
              <div className="space-y-1.5">
                {relatedEntries.map(({ entry, targetChar }, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-2xl bg-white/75 dark:bg-zinc-900/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {targetChar ? (
                        <img
                          src={targetChar.avatar}
                          alt={targetChar.name}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, targetChar.name)}
                          className="w-9 h-9 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center text-violet-600 shrink-0">
                          <Briefcase className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {targetChar?.name || entry.name}
                        </p>
                        {entry.relation && (
                          <p className="text-[10px] text-zinc-500 truncate">{entry.relation}</p>
                        )}
                      </div>
                    </div>
                    {targetChar && onOpenRelatedProfile && (
                      <button
                        type="button"
                        onClick={() => onOpenRelatedProfile(targetChar)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[11px] font-semibold shrink-0"
                      >
                        Xem hồ sơ
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Secondary Management Actions */}
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => onEditCharacter(character)}
            className="min-h-[44px] py-2 rounded-2xl doki-glass flex flex-col items-center justify-center gap-1"
          >
            <Edit3 className="w-3.5 h-3.5 text-violet-500" />
            <span>Chỉnh sửa</span>
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="min-h-[44px] py-2 rounded-2xl doki-glass flex flex-col items-center justify-center gap-1"
          >
            <Copy className="w-3.5 h-3.5 text-sky-500" />
            <span>Nhân bản</span>
          </button>
          <button
            type="button"
            onClick={handleHide}
            className="min-h-[44px] py-2 rounded-2xl doki-glass flex flex-col items-center justify-center gap-1"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-500" />
            <span>Ẩn</span>
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="min-h-[44px] py-2 rounded-2xl doki-glass text-rose-500 flex flex-col items-center justify-center gap-1"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Báo cáo</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleBlock}
          className="w-full min-h-[44px] py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Ban className="w-3.5 h-3.5" />
          <span>Chặn nhân vật này</span>
        </button>
      </div>

      {/* Gallery Lightbox */}
      {lightboxItem && (
        <div
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-[70] bg-black/92 flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
          >
            <button
              type="button"
              onClick={() => setLightboxZoomed((z) => !z)}
              className="min-h-[44px] px-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5"
            >
              {lightboxZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
              <span>{lightboxZoomed ? 'Thu nhỏ' : 'Phóng to'}</span>
            </button>
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full flex-1 overflow-auto flex items-center justify-center"
          >
            <img
              src={lightboxItem.url}
              alt={lightboxItem.caption || character.name}
              onClick={() => setLightboxZoomed((z) => !z)}
              onError={(e) => handleCharImgError(e, character.name)}
              className={`rounded-2xl transition-all cursor-zoom-in ${
                lightboxZoomed ? 'w-[145%] max-w-none' : 'max-w-full max-h-[78vh] object-contain'
              }`}
            />
          </div>
          {(lightboxItem.scene || lightboxItem.caption) && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 max-w-md text-center text-white space-y-0.5"
            >
              {lightboxItem.scene && (
                <p className="text-[11px] font-bold text-violet-300">{lightboxItem.scene}</p>
              )}
              {lightboxItem.caption && (
                <p className="text-xs text-zinc-200">{lightboxItem.caption}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <div onClick={() => setReportOpen(false)} className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-4 space-y-3 text-xs">
            <h4 className="text-sm font-bold">Báo cáo {character.name}</h4>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value="Nội dung không phù hợp" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                Nội dung không phù hợp
              </option>
              <option value="Lặp lại hoặc lỗi tính cách" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                Lặp lại hoặc lỗi tính cách
              </option>
              <option value="Vi phạm quy tắc cộng đồng" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                Vi phạm quy tắc cộng đồng
              </option>
            </select>
            <textarea
              rows={3}
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="Ghi chú thêm (không bắt buộc)..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitReport}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold"
              >
                Gửi báo cáo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
