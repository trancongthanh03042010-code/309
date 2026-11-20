import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bookmark,
  Check,
  Download,
  Edit3,
  EyeOff,
  Flag,
  FolderPlus,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  Plus,
  Shield,
  ShieldAlert,
  ShieldBan,
  Smartphone,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { setStoredSocialToken, socialApi } from '../../services/socialApi';
import type {
  SocialCollectionItem,
  SocialGroupItem,
  SocialHighlightItem,
  SocialPageItem,
  SocialPostItem,
  SocialReactionType,
  SocialSessionItem,
  SocialUser,
  SocialVideoItem,
} from '../../types/social';
import { SocialPostCard } from './SocialPostCard';
import { formatCompactCount, formatRelativeVi, SocialEmptyState, UserAvatar, VerifiedBadge } from './SocialUI';

type HubSection = 'profile' | 'friends' | 'groups_pages' | 'saved' | 'studio' | 'settings' | 'admin';

interface SocialProfileAndHubViewProps {
  currentUser: SocialUser;
  viewingUserId: string; // equals currentUser.id for self
  initialSection?: HubSection;
  collections: SocialCollectionItem[];
  onBackToSelf: () => void;
  onUserUpdated: (user: SocialUser) => void;
  onOpenChatWithUser: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onOpenComments: (post: SocialPostItem) => void;
  onReactPost: (postId: string, rx: SocialReactionType) => void;
  onSavePost: (postId: string, collectionId?: string) => void;
  onEditPost: (post: SocialPostItem) => void;
  onDeletePost: (postId: string) => void;
  onShareRepost: (post: SocialPostItem) => void;
  onShareOSSheet: (post: SocialPostItem) => void;
  onReportTarget: (type: 'post' | 'video' | 'user', id: string) => void;
  onSwitchAccount: () => void;
  onLoggedOut: () => void;
  onOpenGroupFeed?: (groupId: string, groupName: string) => void;
  showToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

const AVATAR_PRESETS = [
  '/src/assets/images/char_sakura_1794880090451.jpg',
  '/src/assets/images/char_yuki_1794880089308.jpg',
  '/src/assets/images/char_akira_1794880089961.jpg',
  '/src/assets/images/char_rin_1794880090553.jpg',
];

const COVER_PRESETS = [
  '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
  '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
  '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
  '/src/assets/images/social_studio_setup_1794918925398.jpg',
];

export function SocialProfileAndHubView({
  currentUser,
  viewingUserId,
  initialSection = 'profile',
  collections,
  onBackToSelf,
  onUserUpdated,
  onOpenChatWithUser,
  onOpenProfile,
  onOpenComments,
  onReactPost,
  onSavePost,
  onEditPost,
  onDeletePost,
  onShareRepost,
  onShareOSSheet,
  onReportTarget,
  onSwitchAccount,
  onLoggedOut,
  onOpenGroupFeed,
  showToast,
}: SocialProfileAndHubViewProps) {
  const isSelf = viewingUserId === currentUser.id;
  const [section, setSection] = useState<HubSection>(isSelf ? initialSection : 'profile');

  useEffect(() => {
    setSection(isSelf ? initialSection : 'profile');
  }, [viewingUserId, isSelf, initialSection]);

  // Profile Data
  const [profileData, setProfileData] = useState<{
    profile: SocialUser;
    stats: { followersCount: number; followingCount: number; friendsCount: number; postsCount: number };
    relation: {
      isFollowing: boolean;
      friendStatus: string;
      friendDirection: string;
      friendshipId: string;
      isRestricted: boolean;
      isMuted: boolean;
    };
    canSeeDetails: boolean;
    posts: SocialPostItem[];
    videos: SocialVideoItem[];
    highlights: SocialHighlightItem[];
  } | null>(null);
  const [profileTab, setProfileTab] = useState<'posts' | 'videos'>('posts');
  const [editOpen, setEditOpen] = useState(false);

  // Edit profile form
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editCover, setEditCover] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editCommentDef, setEditCommentDef] = useState<'everyone' | 'friends' | 'off'>('everyone');
  const [editShowOnline, setEditShowOnline] = useState(true);
  const [edit2FA, setEdit2FA] = useState(false);

  // Friends Hub
  const [friendsData, setFriendsData] = useState<{
    friends: Array<{ friendshipId: string; user: SocialUser }>;
    incoming: Array<{ friendshipId: string; user: SocialUser }>;
    outgoing: Array<{ friendshipId: string; user: SocialUser }>;
    relations: Array<{ target_id: string; relation_type: string; display_name: string; username: string; avatar: string }>;
  } | null>(null);

  // Groups & Pages Hub
  const [groups, setGroups] = useState<SocialGroupItem[]>([]);
  const [pages, setPages] = useState<SocialPageItem[]>([]);
  const [gpTab, setGpTab] = useState<'groups' | 'pages'>('groups');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupPrivacy, setNewGroupPrivacy] = useState<'public' | 'private'>('public');
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [newPageCat, setNewPageCat] = useState('Sáng tạo nội dung');
  const [newPageDesc, setNewPageDesc] = useState('');

  // Saved Collections Hub
  const [localCollections, setLocalCollections] = useState<SocialCollectionItem[]>(collections);
  const [savedPosts, setSavedPosts] = useState<SocialPostItem[]>([]);
  const [newColName, setNewColName] = useState('');
  const [activeColId, setActiveColId] = useState<string>('all');

  // Creator Studio
  const [studioRange, setStudioRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [studioData, setStudioData] = useState<{
    summary: {
      totalViews: number;
      totalEngagements: number;
      followers: number;
      newFollowersInRange: number;
      totalPosts: number;
      totalVideos: number;
    };
    dailySeries: Array<{ day: string; views: number; engagements: number }>;
    topPosts: Array<Record<string, unknown>>;
    topVideos: Array<Record<string, unknown>>;
  } | null>(null);

  // Settings & Sessions
  const [sessions, setSessions] = useState<SocialSessionItem[]>([]);
  const [currPw, setCurrPw] = useState('');
  const [newPw, setNewPw] = useState('');

  // Admin Console
  const [adminData, setAdminData] = useState<{
    reports: Array<Record<string, unknown>>;
    appeals: Array<Record<string, unknown>>;
    users: SocialUser[];
    auditLogs: Array<Record<string, unknown>>;
  } | null>(null);

  const loadProfile = async () => {
    try {
      const res = await socialApi.getProfile(viewingUserId);
      setProfileData(res);
      setEditName(res.profile.display_name);
      setEditBio(res.profile.bio);
      setEditAvatar(res.profile.avatar);
      setEditCover(res.profile.cover_url);
      try {
        const links = JSON.parse(res.profile.links_json || '[]') as string[];
        setEditLink(links[0] || '');
      } catch {
        setEditLink('');
      }
      setEditPrivate(Boolean(res.profile.is_private));
      setEditCommentDef(res.profile.allow_comments_default);
      setEditShowOnline(Boolean(res.profile.show_online_status));
      setEdit2FA(Boolean(res.profile.two_factor_enabled));
    } catch (err) {
      showToast('Hồ sơ', err instanceof Error ? err.message : 'Không thể xem hồ sơ này.', 'error');
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [viewingUserId]);

  useEffect(() => {
    if (section === 'friends') {
      void socialApi.getFriends().then(setFriendsData).catch(() => {});
    } else if (section === 'groups_pages') {
      void Promise.all([socialApi.getGroups(), socialApi.getPages()])
        .then(([g, p]) => {
          setGroups(g.groups);
          setPages(p.pages);
        })
        .catch(() => {});
    } else if (section === 'saved') {
      void Promise.all([socialApi.getCollections(), socialApi.getFeed({ filter: 'saved', limit: 30 })])
        .then(([c, f]) => {
          setLocalCollections(c.collections);
          setSavedPosts(f.posts);
        })
        .catch(() => {});
    } else if (section === 'studio') {
      void socialApi.getCreatorAnalytics(studioRange).then(setStudioData).catch(() => {});
    } else if (section === 'settings') {
      void socialApi.getSessions().then((r) => setSessions(r.sessions)).catch(() => {});
    } else if (section === 'admin') {
      void socialApi.getAdminOverview().then(setAdminData).catch(() => {});
    }
  }, [section, studioRange]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await socialApi.updateProfile({
        display_name: editName.trim(),
        bio: editBio.trim(),
        avatar: editAvatar,
        cover_url: editCover,
        links_json: editLink.trim() ? [editLink.trim()] : [],
        is_private: editPrivate ? 1 : 0,
        allow_comments_default: editCommentDef,
        show_online_status: editShowOnline ? 1 : 0,
        two_factor_enabled: edit2FA ? 1 : 0,
      });
      onUserUpdated(res.user);
      setEditOpen(false);
      await loadProfile();
      showToast('Hồ sơ', 'Đã lưu thay đổi hồ sơ.', 'success');
    } catch (err) {
      showToast('Hồ sơ', err instanceof Error ? err.message : 'Lỗi cập nhật hồ sơ', 'error');
    }
  };

  const handleExportJson = async () => {
    try {
      const payload = await socialApi.exportAccount();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibesphere_${currentUser.username}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Xuất dữ liệu', 'Đã tải xuống bản sao lưu dữ liệu JSON cá nhân.', 'success');
    } catch (err) {
      showToast('Xuất dữ liệu', err instanceof Error ? err.message : 'Lỗi xuất dữ liệu', 'error');
    }
  };

  const canModerate = currentUser.role === 'admin' || currentUser.role === 'moderator';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-50 dark:bg-[#0D0F14]">
      {/* Sub-navigation bar when viewing self */}
      {isSelf ? (
        <div className="bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              { id: 'profile', label: 'Hồ sơ' },
              { id: 'friends', label: 'Bạn bè' },
              { id: 'groups_pages', label: 'Nhóm & Trang' },
              { id: 'saved', label: 'Đã lưu' },
              { id: 'studio', label: 'Studio' },
              { id: 'settings', label: 'Cài đặt' },
              ...(canModerate ? [{ id: 'admin' as const, label: 'Kiểm duyệt' }] : []),
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                section === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 flex items-center gap-2 shrink-0">
          <button
            onClick={onBackToSelf}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {profileData?.profile.display_name || 'Trang cá nhân'}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* SECTION: PROFILE */}
        {section === 'profile' && profileData && (
          <div className="pb-6">
            {/* Cover + Avatar */}
            <div className="relative">
              <img
                src={profileData.profile.cover_url || COVER_PRESETS[0]}
                alt="Ảnh bìa"
                className="w-full h-36 object-cover bg-zinc-200 dark:bg-zinc-800"
              />
              <div className="px-4 pb-3 bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-end justify-between -mt-10 mb-2">
                  <div className="p-1 rounded-full bg-white dark:bg-[#14161D]">
                    <UserAvatar
                      src={profileData.profile.avatar}
                      name={profileData.profile.display_name}
                      online={profileData.profile.is_online}
                      size="xl"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 pb-1">
                    {isSelf ? (
                      <button
                        onClick={() => setEditOpen(true)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Chỉnh sửa
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            await socialApi.toggleFollow(profileData.profile.id);
                            void loadProfile();
                          }}
                          className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold ${
                            profileData.relation.isFollowing
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {profileData.relation.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                        </button>
                        <button
                          onClick={async () => {
                            if (profileData.relation.friendStatus === 'none') {
                              await socialApi.sendFriendRequest(profileData.profile.id);
                              showToast('Bạn bè', 'Đã gửi lời mời kết bạn.');
                            } else if (profileData.relation.friendStatus === 'pending' && profileData.relation.friendDirection === 'incoming') {
                              await socialApi.respondFriendRequest(profileData.relation.friendshipId, 'accept');
                              showToast('Bạn bè', 'Đã chấp nhận lời mời kết bạn.', 'success');
                            } else if (profileData.relation.friendStatus === 'pending') {
                              await socialApi.respondFriendRequest(profileData.relation.friendshipId, 'cancel');
                            } else if (profileData.relation.friendStatus === 'accepted') {
                              await socialApi.respondFriendRequest(profileData.relation.friendshipId, 'unfriend');
                            }
                            void loadProfile();
                          }}
                          className="min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-semibold"
                        >
                          {profileData.relation.friendStatus === 'accepted'
                            ? 'Bạn bè'
                            : profileData.relation.friendStatus === 'pending'
                              ? profileData.relation.friendDirection === 'incoming'
                                ? 'Chấp nhận'
                                : 'Đã gửi lời mời'
                              : 'Kết bạn'}
                        </button>
                        <button
                          onClick={() => onOpenChatWithUser(profileData.profile.id)}
                          className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"
                          title="Nhắn tin"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{profileData.profile.display_name}</h2>
                    <VerifiedBadge verified={profileData.profile.is_verified} />
                    {Boolean(profileData.profile.is_private) && <Lock className="w-3.5 h-3.5 text-zinc-400" />}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    @{profileData.profile.username} ·{' '}
                    {profileData.profile.account_type === 'creator'
                      ? 'Nhà sáng tạo'
                      : profileData.profile.account_type === 'business'
                        ? 'Doanh nghiệp'
                        : 'Cá nhân'}
                  </p>
                  {profileData.profile.bio && (
                    <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed pt-1">{profileData.profile.bio}</p>
                  )}
                </div>

                {/* Stats inline zero-pill */}
                <div className="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-center">
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{profileData.stats.postsCount}</p>
                    <p className="text-[11px] text-zinc-500">Bài viết</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{profileData.stats.friendsCount}</p>
                    <p className="text-[11px] text-zinc-500">Bạn bè</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatCompactCount(profileData.stats.followersCount)}</p>
                    <p className="text-[11px] text-zinc-500">Người theo dõi</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatCompactCount(profileData.stats.followingCount)}</p>
                    <p className="text-[11px] text-zinc-500">Đang theo dõi</p>
                  </div>
                </div>

                {/* Safety controls for non-self */}
                {!isSelf && (
                  <div className="flex items-center gap-2 pt-3 text-[11px]">
                    <button
                      onClick={async () => {
                        await socialApi.setRelation(profileData.profile.id, 'mute', !profileData.relation.isMuted);
                        showToast('Thông báo', profileData.relation.isMuted ? 'Đã bật lại bảng tin người này.' : 'Đã ẩn bài viết của người này.');
                        void loadProfile();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    >
                      {profileData.relation.isMuted ? 'Bỏ ẩn' : 'Ẩn bảng tin'}
                    </button>
                    <button
                      onClick={async () => {
                        await socialApi.setRelation(profileData.profile.id, 'restrict', !profileData.relation.isRestricted);
                        showToast('Hạn chế', profileData.relation.isRestricted ? 'Đã gỡ hạn chế.' : 'Đã hạn chế bình luận người này.');
                        void loadProfile();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    >
                      {profileData.relation.isRestricted ? 'Bỏ hạn chế' : 'Hạn chế'}
                    </button>
                    <button
                      onClick={async () => {
                        await socialApi.setRelation(profileData.profile.id, 'block', true);
                        showToast('Chặn', `Đã chặn ${profileData.profile.display_name}.`);
                        onBackToSelf();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    >
                      Chặn
                    </button>
                    <button
                      onClick={() => onReportTarget('user', profileData.profile.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    >
                      Báo cáo
                    </button>
                  </div>
                )}

                {/* Highlights strip */}
                {profileData.highlights.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pt-3">
                    {profileData.highlights.map((hl) => (
                      <div key={hl.id} className="flex flex-col items-center gap-1 shrink-0 w-16">
                        <img
                          src={hl.cover_url || COVER_PRESETS[0]}
                          alt={hl.title}
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500/50"
                        />
                        <span className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate w-full text-center">{hl.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!profileData.canSeeDetails ? (
              <div className="p-8 text-center space-y-2">
                <Lock className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Đây là tài khoản riêng tư</p>
                <p className="text-xs text-zinc-500">Hãy theo dõi hoặc kết bạn để xem bài viết và video của người này.</p>
              </div>
            ) : (
              <>
                <div className="flex bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => setProfileTab('posts')}
                    className={`flex-1 min-h-[44px] text-xs font-semibold border-b-2 ${
                      profileTab === 'posts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-500'
                    }`}
                  >
                    Bài viết ({profileData.posts.length})
                  </button>
                  <button
                    onClick={() => setProfileTab('videos')}
                    className={`flex-1 min-h-[44px] text-xs font-semibold border-b-2 ${
                      profileTab === 'videos' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-500'
                    }`}
                  >
                    Video ({profileData.videos.length})
                  </button>
                </div>

                {profileTab === 'posts' ? (
                  <div className="p-3 space-y-3">
                    {profileData.posts.length === 0 ? (
                      <SocialEmptyState title="Chưa có bài viết" description="Các bài viết đã đăng sẽ hiển thị tại đây." />
                    ) : (
                      profileData.posts.map((p) => (
                        <SocialPostCard
                          key={p.id}
                          post={p}
                          currentUserId={currentUser.id}
                          collections={collections}
                          onOpenProfile={onOpenProfile}
                          onOpenComments={onOpenComments}
                          onReact={onReactPost}
                          onSave={onSavePost}
                          onShareRepost={onShareRepost}
                          onShareToChat={() => onOpenChatWithUser(p.author_id)}
                          onShareOSSheet={onShareOSSheet}
                          onEdit={onEditPost}
                          onDelete={onDeletePost}
                          onPin={async (post) => {
                            await socialApi.updatePost(post.id, { is_pinned: !post.is_pinned });
                            void loadProfile();
                          }}
                          onHide={async (pid) => {
                            await socialApi.hidePost(pid);
                            void loadProfile();
                          }}
                          onReport={(pid) => onReportTarget('post', pid)}
                          onBlockAuthor={async (aid) => {
                            await socialApi.setRelation(aid, 'block', true);
                            onBackToSelf();
                          }}
                          onHashtagClick={() => {}}
                          onCopyLink={() => showToast('Liên kết', 'Đã sao chép liên kết bài viết.')}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="p-3 grid grid-cols-2 gap-2.5">
                    {profileData.videos.map((v) => (
                      <div key={v.id} className="rounded-2xl overflow-hidden bg-zinc-900 aspect-[9/16] relative">
                        <img src={v.cover_url} alt={v.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white">
                          <p className="text-xs font-semibold line-clamp-1">{v.title}</p>
                          <p className="text-[10px] text-zinc-300">{formatCompactCount(v.views_count)} lượt xem</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SECTION: FRIENDS & RELATIONS */}
        {section === 'friends' && friendsData && (
          <div className="p-3 space-y-4">
            {friendsData.incoming.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Lời mời kết bạn ({friendsData.incoming.length})</h3>
                {friendsData.incoming.map((item) => (
                  <div key={item.friendshipId} className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <UserAvatar src={item.user.avatar} name={item.user.display_name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.user.display_name}</p>
                      <p className="text-[11px] text-zinc-500">@{item.user.username}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await socialApi.respondFriendRequest(item.friendshipId, 'accept');
                        void socialApi.getFriends().then(setFriendsData);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                    >
                      Chấp nhận
                    </button>
                    <button
                      onClick={async () => {
                        await socialApi.respondFriendRequest(item.friendshipId, 'decline');
                        void socialApi.getFriends().then(setFriendsData);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold"
                    >
                      Từ chối
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Bạn bè ({friendsData.friends.length})</h3>
              {friendsData.friends.length === 0 ? (
                <SocialEmptyState title="Chưa có bạn bè" description="Tìm kiếm và kết bạn với mọi người ở mục Khám phá." />
              ) : (
                friendsData.friends.map((item) => (
                  <div key={item.friendshipId} className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <button onClick={() => onOpenProfile(item.user.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <UserAvatar src={item.user.avatar} name={item.user.display_name} online={item.user.is_online} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{item.user.display_name}</p>
                        <p className="text-[11px] text-zinc-500 truncate">@{item.user.username}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => onOpenChatWithUser(item.user.id)}
                      className="min-h-[38px] px-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold"
                    >
                      Nhắn tin
                    </button>
                    <button
                      onClick={async () => {
                        await socialApi.respondFriendRequest(item.friendshipId, 'unfriend');
                        void socialApi.getFriends().then(setFriendsData);
                      }}
                      className="min-h-[38px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs"
                    >
                      Hủy bạn
                    </button>
                  </div>
                ))
              )}
            </div>

            {friendsData.relations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Danh sách đã chặn / hạn chế / tắt thông báo</h3>
                {friendsData.relations.map((r) => (
                  <div key={`${r.target_id}_${r.relation_type}`} className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <UserAvatar src={r.avatar} name={r.display_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.display_name}</p>
                      <p className="text-[11px] text-zinc-500">
                        {r.relation_type === 'block' ? 'Đã chặn' : r.relation_type === 'restrict' ? 'Đang hạn chế' : 'Đang ẩn bảng tin'}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await socialApi.setRelation(r.target_id, r.relation_type as 'block' | 'restrict' | 'mute', false);
                        void socialApi.getFriends().then(setFriendsData);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
                    >
                      Gỡ bỏ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION: GROUPS & FANPAGES */}
        {section === 'groups_pages' && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setGpTab('groups')}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold ${
                    gpTab === 'groups' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#14161D] text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  Nhóm ({groups.length})
                </button>
                <button
                  onClick={() => setGpTab('pages')}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold ${
                    gpTab === 'pages' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#14161D] text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  Trang ({pages.length})
                </button>
              </div>
              <button
                onClick={() => (gpTab === 'groups' ? setNewGroupOpen(true) : setNewPageOpen(true))}
                className="min-h-[40px] px-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> {gpTab === 'groups' ? 'Tạo nhóm' : 'Tạo trang'}
              </button>
            </div>

            {gpTab === 'groups' ? (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <img src={g.cover_url} alt={g.name} className="w-full h-24 object-cover" />
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{g.name}</h4>
                          <p className="text-[11px] text-zinc-500">
                            {g.privacy === 'public' ? 'Nhóm công khai' : 'Nhóm riêng tư'} · {g.members_count} thành viên
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          {g.my_status === 'approved' && onOpenGroupFeed && (
                            <button
                              onClick={() => onOpenGroupFeed(g.id, g.name)}
                              className="min-h-[38px] px-3 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-semibold"
                            >
                              Xem bài
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                await socialApi.toggleJoinGroup(g.id);
                                const r = await socialApi.getGroups();
                                setGroups(r.groups);
                              } catch (err) {
                                showToast('Nhóm', err instanceof Error ? err.message : 'Thao tác thất bại', 'error');
                              }
                            }}
                            className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold ${
                              g.my_status === 'approved'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                : g.my_status === 'pending'
                                  ? 'bg-amber-500/15 text-amber-600'
                                  : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {g.my_status === 'approved' ? 'Đã tham gia' : g.my_status === 'pending' ? 'Chờ duyệt' : 'Tham gia'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{g.description}</p>

                      {g.pending_requests.length > 0 && (
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                          <p className="text-[11px] font-bold text-amber-600">Yêu cầu chờ duyệt ({g.pending_requests.length})</p>
                          {g.pending_requests.map((pr) => (
                            <div key={pr.user_id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-zinc-800 dark:text-zinc-200">{pr.display_name}</span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={async () => {
                                    await socialApi.moderateGroupMember(g.id, pr.user_id, { action: 'approve' });
                                    const r = await socialApi.getGroups();
                                    setGroups(r.groups);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px]"
                                >
                                  Duyệt
                                </button>
                                <button
                                  onClick={async () => {
                                    await socialApi.moderateGroupMember(g.id, pr.user_id, { action: 'reject' });
                                    const r = await socialApi.getGroups();
                                    setGroups(r.groups);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-[11px]"
                                >
                                  Từ chối
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {pages.map((pg) => (
                  <div key={pg.id} className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                    <UserAvatar src={pg.avatar} name={pg.name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1">
                        {pg.name} <VerifiedBadge verified={pg.is_verified} />
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {pg.category} · {formatCompactCount(pg.followers_count)} người theo dõi
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">{pg.description}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await socialApi.toggleFollowPage(pg.id);
                        const r = await socialApi.getPages();
                        setPages(r.pages);
                      }}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold shrink-0 ${
                        pg.is_following ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {pg.is_following ? 'Đang theo dõi' : 'Theo dõi'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION: SAVED COLLECTIONS */}
        {section === 'saved' && (
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Tên bộ sưu tập mới..."
                className="flex-1 px-3 min-h-[44px] rounded-xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
              />
              <button
                onClick={async () => {
                  if (!newColName.trim()) return;
                  await socialApi.createCollection(newColName.trim());
                  setNewColName('');
                  const c = await socialApi.getCollections();
                  setLocalCollections(c.collections);
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1"
              >
                <FolderPlus className="w-4 h-4" /> Tạo
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveColId('all')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                  activeColId === 'all' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#14161D] text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Tất cả ({savedPosts.length})
              </button>
              {localCollections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveColId(c.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    activeColId === c.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#14161D] text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {savedPosts
                .filter((p) => (activeColId === 'all' ? true : p.saved_collection_id === activeColId))
                .map((p) => (
                  <SocialPostCard
                    key={p.id}
                    post={p}
                    currentUserId={currentUser.id}
                    collections={localCollections}
                    onOpenProfile={onOpenProfile}
                    onOpenComments={onOpenComments}
                    onReact={onReactPost}
                    onSave={async (pid, cid) => {
                      await onSavePost(pid, cid);
                      const f = await socialApi.getFeed({ filter: 'saved', limit: 30 });
                      setSavedPosts(f.posts);
                    }}
                    onShareRepost={onShareRepost}
                    onShareToChat={() => onOpenChatWithUser(p.author_id)}
                    onShareOSSheet={onShareOSSheet}
                    onEdit={onEditPost}
                    onDelete={onDeletePost}
                    onPin={() => {}}
                    onHide={() => {}}
                    onReport={(pid) => onReportTarget('post', pid)}
                    onBlockAuthor={() => {}}
                    onHashtagClick={() => {}}
                    onCopyLink={() => showToast('Liên kết', 'Đã sao chép liên kết.')}
                  />
                ))}
            </div>
          </div>
        )}

        {/* SECTION: CREATOR STUDIO */}
        {section === 'studio' && studioData && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Creator Studio
                </h3>
                <p className="text-[11px] text-zinc-500">Số liệu tổng hợp trực tiếp từ cơ sở dữ liệu bài viết & video</p>
              </div>
              <div className="flex gap-1">
                {(['7d', '30d', '90d'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setStudioRange(r)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                      studioRange === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#14161D] text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {r === '7d' ? '7 ngày' : r === '30d' ? '30 ngày' : '90 ngày'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Tổng lượt xem</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatCompactCount(studioData.summary.totalViews)}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Tổng tương tác</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCompactCount(studioData.summary.totalEngagements)}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Người theo dõi</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {studioData.summary.followers}{' '}
                  <span className="text-[11px] text-emerald-500">(+{studioData.summary.newFollowersInRange})</span>
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Nội dung đã xuất bản</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {studioData.summary.totalPosts} bài · {studioData.summary.totalVideos} video
                </p>
              </div>
            </div>

            {/* Real Daily Bar Chart */}
            <div className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 space-y-2">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Tương tác theo ngày</h4>
              {studioData.dailySeries.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">Chưa có dữ liệu trong khoảng thời gian này.</p>
              ) : (
                <div className="space-y-2">
                  {studioData.dailySeries.map((d) => {
                    const maxV = Math.max(1, ...studioData.dailySeries.map((x) => x.views + x.engagements));
                    const pct = Math.max(8, Math.round(((d.views + d.engagements) / maxV) * 100));
                    return (
                      <div key={d.day} className="space-y-1">
                        <div className="flex justify-between text-[11px] text-zinc-500">
                          <span>{d.day}</span>
                          <span>
                            {d.views} lượt xem · {d.engagements} tương tác
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION: SETTINGS & SECURITY */}
        {section === 'settings' && (
          <div className="p-3 space-y-3 pb-8">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-500" /> Đổi mật khẩu
              </h4>
              <input
                type="password"
                value={currPw}
                onChange={(e) => setCurrPw(e.target.value)}
                placeholder="Mật khẩu hiện tại (hoặc trống nếu mới tạo từ Phone OS)"
                className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
              />
              <button
                onClick={async () => {
                  try {
                    await socialApi.changePassword(currPw, newPw);
                    setCurrPw('');
                    setNewPw('');
                    showToast('Bảo mật', 'Đã cập nhật mật khẩu thành công.', 'success');
                  } catch (err) {
                    showToast('Bảo mật', err instanceof Error ? err.message : 'Đổi mật khẩu thất bại', 'error');
                  }
                }}
                className="w-full min-h-[42px] rounded-xl bg-indigo-600 text-white text-xs font-semibold"
              >
                Cập nhật mật khẩu
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-indigo-500" /> Thiết bị & Phiên đăng nhập ({sessions.length})
                </h4>
                <button
                  onClick={async () => {
                    await socialApi.revokeOtherSessions();
                    const r = await socialApi.getSessions();
                    setSessions(r.sessions);
                    showToast('Phiên đăng nhập', 'Đã đăng xuất khỏi các thiết bị khác.');
                  }}
                  className="text-[11px] font-semibold text-rose-500"
                >
                  Đăng xuất thiết bị khác
                </button>
              </div>
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {s.device_name} {s.is_current ? '· Phiên hiện tại' : ''}
                    </p>
                    <p className="text-[11px] text-zinc-500">Hoạt động: {formatRelativeVi(s.last_active_at)}</p>
                  </div>
                  {!s.is_current && (
                    <button
                      onClick={async () => {
                        await socialApi.revokeSession(s.id);
                        const r = await socialApi.getSessions();
                        setSessions(r.sessions);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-rose-500"
                    >
                      Thu hồi
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 space-y-2">
              <button
                onClick={() => void handleExportJson()}
                className="w-full min-h-[44px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Xuất dữ liệu cá nhân (JSON)
              </button>
              <button
                onClick={onSwitchAccount}
                className="w-full min-h-[44px] px-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold"
              >
                Chuyển / Đăng nhập tài khoản khác
              </button>
              <button
                onClick={async () => {
                  await socialApi.logout().catch(() => {});
                  setStoredSocialToken('');
                  onLoggedOut();
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Đăng xuất khỏi phiên này
              </button>
            </div>
          </div>
        )}

        {/* SECTION: ADMIN / MODERATOR CONSOLE */}
        {section === 'admin' && canModerate && adminData && (
          <div className="p-3 space-y-4 pb-8">
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-rose-500" /> Hàng đợi báo cáo vi phạm ({adminData.reports.length})
              </h3>
              {adminData.reports.map((rep) => (
                <div key={String(rep.id)} className="p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {String(rep.target_type).toUpperCase()} · {String(rep.reason)}
                    </span>
                    <span className="text-[11px] text-zinc-500">{String(rep.status)}</span>
                  </div>
                  {rep.detail ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{String(rep.detail)}</p> : null}
                  {rep.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await socialApi.moderateReport(String(rep.id), 'dismiss', 'Không vi phạm');
                          setAdminData(await socialApi.getAdminOverview());
                        }}
                        className="flex-1 min-h-[38px] rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold"
                      >
                        Bỏ qua
                      </button>
                      <button
                        onClick={async () => {
                          await socialApi.moderateReport(String(rep.id), 'remove_content', 'Vi phạm tiêu chuẩn cộng đồng');
                          setAdminData(await socialApi.getAdminOverview());
                        }}
                        className="flex-1 min-h-[38px] rounded-xl bg-rose-600 text-white text-xs font-semibold"
                      >
                        Gỡ nội dung
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {currentUser.role === 'admin' && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Quản lý xác minh & tài khoản</h3>
                {adminData.users.map((u) => (
                  <div key={u.id} className="p-2.5 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5">
                    <UserAvatar src={u.avatar} name={u.display_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {u.display_name} <VerifiedBadge verified={u.is_verified} />
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        @{u.username} · {u.role} · {u.status}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await socialApi.toggleVerifyUser(u.id, !u.is_verified);
                        setAdminData(await socialApi.getAdminOverview());
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 text-[11px] font-semibold"
                    >
                      {u.is_verified ? 'Gỡ tích xanh' : 'Cấp tích xanh'}
                    </button>
                    {u.role !== 'admin' && (
                      <button
                        onClick={async () => {
                          await socialApi.setUserStatus(u.id, u.status === 'banned' ? 'active' : 'banned');
                          setAdminData(await socialApi.getAdminOverview());
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 text-[11px] font-semibold"
                      >
                        {u.status === 'banned' ? 'Mở khóa' : 'Khóa'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Nhật ký kiểm duyệt gần nhất</h3>
              {adminData.auditLogs.slice(0, 12).map((l) => (
                <div key={String(l.id)} className="px-3 py-2 rounded-xl bg-white dark:bg-[#14161D] border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-200">{String(l.actor_name || l.actor_id)}</span> ·{' '}
                  {String(l.action)} ({String(l.target_type)}) · {formatRelativeVi(String(l.created_at))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 max-h-[90dvh] flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Chỉnh sửa hồ sơ & quyền riêng tư</h3>
              <button onClick={() => setEditOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="p-4 space-y-3 overflow-y-auto">
              <div>
                <label className="text-[11px] font-semibold text-zinc-500">Tên hiển thị</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full mt-1 px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-500">Tiểu sử</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={2}
                  className="w-full mt-1 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-500">Ảnh đại diện</label>
                <div className="flex gap-2 mt-1">
                  {AVATAR_PRESETS.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setEditAvatar(av)}
                      className={`rounded-full p-0.5 ${editAvatar === av ? 'ring-2 ring-indigo-600' : ''}`}
                    >
                      <img src={av} alt="" className="w-11 h-11 rounded-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-500">Ảnh bìa</label>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {COVER_PRESETS.map((cv) => (
                    <button
                      type="button"
                      key={cv}
                      onClick={() => setEditCover(cv)}
                      className={`rounded-lg overflow-hidden h-10 ${editCover === cv ? 'ring-2 ring-indigo-600' : ''}`}
                    >
                      <img src={cv} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between min-h-[42px] text-xs text-zinc-800 dark:text-zinc-200">
                <span>Tài khoản riêng tư (chỉ bạn bè/người theo dõi xem được)</span>
                <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              </label>
              <label className="flex items-center justify-between min-h-[42px] text-xs text-zinc-800 dark:text-zinc-200">
                <span>Hiển thị trạng thái đang hoạt động</span>
                <input type="checkbox" checked={editShowOnline} onChange={(e) => setEditShowOnline(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              </label>
              <button type="submit" className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-semibold">
                Lưu thay đổi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {newGroupOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tạo cộng đồng mới</h3>
              <button onClick={() => setNewGroupOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Tên nhóm..."
              className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            />
            <textarea
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="Mô tả nội quy và chủ đề nhóm..."
              rows={2}
              className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none resize-none"
            />
            <select
              value={newGroupPrivacy}
              onChange={(e) => setNewGroupPrivacy(e.target.value as 'public' | 'private')}
              className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value="public">Nhóm công khai</option>
              <option value="private">Nhóm riêng tư (cần duyệt)</option>
            </select>
            <button
              onClick={async () => {
                if (!newGroupName.trim()) return;
                await socialApi.createGroup({ name: newGroupName.trim(), description: newGroupDesc, privacy: newGroupPrivacy });
                setNewGroupOpen(false);
                setNewGroupName('');
                setNewGroupDesc('');
                const r = await socialApi.getGroups();
                setGroups(r.groups);
              }}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-semibold"
            >
              Tạo nhóm
            </button>
          </div>
        </div>
      )}

      {/* Create Page Modal */}
      {newPageOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tạo Fanpage mới</h3>
              <button onClick={() => setNewPageOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              placeholder="Tên Trang..."
              className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            />
            <input
              value={newPageCat}
              onChange={(e) => setNewPageCat(e.target.value)}
              placeholder="Danh mục (vd: Âm nhạc, Công nghệ)"
              className="w-full px-3 min-h-[42px] rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
            />
            <textarea
              value={newPageDesc}
              onChange={(e) => setNewPageDesc(e.target.value)}
              placeholder="Giới thiệu Trang..."
              rows={2}
              className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none resize-none"
            />
            <button
              onClick={async () => {
                if (!newPageName.trim()) return;
                await socialApi.createPage({ name: newPageName.trim(), category: newPageCat, description: newPageDesc });
                setNewPageOpen(false);
                setNewPageName('');
                setNewPageDesc('');
                const r = await socialApi.getPages();
                setPages(r.pages);
              }}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-semibold"
            >
              Tạo Trang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
