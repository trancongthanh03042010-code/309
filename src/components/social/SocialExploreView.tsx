import React, { useEffect, useState } from 'react';
import { Flame, Hash, History, Play, Search, Trash2, Users, X } from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialGroupItem, SocialPageItem, SocialPostItem, SocialUser, SocialVideoItem } from '../../types/social';
import { formatCompactCount, SocialEmptyState, UserAvatar, VerifiedBadge } from './SocialUI';

interface SocialExploreViewProps {
  onOpenProfile: (userId: string) => void;
  onSelectHashtag: (tag: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenVideos: () => void;
  onOpenPost: (postId: string) => void;
}

export function SocialExploreView({
  onOpenProfile,
  onSelectHashtag,
  onOpenGroup,
  onOpenVideos,
  onOpenPost,
}: SocialExploreViewProps) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<'all' | 'users' | 'posts' | 'videos' | 'groups' | 'pages'>('all');
  const [loading, setLoading] = useState(true);

  // Explore defaults
  const [trendingPosts, setTrendingPosts] = useState<SocialPostItem[]>([]);
  const [trendingVideos, setTrendingVideos] = useState<SocialVideoItem[]>([]);
  const [trendingTags, setTrendingTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SocialUser[]>([]);

  // Search results & history
  const [history, setHistory] = useState<Array<{ id: string; query: string }>>([]);
  const [searchResults, setSearchResults] = useState<{
    users: SocialUser[];
    posts: SocialPostItem[];
    videos: SocialVideoItem[];
    groups: SocialGroupItem[];
    pages: SocialPageItem[];
  } | null>(null);

  const loadExplore = async () => {
    setLoading(true);
    try {
      const [exp, sr] = await Promise.all([socialApi.getExplore(), socialApi.search('')]);
      setTrendingPosts(exp.trendingPosts);
      setTrendingVideos(exp.trendingVideos);
      setTrendingTags(exp.trendingHashtags);
      setSuggestedUsers(exp.suggestedUsers);
      setHistory(sr.history || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExplore();
  }, []);

  const runSearch = async (qStr: string, saveHistory = false) => {
    const clean = qStr.trim();
    if (!clean) {
      setSearchResults(null);
      return;
    }
    const res = await socialApi.search(clean, cat, saveHistory);
    setSearchResults({
      users: res.users,
      posts: res.posts,
      videos: res.videos,
      groups: res.groups,
      pages: res.pages,
    });
    if (saveHistory) {
      const h = await socialApi.search('');
      setHistory(h.history || []);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) void runSearch(query, false);
      else setSearchResults(null);
    }, 220);
    return () => clearTimeout(t);
  }, [query, cat]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F8F9FB] dark:bg-[#0A0B0F]">
      {/* Search Bar Header */}
      <div className="p-3 bg-white dark:bg-[#14161D] border-b border-zinc-200/80 dark:border-zinc-800/80 space-y-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query, true);
          }}
          className="flex items-center gap-2 px-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 min-h-[44px]"
        >
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm người dùng, bài viết, #hashtag, nhóm, video..."
            className="flex-1 bg-transparent text-xs outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="p-1 text-zinc-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {query.trim() && (
          <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'users', label: 'Mọi người' },
              { id: 'posts', label: 'Bài viết' },
              { id: 'videos', label: 'Video' },
              { id: 'groups', label: 'Nhóm' },
              { id: 'pages', label: 'Trang' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCat(t.id as typeof cat)}
                className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold shrink-0 ${
                  cat === t.id ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-4">
        {/* Search Results Mode */}
        {searchResults ? (
          <div className="space-y-4">
            {(cat === 'all' || cat === 'users') && searchResults.users.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Người dùng</h3>
                {searchResults.users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProfile(u.id)}
                      className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                    >
                      <UserAvatar src={u.avatar} name={u.display_name} online={u.is_online} size="md" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate flex items-center gap-1">
                          {u.display_name}
                          <VerifiedBadge verified={u.is_verified} />
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">@{u.username} · {u.bio}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await socialApi.toggleFollow(u.id);
                        setSearchResults((prev) =>
                          prev
                            ? {
                                ...prev,
                                users: prev.users.map((item) => (item.id === u.id ? { ...item, is_following: r.following } : item)),
                              }
                            : prev
                        );
                      }}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold shrink-0 ${
                        u.is_following ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200' : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {u.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                    </button>
                  </div>
                ))}
              </section>
            )}

            {(cat === 'all' || cat === 'groups') && searchResults.groups.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nhóm cộng đồng</h3>
                {searchResults.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onOpenGroup(g.id)}
                    className="w-full p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 flex items-center gap-3 text-left"
                  >
                    <img src={g.cover_url} alt={g.name} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{g.name}</p>
                      <p className="text-[11px] text-zinc-500">{g.members_count} thành viên · {g.privacy === 'private' ? 'Nhóm kín' : 'Công khai'}</p>
                    </div>
                  </button>
                ))}
              </section>
            )}

            {(cat === 'all' || cat === 'videos') && searchResults.videos.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Video ngắn</h3>
                <div className="grid grid-cols-2 gap-2">
                  {searchResults.videos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={onOpenVideos}
                      className="relative h-44 rounded-2xl overflow-hidden bg-black text-left"
                    >
                      <img src={v.cover_url} alt={v.title} className="w-full h-full object-cover opacity-90" />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent text-white">
                        <p className="text-[11px] font-bold line-clamp-2">{v.title}</p>
                        <p className="text-[10px] text-white/75 flex items-center gap-1 mt-0.5">
                          <Play className="w-3 h-3" /> {formatCompactCount(v.views_count)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(cat === 'all' || cat === 'posts') && searchResults.posts.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Bài viết</h3>
                {searchResults.posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenPost(p.id)}
                    className="w-full p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 text-left space-y-1"
                  >
                    <p className="text-xs font-bold">{p.author_name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">{p.content}</p>
                  </button>
                ))}
              </section>
            )}

            {searchResults.users.length === 0 &&
              searchResults.posts.length === 0 &&
              searchResults.videos.length === 0 &&
              searchResults.groups.length === 0 &&
              searchResults.pages.length === 0 && (
                <SocialEmptyState
                  title="Không tìm thấy kết quả"
                  description={`Không có nội dung phù hợp với "${query}". Hãy thử từ khóa khác.`}
                />
              )}
          </div>
        ) : (
          /* Default Explore Mode */
          <>
            {/* Search History */}
            {history.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Tìm kiếm gần đây
                  </h3>
                  <button
                    type="button"
                    onClick={async () => {
                      await socialApi.clearSearchHistory('all');
                      setHistory([]);
                    }}
                    className="text-[11px] text-rose-500 font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Xóa tất cả
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {history.slice(0, 6).map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setQuery(h.query);
                        void runSearch(h.query, false);
                      }}
                      className="min-h-[34px] px-3 rounded-xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 text-xs"
                    >
                      {h.query}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Trending Hashtags */}
            {trendingTags.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-500" /> Chủ đề thịnh hành
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {trendingTags.slice(0, 6).map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => onSelectHashtag(t.tag)}
                      className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 text-left flex items-center gap-2.5"
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                        <Hash className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{t.tag}</p>
                        <p className="text-[11px] text-zinc-500 font-mono-num">{t.count} bài nổi bật</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Suggested Creators / Friends */}
            {suggestedUsers.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-500" /> Gợi ý kết nối
                </h3>
                <div className="flex gap-2.5 overflow-x-auto os-scroll-hidden pb-1">
                  {suggestedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="w-36 shrink-0 p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 flex flex-col items-center text-center gap-2"
                    >
                      <button type="button" onClick={() => onOpenProfile(u.id)}>
                        <UserAvatar src={u.avatar} name={u.display_name} online={u.is_online} size="lg" />
                      </button>
                      <div className="min-w-0 w-full">
                        <p className="text-xs font-bold truncate flex items-center justify-center gap-0.5">
                          <span className="truncate">{u.display_name}</span>
                          <VerifiedBadge verified={u.is_verified} />
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">@{u.username}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await socialApi.toggleFollow(u.id);
                          setSuggestedUsers((prev) =>
                            prev.map((item) => (item.id === u.id ? { ...item, is_following: r.following } : item))
                          );
                        }}
                        className={`w-full min-h-[36px] rounded-xl text-[11px] font-semibold ${
                          u.is_following ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {u.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Trending Video Reels Grid */}
            {!loading && trendingVideos.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Video đề xuất</h3>
                  <button type="button" onClick={onOpenVideos} className="text-xs font-semibold text-indigo-500">
                    Xem tất cả
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {trendingVideos.slice(0, 6).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={onOpenVideos}
                      className="relative aspect-[9/14] rounded-xl overflow-hidden bg-black text-left"
                    >
                      <img src={v.cover_url} alt={v.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] font-mono-num flex items-center gap-1">
                        <Play className="w-3 h-3" /> {formatCompactCount(v.views_count)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Trending Posts */}
            {trendingPosts.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Bài viết nổi bật</h3>
                {trendingPosts.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenPost(p.id)}
                    className="w-full p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800/80 flex items-center gap-3 text-left"
                  >
                    {p.media_url && <img src={p.media_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{p.author_name}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-0.5">{p.content}</p>
                      <p className="text-[10px] text-zinc-400 font-mono-num mt-1">
                        {p.total_reactions} cảm xúc · {p.comments_count} bình luận
                      </p>
                    </div>
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
