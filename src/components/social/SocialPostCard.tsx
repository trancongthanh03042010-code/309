import React, { useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  EyeOff,
  Flag,
  Globe,
  Link2,
  Lock,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Repeat2,
  Send,
  Share2,
  ShieldBan,
  ThumbsUp,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import type { SocialCollectionItem, SocialPostItem, SocialReactionType } from '../../types/social';
import {
  formatCompactCount,
  formatRelativeVi,
  REACTION_LIST,
  REACTION_META,
  UserAvatar,
  VerifiedBadge,
} from './SocialUI';

interface SocialPostCardProps {
  post: SocialPostItem;
  currentUserId: string;
  collections: SocialCollectionItem[];
  onOpenProfile: (userId: string) => void;
  onOpenComments: (post: SocialPostItem) => void;
  onReact: (postId: string, reaction: SocialReactionType) => void;
  onSave: (postId: string, collectionId?: string) => void;
  onShareRepost: (post: SocialPostItem) => void;
  onShareToChat: (post: SocialPostItem) => void;
  onShareOSSheet: (post: SocialPostItem) => void;
  onEdit: (post: SocialPostItem) => void;
  onDelete: (postId: string) => void;
  onPin: (post: SocialPostItem) => void;
  onHide: (postId: string) => void;
  onReport: (postId: string) => void;
  onBlockAuthor: (authorId: string, authorName: string) => void;
  onHashtagClick: (tag: string) => void;
  onCopyLink: (postId: string) => void;
  onOpenGroup?: (groupId: string) => void;
}

export function SocialPostCard({
  post,
  currentUserId,
  collections,
  onOpenProfile,
  onOpenComments,
  onReact,
  onSave,
  onShareRepost,
  onShareToChat,
  onShareOSSheet,
  onEdit,
  onDelete,
  onPin,
  onHide,
  onReport,
  onBlockAuthor,
  onHashtagClick,
  onCopyLink,
  onOpenGroup,
}: SocialPostCardProps) {
  const [albumIdx, setAlbumIdx] = useState(0);
  const [rxPickerOpen, setRxPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);

  const isOwner = post.author_id === currentUserId;
  const mediaList =
    post.media_items && post.media_items.length > 0
      ? post.media_items
      : post.media_url
        ? [{ url: post.media_url, type: (post.media_type === 'video' ? 'video' : 'image') as 'image' | 'video' }]
        : [];

  const activeRxMeta = post.my_reaction ? REACTION_META[post.my_reaction] : null;
  const topReactions = REACTION_LIST.filter((r) => (post.reaction_counts?.[r] || 0) > 0).slice(0, 3);

  const renderPrivacyIcon = () => {
    if (post.privacy === 'private') return <Lock className="w-3 h-3" />;
    if (post.privacy === 'friends') return <Users className="w-3 h-3" />;
    if (post.privacy === 'followers') return <UserCheck className="w-3 h-3" />;
    return <Globe className="w-3 h-3" />;
  };

  const renderContentWithTokens = (text: string) => {
    const tokens = text.split(/(#[\p{L}\p{N}_]+|@[a-zA-Z0-9._]+)/gu);
    return tokens.map((tok, i) => {
      if (tok.startsWith('#') && tok.length > 1) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => onHashtagClick(tok)}
            className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          >
            {tok}
          </button>
        );
      }
      if (tok.startsWith('@') && tok.length > 1) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenProfile(tok.slice(1))}
            className="text-sky-600 dark:text-sky-400 font-medium hover:underline"
          >
            {tok}
          </button>
        );
      }
      return <React.Fragment key={i}>{tok}</React.Fragment>;
    });
  };

  return (
    <article className="relative rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs overflow-visible">
      {/* Header */}
      <div className="p-3.5 pb-2.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.author_id)}
            className="shrink-0 focus:outline-none"
            aria-label={`Xem hồ sơ ${post.author_name}`}
          >
            <UserAvatar src={post.author_avatar} name={post.author_name} online={post.author_online} size="md" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenProfile(post.author_id)}
                className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate hover:underline"
              >
                {post.author_name}
              </button>
              <VerifiedBadge verified={post.author_verified} />
              {post.is_pinned === 1 && (
                <span className="text-[10px] font-semibold text-indigo-500 flex items-center gap-0.5 ml-1">
                  <Pin className="w-3 h-3" /> Đã ghim
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
              <span>@{post.author_username || post.author_id}</span>
              <span>·</span>
              <span>{formatRelativeVi(post.created_at)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5" title={`Quyền riêng tư: ${post.privacy}`}>
                {renderPrivacyIcon()}
              </span>
              {post.group_name && post.group_id && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onOpenGroup?.(post.group_id)}
                    className="text-indigo-500 font-medium truncate max-w-[120px] hover:underline"
                  >
                    {post.group_name}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setShareMenuOpen(false);
              setSaveMenuOpen(false);
            }}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
            aria-label="Tùy chọn bài viết"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-52 rounded-2xl bg-white dark:bg-[#1C1F2A] border border-zinc-200 dark:border-zinc-700 shadow-xl py-1.5 text-xs">
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(post);
                    }}
                    className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                  >
                    <Edit3 className="w-4 h-4 text-indigo-500" /> Chỉnh sửa bài viết
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onPin(post);
                    }}
                    className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                  >
                    <Pin className="w-4 h-4 text-amber-500" /> {post.is_pinned ? 'Bỏ ghim bài viết' : 'Ghim lên đầu'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSave(post.id);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Bookmark className="w-4 h-4 text-amber-500" /> {post.is_saved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyLink(post.id);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Copy className="w-4 h-4 text-zinc-500" /> Sao chép liên kết
              </button>
              {!isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onHide(post.id);
                    }}
                    className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                  >
                    <EyeOff className="w-4 h-4 text-zinc-500" /> Ẩn bài viết này
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onReport(post.id);
                    }}
                    className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-amber-600 dark:text-amber-400"
                  >
                    <Flag className="w-4 h-4" /> Báo cáo vi phạm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onBlockAuthor(post.author_id, post.author_name);
                    }}
                    className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-rose-500/10 text-left text-rose-500"
                  >
                    <ShieldBan className="w-4 h-4" /> Chặn {post.author_name}
                  </button>
                </>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(post.id);
                  }}
                  className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-rose-500/10 text-left text-rose-500"
                >
                  <Trash2 className="w-4 h-4" /> Xóa bài viết
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Text Content & Location */}
      {post.content && (
        <div className="px-3.5 pb-2.5 text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-line">
          {renderContentWithTokens(post.content)}
        </div>
      )}

      {post.location_name && (
        <div className="px-3.5 pb-2.5 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{post.location_name}</span>
        </div>
      )}

      {/* External Link Card */}
      {post.link_url && (
        <div className="mx-3.5 mb-2.5 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
            <Link2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{post.link_title || 'Liên kết đính kèm'}</p>
            <p className="text-[11px] text-zinc-500 truncate">{post.link_url}</p>
          </div>
        </div>
      )}

      {/* Shared Repost Card */}
      {post.shared_post && (
        <div className="mx-3.5 mb-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 overflow-hidden">
          <div className="p-2.5 flex items-center gap-2">
            <UserAvatar src={post.shared_post.author_avatar} name={post.shared_post.author_name} size="xs" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{post.shared_post.author_name}</p>
              <p className="text-[10px] text-zinc-500">{formatRelativeVi(post.shared_post.created_at)}</p>
            </div>
          </div>
          {post.shared_post.content && (
            <p className="px-2.5 pb-2 text-xs text-zinc-700 dark:text-zinc-300 line-clamp-4">{post.shared_post.content}</p>
          )}
          {post.shared_post.media_url && (
            <img src={post.shared_post.media_url} alt="" className="w-full max-h-52 object-cover" />
          )}
        </div>
      )}

      {/* Media Carousel */}
      {mediaList.length > 0 && (
        <div className="relative bg-zinc-100 dark:bg-zinc-950">
          {mediaList[albumIdx]?.type === 'video' ? (
            <video
              src={mediaList[albumIdx].url}
              poster={mediaList[albumIdx].coverUrl || post.cover_url || undefined}
              controls
              playsInline
              className="w-full max-h-[380px] object-cover bg-black"
            />
          ) : (
            <img
              src={mediaList[albumIdx]?.url}
              alt={post.author_name}
              className="w-full max-h-[380px] object-cover"
            />
          )}

          {mediaList.length > 1 && (
            <>
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/60 text-white text-[11px] font-mono-num">
                {albumIdx + 1}/{mediaList.length}
              </div>
              {albumIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setAlbumIdx((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"
                  aria-label="Ảnh trước"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {albumIdx < mediaList.length - 1 && (
                <button
                  type="button"
                  onClick={() => setAlbumIdx((i) => Math.min(mediaList.length - 1, i + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"
                  aria-label="Ảnh tiếp theo"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Engagement Summary Row (Zero-Pill Typography) */}
      <div className="px-3.5 py-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-1.5">
          {topReactions.length > 0 && (
            <span className="inline-flex items-center -space-x-1">
              {topReactions.map((r) => (
                <span key={r} className="text-xs">
                  {REACTION_META[r].emoji}
                </span>
              ))}
            </span>
          )}
          <span className="font-mono-num">{formatCompactCount(post.total_reactions)} cảm xúc</span>
        </div>
        <div className="flex items-center gap-2 font-mono-num">
          <button type="button" onClick={() => onOpenComments(post)} className="hover:underline">
            {formatCompactCount(post.comments_count)} bình luận
          </button>
          <span>·</span>
          <span>{formatCompactCount(post.shares_count)} chia sẻ</span>
          <span>·</span>
          <span>{formatCompactCount(post.views_count)} lượt xem</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-1.5 py-0.5 grid grid-cols-4 items-center relative">
        {/* Reaction Button + Picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => onReact(post.id, post.my_reaction || 'like')}
            onContextMenu={(e) => {
              e.preventDefault();
              setRxPickerOpen((v) => !v);
            }}
            className={`w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform ${
              activeRxMeta ? activeRxMeta.colorClass : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            {activeRxMeta ? <span className="text-sm">{activeRxMeta.emoji}</span> : <ThumbsUp className="w-4 h-4" />}
            <span>{activeRxMeta ? activeRxMeta.label : 'Thích'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRxPickerOpen((v) => !v)}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-7 text-[10px] text-zinc-400 hover:text-zinc-600"
            title="Chọn cảm xúc"
            aria-label="Mở bảng 6 cảm xúc"
          >
            ▾
          </button>

          {rxPickerOpen && (
            <div className="absolute bottom-12 left-0 z-30 flex items-center gap-1 p-1.5 rounded-2xl bg-white dark:bg-[#1E2230] border border-zinc-200 dark:border-zinc-700 shadow-2xl">
              {REACTION_LIST.map((rx) => (
                <button
                  key={rx}
                  type="button"
                  onClick={() => {
                    setRxPickerOpen(false);
                    onReact(post.id, rx);
                  }}
                  title={REACTION_META[rx].label}
                  className="w-9 h-9 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-lg hover:scale-125 transition-transform"
                >
                  {REACTION_META[rx].emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <button
          type="button"
          onClick={() => onOpenComments(post)}
          className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Bình luận</span>
        </button>

        {/* Share */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShareMenuOpen((v) => !v);
              setSaveMenuOpen(false);
            }}
            className="w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
          >
            <Share2 className="w-4 h-4" />
            <span>Chia sẻ</span>
          </button>

          {shareMenuOpen && (
            <div className="absolute bottom-12 right-0 z-30 w-52 rounded-2xl bg-white dark:bg-[#1C1F2A] border border-zinc-200 dark:border-zinc-700 shadow-xl py-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShareMenuOpen(false);
                  onShareRepost(post);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Repeat2 className="w-4 h-4 text-indigo-500" /> Đăng lại lên trang cá nhân
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareMenuOpen(false);
                  onShareToChat(post);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Send className="w-4 h-4 text-sky-500" /> Gửi qua tin nhắn VibeSphere
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareMenuOpen(false);
                  onCopyLink(post.id);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Copy className="w-4 h-4 text-zinc-500" /> Sao chép liên kết
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareMenuOpen(false);
                  onShareOSSheet(post);
                }}
                className="w-full min-h-[40px] px-3.5 flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Share2 className="w-4 h-4 text-emerald-500" /> Chia sẻ sang app Phone OS
              </button>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (collections.length > 0 && !post.is_saved) {
                setSaveMenuOpen((v) => !v);
                setShareMenuOpen(false);
              } else {
                onSave(post.id);
              }
            }}
            className={`w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 ${
              post.is_saved ? 'text-amber-500' : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${post.is_saved ? 'fill-amber-500' : ''}`} />
            <span>{post.is_saved ? 'Đã lưu' : 'Lưu'}</span>
          </button>

          {saveMenuOpen && (
            <div className="absolute bottom-12 right-0 z-30 w-48 rounded-2xl bg-white dark:bg-[#1C1F2A] border border-zinc-200 dark:border-zinc-700 shadow-xl py-1.5 text-xs">
              <p className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Chọn bộ sưu tập</p>
              <button
                type="button"
                onClick={() => {
                  setSaveMenuOpen(false);
                  onSave(post.id, '');
                }}
                className="w-full min-h-[38px] px-3.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Lưu nhanh
              </button>
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSaveMenuOpen(false);
                    onSave(post.id, c.id);
                  }}
                  className="w-full min-h-[38px] px-3.5 text-left truncate hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
