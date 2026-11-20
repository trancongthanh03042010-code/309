import React, { useEffect, useState } from 'react';
import { CornerDownRight, EyeOff, Flag, Heart, Pin, Send, Trash2, X } from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialCommentItem } from '../../types/social';
import { formatRelativeVi, UserAvatar, VerifiedBadge } from './SocialUI';

interface SocialCommentsSheetProps {
  targetType: 'post' | 'video';
  targetId: string;
  ownerId: string;
  commentPolicy?: string;
  currentUserId: string;
  onClose: () => void;
  onCountChanged: () => void;
  onOpenProfile: (userId: string) => void;
  onReportComment: (commentId: string) => void;
}

export function SocialCommentsSheet({
  targetType,
  targetId,
  ownerId,
  commentPolicy = 'everyone',
  currentUserId,
  onClose,
  onCountChanged,
  onOpenProfile,
  onReportComment,
}: SocialCommentsSheetProps) {
  const [comments, setComments] = useState<SocialCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<SocialCommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res =
        targetType === 'post'
          ? await socialApi.getPostComments(targetId)
          : await socialApi.getVideoComments(targetId);
      setComments(res.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được bình luận.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [targetType, targetId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await socialApi.addComment({
        post_id: targetType === 'post' ? targetId : undefined,
        video_id: targetType === 'video' ? targetId : undefined,
        parent_id: replyTo?.id || '',
        content: text.trim(),
      });
      setComments((prev) => [...prev, res.comment]);
      setText('');
      setReplyTo(null);
      onCountChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi bình luận thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const rootComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = comments.reduce<Record<string, SocialCommentItem[]>>((acc, c) => {
    if (c.parent_id) {
      if (!acc[c.parent_id]) acc[c.parent_id] = [];
      acc[c.parent_id].push(c);
    }
    return acc;
  }, {});

  const renderComment = (c: SocialCommentItem, isReply = false) => {
    const canModerate = currentUserId === ownerId;
    const isAuthor = currentUserId === c.author_id;
    return (
      <div key={c.id} className={`flex gap-2.5 ${isReply ? 'ml-9 mt-2' : ''}`}>
        <button type="button" onClick={() => onOpenProfile(c.author_id)} className="shrink-0">
          <UserAvatar src={c.author_avatar} name={c.author_name} size={isReply ? 'xs' : 'sm'} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenProfile(c.author_id)}
                className="text-xs font-bold flex items-center gap-1 truncate hover:underline"
              >
                <span>{c.author_name}</span>
                <VerifiedBadge verified={c.author_verified} />
                {c.is_pinned === 1 && <Pin className="w-3 h-3 text-amber-500" />}
              </button>
              <span className="text-[10px] text-zinc-400 shrink-0">{formatRelativeVi(c.created_at)}</span>
            </div>
            <p className="text-xs text-zinc-800 dark:text-zinc-200 mt-0.5 break-words">{c.content}</p>
          </div>
          <div className="flex items-center gap-3 px-2 pt-1 text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={async () => {
                await socialApi.updateComment(c.id, { toggleLike: true });
                void load();
              }}
              className={`flex items-center gap-1 font-medium ${c.my_reaction ? 'text-rose-500' : ''}`}
            >
              <Heart className={`w-3 h-3 ${c.my_reaction ? 'fill-rose-500' : ''}`} /> {c.likes_count || 0}
            </button>
            {!isReply && (
              <button type="button" onClick={() => setReplyTo(c)} className="font-medium hover:text-indigo-500">
                Trả lời
              </button>
            )}
            {canModerate && !isReply && (
              <button
                type="button"
                onClick={async () => {
                  await socialApi.updateComment(c.id, { is_pinned: c.is_pinned ? 0 : 1 });
                  void load();
                }}
                className="hover:text-amber-500"
              >
                {c.is_pinned ? 'Bỏ ghim' : 'Ghim'}
              </button>
            )}
            {canModerate && (
              <button
                type="button"
                onClick={async () => {
                  await socialApi.updateComment(c.id, { is_hidden: 1 });
                  void load();
                }}
                title="Ẩn bình luận"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            )}
            {!isAuthor && (
              <button type="button" onClick={() => onReportComment(c.id)} title="Báo cáo">
                <Flag className="w-3 h-3" />
              </button>
            )}
            {(isAuthor || canModerate) && (
              <button
                type="button"
                onClick={async () => {
                  await socialApi.deleteComment(c.id);
                  onCountChanged();
                  void load();
                }}
                className="text-rose-500"
                title="Xóa bình luận"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          {!isReply && (repliesByParent[c.id] || []).map((rep) => renderComment(rep, true))}
        </div>
      </div>
    );
  };

  return (
    <div onClick={onClose} className="absolute inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[82%] rounded-t-3xl bg-white dark:bg-[#14161D] border-t border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden"
      >
        <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto my-2.5 shrink-0" />
        <div className="px-4 pb-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold">Bình luận ({comments.length})</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500"
            aria-label="Đóng bình luận"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3">
          {loading && <p className="text-xs text-zinc-500 text-center py-6">Đang tải bình luận...</p>}
          {error && <p className="text-xs text-rose-500 bg-rose-500/10 rounded-xl p-2.5">{error}</p>}
          {!loading && comments.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-8">Chưa có bình luận nào. Hãy là người đầu tiên thảo luận!</p>
          )}
          {rootComments.map((c) => renderComment(c, false))}
        </div>

        {commentPolicy === 'off' && currentUserId !== ownerId ? (
          <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
            Tác giả đã tắt bình luận cho nội dung này.
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#14161D] space-y-1.5">
            {replyTo && (
              <div className="flex items-center justify-between text-[11px] text-indigo-500 px-1">
                <span className="flex items-center gap-1 truncate">
                  <CornerDownRight className="w-3 h-3" /> Đang trả lời {replyTo.author_name}
                </span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-400 hover:text-zinc-600">
                  Hủy
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? `Trả lời ${replyTo.author_name}...` : 'Viết bình luận của bạn...'}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40"
                aria-label="Gửi bình luận"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
