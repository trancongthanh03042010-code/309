export type SocialReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export interface SocialUser {
  id: string;
  username: string;
  email: string;
  phone: string;
  display_name: string;
  bio: string;
  avatar: string;
  cover_url: string;
  links_json: string;
  account_type: 'personal' | 'creator' | 'business';
  role: 'user' | 'moderator' | 'admin';
  is_verified: number;
  is_private: number;
  allow_comments_default: 'everyone' | 'friends' | 'off';
  allow_tags: number;
  allow_mentions: number;
  online_status: string;
  show_online_status: number;
  two_factor_enabled: number;
  status: 'active' | 'deactivated' | 'banned';
  interests_json: string;
  is_online?: boolean;
  is_following?: boolean;
  is_friend?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialPostMediaItem {
  url: string;
  type: 'image' | 'video';
  coverUrl?: string;
}

export interface SocialPostItem {
  id: string;
  author_type: string;
  author_id: string;
  author_name: string;
  author_username?: string;
  author_avatar: string;
  author_verified?: number;
  author_online?: boolean;
  content: string;
  post_type: 'text' | 'image' | 'video' | 'album' | 'share' | 'thread';
  media_url: string;
  media_type: string;
  media_items: SocialPostMediaItem[];
  cover_url: string;
  hashtags: string[];
  mentions: string[];
  location_name: string;
  link_url: string;
  link_title: string;
  shared_post_id: string;
  shared_post?: {
    id: string;
    author_id: string;
    author_name: string;
    author_avatar: string;
    content: string;
    media_url: string;
    media_json: SocialPostMediaItem[];
    created_at: string;
  } | null;
  group_id: string;
  group_name?: string;
  page_id: string;
  page_name?: string;
  privacy: 'public' | 'friends' | 'followers' | 'private';
  comment_policy: 'everyone' | 'friends' | 'off';
  is_pinned: number;
  is_draft: number;
  scheduled_at: string;
  status: 'published' | 'draft' | 'scheduled' | 'removed';
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  reaction_counts: Record<SocialReactionType, number>;
  total_reactions: number;
  my_reaction: SocialReactionType | null;
  is_saved: boolean;
  saved_collection_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SocialCommentItem {
  id: string;
  post_id: string;
  video_id: string;
  parent_id: string;
  author_id: string;
  author_name: string;
  author_username?: string;
  author_avatar: string;
  author_verified?: number;
  content: string;
  media_url: string;
  is_pinned: number;
  is_hidden: number;
  likes_count: number;
  my_reaction: string | null;
  created_at: string;
}

export interface SocialStoryItem {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string;
  overlays: Array<{ id: string; text: string; color?: string; yPct?: number }>;
  audio_title: string;
  mentions: string[];
  hashtags: string[];
  privacy: string;
  expires_at: string;
  is_archived: number;
  highlight_id: string;
  views_count: number;
  viewed: boolean;
  my_reaction?: string;
  viewers?: Array<{
    id: string;
    viewer_id: string;
    viewer_name: string;
    viewer_avatar: string;
    reaction: string;
    viewed_at: string;
  }>;
  created_at: string;
}

export interface SocialHighlightItem {
  id: string;
  user_id: string;
  title: string;
  cover_url: string;
  created_at: string;
}

export interface SocialVideoItem {
  id: string;
  author_id: string;
  author_name: string;
  author_username?: string;
  author_avatar: string;
  author_verified?: number;
  title: string;
  description: string;
  video_url: string;
  cover_url: string;
  duration_sec: number;
  trim_start_sec: number;
  trim_end_sec: number;
  audio_title: string;
  hashtags: string[];
  category: string;
  privacy: string;
  allow_comments: number;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  is_liked: boolean;
  is_saved: boolean;
  is_following: boolean;
  created_at: string;
}

export interface SocialGroupItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover_url: string;
  category: string;
  privacy: 'public' | 'private' | 'closed';
  rules: string[];
  owner_id: string;
  members_count: number;
  my_role: 'admin' | 'moderator' | 'member' | null;
  my_status: 'approved' | 'pending' | 'none';
  pending_requests: Array<{
    user_id: string;
    display_name: string;
    username: string;
    avatar: string;
    joined_at: string;
  }>;
  created_at: string;
}

export interface SocialPageItem {
  id: string;
  name: string;
  username: string;
  category: string;
  description: string;
  avatar: string;
  cover_url: string;
  website: string;
  is_verified: number;
  owner_id: string;
  followers_count: number;
  is_following: boolean;
  my_role: string | null;
  created_at: string;
}

export interface SocialChatRoom {
  id: string;
  title: string;
  display_title: string;
  display_avatar: string;
  is_group: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
  members: Array<{
    id: string;
    username: string;
    display_name: string;
    avatar: string;
    is_verified: number;
    is_online: boolean;
    role: string;
  }>;
  last_message: SocialChatMsg | null;
  unread_count: number;
  updated_at: string;
}

export interface SocialChatMsg {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string;
  content: string;
  msg_type: 'text' | 'image' | 'video' | 'file' | 'sticker' | 'voice' | 'post_share' | 'story_reply' | 'call_log';
  attachment?: Record<string, string>;
  reply_to_id: string;
  reactions: Array<{ userId: string; emoji: string }>;
  read_by: string[];
  delivered_to: string[];
  is_recalled: number;
  created_at: string;
}

export interface SocialLivestreamItem {
  id: string;
  host_id: string;
  host_name: string;
  host_username: string;
  host_avatar: string;
  host_verified: number;
  title: string;
  cover_url: string;
  category: string;
  status: 'live' | 'ended';
  allow_comments: number;
  viewer_count: number;
  peak_viewers: number;
  total_likes: number;
  banned_users: string[];
  comments: Array<{
    id: string;
    stream_id: string;
    user_id: string;
    user_name: string;
    user_avatar: string;
    content: string;
    is_pinned: number;
    created_at: string;
  }>;
  started_at: string;
  ended_at: string;
}

export interface SocialNotificationItem {
  id: string;
  user_id: string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string;
  type: string;
  title: string;
  body: string;
  target_type: string;
  target_id: string;
  is_read: number;
  created_at: string;
}

export interface SocialCollectionItem {
  id: string;
  user_id: string;
  name: string;
  is_private: number;
  created_at: string;
}

export interface SocialSessionItem {
  id: string;
  device_name: string;
  ip_address: string;
  user_agent: string;
  is_current: boolean;
  created_at: string;
  last_active_at: string;
  expires_at: string;
}
