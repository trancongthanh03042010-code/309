import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Compass,
  Film,
  Home,
  MessageCircle,
  Plus,
  PlusSquare,
  Radio,
  RefreshCw,
  Sparkles,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { getStoredSocialToken, setStoredSocialToken, socialApi } from '../services/socialApi';
import type {
  SocialCollectionItem,
  SocialGroupItem,
  SocialNotificationItem,
  SocialPostItem,
  SocialReactionType,
  SocialStoryItem,
  SocialUser,
} from '../types/social';
import { SocialAuthModal } from '../components/social/SocialAuthModal';
import { SocialChatView, type IncomingRtcSignal } from '../components/social/SocialChatView';
import { SocialCommentsSheet } from '../components/social/SocialCommentsSheet';
import { SocialComposerModal } from '../components/social/SocialComposerModal';
import { SocialExploreView } from '../components/social/SocialExploreView';
import { SocialLivestreamView } from '../components/social/SocialLivestreamView';
import { SocialPostCard } from '../components/social/SocialPostCard';
import { SocialProfileAndHubView } from '../components/social/SocialProfileAndHubView';
import { SocialReelsView } from '../components/social/SocialReelsView';
import { SocialReportModal } from '../components/social/SocialReportModal';
import { SocialStoryViewer } from '../components/social/SocialStoryViewer';
import {
  formatRelativeVi,
  SocialEmptyState,
  SocialErrorState,
  SocialSkeletonFeed,
  UserAvatar,
} from '../components/social/SocialUI';
import { useSocialWS } from '../components/social/useSocialWS';

type NavTab = 'feed' | 'explore' | 'reels' | 'chat' | 'profile';
type FeedFilter = 'for_you' | 'following' | 'friends' | 'latest' | 'saved' | 'drafts' | 'scheduled';

export function AnimeSocialApp() {
  const { appParams, openShareSheet, showToast, triggerHaptic } = useOS();

  // Auth & User
  const [currentUser, setCurrentUser] = useState<SocialUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Navigation & Deep-links
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [profileUserId, setProfileUserId] = useState<string>('');
  const [profileSection, setProfileSection] = useState<'profile' | 'friends' | 'groups_pages' | 'saved' | 'studio' | 'settings' | 'admin'>('profile');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Feed state + scroll restoration
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('for_you');
  const [hashtagFilter, setHashtagFilter] = useState<string>('');
  const [groupFilter, setGroupFilter] = useState<{ id: string; name: string } | null>(null);
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTopRef = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);

  // Stories, Collections, Groups, Notifications
  const [stories, setStories] = useState<SocialStoryItem[]>([]);
  const [collections, setCollections] = useState<SocialCollectionItem[]>([]);
  const [groups, setGroups] = useState<SocialGroupItem[]>([]);
  const [notifications, setNotifications] = useState<SocialNotificationItem[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Overlays & Modals
  const [composerState, setComposerState] = useState<{
    open: boolean;
    initialTab: 'post' | 'story' | 'video';
    editingPost?: SocialPostItem | null;
    repostSource?: SocialPostItem | null;
  } | null>(null);
  const [commentsTarget, setCommentsTarget] = useState<SocialPostItem | null>(null);
  const [storyViewerIdx, setStoryViewerIdx] = useState<number | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [livestreamOpen, setLivestreamOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'post' | 'video' | 'comment' | 'user'; id: string } | null>(null);
  const [latestWsSignal, setLatestWsSignal] = useState<IncomingRtcSignal | null>(null);

  // Bootstrap authentication
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setAuthLoading(true);
      try {
        const stored = getStoredSocialToken();
        if (stored) {
          try {
            const me = await socialApi.me();
            if (mounted) {
              setCurrentUser(me.user);
              setProfileUserId(me.user.id);
              return;
            }
          } catch {
            setStoredSocialToken('');
          }
        }
        const boot = await socialApi.osBootstrap();
        setStoredSocialToken(boot.token);
        if (mounted) {
          setCurrentUser(boot.user);
          setProfileUserId(boot.user.id);
        }
      } catch {
        if (mounted) setAuthModalOpen(true);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSidebarBadges = useCallback(async () => {
    try {
      const [notifRes, chatsRes, colRes, grpRes] = await Promise.all([
        socialApi.getNotifications(),
        socialApi.getChats(),
        socialApi.getCollections(),
        socialApi.getGroups(),
      ]);
      setNotifications(notifRes.notifications);
      setUnreadNotifCount(notifRes.unreadCount);
      setUnreadChatCount(chatsRes.chats.reduce((sum, c) => sum + c.unread_count, 0));
      setCollections(colRes.collections);
      setGroups(grpRes.groups);
    } catch {
      // ignore background badge failure
    }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const res = await socialApi.getStories();
      setStories(res.stories);
    } catch {
      // ignore
    }
  }, []);

  const loadFeed = useCallback(
    async (opts?: { reset?: boolean; offsetOverride?: number }) => {
      const reset = opts?.reset ?? true;
      if (reset) setFeedLoading(true);
      setFeedError('');
      try {
        const offset = opts?.offsetOverride ?? (reset ? 0 : posts.length);
        const res = await socialApi.getFeed({
          filter: feedFilter,
          hashtag: hashtagFilter,
          groupId: groupFilter?.id,
          limit: 10,
          offset,
        });
        setPosts((prev) => (reset ? res.posts : [...prev, ...res.posts.filter((np) => !prev.some((p) => p.id === np.id))]));
        setFeedHasMore(res.hasMore);
      } catch (err) {
        setFeedError(err instanceof Error ? err.message : 'Không thể tải bảng tin.');
      } finally {
        setFeedLoading(false);
        setRefreshing(false);
      }
    },
    [feedFilter, hashtagFilter, groupFilter?.id, posts.length]
  );

  // Initial load after auth
  useEffect(() => {
    if (!currentUser) return;
    void loadFeed({ reset: true, offsetOverride: 0 });
    void loadStories();
    void refreshSidebarBadges();
  }, [currentUser?.id, feedFilter, hashtagFilter, groupFilter?.id]);

  // Honor OS appParams deep-links
  useEffect(() => {
    if (!currentUser) return;
    if (appParams.tab === 'reels' || appParams.tab === 'video') setActiveTab('reels');
    else if (appParams.tab === 'explore') setActiveTab('explore');
    else if (appParams.tab === 'chat') setActiveTab('chat');
    else if (appParams.tab === 'profile') setActiveTab('profile');
    if (appParams.postId) {
      void socialApi
        .getPostDetail(appParams.postId)
        .then((res) => {
          setActiveTab('feed');
          setCommentsTarget(res.post);
        })
        .catch(() => {});
    }
  }, [appParams.tab, appParams.postId, currentUser?.id]);

  // Restore scroll top when returning to Feed
  useEffect(() => {
    if (activeTab === 'feed' && feedScrollRef.current && savedScrollTopRef.current > 0) {
      feedScrollRef.current.scrollTop = savedScrollTopRef.current;
    }
  }, [activeTab]);

  // WebSocket real-time events
  const handleWsEvent = useCallback(
    (event: string, payload: unknown) => {
      const p = (payload || {}) as Record<string, unknown>;
      setLatestWsSignal({ event, payload: p });
      if (event === 'notification:new') {
        const n = p as unknown as SocialNotificationItem;
        setNotifications((prev) => [n, ...prev]);
        setUnreadNotifCount((c) => c + 1);
        triggerHaptic('msg');
        showToast(n.title || 'Thông báo mới', n.body || '');
      } else if (event === 'chat:message') {
        setUnreadChatCount((c) => c + 1);
      } else if (event === 'feed:reaction') {
        const pid = String(p.postId || '');
        const total = Number(p.total_reactions || 0);
        setPosts((prev) => prev.map((post) => (post.id === pid ? { ...post, total_reactions: total } : post)));
      } else if (event === 'rtc:call_invite') {
        setActiveTab('chat');
        showToast('Cuộc gọi đến', `${String(p.callerName || 'Ai đó')} đang gọi cho bạn...`);
      }
    },
    [showToast, triggerHaptic]
  );

  const { connected: wsConnected, sendWs } = useSocialWS(Boolean(currentUser), handleWsEvent);

  const switchTab = (next: NavTab) => {
    if (activeTab === 'feed' && feedScrollRef.current) {
      savedScrollTopRef.current = feedScrollRef.current.scrollTop;
    }
    if (next === 'profile' && currentUser) {
      setProfileUserId(currentUser.id);
      setProfileSection('profile');
    }
    setActiveTab(next);
  };

  const openUserProfile = (uid: string) => {
    if (activeTab === 'feed' && feedScrollRef.current) {
      savedScrollTopRef.current = feedScrollRef.current.scrollTop;
    }
    setProfileUserId(uid);
    setProfileSection('profile');
    setActiveTab('profile');
  };

  const openChatWithUser = async (targetUserId: string) => {
    try {
      const res = await socialApi.createChat([targetUserId], false);
      setActiveChatId(res.chatId);
      setActiveTab('chat');
    } catch (err) {
      showToast('Nhắn tin', err instanceof Error ? err.message : 'Không thể mở đoạn chat', 'error');
    }
  };

  // Post handlers
  const handleReactPost = async (postId: string, rx: SocialReactionType) => {
    try {
      const res = await socialApi.reactPost(postId, rx);
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch (err) {
      showToast('Tương tác', err instanceof Error ? err.message : 'Thao tác thất bại', 'error');
    }
  };

  const handleSavePost = async (postId: string, collectionId = '') => {
    try {
      const res = await socialApi.saveItem(postId, 'post', collectionId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, is_saved: res.saved, saved_collection_id: res.collection_id } : p))
      );
      showToast('Lưu bài viết', res.saved ? 'Đã lưu vào bộ sưu tập.' : 'Đã bỏ lưu bài viết.');
    } catch (err) {
      showToast('Lưu bài viết', err instanceof Error ? err.message : 'Lỗi lưu bài viết', 'error');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await socialApi.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast('Bài viết', 'Đã xóa bài viết.', 'success');
    } catch (err) {
      showToast('Bài viết', err instanceof Error ? err.message : 'Không thể xóa bài viết', 'error');
    }
  };

  const handleManualRefresh = () => {
    setRefreshing(true);
    void loadFeed({ reset: true, offsetOverride: 0 });
    void loadStories();
    void refreshSidebarBadges();
  };

  if (authLoading) {
    return (
      <div className="h-full bg-zinc-50 dark:bg-[#0D0F14] flex flex-col">
        <div className="px-4 py-3 bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">VibeSphere</span>
        </div>
        <SocialSkeletonFeed />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="h-full bg-zinc-50 dark:bg-[#0D0F14] flex items-center justify-center p-4">
        <SocialAuthModal
          canDismiss={false}
          onAuthenticated={(u) => {
            setCurrentUser(u);
            setProfileUserId(u.id);
            setAuthModalOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-zinc-50 dark:bg-[#0D0F14] text-zinc-900 dark:text-zinc-100 overflow-hidden relative">
      {/* FEED TAB */}
      {activeTab === 'feed' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Compact Top Header */}
          <div className="px-3 py-2 bg-white/95 dark:bg-[#14161D]/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight leading-none">VibeSphere</h1>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {wsConnected ? 'Trực tuyến' : 'Đang kết nối'} · @{currentUser.username}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleManualRefresh}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Làm mới bảng tin"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
              <button
                onClick={() => setLivestreamOpen(true)}
                className="min-h-[36px] px-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1"
              >
                <Radio className="w-3.5 h-3.5" /> Live
              </button>
              <button
                onClick={() => {
                  setProfileUserId(currentUser.id);
                  setProfileSection('groups_pages');
                  setActiveTab('profile');
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Nhóm & Trang"
              >
                <Users className="w-4 h-4" />
              </button>
              <button
                onClick={() => setNotifDrawerOpen(true)}
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Thông báo"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Scrollable Feed Body with Pull-to-Refresh */}
          <div
            ref={feedScrollRef}
            onTouchStart={(e) => {
              if (feedScrollRef.current && feedScrollRef.current.scrollTop <= 2) {
                touchStartYRef.current = e.touches[0].clientY;
              } else {
                touchStartYRef.current = null;
              }
            }}
            onTouchEnd={(e) => {
              if (touchStartYRef.current !== null && e.changedTouches[0].clientY - touchStartYRef.current > 70) {
                handleManualRefresh();
              }
              touchStartYRef.current = null;
            }}
            className="flex-1 overflow-y-auto"
          >
            {/* Stories Strip */}
            <div className="px-3 py-2.5 bg-white dark:bg-[#14161D] border-b border-zinc-200/80 dark:border-zinc-800 flex gap-3 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setComposerState({ open: true, initialTab: 'story' })}
                className="flex flex-col items-center gap-1 shrink-0 w-16"
              >
                <div className="relative w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border-2 border-dashed border-indigo-500/60">
                  <UserAvatar src={currentUser.avatar} name={currentUser.display_name} size="md" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center border-2 border-white dark:border-[#14161D]">
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
                <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate w-full text-center">
                  Tạo Tin
                </span>
              </button>

              {stories.map((st, idx) => (
                <button
                  key={st.id}
                  onClick={() => setStoryViewerIdx(idx)}
                  className="flex flex-col items-center gap-1 shrink-0 w-16"
                >
                  <UserAvatar src={st.author_avatar} name={st.author_name} size="lg" ring={!st.viewed} />
                  <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate w-full text-center">
                    {st.author_name}
                  </span>
                </button>
              ))}
            </div>

            {/* Feed Filter Tabs */}
            <div className="px-3 py-2 bg-white dark:bg-[#14161D] border-b border-zinc-200/80 dark:border-zinc-800 flex gap-1.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'for_you', label: 'Dành cho bạn' },
                  { id: 'following', label: 'Đang theo dõi' },
                  { id: 'friends', label: 'Bạn bè' },
                  { id: 'latest', label: 'Mới nhất' },
                  { id: 'saved', label: 'Đã lưu' },
                  { id: 'drafts', label: 'Bản nháp' },
                  { id: 'scheduled', label: 'Đã hẹn' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFeedFilter(f.id);
                    setHashtagFilter('');
                    setGroupFilter(null);
                  }}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    feedFilter === f.id && !hashtagFilter && !groupFilter
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Active Hashtag / Group Filter Bar */}
            {(hashtagFilter || groupFilter) && (
              <div className="px-3 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {groupFilter ? `Đang xem nhóm: ${groupFilter.name}` : `Đang lọc theo ${hashtagFilter}`}
                </span>
                <button
                  onClick={() => {
                    setHashtagFilter('');
                    setGroupFilter(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Bỏ lọc
                </button>
              </div>
            )}

            {/* Quick Composer Trigger */}
            <div className="p-3 pb-0">
              <button
                onClick={() => setComposerState({ open: true, initialTab: 'post' })}
                className="w-full p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3 text-left"
              >
                <UserAvatar src={currentUser.avatar} name={currentUser.display_name} size="sm" />
                <span className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {currentUser.display_name} ơi, bạn đang nghĩ gì thế?
                </span>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Đăng bài</span>
              </button>
            </div>

            {/* Feed Posts */}
            {feedLoading && posts.length === 0 ? (
              <SocialSkeletonFeed />
            ) : feedError ? (
              <SocialErrorState message={feedError} onRetry={() => void loadFeed({ reset: true, offsetOverride: 0 })} />
            ) : posts.length === 0 ? (
              <SocialEmptyState
                title="Chưa có bài viết nào"
                description="Hãy tạo bài viết mới hoặc chuyển bộ lọc để khám phá nội dung từ bạn bè."
                actionLabel="Tạo bài viết ngay"
                onAction={() => setComposerState({ open: true, initialTab: 'post' })}
              />
            ) : (
              <div className="p-3 space-y-3 pb-6">
                {posts.map((post) => (
                  <SocialPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    collections={collections}
                    onOpenProfile={openUserProfile}
                    onOpenComments={(p) => setCommentsTarget(p)}
                    onReact={handleReactPost}
                    onSave={handleSavePost}
                    onShareRepost={(p) => setComposerState({ open: true, initialTab: 'post', repostSource: p })}
                    onShareToChat={(p) => {
                      setActiveTab('chat');
                      showToast('Chia sẻ', `Chọn hội thoại để gửi bài viết của ${p.author_name}.`);
                    }}
                    onShareOSSheet={(p) =>
                      openShareSheet({
                        title: `Bài viết của ${p.author_name}`,
                        text: p.content,
                        url: `vibesphere://post/${p.id}`,
                        sourceApp: 'social',
                      })
                    }
                    onEdit={(p) => setComposerState({ open: true, initialTab: 'post', editingPost: p })}
                    onDelete={handleDeletePost}
                    onPin={async (p) => {
                      await socialApi.updatePost(p.id, { is_pinned: !p.is_pinned });
                      void loadFeed({ reset: true, offsetOverride: 0 });
                    }}
                    onHide={async (pid) => {
                      await socialApi.hidePost(pid);
                      setPosts((prev) => prev.filter((x) => x.id !== pid));
                      showToast('Bảng tin', 'Đã ẩn bài viết khỏi bảng tin.');
                    }}
                    onReport={(pid) => setReportTarget({ type: 'post', id: pid })}
                    onBlockAuthor={async (aid, name) => {
                      await socialApi.setRelation(aid, 'block', true);
                      setPosts((prev) => prev.filter((x) => x.author_id !== aid));
                      showToast('Chặn', `Đã chặn ${name}.`);
                    }}
                    onHashtagClick={(tag) => setHashtagFilter(tag)}
                    onCopyLink={(pid) => {
                      void navigator.clipboard?.writeText(`${window.location.origin}/#vibesphere-post-${pid}`);
                      showToast('Liên kết', 'Đã sao chép liên kết bài viết.');
                    }}
                    onOpenGroup={(gid) => {
                      const found = groups.find((g) => g.id === gid);
                      setGroupFilter({ id: gid, name: found?.name || 'Cộng đồng' });
                    }}
                  />
                ))}

                {feedHasMore && (
                  <button
                    onClick={() => void loadFeed({ reset: false })}
                    className="w-full min-h-[44px] rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-indigo-600 dark:text-indigo-400"
                  >
                    Tải thêm bài viết
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXPLORE TAB */}
      {activeTab === 'explore' && (
        <SocialExploreView
          onOpenProfile={openUserProfile}
          onSelectHashtag={(tag) => {
            setHashtagFilter(tag);
            setActiveTab('feed');
          }}
          onOpenGroup={(gid) => {
            const found = groups.find((g) => g.id === gid);
            setGroupFilter({ id: gid, name: found?.name || 'Cộng đồng' });
            setActiveTab('feed');
          }}
          onOpenVideos={() => setActiveTab('reels')}
          onOpenPost={async (pid) => {
            try {
              const res = await socialApi.getPostDetail(pid);
              setActiveTab('feed');
              setCommentsTarget(res.post);
            } catch {
              // ignore
            }
          }}
        />
      )}

      {/* VIDEO / REELS TAB */}
      {activeTab === 'reels' && (
        <SocialReelsView
          currentUserId={currentUser.id}
          onOpenProfile={openUserProfile}
          onCreateVideo={() => setComposerState({ open: true, initialTab: 'video' })}
          onShareVideo={(v) =>
            openShareSheet({
              title: v.title,
              text: v.description || v.title,
              url: `vibesphere://video/${v.id}`,
              sourceApp: 'social',
            })
          }
          onReportVideo={(vid) => setReportTarget({ type: 'video', id: vid })}
          showToast={showToast}
        />
      )}

      {/* MESSAGES TAB */}
      {activeTab === 'chat' && (
        <SocialChatView
          currentUser={currentUser}
          activeChatId={activeChatId}
          onSelectChat={(cid) => {
            setActiveChatId(cid);
            void refreshSidebarBadges();
          }}
          sendWs={sendWs}
          wsConnected={wsConnected}
          latestWsSignal={latestWsSignal}
          onOpenProfile={openUserProfile}
          showToast={showToast}
        />
      )}

      {/* PROFILE & HUBS TAB */}
      {activeTab === 'profile' && (
        <SocialProfileAndHubView
          currentUser={currentUser}
          viewingUserId={profileUserId || currentUser.id}
          initialSection={profileSection}
          collections={collections}
          onBackToSelf={() => {
            setProfileUserId(currentUser.id);
            setProfileSection('profile');
          }}
          onUserUpdated={(u) => setCurrentUser(u)}
          onOpenChatWithUser={openChatWithUser}
          onOpenProfile={openUserProfile}
          onOpenComments={(p) => setCommentsTarget(p)}
          onReactPost={handleReactPost}
          onSavePost={handleSavePost}
          onEditPost={(p) => setComposerState({ open: true, initialTab: 'post', editingPost: p })}
          onDeletePost={handleDeletePost}
          onShareRepost={(p) => setComposerState({ open: true, initialTab: 'post', repostSource: p })}
          onShareOSSheet={(p) =>
            openShareSheet({
              title: `Bài viết của ${p.author_name}`,
              text: p.content,
              url: `vibesphere://post/${p.id}`,
              sourceApp: 'social',
            })
          }
          onReportTarget={(t, id) => setReportTarget({ type: t, id })}
          onSwitchAccount={() => setAuthModalOpen(true)}
          onLoggedOut={() => {
            setCurrentUser(null);
            setAuthModalOpen(true);
          }}
          onOpenGroupFeed={(gid, gname) => {
            setGroupFilter({ id: gid, name: gname });
            setActiveTab('feed');
          }}
          showToast={showToast}
        />
      )}

      {/* BOTTOM NAVIGATION BAR (6 DESTINATIONS: Trang chủ, Khám phá, Video, Đăng bài, Tin nhắn, Cá nhân) */}
      <nav className="bg-white/95 dark:bg-[#14161D]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-1 py-1 grid grid-cols-6 shrink-0">
        <button
          onClick={() => switchTab('feed')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'feed' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Trang chủ</span>
        </button>

        <button
          onClick={() => switchTab('explore')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'explore' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Khám phá</span>
        </button>

        <button
          onClick={() => switchTab('reels')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'reels' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Video</span>
        </button>

        <button
          onClick={() => setComposerState({ open: true, initialTab: activeTab === 'reels' ? 'video' : 'post' })}
          className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-indigo-600 dark:text-indigo-400 active:scale-95 transition-transform"
        >
          <PlusSquare className="w-5 h-5" />
          <span className="text-[10px] font-bold">Đăng bài</span>
        </button>

        <button
          onClick={() => switchTab('chat')}
          className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'chat' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Tin nhắn</span>
          {unreadChatCount > 0 && (
            <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadChatCount > 9 ? '9+' : unreadChatCount}
            </span>
          )}
        </button>

        <button
          onClick={() => switchTab('profile')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'profile' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Cá nhân</span>
        </button>
      </nav>

      {/* MODALS & DRAWERS */}
      {composerState?.open && (
        <SocialComposerModal
          initialTab={composerState.initialTab}
          editingPost={composerState.editingPost}
          repostSource={composerState.repostSource}
          defaultGroupId={groupFilter?.id}
          groups={groups}
          onClose={() => setComposerState(null)}
          onSuccess={(kind, msg) => {
            setComposerState(null);
            showToast('VibeSphere', msg, 'success');
            if (kind === 'post') void loadFeed({ reset: true, offsetOverride: 0 });
            if (kind === 'story') void loadStories();
            if (kind === 'video') setActiveTab('reels');
          }}
        />
      )}

      {commentsTarget && (
        <SocialCommentsSheet
          targetType="post"
          targetId={commentsTarget.id}
          ownerId={commentsTarget.author_id}
          commentPolicy={commentsTarget.comment_policy}
          currentUserId={currentUser.id}
          onClose={() => setCommentsTarget(null)}
          onCountChanged={() => void loadFeed({ reset: true, offsetOverride: 0 })}
          onOpenProfile={(uid) => {
            setCommentsTarget(null);
            openUserProfile(uid);
          }}
          onReportComment={(cid) => setReportTarget({ type: 'comment', id: cid })}
        />
      )}

      {storyViewerIdx !== null && (
        <SocialStoryViewer
          stories={stories}
          initialIndex={storyViewerIdx}
          currentUserId={currentUser.id}
          onClose={() => {
            setStoryViewerIdx(null);
            void loadStories();
          }}
          onReplyToAuthor={async (authorId, caption, reply) => {
            const chatRes = await socialApi.createChat([authorId], false);
            await socialApi.sendChatMessage(chatRes.chatId, {
              content: `Trả lời Tin (${caption || 'Khoảnh khắc'}): ${reply}`,
              msg_type: 'story_reply',
            });
            showToast('Tin 24h', 'Đã gửi phản hồi vào hộp thư.');
          }}
          onSavedHighlight={() => showToast('Tin nổi bật', 'Đã lưu vào mục Tin nổi bật trên hồ sơ.', 'success')}
        />
      )}

      {livestreamOpen && (
        <SocialLivestreamView
          currentUser={currentUser}
          sendWs={sendWs}
          latestWsSignal={latestWsSignal}
          onClose={() => setLivestreamOpen(false)}
          showToast={showToast}
        />
      )}

      {notifDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 max-h-[85dvh] flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold">Thông báo VibeSphere</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    await socialApi.markAllNotificationsRead();
                    void refreshSidebarBadges();
                  }}
                  className="min-h-[38px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Đọc tất cả
                </button>
                <button
                  onClick={() => setNotifDrawerOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {notifications.length === 0 ? (
                <SocialEmptyState title="Chưa có thông báo" description="Các lượt thích, bình luận và lời mời kết bạn sẽ hiện ở đây." />
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      setNotifDrawerOpen(false);
                      if (!n.is_read) {
                        await socialApi.markNotificationRead(n.id);
                        void refreshSidebarBadges();
                      }
                      if (n.target_type === 'profile' && n.target_id) {
                        openUserProfile(n.target_id);
                      } else if (n.target_type === 'post' && n.target_id) {
                        const res = await socialApi.getPostDetail(n.target_id).catch(() => null);
                        if (res) setCommentsTarget(res.post);
                      } else if (n.target_type === 'livestream') {
                        setLivestreamOpen(true);
                      }
                    }}
                    className={`w-full p-3 rounded-2xl flex items-start gap-2.5 text-left border ${
                      n.is_read
                        ? 'bg-white dark:bg-[#14161D] border-zinc-200 dark:border-zinc-800'
                        : 'bg-indigo-500/10 border-indigo-500/30'
                    }`}
                  >
                    <UserAvatar src={n.actor_avatar} name={n.actor_name || 'VibeSphere'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{n.title}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-zinc-400 mt-1">{formatRelativeVi(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {reportTarget && (
        <SocialReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
          onSubmitted={(msg) => showToast('Báo cáo', msg, 'success')}
        />
      )}

      {authModalOpen && (
        <SocialAuthModal
          canDismiss={Boolean(currentUser)}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={(u) => {
            setCurrentUser(u);
            setProfileUserId(u.id);
            setAuthModalOpen(false);
            setActiveTab('feed');
          }}
        />
      )}
    </div>
  );
}
