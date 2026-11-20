import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  EyeOff,
  Flag,
  Heart,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

export function CommunityApp() {
  const { data, refreshData, showToast } = useOS();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [groupId, setGroupId] = useState('grp_1');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const groups = data?.communityGroups || [];
  const posts = (data?.communityPosts || []).filter((p) => !p.is_hidden);
  const comments = data?.communityComments || [];

  const visiblePosts =
    selectedGroupId === 'all' ? posts : posts.filter((p) => p.group_id === selectedGroupId);

  const createPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;
    await osApi.createCommunityPost({
      group_id: groupId,
      title: title.trim() || 'Chia sẻ cộng đồng',
      content: content.trim(),
    });
    await refreshData();
    setTitle('');
    setContent('');
    setComposerOpen(false);
    showToast('Cộng đồng', 'Đã đăng bài viết mới!', 'success');
  };

  const addComment = async (postId: string) => {
    const text = (replyDrafts[postId] || '').trim();
    if (!text) return;
    await osApi.addCommunityComment({ post_id: postId, content: text });
    await refreshData();
    setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <h1 className="font-display font-bold text-base">Cộng đồng & Nhóm</h1>
          </div>
          <button
            onClick={() => setComposerOpen((v) => !v)}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Đăng bài
          </button>
        </div>

        {/* Groups Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pb-0.5">
          <button
            onClick={() => setSelectedGroupId('all')}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
              selectedGroupId === 'all' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
            }`}
          >
            Tất cả bảng tin
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 flex items-center gap-1 ${
                selectedGroupId === g.id ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
              }`}
            >
              {g.is_private ? <Lock className="w-3 h-3" /> : null}
              {g.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {composerOpen && (
          <form
            onSubmit={createPost}
            className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-indigo-400/50 space-y-2 text-xs"
          >
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Nhóm: {g.name}
                </option>
              ))}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tiêu đề chủ đề..."
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none font-semibold"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Chia sẻ kinh nghiệm, mẹo hay hoặc thắc mắc..."
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none"
            />
            <button type="submit" className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">
              Đăng lên cộng đồng
            </button>
          </form>
        )}

        {/* Group Info Bar when specific group picked */}
        {selectedGroupId !== 'all' && (() => {
          const grp = groups.find((g) => g.id === selectedGroupId);
          if (!grp) return null;
          return (
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold">{grp.name}</p>
                <p className="text-[11px] text-zinc-500 line-clamp-1">{grp.description} · {grp.members_count} thành viên</p>
              </div>
              <button
                onClick={async () => {
                  await osApi.updateCommunityGroup(grp.id, !grp.is_joined);
                  await refreshData();
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 flex items-center gap-1 ${
                  grp.is_joined ? 'bg-emerald-500/20 text-emerald-600' : 'bg-indigo-600 text-white'
                }`}
              >
                {grp.is_joined ? <><Check className="w-3 h-3" /> Đã tham gia</> : 'Tham gia'}
              </button>
            </div>
          );
        })()}

        {visiblePosts.map((post) => {
          const postComments = comments.filter((c) => c.post_id === post.id);
          const grp = groups.find((g) => g.id === post.group_id);
          return (
            <div
              key={post.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={post.author_avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{post.author_name}</p>
                    <p className="text-[10px] text-indigo-500 truncate">{grp?.name || 'Cộng đồng'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      await osApi.updateCommunityPost(post.id, { is_hidden: 1 });
                      await refreshData();
                      showToast('Đã ẩn bài viết', 'Bạn sẽ không thấy bài viết này nữa.');
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-600"
                    title="Ẩn bài viết"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      await osApi.updateCommunityPost(post.id, { reported: 1 });
                      await refreshData();
                      showToast('Đã báo cáo', 'Cảm ơn phản hồi kiểm duyệt nội dung của bạn.');
                    }}
                    className={`p-1 ${post.reported ? 'text-rose-500' : 'text-zinc-400'}`}
                    title="Báo cáo bài viết"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {post.title && <h3 className="font-bold text-sm">{post.title}</h3>}
              <p className="leading-relaxed">{post.content}</p>
              {post.media_url && <img src={post.media_url} alt="" className="w-full h-40 rounded-xl object-cover" />}

              <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      await osApi.updateCommunityPost(post.id, { toggleLike: true });
                      await refreshData();
                    }}
                    className={`flex items-center gap-1 font-semibold ${post.is_liked ? 'text-rose-500' : 'text-zinc-500'}`}
                  >
                    <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-rose-500' : ''}`} /> {post.likes_count}
                  </button>
                  <span className="flex items-center gap-1 text-zinc-500">
                    <MessageSquare className="w-4 h-4" /> {postComments.length}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await osApi.updateCommunityPost(post.id, { toggleSave: true });
                    await refreshData();
                  }}
                  className={post.is_saved ? 'text-amber-500' : 'text-zinc-400'}
                >
                  <Bookmark className={`w-4 h-4 ${post.is_saved ? 'fill-amber-500' : ''}`} />
                </button>
              </div>

              {postComments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {postComments.map((c) => (
                    <div key={c.id} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-[11px]">
                      <span className="font-bold mr-1.5">{c.author_name}:</span>
                      <span>{c.content}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  value={replyDrafts[post.id] || ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addComment(post.id)}
                  placeholder="Viết bình luận..."
                  className="flex-1 px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none text-[11px]"
                />
                <button
                  onClick={() => addComment(post.id)}
                  className="p-1.5 rounded-xl bg-indigo-600 text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
