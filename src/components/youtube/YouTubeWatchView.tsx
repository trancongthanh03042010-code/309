import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FastForward,
  Heart,
  ListPlus,
  Lock,
  Maximize2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Rewind,
  Send,
  Share2,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import { socialApi } from '../../services/socialApi';
import type { YouTubeComment, YouTubePlaylist } from '../../types/os';

export interface YouTubeVideoCard {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnail: string;
  durationLabel?: string;
  viewCountText?: string;
  publishedTimeText?: string;
  category?: string;
  description?: string;
  startSec?: number;
}

interface YouTubeWatchViewProps {
  video: YouTubeVideoCard;
  suggestions: YouTubeVideoCard[];
  playlists: YouTubePlaylist[];
  onBack: () => void;
  onSelectVideo: (v: YouTubeVideoCard, queue?: YouTubeVideoCard[]) => void;
  onPlaylistsChanged: () => Promise<void>;
  onSubscriptionsChanged: () => Promise<void>;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function YouTubeWatchView({
  video,
  suggestions,
  playlists,
  onBack,
  onSelectVideo,
  onPlaylistsChanged,
  onSubscriptionsChanged,
}: YouTubeWatchViewProps) {
  const {
    activeYouTube,
    toggleYouTubePlay,
    setYouTubeFullscreen,
    seekYouTubeTo,
    setYouTubePlaybackRate,
    playNextYouTubeVideo,
    refreshData,
    openShareSheet,
    openApp,
    showToast,
  } = useOS();

  const [meta, setMeta] = useState<{
    liked: number;
    likesCount: number;
    inWatchLater: boolean;
    watchLaterId: string;
    isSubscribed: boolean;
    inPlaylistIds: string[];
  }>({
    liked: 0,
    likesCount: 120,
    inWatchLater: false,
    watchLaterId: '',
    isSubscribed: false,
    inPlaylistIds: [],
  });
  const [descExpanded, setDescExpanded] = useState(false);
  const [comments, setComments] = useState<YouTubeComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<YouTubeComment | null>(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingSocial, setSharingSocial] = useState(false);
  const [touchLocked, setTouchLocked] = useState(false);

  const isThisPlaying = activeYouTube?.videoId === video.videoId;
  const duration = isThisPlaying
    ? Math.max(activeYouTube.durationSec || 0, activeYouTube.progressSec || 0)
    : 0;

  useEffect(() => {
    let alive = true;
    osApi
      .getYoutubeVideoMeta(video.videoId, video.channelId || video.channelTitle)
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => {});
    osApi
      .getYoutubeComments(video.videoId)
      .then((r) => {
        if (alive) setComments(r.comments || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [video.videoId, video.channelId, video.channelTitle]);

  const handleToggleLike = async (value: 1 | -1) => {
    try {
      const res = await osApi.toggleYoutubeLike({
        video_id: video.videoId,
        title: video.title,
        channel_title: video.channelTitle,
        thumbnail_url: video.thumbnail,
        duration_label: video.durationLabel,
        value,
      });
      setMeta((m) => ({ ...m, liked: res.liked, likesCount: res.likesCount }));
      await refreshData();
    } catch (err) {
      showToast('Lỗi YouTube', err instanceof Error ? err.message : 'Không thể thực hiện', 'error');
    }
  };

  const handleToggleSubscribe = async () => {
    try {
      const res = await osApi.toggleYoutubeSubscribe({
        channel_id: video.channelId || video.channelTitle,
        channel_title: video.channelTitle,
      });
      setMeta((m) => ({ ...m, isSubscribed: res.subscribed }));
      await onSubscriptionsChanged();
      showToast('Kênh YouTube', res.subscribed ? `Đã đăng ký ${video.channelTitle}` : `Đã hủy đăng ký ${video.channelTitle}`, 'success');
    } catch {
      showToast('Lỗi', 'Không thể cập nhật đăng ký kênh', 'error');
    }
  };

  const handleToggleWatchLater = async () => {
    try {
      if (meta.inWatchLater && meta.watchLaterId) {
        await osApi.deleteYoutubeLibrary(meta.watchLaterId);
        setMeta((m) => ({ ...m, inWatchLater: false, watchLaterId: '' }));
        showToast('Xem sau', 'Đã bỏ khỏi danh sách Xem sau');
      } else {
        const saved = (await osApi.saveYoutubeLibrary({
          video_id: video.videoId,
          title: video.title,
          channel_title: video.channelTitle,
          thumbnail_url: video.thumbnail,
          duration_label: video.durationLabel,
          list_type: 'watch_later',
        })) as { id?: string };
        setMeta((m) => ({ ...m, inWatchLater: true, watchLaterId: saved?.id || '' }));
        showToast('Xem sau', 'Đã lưu vào Xem sau', 'success');
      }
      await refreshData();
    } catch {
      showToast('Lỗi', 'Không thể cập nhật Xem sau', 'error');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const res = await osApi.addYoutubeComment({
        video_id: video.videoId,
        parent_id: replyTo?.id || '',
        content: commentText.trim(),
      });
      setComments((prev) => [res.comment, ...prev]);
      setCommentText('');
      setReplyTo(null);
    } catch (err) {
      showToast('Lỗi bình luận', err instanceof Error ? err.message : 'Không thể gửi bình luận', 'error');
    }
  };

  const handleTogglePlaylistMembership = async (pl: YouTubePlaylist) => {
    const exists = meta.inPlaylistIds.includes(pl.id);
    try {
      await osApi.updateYoutubePlaylist(
        pl.id,
        exists
          ? { removeVideoId: video.videoId }
          : {
              addVideo: {
                video_id: video.videoId,
                title: video.title,
                channel_title: video.channelTitle,
                thumbnail_url: video.thumbnail,
                duration_label: video.durationLabel,
              },
            }
      );
      setMeta((m) => ({
        ...m,
        inPlaylistIds: exists ? m.inPlaylistIds.filter((x) => x !== pl.id) : [...m.inPlaylistIds, pl.id],
      }));
      await onPlaylistsChanged();
    } catch {
      showToast('Lỗi', 'Không thể cập nhật danh sách phát', 'error');
    }
  };

  const handleCreatePlaylistAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      const res = await osApi.createYoutubePlaylist({
        name: newPlaylistName.trim(),
        firstVideo: {
          video_id: video.videoId,
          title: video.title,
          channel_title: video.channelTitle,
          thumbnail_url: video.thumbnail,
          duration_label: video.durationLabel,
        },
      });
      setMeta((m) => ({ ...m, inPlaylistIds: [...m.inPlaylistIds, res.playlist.id] }));
      setNewPlaylistName('');
      await onPlaylistsChanged();
      showToast('Danh sách phát', `Đã lưu vào "${res.playlist.name}"`, 'success');
    } catch {
      showToast('Lỗi', 'Không thể tạo danh sách phát', 'error');
    }
  };

  const handleShareToVibeSphere = async () => {
    setSharingSocial(true);
    try {
      await socialApi.createPost({
        content: `Đang xem "${video.title}" của ${video.channelTitle}\nhttps://www.youtube.com/watch?v=${video.videoId}`,
        media_url: video.thumbnail,
        media_type: 'image',
        link_url: `https://www.youtube.com/watch?v=${video.videoId}`,
        link_title: `${video.title} · ${video.channelTitle}`,
      });
      setShareModalOpen(false);
      showToast('VibeSphere', 'Đã chia sẻ video lên bảng tin VibeSphere!', 'success');
    } catch {
      showToast('Lỗi', 'Không thể chia sẻ lên VibeSphere', 'error');
    } finally {
      setSharingSocial(false);
    }
  };

  const topComments = comments.filter((c) => !c.parent_id);
  const repliesMap = new Map<string, YouTubeComment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const arr = repliesMap.get(c.parent_id) || [];
      arr.push(c);
      repliesMap.set(c.parent_id, arr);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--os-bg)] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Compact Watch Header */}
      <div className="shrink-0 h-12 px-3 bg-[var(--os-surface)] border-b border-[var(--os-border)] flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          disabled={touchLocked}
          className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35"
          title={touchLocked ? 'Đang khóa cảm ứng' : 'Quay lại'}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="text-xs font-semibold truncate flex-1">{video.title}</p>
        <button
          type="button"
          onClick={() => setTouchLocked((v) => !v)}
          className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 shrink-0 ${
            touchLocked ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
          }`}
          title="Khóa thao tác chạm"
        >
          {touchLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          <span>{touchLocked ? 'Mở khóa' : 'Khóa chạm'}</span>
        </button>
        <a
          href={`https://www.youtube.com/watch?v=${video.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[36px] px-2.5 rounded-xl bg-rose-600/10 text-rose-600 dark:text-rose-400 text-[11px] font-semibold flex items-center gap-1 shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Mở gốc</span>
        </a>
      </div>

      {/* Persistent Docked Player Slot */}
      <div className="shrink-0 bg-black">
        {isThisPlaying ? (
          <div data-yt-slot="true" className="aspect-video w-full max-h-52 bg-zinc-950" />
        ) : (
          <button
            onClick={() => onSelectVideo(video, suggestions)}
            className="relative aspect-video w-full max-h-52 bg-zinc-950 flex items-center justify-center overflow-hidden group"
          >
            <img
              src={video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
              alt={video.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl">
                <Play className="w-5 h-5 fill-white ml-0.5" />
              </div>
            </div>
          </button>
        )}

        {/* Custom Transport & Scrub Strip */}
        {isThisPlaying && !touchLocked && (
          <div className="bg-zinc-950 text-white px-3 py-2 border-b border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 touch-none">
              <span className="text-[10px] font-mono-num tabular-nums text-zinc-300 w-10 text-right">
                {formatSec(activeYouTube.progressSec)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                value={Math.min(Math.floor(activeYouTube.progressSec), Math.max(1, Math.floor(duration)))}
                onChange={(e) => seekYouTubeTo(Number(e.target.value))}
                className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
              />
              <span className="text-[10px] font-mono-num tabular-nums text-zinc-400 w-10">
                {duration > 0 ? formatSec(duration) : video.durationLabel || '--:--'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => seekYouTubeTo(Math.max(0, activeYouTube.progressSec - 10))}
                  className="min-h-[36px] px-2 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] flex items-center gap-1"
                >
                  <Rewind className="w-3.5 h-3.5" />
                  <span>10s</span>
                </button>
                <button
                  onClick={toggleYouTubePlay}
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-rose-600 hover:bg-rose-500 flex items-center justify-center"
                >
                  {activeYouTube.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button
                  onClick={() => seekYouTubeTo(activeYouTube.progressSec + 10)}
                  className="min-h-[36px] px-2 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] flex items-center gap-1"
                >
                  <span>10s</span>
                  <FastForward className="w-3.5 h-3.5" />
                </button>
                {activeYouTube.queue.length > 1 && (
                  <button
                    onClick={playNextYouTubeVideo}
                    className="min-h-[36px] px-2 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] flex items-center gap-1"
                    title="Video tiếp theo"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={activeYouTube.playbackRate}
                  onChange={(e) => setYouTubePlaybackRate(Number(e.target.value))}
                  className="min-h-[36px] px-2 rounded-lg bg-white/10 text-[11px] font-semibold outline-none"
                >
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <option key={r} value={r} className="bg-zinc-900">
                      {r}x
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setYouTubeFullscreen(true)}
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center"
                  title="Toàn màn hình"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Metadata, Channel, Comments & Queue */}
      <div className="flex-1 overflow-y-auto os-scroll divide-y divide-[var(--os-border)]">
        {/* Title & Expandable Description */}
        <div className="p-3.5 space-y-2 bg-[var(--os-surface)]">
          <button
            onClick={() => setDescExpanded((v) => !v)}
            className="w-full text-left flex items-start justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold leading-snug">{video.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>{video.viewCountText || 'Video đề xuất'}</span>
                {video.publishedTimeText && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{video.publishedTimeText}</span>
                  </>
                )}
                {video.category && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{video.category}</span>
                  </>
                )}
              </div>
            </div>
            {descExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            )}
          </button>

          {descExpanded && (
            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed space-y-1">
              <p>{video.description || 'Phát qua trình phát YouTube IFrame chính thức trên PHONE OS.'}</p>
              <p className="text-[11px] text-zinc-400">Mã video: {video.videoId}</p>
            </div>
          )}

          {/* Channel + Subscribe Row */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-rose-600/15 text-rose-600 dark:text-rose-400 font-bold text-sm flex items-center justify-center shrink-0">
                {video.channelTitle.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{video.channelTitle}</p>
                <p className="text-[11px] text-zinc-500">Kênh chính thức</p>
              </div>
            </div>
            <button
              onClick={handleToggleSubscribe}
              className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
                meta.isSubscribed
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                  : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
              }`}
            >
              {meta.isSubscribed && <Bell className="w-3.5 h-3.5" />}
              <span>{meta.isSubscribed ? 'Đã đăng ký' : 'Đăng ký'}</span>
            </button>
          </div>

          {/* Action Bar */}
          <div className="pt-1 flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
            <div className="flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800/90 overflow-hidden shrink-0">
              <button
                onClick={() => handleToggleLike(1)}
                className={`min-h-[40px] px-3 flex items-center gap-1.5 text-xs font-semibold ${
                  meta.liked === 1 ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
              >
                <ThumbsUp className={`w-4 h-4 ${meta.liked === 1 ? 'fill-current' : ''}`} />
                <span className="tabular-nums">{meta.likesCount}</span>
              </button>
              <span className="w-px h-5 bg-zinc-300 dark:bg-zinc-700" />
              <button
                onClick={() => handleToggleLike(-1)}
                className={`min-h-[40px] px-3 flex items-center justify-center ${
                  meta.liked === -1 ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
                title="Không thích"
              >
                <ThumbsDown className={`w-4 h-4 ${meta.liked === -1 ? 'fill-current' : ''}`} />
              </button>
            </div>

            <button
              onClick={handleToggleWatchLater}
              className={`min-h-[40px] px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 ${
                meta.inWatchLater
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-zinc-100 dark:bg-zinc-800/90'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${meta.inWatchLater ? 'fill-current' : ''}`} />
              <span>Xem sau</span>
            </button>

            <button
              onClick={() => setPlaylistModalOpen(true)}
              className={`min-h-[40px] px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 ${
                meta.inPlaylistIds.length > 0
                  ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                  : 'bg-zinc-100 dark:bg-zinc-800/90'
              }`}
            >
              <ListPlus className="w-4 h-4" />
              <span>Lưu danh sách</span>
            </button>

            <button
              onClick={() => setShareModalOpen(true)}
              className="min-h-[40px] px-3 rounded-full bg-zinc-100 dark:bg-zinc-800/90 text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Share2 className="w-4 h-4" />
              <span>Chia sẻ</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        <div className="p-3.5 space-y-3 bg-[var(--os-surface)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-zinc-500" />
              <span>Bình luận ({comments.length})</span>
            </h2>
          </div>

          <form onSubmit={handlePostComment} className="space-y-1.5">
            {replyTo && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-[11px] text-zinc-500">
                <span>Đang trả lời {replyTo.author_name}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-rose-500 font-semibold">
                  Hủy
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={replyTo ? 'Viết câu trả lời...' : 'Viết bình luận công khai...'}
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="min-h-[40px] min-w-[44px] rounded-xl bg-rose-600 text-white flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          {topComments.length === 0 ? (
            <p className="text-xs text-zinc-500 py-2">Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nghĩ!</p>
          ) : (
            <div className="space-y-3">
              {topComments.map((c) => {
                const replies = repliesMap.get(c.id) || [];
                return (
                  <div key={c.id} className="space-y-2">
                    <div className="flex items-start gap-2.5">
                      <img
                        src={c.author_avatar || '/src/assets/images/char_sakura_1794880090451.jpg'}
                        alt={c.author_name}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{c.author_name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(c.created_at).toLocaleDateString('vi-VN')}</span>
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed">{c.content}</p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                          <button
                            onClick={async () => {
                              const r = await osApi.toggleYoutubeCommentLike(c.id);
                              setComments((prev) => prev.map((x) => (x.id === c.id ? r.comment : x)));
                            }}
                            className={`flex items-center gap-1 py-1 ${c.is_liked ? 'text-rose-500 font-semibold' : ''}`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${c.is_liked ? 'fill-current' : ''}`} />
                            <span>{c.likes_count || ''}</span>
                          </button>
                          <button onClick={() => setReplyTo(c)} className="py-1 font-medium">
                            Trả lời
                          </button>
                          {c.author_id === 'user_1' && (
                            <button
                              onClick={async () => {
                                await osApi.deleteYoutubeComment(c.id);
                                setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id));
                              }}
                              className="py-1 text-zinc-400 hover:text-rose-500"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {replies.length > 0 && (
                      <div className="pl-9 space-y-2">
                        {replies.map((rp) => (
                          <div key={rp.id} className="flex items-start gap-2">
                            <img
                              src={rp.author_avatar || '/src/assets/images/char_sakura_1794880090451.jpg'}
                              alt={rp.author_name}
                              referrerPolicy="no-referrer"
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{rp.author_name}</span>
                              </div>
                              <p className="text-xs leading-snug">{rp.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Up Next Suggestions */}
        <div className="p-3.5 space-y-2.5">
          <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Video tiếp theo</h2>
          {suggestions
            .filter((s) => s.videoId !== video.videoId)
            .slice(0, 8)
            .map((s) => (
              <button
                key={s.videoId}
                onClick={() => onSelectVideo(s, suggestions)}
                className="w-full p-2 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] flex items-center gap-3 text-left"
              >
                <div className="relative w-28 aspect-video rounded-xl overflow-hidden bg-zinc-900 shrink-0">
                  <img
                    src={s.thumbnail || `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`}
                    alt={s.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {s.durationLabel && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-mono-num">
                      {s.durationLabel}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-bold line-clamp-2 leading-snug">{s.title}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {s.channelTitle}
                    {s.viewCountText ? ` · ${s.viewCountText}` : ''}
                  </p>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Save to Playlist Sheet */}
      {playlistModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end justify-center p-3">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--os-surface)] border border-[var(--os-border)] p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Lưu vào danh sách phát</h3>
              <button
                onClick={() => setPlaylistModalOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto os-scroll space-y-1.5">
              {playlists.length === 0 ? (
                <p className="text-xs text-zinc-500 py-2">Chưa có danh sách phát nào.</p>
              ) : (
                playlists.map((pl) => {
                  const checked = meta.inPlaylistIds.includes(pl.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={() => handleTogglePlaylistMembership(pl)}
                      className="w-full min-h-[44px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between text-xs font-medium"
                    >
                      <span className="truncate">{pl.name} ({pl.items?.length || 0})</span>
                      {checked && <Check className="w-4 h-4 text-rose-500 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            <form onSubmit={handleCreatePlaylistAndAdd} className="flex items-center gap-2 pt-1">
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Tên danh sách phát mới..."
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="min-h-[42px] px-3.5 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Options Sheet */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end justify-center p-3">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--os-surface)] border border-[var(--os-border)] p-4 space-y-2.5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Chia sẻ video</h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleShareToVibeSphere}
              disabled={sharingSocial}
              className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <span>{sharingSocial ? 'Đang đăng...' : 'Đăng lên bảng tin VibeSphere'}</span>
            </button>
            <button
              onClick={() => {
                setShareModalOpen(false);
                openShareSheet({
                  title: video.title,
                  text: `${video.title} - ${video.channelTitle}`,
                  url: `https://www.youtube.com/watch?v=${video.videoId}`,
                });
              }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold"
            >
              Gửi qua Tin nhắn / Ghi chú / Hệ thống
            </button>
            <button
              onClick={() => {
                setShareModalOpen(false);
                openApp('social');
              }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-medium text-zinc-500"
            >
              Mở VibeSphere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
