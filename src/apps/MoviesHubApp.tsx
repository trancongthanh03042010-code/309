import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clapperboard,
  CreditCard,
  ExternalLink,
  Heart,
  Play,
  Search,
  Star,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import { OSAppHeader, OSRealityLabel, OSSegmentedControl, OSStateView } from '../components/ui/OSDesignSystem';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

interface MovieCatalogItem {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  genre: string;
  duration?: string;
  rating: number;
  poster: string;
  synopsis: string;
  trailerYoutubeId: string;
  providers: Array<{ name: string; url: string; note?: string }>;
}

export function MoviesHubApp() {
  const { data, refreshData, showToast } = useOS();
  const [tab, setTab] = useState<'discover' | 'watchlist' | 'favorites'>('discover');
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Tất cả');
  const [catalog, setCatalog] = useState<MovieCatalogItem[]>([]);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MovieCatalogItem | null>(null);
  const [playingTrailer, setPlayingTrailer] = useState(false);
  const [rentedMovieIds, setRentedMovieIds] = useState<string[]>([]);
  const [cardCheckoutMovie, setCardCheckoutMovie] = useState<MovieCatalogItem | null>(null);

  useEffect(() => {
    setLoading(true);
    osApi
      .getMoviesCatalog()
      .then((res) => {
        setCatalog(res.items || []);
        setApiConfigured(Boolean(res.tmdbConfigured));
        setNotice(res.note || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const watchlist = data?.movieWatchlist || [];

  const watchlistMap = useMemo(() => {
    const map = new Map<string, (typeof watchlist)[number]>();
    for (const item of watchlist) {
      map.set(item.movie_id, item);
    }
    return map;
  }, [watchlist]);

  const genres = useMemo(() => ['Tất cả', ...Array.from(new Set(catalog.map((c) => c.genre)))], [catalog]);

  const displayedCatalog = useMemo(() => {
    return catalog.filter((m) => {
      const saved = watchlistMap.get(m.id);
      if (tab === 'watchlist' && !saved?.is_watchlisted) return false;
      if (tab === 'favorites' && !saved?.is_favorite) return false;
      if (genre !== 'Tất cả' && m.genre !== genre) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.synopsis.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalog, watchlistMap, tab, genre, search]);

  const handleSaveEntry = async (
    movie: MovieCatalogItem,
    patch: { is_watchlisted?: number; is_favorite?: number; user_rating?: number }
  ) => {
    const cur = watchlistMap.get(movie.id);
    await osApi.updateMovieWatchlist({
      movie_id: movie.id,
      title: movie.title,
      poster_url: movie.poster,
      is_watchlisted: patch.is_watchlisted ?? cur?.is_watchlisted ?? 0,
      is_favorite: patch.is_favorite ?? cur?.is_favorite ?? 0,
      user_rating: patch.user_rating ?? cur?.user_rating ?? 0,
    });
    await refreshData();
  };

  if (selected) {
    const saved = watchlistMap.get(selected.id);
    return (
      <div className="flex-1 flex flex-col bg-[var(--os-bg)] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-[var(--os-surface)] border-b border-[var(--os-border)] flex items-center justify-between shrink-0">
          <button
            onClick={() => {
              setSelected(null);
              setPlayingTrailer(false);
            }}
            className="min-h-[36px] flex items-center gap-1.5 text-xs font-semibold text-[var(--os-primary)]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Trung tâm Phim</span>
          </button>
          <OSRealityLabel type="B" detail={apiConfigured ? 'TMDB API + Trailer' : 'Trailer chính thức'} />
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          {playingTrailer && selected.trailerYoutubeId ? (
            <div className="space-y-2">
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${selected.trailerYoutubeId}?autoplay=1&rel=0`}
                  title={`Trailer ${selected.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${selected.trailerYoutubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-rose-500 font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Mở Trailer trên YouTube
              </a>
            </div>
          ) : (
            <div className="flex gap-3.5">
              <img
                src={selected.poster}
                alt={selected.title}
                className="w-28 h-40 rounded-2xl object-cover bg-zinc-800 shrink-0 shadow-lg"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="font-display text-lg font-bold leading-snug">{selected.title}</h2>
                <p className="text-xs text-zinc-500">
                  {selected.year} · {selected.genre} · Đánh giá {selected.rating.toFixed(1)}/10
                </p>
                {selected.trailerYoutubeId && (
                  <button
                    onClick={() => setPlayingTrailer(true)}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Xem Trailer chính thức</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Watchlist, Favorite, Rating Actions */}
          <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const next = saved?.is_watchlisted ? 0 : 1;
                  await handleSaveEntry(selected, { is_watchlisted: next });
                  showToast('Danh sách xem', next ? 'Đã thêm vào Danh sách muốn xem' : 'Đã bỏ khỏi Danh sách xem');
                }}
                className={`min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  saved?.is_watchlisted
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-zinc-100 dark:bg-zinc-900'
                }`}
              >
                {saved?.is_watchlisted ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                <span>{saved?.is_watchlisted ? 'Đã lưu xem sau' : 'Lưu xem sau'}</span>
              </button>

              <button
                onClick={async () => {
                  const next = saved?.is_favorite ? 0 : 1;
                  await handleSaveEntry(selected, { is_favorite: next });
                  showToast('Yêu thích', next ? 'Đã thêm vào Phim yêu thích' : 'Đã bỏ Yêu thích');
                }}
                className={`min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  saved?.is_favorite ? 'bg-rose-500/15 text-rose-500' : 'bg-zinc-100 dark:bg-zinc-900'
                }`}
              >
                <Heart className={`w-4 h-4 ${saved?.is_favorite ? 'fill-rose-500' : ''}`} />
                <span>{saved?.is_favorite ? 'Đã thích' : 'Yêu thích'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--os-border)]">
              <span className="text-xs font-medium">Đánh giá của bạn</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={async () => {
                      await handleSaveEntry(selected, { user_rating: star });
                      showToast('Đánh giá phim', `Đã chấm ${star}/5 sao cho ${selected.title}`, 'success');
                    }}
                    className="p-1"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        (saved?.user_rating || 0) >= star ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-1.5">
            <p className="text-xs font-bold">Nội dung tóm tắt</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{selected.synopsis}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2">
            <p className="text-xs font-bold">Xem bản quyền trên nền tảng chính thức</p>
            <p className="text-[11px] text-zinc-500">
              PHONE OS chỉ hỗ trợ trailer chính thức và liên kết trực tiếp tới nhà cung cấp hợp pháp.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {selected.providers.map((prov) => (
                <a
                  key={prov.name}
                  href={prov.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] px-3 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <span>{prov.name}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2">
            <p className="text-xs font-bold">Thuê phim / Đặt vé rạp kỹ thuật số</p>
            {rentedMovieIds.includes(selected.id) ? (
              <div className="min-h-[42px] px-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Đã mở khóa vé / bản quyền xem phim này qua Thẻ Hikari</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCardCheckoutMovie(selected)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>Thuê phim / Đặt vé rạp (75.000đ) qua thẻ ngân hàng</span>
              </button>
            )}
          </div>
        </div>

        <UniversalCardCheckoutModal
          open={Boolean(cardCheckoutMovie)}
          title={`Thuê phim / Vé rạp · ${cardCheckoutMovie?.title || ''}`}
          merchant={`Cinema Hub · ${cardCheckoutMovie?.title || ''}`}
          category="Giải trí"
          amount={75000}
          channelType="online"
          appSource="Trung tâm Phim"
          onClose={() => setCardCheckoutMovie(null)}
          onSuccess={(res) => {
            if (cardCheckoutMovie) {
              setRentedMovieIds((prev) =>
                prev.includes(cardCheckoutMovie.id) ? prev : [...prev, cardCheckoutMovie.id]
              );
            }
            showToast(
              'Đặt vé / Thuê phim thành công',
              `Đã thanh toán 75.000đ · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
              'success'
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--os-bg)] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <OSAppHeader
        title="Trung tâm Phim"
        subtitle="Khám phá, Trailer chính thức & Watchlist"
        rightAction={<OSRealityLabel type="B/D" detail={apiConfigured ? 'TMDB API' : 'Trailer & Catalog'} />}
      />

      <div className="px-3.5 pt-2.5 pb-2 bg-[var(--os-surface)] border-b border-[var(--os-border)] space-y-2 shrink-0">
        <OSSegmentedControl
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { id: 'discover', label: 'Khám phá' },
            { id: 'watchlist', label: 'Xem sau' },
            { id: 'favorites', label: 'Yêu thích' },
          ]}
        />

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm phim, thể loại..."
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              className={`min-h-[32px] px-3 rounded-xl text-[11px] font-semibold shrink-0 ${
                genre === g ? 'bg-[var(--os-primary)] text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {notice && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
            {notice}
          </div>
        )}

        {loading ? (
          <OSStateView mode="loading" title="Đang tải danh mục phim..." />
        ) : displayedCatalog.length === 0 ? (
          <OSStateView
            mode="empty"
            title="Chưa có phim phù hợp"
            message="Hãy thêm phim vào danh sách Xem sau hoặc đổi bộ lọc tìm kiếm."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {displayedCatalog.map((m) => {
              const saved = watchlistMap.get(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className="rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] overflow-hidden text-left hover:border-[var(--os-primary)] transition-colors flex flex-col"
                >
                  <div className="relative aspect-[16/10] w-full bg-zinc-900">
                    <img src={m.poster} alt={m.title} className="w-full h-full object-cover" />
                    {saved?.is_watchlisted ? (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                        <BookmarkCheck className="w-3.5 h-3.5" />
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-bold line-clamp-1">{m.title}</p>
                      <p className="text-[10px] text-zinc-500">
                        {m.year} · {m.genre}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="text-amber-500 font-semibold flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400" /> {m.rating.toFixed(1)}
                      </span>
                      {saved?.user_rating ? (
                        <span className="text-violet-500 font-semibold">Bạn: {saved.user_rating}★</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
