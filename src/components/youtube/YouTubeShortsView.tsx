import React, { useEffect, useState } from 'react';
import {
  Check,
  Heart,
  MessageSquare,
  Pause,
  Play,
  Share2,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { YouTubeShortItem, YouTubeSubscription } from '../../types/os';
import type { YouTubeVideoCard } from './YouTubeWatchView';

interface YouTubeShortsViewProps {
  shorts: YouTubeShortItem[];
  subscriptions: YouTubeSubscription[];
  onToggleSubscribe: (creatorName: string) => Promise<void>;
  onOpenWatch: (video: YouTubeVideoCard) => void;
  onShareShort: (short: YouTubeShortItem) => void;
}

function formatCompactCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function YouTubeShortsView({
  shorts,
  subscriptions,
  onToggleSubscribe,
  onOpenWatch,
  onShareShort,
}: YouTubeShortsViewProps) {
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [playingId, setPlayingId] = useState<string>(shorts[0]?.id || '');
  const [muted, setMuted] = useState(false);
  const [embedId, setEmbedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!playingId) return;
    const timer = window.setInterval(() => {
      setProgressMap((prev) => {
        const cur = prev[playingId] || 0;
        const item = shorts.find((s) => s.id === playingId);
        const dur = item?.durationSec || 45;
        return { ...prev, [playingId]: cur + 1 >= dur ? 0 : cur + 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playingId, shorts]);

  if (shorts.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-zinc-400">
        Chưa có video Shorts nào.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto snap-y snap-mandatory bg-black os-scroll-hidden">
      {shorts.map((item) => {
        const isLiked = Boolean(likedIds[item.id]);
        const isSub = subscriptions.some(
          (s) => s.channel_title.toLowerCase() === item.creatorName.toLowerCase()
        );
        const isPlaying = playingId === item.id;
        const isEmbed = embedId === item.id;
        const elapsed = progressMap[item.id] || 0;
        const pct = Math.min(100, Math.round((elapsed / Math.max(1, item.durationSec)) * 100));

        return (
          <div
            key={item.id}
            className="relative h-full min-h-[460px] w-full snap-start flex flex-col justify-end overflow-hidden bg-zinc-950"
          >
            {/* Visual Backdrop or Real IFrame */}
            {isEmbed ? (
              <iframe
                src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&loop=1&rel=0`}
                title={item.title}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlayingId((prev) => (prev === item.id ? '' : item.id))}
                className="absolute inset-0 w-full h-full text-left"
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-1000 ${
                    isPlaying ? 'scale-105' : 'scale-100 opacity-80'
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                      <Play className="w-7 h-7 fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </button>
            )}

            {/* Top Controls */}
            <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
              <span className="text-xs font-extrabold tracking-tight text-white drop-shadow">
                Shorts · {item.category}
              </span>
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setEmbedId((prev) => (prev === item.id ? null : item.id))}
                  className="min-h-[38px] px-3 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[11px] font-bold text-white"
                >
                  {isEmbed ? 'Ảnh nền' : 'Phát IFrame'}
                </button>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="min-h-[40px] min-w-[40px] rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bottom Overlay + Right Action Column */}
            <div className="relative z-10 p-4 pb-5 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2.5 text-white">
                <div className="flex items-center gap-2.5">
                  <img
                    src={item.creatorAvatar}
                    alt={item.creatorName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-white/25 shrink-0"
                  />
                  <span className="text-xs font-bold truncate">{item.creatorName}</span>
                  <button
                    type="button"
                    onClick={() => void onToggleSubscribe(item.creatorName)}
                    className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 ${
                      isSub ? 'bg-white/20 text-white' : 'bg-white text-zinc-900'
                    }`}
                  >
                    {isSub ? <Check className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                    <span>{isSub ? 'Đã đăng ký' : 'Đăng ký'}</span>
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-bold leading-snug line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-white/80 line-clamp-2 mt-1">{item.caption}</p>
                </div>
              </div>

              {/* Right Action Bar */}
              <div className="flex flex-col items-center gap-3 shrink-0 text-white">
                <button
                  type="button"
                  onClick={() => setLikedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5"
                >
                  <div
                    className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center ${
                      isLiked ? 'bg-rose-600 text-white' : 'bg-black/45 border border-white/15'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-white' : ''}`} />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums">
                    {formatCompactCount(item.likesCount + (isLiked ? 1 : 0))}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenWatch({
                      videoId: item.videoId,
                      title: item.title,
                      channelTitle: item.creatorName,
                      thumbnail: item.thumbnailUrl,
                      category: item.category,
                      description: item.caption,
                    })
                  }
                  className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 border border-white/15 backdrop-blur-md flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums">
                    {formatCompactCount(item.commentsCount)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareShort(item)}
                  className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 border border-white/15 backdrop-blur-md flex items-center justify-center">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold">Chia sẻ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPlayingId((prev) => (prev === item.id ? '' : item.id))}
                  className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5"
                >
                  <div className="w-11 h-11 rounded-full bg-black/45 border border-white/15 backdrop-blur-md flex items-center justify-center">
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Bottom Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
