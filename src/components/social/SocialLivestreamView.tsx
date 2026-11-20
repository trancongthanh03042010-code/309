import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Ban, Eye, Heart, Info, Radio, Send, ShieldAlert, Video, X } from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialLivestreamItem, SocialUser } from '../../types/social';
import { formatCompactCount, SocialEmptyState, UserAvatar, VerifiedBadge } from './SocialUI';

interface SocialLivestreamViewProps {
  currentUser: SocialUser;
  sendWs: (event: string, payload: Record<string, unknown>) => boolean;
  latestWsSignal: { event: string; payload: Record<string, unknown> } | null;
  onClose: () => void;
  showToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function SocialLivestreamView({
  currentUser,
  sendWs,
  latestWsSignal,
  onClose,
  showToast,
}: SocialLivestreamViewProps) {
  const [streams, setStreams] = useState<SocialLivestreamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);

  // Start stream modal
  const [startOpen, setStartOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Âm nhạc & Trò chuyện');
  const [allowComments, setAllowComments] = useState(true);
  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const hostMediaRef = useRef<MediaStream | null>(null);

  const loadStreams = async () => {
    try {
      const res = await socialApi.getLivestreams();
      setStreams(res.streams);
    } catch (err) {
      showToast('Livestream', err instanceof Error ? err.message : 'Không tải được danh sách live', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStreams();
    return () => {
      hostMediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const activeStream = streams.find((s) => s.id === activeStreamId) || null;
  const isHost = activeStream?.host_id === currentUser.id;

  useEffect(() => {
    if (!activeStreamId) return;
    sendWs('stream:join', { streamId: activeStreamId });
    return () => {
      sendWs('stream:leave', { streamId: activeStreamId });
    };
  }, [activeStreamId, sendWs]);

  useEffect(() => {
    if (!latestWsSignal) return;
    const { event, payload } = latestWsSignal;
    if (event === 'stream:viewer_count') {
      const sid = String(payload.streamId || '');
      const count = Number(payload.viewerCount || 1);
      setStreams((prev) => prev.map((s) => (s.id === sid ? { ...s, viewer_count: count } : s)));
    } else if (event === 'stream:comment') {
      const sid = String(payload.streamId || '');
      const cmt = payload.comment as SocialLivestreamItem['comments'][number] | undefined;
      if (cmt) {
        setStreams((prev) =>
          prev.map((s) => (s.id === sid ? { ...s, comments: [...s.comments, cmt] } : s))
        );
      }
    } else if (event === 'stream:reaction') {
      const sid = String(payload.streamId || '');
      const likes = Number(payload.totalLikes || 0);
      setStreams((prev) => prev.map((s) => (s.id === sid ? { ...s, total_likes: likes } : s)));
      if (sid === activeStreamId) {
        const key = Date.now() + Math.random();
        setFloatingHearts((prev) => [...prev.slice(-8), key]);
      }
    } else if (event === 'stream:ended') {
      void loadStreams();
      if (String(payload.streamId) === activeStreamId) {
        showToast('Livestream', 'Phiên phát trực tiếp đã kết thúc.');
        setActiveStreamId(null);
      }
    } else if (event === 'stream:banned' && String(payload.streamId) === activeStreamId) {
      showToast('Livestream', 'Chủ phòng đã hạn chế bạn khỏi phòng phát này.', 'error');
      setActiveStreamId(null);
    } else if (event === 'stream:started') {
      void loadStreams();
    }
  }, [latestWsSignal]);

  const handleStartLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        hostMediaRef.current = media;
        setTimeout(() => {
          if (hostVideoRef.current) hostVideoRef.current.srcObject = media;
        }, 120);
      } catch {
        showToast('Camera', 'Không truy cập được camera thiết bị, phòng live vẫn mở với ảnh bìa & trò chuyện thời gian thực.');
      }
      const res = await socialApi.startLivestream({
        title: title.trim(),
        category,
        allow_comments: allowComments,
      });
      setStartOpen(false);
      setTitle('');
      await loadStreams();
      setActiveStreamId(res.stream.id);
    } catch (err) {
      showToast('Livestream', err instanceof Error ? err.message : 'Không thể bắt đầu livestream', 'error');
    }
  };

  const handleEndLive = async () => {
    if (!activeStream) return;
    await socialApi.endLivestream(activeStream.id);
    hostMediaRef.current?.getTracks().forEach((t) => t.stop());
    hostMediaRef.current = null;
    setActiveStreamId(null);
    void loadStreams();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStream || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    try {
      await socialApi.commentLivestream(activeStream.id, text);
    } catch (err) {
      showToast('Bình luận live', err instanceof Error ? err.message : 'Không gửi được bình luận', 'error');
    }
  };

  // ROOM VIEW
  if (activeStream) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between">
        {/* Background preview: live host camera if host has stream, else cover */}
        <div className="absolute inset-0">
          {isHost && hostMediaRef.current ? (
            <video ref={hostVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={activeStream.cover_url} alt={activeStream.title} className="w-full h-full object-cover opacity-80" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85" />
        </div>

        {/* Top bar */}
        <div className="relative z-10 p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 bg-black/50 backdrop-blur-md rounded-full pr-3 pl-1 py-1">
            <UserAvatar src={activeStream.host_avatar} name={activeStream.host_name} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate flex items-center gap-1">
                {activeStream.host_name}
                <VerifiedBadge verified={activeStream.host_verified} />
              </p>
              <p className="text-[10px] text-zinc-300 truncate">{activeStream.category}</p>
            </div>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-600 text-[10px] font-bold flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs font-semibold flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {formatCompactCount(activeStream.viewer_count)}
            </span>
            {isHost ? (
              <button
                onClick={() => void handleEndLive()}
                className="min-h-[40px] px-3 rounded-full bg-rose-600 text-xs font-bold"
              >
                Kết thúc
              </button>
            ) : (
              <button
                onClick={() => setActiveStreamId(null)}
                className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Honest media broadcast banner */}
        <div className="relative z-10 px-3">
          <div className="px-3 py-1.5 rounded-xl bg-black/55 backdrop-blur-md text-[11px] text-zinc-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              {activeStream.title} · Chat, tim & đếm người xem đồng bộ WebSocket thật; truyền luồng video đa người qua internet cần máy chủ SFU/RTMP ngoài.
            </span>
          </div>
        </div>

        {/* Bottom comments & controls */}
        <div className="relative z-10 p-3 space-y-2.5 mt-auto">
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {activeStream.comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2 bg-black/45 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
                <UserAvatar src={c.user_avatar} name={c.user_name} size="xs" />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-bold text-indigo-300 mr-1.5">{c.user_name}</span>
                  <span className="text-xs text-white/95 break-words">{c.content}</span>
                </div>
                {isHost && c.user_id !== currentUser.id && (
                  <button
                    onClick={async () => {
                      await socialApi.banStreamViewer(activeStream.id, c.user_id);
                      showToast('Kiểm duyệt live', `Đã chặn ${c.user_name} khỏi phiên phát.`);
                    }}
                    className="p-1 text-rose-400 hover:text-rose-300 shrink-0"
                    title="Chặn người xem"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Floating hearts */}
          <div className="flex justify-end gap-1 pointer-events-none h-5">
            {floatingHearts.map((k) => (
              <span key={k} className="text-sm animate-bounce">
                ❤️
              </span>
            ))}
          </div>

          <form onSubmit={handleComment} className="flex items-center gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              disabled={!activeStream.allow_comments}
              placeholder={activeStream.allow_comments ? 'Bình luận trực tiếp...' : 'Chủ phòng đã tắt bình luận'}
              className="flex-1 min-h-[44px] px-4 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-xs text-white placeholder:text-zinc-400 outline-none"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || !activeStream.allow_comments}
              className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await socialApi.likeLivestream(activeStream.id);
              }}
              className="min-h-[44px] px-3 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center gap-1 shrink-0 active:scale-95"
            >
              <Heart className="w-4 h-4 fill-white" /> {formatCompactCount(activeStream.total_likes)}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ROOMS LIST VIEW
  return (
    <div className="fixed inset-0 z-40 bg-zinc-50 dark:bg-[#0D0F14] flex flex-col">
      <div className="px-3 py-2.5 bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Phát trực tiếp VibeSphere</h2>
            <p className="text-[11px] text-zinc-500">Các phòng live đang hoạt động & lưu trữ</p>
          </div>
        </div>
        <button
          onClick={() => setStartOpen(true)}
          className="min-h-[44px] px-3.5 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Video className="w-4 h-4" /> Phát trực tiếp
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <p className="text-center text-xs text-zinc-500 py-8">Đang tải phòng livestream...</p>
        ) : streams.length === 0 ? (
          <SocialEmptyState
            title="Chưa có phiên phát trực tiếp"
            description="Hãy bắt đầu buổi livestream đầu tiên để giao lưu với bạn bè theo thời gian thực."
            actionLabel="Mở phòng live"
            onAction={() => setStartOpen(true)}
          />
        ) : (
          streams.map((s) => (
            <button
              key={s.id}
              onClick={() => (s.status === 'live' ? setActiveStreamId(s.id) : showToast('Livestream', 'Phiên phát này đã kết thúc.'))}
              className="w-full rounded-2xl overflow-hidden bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 text-left"
            >
              <div className="relative h-40 bg-zinc-900">
                <img src={s.cover_url} alt={s.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      s.status === 'live' ? 'bg-rose-600 text-white' : 'bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {s.status === 'live' ? 'ĐANG PHÁT' : 'ĐÃ KẾT THÚC'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-semibold">
                    {formatCompactCount(s.viewer_count)} đang xem
                  </span>
                </div>
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center gap-2 text-white">
                  <UserAvatar src={s.host_avatar} name={s.host_name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{s.title}</p>
                    <p className="text-[11px] text-zinc-300 truncate">
                      {s.host_name} · {s.category}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {startOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Thiết lập buổi phát trực tiếp</h3>
              <button onClick={() => setStartOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleStartLive} className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tiêu đề buổi phát (vd: Acoustic tối thứ 7)..."
                required
                className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
              >
                <option value="Âm nhạc & Trò chuyện">Âm nhạc & Trò chuyện</option>
                <option value="Gaming & Công nghệ">Gaming & Công nghệ</option>
                <option value="Học tập & Chia sẻ">Học tập & Chia sẻ</option>
              </select>
              <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 min-h-[44px]">
                <span>Cho phép người xem bình luận trực tiếp</span>
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </label>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Trình duyệt sẽ xin quyền Camera & Micro để hiển thị luồng xem trước trực tiếp cho bạn.</span>
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-bold"
              >
                Bắt đầu phát sóng ngay
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
