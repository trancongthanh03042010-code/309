import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Eye, Music, Pause, Play, Send, X } from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialStoryItem } from '../../types/social';
import { formatRelativeVi, UserAvatar } from './SocialUI';

interface SocialStoryViewerProps {
  stories: SocialStoryItem[];
  initialIndex: number;
  currentUserId: string;
  onClose: () => void;
  onReplyToAuthor: (authorId: string, storyCaption: string, replyText: string) => Promise<void>;
  onSavedHighlight: () => void;
}

export function SocialStoryViewer({
  stories,
  initialIndex,
  currentUserId,
  onClose,
  onReplyToAuthor,
  onSavedHighlight,
}: SocialStoryViewerProps) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, stories.length - 1)));
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [viewersOpen, setViewersOpen] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [savingHl, setSavingHl] = useState(false);

  const story = stories[idx];

  useEffect(() => {
    if (!story) return;
    void socialApi.viewStory(story.id).catch(() => {});
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused || viewersOpen) return;
    const stepMs = 60;
    const durMs = 5000;
    const id = setInterval(() => {
      setProgress((p) => {
        const next = p + (stepMs / durMs) * 100;
        if (next >= 100) {
          if (idx < stories.length - 1) {
            setIdx((i) => i + 1);
            return 0;
          }
          onClose();
          return 100;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [idx, paused, viewersOpen, stories.length, story?.id]);

  if (!story) return null;

  const isOwner = story.author_id === currentUserId;

  const goPrev = () => {
    setProgress(0);
    if (idx > 0) setIdx((i) => i - 1);
    else onClose();
  };

  const goNext = () => {
    setProgress(0);
    if (idx < stories.length - 1) setIdx((i) => i + 1);
    else onClose();
  };

  const handleSaveHighlight = async () => {
    setSavingHl(true);
    try {
      await socialApi.createHighlight({
        title: highlightTitle.trim() || story.caption.slice(0, 18) || 'Tin nổi bật',
        cover_url: story.media_url,
        story_id: story.id,
      });
      setHighlightTitle('');
      setViewersOpen(false);
      onSavedHighlight();
    } finally {
      setSavingHl(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black text-white flex flex-col justify-between select-none">
      {/* Media Backdrop */}
      {story.media_type === 'video' ? (
        <video
          src={story.media_url}
          autoPlay
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img src={story.media_url} alt={story.author_name} className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75 pointer-events-none" />

      {/* Overlays */}
      {story.overlays?.map((ov) => (
        <div
          key={ov.id}
          style={{ top: `${ov.yPct ?? 45}%`, color: ov.color || '#FFFFFF' }}
          className="absolute inset-x-6 -translate-y-1/2 z-10 text-center pointer-events-none"
        >
          <span className="inline-block px-3.5 py-1.5 rounded-xl bg-black/45 backdrop-blur-xs text-base font-bold shadow-lg">
            {ov.text}
          </span>
        </div>
      ))}

      {/* Tap Zones (Left Prev / Center Hold-Pause / Right Next) */}
      <div className="absolute inset-y-20 inset-x-0 z-10 grid grid-cols-3">
        <div onClick={goPrev} />
        <div
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        />
        <div onClick={goNext} />
      </div>

      {/* Top Segmented Progress & Author Info */}
      <div className="relative z-20 p-3 space-y-2.5">
        <div className="flex gap-1">
          {stories.map((st, i) => (
            <div key={st.id} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-75"
                style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar src={story.author_avatar} name={story.author_name} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="truncate">{story.author_name}</span>
                <span className="font-normal text-white/70">· {formatRelativeVi(story.created_at)}</span>
              </div>
              {story.audio_title && (
                <p className="text-[11px] text-white/80 flex items-center gap-1 truncate">
                  <Music className="w-3 h-3 shrink-0" /> {story.audio_title}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-black/35"
              aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-black/35"
              aria-label="Đóng Story"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Caption, Quick Reactions, Reply or Owner Viewers */}
      <div className="relative z-20 p-3.5 space-y-2.5">
        {story.caption && (
          <p className="text-xs text-center bg-black/45 backdrop-blur-md px-3.5 py-2 rounded-2xl">
            {story.caption}
          </p>
        )}

        {isOwner ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setViewersOpen(true)}
              className="min-h-[44px] px-4 rounded-xl bg-white/15 backdrop-blur-md text-xs font-semibold flex items-center gap-2"
            >
              <Eye className="w-4 h-4" /> {story.viewers?.length ?? story.views_count} lượt xem
            </button>
            <button
              type="button"
              onClick={() => setViewersOpen(true)}
              className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-xs font-semibold flex items-center gap-1.5"
            >
              <BookmarkPlus className="w-4 h-4" /> Lưu Tin nổi bật
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              {['❤️', '🔥', '😂', '😮', '👏'].map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={async () => {
                    await socialApi.viewStory(story.id, em);
                    setProgress((p) => Math.min(99, p + 5));
                  }}
                  className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md text-lg hover:scale-125 transition-transform"
                >
                  {em}
                </button>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!replyText.trim()) return;
                const txt = replyText.trim();
                setReplyText('');
                await onReplyToAuthor(story.author_id, story.caption, txt);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                placeholder={`Gửi phản hồi tới ${story.author_name}...`}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-black/55 border border-white/20 text-xs outline-none placeholder:text-white/60"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-600 flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Viewers & Save Highlight Sheet */}
      {viewersOpen && isOwner && (
        <div onClick={() => setViewersOpen(false)} className="absolute inset-0 z-30 bg-black/70 flex items-end">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[65%] rounded-t-3xl bg-white dark:bg-[#14161D] text-zinc-900 dark:text-zinc-100 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">Người đã xem Tin ({story.viewers?.length ?? 0})</h4>
              <button type="button" onClick={() => setViewersOpen(false)} className="p-2">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={highlightTitle}
                onChange={(e) => setHighlightTitle(e.target.value)}
                placeholder="Tên Tin nổi bật (vd: Kỷ niệm)..."
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
              />
              <button
                type="button"
                disabled={savingHl}
                onClick={() => void handleSaveHighlight()}
                className="min-h-[40px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
              >
                Lưu nổi bật
              </button>
            </div>
            <div className="flex-1 overflow-y-auto os-scroll space-y-2">
              {(story.viewers || []).length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">Chưa có ai xem Tin này.</p>
              ) : (
                (story.viewers || []).map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar src={v.viewer_avatar} name={v.viewer_name} size="sm" />
                      <div>
                        <p className="text-xs font-bold">{v.viewer_name}</p>
                        <p className="text-[10px] text-zinc-500">{formatRelativeVi(v.viewed_at)}</p>
                      </div>
                    </div>
                    {v.reaction && <span className="text-base">{v.reaction}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
