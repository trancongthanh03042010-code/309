import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  Download,
  Film,
  Heart,
  Lock,
  Play,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  X,
} from 'lucide-react';
import { ApiHttpError, osApi } from '../../services/api';
import type {
  YouTubeEpisodeItem,
  YouTubeMovieAccessResult,
  YouTubeMovieItem,
  YouTubePlanConfig,
  YouTubeStreamingOverview,
} from '../../types/os';
import type { YouTubeCheckoutIntent } from './YouTubePremiumCheckoutModal';
import { YouTubeMoviePlayer } from './YouTubeMoviePlayer';

interface YouTubeMovieDetailViewProps {
  movie: YouTubeMovieItem;
  overview: YouTubeStreamingOverview;
  onBack: () => void;
  onOverviewUpdated: (next: YouTubeStreamingOverview) => void;
  onOpenPremiumTab: () => void;
  onOpenCheckout: (intent: YouTubeCheckoutIntent) => void;
  onToast: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatVnd(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')}đ`;
}

export function YouTubeMovieDetailView({
  movie,
  overview,
  onBack,
  onOverviewUpdated,
  onOpenPremiumTab,
  onOpenCheckout,
  onToast,
}: YouTubeMovieDetailViewProps) {
  const [playSession, setPlaySession] = useState<{
    episode: YouTubeEpisodeItem;
    access: YouTubeMovieAccessResult;
  } | null>(null);
  const [paywallAccess, setPaywallAccess] = useState<YouTubeMovieAccessResult | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [downloadedEps, setDownloadedEps] = useState<Record<number, boolean>>({});

  const liveMovie = overview.movies.find((m) => m.id === movie.id) || movie;

  const handlePlayEpisode = async (epNum: number) => {
    if (checkingAccess) return;
    setCheckingAccess(true);
    try {
      const res = await osApi.playYoutubeMovie(liveMovie.id, epNum);
      const selectedEp =
        res.episode ||
        liveMovie.episodes.find((e) => e.episodeNumber === epNum) ||
        liveMovie.episodes[0];
      setPaywallAccess(null);
      setPlaySession({ episode: selectedEp, access: res.access });
    } catch (err) {
      if (err instanceof ApiHttpError && err.details?.access) {
        setPaywallAccess(err.details.access as unknown as YouTubeMovieAccessResult);
      } else {
        try {
          const check = await osApi.checkYoutubeMovieAccess(liveMovie.id);
          setPaywallAccess(check);
        } catch {
          onToast('Không thể phát phim', err instanceof Error ? err.message : 'Vui lòng kiểm tra gói thành viên.', 'error');
        }
      }
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      const res = await osApi.toggleYoutubeMovieFavorite(liveMovie.id);
      onOverviewUpdated(res.overview);
      onToast(
        'Danh sách yêu thích',
        res.isFavorite ? `Đã thêm "${liveMovie.title}" vào Yêu thích.` : `Đã bỏ "${liveMovie.title}" khỏi Yêu thích.`,
        'success'
      );
    } catch {
      onToast('Lỗi', 'Không thể cập nhật danh sách yêu thích.', 'error');
    }
  };

  const handleDownloadEpisode = async (epNum: number) => {
    try {
      const check = await osApi.checkYoutubeMovieAccess(liveMovie.id);
      if (!check.allowed || !check.downloadAllowed) {
        setPaywallAccess(check);
        onToast(
          'Cần nâng cấp gói',
          'Tính năng tải xuống ngoại tuyến dành cho gói Standard (79.000đ) trở lên hoặc phim đã mua.',
          'info'
        );
        return;
      }
      setDownloadedEps((prev) => ({ ...prev, [epNum]: true }));
      onToast('Tải xuống hoàn tất', `Đã lưu ${liveMovie.title} - Tập ${epNum} vào bộ nhớ thiết bị.`, 'success');
    } catch {
      onToast('Lỗi', 'Không thể tải xuống lúc này.', 'error');
    }
  };

  if (playSession) {
    const resumeTime =
      liveMovie.progress?.episodeNumber === playSession.episode.episodeNumber
        ? liveMovie.progress.progressSec
        : 0;
    return (
      <YouTubeMoviePlayer
        movie={liveMovie}
        episode={playSession.episode}
        access={playSession.access}
        initialTimeSec={resumeTime}
        onClose={() => setPlaySession(null)}
        onSelectEpisode={(n) => void handlePlayEpisode(n)}
        onRequestUpgrade={() => {
          setPlaySession(null);
          onOpenPremiumTab();
        }}
        onToast={onToast}
      />
    );
  }

  const plans = overview.plans;
  const recommendedPlan: YouTubePlanConfig | undefined = paywallAccess
    ? plans.find((p) => p.id === paywallAccess.recommendedPlanId)
    : plans.find((p) => p.id === (liveMovie.minTier === 'free' ? 'basic' : liveMovie.minTier));

  const accessBadgeText =
    liveMovie.accessType === 'FREE'
      ? 'FREE · Miễn phí'
      : liveMovie.accessType === 'LOCKED'
      ? 'LOCKED · Sắp phát hành'
      : liveMovie.isUnlocked
      ? liveMovie.entitlement?.entitlementType === 'buy'
        ? 'ĐÃ MUA VĨNH VIỄN'
        : liveMovie.entitlement?.entitlementType === 'rent'
        ? 'ĐANG THUÊ (72H)'
        : 'ĐÃ MỞ KHÓA'
      : liveMovie.accessType === 'RENT'
      ? `RENT · Thuê ${formatVnd(liveMovie.rentPrice)}`
      : liveMovie.accessType === 'BUY'
      ? `BUY · Mua ${formatVnd(liveMovie.buyPrice)}`
      : `PREMIUM · Từ gói ${liveMovie.minTier.toUpperCase()}`;

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Bar */}
      <div className="shrink-0 h-12 px-3 bg-zinc-950/95 border-b border-white/10 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] -ml-1 rounded-xl flex items-center justify-center text-zinc-200 hover:bg-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="text-xs font-bold truncate flex-1">{liveMovie.title}</p>
        <button
          type="button"
          onClick={() => void handleToggleFavorite()}
          className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center ${
            liveMovie.isFavorite ? 'text-rose-500' : 'text-zinc-300 hover:bg-white/10'
          }`}
          title="Yêu thích"
        >
          <Heart className={`w-5 h-5 ${liveMovie.isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll pb-8">
        {/* Cinematic Backdrop & Poster Header */}
        <div className="relative">
          <div className="relative h-56 sm:h-72 w-full bg-zinc-900 overflow-hidden">
            <img
              src={liveMovie.backdropUrl || liveMovie.posterUrl}
              alt={liveMovie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
          </div>

          <div className="px-4 -mt-20 relative z-10 flex items-end gap-3.5">
            <div className="w-24 sm:w-28 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 border border-white/15 shadow-2xl shrink-0">
              <img
                src={liveMovie.posterUrl}
                alt={liveMovie.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 pb-1 space-y-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-0.5 rounded-md ${
                  liveMovie.accessType === 'FREE' || liveMovie.isUnlocked
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : liveMovie.accessType === 'LOCKED'
                    ? 'bg-zinc-700 text-zinc-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {!liveMovie.isUnlocked && liveMovie.accessType !== 'FREE' && <Lock className="w-3 h-3" />}
                <span>{accessBadgeText}</span>
              </span>

              <h1 className="text-lg sm:text-xl font-black text-white leading-tight">{liveMovie.title}</h1>
              <p className="text-xs text-zinc-400">
                {liveMovie.genre} · {liveMovie.year} · {liveMovie.durationLabel} · ★ {liveMovie.rating} · {liveMovie.maxSourceQuality}
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action CTAs */}
        <div className="p-4 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={checkingAccess}
              onClick={() => void handlePlayEpisode(liveMovie.progress?.episodeNumber || 1)}
              className="min-h-[48px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 active:scale-[0.98] transition-transform"
            >
              {!liveMovie.isUnlocked && liveMovie.accessType !== 'FREE' ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
              <span>
                {checkingAccess
                  ? 'Đang kiểm tra quyền...'
                  : liveMovie.progress
                  ? `Tiếp tục xem (Tập ${liveMovie.progress.episodeNumber})`
                  : liveMovie.isUnlocked || liveMovie.accessType === 'FREE'
                  ? 'Xem ngay'
                  : liveMovie.accessType === 'RENT'
                  ? `Thuê phim · ${formatVnd(liveMovie.rentPrice)}`
                  : liveMovie.accessType === 'BUY'
                  ? `Mua phim · ${formatVnd(liveMovie.buyPrice)}`
                  : 'Mở khóa & Xem ngay'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTrailerOpen(true)}
                className="min-h-[48px] px-3 rounded-2xl bg-zinc-900 border border-white/15 hover:bg-zinc-800 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Film className="w-4 h-4 text-rose-400" />
                <span>Trailer</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleFavorite()}
                className={`min-h-[48px] px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                  liveMovie.isFavorite
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-zinc-900 border-white/15 text-zinc-200'
                }`}
              >
                <Heart className={`w-4 h-4 ${liveMovie.isFavorite ? 'fill-current' : ''}`} />
                <span>{liveMovie.isFavorite ? 'Đã yêu thích' : 'Yêu thích'}</span>
              </button>
            </div>
          </div>

          {/* Rent / Buy Direct Buttons when applicable */}
          {!liveMovie.isUnlocked && (liveMovie.accessType === 'RENT' || liveMovie.accessType === 'BUY') && (
            <div className="flex flex-wrap gap-2">
              {liveMovie.rentPrice > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenCheckout({ kind: 'movie', movie: liveMovie, mode: 'rent' })}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Ticket className="w-4 h-4" />
                  <span>Thuê 72 giờ · {formatVnd(liveMovie.rentPrice)}</span>
                </button>
              )}
              {liveMovie.buyPrice > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenCheckout({ kind: 'movie', movie: liveMovie, mode: 'buy' })}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Mua sở hữu · {formatVnd(liveMovie.buyPrice)}</span>
                </button>
              )}
            </div>
          )}

          {/* Description, Director & Cast */}
          <div className="rounded-3xl bg-zinc-900/75 border border-white/10 p-4 space-y-2.5 text-xs">
            <p className="text-zinc-200 leading-relaxed">{liveMovie.description}</p>
            <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-zinc-400">
              <p>
                <span className="text-zinc-500">Đạo diễn:</span>{' '}
                <span className="text-zinc-200 font-semibold">{liveMovie.director}</span>
              </p>
              <p>
                <span className="text-zinc-500">Diễn viên:</span>{' '}
                <span className="text-zinc-200">{liveMovie.cast.join(', ')}</span>
              </p>
              <p>
                <span className="text-zinc-500">Thể loại:</span>{' '}
                <span className="text-zinc-200">{liveMovie.categories.join(' · ')}</span>
              </p>
            </div>
          </div>

          {/* Episodes List */}
          <div className="space-y-2 pt-1">
            <h3 className="text-sm font-bold text-white">Danh sách tập ({liveMovie.episodes.length})</h3>
            <div className="space-y-2">
              {liveMovie.episodes.map((ep) => {
                const isDl = Boolean(downloadedEps[ep.episodeNumber]);
                return (
                  <div
                    key={ep.episodeNumber}
                    className="rounded-2xl bg-zinc-900/80 border border-white/10 p-3 flex items-center justify-between gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => void handlePlayEpisode(ep.episodeNumber)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          liveMovie.isUnlocked || liveMovie.accessType === 'FREE'
                            ? 'bg-rose-600 text-white'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {liveMovie.isUnlocked || liveMovie.accessType === 'FREE' ? (
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{ep.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {ep.durationLabel} · {ep.synopsis}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDownloadEpisode(ep.episodeNumber)}
                      className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center shrink-0 ${
                        isDl ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                      title="Tải xuống ngoại tuyến"
                    >
                      {isDl ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Paywall / Upgrade Prompt Screen */}
      {paywallAccess && !paywallAccess.allowed && (
        <div
          onClick={() => setPaywallAccess(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-zinc-950 border border-amber-500/35 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Crown className="w-5 h-5" />
                <span className="text-xs font-extrabold uppercase tracking-wider">
                  {paywallAccess.accessType === 'LOCKED' ? 'Nội dung đang khóa' : 'Yêu cầu quyền thành viên'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPaywallAccess(null)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 flex items-center justify-center text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-white">{liveMovie.title}</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">{paywallAccess.reasonMessage}</p>
            </div>

            {paywallAccess.accessType === 'PREMIUM' && recommendedPlan && (
              <div className="rounded-2xl bg-gradient-to-br from-rose-950/80 to-zinc-900 border border-rose-500/30 p-3.5 space-y-1.5">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Đề xuất: Gói YouTube {recommendedPlan.name} ({formatVnd(recommendedPlan.price)}/tháng)</span>
                </p>
                <p className="text-[11px] text-zinc-300">
                  Mở khóa phim {recommendedPlan.maxQuality} · {recommendedPlan.maxDevices} thiết bị · {recommendedPlan.adFreeScope}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {paywallAccess.accessType === 'PREMIUM' && recommendedPlan && (
                <button
                  type="button"
                  onClick={() => {
                    setPaywallAccess(null);
                    onOpenCheckout({
                      kind: 'plan',
                      plan: recommendedPlan,
                      actionLabel: `Đăng ký YouTube ${recommendedPlan.name}`,
                    });
                  }}
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-2"
                >
                  <Star className="w-4 h-4 fill-white" />
                  <span>Đăng ký ngay · {formatVnd(recommendedPlan.price)}/tháng</span>
                </button>
              )}

              {paywallAccess.canRent && (
                <button
                  type="button"
                  onClick={() => {
                    setPaywallAccess(null);
                    onOpenCheckout({ kind: 'movie', movie: liveMovie, mode: 'rent' });
                  }}
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-extrabold"
                >
                  Thuê phim 72h · {formatVnd(paywallAccess.rentPrice)}
                </button>
              )}

              {paywallAccess.canBuy && (
                <button
                  type="button"
                  onClick={() => {
                    setPaywallAccess(null);
                    onOpenCheckout({ kind: 'movie', movie: liveMovie, mode: 'buy' });
                  }}
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-extrabold"
                >
                  Mua sở hữu vĩnh viễn · {formatVnd(paywallAccess.buyPrice)}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setPaywallAccess(null);
                  onOpenPremiumTab();
                }}
                className="w-full min-h-[44px] px-4 rounded-2xl bg-zinc-900 border border-white/15 text-xs font-bold text-zinc-200"
              >
                Xem các gói thành viên
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trailer Official Embed Modal */}
      {trailerOpen && (
        <div
          onClick={() => setTrailerOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-zinc-950 border border-white/15 overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
              <span className="text-xs font-bold text-white truncate">Trailer: {liveMovie.title}</span>
              <button
                type="button"
                onClick={() => setTrailerOpen(false)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${liveMovie.trailerVideoId || 'LXb3EKWsInQ'}?autoplay=1&playsinline=1&rel=0`}
                title={`Trailer ${liveMovie.title}`}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
