import React, { useMemo, useState } from 'react';
import {
  Clock,
  Heart,
  MessageCircle,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { Character, ChatSearchHistoryItem } from '../../types/os';
import {
  CHARACTER_GENRES,
  characterMatchesGenre,
  getEmotionStyle,
  handleCharImgError,
  normalizeVi,
  safeJson,
} from './utils';
import { osApi } from '../../services/api';

type DiscoverSection = 'all' | 'featured' | 'newest' | 'popular' | 'recommended' | 'trending' | 'story' | 'voice';
type GenderFilter = 'all' | 'female' | 'male' | 'unknown';
type StyleFilter = 'all' | 'anime' | 'realistic';
type SortMode = 'default' | 'popular' | 'newest' | 'name' | 'random';

interface DiscoverCharactersViewProps {
  characters: Character[];
  searchHistory: ChatSearchHistoryItem[];
  initialTopicFilter?: string;
  onStartChat: (character: Character) => void;
  onOpenProfile: (character: Character) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

const SEARCH_SUGGESTIONS = ['Yuki', 'Anime', 'Romance', 'Học đường', 'Lạnh lùng', 'Fantasy'];

export function DiscoverCharactersView({
  characters,
  searchHistory,
  initialTopicFilter,
  onStartChat,
  onOpenProfile,
  onRefreshData,
  onShowToast,
}: DiscoverCharactersViewProps) {
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [section, setSection] = useState<DiscoverSection>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [randomSeed, setRandomSeed] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() =>
    initialTopicFilter ? [initialTopicFilter] : []
  );

  React.useEffect(() => {
    if (initialTopicFilter) {
      setSelectedGenres([initialTopicFilter]);
    }
  }, [initialTopicFilter]);

  const visibleCharacters = useMemo(() => {
    const q = normalizeVi(search);
    return characters
      .filter((c) => !c.is_hidden && !c.is_blocked)
      .filter((c) => {
        if (section === 'featured' && !c.is_featured) return false;
        if (section === 'story' && c.has_story_mode === 0) return false;
        if (section === 'voice' && !c.voice_name) return false;
        if (genderFilter !== 'all' && (c.gender || 'unknown') !== genderFilter) return false;
        if (styleFilter !== 'all' && (c.style || 'anime') !== styleFilter) return false;
        if (selectedGenres.length > 0) {
          const matchesAll = selectedGenres.every((g) => characterMatchesGenre(c, g));
          if (!matchesAll) return false;
        }
        if (q) {
          return (
            normalizeVi(c.name).includes(q) ||
            normalizeVi(c.full_name || '').includes(q) ||
            normalizeVi(c.nickname || '').includes(q) ||
            normalizeVi(c.occupation || '').includes(q) ||
            normalizeVi(c.role_title || '').includes(q) ||
            normalizeVi(c.likes || '').includes(q) ||
            normalizeVi(c.favorite_topics || '').includes(q) ||
            normalizeVi(c.tagline).includes(q) ||
            normalizeVi(c.personality).includes(q) ||
            normalizeVi(c.bio).includes(q) ||
            normalizeVi(c.scenario).includes(q) ||
            normalizeVi(c.author).includes(q) ||
            normalizeVi(c.genres_json || '').includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'name') return a.name.localeCompare(b.name, 'vi');
        if (sortMode === 'newest' || (sortMode === 'default' && section === 'newest')) {
          return (b.created_at || '').localeCompare(a.created_at || '');
        }
        if (sortMode === 'popular' || (sortMode === 'default' && (section === 'popular' || section === 'trending'))) {
          return (b.interactions_count || 0) - (a.interactions_count || 0);
        }
        if (sortMode === 'random') {
          const ha = ((a.id.charCodeAt(a.id.length - 1) || 7) * 31 + randomSeed) % 97;
          const hb = ((b.id.charCodeAt(b.id.length - 1) || 7) * 31 + randomSeed) % 97;
          return ha - hb;
        }
        if (section === 'recommended') {
          return (b.is_favorite || 0) - (a.is_favorite || 0) || (b.relationship_xp || 0) - (a.relationship_xp || 0);
        }
        return (b.is_featured || 0) - (a.is_featured || 0);
      });
  }, [characters, search, section, genderFilter, styleFilter, selectedGenres, sortMode, randomSeed]);

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const resetFilters = () => {
    setSearch('');
    setSection('all');
    setGenderFilter('all');
    setStyleFilter('all');
    setSortMode('default');
    setSelectedGenres([]);
  };

  const commitSearchHistory = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setSearchFocused(false);
    await osApi.messagesV3.addSearchHistory(clean, 'discover').catch(() => {});
    onRefreshData().catch(() => {});
  };

  const toggleFavorite = async (e: React.MouseEvent, char: Character) => {
    e.stopPropagation();
    const next = char.is_favorite ? 0 : 1;
    await osApi.updateCharacter(char.id, { is_favorite: next });
    await onRefreshData();
    onShowToast(char.name, next ? 'Đã thêm vào Yêu thích' : 'Đã bỏ Yêu thích', 'success');
  };

  const hasActiveFilter =
    Boolean(search) || selectedGenres.length > 0 || section !== 'all' || genderFilter !== 'all' || styleFilter !== 'all' || sortMode !== 'default';

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      {/* Header Search + Multi-Filters */}
      <div className="px-3.5 pt-2.5 pb-2.5 space-y-2 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 shrink-0">
        <div className="flex items-center gap-2 px-3 min-h-[42px] rounded-2xl bg-white/80 dark:bg-zinc-900/75 border border-violet-200/50 dark:border-violet-800/40">
          <Search className="w-4 h-4 text-violet-500 shrink-0" />
          <input
            value={search}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitSearchHistory(search);
            }}
            placeholder="Tìm nhân vật theo tên, từ khóa, cốt truyện, tác giả..."
            className="flex-1 bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="p-1 text-zinc-400 hover:text-zinc-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>

        {/* Search Suggestions & Persistent History */}
        {searchFocused && !search && (
          <div className="p-2.5 rounded-2xl bg-white/85 dark:bg-zinc-900/85 border border-violet-200/40 dark:border-violet-800/40 space-y-2 text-[11px]">
            {searchHistory.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Lịch sử tìm kiếm</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        await osApi.messagesV3.clearData('search_history');
                        await onRefreshData();
                      }}
                      className="text-rose-500 font-semibold"
                    >
                      Xóa lịch sử
                    </button>
                    <button onClick={() => setSearchFocused(false)} className="text-zinc-400">
                      Đóng
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {searchHistory.slice(0, 6).map((sh) => (
                    <button
                      key={sh.id}
                      onClick={() => {
                        setSearch(sh.query);
                        setSearchFocused(false);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{sh.query}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-zinc-500 block">Gợi ý tìm kiếm</span>
              <div className="flex flex-wrap gap-1.5">
                {SEARCH_SUGGESTIONS.map((sg) => (
                  <button
                    key={sg}
                    onClick={() => {
                      setSearch(sg);
                      void commitSearchHistory(sg);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Discovery Sections */}
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {(
            [
              ['all', 'Tất cả'],
              ['featured', 'Nổi bật'],
              ['popular', 'Phổ biến'],
              ['recommended', 'Đề xuất'],
              ['trending', 'Đang quan tâm'],
              ['newest', 'Nhân vật mới'],
              ['story', 'Cốt truyện'],
              ['voice', 'Có giọng nói'],
            ] as Array<[DiscoverSection, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-colors ${
                section === k
                  ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-xs'
                  : 'bg-white/75 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Combinable Gender + Art Style + Sort Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden text-[11px]">
          {(
            [
              ['all', 'Mọi giới tính'],
              ['female', 'Nữ'],
              ['male', 'Nam'],
              ['unknown', 'Khác'],
            ] as Array<[GenderFilter, string]>
          ).map(([g, label]) => (
            <button
              key={g}
              onClick={() => setGenderFilter(g)}
              className={`px-2.5 py-1 rounded-lg font-medium shrink-0 ${
                genderFilter === g
                  ? 'bg-violet-600/15 text-violet-700 dark:text-violet-300 border border-violet-400/50'
                  : 'bg-white/60 dark:bg-zinc-900/50 text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          {(
            [
              ['all', 'Mọi phong cách'],
              ['anime', 'Anime'],
              ['realistic', 'Realistic'],
            ] as Array<[StyleFilter, string]>
          ).map(([st, label]) => (
            <button
              key={st}
              onClick={() => setStyleFilter(st)}
              className={`px-2.5 py-1 rounded-lg font-medium shrink-0 ${
                styleFilter === st
                  ? 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-400/50'
                  : 'bg-white/60 dark:bg-zinc-900/50 text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <select
            value={sortMode}
            onChange={(e) => {
              const next = e.target.value as SortMode;
              setSortMode(next);
              if (next === 'random') setRandomSeed((s) => s + 17);
            }}
            aria-label="Sắp xếp nhân vật"
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-zinc-200/70 dark:border-zinc-700/70 font-medium outline-none shrink-0"
          >
            <option value="default" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Mặc định</option>
            <option value="popular" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Phổ biến nhất</option>
            <option value="newest" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Mới nhất</option>
            <option value="name" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tên A-Z</option>
            <option value="random" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Ngẫu nhiên</option>
          </select>
        </div>

        {/* Multi-select 14 Topics Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {CHARACTER_GENRES.map((genre) => {
            const active = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 border transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                    : 'bg-white/50 dark:bg-zinc-900/40 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Discovery Character Grid */}
      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-3">
        {visibleCharacters.length === 0 ? (
          <div className="py-14 text-center space-y-2.5">
            <Sparkles className="w-8 h-8 mx-auto text-violet-400" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Không tìm thấy nhân vật khớp bộ lọc
            </p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
            >
              Đặt lại toàn bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleCharacters.map((c) => {
              const genres = safeJson<string[]>(c.genres_json, []);
              const emo = getEmotionStyle(c.mood);
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenProfile(c)}
                  className="doki-glass rounded-3xl p-3 flex items-start gap-3 cursor-pointer hover:border-violet-400/60 transition-colors"
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    loading="lazy"
                    onError={(e) => handleCharImgError(e, c.name)}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 ring-2 ring-white/60 dark:ring-zinc-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {c.name}
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {genres.slice(0, 2).join(' · ') || c.role_title || 'Nhân vật AI'} · {c.interactions_count} lượt
                        </p>
                      </div>
                      <button
                        onClick={(e) => toggleFavorite(e, c)}
                        className={`p-1.5 rounded-xl shrink-0 ${
                          c.is_favorite ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-500'
                        }`}
                        title="Yêu thích"
                      >
                        <Heart className={`w-4 h-4 ${c.is_favorite ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2 mt-1">{c.tagline}</p>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${emo.bg} ${emo.color}`}>
                        {c.mood?.split('·')[0] || 'Bình tĩnh'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile(c);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/80 dark:bg-zinc-800 text-[11px] font-semibold"
                        >
                          Hồ sơ
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartChat(c);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-[11px] font-semibold flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Chat</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
