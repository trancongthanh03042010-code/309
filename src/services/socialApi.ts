import type {
  SocialChatMsg,
  SocialChatRoom,
  SocialCollectionItem,
  SocialCommentItem,
  SocialGroupItem,
  SocialHighlightItem,
  SocialLivestreamItem,
  SocialNotificationItem,
  SocialPageItem,
  SocialPostItem,
  SocialReactionType,
  SocialSessionItem,
  SocialStoryItem,
  SocialUser,
  SocialVideoItem,
} from '../types/social';

const TOKEN_STORAGE_KEY = 'vibesphere_social_token_v1';

export function getStoredSocialToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredSocialToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage limits
  }
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredSocialToken();
  const res = await fetch(`/api/social-v2${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Lỗi máy chủ (${res.status})`);
  }
  return data as T;
}

export const socialApi = {
  // Auth & Account
  osBootstrap: () => req<{ token: string; user: SocialUser }>('/auth/os-bootstrap', { method: 'POST' }),
  register: (payload: { username: string; email: string; password: string; display_name: string; account_type?: string }) =>
    req<{ token: string; user: SocialUser }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { identifier: string; password: string; device_name?: string }) =>
    req<{ token: string; user: SocialUser }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => req<{ user: SocialUser }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  forgotPassword: (email: string) =>
    req<{ ok: boolean; localSimulatedOtp: string; note: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),
  getSessions: () => req<{ sessions: SocialSessionItem[] }>('/auth/sessions'),
  revokeSession: (id: string) => req<{ ok: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => req<{ ok: boolean }>('/auth/sessions/revoke-others', { method: 'POST' }),
  deactivateAccount: () => req<{ ok: boolean }>('/account/deactivate', { method: 'POST' }),
  deleteAccount: () => req<{ ok: boolean }>('/account', { method: 'DELETE' }),
  exportAccount: () => req<Record<string, unknown>>('/account/export'),

  // Feed & Posts
  getFeed: (params: {
    filter?: string;
    hashtag?: string;
    groupId?: string;
    pageId?: string;
    authorId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.filter) qs.set('filter', params.filter);
    if (params.hashtag) qs.set('hashtag', params.hashtag);
    if (params.groupId) qs.set('groupId', params.groupId);
    if (params.pageId) qs.set('pageId', params.pageId);
    if (params.authorId) qs.set('authorId', params.authorId);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    return req<{ posts: SocialPostItem[]; total: number; hasMore: boolean }>(`/feed?${qs.toString()}`);
  },
  getPostDetail: (id: string) => req<{ post: SocialPostItem; comments: SocialCommentItem[] }>(`/posts/${id}`),
  createPost: (payload: Record<string, unknown>) =>
    req<{ post: SocialPostItem }>('/posts', { method: 'POST', body: JSON.stringify(payload) }),
  updatePost: (id: string, patch: Record<string, unknown>) =>
    req<{ post: SocialPostItem }>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  reactPost: (id: string, reaction_type: SocialReactionType) =>
    req<{ post: SocialPostItem }>(`/posts/${id}/react`, { method: 'POST', body: JSON.stringify({ reaction_type }) }),
  hidePost: (id: string) => req<{ ok: boolean }>(`/posts/${id}/hide`, { method: 'POST' }),
  saveItem: (id: string, target_type: 'post' | 'video' = 'post', collection_id = '') =>
    req<{ saved: boolean; collection_id?: string }>(`/posts/${id}/save`, {
      method: 'POST',
      body: JSON.stringify({ target_type, collection_id }),
    }),

  // Comments
  getPostComments: (postId: string) => req<{ comments: SocialCommentItem[] }>(`/posts/${postId}/comments`),
  getVideoComments: (videoId: string) => req<{ comments: SocialCommentItem[] }>(`/videos/${videoId}/comments`),
  addComment: (payload: { post_id?: string; video_id?: string; parent_id?: string; content: string; media_url?: string }) =>
    req<{ comment: SocialCommentItem }>('/comments', { method: 'POST', body: JSON.stringify(payload) }),
  updateComment: (id: string, patch: Record<string, unknown>) =>
    req<{ comment: SocialCommentItem }>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteComment: (id: string) => req<{ ok: boolean }>(`/comments/${id}`, { method: 'DELETE' }),

  // Collections
  getCollections: () => req<{ collections: SocialCollectionItem[]; savedItems: Array<{ id: string; target_id: string; target_type: string; collection_id: string }> }>('/collections'),
  createCollection: (name: string) =>
    req<{ collection: SocialCollectionItem }>('/collections', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCollection: (id: string) => req<{ ok: boolean }>(`/collections/${id}`, { method: 'DELETE' }),

  // Stories & Highlights
  getStories: (archived = false) =>
    req<{ stories: SocialStoryItem[]; archive: SocialStoryItem[]; highlights: SocialHighlightItem[] }>(
      `/stories${archived ? '?archived=1' : ''}`
    ),
  createStory: (payload: Record<string, unknown>) =>
    req<{ story: SocialStoryItem }>('/stories', { method: 'POST', body: JSON.stringify(payload) }),
  viewStory: (id: string, reaction = '') =>
    req<{ ok: boolean }>(`/stories/${id}/view`, { method: 'POST', body: JSON.stringify({ reaction }) }),
  createHighlight: (payload: { title: string; cover_url?: string; story_id?: string }) =>
    req<{ highlight: SocialHighlightItem }>('/highlights', { method: 'POST', body: JSON.stringify(payload) }),

  // Videos / Reels
  getVideos: () => req<{ videos: SocialVideoItem[] }>('/videos'),
  createVideo: (payload: Record<string, unknown>) =>
    req<{ video: SocialVideoItem }>('/videos', { method: 'POST', body: JSON.stringify(payload) }),
  logVideoWatch: (id: string, payload: { watch_ms: number; completed: boolean; skipped: boolean }) =>
    req<{ ok: boolean }>(`/videos/${id}/watch`, { method: 'POST', body: JSON.stringify(payload) }),
  reactVideo: (id: string) => req<{ liked: boolean; likes_count: number }>(`/videos/${id}/react`, { method: 'POST' }),

  // Explore & Search
  getExplore: () =>
    req<{
      trendingPosts: SocialPostItem[];
      trendingVideos: SocialVideoItem[];
      trendingHashtags: Array<{ tag: string; count: number }>;
      suggestedUsers: SocialUser[];
    }>('/explore'),
  search: (q: string, category = 'all', save = false) =>
    req<{
      users: SocialUser[];
      posts: SocialPostItem[];
      videos: SocialVideoItem[];
      groups: SocialGroupItem[];
      pages: SocialPageItem[];
      history?: Array<{ id: string; query: string; category: string; created_at: string }>;
    }>(`/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}${save ? '&save=1' : ''}`),
  clearSearchHistory: (id = 'all') => req<{ ok: boolean }>(`/search/history/${id}`, { method: 'DELETE' }),

  // Profiles, Friends & Relations
  getProfile: (idOrUsername: string) =>
    req<{
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
    }>(`/profiles/${encodeURIComponent(idOrUsername)}`),
  updateProfile: (patch: Record<string, unknown>) =>
    req<{ user: SocialUser }>('/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
  toggleFollow: (userId: string) => req<{ following: boolean }>(`/follow/${userId}`, { method: 'POST' }),
  getFriends: () =>
    req<{
      friends: Array<{ friendshipId: string; user: SocialUser; updated_at: string }>;
      incoming: Array<{ friendshipId: string; user: SocialUser; updated_at: string }>;
      outgoing: Array<{ friendshipId: string; user: SocialUser; updated_at: string }>;
      relations: Array<{ target_id: string; relation_type: string; display_name: string; username: string; avatar: string }>;
    }>('/friends'),
  sendFriendRequest: (userId: string) =>
    req<{ id: string; status: string }>('/friends/request', { method: 'POST', body: JSON.stringify({ userId }) }),
  respondFriendRequest: (friendshipId: string, action: 'accept' | 'decline' | 'cancel' | 'unfriend') =>
    req<{ status: string }>('/friends/respond', { method: 'POST', body: JSON.stringify({ friendshipId, action }) }),
  setRelation: (targetId: string, relationType: 'block' | 'restrict' | 'mute', active = true) =>
    req<{ active: boolean }>('/relations', { method: 'POST', body: JSON.stringify({ targetId, relationType, active }) }),

  // Groups & Pages
  getGroups: () => req<{ groups: SocialGroupItem[] }>('/groups'),
  createGroup: (payload: Record<string, unknown>) =>
    req<{ group: SocialGroupItem }>('/groups', { method: 'POST', body: JSON.stringify(payload) }),
  toggleJoinGroup: (id: string) => req<{ status: string }>(`/groups/${id}/join`, { method: 'POST' }),
  moderateGroupMember: (groupId: string, userId: string, body: { action?: 'approve' | 'reject'; role?: 'member' | 'moderator' }) =>
    req<{ ok: boolean }>(`/groups/${groupId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getPages: () => req<{ pages: SocialPageItem[] }>('/pages'),
  createPage: (payload: Record<string, unknown>) =>
    req<{ page: SocialPageItem }>('/pages', { method: 'POST', body: JSON.stringify(payload) }),
  toggleFollowPage: (id: string) => req<{ following: boolean }>(`/pages/${id}/follow`, { method: 'POST' }),

  // Real-time Messaging
  getChats: () => req<{ chats: SocialChatRoom[] }>('/chats'),
  createChat: (memberIds: string[], is_group = false, title = '') =>
    req<{ chatId: string }>('/chats', { method: 'POST', body: JSON.stringify({ memberIds, is_group, title }) }),
  getChatMessages: (chatId: string) => req<{ messages: SocialChatMsg[] }>(`/chats/${chatId}/messages`),
  sendChatMessage: (chatId: string, payload: { content: string; msg_type?: string; attachment?: Record<string, string>; reply_to_id?: string }) =>
    req<{ message: SocialChatMsg }>(`/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(payload) }),
  markChatRead: (chatId: string) => req<{ ok: boolean }>(`/chats/${chatId}/read`, { method: 'POST' }),
  updateChatSettings: (chatId: string, patch: { pinned?: boolean; archived?: boolean; muted?: boolean }) =>
    req<{ ok: boolean }>(`/chats/${chatId}/settings`, { method: 'PATCH', body: JSON.stringify(patch) }),
  recallChatMessage: (msgId: string) => req<{ ok: boolean }>(`/chats/messages/${msgId}/recall`, { method: 'POST' }),

  // Livestream
  getLivestreams: () => req<{ streams: SocialLivestreamItem[] }>('/livestreams'),
  startLivestream: (payload: { title: string; category?: string; allow_comments?: boolean; cover_url?: string }) =>
    req<{ stream: SocialLivestreamItem }>('/livestreams/start', { method: 'POST', body: JSON.stringify(payload) }),
  endLivestream: (id: string) => req<{ ok: boolean }>(`/livestreams/${id}/end`, { method: 'POST' }),
  commentLivestream: (id: string, content: string) =>
    req<{ comment: SocialLivestreamItem['comments'][number] }>(`/livestreams/${id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  likeLivestream: (id: string) => req<{ total_likes: number }>(`/livestreams/${id}/like`, { method: 'POST' }),
  banStreamViewer: (id: string, userId: string) =>
    req<{ banned: string[] }>(`/livestreams/${id}/ban`, { method: 'POST', body: JSON.stringify({ userId }) }),

  // Notifications
  getNotifications: () => req<{ notifications: SocialNotificationItem[]; unreadCount: number }>('/notifications'),
  markAllNotificationsRead: () => req<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),
  markNotificationRead: (id: string) => req<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),

  // Creator Studio
  getCreatorAnalytics: (range: '7d' | '30d' | '90d' = '7d') =>
    req<{
      rangeDays: number;
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
    }>(`/creator/analytics?range=${range}`),

  // Moderation & Reports & Appeals
  submitReport: (payload: { target_type: string; target_id: string; reason: string; detail?: string }) =>
    req<{ report: Record<string, unknown> }>('/reports', { method: 'POST', body: JSON.stringify(payload) }),
  submitAppeal: (payload: { report_id?: string; target_type: string; target_id: string; reason: string }) =>
    req<{ appeal: Record<string, unknown> }>('/appeals', { method: 'POST', body: JSON.stringify(payload) }),
  getAdminOverview: () =>
    req<{
      reports: Array<Record<string, unknown>>;
      appeals: Array<Record<string, unknown>>;
      users: SocialUser[];
      auditLogs: Array<Record<string, unknown>>;
    }>('/admin/overview'),
  moderateReport: (id: string, action: 'dismiss' | 'remove_content' | 'ban_author', note = '') =>
    req<{ ok: boolean }>(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ action, note }) }),
  moderateAppeal: (id: string, status: 'approved' | 'rejected', admin_note = '') =>
    req<{ ok: boolean }>(`/admin/appeals/${id}`, { method: 'PATCH', body: JSON.stringify({ status, admin_note }) }),
  toggleVerifyUser: (id: string, is_verified: boolean) =>
    req<{ ok: boolean; is_verified: number }>(`/admin/users/${id}/verify`, { method: 'PATCH', body: JSON.stringify({ is_verified }) }),
  setUserStatus: (id: string, status: 'active' | 'banned') =>
    req<{ ok: boolean; status: string }>(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
