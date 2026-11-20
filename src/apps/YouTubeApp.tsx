import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bookmark,
  CheckCircle2,
  Clock,
  Crown,
  Film,
  Flame,
  FolderPlus,
  Heart,
  History,
  Home,
  Link2,
  ListVideo,
  Lock,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  ThumbsUp,
  Ticket,
  Trash2,
  Tv,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import {
  BANKING_SYNC_EVENT,
  YOUTUBE_SYNC_EVENT,
  osApi,
} from '../services/api';
import { OSStateView } from '../components/ui/OSDesignSystem';
import { YouTubeWatchView, type YouTubeVideoCard } from '../components/youtube/YouTubeWatchView';
import { YouTubeMovieDetailView } from '../components/youtube/YouTubeMovieDetailView';
import { YouTubePremiumView } from '../components/youtube/YouTubePremiumView';
import {
  YouTubePremiumCheckoutModal,
  type YouTubeCheckoutIntent,
} from '../components/youtube/YouTubePremiumCheckoutModal';
import { YouTubeShortsView } from '../components/youtube/YouTubeShortsView';
import type {
  YouTubeMovieItem,
  YouTubePlaylist,
  YouTubeSearchHistoryItem,
  YouTubeShortItem,
  YouTubeStreamingOverview,
  YouTubeSubscription,
} from '../types/os';

const VIDEO_TOPICS = ['Tất cả', 'Âm nhạc', 'Thiên nhiên', 'Hoạt hình', 'Công nghệ', 'Gaming', 'Vlog'];

function extractYouTubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '').slice(0, 11);
      return id.length === 11 ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && v.length >= 11) return v.slice(0, 11);
      const parts = u.pathname.split('/');
      const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1].slice(0, 11);
    }
  } catch {
    return null;
  }
  return null;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function formatVnd(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')}đ`;
}

function accessShortBadge(m: YouTubeMovieItem): { label: string; tone: string } {
  if (m.accessType === 'FREE') return { label: 'FREE', tone: 'bg-emerald-500/85 text-white' };
  if (m.accessType === 'LOCKED') return { label: 'KHÓA', tone: 'bg-zinc-700/90 text-zinc-200' };
  if (m.isUnlocked) return { label: 'ĐÃ MỞ', tone: 'bg-emerald-500/85 text-white' };
  if (m.accessType === 'RENT') return { label: `THUÊ ${formatVnd(m.rentPrice)}`, tone: 'bg-amber-500 text-zinc-950' };
  if (m.accessType === 'BUY') return { label: `MUA ${formatVnd(m.buyPrice)}`, tone: 'bg-sky-500 text-white' };
  return { label: `PREMIUM`, tone: 'bg-rose-600 text-white' };
}

export function YouTubeApp() {
  const {
    data,
    appParams,
    refreshData,
    showToast,
    activeYouTube,
    playYouTubeVideo,
    toggleYouTubePlay,
    openShareSheet,
  } = useOS();

  const [tab, setTab] = useState<'home' | 'shorts' | 'subscriptions' | 'premium' | 'library'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [videoTopic, setVideoTopic] = useState('Tất cả');

  const [watchVideo, setWatchVideo] = useState<YouTubeVideoCard | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<YouTubeMovieItem | null>(null);

  // Streaming Platform Overview
  const [streamingOverview, setStreamingOverview] = useState<YouTubeStreamingOverview | null>(null);
  const [streamingLoading, setStreamingLoading] = useState(false);

  // Checkout Modal & Overlays
  const [checkoutIntent, setCheckoutIntent] = useState<YouTubeCheckoutIntent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [urlDrawerOpen, setUrlDrawerOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  // Regular Video Feed & Search
  const [homeVideos, setHomeVideos] = useState<YouTubeVideoCard[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sortFilter, setSortFilter] = useState<'relevance' | 'date' | 'views' | 'rating'>('relevance');
  const [durationFilter, setDurationFilter] = useState<'any' | 'short' | 'medium' | 'long'>('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeVideoCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<YouTubeSearchHistoryItem[]>([]);

  // Subscriptions & Playlists
  const [subscriptions, setSubscriptions] = useState<YouTubeSubscription[]>([]);
  const [selectedSubChannel, setSelectedSubChannel] = useState<string>('');
  const [subVideos, setSubVideos] = useState<YouTubeVideoCard[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [libSection, setLibSection] = useState<
    'history' | 'movies_fav' | 'owned' | 'liked' | 'watch_later' | 'playlists'
  >('history');
  const [activePlaylist, setActivePlaylist] = useState<YouTubePlaylist | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const library = data?.youtubeLibrary || [];

  const loadStreamingOverview = useCallback(async () => {
    setStreamingLoading(true);
    try {
      const ov = await osApi.getYoutubeStreamingOverview();
      setStreamingOverview(ov);
    } catch {
      // non-fatal
    } finally {
      setStreamingLoading(false);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const r = await osApi.getYoutubeSubscriptions();
      setSubscriptions(r.subscriptions || []);
    } catch {
      // ignore
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const r = await osApi.getYoutubePlaylists();
      setPlaylists(r.playlists || []);
    } catch {
      // ignore
    }
  }, []);

  const loadSearchHistory = useCallback(async () => {
    try {
      const r = await osApi.getYoutubeSearchHistory();
      setSearchHistory(r.items || []);
    } catch {
      // ignore
    }
  }, []);

  const fetchTopicVideos = useCallback(async (selectedTopic: string) => {
    setHomeLoading(true);
    try {
      const res = await osApi.searchYoutube('', selectedTopic === 'Tất cả' ? '' : selectedTopic);
      setHomeVideos(res.items || []);
    } catch {
      // ignore
    } finally {
      setHomeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStreamingOverview();
    void loadSubscriptions();
    void loadPlaylists();
    void loadSearchHistory();
  }, [loadStreamingOverview, loadSubscriptions, loadPlaylists, loadSearchHistory]);

  useEffect(() => {
    void fetchTopicVideos(videoTopic);
  }, [videoTopic, fetchTopicVideos]);

  // Listen to Banking & YouTube real-time sync events (e.g., locking card in Hikari Bank updates YouTube immediately)
  useEffect(() => {
    const syncHandler = () => {
      void loadStreamingOverview();
      void refreshData();
    };
    window.addEventListener(BANKING_SYNC_EVENT, syncHandler);
    window.addEventListener(YOUTUBE_SYNC_EVENT, syncHandler);
    return () => {
      window.removeEventListener(BANKING_SYNC_EVENT, syncHandler);
      window.removeEventListener(YOUTUBE_SYNC_EVENT, syncHandler);
    };
  }, [loadStreamingOverview, refreshData]);

  // Deep link from VibeSphere / ShareSheet
  useEffect(() => {
    if (appParams?.videoId) {
      const deep: YouTubeVideoCard = {
        videoId: appParams.videoId,
        title: appParams.videoTitle || `Video YouTube (${appParams.videoId})`,
        channelTitle: appParams.videoChannel || 'YouTube',
        thumbnail: appParams.videoThumb || `https://i.ytimg.com/vi/${appParams.videoId}/hqdefault.jpg`,
      };
      setWatchVideo(deep);
      playYouTubeVideo(deep);
    }
  }, [appParams?.videoId, appParams?.videoTitle, appParams?.videoChannel, appParams?.videoThumb, playYouTubeVideo]);

  const handleOpenWatch = useCallback(
    async (video: YouTubeVideoCard, queueList?: YouTubeVideoCard[]) => {
      setSearchOpen(false);
      setWatchVideo(video);
      const q = (queueList && queueList.length > 0 ? queueList : homeVideos).map((x) => ({
        videoId: x.videoId,
        title: x.title,
        channelTitle: x.channelTitle,
        channelId: x.channelId,
        thumbnail: x.thumbnail || `https://i.ytimg.com/vi/${x.videoId}/hqdefault.jpg`,
        durationLabel: x.durationLabel,
      }));
      playYouTubeVideo({
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        channelId: video.channelId,
        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        durationLabel: video.durationLabel,
        startSec: video.startSec,
        queue: q,
      });
      try {
        await osApi.saveYoutubeLibrary({
          video_id: video.videoId,
          title: video.title,
          channel_title: video.channelTitle,
          thumbnail_url: video.thumbnail,
          duration_label: video.durationLabel,
          channel_id: video.channelId,
          category: video.category,
          list_type: 'history',
        });
        await refreshData();
      } catch {
        // ignore
      }
    },
    [homeVideos, playYouTubeVideo, refreshData]
  );

  const runSearch = async (
    q: string,
    opts?: { sort?: 'relevance' | 'date' | 'views' | 'rating'; duration?: 'any' | 'short' | 'medium' | 'long'; save?: boolean }
  ) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const res = await osApi.searchYoutube(trimmed, '', {
        sort: opts?.sort ?? sortFilter,
        duration: opts?.duration ?? durationFilter,
        save: opts?.save ?? true,
      });
      setSearchResults(res.items || []);
      await loadSearchHistory();
    } catch (err) {
      showToast('Lỗi tìm kiếm', err instanceof Error ? err.message : 'Không thể tìm video', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'subscriptions' && tab !== 'home') return;
    const targetQuery = selectedSubChannel || subscriptions[0]?.channel_title || '';
    if (!targetQuery) {
      setSubVideos([]);
      return;
    }
    setSubLoading(true);
    osApi
      .searchYoutube(targetQuery)
      .then((res) => setSubVideos(res.items || []))
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [tab, selectedSubChannel, subscriptions]);

  const handlePlayCustomLink = (e: React.FormEvent) => {
    e.preventDefault();
    const vid = extractYouTubeId(urlInput);
    if (!vid) {
      showToast('Liên kết không hợp lệ', 'Hãy dán URL YouTube hoặc mã video 11 ký tự hợp lệ.', 'error');
      return;
    }
    setUrlInput('');
    setUrlDrawerOpen(false);
    void handleOpenWatch({
      videoId: vid,
      title: `Video YouTube (${vid})`,
      channelTitle: 'Nhúng chính thức từ URL',
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    });
  };

  const membership = streamingOverview?.membership;
  const isPremiumMember = membership?.status === 'active' && membership?.effectivePlanId !== 'free';
  const movies = useMemo(() => streamingOverview?.movies || [], [streamingOverview?.movies]);
  const categories = useMemo(
    () =>
      streamingOverview?.categories || [
        'Tất cả',
        'Phim hành động',
        'Phim tình cảm',
        'Phim kinh dị',
        'Phim hoạt hình',
        'Anime',
        'Khoa học viễn tưởng',
        'Hài hước',
        'Tài liệu',
        'Phim truyền hình',
        'Series độc quyền',
      ],
    [streamingOverview?.categories]
  );

  const featuredMovie = useMemo(
    () => movies.find((m) => m.isFeatured) || movies[0] || null,
    [movies]
  );
  const trendingMovies = useMemo(() => movies.filter((m) => m.isTrending), [movies]);
  const newReleaseMovies = useMemo(() => movies.filter((m) => m.isNewRelease), [movies]);
  const premiumExclusiveMovies = useMemo(
    () => movies.filter((m) => m.accessType === 'PREMIUM' || m.isExclusive),
    [movies]
  );
  const filteredMovies = useMemo(() => {
    if (selectedCategory === 'Tất cả') return movies;
    return movies.filter(
      (m) => m.categories.includes(selectedCategory) || m.genre.toLowerCase().includes(selectedCategory.toLowerCase())
    );
  }, [movies, selectedCategory]);

  const matchingSearchMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return movies.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.originalTitle.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        m.categories.some((c) => c.toLowerCase().includes(q))
    );
  }, [movies, query]);

  const continueWatchingMovies = useMemo(() => movies.filter((m) => m.progress && m.progress.progressSec > 0), [movies]);
  const continueWatchingVideos = useMemo(
    () => library.filter((it) => it.list_type === 'history' && (it.progress_sec || 0) > 2).slice(0, 8),
    [library]
  );

  const historyList = useMemo(() => library.filter((it) => it.list_type === 'history'), [library]);
  const likedList = useMemo(() => library.filter((it) => it.list_type === 'liked' && it.liked === 1), [library]);
  const watchLaterList = useMemo(() => library.filter((it) => it.list_type === 'watch_later'), [library]);
  const favoriteMovies = useMemo(() => movies.filter((m) => m.isFavorite), [movies]);
  const ownedOrRentedMovies = useMemo(() => movies.filter((m) => Boolean(m.entitlement)), [movies]);

  const unreadNotifCount = useMemo(
    () => (streamingOverview?.notifications || []).filter((n) => !n.is_read).length,
    [streamingOverview?.notifications]
  );

  const handleSubscribeShortCreator = async (creatorName: string) => {
    try {
      const res = await osApi.toggleYoutubeSubscribe({ channel_id: creatorName, channel_title: creatorName });
      await loadSubscriptions();
      showToast('Kênh YouTube', res.subscribed ? `Đã đăng ký ${creatorName}` : `Đã hủy đăng ký ${creatorName}`, 'success');
    } catch {
      showToast('Lỗi', 'Không thể cập nhật đăng ký kênh.', 'error');
    }
  };

  // Watch Video Mode
  if (watchVideo) {
    const suggestions = hasSearched && searchResults.length > 0 ? searchResults : homeVideos;
    return (
      <YouTubeWatchView
        video={watchVideo}
        suggestions={suggestions}
        playlists={playlists}
        onBack={() => setWatchVideo(null)}
        onSelectVideo={handleOpenWatch}
        onPlaylistsChanged={loadPlaylists}
        onSubscriptionsChanged={loadSubscriptions}
      />
    );
  }

  // Movie & Series Detail Mode
  if (selectedMovie && streamingOverview) {
    return (
      <>
        <YouTubeMovieDetailView
          movie={selectedMovie}
          overview={streamingOverview}
          onBack={() => setSelectedMovie(null)}
          onOverviewUpdated={(next) => {
            setStreamingOverview(next);
            const updated = next.movies.find((m) => m.id === selectedMovie.id);
            if (updated) setSelectedMovie(updated);
          }}
          onOpenPremiumTab={() => {
            setSelectedMovie(null);
            setTab('premium');
          }}
          onOpenCheckout={(intent) => setCheckoutIntent(intent)}
          onToast={showToast}
        />
        <YouTubePremiumCheckoutModal
          open={Boolean(checkoutIntent)}
          intent={checkoutIntent}
          currentSavedCardId={streamingOverview?.membership?.savedCard?.cardId}
          onClose={() => setCheckoutIntent(null)}
          onCompleted={(nextOv, msg) => {
            setStreamingOverview(nextOv);
            const updated = nextOv.movies.find((m) => m.id === selectedMovie.id);
            if (updated) setSelectedMovie(updated);
            void refreshData();
            showToast('Thanh toán thành công', msg, 'success');
          }}
        />
      </>
    );
  }

  const renderMovieCard = (m: YouTubeMovieItem, compact = false) => {
    const badge = accessShortBadge(m);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setSelectedMovie(m)}
        className={`${
          compact ? 'w-36 sm:w-40 shrink-0' : 'w-full'
        } rounded-2xl bg-zinc-900/90 border border-white/10 overflow-hidden text-left group transition-transform active:scale-[0.98]`}
      >
        <div className="relative aspect-[3/4] w-full bg-zinc-900 overflow-hidden">
          <img
            src={m.posterUrl}
            alt={m.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35" />
          <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9.5px] font-extrabold ${badge.tone}`}>
            {badge.label}
          </span>
          {!m.isUnlocked && m.accessType !== 'FREE' && (
            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/65 backdrop-blur-xs flex items-center justify-center text-white">
              <Lock className="w-3 h-3" />
            </span>
          )}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-zinc-200 font-semibold">
            <span>★ {m.rating}</span>
            <span>{m.maxSourceQuality}</span>
          </div>
        </div>
        <div className="p-2.5 space-y-0.5">
          <p className="text-xs font-bold text-white line-clamp-1">{m.title}</p>
          <p className="text-[10.5px] text-zinc-400 truncate">
            {m.categories[0] || m.genre} · {m.year}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Compact Sticky Top Header (48-56px height budget) */}
      <header className="shrink-0 h-13 px-3.5 bg-zinc-950/95 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setTab('home');
            setSearchOpen(false);
          }}
          className="min-h-[44px] flex items-center gap-2 min-w-0"
        >
          <div className="w-8 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-600/30">
            <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1">
              <span className="text-sm font-black tracking-tight text-white">YouTube</span>
              {isPremiumMember && (
                <span className="text-[10px] font-black text-amber-400">Premium</span>
              )}
            </div>
          </div>
        </button>

        {/* Header Actions: Search + URL + Notifications + Membership/Account Avatar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center ${
              searchOpen ? 'bg-rose-600 text-white' : 'text-zinc-200 hover:bg-white/10'
            }`}
            title="Tìm kiếm"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setUrlDrawerOpen((v) => !v)}
            className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center ${
              urlDrawerOpen ? 'bg-rose-600 text-white' : 'text-zinc-200 hover:bg-white/10'
            }`}
            title="Phát từ URL YouTube"
          >
            <Link2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className="relative min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-zinc-200 hover:bg-white/10"
            title="Thông báo"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-zinc-950" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('premium')}
            className={`min-h-[38px] px-2.5 rounded-full flex items-center gap-1.5 border ${
              isPremiumMember
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                : 'border-white/15 bg-zinc-900 text-zinc-200'
            }`}
            title="Tài khoản & Gói thành viên"
          >
            <Crown className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold hidden sm:inline">
              {isPremiumMember ? membership?.planName : 'Tài khoản'}
            </span>
          </button>
        </div>
      </header>

      {/* Optional URL Drawer */}
      {urlDrawerOpen && (
        <form
          onSubmit={handlePlayCustomLink}
          className="shrink-0 px-3.5 py-2.5 bg-zinc-900 border-b border-white/10 flex items-center gap-2"
        >
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Dán link youtube.com / youtu.be hoặc ID 11 ký tự..."
            className="flex-1 min-h-[42px] px-3 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white outline-none focus:border-rose-500"
          />
          <button
            type="submit"
            className="min-h-[42px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold shrink-0"
          >
            Phát
          </button>
        </form>
      )}

      {/* Search Overlay Drawer */}
      {searchOpen && (
        <div className="shrink-0 max-h-[75%] overflow-y-auto os-scroll bg-zinc-950 border-b border-white/15 p-3.5 space-y-3 shadow-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="flex items-center gap-1.5"
          >
            <div className="flex-1 min-h-[44px] px-3 rounded-xl bg-zinc-900 border border-white/15 flex items-center gap-2">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm phim, series, video hoặc kênh YouTube..."
                className="flex-1 bg-transparent text-xs text-white outline-none"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setHasSearched(false);
                  }}
                  className="text-zinc-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center ${
                filtersOpen || sortFilter !== 'relevance' || durationFilter !== 'any'
                  ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                  : 'bg-zinc-900 border-white/15 text-zinc-300'
              }`}
              title="Bộ lọc"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold shrink-0"
            >
              Tìm
            </button>
          </form>

          {filtersOpen && (
            <div className="p-3 rounded-2xl bg-zinc-900 border border-white/10 space-y-2.5 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['relevance', 'Liên quan'],
                    ['date', 'Mới nhất'],
                    ['views', 'Lượt xem'],
                    ['rating', 'Đánh giá'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSortFilter(id);
                      if (query.trim()) void runSearch(query, { sort: id, save: false });
                    }}
                    className={`min-h-[34px] px-3 rounded-lg font-medium ${
                      sortFilter === id ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['any', 'Mọi thời lượng'],
                    ['short', 'Ngắn (<4p)'],
                    ['medium', 'Trung bình (4-20p)'],
                    ['long', 'Dài (>20p)'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setDurationFilter(id);
                      if (query.trim()) void runSearch(query, { duration: id, save: false });
                    }}
                    className={`min-h-[34px] px-3 rounded-lg font-medium ${
                      durationFilter === id ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matching Movies/Series in Catalog */}
          {matchingSearchMovies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-zinc-400">Phim & Series khớp từ khóa</p>
              <div className="flex gap-2.5 overflow-x-auto os-scroll-hidden">
                {matchingSearchMovies.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSelectedMovie(m);
                    }}
                    className="w-44 shrink-0 p-2 rounded-2xl bg-zinc-900 border border-white/10 flex items-center gap-2.5 text-left"
                  >
                    <img
                      src={m.posterUrl}
                      alt={m.title}
                      referrerPolicy="no-referrer"
                      className="w-11 h-14 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white line-clamp-2">{m.title}</p>
                      <p className="text-[10px] text-amber-400 mt-0.5">{accessShortBadge(m).label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Search History */}
          {(!hasSearched || !query.trim()) && searchHistory.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-zinc-400">Tìm kiếm gần đây</p>
                <button
                  type="button"
                  onClick={async () => {
                    await osApi.deleteYoutubeSearchHistory('all');
                    setSearchHistory([]);
                  }}
                  className="text-[11px] text-rose-400 font-semibold"
                >
                  Xóa tất cả
                </button>
              </div>
              <div className="divide-y divide-white/10 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden">
                {searchHistory.slice(0, 6).map((h) => (
                  <div key={h.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(h.query);
                        void runSearch(h.query);
                      }}
                      className="flex-1 min-h-[42px] px-3.5 flex items-center gap-2.5 text-left text-xs text-zinc-200"
                    >
                      <History className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{h.query}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await osApi.deleteYoutubeSearchHistory(h.id);
                        setSearchHistory((prev) => prev.filter((x) => x.id !== h.id));
                      }}
                      className="min-h-[42px] min-w-[42px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchLoading ? (
            <OSStateView mode="loading" title="Đang tìm trên YouTube..." />
          ) : (
            hasSearched && (
              <div className="space-y-2">
                {searchResults.map((v) => (
                  <button
                    key={v.videoId}
                    type="button"
                    onClick={() => void handleOpenWatch(v, searchResults)}
                    className="w-full p-2.5 rounded-2xl bg-zinc-900 border border-white/10 flex items-center gap-3 text-left"
                  >
                    <div className="relative w-28 aspect-video rounded-xl overflow-hidden bg-zinc-800 shrink-0">
                      <img
                        src={v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                        alt={v.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-bold text-white line-clamp-2">{v.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {v.channelTitle}
                        {v.viewCountText ? ` · ${v.viewCountText}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Main Scrollable Viewport */}
      <div className="flex-1 overflow-y-auto os-scroll">
        {/* TAB 1: TRANG CHỦ */}
        {tab === 'home' && (
          <div className="pb-6 space-y-5">
            {/* Genre / Category Filter Chips */}
            <div className="px-3.5 pt-3 flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === cat
                      ? 'bg-white text-zinc-950'
                      : 'bg-zinc-900 border border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Featured Movie/Series Hero Banner */}
            {featuredMovie && selectedCategory === 'Tất cả' && (
              <div className="px-3.5">
                <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-zinc-900 shadow-2xl">
                  <div className="relative aspect-[16/10] sm:aspect-[21/9] w-full bg-zinc-900">
                    <img
                      src={featuredMovie.backdropUrl || featuredMovie.posterUrl}
                      alt={featuredMovie.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-amber-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>PHIM NỔI BẬT · {featuredMovie.maxSourceQuality} · ★ {featuredMovie.rating}</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{featuredMovie.title}</h2>
                    <p className="text-xs text-zinc-300 line-clamp-2 max-w-xl">{featuredMovie.description}</p>
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMovie(featuredMovie)}
                        className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>Xem ngay</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await osApi.toggleYoutubeMovieFavorite(featuredMovie.id);
                          setStreamingOverview(r.overview);
                          showToast(
                            'Yêu thích',
                            r.isFavorite ? 'Đã thêm vào danh sách yêu thích' : 'Đã bỏ khỏi yêu thích',
                            'success'
                          );
                        }}
                        className="min-h-[44px] px-3.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Heart className={`w-4 h-4 ${featuredMovie.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span>Yêu thích</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Membership Upgrade Quick Strip when on Free plan */}
            {!isPremiumMember && selectedCategory === 'Tất cả' && (
              <div className="px-3.5">
                <button
                  type="button"
                  onClick={() => setTab('premium')}
                  className="w-full min-h-[54px] rounded-2xl bg-gradient-to-r from-rose-600/20 via-amber-500/15 to-zinc-900 border border-rose-500/30 px-4 py-3 flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Crown className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-white truncate">Mở khóa YouTube Premium chỉ từ 49.000đ/tháng</p>
                      <p className="text-[11px] text-zinc-300 truncate">Xem phim độc quyền 4K · Không quảng cáo · Tải xuống ngoại tuyến</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-amber-300 shrink-0">Khám phá →</span>
                </button>
              </div>
            )}

            {/* Continue Watching (Movies & Videos combined) */}
            {(continueWatchingMovies.length > 0 || continueWatchingVideos.length > 0) && selectedCategory === 'Tất cả' && (
              <section className="space-y-2">
                <div className="px-3.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-rose-500" />
                    <span>Tiếp tục xem</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('library');
                      setLibSection('history');
                    }}
                    className="text-xs font-semibold text-rose-400"
                  >
                    Xem tất cả
                  </button>
                </div>
                <div className="px-3.5 flex gap-2.5 overflow-x-auto os-scroll-hidden">
                  {continueWatchingMovies.map((m) => {
                    const pct =
                      m.progress && m.progress.durationSec > 0
                        ? Math.min(100, Math.round((m.progress.progressSec / m.progress.durationSec) * 100))
                        : 40;
                    return (
                      <button
                        key={`cw_mov_${m.id}`}
                        type="button"
                        onClick={() => setSelectedMovie(m)}
                        className="w-44 shrink-0 text-left space-y-1.5"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/10">
                          <img
                            src={m.backdropUrl || m.posterUrl}
                            alt={m.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-2 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9.5px] font-mono">
                            Tập {m.progress?.episodeNumber} · {formatSec(m.progress?.progressSec || 0)}
                          </span>
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
                            <div className="h-full bg-rose-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-white line-clamp-1">{m.title}</p>
                      </button>
                    );
                  })}
                  {continueWatchingVideos.map((item) => {
                    const pct =
                      item.duration_sec && item.duration_sec > 0
                        ? Math.min(100, Math.round(((item.progress_sec || 0) / item.duration_sec) * 100))
                        : 35;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          void handleOpenWatch({
                            videoId: item.video_id,
                            title: item.title,
                            channelTitle: item.channel_title,
                            channelId: item.channel_id,
                            thumbnail: item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`,
                            durationLabel: item.duration_label,
                            startSec: item.progress_sec || 0,
                          })
                        }
                        className="w-44 shrink-0 text-left space-y-1.5"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/10">
                          <img
                            src={item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-2 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9.5px] font-mono">
                            {formatSec(item.progress_sec || 0)}
                          </span>
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
                            <div className="h-full bg-rose-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-white line-clamp-1">{item.title}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Filtered Genre View OR Full Curated Sections */}
            {selectedCategory !== 'Tất cả' ? (
              <section className="px-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Phim & Series · {selectedCategory} ({filteredMovies.length})
                  </h3>
                </div>
                {filteredMovies.length === 0 ? (
                  <OSStateView mode="empty" title="Chưa có phim thuộc thể loại này" message="Hãy thử chọn thể loại khác." />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredMovies.map((m) => renderMovieCard(m, false))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* Trending Movies */}
                {trendingMovies.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="px-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-rose-500" />
                        <span>Phim đang thịnh hành</span>
                      </h3>
                    </div>
                    <div className="px-3.5 flex gap-3 overflow-x-auto os-scroll-hidden pb-1">
                      {trendingMovies.map((m) => renderMovieCard(m, true))}
                    </div>
                  </section>
                )}

                {/* New Releases */}
                {newReleaseMovies.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="px-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-sky-400" />
                        <span>Phim mới phát hành</span>
                      </h3>
                    </div>
                    <div className="px-3.5 flex gap-3 overflow-x-auto os-scroll-hidden pb-1">
                      {newReleaseMovies.map((m) => renderMovieCard(m, true))}
                    </div>
                  </section>
                )}

                {/* Premium Exclusives */}
                {premiumExclusiveMovies.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="px-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Crown className="w-4 h-4 text-amber-400" />
                        <span>Phim dành riêng cho thành viên Premium</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setTab('premium')}
                        className="text-xs font-semibold text-amber-300"
                      >
                        Nâng cấp
                      </button>
                    </div>
                    <div className="px-3.5 flex gap-3 overflow-x-auto os-scroll-hidden pb-1">
                      {premiumExclusiveMovies.map((m) => renderMovieCard(m, true))}
                    </div>
                  </section>
                )}

                {/* Movies & Series Full Hub */}
                {movies.length > 0 && (
                  <section className="px-3.5 space-y-2.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-rose-500" />
                      <span>Kho Phim Điện Ảnh & Series</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {movies.map((m) => renderMovieCard(m, false))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Personal Playlists Strip on Home */}
            {playlists.length > 0 && selectedCategory === 'Tất cả' && (
              <section className="space-y-2">
                <div className="px-3.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <ListVideo className="w-4 h-4 text-violet-400" />
                    <span>Danh sách phát cá nhân</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('library');
                      setLibSection('playlists');
                    }}
                    className="text-xs font-semibold text-rose-400"
                  >
                    Quản lý
                  </button>
                </div>
                <div className="px-3.5 flex gap-2.5 overflow-x-auto os-scroll-hidden">
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        setTab('library');
                        setLibSection('playlists');
                        setActivePlaylist(pl);
                      }}
                      className="w-44 shrink-0 rounded-2xl bg-zinc-900 border border-white/10 p-3 text-left space-y-1"
                    >
                      <p className="text-xs font-bold text-white truncate">{pl.name}</p>
                      <p className="text-[11px] text-zinc-400">{pl.items?.length || 0} video đã lưu</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Subscribed Channels Videos Preview on Home */}
            {subVideos.length > 0 && selectedCategory === 'Tất cả' && (
              <section className="space-y-2">
                <div className="px-3.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Video từ các kênh đăng ký</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab('subscriptions')}
                    className="text-xs font-semibold text-rose-400"
                  >
                    Xem kênh
                  </button>
                </div>
                <div className="px-3.5 flex gap-2.5 overflow-x-auto os-scroll-hidden">
                  {subVideos.slice(0, 6).map((v) => (
                    <button
                      key={`sub_home_${v.videoId}`}
                      type="button"
                      onClick={() => void handleOpenWatch(v, subVideos)}
                      className="w-48 shrink-0 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden text-left"
                    >
                      <div className="relative aspect-video bg-zinc-800">
                        <img
                          src={v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-bold text-white line-clamp-1">{v.title}</p>
                        <p className="text-[10.5px] text-zinc-400 truncate mt-0.5">{v.channelTitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Recommended YouTube Videos Section */}
            <section className="px-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">Video đề xuất</h3>
                <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
                  {VIDEO_TOPICS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVideoTopic(t)}
                      className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold shrink-0 ${
                        videoTopic === t ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {homeLoading ? (
                <OSStateView mode="loading" title="Đang tải video đề xuất..." />
              ) : homeVideos.length === 0 ? (
                <OSStateView mode="empty" title="Chưa có video" message="Chọn chủ đề khác hoặc tìm kiếm từ khóa mới." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {homeVideos.map((v) => (
                    <button
                      key={v.videoId}
                      type="button"
                      onClick={() => void handleOpenWatch(v, homeVideos)}
                      className="w-full rounded-2xl bg-zinc-900/85 border border-white/10 overflow-hidden text-left transition-transform active:scale-[0.99]"
                    >
                      <div className="relative aspect-video w-full bg-zinc-900">
                        <img
                          src={v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {v.durationLabel && (
                          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                            {v.durationLabel}
                          </span>
                        )}
                      </div>
                      <div className="p-3 flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-rose-600/20 text-rose-400 font-bold text-xs flex items-center justify-center shrink-0">
                          {v.channelTitle.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white line-clamp-2 leading-snug">{v.title}</p>
                          <p className="text-[11px] text-zinc-400 mt-1 truncate">
                            {v.channelTitle}
                            {v.viewCountText ? ` · ${v.viewCountText}` : ''}
                            {v.publishedTimeText ? ` · ${v.publishedTimeText}` : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: SHORTS */}
        {tab === 'shorts' && (
          <YouTubeShortsView
            shorts={streamingOverview?.shorts || []}
            subscriptions={subscriptions}
            onToggleSubscribe={handleSubscribeShortCreator}
            onOpenWatch={(v) => void handleOpenWatch(v)}
            onShareShort={(s: YouTubeShortItem) =>
              openShareSheet({
                title: s.title,
                text: `${s.title} - ${s.creatorName}`,
                url: `https://www.youtube.com/shorts/${s.videoId}`,
              })
            }
          />
        )}

        {/* TAB 3: ĐĂNG KÝ */}
        {tab === 'subscriptions' && (
          <div className="p-3.5 space-y-3">
            {subscriptions.length === 0 ? (
              <OSStateView
                mode="empty"
                title="Chưa đăng ký kênh nào"
                message="Nhấn Đăng ký khi xem video hoặc Shorts để theo dõi kênh yêu thích của bạn tại đây."
              />
            ) : (
              <>
                <div className="flex items-center gap-2 overflow-x-auto os-scroll-hidden pb-1">
                  {subscriptions.map((sub) => {
                    const active = (selectedSubChannel || subscriptions[0]?.channel_title) === sub.channel_title;
                    return (
                      <button
                        key={sub.channel_id}
                        type="button"
                        onClick={() => setSelectedSubChannel(sub.channel_title)}
                        className={`min-h-[44px] px-3 py-1.5 rounded-2xl border flex items-center gap-2 shrink-0 ${
                          active
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-zinc-900 border-white/10 text-zinc-200'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-bold">
                          {sub.channel_title.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold whitespace-nowrap">{sub.channel_title}</span>
                      </button>
                    );
                  })}
                </div>

                {subLoading ? (
                  <OSStateView mode="loading" title="Đang tải video từ kênh đăng ký..." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {subVideos.map((v) => (
                      <button
                        key={v.videoId}
                        type="button"
                        onClick={() => void handleOpenWatch(v, subVideos)}
                        className="w-full rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden text-left"
                      >
                        <div className="relative aspect-video bg-zinc-800">
                          <img
                            src={v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                            alt={v.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          {v.durationLabel && (
                            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                              {v.durationLabel}
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-bold text-white line-clamp-2">{v.title}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {v.channelTitle}
                            {v.viewCountText ? ` · ${v.viewCountText}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 4: YOUTUBE PREMIUM & ACCOUNT MEMBERSHIP */}
        {tab === 'premium' && (
          <YouTubePremiumView
            overview={streamingOverview}
            loading={streamingLoading}
            onRefresh={loadStreamingOverview}
            onOpenCheckout={(intent) => setCheckoutIntent(intent)}
            onToast={showToast}
          />
        )}

        {/* TAB 5: THƯ VIỆN */}
        {tab === 'library' && (
          <div className="p-3.5 space-y-3.5 pb-6">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(
                [
                  ['history', 'Lịch sử', History],
                  ['movies_fav', 'Phim thích', Heart],
                  ['owned', 'Đã thuê/mua', Ticket],
                  ['liked', 'Video thích', ThumbsUp],
                  ['watch_later', 'Xem sau', Bookmark],
                  ['playlists', 'Danh sách', ListVideo],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setLibSection(id);
                    setActivePlaylist(null);
                  }}
                  className={`min-h-[48px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    libSection === id
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                      : 'bg-zinc-900 border-white/10 text-zinc-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate max-w-full">{label}</span>
                </button>
              ))}
            </div>

            {libSection === 'movies_fav' && (
              favoriteMovies.length === 0 ? (
                <OSStateView
                  mode="empty"
                  title="Chưa có phim yêu thích"
                  message="Nhấn nút Yêu thích trong trang chi tiết phim để lưu vào thư viện."
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {favoriteMovies.map((m) => renderMovieCard(m, false))}
                </div>
              )
            )}

            {libSection === 'owned' && (
              ownedOrRentedMovies.length === 0 ? (
                <OSStateView
                  mode="empty"
                  title="Chưa thuê hoặc mua phim nào"
                  message="Các phim chiếu rạp bạn thuê 72h hoặc mua sở hữu sẽ hiển thị tại đây."
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ownedOrRentedMovies.map((m) => renderMovieCard(m, false))}
                </div>
              )
            )}

            {(libSection === 'history' || libSection === 'liked' || libSection === 'watch_later') &&
              (() => {
                const items =
                  libSection === 'history' ? historyList : libSection === 'liked' ? likedList : watchLaterList;
                if (items.length === 0) {
                  return (
                    <OSStateView
                      mode="empty"
                      title="Danh sách trống"
                      message="Các video bạn xem, thích hoặc lưu sẽ xuất hiện tại đây."
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-2xl bg-zinc-900 border border-white/10 flex items-center gap-3"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void handleOpenWatch({
                              videoId: item.video_id,
                              title: item.title,
                              channelTitle: item.channel_title,
                              channelId: item.channel_id,
                              thumbnail: item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`,
                              durationLabel: item.duration_label,
                              startSec: libSection === 'history' ? item.progress_sec || 0 : 0,
                            })
                          }
                          className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                          <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-zinc-800 shrink-0">
                            <img
                              src={item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            {libSection === 'history' && (item.progress_sec || 0) > 0 && (
                              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-white text-[9px] font-mono">
                                {formatSec(item.progress_sec || 0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white line-clamp-2">{item.title}</p>
                            <p className="text-[11px] text-zinc-400 truncate">{item.channel_title}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await osApi.deleteYoutubeLibrary(item.id);
                            await refreshData();
                          }}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}

            {/* Playlists CRUD */}
            {libSection === 'playlists' && !activePlaylist && (
              <div className="space-y-3">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newPlaylistName.trim()) return;
                    await osApi.createYoutubePlaylist({ name: newPlaylistName.trim() });
                    setNewPlaylistName('');
                    await loadPlaylists();
                    showToast('Danh sách phát', 'Đã tạo danh sách phát mới', 'success');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Tên danh sách phát mới..."
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-zinc-900 border border-white/15 text-xs text-white outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistName.trim()}
                    className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>Tạo</span>
                  </button>
                </form>

                {playlists.length === 0 ? (
                  <OSStateView mode="empty" title="Chưa có danh sách phát" message="Tạo danh sách phát để gom video yêu thích." />
                ) : (
                  <div className="space-y-2">
                    {playlists.map((pl) => (
                      <div
                        key={pl.id}
                        className="p-3 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => setActivePlaylist(pl)}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                            {pl.items?.[0] ? (
                              <img
                                src={pl.items[0].thumbnail_url || `https://i.ytimg.com/vi/${pl.items[0].video_id}/hqdefault.jpg`}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Film className="w-5 h-5 text-zinc-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{pl.name}</p>
                            <p className="text-[11px] text-zinc-400">{pl.items?.length || 0} video</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await osApi.deleteYoutubePlaylist(pl.id);
                            await loadPlaylists();
                          }}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                          title="Xóa danh sách phát"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {libSection === 'playlists' && activePlaylist && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePlaylist(null)}
                    className="min-h-[40px] px-3 rounded-xl bg-zinc-900 border border-white/10 text-xs font-semibold"
                  >
                    ← Tất cả danh sách
                  </button>
                  <p className="text-xs font-bold text-white truncate">{activePlaylist.name}</p>
                </div>
                {(activePlaylist.items || []).length === 0 ? (
                  <OSStateView mode="empty" title="Danh sách phát trống" message="Mở video và nhấn Lưu danh sách để thêm." />
                ) : (
                  activePlaylist.items.map((v) => (
                    <div
                      key={v.video_id}
                      className="p-2.5 rounded-2xl bg-zinc-900 border border-white/10 flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void handleOpenWatch(
                            {
                              videoId: v.video_id,
                              title: v.title,
                              channelTitle: v.channel_title,
                              thumbnail: v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`,
                              durationLabel: v.duration_label,
                            },
                            activePlaylist.items.map((x) => ({
                              videoId: x.video_id,
                              title: x.title,
                              channelTitle: x.channel_title,
                              thumbnail: x.thumbnail_url || `https://i.ytimg.com/vi/${x.video_id}/hqdefault.jpg`,
                              durationLabel: x.duration_label,
                            }))
                          )
                        }
                        className="flex-1 min-w-0 flex items-center gap-3 text-left"
                      >
                        <img
                          src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-24 aspect-video rounded-xl object-cover bg-zinc-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white line-clamp-2">{v.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{v.channel_title}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await osApi.updateYoutubePlaylist(activePlaylist.id, { removeVideoId: v.video_id });
                          setActivePlaylist(r.playlist);
                          await loadPlaylists();
                        }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persistent Active Mini-Bar */}
      {activeYouTube && (
        <div className="shrink-0 px-3 py-1.5 bg-zinc-900 border-t border-white/10 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              setWatchVideo({
                videoId: activeYouTube.videoId,
                title: activeYouTube.title,
                channelTitle: activeYouTube.channelTitle,
                channelId: activeYouTube.channelId,
                thumbnail: activeYouTube.thumbnail,
                durationLabel: activeYouTube.durationLabel,
              })
            }
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
          >
            <img
              src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
              alt=""
              referrerPolicy="no-referrer"
              className="w-12 aspect-video rounded-lg object-cover bg-zinc-800 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{activeYouTube.title}</p>
              <p className="text-[10px] text-zinc-400 truncate">{activeYouTube.channelTitle}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={toggleYouTubePlay}
            className="min-h-[40px] min-w-[40px] rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0"
          >
            {activeYouTube.isPlaying ? <Tv className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      )}

      {/* 5-Tab Bottom Navigation Bar */}
      <nav className="shrink-0 h-15 px-1.5 bg-zinc-950/95 backdrop-blur-md border-t border-white/10 grid grid-cols-5 items-center">
        {(
          [
            ['home', 'Trang chủ', Home],
            ['shorts', 'Shorts', Zap],
            ['subscriptions', 'Đăng ký', Users],
            ['premium', 'Premium', Crown],
            ['library', 'Thư viện', Plus],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                active
                  ? id === 'premium'
                    ? 'text-amber-400 font-bold'
                    : 'text-rose-500 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Notifications Drawer */}
      {notificationsOpen && (
        <div
          onClick={() => setNotificationsOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-zinc-950 border border-white/15 p-4 space-y-3 max-h-[80vh] overflow-y-auto os-scroll shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-500" />
                <span>Thông báo YouTube & Thanh toán</span>
              </h3>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 flex items-center justify-center text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {(streamingOverview?.notifications || []).length === 0 ? (
              <p className="text-xs text-zinc-400 py-6 text-center">Chưa có thông báo mới.</p>
            ) : (
              <div className="space-y-2">
                {(streamingOverview?.notifications || []).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-2xl bg-zinc-900 border border-white/10 p-3 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{n.title}</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(n.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bank Card Checkout Modal */}
      <YouTubePremiumCheckoutModal
        open={Boolean(checkoutIntent)}
        intent={checkoutIntent}
        currentSavedCardId={membership?.savedCard?.cardId}
        onClose={() => setCheckoutIntent(null)}
        onCompleted={(nextOv, msg) => {
          setStreamingOverview(nextOv);
          void refreshData();
          showToast('YouTube Premium', msg, 'success');
        }}
      />
    </div>
  );
}
