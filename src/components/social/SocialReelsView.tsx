import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Heart,
  MessageSquare,
  Music,
  Pause,
  Play,
  Plus,
  Share2,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialVideoItem } from '../../types/social';
import { formatCompactCount, UserAvatar, VerifiedBadge } from './SocialUI';
import { SocialCommentsSheet } from './SocialCommentsSheet';

interface SocialReelsViewProps {
  currentUserId: string;
  onOpenProfile: (userId: string) => void;
  onCreateVideo: () => void;
  onShareVideo: (video: SocialVideoItem) => void;
  onReportVideo: (videoId: string) => void;
  showToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function SocialReelsView({
  currentUserId,
  onOpenProfile,
  onCreateVideo,
  onShareVideo,
  onReportVideo,
  showToast,
}: SocialReelsViewProps) {
  const [videos, setVideos] = useState<SocialVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progressSec, setProgressSec] = useState(0);
  const [commentTarget, setCommentTarget] = useState<SocialVideoItem | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const watchStartRef = useRef<number>(Date.now());
  const loggedIdsRef = useRef<Set<string>>(new Set());

  const loadVideos = async () => {
    setLoading(true);
    try {
      const res = await socialApi.getVideos();
      setVideos(res.videos);
    } catch (err) {
      showToast('Video ngắn', err instanceof Error ? err.message : 'Không tải được video', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  const currentVideo = videos[activeIdx];

  // Track watch telemetry when switching reels
  useEffect(() => {
    if (!currentVideo) return;
    watchStartRef.current = Date.now();
    setProgressSec(0);
    setPaused(false);

    const vidEl = videoRefs.current[currentVideo.id];
    if (vidEl) {
      vidEl.currentTime = currentVideo.trim_start_sec || 0;
      vidEl.muted = muted;
      void vidEl.play().catch(() => {});
    }

    return () => {
      const elapsed = Date.now() - watchStartRef.current;
      const durMs = (currentVideo.duration_sec || 15) * 1000;
      const skipped = elapsed < 2500;
      const completed = elapsed >= durMs * 0.75;
      if (!loggedIdsRef.current.has(currentVideo.id) && elapsed > 400) {
        loggedIdsRef.current.add(currentVideo.id);
        void socialApi.logVideoWatch(currentVideo.id, { watch_ms: elapsed, completed, skipped }).catch(() => {});
      }
      if (vidEl) vidEl.pause();
    };
  }, [activeIdx, currentVideo?.id]);

  // Playback progress loop for non-MP4 / canvas-motion reels & seek sync
  useEffect(() => {
    if (!currentVideo || paused) return;
    const dur = Math.max(5, currentVideo.duration_sec || 18);
    const id = setInterval(() => {
      const vidEl = videoRefs.current[currentVideo.id];
      if (vidEl && currentVideo.video_url) {
        setProgressSec(vidEl.currentTime);
      } else {
        setProgressSec((s) => (s + 0.25 >= dur ? 0 : s + 0.25));
      }
    }, 250);
    return () => clearInterval(id);
  }, [currentVideo?.id, paused]);

  const handleTogglePlay = () => {
    if (!currentVideo) return;
    const vidEl = videoRefs.current[currentVideo.id];
    setPaused((p) => {
      const next = !p;
      if (vidEl) {
        if (next) vidEl.pause();
        else void vidEl.play().catch(() => {});
      }
      return next;
    });
  };

  const handleSeek = (sec: number) => {
    if (!currentVideo) return;
    setProgressSec(sec);
    const vidEl = videoRefs.current[currentVideo.id];
    if (vidEl) vidEl.currentTime = sec;
  };

  const handleLike = async (v: SocialVideoItem) => {
    const res = await socialApi.reactVideo(v.id);
    setVideos((prev) =>
      prev.map((item) => (item.id === v.id ? { ...item, is_liked: res.liked, likes_count: res.likes_count } : item))
    );
  };

  const handleSave = async (v: SocialVideoItem) => {
    const res = await socialApi.saveItem(v.id, 'video');
    setVideos((prev) =>
      prev.map((item) =>
        item.id === v.id
          ? { ...item, is_saved: res.saved, saves_count: Math.max(0, item.saves_count + (res.saved ? 1 : -1)) }
          : item
      )
    );
    showToast('Bộ sưu tập', res.saved ? 'Đã lưu video' : 'Đã bỏ lưu video');
  };

  const handleFollow = async (v: SocialVideoItem) => {
    const res = await socialApi.toggleFollow(v.author_id);
    setVideos((prev) => prev.map((item) => (item.author_id === v.author_id ? { ...item, is_following: res.following } : item)));
  };

  if (loading) {
    return (
      <div className="flex-1 bg-black text-white flex items-center justify-center text-xs">
        Đang tải bảng Video ngắn...
      </div>
    );
  }

  return (
    <div className="relative flex-1 bg-black text-white overflow-hidden flex flex-col">
      {/* Top Overlay Header */}
      <div className="absolute top-0 inset-x-0 z-20 p-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <h2 className="text-sm font-bold tracking-tight">Video ngắn</h2>
          <p className="text-[10px] text-white/70">Đề xuất theo sở thích của bạn</p>
        </div>
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              setMuted((m) => {
                const next = !m;
                if (currentVideo && videoRefs.current[currentVideo.id]) {
                  videoRefs.current[currentVideo.id]!.muted = next;
                }
                return next;
              });
            }}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-black/45 backdrop-blur-md flex items-center justify-center"
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onCreateVideo}
            className="min-h-[44px] px-3 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Đăng
          </button>
        </div>
      </div>

      {/* Vertical Snap Feed */}
      <div
        ref={containerRef}
        onScroll={() => {
          const el = containerRef.current;
          if (!el || el.clientHeight === 0) return;
          const idx = Math.round(el.scrollTop / el.clientHeight);
          if (idx !== activeIdx && idx >= 0 && idx < videos.length) {
            setActiveIdx(idx);
          }
        }}
        className="flex-1 overflow-y-scroll snap-y snap-mandatory os-scroll-hidden"
      >
        {videos.map((v, idx) => {
          const isCurrent = idx === activeIdx;
          const dur = Math.max(5, v.duration_sec || 18);
          return (
            <div key={v.id} className="relative w-full h-full snap-start shrink-0 overflow-hidden bg-zinc-950">
              {v.video_url ? (
                <video
                  ref={(el) => {
                    videoRefs.current[v.id] = el;
                  }}
                  src={v.video_url}
                  poster={v.cover_url}
                  loop
                  playsInline
                  muted={muted}
                  onClick={handleTogglePlay}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div onClick={handleTogglePlay} className="relative w-full h-full overflow-hidden">
                  <img
                    src={v.cover_url}
                    alt={v.title}
                    className={`w-full h-full object-cover transition-transform duration-[12000ms] ease-linear ${
                      isCurrent && !paused ? 'scale-110' : 'scale-100'
                    }`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
                </div>
              )}

              {isCurrent && paused && (
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center"
                >
                  <Play className="w-8 h-8 fill-white ml-0.5" />
                </button>
              )}

              {/* Right Action Column */}
              <div className="absolute right-2.5 bottom-20 z-20 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenProfile(v.author_id)}
                  className="relative"
                >
                  <UserAvatar src={v.author_avatar} name={v.author_name} size="md" ring />
                  {v.author_id !== currentUserId && !v.is_following && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleFollow(v);
                      }}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                    >
                      <UserPlus className="w-3 h-3" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleLike(v)}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Heart className={`w-5 h-5 ${v.is_liked ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                  </span>
                  <span className="text-[11px] font-mono-num">{formatCompactCount(v.likes_count)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCommentTarget(v)}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </span>
                  <span className="text-[11px] font-mono-num">{formatCompactCount(v.comments_count)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleSave(v)}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Bookmark className={`w-5 h-5 ${v.is_saved ? 'fill-amber-400 text-amber-400' : 'text-white'}`} />
                  </span>
                  <span className="text-[11px] font-mono-num">{formatCompactCount(v.saves_count)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareVideo(v)}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <span className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Share2 className="w-5 h-5" />
                  </span>
                  <span className="text-[11px] font-mono-num">{formatCompactCount(v.shares_count)}</span>
                </button>
              </div>

              {/* Bottom Caption & Scrubbable Timeline */}
              <div className="absolute inset-x-3 bottom-3 z-20 pr-14 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(v.author_id)}
                    className="text-xs font-bold flex items-center gap-1 hover:underline"
                  >
                    @{v.author_username || v.author_id}
                    <VerifiedBadge verified={v.author_verified} />
                  </button>
                  {v.author_id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => void handleFollow(v)}
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${
                        v.is_following ? 'border-white/30 text-white/80' : 'border-rose-500 bg-rose-600 text-white'
                      }`}
                    >
                      {v.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold">{v.title}</p>
                  {v.description && <p className="text-[11px] text-white/80 line-clamp-2 mt-0.5">{v.description}</p>}
                  <p className="text-[11px] text-indigo-300 mt-0.5">{v.hashtags.join(' ')}</p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-white/85">
                  <Music className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{v.audio_title}</span>
                </div>

                {/* Seekbar */}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleTogglePlay} className="p-1">
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={dur}
                    step={0.5}
                    value={isCurrent ? Math.min(dur, progressSec) : 0}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="flex-1 accent-rose-500 h-1"
                    aria-label="Thanh tua video"
                  />
                  <span className="text-[10px] font-mono-num text-white/75">
                    {Math.floor(isCurrent ? progressSec : 0)}s/{dur}s
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {commentTarget && (
        <SocialCommentsSheet
          targetType="video"
          targetId={commentTarget.id}
          ownerId={commentTarget.author_id}
          commentPolicy={commentTarget.allow_comments ? 'everyone' : 'off'}
          currentUserId={currentUserId}
          onClose={() => setCommentTarget(null)}
          onCountChanged={() => {
            setVideos((prev) =>
              prev.map((item) =>
                item.id === commentTarget.id ? { ...item, comments_count: item.comments_count + 1 } : item
              )
            );
          }}
          onOpenProfile={(uid) => {
            setCommentTarget(null);
            onOpenProfile(uid);
          }}
          onReportComment={(cid) => onReportVideo(cid)}
        />
      )}
    </div>
  );
}
