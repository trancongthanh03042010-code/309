import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { Type } from '@google/genai';
import { getAiClient, getPublicAiConfig } from './ai_provider.ts';
import { generateCharacterReply } from './gemini.ts';
import {
  getOrCreateUnifiedCharChat,
  mirrorOSMessageToSocial,
} from './character_sync.ts';
import { broadcastSocialEvent, emitToStream, emitToUser, emitToUsers } from './ws_social.ts';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

const SOCIAL_GALLERY_IMAGES = [
  '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
  '/src/assets/images/social_neon_street_1794918924716.jpg',
  '/src/assets/images/social_studio_setup_1794918925398.jpg',
  '/src/assets/images/social_music_live_1794918926157.jpg',
  '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
  '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
];

const CURATED_SHARE_VIDEOS = [
  {
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    thumb: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
  },
  {
    url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
    title: 'synthwave radio - chill synth / retro beats',
    thumb: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
  },
  {
    url: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    title: 'Thước phim thiên nhiên 4K thư giãn',
    thumb: 'https://i.ytimg.com/vi/LXb3EKWsInQ/hqdefault.jpg',
  },
];

const COLOR_POST_STYLES = [
  'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
];

interface CharFullRow {
  id: string;
  name: string;
  username?: string;
  age: number;
  personality: string;
  bio: string;
  likes: string;
  mood: string;
  avatar: string;
  cover_image?: string;
  occupation?: string;
  city?: string;
  pronouns?: string;
  speaking_style?: string;
  role_title?: string;
  schedule_json?: string;
  join_social?: number;
  is_blocked?: number;
}

function pushBothNotifications(
  database: Database.Database,
  opts: {
    actor: CharFullRow;
    type: string;
    title: string;
    body: string;
    targetType: string;
    targetId: string;
    appRoute?: 'social' | 'messages';
  }
) {
  const now = new Date().toISOString();
  const sNotifId = uid('snot');
  database
    .prepare(
      `INSERT INTO social_notifications (id, user_id, actor_id, actor_name, actor_avatar, type, title, body, target_type, target_id, is_read, created_at)
       VALUES (?, 'user_1', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      sNotifId,
      opts.actor.id,
      opts.actor.name,
      opts.actor.avatar,
      opts.type,
      opts.title,
      opts.body,
      opts.targetType,
      opts.targetId,
      now
    );

  const created = database.prepare('SELECT * FROM social_notifications WHERE id = ?').get(sNotifId);
  emitToUser('user_1', 'notification:new', created);

  const osNotifId = uid('notif');
  const appId = opts.appRoute === 'messages' ? 'messages' : 'social';
  database
    .prepare(
      `INSERT INTO notifications (id, app_id, group_key, title, body, avatar, action_route, action_payload, priority, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      osNotifId,
      appId,
      appId === 'messages' ? 'Tin nhắn' : 'Mạng Xã hội',
      opts.title,
      opts.body,
      opts.actor.avatar,
      appId,
      opts.targetId,
      opts.appRoute === 'messages' ? 1 : 0,
      now
    );

  return { socialNotification: created, osNotification: database.prepare('SELECT * FROM notifications WHERE id = ?').get(osNotifId) };
}

async function generateContextualText(prompt: string, fallback: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return fallback;
  try {
    const ai = getAiClient();
    const cfg = getPublicAiConfig();
    const model = cfg.fallback_model_id || 'gemini-3.1-flash-lite';
    const res = await Promise.race([
      ai.models.generateContent({
        model,
        contents: prompt,
        config: { maxOutputTokens: 240 },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 7500)),
    ]);
    const txt = (res.text || '').trim().replace(/^["']|["']$/g, '');
    return txt || fallback;
  } catch {
    return fallback;
  }
}

async function generateContextualJson<T>(prompt: string, schema: Record<string, unknown>, fallback: T): Promise<T> {
  if (!process.env.GEMINI_API_KEY) return fallback;
  try {
    const ai = getAiClient();
    const cfg = getPublicAiConfig();
    const model = cfg.fallback_model_id || 'gemini-3.1-flash-lite';
    const res = await Promise.race([
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          maxOutputTokens: 320,
          responseMimeType: 'application/json',
          responseSchema: schema as never,
        },
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    const raw = (res.text || '').trim();
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function runContextualSocialTick(
  database: Database.Database,
  options?: {
    characterId?: string;
    action?: 'auto' | 'create_post' | 'create_story' | 'comment_post' | 'react_post' | 'follow_or_friend' | 'send_dm' | 'join_livestream';
    force?: boolean;
    triggerContext?: string;
  }
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  if (!options?.force) {
    const profile = database
      .prepare('SELECT proactive_ai_enabled, focus_mode FROM user_profile LIMIT 1')
      .get() as { proactive_ai_enabled?: number; focus_mode?: string } | undefined;
    if (profile && (profile.proactive_ai_enabled === 0 || (profile.focus_mode && profile.focus_mode !== 'off'))) {
      return { skipped: true, reason: 'Đang tắt AI chủ động hoặc bật Chế độ tập trung.' };
    }
  }

  let chars = database
    .prepare("SELECT * FROM characters WHERE COALESCE(join_social, 1) = 1 AND COALESCE(is_blocked, 0) = 0")
    .all() as CharFullRow[];
  if (options?.characterId) {
    chars = chars.filter((c) => c.id === options.characterId);
  }
  if (chars.length === 0) {
    return { skipped: true, reason: 'Không có nhân vật khả dụng trên mạng xã hội.' };
  }

  const char = chars[Math.floor(Math.random() * chars.length)];
  const userProfile = database
    .prepare("SELECT name, bio FROM user_profile WHERE id = 'user_1'")
    .get() as { name?: string; bio?: string } | undefined;
  const userName = userProfile?.name || 'Minh Anh';

  // Determine available live streams and recent posts
  const liveStream = database
    .prepare("SELECT * FROM social_livestreams WHERE status = 'live' ORDER BY started_at DESC LIMIT 1")
    .get() as { id: string; host_id: string; title: string; category: string } | undefined;

  const recentPosts = database
    .prepare("SELECT * FROM social_posts WHERE status = 'published' AND author_id != ? ORDER BY created_at DESC LIMIT 6")
    .all(char.id) as Array<{ id: string; author_id: string; author_name: string; content: string }>;

  let chosenAction = options?.action && options.action !== 'auto' ? options.action : 'create_post';
  if (!options?.action || options.action === 'auto') {
    const pool: Array<'create_post' | 'create_story' | 'comment_post' | 'react_post' | 'send_dm' | 'join_livestream' | 'follow_or_friend'> = [
      'create_post',
      'create_post',
      'create_story',
      'comment_post',
      'react_post',
      'send_dm',
    ];
    if (liveStream && liveStream.host_id !== char.id) {
      pool.push('join_livestream', 'join_livestream');
    }
    const isFriend = database
      .prepare("SELECT 1 FROM social_friendships WHERE (requester_id = ? AND addressee_id = 'user_1') OR (requester_id = 'user_1' AND addressee_id = ?) LIMIT 1")
      .get(char.id, char.id);
    if (!isFriend) {
      pool.push('follow_or_friend');
    }
    chosenAction = pool[Math.floor(Math.random() * pool.length)];
  }

  // 1. JOIN LIVESTREAM
  if (chosenAction === 'join_livestream' && liveStream) {
    const fallbackLines = [
      `Mới vào xem live của ${liveStream.title} đây, không khí chill quá! ✨`,
      `Ủng hộ buổi phát trực tiếp hết mình luôn nè! 🔥`,
      `Đang pha tách trà vừa mở live nghe cùng mọi người ☕`,
    ];
    const commentText = await generateContextualText(
      `Bạn là ${char.name} (${char.personality}, nghề nghiệp: ${char.occupation || char.role_title || ''}). Bạn vừa tham gia xem livestream "${liveStream.title}". Hãy viết 1 bình luận ngắn tự nhiên 6-14 từ bằng tiếng Việt để cổ vũ chủ phòng.`,
      fallbackLines[Math.floor(Math.random() * fallbackLines.length)]
    );
    const cid = uid('lc');
    database
      .prepare('INSERT INTO social_livestream_comments (id, stream_id, user_id, user_name, user_avatar, content, is_pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(cid, liveStream.id, char.id, char.name, char.avatar, commentText, now);
    database.prepare('UPDATE social_livestreams SET total_likes = total_likes + 5, viewer_count = viewer_count + 1 WHERE id = ?').run(liveStream.id);
    const cmt = database.prepare('SELECT * FROM social_livestream_comments WHERE id = ?').get(cid);
    const streamRow = database.prepare('SELECT total_likes, viewer_count FROM social_livestreams WHERE id = ?').get(liveStream.id) as { total_likes: number; viewer_count: number };
    emitToStream(liveStream.id, 'stream:comment', { streamId: liveStream.id, comment: cmt });
    emitToStream(liveStream.id, 'stream:reaction', { streamId: liveStream.id, totalLikes: streamRow.total_likes });
    return { action: 'join_livestream', character: char, streamId: liveStream.id, comment: cmt };
  }

  // 2. FOLLOW OR FRIEND REQUEST
  if (chosenAction === 'follow_or_friend') {
    database
      .prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)')
      .run(uid('fl'), char.id, 'user_1', now);
    const existingFr = database
      .prepare("SELECT id FROM social_friendships WHERE (requester_id = ? AND addressee_id = 'user_1') OR (requester_id = 'user_1' AND addressee_id = ?) LIMIT 1")
      .get(char.id, char.id);
    if (!existingFr) {
      database
        .prepare("INSERT INTO social_friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, 'user_1', 'pending', ?, ?)")
        .run(uid('fr'), char.id, now, now);
      const notifs = pushBothNotifications(database, {
        actor: char,
        type: 'friend_request',
        title: 'Lời mời kết bạn mới',
        body: `${char.name} (${char.occupation || char.role_title || 'Bạn AI'}) muốn kết bạn với bạn trên VibeSphere.`,
        targetType: 'profile',
        targetId: char.id,
      });
      return { action: 'friend_request', character: char, ...notifs };
    }
    const notifs = pushBothNotifications(database, {
      actor: char,
      type: 'follow',
      title: 'Người theo dõi mới',
      body: `${char.name} đã bắt đầu theo dõi trang cá nhân của bạn.`,
      targetType: 'profile',
      targetId: char.id,
    });
    return { action: 'follow', character: char, ...notifs };
  }

  // 3. REACT TO A RECENT POST
  if (chosenAction === 'react_post' && recentPosts.length > 0) {
    const target = recentPosts.find((p) => p.author_id === 'user_1') || recentPosts[0];
    const rxTypes = ['love', 'like', 'wow', 'haha'];
    const rxType = rxTypes[Math.floor(Math.random() * rxTypes.length)];
    const existingRx = database
      .prepare("SELECT id FROM social_reactions WHERE target_type = 'post' AND target_id = ? AND user_id = ?")
      .get(target.id, char.id);
    if (!existingRx) {
      database
        .prepare("INSERT INTO social_reactions (id, target_type, target_id, user_id, reaction_type, created_at) VALUES (?, 'post', ?, ?, ?, ?)")
        .run(uid('srx'), target.id, char.id, rxType, now);
      database.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?').run(target.id);
      broadcastSocialEvent('feed:reaction', { postId: target.id });
      const notifs =
        target.author_id === 'user_1'
          ? pushBothNotifications(database, {
              actor: char,
              type: 'reaction',
              title: `${char.name} đã thả cảm xúc`,
              body: `${char.name} đã bày tỏ cảm xúc với bài viết: "${target.content.slice(0, 60)}"`,
              targetType: 'post',
              targetId: target.id,
            })
          : {};
      return { action: 'react_post', character: char, postId: target.id, reaction: rxType, ...notifs };
    }
  }

  // 4. COMMENT ON RECENT POST
  if (chosenAction === 'comment_post' && recentPosts.length > 0) {
    const target = recentPosts.find((p) => p.author_id === 'user_1') || recentPosts[0];
    const fallbackCmt = `Nghe hợp gu mình ghê! Hôm nào kể thêm chi tiết nhé ✨`;
    const commentBody = await generateContextualText(
      `Bạn là ${char.name} (${char.personality}, sở thích: ${char.likes}, nghề nghiệp: ${char.occupation || char.role_title || ''}).\nNgười đăng "${target.author_name}" vừa chia sẻ bài viết: "${target.content}".\nHãy viết 1 bình luận ngắn 1 câu tự nhiên, thân thiện bằng tiếng Việt (không dùng hashtag rườm rà).`,
      fallbackCmt
    );
    const cmtId = uid('cmt');
    database
      .prepare(
        `INSERT INTO social_comments (id, post_id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, created_at, updated_at)
         VALUES (?, ?, '', '', ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(cmtId, target.id, char.id, char.name, char.avatar, commentBody, now, now);
    database.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(target.id);
    broadcastSocialEvent('feed:comment', { postId: target.id, commentId: cmtId });

    const notifs =
      target.author_id === 'user_1'
        ? pushBothNotifications(database, {
            actor: char,
            type: 'comment',
            title: `${char.name} đã bình luận`,
            body: commentBody.slice(0, 90),
            targetType: 'post',
            targetId: target.id,
          })
        : {};
    return { action: 'comment_post', character: char, postId: target.id, comment: database.prepare('SELECT * FROM social_comments WHERE id = ?').get(cmtId), ...notifs };
  }

  // 5. CREATE STORY
  if (chosenAction === 'create_story') {
    const media = SOCIAL_GALLERY_IMAGES[Math.floor(Math.random() * SOCIAL_GALLERY_IMAGES.length)];
    const fallbackCaption = `Khoảnh khắc bình yên tại ${char.city || 'Tokyo'} ✨`;
    const caption = await generateContextualText(
      `Bạn là ${char.name} (${char.personality}, tâm trạng: ${char.mood}, thành phố: ${char.city || 'Tokyo'}). Hãy viết một câu caption Story ngắn 4-10 từ bằng tiếng Việt.`,
      fallbackCaption
    );
    const storyId = uid('st');
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    database
      .prepare(
        `INSERT INTO social_stories (id, author_id, author_name, author_avatar, media_url, media_type, caption, audio_title, privacy, expires_at, views_count, created_at)
         VALUES (?, ?, ?, ?, ?, 'image', ?, ?, 'public', ?, 1, ?)`
      )
      .run(
        storyId,
        char.id,
        char.name.split(' ')[0] || char.name,
        char.avatar,
        media,
        caption,
        `${char.mood || 'Chill'} · VibeSphere Audio`,
        expiresAt,
        now
      );
    const notifs = pushBothNotifications(database, {
      actor: char,
      type: 'story',
      title: `${char.name} đã đăng Story mới`,
      body: caption,
      targetType: 'story',
      targetId: storyId,
    });
    return { action: 'create_story', character: char, story: database.prepare('SELECT * FROM social_stories WHERE id = ?').get(storyId), ...notifs };
  }

  // 6. SEND PROACTIVE DM (UNIFIED MESSENGER + OS MESSAGES)
  if (chosenAction === 'send_dm') {
    const pair = getOrCreateUnifiedCharChat(database, char.id);
    if (pair) {
      const fallbackDm = `Chào ${userName}, hôm nay công việc của bạn thế nào rồi? Mình vừa nghỉ giải lao nên nhớ tới bạn nè.`;
      const dmText = await generateContextualText(
        `Bạn là ${char.name} (${char.personality}, xưng hô: ${char.pronouns || 'Mình - Bạn'}). Hãy nhắn 1 tin nhắn ngắn tự nhiên hỏi thăm ${userName} dựa trên sở thích (${char.likes}) và tâm trạng (${char.mood}).`,
        fallbackDm
      );
      const osMsgId = uid('msg');
      database
        .prepare(
          `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, created_at)
           VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?)`
        )
        .run(osMsgId, pair.convId, char.id, char.name, char.avatar, dmText, now);
      database.prepare('UPDATE conversations SET unread_count = unread_count + 1, updated_at = ?, last_message_id = ? WHERE id = ?').run(
        now,
        osMsgId,
        pair.convId
      );
      mirrorOSMessageToSocial(database, {
        osMessageId: osMsgId,
        conversationId: pair.convId,
        senderId: char.id,
        content: dmText,
        msgType: 'text',
        createdAt: now,
      });
      const notifs = pushBothNotifications(database, {
        actor: char,
        type: 'message',
        title: char.name,
        body: dmText.slice(0, 90),
        targetType: 'chat',
        targetId: pair.chatId,
        appRoute: 'messages',
      });
      return { action: 'send_dm', character: char, conversationId: pair.convId, chatId: pair.chatId, text: dmText, ...notifs };
    }
  }

  // 7. DEFAULT: CREATE CONTEXTUAL RICH POST (text, photo, colored status, poll, or YouTube share)
  const variants = ['photo', 'colored_status', 'poll', 'youtube_share'] as const;
  const variant = variants[Math.floor(Math.random() * variants.length)];

  const generated = await generateContextualJson<{
    content: string;
    feeling?: string;
    hashtag?: string;
    pollQuestion?: string;
    pollOptions?: string[];
  }>(
    `Bạn là ${char.name} (${char.personality}, sở thích: ${char.likes}, nghề nghiệp: ${char.occupation || char.role_title || ''}, thành phố: ${char.city || 'Tokyo'}, tâm trạng: ${char.mood}).
${options?.triggerContext ? `Ngữ cảnh thêm: ${options.triggerContext}` : ''}
Hãy viết một bài đăng mạng xã hội tự nhiên bằng tiếng Việt (1-3 câu) phù hợp với dạng "${variant}". Nếu là poll, đặt câu hỏi ngắn và 2-3 lựa chọn.`,
    {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING },
        feeling: { type: Type.STRING },
        hashtag: { type: Type.STRING },
        pollQuestion: { type: Type.STRING },
        pollOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['content'],
    },
    {
      content:
        variant === 'poll'
          ? `Cuối tuần này mọi người thích hoạt động nào nhất ở ${char.city || 'thành phố'}?`
          : `Một buổi ${new Date().getHours() < 12 ? 'sáng' : new Date().getHours() < 18 ? 'chiều' : 'tối'} thật dễ chịu! Đang tận hưởng chút thời gian cho ${char.likes.split(',')[0] || 'âm nhạc'}.`,
      feeling: 'Thư giãn ✨',
      hashtag: '#VibeSphere',
      pollOptions: ['Đi cà phê chill ☕', 'Chụp ảnh đường phố 📷', 'Ở nhà nghe Lo-Fi 🎧'],
    }
  );

  const postId = uid('post');
  const tag = (generated.hashtag || '#VibeSphere').startsWith('#') ? generated.hashtag || '#VibeSphere' : `#${generated.hashtag}`;
  let postType = 'text';
  let mediaUrl = '';
  let mediaType = '';
  let mediaJson = '[]';
  let bgStyle = '';
  let linkUrl = '';
  let linkTitle = '';
  let pollJson = '';

  if (variant === 'photo') {
    postType = 'image';
    mediaUrl = SOCIAL_GALLERY_IMAGES[Math.floor(Math.random() * SOCIAL_GALLERY_IMAGES.length)];
    mediaType = 'image';
    mediaJson = JSON.stringify([{ url: mediaUrl, type: 'image' }]);
  } else if (variant === 'colored_status') {
    postType = 'text';
    bgStyle = COLOR_POST_STYLES[Math.floor(Math.random() * COLOR_POST_STYLES.length)];
  } else if (variant === 'youtube_share') {
    const yt = CURATED_SHARE_VIDEOS[Math.floor(Math.random() * CURATED_SHARE_VIDEOS.length)];
    postType = 'link';
    linkUrl = yt.url;
    linkTitle = yt.title;
    mediaUrl = yt.thumb;
    mediaType = 'image';
    mediaJson = JSON.stringify([{ url: yt.thumb, type: 'image' }]);
  } else if (variant === 'poll') {
    postType = 'poll';
    const opts = (generated.pollOptions && generated.pollOptions.length >= 2 ? generated.pollOptions : ['Đi cà phê chill', 'Nghe nhạc ở nhà'])
      .slice(0, 4)
      .map((label, idx) => ({ id: `opt_${idx + 1}`, label, votes: idx === 0 ? 2 : 1 }));
    pollJson = JSON.stringify({
      question: generated.pollQuestion || 'Bạn chọn phương án nào?',
      options: opts,
    });
  }

  database
    .prepare(
      `INSERT INTO social_posts (
        id, author_type, author_id, author_name, author_avatar, content, post_type,
        media_url, media_type, media_json, cover_url, hashtags_json, mentions_json,
        location_name, link_url, link_title, bg_style, feeling, poll_json,
        privacy, comment_policy, status, likes_count, comments_count, shares_count, views_count, created_at, updated_at
      ) VALUES (?, 'character', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, 'public', 'everyone', 'published', 2, 0, 0, 24, ?, ?)`
    )
    .run(
      postId,
      char.id,
      char.name,
      char.avatar,
      generated.content,
      postType,
      mediaUrl,
      mediaType,
      mediaJson,
      mediaUrl,
      JSON.stringify([tag, '#PhoneOS']),
      char.city || '',
      linkUrl,
      linkTitle,
      bgStyle,
      generated.feeling || '',
      pollJson,
      now,
      now
    );

  broadcastSocialEvent('feed:post_new', { postId, authorId: char.id });
  const notifs = pushBothNotifications(database, {
    actor: char,
    type: 'post',
    title: `${char.name} đã đăng bài mới`,
    body: generated.content.slice(0, 90),
    targetType: 'post',
    targetId: postId,
  });

  return {
    action: 'create_post',
    variant,
    character: char,
    post: database.prepare('SELECT * FROM social_posts WHERE id = ?').get(postId),
    ...notifs,
  };
}

export async function triggerContextualAiMentionOrReaction(
  database: Database.Database,
  opts: { postId: string; content: string; mentions: string[]; authorId: string }
): Promise<void> {
  try {
    if (opts.authorId !== 'user_1') return;

    // 1. Reply from any explicitly @mentioned character
    const targetChars: CharFullRow[] = [];
    for (const m of opts.mentions) {
      const ch = database
        .prepare("SELECT c.* FROM characters c JOIN social_users u ON u.id = c.id WHERE LOWER(u.username) = LOWER(?) AND COALESCE(c.is_blocked, 0) = 0 LIMIT 1")
        .get(m) as CharFullRow | undefined;
      if (ch) targetChars.push(ch);
    }

    // 2. Otherwise pick 1 close character who follows user_1
    if (targetChars.length === 0) {
      const fallbackChar = database
        .prepare("SELECT c.* FROM characters c WHERE COALESCE(c.join_social, 1) = 1 AND COALESCE(c.is_blocked, 0) = 0 ORDER BY c.interactions_count DESC LIMIT 3")
        .all() as CharFullRow[];
      if (fallbackChar.length > 0) {
        targetChars.push(fallbackChar[Math.floor(Math.random() * fallbackChar.length)]);
      }
    }

    if (targetChars.length === 0) return;
    const responder = targetChars[0];
    const now = new Date().toISOString();

    const replyText = await generateContextualText(
      `Bạn là ${responder.name} (${responder.personality}). Người dùng vừa đăng bài viết lên mạng xã hội: "${opts.content}".\nHãy viết 1 bình luận ngắn 1 câu tự nhiên, thân thiện để tương tác với họ.`,
      `Thấy bài viết của bạn rồi nè! Nghe thú vị quá ✨`
    );

    const cmtId = uid('cmt');
    database
      .prepare(
        `INSERT INTO social_comments (id, post_id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, created_at, updated_at)
         VALUES (?, ?, '', '', ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(cmtId, opts.postId, responder.id, responder.name, responder.avatar, replyText, now, now);

    database.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(opts.postId);
    broadcastSocialEvent('feed:comment', { postId: opts.postId, commentId: cmtId });

    pushBothNotifications(database, {
      actor: responder,
      type: 'comment',
      title: `${responder.name} đã bình luận bài viết của bạn`,
      body: replyText.slice(0, 90),
      targetType: 'post',
      targetId: opts.postId,
    });
  } catch {
    // non-fatal background AI interaction
  }
}

export async function triggerAiReplyInSocialChat(
  database: Database.Database,
  opts: { chatId: string; userMessage: string; characterId: string }
): Promise<void> {
  try {
    const char = database.prepare('SELECT * FROM characters WHERE id = ? AND COALESCE(is_blocked, 0) = 0').get(opts.characterId) as
      | (CharFullRow & { dislikes?: string; scenario?: string; relationship_level?: number; relationship_xp?: number })
      | undefined;
    if (!char) return;

    const userProfile = database.prepare("SELECT name FROM user_profile WHERE id = 'user_1'").get() as { name?: string } | undefined;
    const memories = (
      database
        .prepare('SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY importance DESC LIMIT 10')
        .all(char.id) as Array<{ content: string }>
    ).map((m) => m.content);

    const recentRows = database
      .prepare('SELECT sender_id, content, msg_type FROM social_chat_messages WHERE chat_id = ? AND is_recalled = 0 ORDER BY created_at DESC LIMIT 12')
      .all(opts.chatId) as Array<{ sender_id: string; content: string; msg_type: string }>;
    recentRows.reverse();
    const recentMessages = recentRows.map((r) => ({
      sender: r.sender_id === 'user_1' ? userProfile?.name || 'Minh Anh' : char.name,
      content: r.content,
      msg_type: r.msg_type,
    }));

    let replyText = '';
    try {
      const aiRes = await generateCharacterReply(
        {
          id: char.id,
          name: char.name,
          age: char.age || 20,
          personality: char.personality,
          bio: char.bio,
          likes: char.likes,
          dislikes: char.dislikes || '',
          scenario: char.scenario || 'Đang nhắn tin trên VibeSphere Messenger',
          mood: char.mood || 'Vui vẻ',
          relationship_level: char.relationship_level || 1,
          relationship_xp: char.relationship_xp || 20,
          memories,
          recentMessages,
          userName: userProfile?.name || 'Minh Anh',
          pronouns: char.pronouns || 'Mình - Bạn',
          speaking_style: char.speaking_style || 'Tự nhiên',
          role_title: char.role_title || char.occupation || 'Bạn đồng hành AI',
        },
        opts.userMessage
      );
      replyText = aiRes.reply;
    } catch {
      replyText = `Mình nhận được tin nhắn rồi nè! "${opts.userMessage.slice(0, 40)}" — để mình trả lời bạn kỹ hơn nha.`;
    }

    const now = new Date().toISOString();
    const msgId = uid('scmsg');
    database
      .prepare(
        `INSERT INTO social_chat_messages (
          id, chat_id, sender_id, content, msg_type, attachment_json, read_by_json, delivered_to_json, created_at
        ) VALUES (?, ?, ?, ?, 'text', '{}', ?, ?, ?)`
      )
      .run(msgId, opts.chatId, char.id, replyText, JSON.stringify([char.id]), JSON.stringify(['user_1']), now);

    database.prepare('UPDATE social_chats SET updated_at = ? WHERE id = ?').run(now, opts.chatId);

    const savedMsg = {
      ...(database.prepare('SELECT * FROM social_chat_messages WHERE id = ?').get(msgId) as Record<string, unknown>),
      sender_name: char.name,
      sender_avatar: char.avatar,
      reactions: [],
      read_by: [char.id],
      delivered_to: ['user_1'],
      attachment: {},
    };

    emitToUsers(['user_1', char.id], 'chat:message', { chatId: opts.chatId, message: savedMsg });

    // Also mirror back to Phone OS Messages 1-on-1 conversation
    const pair = getOrCreateUnifiedCharChat(database, char.id);
    if (pair) {
      const osMsgId = uid('msg');
      database
        .prepare(
          `INSERT INTO messages (
            id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, external_sync_id, created_at
          ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)`
        )
        .run(osMsgId, pair.convId, char.id, char.name, char.avatar, replyText, msgId, now);
      database.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ?, unread_count = unread_count + 1 WHERE id = ?').run(
        now,
        osMsgId,
        pair.convId
      );
    }
  } catch {
    // non-fatal
  }
}
