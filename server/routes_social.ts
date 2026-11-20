import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.ts';
import { hashPassword, hashToken, verifyPassword } from './db_social.ts';
import {
  broadcastSocialEvent,
  emitToStream,
  emitToUser,
  emitToUsers,
  isUserOnline,
} from './ws_social.ts';
import {
  mirrorSocialMessageToOS,
  syncSocialUserBackToCharacterOrProfile,
} from './character_sync.ts';
import {
  runContextualSocialTick,
  triggerAiReplyInSocialChat,
  triggerContextualAiMentionOrReaction,
} from './social_ai_engine.ts';

interface SocialUserRow {
  id: string;
  username: string;
  email: string;
  phone: string;
  password_hash: string;
  display_name: string;
  bio: string;
  avatar: string;
  cover_url: string;
  links_json: string;
  account_type: 'personal' | 'creator' | 'business';
  role: 'user' | 'moderator' | 'admin';
  is_verified: number;
  is_private: number;
  allow_comments_default: string;
  allow_tags: number;
  allow_mentions: number;
  online_status: string;
  show_online_status: number;
  two_factor_enabled: number;
  status: 'active' | 'deactivated' | 'banned';
  interests_json: string;
  created_at: string;
  updated_at: string;
}

interface AuthedRequest extends Request {
  socialUser?: SocialUserRow;
  socialSessionId?: string;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeUser(u: SocialUserRow) {
  const { password_hash: _pw, ...rest } = u;
  return {
    ...rest,
    is_online: isUserOnline(u.id) || u.online_status === 'online',
  };
}

function logSocialAudit(actorId: string, action: string, targetType = '', targetId = '', detail: Record<string, unknown> = {}): void {
  try {
    db.prepare(
      'INSERT INTO social_audit_logs (id, actor_id, action, target_type, target_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uid('saud'), actorId, action, targetType, targetId, JSON.stringify(detail), new Date().toISOString());
  } catch {
    // non-fatal
  }
}

function pushSocialNotification(opts: {
  userId: string;
  actor: SocialUserRow;
  type: string;
  title: string;
  body: string;
  targetType?: string;
  targetId?: string;
}): void {
  if (!opts.userId || opts.userId === opts.actor.id) return;
  const id = uid('snot');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO social_notifications (id, user_id, actor_id, actor_name, actor_avatar, type, title, body, target_type, target_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    opts.userId,
    opts.actor.id,
    opts.actor.display_name,
    opts.actor.avatar,
    opts.type,
    opts.title,
    opts.body,
    opts.targetType || '',
    opts.targetId || '',
    now
  );
  const created = db.prepare('SELECT * FROM social_notifications WHERE id = ?').get(id);
  emitToUser(opts.userId, 'notification:new', created);
}

// Sliding window rate limiter
const writeBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(keyPrefix: string, maxPerMin: number) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${req.socialUser?.id || req.ip || 'anon'}`;
    const now = Date.now();
    const cur = writeBuckets.get(key);
    if (!cur || now > cur.resetAt) {
      writeBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    if (cur.count >= maxPerMin) {
      res.status(429).json({ error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' });
      return;
    }
    cur.count += 1;
    next();
  };
}

function hasUnsafeContent(text: string): string | null {
  const lower = text.toLowerCase();
  if (/javascript:|vbscript:|data:text\/html|<script\b/i.test(lower)) {
    return 'Nội dung chứa liên kết hoặc mã kịch bản không an toàn.';
  }
  if (/bit\.ly\/free-nitro|claim-prize-now|phishing-login/i.test(lower)) {
    return 'Liên kết có dấu hiệu lừa đảo đã bị chặn bởi bộ lọc an toàn.';
  }
  return null;
}

function extractToken(req: Request): string {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const hdr = req.headers['x-social-token'];
  if (typeof hdr === 'string') return hdr.trim();
  return '';
}

function authenticateToken(token: string): { user: SocialUserRow; sessionId: string } | null {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT s.id as session_id, u.*
       FROM social_sessions s
       JOIN social_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.is_active = 1 AND s.expires_at > ? AND u.status = 'active'
       LIMIT 1`
    )
    .get(tokenHash, now) as (SocialUserRow & { session_id: string }) | undefined;
  if (!row) return null;
  db.prepare('UPDATE social_sessions SET last_active_at = ? WHERE id = ?').run(now, row.session_id);
  const { session_id, ...user } = row;
  return { user: user as SocialUserRow, sessionId: session_id };
}

function requireSocialAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const auth = authenticateToken(token);
  if (!auth) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }
  req.socialUser = auth.user;
  req.socialSessionId = auth.sessionId;
  next();
}

function createSessionForUser(userId: string, deviceName: string, req: Request): { token: string; sessionId: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = uid('ssess');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
  db.prepare(
    `INSERT INTO social_sessions (id, user_id, token_hash, device_name, ip_address, user_agent, is_active, created_at, last_active_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(
    sessionId,
    userId,
    hashToken(token),
    deviceName || 'Phone OS Android Device',
    req.ip || '127.0.0.1',
    String(req.headers['user-agent'] || '').slice(0, 180),
    now,
    now,
    expiresAt
  );
  return { token, sessionId };
}

// Privacy & Relation Helpers (Server-Enforced)
function isBlockedBetween(userA: string, userB: string): boolean {
  if (!userA || !userB || userA === userB) return false;
  const row = db
    .prepare(
      `SELECT 1 FROM social_user_relations
       WHERE relation_type = 'block' AND ((user_id = ? AND target_id = ?) OR (user_id = ? AND target_id = ?))
       LIMIT 1`
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}

function isRestrictedBy(ownerId: string, targetId: string): boolean {
  if (!ownerId || !targetId || ownerId === targetId) return false;
  return Boolean(
    db
      .prepare("SELECT 1 FROM social_user_relations WHERE user_id = ? AND target_id = ? AND relation_type = 'restrict' LIMIT 1")
      .get(ownerId, targetId)
  );
}

function isMutedBy(viewerId: string, targetId: string): boolean {
  if (!viewerId || !targetId || viewerId === targetId) return false;
  return Boolean(
    db
      .prepare("SELECT 1 FROM social_user_relations WHERE user_id = ? AND target_id = ? AND relation_type = 'mute' LIMIT 1")
      .get(viewerId, targetId)
  );
}

function isFriends(userA: string, userB: string): boolean {
  if (!userA || !userB) return false;
  if (userA === userB) return true;
  const row = db
    .prepare(
      `SELECT 1 FROM social_friendships
       WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
       LIMIT 1`
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}

function isFollowing(followerId: string, followingId: string): boolean {
  if (!followerId || !followingId) return false;
  if (followerId === followingId) return true;
  return Boolean(
    db.prepare('SELECT 1 FROM social_follows WHERE follower_id = ? AND following_id = ? LIMIT 1').get(followerId, followingId)
  );
}

function canViewUserContent(viewerId: string, ownerId: string, itemPrivacy = 'public'): boolean {
  if (!ownerId) return true;
  if (viewerId === ownerId) return true;
  if (isBlockedBetween(viewerId, ownerId)) return false;

  const owner = db.prepare('SELECT is_private, status FROM social_users WHERE id = ?').get(ownerId) as
    | { is_private: number; status: string }
    | undefined;
  if (owner && owner.status !== 'active') return false;
  if (owner && owner.is_private === 1 && !isFollowing(viewerId, ownerId) && !isFriends(viewerId, ownerId)) {
    return false;
  }

  if (itemPrivacy === 'private' || itemPrivacy === 'only_me') return false;
  if (itemPrivacy === 'friends') return isFriends(viewerId, ownerId);
  if (itemPrivacy === 'followers') return isFollowing(viewerId, ownerId) || isFriends(viewerId, ownerId);
  return true;
}

function publishDueScheduledPosts(): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE social_posts
     SET status = 'published', created_at = scheduled_at, updated_at = ?
     WHERE status = 'scheduled' AND COALESCE(scheduled_at, '') != '' AND scheduled_at <= ?`
  ).run(now, now);
}

function hydratePost(raw: Record<string, unknown>, viewerId: string) {
  const postId = String(raw.id);
  const authorId = String(raw.author_id);
  const author = db
    .prepare('SELECT id, username, display_name, avatar, is_verified, online_status, show_online_status FROM social_users WHERE id = ?')
    .get(authorId) as
    | {
        id: string;
        username: string;
        display_name: string;
        avatar: string;
        is_verified: number;
        online_status: string;
        show_online_status: number;
      }
    | undefined;

  const reactions = db
    .prepare('SELECT reaction_type, COUNT(*) as cnt FROM social_reactions WHERE target_type = ? AND target_id = ? GROUP BY reaction_type')
    .all('post', postId) as Array<{ reaction_type: string; cnt: number }>;
  const reactionCounts: Record<string, number> = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
  let totalReactions = 0;
  for (const r of reactions) {
    reactionCounts[r.reaction_type] = r.cnt;
    totalReactions += r.cnt;
  }
  const myRx = db
    .prepare('SELECT reaction_type FROM social_reactions WHERE target_type = ? AND target_id = ? AND user_id = ?')
    .get('post', postId, viewerId) as { reaction_type: string } | undefined;

  const savedRow = db
    .prepare('SELECT collection_id FROM social_saved_items WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .get(viewerId, 'post', postId) as { collection_id: string } | undefined;

  let sharedPost: Record<string, unknown> | null = null;
  if (raw.shared_post_id) {
    const sp = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(String(raw.shared_post_id)) as
      | Record<string, unknown>
      | undefined;
    if (sp && canViewUserContent(viewerId, String(sp.author_id), String(sp.privacy || 'public'))) {
      const spAuthor = db
        .prepare('SELECT display_name, avatar FROM social_users WHERE id = ?')
        .get(String(sp.author_id)) as { display_name: string; avatar: string } | undefined;
      sharedPost = {
        id: sp.id,
        author_id: sp.author_id,
        author_name: spAuthor?.display_name || sp.author_name,
        author_avatar: spAuthor?.avatar || sp.author_avatar,
        content: sp.content,
        media_url: sp.media_url,
        media_json: safeJson(String(sp.media_json || '[]'), []),
        created_at: sp.created_at,
      };
    }
  }

  let groupName = '';
  if (raw.group_id) {
    const g = db.prepare('SELECT name FROM social_groups WHERE id = ?').get(String(raw.group_id)) as { name: string } | undefined;
    if (g) groupName = g.name;
  }

  let pageName = '';
  if (raw.page_id) {
    const pg = db.prepare('SELECT name FROM social_pages WHERE id = ?').get(String(raw.page_id)) as { name: string } | undefined;
    if (pg) pageName = pg.name;
  }

  let poll: { question: string; options: Array<{ id: string; label: string; votes: number }>; totalVotes: number } | null = null;
  let myPollVote = '';
  if (raw.poll_json && String(raw.poll_json).trim().startsWith('{')) {
    const parsedPoll = safeJson<{ question?: string; options?: Array<{ id: string; label: string; votes?: number }> }>(
      String(raw.poll_json),
      {}
    );
    if (parsedPoll.options && parsedPoll.options.length > 0) {
      const dbVotes = db
        .prepare('SELECT option_id, COUNT(*) as cnt FROM social_poll_votes WHERE post_id = ? GROUP BY option_id')
        .all(postId) as Array<{ option_id: string; cnt: number }>;
      const dbMap = new Map(dbVotes.map((v) => [v.option_id, v.cnt]));
      const opts = parsedPoll.options.map((o) => ({
        id: o.id,
        label: o.label,
        votes: (o.votes || 0) + (dbMap.get(o.id) || 0),
      }));
      const totalVotes = opts.reduce((s, o) => s + o.votes, 0);
      poll = {
        question: parsedPoll.question || 'Bình chọn ý kiến',
        options: opts,
        totalVotes,
      };
      const myVoteRow = db
        .prepare('SELECT option_id FROM social_poll_votes WHERE post_id = ? AND user_id = ?')
        .get(postId, viewerId) as { option_id: string } | undefined;
      myPollVote = myVoteRow?.option_id || '';
    }
  }

  const baseLikes = Number(raw.likes_count || 0);
  const effectiveReactionsTotal = Math.max(baseLikes, totalReactions);

  return {
    ...raw,
    author_username: author?.username || authorId,
    author_name: author?.display_name || String(raw.author_name || 'Người dùng'),
    author_avatar: author?.avatar || String(raw.author_avatar || ''),
    author_verified: author?.is_verified || 0,
    author_online: author?.show_online_status ? isUserOnline(author.id) || author.online_status === 'online' : false,
    media_items: safeJson<Array<{ url: string; type: string; coverUrl?: string }>>(String(raw.media_json || '[]'), []),
    hashtags: safeJson<string[]>(String(raw.hashtags_json || '[]'), []),
    mentions: safeJson<string[]>(String(raw.mentions_json || '[]'), []),
    bg_style: String(raw.bg_style || ''),
    feeling: String(raw.feeling || ''),
    poll,
    my_poll_vote: myPollVote,
    reaction_counts: reactionCounts,
    total_reactions: effectiveReactionsTotal,
    my_reaction: myRx?.reaction_type || (Number(raw.is_liked) === 1 ? 'like' : null),
    is_saved: Boolean(savedRow) || Number(raw.is_saved) === 1,
    saved_collection_id: savedRow?.collection_id || '',
    shared_post: sharedPost,
    group_name: groupName,
    page_name: pageName,
  };
}

function hydrateCommentsForTarget(targetCol: 'post_id' | 'video_id', targetId: string, viewerId: string, ownerId: string) {
  const rows = db
    .prepare(`SELECT * FROM social_comments WHERE ${targetCol} = ? ORDER BY is_pinned DESC, created_at ASC`)
    .all(targetId) as Array<Record<string, unknown>>;

  return rows
    .filter((c) => {
      const cAuthorId = String(c.author_id || '');
      if (isBlockedBetween(viewerId, cAuthorId)) return false;
      if (Number(c.is_hidden) === 1 && viewerId !== ownerId && viewerId !== cAuthorId) return false;
      if (isRestrictedBy(ownerId, cAuthorId) && viewerId !== ownerId && viewerId !== cAuthorId) return false;
      return true;
    })
    .map((c) => {
      const myRx = db
        .prepare('SELECT reaction_type FROM social_reactions WHERE target_type = ? AND target_id = ? AND user_id = ?')
        .get('comment', String(c.id), viewerId) as { reaction_type: string } | undefined;
      const author = db
        .prepare('SELECT username, display_name, avatar, is_verified FROM social_users WHERE id = ?')
        .get(String(c.author_id || '')) as
        | { username: string; display_name: string; avatar: string; is_verified: number }
        | undefined;
      return {
        ...c,
        author_name: author?.display_name || String(c.author_name || 'Người dùng'),
        author_avatar: author?.avatar || String(c.author_avatar || ''),
        author_username: author?.username || String(c.author_id || ''),
        author_verified: author?.is_verified || 0,
        my_reaction: myRx?.reaction_type || null,
      };
    });
}

export function createSocialRouter() {
  const router = express.Router();

  // ==========================================
  // 1. AUTHENTICATION, SESSIONS, ACCOUNT LIFECYCLE
  // ==========================================
  router.post('/auth/os-bootstrap', (req: Request, res: Response) => {
    const existingToken = extractToken(req);
    const existing = authenticateToken(existingToken);
    if (existing) {
      res.json({ token: existingToken, user: sanitizeUser(existing.user) });
      return;
    }
    const osOwner = db.prepare("SELECT * FROM social_users WHERE id = 'user_1' AND status = 'active' LIMIT 1").get() as
      | SocialUserRow
      | undefined;
    if (!osOwner) {
      res.status(404).json({ requiresLogin: true, error: 'Chưa có tài khoản mặc định, vui lòng đăng nhập hoặc đăng ký.' });
      return;
    }
    const { token } = createSessionForUser(osOwner.id, 'Phone OS Android Shell', req);
    res.json({ token, user: sanitizeUser(osOwner) });
  });

  router.post('/auth/register', rateLimit('auth', 20), (req: Request, res: Response) => {
    const { username, email, password, display_name, phone = '', account_type = 'personal' } = req.body as Record<string, string>;
    const cleanUser = (username || '').trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      res.status(400).json({ error: 'Username phải có ít nhất 3 ký tự (chữ, số, dấu chấm hoặc gạch dưới).' });
      return;
    }
    if (!cleanEmail.includes('@')) {
      res.status(400).json({ error: 'Email không hợp lệ.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Mật khẩu phải từ 6 ký tự trở lên.' });
      return;
    }
    const dup = db.prepare('SELECT id FROM social_users WHERE username = ? OR email = ?').get(cleanUser, cleanEmail);
    if (dup) {
      res.status(409).json({ error: 'Username hoặc Email đã được sử dụng.' });
      return;
    }
    const id = uid('u');
    const now = new Date().toISOString();
    const validType = account_type === 'creator' || account_type === 'business' ? account_type : 'personal';
    const pwHash = hashPassword(password);
    db.prepare(
      `INSERT INTO social_users (
        id, username, email, phone, password_hash, display_name, bio, avatar, cover_url,
        account_type, role, is_verified, online_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, 'online', ?, ?)`
    ).run(
      id,
      cleanUser,
      cleanEmail,
      phone,
      pwHash,
      (display_name || cleanUser).trim(),
      'Thành viên mới trên VibeSphere ✨',
      '/src/assets/images/char_sakura_1794880090451.jpg',
      '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      validType,
      now,
      now
    );
    db.prepare('INSERT INTO social_collections (id, user_id, name, is_private, created_at) VALUES (?, ?, ?, 1, ?)').run(
      uid('col'),
      id,
      'Đã lưu',
      now
    );
    const created = db.prepare('SELECT * FROM social_users WHERE id = ?').get(id) as SocialUserRow;
    const { token } = createSessionForUser(id, String(req.body.device_name || 'Phone OS Mobile'), req);
    logSocialAudit(id, 'register', 'user', id);
    res.json({ token, user: sanitizeUser(created) });
  });

  router.post('/auth/login', rateLimit('auth', 20), (req: Request, res: Response) => {
    const { identifier, password, device_name = 'Phone OS Mobile' } = req.body as Record<string, string>;
    const key = (identifier || '').trim().toLowerCase();
    if (!key || !password) {
      res.status(400).json({ error: 'Vui lòng nhập tài khoản và mật khẩu.' });
      return;
    }
    const user = db.prepare('SELECT * FROM social_users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1').get(key, key) as
      | SocialUserRow
      | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác.' });
      return;
    }
    if (user.status === 'banned') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa do vi phạm tiêu chuẩn cộng đồng.' });
      return;
    }
    if (user.status === 'deactivated') {
      db.prepare("UPDATE social_users SET status = 'active', updated_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
      user.status = 'active';
    }
    const { token } = createSessionForUser(user.id, device_name, req);
    logSocialAudit(user.id, 'login', 'user', user.id, { device: device_name });
    res.json({ token, user: sanitizeUser(user) });
  });

  router.post('/auth/logout', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_sessions SET is_active = 0 WHERE id = ?').run(req.socialSessionId);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: sanitizeUser(req.socialUser!) });
  });

  router.post('/auth/change-password', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải từ 6 ký tự trở lên.' });
      return;
    }
    if (!verifyPassword(currentPassword, req.socialUser!.password_hash)) {
      res.status(403).json({ error: 'Mật khẩu hiện tại không đúng.' });
      return;
    }
    db.prepare('UPDATE social_users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      req.socialUser!.id
    );
    logSocialAudit(req.socialUser!.id, 'change_password', 'user', req.socialUser!.id);
    res.json({ ok: true });
  });

  router.post('/auth/forgot-password', rateLimit('auth', 10), (req: Request, res: Response) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id FROM social_users WHERE LOWER(email) = ? LIMIT 1').get(email) as { id: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản khớp với email này.' });
      return;
    }
    const rawCode = String(Math.floor(100000 + Math.random() * 899999));
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    db.prepare(
      'INSERT INTO social_password_resets (id, user_id, reset_code_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(uid('spr'), user.id, hashToken(rawCode), expiresAt, now);
    // Phone OS runs locally without external SMTP server — return simulated local OTP notice honestly
    res.json({
      ok: true,
      localSimulatedOtp: rawCode,
      note: 'Môi trường nội bộ Phone OS không có SMTP; mã khôi phục tạm thời được cấp trực tiếp để kiểm thử.',
    });
  });

  router.post('/auth/reset-password', rateLimit('auth', 10), (req: Request, res: Response) => {
    const { email, code, newPassword } = req.body as { email?: string; code?: string; newPassword?: string };
    if (!email || !code || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ email, mã xác nhận và mật khẩu mới (>= 6 ký tự).' });
      return;
    }
    const user = db.prepare('SELECT id FROM social_users WHERE LOWER(email) = ? LIMIT 1').get(email.trim().toLowerCase()) as
      | { id: string }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }
    const now = new Date().toISOString();
    const reset = db
      .prepare(
        'SELECT id FROM social_password_resets WHERE user_id = ? AND reset_code_hash = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(user.id, hashToken(code.trim()), now) as { id: string } | undefined;
    if (!reset) {
      res.status(400).json({ error: 'Mã khôi phục không đúng hoặc đã hết hạn.' });
      return;
    }
    db.prepare('UPDATE social_password_resets SET used = 1 WHERE id = ?').run(reset.id);
    db.prepare('UPDATE social_users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(newPassword), now, user.id);
    db.prepare('UPDATE social_sessions SET is_active = 0 WHERE user_id = ?').run(user.id);
    res.json({ ok: true });
  });

  router.get('/auth/sessions', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const sessions = db
      .prepare(
        'SELECT id, device_name, ip_address, user_agent, is_active, created_at, last_active_at, expires_at FROM social_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_active_at DESC'
      )
      .all(req.socialUser!.id) as Array<Record<string, unknown>>;
    res.json({
      sessions: sessions.map((s) => ({ ...s, is_current: s.id === req.socialSessionId })),
    });
  });

  router.delete('/auth/sessions/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_sessions SET is_active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.socialUser!.id);
    res.json({ ok: true });
  });

  router.post('/auth/sessions/revoke-others', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_sessions SET is_active = 0 WHERE user_id = ? AND id != ?').run(
      req.socialUser!.id,
      req.socialSessionId
    );
    res.json({ ok: true });
  });

  router.post('/account/deactivate', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare("UPDATE social_users SET status = 'deactivated', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      req.socialUser!.id
    );
    db.prepare('UPDATE social_sessions SET is_active = 0 WHERE user_id = ?').run(req.socialUser!.id);
    logSocialAudit(req.socialUser!.id, 'deactivate_account', 'user', req.socialUser!.id);
    res.json({ ok: true });
  });

  router.delete('/account', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const uidTarget = req.socialUser!.id;
    db.prepare('DELETE FROM social_posts WHERE author_id = ?').run(uidTarget);
    db.prepare('DELETE FROM social_comments WHERE author_id = ?').run(uidTarget);
    db.prepare('DELETE FROM social_stories WHERE author_id = ?').run(uidTarget);
    db.prepare('DELETE FROM social_videos WHERE author_id = ?').run(uidTarget);
    db.prepare('DELETE FROM social_follows WHERE follower_id = ? OR following_id = ?').run(uidTarget, uidTarget);
    db.prepare('DELETE FROM social_friendships WHERE requester_id = ? OR addressee_id = ?').run(uidTarget, uidTarget);
    db.prepare('DELETE FROM social_sessions WHERE user_id = ?').run(uidTarget);
    db.prepare('DELETE FROM social_users WHERE id = ?').run(uidTarget);
    logSocialAudit(uidTarget, 'delete_account', 'user', uidTarget);
    res.json({ ok: true });
  });

  router.get('/account/export', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const u = req.socialUser!.id;
    const payload = {
      exported_at: new Date().toISOString(),
      platform: 'VibeSphere Social Network',
      profile: sanitizeUser(req.socialUser!),
      posts: db.prepare('SELECT * FROM social_posts WHERE author_id = ? ORDER BY created_at DESC').all(u),
      comments: db.prepare('SELECT * FROM social_comments WHERE author_id = ? ORDER BY created_at DESC').all(u),
      stories: db.prepare('SELECT * FROM social_stories WHERE author_id = ? ORDER BY created_at DESC').all(u),
      videos: db.prepare('SELECT * FROM social_videos WHERE author_id = ? ORDER BY created_at DESC').all(u),
      collections: db.prepare('SELECT * FROM social_collections WHERE user_id = ?').all(u),
      saved_items: db.prepare('SELECT * FROM social_saved_items WHERE user_id = ?').all(u),
      follows: db.prepare('SELECT * FROM social_follows WHERE follower_id = ?').all(u),
      friendships: db.prepare('SELECT * FROM social_friendships WHERE requester_id = ? OR addressee_id = ?').all(u, u),
      notifications: db.prepare('SELECT * FROM social_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(u),
      sessions: db.prepare('SELECT id, device_name, created_at, last_active_at FROM social_sessions WHERE user_id = ?').all(u),
    };
    res.json(payload);
  });

  // ==========================================
  // 2. NEWS FEED & POSTS CRUD + REACTIONS + COMMENTS
  // ==========================================
  router.get('/feed', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    publishDueScheduledPosts();
    const viewer = req.socialUser!;
    const filter = String(req.query.filter || 'for_you');
    const hashtag = String(req.query.hashtag || '').trim().toLowerCase();
    const groupId = String(req.query.groupId || '').trim();
    const pageId = String(req.query.pageId || '').trim();
    const authorId = String(req.query.authorId || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const hiddenSet = new Set(
      (db.prepare('SELECT post_id FROM social_hidden_posts WHERE user_id = ?').all(viewer.id) as Array<{ post_id: string }>).map(
        (r) => r.post_id
      )
    );

    let rows: Array<Record<string, unknown>>;
    if (filter === 'drafts') {
      rows = db
        .prepare("SELECT * FROM social_posts WHERE author_id = ? AND status = 'draft' ORDER BY updated_at DESC")
        .all(viewer.id) as Array<Record<string, unknown>>;
    } else if (filter === 'scheduled') {
      rows = db
        .prepare("SELECT * FROM social_posts WHERE author_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC")
        .all(viewer.id) as Array<Record<string, unknown>>;
    } else if (filter === 'saved') {
      rows = db
        .prepare(
          `SELECT p.* FROM social_posts p
           LEFT JOIN social_saved_items s ON s.target_id = p.id AND s.target_type = 'post' AND s.user_id = ?
           WHERE (s.id IS NOT NULL OR (p.is_saved = 1 AND ? = 'user_1')) AND COALESCE(p.status, 'published') = 'published'
           ORDER BY COALESCE(s.created_at, p.created_at) DESC`
        )
        .all(viewer.id, viewer.id) as Array<Record<string, unknown>>;
    } else {
      rows = db
        .prepare("SELECT * FROM social_posts WHERE COALESCE(status, 'published') = 'published' ORDER BY is_pinned DESC, created_at DESC")
        .all() as Array<Record<string, unknown>>;
    }

    const filtered = rows.filter((p) => {
      const pid = String(p.id);
      const pAuthor = String(p.author_id);
      if (hiddenSet.has(pid)) return false;
      if (filter !== 'drafts' && filter !== 'scheduled') {
        if (isMutedBy(viewer.id, pAuthor) && !authorId) return false;
        if (!canViewUserContent(viewer.id, pAuthor, String(p.privacy || 'public'))) return false;
      }
      if (authorId && pAuthor !== authorId) return false;
      if (groupId && String(p.group_id || '') !== groupId) return false;
      if (pageId && String(p.page_id || '') !== pageId) return false;
      if (filter === 'following' && pAuthor !== viewer.id && !isFollowing(viewer.id, pAuthor)) return false;
      if (filter === 'friends' && pAuthor !== viewer.id && !isFriends(viewer.id, pAuthor)) return false;
      if (hashtag) {
        const textMatch = String(p.content || '').toLowerCase().includes(hashtag);
        const tagMatch = String(p.hashtags_json || '').toLowerCase().includes(hashtag);
        if (!textMatch && !tagMatch) return false;
      }
      return true;
    });

    if (filter === 'for_you') {
      const interests = safeJson<string[]>(viewer.interests_json, []);
      filtered.sort((a, b) => {
        const score = (item: Record<string, unknown>) => {
          const eng = Number(item.likes_count || 0) * 2 + Number(item.comments_count || 0) * 3 + Number(item.shares_count || 0) * 4;
          const ageH = Math.max(1, (Date.now() - new Date(String(item.created_at)).getTime()) / 3600_000);
          const followBoost = isFollowing(viewer.id, String(item.author_id)) ? 18 : 0;
          const interestBoost = interests.some((kw) => String(item.content || '').toLowerCase().includes(kw)) ? 10 : 0;
          return (eng + followBoost + interestBoost) / Math.pow(ageH + 2, 0.7);
        };
        return score(b) - score(a);
      });
    }

    const slice = filtered.slice(offset, offset + limit).map((r) => hydratePost(r, viewer.id));
    res.json({
      posts: slice,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    });
  });

  router.get('/posts/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const raw = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!raw || String(raw.status) === 'removed') {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    const viewer = req.socialUser!;
    const pAuthor = String(raw.author_id);
    if (String(raw.status) !== 'published' && pAuthor !== viewer.id) {
      res.status(403).json({ error: 'Bạn không có quyền xem bản nháp này.' });
      return;
    }
    if (!canViewUserContent(viewer.id, pAuthor, String(raw.privacy || 'public'))) {
      res.status(403).json({ error: 'Bài viết ở chế độ riêng tư hoặc bạn không có quyền truy cập.' });
      return;
    }
    db.prepare('UPDATE social_posts SET views_count = views_count + 1 WHERE id = ?').run(req.params.id);
    res.json({
      post: hydratePost(raw, viewer.id),
      comments: hydrateCommentsForTarget('post_id', String(raw.id), viewer.id, pAuthor),
    });
  });

  router.post('/posts', requireSocialAuth, rateLimit('post', 20), (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const {
      content = '',
      media_items = [],
      cover_url = '',
      hashtags = [],
      mentions = [],
      location_name = '',
      link_url = '',
      link_title = '',
      shared_post_id = '',
      group_id = '',
      page_id = '',
      privacy = 'public',
      comment_policy = 'everyone',
      is_draft = false,
      scheduled_at = '',
      bg_style = '',
      feeling = '',
      poll = null,
    } = req.body as Record<string, unknown>;

    const text = String(content).trim();
    const mediaList = Array.isArray(media_items) ? (media_items as Array<{ url: string; type: string; coverUrl?: string }>) : [];
    const pollInput = poll && typeof poll === 'object' ? (poll as { question?: string; options?: string[] }) : null;
    const validPollOpts = Array.isArray(pollInput?.options)
      ? pollInput!.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
      : [];
    const hasPoll = validPollOpts.length >= 2;

    if (!text && mediaList.length === 0 && !shared_post_id && !link_url && !hasPoll) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung hoặc đính kèm ảnh/video.' });
      return;
    }
    const unsafe = hasUnsafeContent(`${text} ${String(link_url)}`);
    if (unsafe) {
      res.status(400).json({ error: unsafe });
      return;
    }

    // Duplicate spam guard (15s)
    const dup = db
      .prepare("SELECT id FROM social_posts WHERE author_id = ? AND content = ? AND created_at > ? LIMIT 1")
      .get(user.id, text, new Date(Date.now() - 15_000).toISOString());
    if (dup && text.length > 0 && !is_draft && !hasPoll) {
      res.status(429).json({ error: 'Bạn vừa đăng nội dung tương tự, vui lòng đợi vài giây.' });
      return;
    }

    // Verify group membership if posting into group
    if (group_id) {
      const mem = db
        .prepare("SELECT status FROM social_group_members WHERE group_id = ? AND user_id = ? AND status = 'approved'")
        .get(String(group_id), user.id);
      if (!mem) {
        res.status(403).json({ error: 'Bạn cần tham gia và được duyệt vào nhóm trước khi đăng bài.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const id = uid('post');
    const postType = hasPoll
      ? 'poll'
      : shared_post_id
        ? 'share'
        : link_url
          ? 'link'
          : mediaList.length > 1
            ? 'album'
            : mediaList[0]?.type === 'video'
              ? 'video'
              : mediaList.length === 1
                ? 'image'
                : 'text';
    const firstMedia = mediaList[0];
    const autoTags = Array.from(new Set([...(Array.isArray(hashtags) ? hashtags.map(String) : []), ...(text.match(/#[\p{L}\p{N}_]+/gu) || [])]));
    const autoMentions = Array.from(
      new Set([...(Array.isArray(mentions) ? mentions.map(String) : []), ...(text.match(/@[a-zA-Z0-9._]+/g) || []).map((m) => m.slice(1))])
    );
    const pollJson = hasPoll
      ? JSON.stringify({
          question: String(pollInput?.question || text || 'Bình chọn ý kiến').trim(),
          options: validPollOpts.map((label, idx) => ({ id: `opt_${idx + 1}`, label, votes: 0 })),
        })
      : '';

    const status = is_draft ? 'draft' : scheduled_at ? 'scheduled' : 'published';
    const validPrivacy = ['public', 'friends', 'followers', 'private'].includes(String(privacy)) ? String(privacy) : 'public';
    const validCommentPolicy = ['everyone', 'friends', 'off'].includes(String(comment_policy)) ? String(comment_policy) : 'everyone';

    db.prepare(
      `INSERT INTO social_posts (
        id, author_type, author_id, author_name, author_avatar, content, post_type,
        media_url, media_type, media_json, cover_url, hashtags_json, mentions_json,
        location_name, link_url, link_title, shared_post_id, group_id, page_id,
        bg_style, feeling, poll_json,
        privacy, comment_policy, is_draft, scheduled_at, status, created_at, updated_at
      ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      user.display_name,
      user.avatar,
      text,
      postType,
      firstMedia?.url || '',
      firstMedia?.type || '',
      JSON.stringify(mediaList),
      String(cover_url || firstMedia?.coverUrl || firstMedia?.url || ''),
      JSON.stringify(autoTags),
      JSON.stringify(autoMentions),
      String(location_name),
      String(link_url),
      String(link_title),
      String(shared_post_id),
      String(group_id),
      String(page_id),
      String(bg_style || ''),
      String(feeling || ''),
      pollJson,
      validPrivacy,
      validCommentPolicy,
      is_draft ? 1 : 0,
      String(scheduled_at),
      status,
      now,
      now
    );

    // Notify mentioned users
    if (status === 'published') {
      for (const mUsername of autoMentions) {
        const target = db.prepare('SELECT id FROM social_users WHERE LOWER(username) = ?').get(mUsername.toLowerCase()) as
          | { id: string }
          | undefined;
        if (target) {
          pushSocialNotification({
            userId: target.id,
            actor: user,
            type: 'mention',
            title: 'Bạn được nhắc tới',
            body: `${user.display_name} đã nhắc tới bạn trong một bài viết.`,
            targetType: 'post',
            targetId: id,
          });
        }
      }
      if (shared_post_id) {
        const orig = db.prepare('SELECT author_id FROM social_posts WHERE id = ?').get(String(shared_post_id)) as
          | { author_id: string }
          | undefined;
        if (orig) {
          db.prepare('UPDATE social_posts SET shares_count = shares_count + 1 WHERE id = ?').run(String(shared_post_id));
          pushSocialNotification({
            userId: orig.author_id,
            actor: user,
            type: 'share',
            title: 'Bài viết được chia sẻ',
            body: `${user.display_name} đã chia sẻ bài viết của bạn.`,
            targetType: 'post',
            targetId: id,
          });
        }
      }
      if (validPrivacy === 'public') {
        broadcastSocialEvent('feed:post_new', { postId: id, authorId: user.id });
      }
      if (user.id === 'user_1' && validPrivacy !== 'private') {
        setTimeout(() => {
          void triggerContextualAiMentionOrReaction(db, {
            postId: id,
            content: text || String(pollInput?.question || ''),
            mentions: autoMentions,
            authorId: user.id,
          });
        }, 1200);
      }
    }

    const row = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ post: hydratePost(row, user.id) });
  });

  router.post('/posts/:id/poll-vote', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const optionId = String(req.body.option_id || '').trim();
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!post) {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    if (!optionId) {
      res.status(400).json({ error: 'Thiếu lựa chọn bình chọn.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, option_id FROM social_poll_votes WHERE post_id = ? AND user_id = ?')
      .get(req.params.id, user.id) as { id: string; option_id: string } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      db.prepare('UPDATE social_poll_votes SET option_id = ?, created_at = ? WHERE id = ?').run(optionId, now, existing.id);
    } else {
      db.prepare('INSERT INTO social_poll_votes (id, post_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('pv'),
        req.params.id,
        user.id,
        optionId,
        now
      );
    }
    const updated = hydratePost(post, user.id);
    broadcastSocialEvent('feed:reaction', { postId: req.params.id });
    res.json({ post: updated });
  });

  router.patch('/posts/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const raw = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!raw) {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    if (String(raw.author_id) !== user.id && user.role !== 'admin') {
      res.status(403).json({ error: 'Bạn chỉ có thể chỉnh sửa bài viết của mình.' });
      return;
    }
    const { content, privacy, comment_policy, is_pinned, status, location_name, hashtags } = req.body as Record<string, unknown>;
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [new Date().toISOString()];
    if (content !== undefined) {
      const unsafe = hasUnsafeContent(String(content));
      if (unsafe) {
        res.status(400).json({ error: unsafe });
        return;
      }
      sets.push('content = ?');
      vals.push(String(content));
    }
    if (privacy !== undefined && ['public', 'friends', 'followers', 'private'].includes(String(privacy))) {
      sets.push('privacy = ?');
      vals.push(String(privacy));
    }
    if (comment_policy !== undefined && ['everyone', 'friends', 'off'].includes(String(comment_policy))) {
      sets.push('comment_policy = ?');
      vals.push(String(comment_policy));
    }
    if (is_pinned !== undefined) {
      sets.push('is_pinned = ?');
      vals.push(is_pinned ? 1 : 0);
    }
    if (status !== undefined && ['published', 'draft'].includes(String(status))) {
      sets.push('status = ?, is_draft = ?');
      vals.push(String(status), status === 'draft' ? 1 : 0);
    }
    if (location_name !== undefined) {
      sets.push('location_name = ?');
      vals.push(String(location_name));
    }
    if (Array.isArray(hashtags)) {
      sets.push('hashtags_json = ?');
      vals.push(JSON.stringify(hashtags.map(String)));
    }
    vals.push(req.params.id);
    db.prepare(`UPDATE social_posts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    const updated = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json({ post: hydratePost(updated, user.id) });
  });

  router.delete('/posts/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const raw = db.prepare('SELECT author_id, group_id FROM social_posts WHERE id = ?').get(req.params.id) as
      | { author_id: string; group_id: string }
      | undefined;
    if (!raw) {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    let canDel = raw.author_id === user.id || user.role === 'admin' || user.role === 'moderator';
    if (!canDel && raw.group_id) {
      const gm = db
        .prepare("SELECT role FROM social_group_members WHERE group_id = ? AND user_id = ? AND status = 'approved'")
        .get(raw.group_id, user.id) as { role: string } | undefined;
      if (gm && (gm.role === 'admin' || gm.role === 'moderator')) canDel = true;
    }
    if (!canDel) {
      res.status(403).json({ error: 'Bạn không có quyền xóa bài viết này.' });
      return;
    }
    db.prepare('DELETE FROM social_comments WHERE post_id = ?').run(req.params.id);
    db.prepare("DELETE FROM social_reactions WHERE target_type = 'post' AND target_id = ?").run(req.params.id);
    db.prepare("DELETE FROM social_saved_items WHERE target_type = 'post' AND target_id = ?").run(req.params.id);
    db.prepare('DELETE FROM social_posts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/posts/:id/react', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const reactionType = String(req.body.reaction_type || 'like');
    if (!['like', 'love', 'haha', 'wow', 'sad', 'angry'].includes(reactionType)) {
      res.status(400).json({ error: 'Loại cảm xúc không hợp lệ.' });
      return;
    }
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!post) {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    if (!canViewUserContent(user.id, String(post.author_id), String(post.privacy || 'public'))) {
      res.status(403).json({ error: 'Không có quyền tương tác với bài viết này.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, reaction_type FROM social_reactions WHERE target_type = ? AND target_id = ? AND user_id = ?')
      .get('post', req.params.id, user.id) as { id: string; reaction_type: string } | undefined;

    if (existing && existing.reaction_type === reactionType) {
      db.prepare('DELETE FROM social_reactions WHERE id = ?').run(existing.id);
      db.prepare('UPDATE social_posts SET likes_count = MAX(0, likes_count - 1), is_liked = 0 WHERE id = ?').run(req.params.id);
    } else if (existing) {
      db.prepare('UPDATE social_reactions SET reaction_type = ?, created_at = ? WHERE id = ?').run(
        reactionType,
        new Date().toISOString(),
        existing.id
      );
    } else {
      db.prepare('INSERT INTO social_reactions (id, target_type, target_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        uid('srx'),
        'post',
        req.params.id,
        user.id,
        reactionType,
        new Date().toISOString()
      );
      db.prepare('UPDATE social_posts SET likes_count = likes_count + 1, is_liked = 1 WHERE id = ?').run(req.params.id);
      pushSocialNotification({
        userId: String(post.author_id),
        actor: user,
        type: 'reaction',
        title: 'Tương tác mới',
        body: `${user.display_name} đã thả cảm xúc vào bài viết của bạn.`,
        targetType: 'post',
        targetId: req.params.id,
      });
    }
    const updated = hydratePost(db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as Record<string, unknown>, user.id);
    broadcastSocialEvent('feed:reaction', { postId: req.params.id, total_reactions: updated.total_reactions });
    res.json({ post: updated });
  });

  router.post('/posts/:id/hide', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('INSERT OR IGNORE INTO social_hidden_posts (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid('hp'),
      req.socialUser!.id,
      req.params.id,
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  router.post('/posts/:id/save', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const targetType = req.body.target_type === 'video' ? 'video' : 'post';
    const collectionId = String(req.body.collection_id || '');
    const existing = db
      .prepare('SELECT id FROM social_saved_items WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(user.id, targetType, req.params.id) as { id: string } | undefined;

    if (existing && !collectionId) {
      db.prepare('DELETE FROM social_saved_items WHERE id = ?').run(existing.id);
      if (targetType === 'post') db.prepare('UPDATE social_posts SET is_saved = 0 WHERE id = ?').run(req.params.id);
      if (targetType === 'video') db.prepare('UPDATE social_videos SET saves_count = MAX(0, saves_count - 1) WHERE id = ?').run(req.params.id);
      res.json({ saved: false });
      return;
    }
    if (existing && collectionId) {
      db.prepare('UPDATE social_saved_items SET collection_id = ? WHERE id = ?').run(collectionId, existing.id);
      res.json({ saved: true, collection_id: collectionId });
      return;
    }
    db.prepare('INSERT INTO social_saved_items (id, user_id, collection_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uid('sav'),
      user.id,
      collectionId,
      targetType,
      req.params.id,
      new Date().toISOString()
    );
    if (targetType === 'post') db.prepare('UPDATE social_posts SET is_saved = 1 WHERE id = ?').run(req.params.id);
    if (targetType === 'video') db.prepare('UPDATE social_videos SET saves_count = saves_count + 1 WHERE id = ?').run(req.params.id);
    res.json({ saved: true, collection_id: collectionId });
  });

  // Comments (Posts & Videos, Nested Replies)
  router.get('/posts/:id/comments', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const post = db.prepare('SELECT author_id, privacy FROM social_posts WHERE id = ?').get(req.params.id) as
      | { author_id: string; privacy: string }
      | undefined;
    if (!post) {
      res.status(404).json({ error: 'Không tìm thấy bài viết.' });
      return;
    }
    if (!canViewUserContent(req.socialUser!.id, post.author_id, post.privacy)) {
      res.status(403).json({ error: 'Không có quyền xem bình luận.' });
      return;
    }
    res.json({ comments: hydrateCommentsForTarget('post_id', req.params.id, req.socialUser!.id, post.author_id) });
  });

  router.post('/comments', requireSocialAuth, rateLimit('comment', 30), (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const { post_id = '', video_id = '', parent_id = '', content = '', media_url = '' } = req.body as Record<string, string>;
    const text = content.trim();
    if (!text && !media_url) {
      res.status(400).json({ error: 'Nội dung bình luận không được trống.' });
      return;
    }
    const unsafe = hasUnsafeContent(text);
    if (unsafe) {
      res.status(400).json({ error: unsafe });
      return;
    }
    if (!post_id && !video_id) {
      res.status(400).json({ error: 'Thiếu post_id hoặc video_id.' });
      return;
    }

    let ownerId = '';
    if (post_id) {
      const post = db.prepare('SELECT author_id, privacy, comment_policy FROM social_posts WHERE id = ?').get(post_id) as
        | { author_id: string; privacy: string; comment_policy: string }
        | undefined;
      if (!post) {
        res.status(404).json({ error: 'Bài viết không tồn tại.' });
        return;
      }
      if (!canViewUserContent(user.id, post.author_id, post.privacy)) {
        res.status(403).json({ error: 'Không có quyền bình luận bài viết này.' });
        return;
      }
      if (post.comment_policy === 'off' && post.author_id !== user.id) {
        res.status(403).json({ error: 'Tác giả đã tắt bình luận cho bài viết này.' });
        return;
      }
      if (post.comment_policy === 'friends' && !isFriends(user.id, post.author_id)) {
        res.status(403).json({ error: 'Chỉ bạn bè mới được bình luận bài viết này.' });
        return;
      }
      ownerId = post.author_id;
    } else {
      const vid = db.prepare('SELECT author_id, privacy, allow_comments FROM social_videos WHERE id = ?').get(video_id) as
        | { author_id: string; privacy: string; allow_comments: number }
        | undefined;
      if (!vid) {
        res.status(404).json({ error: 'Video không tồn tại.' });
        return;
      }
      if (!canViewUserContent(user.id, vid.author_id, vid.privacy) || !vid.allow_comments) {
        res.status(403).json({ error: 'Không thể bình luận video này.' });
        return;
      }
      ownerId = vid.author_id;
    }

    const id = uid('cmt');
    const now = new Date().toISOString();
    const hiddenFlag = isRestrictedBy(ownerId, user.id) ? 1 : 0;
    db.prepare(
      `INSERT INTO social_comments (id, post_id, video_id, parent_id, author_id, author_name, author_avatar, content, media_url, is_hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, post_id, video_id, parent_id, user.id, user.display_name, user.avatar, text, media_url, hiddenFlag, now, now);

    if (post_id && !hiddenFlag) {
      db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(post_id);
    }
    if (video_id && !hiddenFlag) {
      db.prepare('UPDATE social_videos SET comments_count = comments_count + 1 WHERE id = ?').run(video_id);
    }

    if (!hiddenFlag) {
      if (parent_id) {
        const parent = db.prepare('SELECT author_id FROM social_comments WHERE id = ?').get(parent_id) as { author_id: string } | undefined;
        if (parent) {
          pushSocialNotification({
            userId: parent.author_id,
            actor: user,
            type: 'reply',
            title: 'Phản hồi bình luận',
            body: `${user.display_name} đã trả lời: "${text.slice(0, 60)}"`,
            targetType: post_id ? 'post' : 'video',
            targetId: post_id || video_id,
          });
        }
      } else {
        pushSocialNotification({
          userId: ownerId,
          actor: user,
          type: 'comment',
          title: 'Bình luận mới',
          body: `${user.display_name} đã bình luận: "${text.slice(0, 60)}"`,
          targetType: post_id ? 'post' : 'video',
          targetId: post_id || video_id,
        });
      }
    }

    const created = db.prepare('SELECT * FROM social_comments WHERE id = ?').get(id) as Record<string, unknown>;
    broadcastSocialEvent('feed:comment', { postId: post_id, videoId: video_id, commentId: id });
    res.json({ comment: { ...created, author_username: user.username, author_verified: user.is_verified, my_reaction: null } });
  });

  router.patch('/comments/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const cmt = db.prepare('SELECT * FROM social_comments WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!cmt) {
      res.status(404).json({ error: 'Không tìm thấy bình luận.' });
      return;
    }
    const postOwner = cmt.post_id
      ? (db.prepare('SELECT author_id FROM social_posts WHERE id = ?').get(String(cmt.post_id)) as { author_id: string } | undefined)?.author_id
      : '';
    const isCommentAuthor = String(cmt.author_id) === user.id;
    const isOwnerOrMod = user.id === postOwner || user.role === 'admin' || user.role === 'moderator';

    if (req.body.content !== undefined) {
      if (!isCommentAuthor) {
        res.status(403).json({ error: 'Chỉ tác giả mới được sửa bình luận.' });
        return;
      }
      db.prepare('UPDATE social_comments SET content = ?, updated_at = ? WHERE id = ?').run(
        String(req.body.content).trim(),
        new Date().toISOString(),
        req.params.id
      );
    }
    if (req.body.is_pinned !== undefined) {
      if (!isOwnerOrMod) {
        res.status(403).json({ error: 'Chỉ chủ bài viết mới được ghim bình luận.' });
        return;
      }
      db.prepare('UPDATE social_comments SET is_pinned = ? WHERE id = ?').run(req.body.is_pinned ? 1 : 0, req.params.id);
    }
    if (req.body.is_hidden !== undefined) {
      if (!isOwnerOrMod) {
        res.status(403).json({ error: 'Không có quyền ẩn bình luận này.' });
        return;
      }
      db.prepare('UPDATE social_comments SET is_hidden = ? WHERE id = ?').run(req.body.is_hidden ? 1 : 0, req.params.id);
    }
    if (req.body.toggleLike) {
      const existing = db
        .prepare("SELECT id FROM social_reactions WHERE target_type = 'comment' AND target_id = ? AND user_id = ?")
        .get(req.params.id, user.id) as { id: string } | undefined;
      if (existing) {
        db.prepare('DELETE FROM social_reactions WHERE id = ?').run(existing.id);
        db.prepare('UPDATE social_comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(req.params.id);
      } else {
        db.prepare("INSERT INTO social_reactions (id, target_type, target_id, user_id, reaction_type, created_at) VALUES (?, 'comment', ?, ?, 'like', ?)").run(
          uid('srx'),
          req.params.id,
          user.id,
          new Date().toISOString()
        );
        db.prepare('UPDATE social_comments SET likes_count = likes_count + 1 WHERE id = ?').run(req.params.id);
      }
    }
    res.json({ comment: db.prepare('SELECT * FROM social_comments WHERE id = ?').get(req.params.id) });
  });

  router.delete('/comments/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const cmt = db.prepare('SELECT post_id, video_id, author_id FROM social_comments WHERE id = ?').get(req.params.id) as
      | { post_id: string; video_id: string; author_id: string }
      | undefined;
    if (!cmt) {
      res.status(404).json({ error: 'Không tìm thấy bình luận.' });
      return;
    }
    const postOwner = cmt.post_id
      ? (db.prepare('SELECT author_id FROM social_posts WHERE id = ?').get(cmt.post_id) as { author_id: string } | undefined)?.author_id
      : '';
    if (cmt.author_id !== user.id && postOwner !== user.id && user.role !== 'admin') {
      res.status(403).json({ error: 'Không có quyền xóa bình luận này.' });
      return;
    }
    db.prepare('DELETE FROM social_comments WHERE id = ? OR parent_id = ?').run(req.params.id, req.params.id);
    if (cmt.post_id) {
      const cnt = (db.prepare("SELECT COUNT(*) as c FROM social_comments WHERE post_id = ? AND COALESCE(is_hidden, 0) = 0").get(cmt.post_id) as { c: number }).c;
      db.prepare('UPDATE social_posts SET comments_count = ? WHERE id = ?').run(cnt, cmt.post_id);
    }
    if (cmt.video_id) {
      const cnt = (db.prepare("SELECT COUNT(*) as c FROM social_comments WHERE video_id = ? AND COALESCE(is_hidden, 0) = 0").get(cmt.video_id) as { c: number }).c;
      db.prepare('UPDATE social_videos SET comments_count = ? WHERE id = ?').run(cnt, cmt.video_id);
    }
    res.json({ ok: true });
  });

  // ==========================================
  // 3. SAVED COLLECTIONS
  // ==========================================
  router.get('/collections', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const cols = db.prepare('SELECT * FROM social_collections WHERE user_id = ? ORDER BY created_at DESC').all(req.socialUser!.id);
    const items = db.prepare('SELECT * FROM social_saved_items WHERE user_id = ? ORDER BY created_at DESC').all(req.socialUser!.id);
    res.json({ collections: cols, savedItems: items });
  });

  router.post('/collections', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Tên bộ sưu tập không được trống.' });
      return;
    }
    const id = uid('col');
    db.prepare('INSERT INTO social_collections (id, user_id, name, is_private, created_at) VALUES (?, ?, ?, 1, ?)').run(
      id,
      req.socialUser!.id,
      name,
      new Date().toISOString()
    );
    res.json({ collection: db.prepare('SELECT * FROM social_collections WHERE id = ?').get(id) });
  });

  router.delete('/collections/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare("UPDATE social_saved_items SET collection_id = '' WHERE collection_id = ? AND user_id = ?").run(
      req.params.id,
      req.socialUser!.id
    );
    db.prepare('DELETE FROM social_collections WHERE id = ? AND user_id = ?').run(req.params.id, req.socialUser!.id);
    res.json({ ok: true });
  });

  // ==========================================
  // 4. STORIES & HIGHLIGHTS (24H + VIEWERS)
  // ==========================================
  router.get('/stories', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const now = new Date().toISOString();
    const includeArchived = req.query.archived === '1';

    const all = db.prepare('SELECT * FROM social_stories ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    const active: Array<Record<string, unknown>> = [];
    const archive: Array<Record<string, unknown>> = [];

    for (const st of all) {
      const aId = String(st.author_id);
      if (!canViewUserContent(viewer.id, aId, String(st.privacy || 'public'))) continue;
      const expired = Boolean(st.expires_at && String(st.expires_at) <= now);
      const viewerRow = db
        .prepare('SELECT id, reaction FROM social_story_views WHERE story_id = ? AND viewer_id = ?')
        .get(String(st.id), viewer.id) as { id: string; reaction: string } | undefined;
      const viewsList =
        aId === viewer.id
          ? db.prepare('SELECT * FROM social_story_views WHERE story_id = ? ORDER BY viewed_at DESC').all(String(st.id))
          : [];
      const stAuthor = db.prepare('SELECT display_name, avatar FROM social_users WHERE id = ?').get(aId) as
        | { display_name: string; avatar: string }
        | undefined;
      const hydrated = {
        ...st,
        author_name: stAuthor ? stAuthor.display_name.split(' ')[0] || stAuthor.display_name : String(st.author_name || ''),
        author_avatar: stAuthor?.avatar || String(st.author_avatar || ''),
        overlays: safeJson(String(st.overlays_json || '[]'), []),
        mentions: safeJson(String(st.mentions_json || '[]'), []),
        hashtags: safeJson(String(st.hashtags_json || '[]'), []),
        viewed: Boolean(viewerRow) || Number(st.viewed) === 1,
        my_reaction: viewerRow?.reaction || '',
        viewers: viewsList,
      };
      if (expired || Number(st.is_archived) === 1) {
        if (aId === viewer.id && includeArchived) archive.push(hydrated);
      } else {
        active.push(hydrated);
      }
    }

    const highlights = db
      .prepare('SELECT * FROM social_highlights ORDER BY created_at DESC')
      .all()
      .filter((h) => canViewUserContent(viewer.id, String((h as Record<string, unknown>).user_id), 'public'));

    res.json({ stories: active, archive, highlights });
  });

  router.post('/stories', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const {
      media_url,
      media_type = 'image',
      caption = '',
      overlays = [],
      audio_title = '',
      mentions = [],
      hashtags = [],
      privacy = 'public',
    } = req.body as Record<string, unknown>;
    if (!media_url) {
      res.status(400).json({ error: 'Vui lòng chọn ảnh hoặc video cho Story.' });
      return;
    }
    const id = uid('st');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO social_stories (
        id, author_id, author_name, author_avatar, media_url, media_type, caption,
        overlays_json, audio_title, mentions_json, hashtags_json, privacy, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      user.display_name.split(' ')[0] || user.display_name,
      user.avatar,
      String(media_url),
      media_type === 'video' ? 'video' : 'image',
      String(caption),
      JSON.stringify(Array.isArray(overlays) ? overlays : []),
      String(audio_title),
      JSON.stringify(Array.isArray(mentions) ? mentions : []),
      JSON.stringify(Array.isArray(hashtags) ? hashtags : []),
      ['public', 'friends', 'followers', 'private'].includes(String(privacy)) ? String(privacy) : 'public',
      expiresAt,
      now
    );
    res.json({ story: db.prepare('SELECT * FROM social_stories WHERE id = ?').get(id) });
  });

  router.post('/stories/:id/view', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const st = db.prepare('SELECT author_id, privacy FROM social_stories WHERE id = ?').get(req.params.id) as
      | { author_id: string; privacy: string }
      | undefined;
    if (!st) {
      res.status(404).json({ error: 'Story không tồn tại.' });
      return;
    }
    if (!canViewUserContent(user.id, st.author_id, st.privacy)) {
      res.status(403).json({ error: 'Không có quyền xem Story này.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM social_story_views WHERE story_id = ? AND viewer_id = ?')
      .get(req.params.id, user.id) as { id: string } | undefined;
    if (!existing) {
      db.prepare(
        'INSERT INTO social_story_views (id, story_id, viewer_id, viewer_name, viewer_avatar, reaction, viewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid('svw'), req.params.id, user.id, user.display_name, user.avatar, String(req.body.reaction || ''), new Date().toISOString());
      db.prepare('UPDATE social_stories SET views_count = views_count + 1, viewed = 1 WHERE id = ?').run(req.params.id);
    } else if (req.body.reaction) {
      db.prepare('UPDATE social_story_views SET reaction = ? WHERE id = ?').run(String(req.body.reaction), existing.id);
    }
    res.json({ ok: true });
  });

  router.post('/highlights', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const { title, cover_url, story_id } = req.body as { title?: string; cover_url?: string; story_id?: string };
    const id = uid('hl');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO social_highlights (id, user_id, title, cover_url, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.socialUser!.id,
      (title || 'Tin nổi bật').trim(),
      cover_url || req.socialUser!.avatar,
      now
    );
    if (story_id) {
      db.prepare('UPDATE social_stories SET highlight_id = ?, is_archived = 1 WHERE id = ? AND author_id = ?').run(
        id,
        story_id,
        req.socialUser!.id
      );
    }
    res.json({ highlight: db.prepare('SELECT * FROM social_highlights WHERE id = ?').get(id) });
  });

  // ==========================================
  // 5. SHORT VIDEO / REELS & RECOMMENDATION ENGINE
  // ==========================================
  router.get('/videos', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const rows = db.prepare("SELECT * FROM social_videos WHERE status = 'published' ORDER BY created_at DESC").all() as Array<
      Record<string, unknown>
    >;
    const interests = safeJson<string[]>(viewer.interests_json, []);
    const skipRows = db
      .prepare('SELECT video_id, skipped, completed, liked FROM social_video_watch_logs WHERE user_id = ?')
      .all(viewer.id) as Array<{ video_id: string; skipped: number; completed: number; liked: number }>;
    const logMap = new Map(skipRows.map((r) => [r.video_id, r]));

    const visible = rows
      .filter((v) => !isMutedBy(viewer.id, String(v.author_id)) && canViewUserContent(viewer.id, String(v.author_id), String(v.privacy || 'public')))
      .map((v) => {
        const vid = String(v.id);
        const myRx = db
          .prepare("SELECT reaction_type FROM social_reactions WHERE target_type = 'video' AND target_id = ? AND user_id = ?")
          .get(vid, viewer.id) as { reaction_type: string } | undefined;
        const mySave = db
          .prepare("SELECT 1 FROM social_saved_items WHERE user_id = ? AND target_type = 'video' AND target_id = ?")
          .get(viewer.id, vid);
        const author = db.prepare('SELECT username, display_name, avatar, is_verified FROM social_users WHERE id = ?').get(String(v.author_id)) as
          | { username: string; display_name: string; avatar: string; is_verified: number }
          | undefined;
        const w = logMap.get(vid);
        const interestBonus = interests.includes(String(v.category)) ? 45 : 0;
        const followBonus = isFollowing(viewer.id, String(v.author_id)) ? 30 : 0;
        const skipPenalty = w?.skipped ? -60 : 0;
        const recScore =
          Number(v.likes_count || 0) * 1.5 + Number(v.views_count || 0) * 0.05 + interestBonus + followBonus + skipPenalty;
        return {
          ...v,
          author_name: author?.display_name || String(v.author_name || ''),
          author_avatar: author?.avatar || String(v.author_avatar || ''),
          hashtags: safeJson<string[]>(String(v.hashtags_json || '[]'), []),
          author_username: author?.username || String(v.author_id),
          author_verified: author?.is_verified || 0,
          is_liked: Boolean(myRx),
          is_saved: Boolean(mySave),
          is_following: isFollowing(viewer.id, String(v.author_id)),
          _score: recScore,
        };
      })
      .sort((a, b) => b._score - a._score);

    res.json({ videos: visible });
  });

  router.post('/videos', requireSocialAuth, rateLimit('post', 15), (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const {
      title,
      description = '',
      video_url = '',
      cover_url,
      duration_sec = 18,
      trim_start_sec = 0,
      trim_end_sec = 18,
      audio_title = 'Âm thanh gốc · VibeSphere',
      hashtags = [],
      category = 'lifestyle',
      privacy = 'public',
      allow_comments = true,
    } = req.body as Record<string, unknown>;
    if (!title || !cover_url) {
      res.status(400).json({ error: 'Video cần có tiêu đề và ảnh bìa.' });
      return;
    }
    const id = uid('vid');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO social_videos (
        id, author_id, author_name, author_avatar, title, description, video_url, cover_url,
        duration_sec, trim_start_sec, trim_end_sec, audio_title, hashtags_json, category,
        privacy, allow_comments, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      user.display_name,
      user.avatar,
      String(title).trim(),
      String(description).trim(),
      String(video_url),
      String(cover_url),
      Number(duration_sec) || 18,
      Number(trim_start_sec) || 0,
      Number(trim_end_sec) || 18,
      String(audio_title),
      JSON.stringify(Array.isArray(hashtags) ? hashtags : []),
      String(category),
      ['public', 'friends', 'followers', 'private'].includes(String(privacy)) ? String(privacy) : 'public',
      allow_comments ? 1 : 0,
      now
    );
    res.json({ video: db.prepare('SELECT * FROM social_videos WHERE id = ?').get(id) });
  });

  router.post('/videos/:id/watch', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const { watch_ms = 0, completed = false, skipped = false } = req.body as {
      watch_ms?: number;
      completed?: boolean;
      skipped?: boolean;
    };
    const vid = db.prepare('SELECT id, category FROM social_videos WHERE id = ?').get(req.params.id) as
      | { id: string; category: string }
      | undefined;
    if (!vid) {
      res.status(404).json({ error: 'Video không tồn tại.' });
      return;
    }
    db.prepare('UPDATE social_videos SET views_count = views_count + 1 WHERE id = ?').run(req.params.id);
    db.prepare(
      'INSERT INTO social_video_watch_logs (id, video_id, user_id, watch_ms, completed, skipped, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uid('vwl'), req.params.id, req.socialUser!.id, Number(watch_ms) || 0, completed ? 1 : 0, skipped ? 1 : 0, new Date().toISOString());

    // Learn interest if watched >= 6s or completed
    if (completed || Number(watch_ms) >= 6000) {
      const ints = safeJson<string[]>(req.socialUser!.interests_json, []);
      if (vid.category && !ints.includes(vid.category)) {
        const nextInts = [vid.category, ...ints].slice(0, 8);
        db.prepare('UPDATE social_users SET interests_json = ? WHERE id = ?').run(JSON.stringify(nextInts), req.socialUser!.id);
      }
    }
    res.json({ ok: true });
  });

  router.post('/videos/:id/react', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const vid = db.prepare('SELECT author_id, likes_count FROM social_videos WHERE id = ?').get(req.params.id) as
      | { author_id: string; likes_count: number }
      | undefined;
    if (!vid) {
      res.status(404).json({ error: 'Video không tồn tại.' });
      return;
    }
    const existing = db
      .prepare("SELECT id FROM social_reactions WHERE target_type = 'video' AND target_id = ? AND user_id = ?")
      .get(req.params.id, user.id) as { id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM social_reactions WHERE id = ?').run(existing.id);
      db.prepare('UPDATE social_videos SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(req.params.id);
      res.json({ liked: false, likes_count: Math.max(0, vid.likes_count - 1) });
      return;
    }
    db.prepare("INSERT INTO social_reactions (id, target_type, target_id, user_id, reaction_type, created_at) VALUES (?, 'video', ?, ?, 'love', ?)").run(
      uid('srx'),
      req.params.id,
      user.id,
      new Date().toISOString()
    );
    db.prepare('UPDATE social_videos SET likes_count = likes_count + 1 WHERE id = ?').run(req.params.id);
    pushSocialNotification({
      userId: vid.author_id,
      actor: user,
      type: 'reaction',
      title: 'Thích video ngắn',
      body: `${user.display_name} đã thích video của bạn.`,
      targetType: 'video',
      targetId: req.params.id,
    });
    res.json({ liked: true, likes_count: vid.likes_count + 1 });
  });

  router.get('/videos/:id/comments', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const vid = db.prepare('SELECT author_id, privacy FROM social_videos WHERE id = ?').get(req.params.id) as
      | { author_id: string; privacy: string }
      | undefined;
    if (!vid) {
      res.status(404).json({ error: 'Video không tồn tại.' });
      return;
    }
    res.json({ comments: hydrateCommentsForTarget('video_id', req.params.id, req.socialUser!.id, vid.author_id) });
  });

  // ==========================================
  // 6. EXPLORE, SEARCH & TRENDING
  // ==========================================
  router.get('/explore', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const posts = (
      db.prepare("SELECT * FROM social_posts WHERE status = 'published' ORDER BY (likes_count * 2 + comments_count * 3 + views_count * 0.1) DESC LIMIT 20").all() as Array<
        Record<string, unknown>
      >
    )
      .filter((p) => canViewUserContent(viewer.id, String(p.author_id), String(p.privacy || 'public')))
      .slice(0, 12)
      .map((p) => hydratePost(p, viewer.id));

    const videos = (db.prepare("SELECT * FROM social_videos WHERE status = 'published' ORDER BY views_count DESC LIMIT 12").all() as Array<
      Record<string, unknown>
    >).filter((v) => canViewUserContent(viewer.id, String(v.author_id), String(v.privacy || 'public')));

    const tagCount = new Map<string, number>();
    for (const p of posts) {
      const tags = (p as { hashtags?: string[] }).hashtags || [];
      for (const t of tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    }
    for (const v of videos) {
      for (const t of safeJson<string[]>(String(v.hashtags_json || '[]'), [])) {
        tagCount.set(t, (tagCount.get(t) || 0) + 1);
      }
    }
    const trendingHashtags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const suggestedUsers = (db.prepare("SELECT * FROM social_users WHERE status = 'active' AND id != ?").all(viewer.id) as SocialUserRow[])
      .filter((u) => !isBlockedBetween(viewer.id, u.id))
      .map((u) => ({
        ...sanitizeUser(u),
        is_following: isFollowing(viewer.id, u.id),
        is_friend: isFriends(viewer.id, u.id),
      }));

    res.json({ trendingPosts: posts, trendingVideos: videos, trendingHashtags, suggestedUsers });
  });

  router.get('/search', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || 'all');
    if (!q) {
      const history = db
        .prepare('SELECT * FROM social_search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 15')
        .all(viewer.id);
      res.json({ users: [], posts: [], videos: [], groups: [], pages: [], hashtags: [], history });
      return;
    }

    if (req.query.save === '1') {
      db.prepare('INSERT INTO social_search_history (id, user_id, query, category, created_at) VALUES (?, ?, ?, ?, ?)').run(
        uid('ssh'),
        viewer.id,
        q,
        category,
        new Date().toISOString()
      );
    }

    const users = (db.prepare("SELECT * FROM social_users WHERE status = 'active'").all() as SocialUserRow[])
      .filter(
        (u) =>
          !isBlockedBetween(viewer.id, u.id) &&
          (u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.bio.toLowerCase().includes(q))
      )
      .map((u) => ({ ...sanitizeUser(u), is_following: isFollowing(viewer.id, u.id), is_friend: isFriends(viewer.id, u.id) }));

    const posts = (db.prepare("SELECT * FROM social_posts WHERE status = 'published' ORDER BY created_at DESC").all() as Array<
      Record<string, unknown>
    >)
      .filter(
        (p) =>
          canViewUserContent(viewer.id, String(p.author_id), String(p.privacy || 'public')) &&
          (String(p.content || '').toLowerCase().includes(q) ||
            String(p.hashtags_json || '').toLowerCase().includes(q) ||
            String(p.author_name || '').toLowerCase().includes(q))
      )
      .slice(0, 20)
      .map((p) => hydratePost(p, viewer.id));

    const videos = (db.prepare("SELECT * FROM social_videos WHERE status = 'published' ORDER BY views_count DESC").all() as Array<
      Record<string, unknown>
    >).filter(
      (v) =>
        canViewUserContent(viewer.id, String(v.author_id), String(v.privacy || 'public')) &&
        (String(v.title || '').toLowerCase().includes(q) ||
          String(v.description || '').toLowerCase().includes(q) ||
          String(v.hashtags_json || '').toLowerCase().includes(q))
    );

    const groups = (db.prepare('SELECT * FROM social_groups').all() as Array<Record<string, unknown>>).filter(
      (g) => String(g.name || '').toLowerCase().includes(q) || String(g.description || '').toLowerCase().includes(q)
    );

    const pages = (db.prepare('SELECT * FROM social_pages').all() as Array<Record<string, unknown>>).filter(
      (pg) => String(pg.name || '').toLowerCase().includes(q) || String(pg.category || '').toLowerCase().includes(q)
    );

    res.json({ users, posts, videos, groups, pages });
  });

  router.delete('/search/history/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM social_search_history WHERE user_id = ?').run(req.socialUser!.id);
    } else {
      db.prepare('DELETE FROM social_search_history WHERE id = ? AND user_id = ?').run(req.params.id, req.socialUser!.id);
    }
    res.json({ ok: true });
  });

  // ==========================================
  // 7. PROFILES, FRIENDS, FOLLOWS, BLOCK/RESTRICT/MUTE
  // ==========================================
  router.get('/profiles/:idOrUsername', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const targetKey = req.params.idOrUsername;
    const u = db
      .prepare("SELECT * FROM social_users WHERE (id = ? OR LOWER(username) = LOWER(?)) AND status = 'active' LIMIT 1")
      .get(targetKey, targetKey) as SocialUserRow | undefined;
    if (!u) {
      res.status(404).json({ error: 'Không tìm thấy hồ sơ người dùng.' });
      return;
    }
    if (isBlockedBetween(viewer.id, u.id)) {
      res.status(403).json({ error: 'Không thể xem hồ sơ này do thiết lập chặn.' });
      return;
    }

    const followersCount = (db.prepare('SELECT COUNT(*) as c FROM social_follows WHERE following_id = ?').get(u.id) as { c: number }).c;
    const followingCount = (db.prepare('SELECT COUNT(*) as c FROM social_follows WHERE follower_id = ?').get(u.id) as { c: number }).c;
    const friendsCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM social_friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)")
        .get(u.id, u.id) as { c: number }
    ).c;

    const friendRow = db
      .prepare(
        'SELECT * FROM social_friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1'
      )
      .get(viewer.id, u.id, u.id, viewer.id) as { id: string; requester_id: string; addressee_id: string; status: string } | undefined;

    const canSeeDetails = u.id === viewer.id || u.is_private === 0 || isFollowing(viewer.id, u.id) || isFriends(viewer.id, u.id);
    const posts = canSeeDetails
      ? (
          db
            .prepare("SELECT * FROM social_posts WHERE author_id = ? AND status = 'published' ORDER BY is_pinned DESC, created_at DESC")
            .all(u.id) as Array<Record<string, unknown>>
        )
          .filter((p) => canViewUserContent(viewer.id, u.id, String(p.privacy || 'public')))
          .map((p) => hydratePost(p, viewer.id))
      : [];
    const videos = canSeeDetails
      ? (db.prepare("SELECT * FROM social_videos WHERE author_id = ? AND status = 'published' ORDER BY created_at DESC").all(u.id) as Array<
          Record<string, unknown>
        >)
      : [];
    const highlights = canSeeDetails
      ? db.prepare('SELECT * FROM social_highlights WHERE user_id = ? ORDER BY created_at DESC').all(u.id)
      : [];

    res.json({
      profile: sanitizeUser(u),
      stats: { followersCount, followingCount, friendsCount, postsCount: posts.length },
      relation: {
        isFollowing: isFollowing(viewer.id, u.id),
        friendStatus: friendRow?.status || 'none',
        friendDirection: friendRow ? (friendRow.requester_id === viewer.id ? 'outgoing' : 'incoming') : 'none',
        friendshipId: friendRow?.id || '',
        isRestricted: isRestrictedBy(viewer.id, u.id),
        isMuted: isMutedBy(viewer.id, u.id),
      },
      canSeeDetails,
      posts,
      videos,
      highlights,
    });
  });

  router.patch('/profile', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    // SECURITY: Never allow client to mutate role, is_verified, or status!
    const allowed = [
      'display_name',
      'bio',
      'avatar',
      'cover_url',
      'links_json',
      'account_type',
      'is_private',
      'allow_comments_default',
      'allow_tags',
      'allow_mentions',
      'show_online_status',
      'two_factor_enabled',
      'occupation',
      'city',
      'gender',
      'age',
      'relationship_label',
    ];
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [new Date().toISOString()];
    for (const k of allowed) {
      if (k in req.body) {
        sets.push(`${k} = ?`);
        vals.push(k === 'links_json' && typeof req.body[k] !== 'string' ? JSON.stringify(req.body[k]) : req.body[k]);
      }
    }
    vals.push(user.id);
    db.prepare(`UPDATE social_users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    syncSocialUserBackToCharacterOrProfile(db, user.id);
    const updated = db.prepare('SELECT * FROM social_users WHERE id = ?').get(user.id) as SocialUserRow;
    res.json({ user: sanitizeUser(updated) });
  });

  router.get('/activity-log', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const uidMe = req.socialUser!.id;
    const posts = db
      .prepare('SELECT id, content, post_type, created_at FROM social_posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(uidMe);
    const comments = db
      .prepare('SELECT id, post_id, video_id, content, created_at FROM social_comments WHERE author_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(uidMe);
    const reactions = db
      .prepare('SELECT id, target_type, target_id, reaction_type, created_at FROM social_reactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 25')
      .all(uidMe);
    const saved = db
      .prepare('SELECT id, target_type, target_id, created_at FROM social_saved_items WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(uidMe);
    res.json({ posts, comments, reactions, saved });
  });

  router.post('/follow/:userId', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const targetId = req.params.userId;
    if (viewer.id === targetId) {
      res.status(400).json({ error: 'Không thể tự theo dõi chính mình.' });
      return;
    }
    if (isBlockedBetween(viewer.id, targetId)) {
      res.status(403).json({ error: 'Không thể theo dõi do thiết lập chặn.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM social_follows WHERE follower_id = ? AND following_id = ?')
      .get(viewer.id, targetId) as { id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM social_follows WHERE id = ?').run(existing.id);
      res.json({ following: false });
      return;
    }
    db.prepare('INSERT INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid('fl'),
      viewer.id,
      targetId,
      new Date().toISOString()
    );
    pushSocialNotification({
      userId: targetId,
      actor: viewer,
      type: 'follow',
      title: 'Người theo dõi mới',
      body: `${viewer.display_name} đã bắt đầu theo dõi bạn.`,
      targetType: 'profile',
      targetId: viewer.id,
    });
    res.json({ following: true });
  });

  router.get('/friends', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const uidMe = req.socialUser!.id;
    const rows = db
      .prepare('SELECT * FROM social_friendships WHERE requester_id = ? OR addressee_id = ? ORDER BY updated_at DESC')
      .all(uidMe, uidMe) as Array<{ id: string; requester_id: string; addressee_id: string; status: string; updated_at: string }>;

    const friends: unknown[] = [];
    const incoming: unknown[] = [];
    const outgoing: unknown[] = [];

    for (const r of rows) {
      const otherId = r.requester_id === uidMe ? r.addressee_id : r.requester_id;
      const other = db.prepare("SELECT * FROM social_users WHERE id = ? AND status = 'active'").get(otherId) as SocialUserRow | undefined;
      if (!other || isBlockedBetween(uidMe, otherId)) continue;
      const entry = { friendshipId: r.id, user: sanitizeUser(other), updated_at: r.updated_at };
      if (r.status === 'accepted') friends.push(entry);
      else if (r.status === 'pending' && r.addressee_id === uidMe) incoming.push(entry);
      else if (r.status === 'pending' && r.requester_id === uidMe) outgoing.push(entry);
    }

    const blockedRows = db
      .prepare(
        `SELECT r.target_id, r.relation_type, u.display_name, u.username, u.avatar
         FROM social_user_relations r JOIN social_users u ON u.id = r.target_id
         WHERE r.user_id = ?`
      )
      .all(uidMe);

    res.json({ friends, incoming, outgoing, relations: blockedRows });
  });

  router.post('/friends/request', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const targetId = String(req.body.userId || '');
    if (!targetId || targetId === viewer.id || isBlockedBetween(viewer.id, targetId)) {
      res.status(400).json({ error: 'Không thể gửi lời mời kết bạn.' });
      return;
    }
    const existing = db
      .prepare(
        'SELECT id, status FROM social_friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
      )
      .get(viewer.id, targetId, targetId, viewer.id) as { id: string; status: string } | undefined;
    if (existing) {
      res.json({ id: existing.id, status: existing.status });
      return;
    }
    const id = uid('fr');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO social_friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      viewer.id,
      targetId,
      'pending',
      now,
      now
    );
    pushSocialNotification({
      userId: targetId,
      actor: viewer,
      type: 'friend_request',
      title: 'Lời mời kết bạn',
      body: `${viewer.display_name} muốn kết bạn với bạn.`,
      targetType: 'profile',
      targetId: viewer.id,
    });
    res.json({ id, status: 'pending' });
  });

  router.post('/friends/respond', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const { friendshipId, action } = req.body as { friendshipId?: string; action?: 'accept' | 'decline' | 'cancel' | 'unfriend' };
    const row = db.prepare('SELECT * FROM social_friendships WHERE id = ?').get(friendshipId) as
      | { id: string; requester_id: string; addressee_id: string; status: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy yêu cầu kết bạn.' });
      return;
    }
    if (row.requester_id !== viewer.id && row.addressee_id !== viewer.id) {
      res.status(403).json({ error: 'Không có quyền thao tác.' });
      return;
    }
    const now = new Date().toISOString();
    if (action === 'accept' && row.addressee_id === viewer.id) {
      db.prepare("UPDATE social_friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(now, row.id);
      db.prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)').run(
        uid('fl'),
        viewer.id,
        row.requester_id,
        now
      );
      db.prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)').run(
        uid('fl'),
        row.requester_id,
        viewer.id,
        now
      );
      pushSocialNotification({
        userId: row.requester_id,
        actor: viewer,
        type: 'friend_accept',
        title: 'Đã chấp nhận kết bạn',
        body: `${viewer.display_name} và bạn đã trở thành bạn bè.`,
        targetType: 'profile',
        targetId: viewer.id,
      });
      res.json({ status: 'accepted' });
      return;
    }
    db.prepare('DELETE FROM social_friendships WHERE id = ?').run(row.id);
    res.json({ status: 'removed' });
  });

  router.post('/relations', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const { targetId, relationType, active = true } = req.body as {
      targetId?: string;
      relationType?: 'block' | 'restrict' | 'mute';
      active?: boolean;
    };
    if (!targetId || targetId === viewer.id || !['block', 'restrict', 'mute'].includes(String(relationType))) {
      res.status(400).json({ error: 'Tham số quan hệ không hợp lệ.' });
      return;
    }
    if (!active) {
      db.prepare('DELETE FROM social_user_relations WHERE user_id = ? AND target_id = ? AND relation_type = ?').run(
        viewer.id,
        targetId,
        relationType
      );
      res.json({ active: false });
      return;
    }
    db.prepare('INSERT OR IGNORE INTO social_user_relations (id, user_id, target_id, relation_type, created_at) VALUES (?, ?, ?, ?, ?)').run(
      uid('rel'),
      viewer.id,
      targetId,
      relationType,
      new Date().toISOString()
    );
    if (relationType === 'block') {
      db.prepare('DELETE FROM social_follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)').run(
        viewer.id,
        targetId,
        targetId,
        viewer.id
      );
      db.prepare('DELETE FROM social_friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)').run(
        viewer.id,
        targetId,
        targetId,
        viewer.id
      );
    }
    res.json({ active: true });
  });

  // ==========================================
  // 8. GROUPS & FANPAGES
  // ==========================================
  router.get('/groups', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const groups = db.prepare('SELECT * FROM social_groups ORDER BY members_count DESC').all() as Array<Record<string, unknown>>;
    const hydrated = groups.map((g) => {
      const mem = db
        .prepare('SELECT role, status FROM social_group_members WHERE group_id = ? AND user_id = ?')
        .get(String(g.id), viewer.id) as { role: string; status: string } | undefined;
      const pending =
        mem && (mem.role === 'admin' || mem.role === 'moderator')
          ? db
              .prepare(
                `SELECT gm.user_id, gm.joined_at, u.display_name, u.username, u.avatar
                 FROM social_group_members gm JOIN social_users u ON u.id = gm.user_id
                 WHERE gm.group_id = ? AND gm.status = 'pending'`
              )
              .all(String(g.id))
          : [];
      return {
        ...g,
        rules: safeJson<string[]>(String(g.rules_json || '[]'), []),
        my_role: mem?.role || null,
        my_status: mem?.status || 'none',
        pending_requests: pending,
      };
    });
    res.json({ groups: hydrated });
  });

  router.post('/groups', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const { name, description = '', category = 'Cộng đồng', privacy = 'public', cover_url, rules = [] } = req.body as Record<string, unknown>;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Tên nhóm không được trống.' });
      return;
    }
    const id = uid('sgrp');
    const now = new Date().toISOString();
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    db.prepare(
      `INSERT INTO social_groups (id, name, slug, description, cover_url, category, privacy, rules_json, owner_id, members_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      String(name).trim(),
      slug || id,
      String(description),
      String(cover_url || '/src/assets/images/social_studio_setup_1794918925398.jpg'),
      String(category),
      ['public', 'private', 'closed'].includes(String(privacy)) ? String(privacy) : 'public',
      JSON.stringify(Array.isArray(rules) ? rules : []),
      user.id,
      now
    );
    db.prepare("INSERT INTO social_group_members (id, group_id, user_id, role, status, joined_at) VALUES (?, ?, ?, 'admin', 'approved', ?)").run(
      uid('sgm'),
      id,
      user.id,
      now
    );
    res.json({ group: db.prepare('SELECT * FROM social_groups WHERE id = ?').get(id) });
  });

  router.post('/groups/:id/join', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const grp = db.prepare('SELECT * FROM social_groups WHERE id = ?').get(req.params.id) as
      | { id: string; privacy: string; owner_id: string; name: string }
      | undefined;
    if (!grp) {
      res.status(404).json({ error: 'Không tìm thấy nhóm.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, status, role FROM social_group_members WHERE group_id = ? AND user_id = ?')
      .get(grp.id, user.id) as { id: string; status: string; role: string } | undefined;
    if (existing) {
      if (existing.role === 'admin' && grp.owner_id === user.id) {
        res.status(400).json({ error: 'Chủ nhóm không thể rời nhóm khi chưa chuyển quyền.' });
        return;
      }
      db.prepare('DELETE FROM social_group_members WHERE id = ?').run(existing.id);
      if (existing.status === 'approved') {
        db.prepare('UPDATE social_groups SET members_count = MAX(1, members_count - 1) WHERE id = ?').run(grp.id);
      }
      res.json({ status: 'none' });
      return;
    }
    const nextStatus = grp.privacy === 'public' ? 'approved' : 'pending';
    db.prepare("INSERT INTO social_group_members (id, group_id, user_id, role, status, joined_at) VALUES (?, ?, ?, 'member', ?, ?)").run(
      uid('sgm'),
      grp.id,
      user.id,
      nextStatus,
      new Date().toISOString()
    );
    if (nextStatus === 'approved') {
      db.prepare('UPDATE social_groups SET members_count = members_count + 1 WHERE id = ?').run(grp.id);
    } else {
      pushSocialNotification({
        userId: grp.owner_id,
        actor: user,
        type: 'group',
        title: 'Yêu cầu tham gia nhóm',
        body: `${user.display_name} xin tham gia nhóm ${grp.name}.`,
        targetType: 'group',
        targetId: grp.id,
      });
    }
    res.json({ status: nextStatus });
  });

  router.patch('/groups/:id/members/:userId', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.socialUser!;
    const myRole = db
      .prepare("SELECT role FROM social_group_members WHERE group_id = ? AND user_id = ? AND status = 'approved'")
      .get(req.params.id, actor.id) as { role: string } | undefined;
    if (!myRole || (myRole.role !== 'admin' && myRole.role !== 'moderator')) {
      res.status(403).json({ error: 'Chỉ quản trị viên nhóm mới có quyền duyệt thành viên.' });
      return;
    }
    const { action, role } = req.body as { action?: 'approve' | 'reject'; role?: 'member' | 'moderator' };
    if (action === 'approve') {
      db.prepare("UPDATE social_group_members SET status = 'approved' WHERE group_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
      db.prepare('UPDATE social_groups SET members_count = members_count + 1 WHERE id = ?').run(req.params.id);
    } else if (action === 'reject') {
      db.prepare('DELETE FROM social_group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    } else if (role && myRole.role === 'admin') {
      db.prepare('UPDATE social_group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, req.params.id, req.params.userId);
    }
    res.json({ ok: true });
  });

  router.get('/pages', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const viewer = req.socialUser!;
    const pages = db.prepare('SELECT * FROM social_pages ORDER BY followers_count DESC').all() as Array<Record<string, unknown>>;
    res.json({
      pages: pages.map((pg) => {
        const followed = Boolean(
          db.prepare('SELECT 1 FROM social_page_follows WHERE page_id = ? AND user_id = ?').get(String(pg.id), viewer.id)
        );
        const role = db.prepare('SELECT role FROM social_page_roles WHERE page_id = ? AND user_id = ?').get(String(pg.id), viewer.id) as
          | { role: string }
          | undefined;
        return { ...pg, is_following: followed, my_role: role?.role || null };
      }),
    });
  });

  router.post('/pages', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const { name, username, category = 'Thương hiệu & Sáng tạo', description = '', website = '' } = req.body as Record<string, string>;
    const cleanHandle = (username || name || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || uid('pg');
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Tên Trang không được trống.' });
      return;
    }
    const id = uid('spage');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO social_pages (id, name, username, category, description, avatar, cover_url, website, owner_id, followers_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      name.trim(),
      cleanHandle,
      category,
      description,
      user.avatar,
      '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
      website,
      user.id,
      now
    );
    db.prepare("INSERT INTO social_page_roles (id, page_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)").run(
      uid('spr'),
      id,
      user.id,
      now
    );
    res.json({ page: db.prepare('SELECT * FROM social_pages WHERE id = ?').get(id) });
  });

  router.post('/pages/:id/follow', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const existing = db.prepare('SELECT id FROM social_page_follows WHERE page_id = ? AND user_id = ?').get(req.params.id, user.id) as
      | { id: string }
      | undefined;
    if (existing) {
      db.prepare('DELETE FROM social_page_follows WHERE id = ?').run(existing.id);
      db.prepare('UPDATE social_pages SET followers_count = MAX(0, followers_count - 1) WHERE id = ?').run(req.params.id);
      res.json({ following: false });
      return;
    }
    db.prepare('INSERT INTO social_page_follows (id, page_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid('spf'),
      req.params.id,
      user.id,
      new Date().toISOString()
    );
    db.prepare('UPDATE social_pages SET followers_count = followers_count + 1 WHERE id = ?').run(req.params.id);
    res.json({ following: true });
  });

  // ==========================================
  // 9. REAL-TIME MESSAGING & GROUP CHAT
  // ==========================================
  router.get('/chats', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!.id;
    const chatRows = db
      .prepare(
        `SELECT c.* FROM social_chats c
         JOIN social_chat_members cm ON cm.chat_id = c.id
         WHERE cm.user_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(me) as Array<Record<string, unknown>>;

    const chats = chatRows.map((c) => {
      const chatId = String(c.id);
      const members = db
        .prepare(
          `SELECT u.id, u.username, u.display_name, u.avatar, u.is_verified, u.online_status, u.show_online_status, cm.role
           FROM social_chat_members cm JOIN social_users u ON u.id = cm.user_id
           WHERE cm.chat_id = ?`
        )
        .all(chatId) as Array<Record<string, unknown>>;
      const other = members.find((m) => String(m.id) !== me);
      const lastMsg = db
        .prepare('SELECT * FROM social_chat_messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(chatId) as Record<string, unknown> | undefined;
      const unreadCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM social_chat_messages
             WHERE chat_id = ? AND sender_id != ? AND read_by_json NOT LIKE ?`
          )
          .get(chatId, me, `%${me}%`) as { cnt: number }
      ).cnt;

      return {
        ...c,
        display_title: Number(c.is_group) ? String(c.title || 'Nhóm chat') : String(other?.display_name || c.title || 'Cuộc trò chuyện'),
        display_avatar: Number(c.is_group) ? String(c.avatar || '') : String(other?.avatar || c.avatar || ''),
        is_pinned: safeJson<string[]>(String(c.is_pinned_by_json || '[]'), []).includes(me),
        is_archived: safeJson<string[]>(String(c.is_archived_by_json || '[]'), []).includes(me),
        is_muted: safeJson<string[]>(String(c.is_muted_by_json || '[]'), []).includes(me),
        members: members.map((m) => ({
          ...m,
          is_online: m.show_online_status ? isUserOnline(String(m.id)) || m.online_status === 'online' : false,
        })),
        last_message: lastMsg || null,
        unread_count: unreadCount,
      };
    });
    res.json({ chats });
  });

  router.post('/chats', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!;
    const { memberIds = [], title = '', is_group = false } = req.body as {
      memberIds?: string[];
      title?: string;
      is_group?: boolean;
    };
    const targets = Array.from(new Set(memberIds.filter((id) => id && id !== me.id)));
    if (targets.length === 0) {
      res.status(400).json({ error: 'Chọn ít nhất một người nhận.' });
      return;
    }
    for (const tid of targets) {
      if (isBlockedBetween(me.id, tid)) {
        res.status(403).json({ error: 'Không thể tạo hội thoại với người dùng đang bị chặn.' });
        return;
      }
    }

    if (!is_group && targets.length === 1) {
      const existing = db
        .prepare(
          `SELECT c.id FROM social_chats c
           JOIN social_chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
           JOIN social_chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
           WHERE c.is_group = 0 LIMIT 1`
        )
        .get(me.id, targets[0]) as { id: string } | undefined;
      if (existing) {
        res.json({ chatId: existing.id, existing: true });
        return;
      }
    }

    const chatId = uid('schat');
    const now = new Date().toISOString();
    const peer = !is_group
      ? (db.prepare('SELECT display_name, avatar FROM social_users WHERE id = ?').get(targets[0]) as {
          display_name: string;
          avatar: string;
        })
      : null;
    db.prepare('INSERT INTO social_chats (id, title, is_group, avatar, created_by, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      chatId,
      is_group ? title.trim() || 'Nhóm mới' : peer?.display_name || '',
      is_group ? 1 : 0,
      is_group ? '/src/assets/images/social_saigon_cafe_1794918924529.jpg' : peer?.avatar || '',
      me.id,
      now,
      now
    );
    db.prepare("INSERT INTO social_chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, 'admin', ?)").run(
      uid('scm'),
      chatId,
      me.id,
      now
    );
    for (const tid of targets) {
      db.prepare("INSERT INTO social_chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?)").run(
        uid('scm'),
        chatId,
        tid,
        now
      );
    }
    res.json({ chatId });
  });

  router.get('/chats/:id/messages', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!.id;
    const isMember = db.prepare('SELECT 1 FROM social_chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, me);
    if (!isMember) {
      res.status(403).json({ error: 'Bạn không thuộc cuộc trò chuyện này.' });
      return;
    }
    const msgs = db
      .prepare('SELECT * FROM social_chat_messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as Array<Record<string, unknown>>;

    const visible = msgs
      .filter((m) => !safeJson<string[]>(String(m.deleted_for_json || '[]'), []).includes(me))
      .map((m) => {
        const sender = db.prepare('SELECT display_name, avatar, username FROM social_users WHERE id = ?').get(String(m.sender_id)) as
          | { display_name: string; avatar: string; username: string }
          | undefined;
        return {
          ...m,
          sender_name: sender?.display_name || 'Người dùng',
          sender_avatar: sender?.avatar || '',
          reactions: safeJson(String(m.reactions_json || '[]'), []),
          read_by: safeJson<string[]>(String(m.read_by_json || '[]'), []),
          delivered_to: safeJson<string[]>(String(m.delivered_to_json || '[]'), []),
          attachment: safeJson(String(m.attachment_json || '{}'), {}),
        };
      });
    res.json({ messages: visible });
  });

  router.post('/chats/:id/messages', requireSocialAuth, rateLimit('chat', 45), (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!;
    const members = db.prepare('SELECT user_id FROM social_chat_members WHERE chat_id = ?').all(req.params.id) as Array<{ user_id: string }>;
    if (!members.some((m) => m.user_id === me.id)) {
      res.status(403).json({ error: 'Bạn không thuộc cuộc trò chuyện này.' });
      return;
    }
    const { content = '', msg_type = 'text', attachment = {}, reply_to_id = '' } = req.body as Record<string, unknown>;
    const text = String(content).trim();
    if (!text && Object.keys((attachment as object) || {}).length === 0) {
      res.status(400).json({ error: 'Tin nhắn trống.' });
      return;
    }
    const unsafe = hasUnsafeContent(text);
    if (unsafe) {
      res.status(400).json({ error: unsafe });
      return;
    }

    const msgId = uid('scmsg');
    const now = new Date().toISOString();
    const onlinePeers = members.filter((m) => m.user_id !== me.id && isUserOnline(m.user_id)).map((m) => m.user_id);
    db.prepare(
      `INSERT INTO social_chat_messages (
        id, chat_id, sender_id, content, msg_type, attachment_json, reply_to_id, read_by_json, delivered_to_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msgId,
      req.params.id,
      me.id,
      text,
      String(msg_type),
      JSON.stringify(attachment || {}),
      String(reply_to_id),
      JSON.stringify([me.id]),
      JSON.stringify(onlinePeers),
      now
    );
    db.prepare('UPDATE social_chats SET updated_at = ? WHERE id = ?').run(now, req.params.id);

    const saved = {
      ...(db.prepare('SELECT * FROM social_chat_messages WHERE id = ?').get(msgId) as Record<string, unknown>),
      sender_name: me.display_name,
      sender_avatar: me.avatar,
      reactions: [],
      read_by: [me.id],
      delivered_to: onlinePeers,
      attachment: attachment || {},
    };
    emitToUsers(
      members.map((m) => m.user_id),
      'chat:message',
      { chatId: req.params.id, message: saved }
    );

    const mirroredCharId = mirrorSocialMessageToOS(db, {
      socialMessageId: msgId,
      chatId: req.params.id,
      senderId: me.id,
      content: text,
      msgType: String(msg_type),
      attachmentJson: JSON.stringify(attachment || {}),
      createdAt: now,
    });

    if (me.id === 'user_1' && mirroredCharId) {
      setTimeout(() => {
        void triggerAiReplyInSocialChat(db, {
          chatId: req.params.id,
          userMessage: text || '[Đã gửi tệp đính kèm]',
          characterId: mirroredCharId,
        });
      }, 650);
    }

    res.json({ message: saved });
  });

  router.post('/chats/:id/read', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!.id;
    const unread = db
      .prepare('SELECT id, read_by_json FROM social_chat_messages WHERE chat_id = ? AND read_by_json NOT LIKE ?')
      .all(req.params.id, `%${me}%`) as Array<{ id: string; read_by_json: string }>;
    for (const m of unread) {
      const arr = Array.from(new Set([...safeJson<string[]>(m.read_by_json, []), me]));
      db.prepare('UPDATE social_chat_messages SET read_by_json = ? WHERE id = ?').run(JSON.stringify(arr), m.id);
    }
    const members = db.prepare('SELECT user_id FROM social_chat_members WHERE chat_id = ?').all(req.params.id) as Array<{ user_id: string }>;
    emitToUsers(
      members.map((m) => m.user_id),
      'chat:read',
      { chatId: req.params.id, userId: me }
    );
    res.json({ ok: true });
  });

  router.patch('/chats/:id/settings', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const me = req.socialUser!.id;
    const chat = db.prepare('SELECT is_pinned_by_json, is_archived_by_json, is_muted_by_json FROM social_chats WHERE id = ?').get(req.params.id) as
      | { is_pinned_by_json: string; is_archived_by_json: string; is_muted_by_json: string }
      | undefined;
    if (!chat) {
      res.status(404).json({ error: 'Không tìm thấy hội thoại.' });
      return;
    }
    const toggle = (jsonStr: string, val: boolean) => {
      const set = new Set(safeJson<string[]>(jsonStr, []));
      if (val) set.add(me);
      else set.delete(me);
      return JSON.stringify(Array.from(set));
    };
    if ('pinned' in req.body) {
      db.prepare('UPDATE social_chats SET is_pinned_by_json = ? WHERE id = ?').run(toggle(chat.is_pinned_by_json, Boolean(req.body.pinned)), req.params.id);
    }
    if ('archived' in req.body) {
      db.prepare('UPDATE social_chats SET is_archived_by_json = ? WHERE id = ?').run(toggle(chat.is_archived_by_json, Boolean(req.body.archived)), req.params.id);
    }
    if ('muted' in req.body) {
      db.prepare('UPDATE social_chats SET is_muted_by_json = ? WHERE id = ?').run(toggle(chat.is_muted_by_json, Boolean(req.body.muted)), req.params.id);
    }
    res.json({ ok: true });
  });

  router.post('/chats/messages/:msgId/recall', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const msg = db.prepare('SELECT * FROM social_chat_messages WHERE id = ?').get(req.params.msgId) as
      | { id: string; chat_id: string; sender_id: string }
      | undefined;
    if (!msg || msg.sender_id !== req.socialUser!.id) {
      res.status(403).json({ error: 'Chỉ người gửi mới có thể thu hồi tin nhắn.' });
      return;
    }
    db.prepare("UPDATE social_chat_messages SET is_recalled = 1, content = 'Tin nhắn đã được thu hồi' WHERE id = ?").run(msg.id);
    db.prepare("UPDATE messages SET content = 'Tin nhắn đã được thu hồi' WHERE external_sync_id = ?").run(msg.id);
    const members = db.prepare('SELECT user_id FROM social_chat_members WHERE chat_id = ?').all(msg.chat_id) as Array<{ user_id: string }>;
    emitToUsers(
      members.map((m) => m.user_id),
      'chat:recall',
      { chatId: msg.chat_id, msgId: msg.id }
    );
    res.json({ ok: true });
  });

  // ==========================================
  // 10. LIVESTREAM ROOMS
  // ==========================================
  router.get('/livestreams', requireSocialAuth, (_req: AuthedRequest, res: Response) => {
    const streams = db.prepare("SELECT * FROM social_livestreams ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, started_at DESC").all() as Array<
      Record<string, unknown>
    >;
    const hydrated = streams.map((s) => {
      const host = db.prepare('SELECT display_name, username, avatar, is_verified FROM social_users WHERE id = ?').get(String(s.host_id)) as
        | { display_name: string; username: string; avatar: string; is_verified: number }
        | undefined;
      const comments = db
        .prepare('SELECT * FROM social_livestream_comments WHERE stream_id = ? ORDER BY is_pinned DESC, created_at ASC LIMIT 80')
        .all(String(s.id));
      const gifts = db
        .prepare('SELECT * FROM social_livestream_gifts WHERE stream_id = ? ORDER BY created_at DESC LIMIT 30')
        .all(String(s.id)) as Array<{ coin_value?: number }>;
      const totalGiftCoins = gifts.reduce((acc, g) => acc + Number(g.coin_value || 0), 0);
      const guestIds = safeJson<string[]>(String(s.guest_ids_json || '[]'), []);
      const guests = guestIds
        .map((gid) => db.prepare('SELECT id, display_name, username, avatar FROM social_users WHERE id = ?').get(gid))
        .filter(Boolean);
      return {
        ...s,
        host_name: host?.display_name || 'Host',
        host_username: host?.username || '',
        host_avatar: host?.avatar || '',
        host_verified: host?.is_verified || 0,
        banned_users: safeJson<string[]>(String(s.banned_users_json || '[]'), []),
        guests,
        gifts,
        total_gift_coins: totalGiftCoins,
        summary: safeJson(String(s.summary_json || '{}'), null),
        comments,
      };
    });
    res.json({ streams: hydrated });
  });

  router.post('/livestreams/start', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const host = req.socialUser!;
    const { title, category = 'Trò chuyện', allow_comments = true, cover_url } = req.body as Record<string, unknown>;
    if (!title || !String(title).trim()) {
      res.status(400).json({ error: 'Vui lòng nhập tiêu đề buổi phát trực tiếp.' });
      return;
    }
    const id = uid('live');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO social_livestreams (id, host_id, title, cover_url, category, status, allow_comments, viewer_count, peak_viewers, started_at)
       VALUES (?, ?, ?, ?, ?, 'live', ?, 1, 1, ?)`
    ).run(id, host.id, String(title).trim(), String(cover_url || host.cover_url || host.avatar), String(category), allow_comments ? 1 : 0, now);

    const stream = db.prepare('SELECT * FROM social_livestreams WHERE id = ?').get(id);
    // Notify followers
    const followers = db.prepare('SELECT follower_id FROM social_follows WHERE following_id = ?').all(host.id) as Array<{ follower_id: string }>;
    for (const f of followers) {
      pushSocialNotification({
        userId: f.follower_id,
        actor: host,
        type: 'livestream',
        title: 'Đang phát trực tiếp',
        body: `${host.display_name} vừa mở livestream: ${String(title).trim()}`,
        targetType: 'livestream',
        targetId: id,
      });
    }
    broadcastSocialEvent('stream:started', { streamId: id, hostId: host.id });
    res.json({ stream });
  });

  router.post('/livestreams/:id/end', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const stream = db.prepare('SELECT * FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { id: string; host_id: string; started_at: string; peak_viewers: number; total_likes: number }
      | undefined;
    if (!stream || (stream.host_id !== req.socialUser!.id && req.socialUser!.role !== 'admin')) {
      res.status(403).json({ error: 'Chỉ chủ phòng live mới có thể kết thúc phiên.' });
      return;
    }
    const endedAt = new Date().toISOString();
    const commentsCount = (
      db.prepare('SELECT COUNT(*) as c FROM social_livestream_comments WHERE stream_id = ?').get(stream.id) as { c: number }
    ).c;
    const giftAgg = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(coin_value), 0) as coins FROM social_livestream_gifts WHERE stream_id = ?')
      .get(stream.id) as { cnt: number; coins: number };
    const durationSec = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(stream.started_at).getTime()) / 1000));
    const summary = {
      durationSec,
      peakViewers: stream.peak_viewers || 1,
      totalLikes: stream.total_likes || 0,
      totalComments: commentsCount,
      totalGifts: giftAgg.cnt || 0,
      totalGiftCoins: giftAgg.coins || 0,
      endedAt,
    };
    db.prepare("UPDATE social_livestreams SET status = 'ended', ended_at = ?, summary_json = ? WHERE id = ?").run(
      endedAt,
      JSON.stringify(summary),
      req.params.id
    );
    broadcastSocialEvent('stream:ended', { streamId: req.params.id, summary });
    res.json({ ok: true, summary });
  });

  router.post('/livestreams/:id/comment', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const stream = db.prepare('SELECT status, allow_comments, banned_users_json FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { status: string; allow_comments: number; banned_users_json: string }
      | undefined;
    if (!stream || stream.status !== 'live') {
      res.status(400).json({ error: 'Livestream đã kết thúc.' });
      return;
    }
    if (!stream.allow_comments) {
      res.status(403).json({ error: 'Chủ phòng đã tắt bình luận.' });
      return;
    }
    if (safeJson<string[]>(stream.banned_users_json, []).includes(user.id)) {
      res.status(403).json({ error: 'Bạn đã bị chặn tương tác trong phiên livestream này.' });
      return;
    }
    const content = String(req.body.content || '').trim();
    if (!content) {
      res.status(400).json({ error: 'Nội dung trống.' });
      return;
    }
    const cid = uid('lc');
    db.prepare(
      'INSERT INTO social_livestream_comments (id, stream_id, user_id, user_name, user_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(cid, req.params.id, user.id, user.display_name, user.avatar, content, new Date().toISOString());
    const cmt = db.prepare('SELECT * FROM social_livestream_comments WHERE id = ?').get(cid);
    emitToStream(req.params.id, 'stream:comment', { streamId: req.params.id, comment: cmt });
    res.json({ comment: cmt });
  });

  router.post('/livestreams/:id/like', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_livestreams SET total_likes = total_likes + 1 WHERE id = ?').run(req.params.id);
    const row = db.prepare('SELECT total_likes FROM social_livestreams WHERE id = ?').get(req.params.id) as { total_likes: number } | undefined;
    emitToStream(req.params.id, 'stream:reaction', { streamId: req.params.id, totalLikes: row?.total_likes || 0 });
    res.json({ total_likes: row?.total_likes || 0 });
  });

  router.post('/livestreams/:id/gift', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const user = req.socialUser!;
    const { gift_key = 'star', gift_label = 'Sao may mắn', coin_value = 20 } = req.body as {
      gift_key?: string;
      gift_label?: string;
      coin_value?: number;
    };
    const stream = db.prepare('SELECT id, status FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { id: string; status: string }
      | undefined;
    if (!stream || stream.status !== 'live') {
      res.status(400).json({ error: 'Phòng live đã kết thúc.' });
      return;
    }
    const gid = uid('lg');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO social_livestream_gifts (id, stream_id, sender_id, sender_name, gift_key, gift_label, coin_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(gid, stream.id, user.id, user.display_name, String(gift_key), String(gift_label), Number(coin_value) || 10, now);

    const cmtId = uid('lc');
    db.prepare(
      'INSERT INTO social_livestream_comments (id, stream_id, user_id, user_name, user_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(cmtId, stream.id, user.id, user.display_name, user.avatar, `🎁 Đã gửi tặng ${gift_label} (+${coin_value} xu)`, now);
    const gift = db.prepare('SELECT * FROM social_livestream_gifts WHERE id = ?').get(gid);
    const cmt = db.prepare('SELECT * FROM social_livestream_comments WHERE id = ?').get(cmtId);
    emitToStream(stream.id, 'stream:gift', { streamId: stream.id, gift, comment: cmt });
    res.json({ gift, comment: cmt });
  });

  router.post('/livestreams/:id/guests', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const stream = db.prepare('SELECT host_id, guest_ids_json FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { host_id: string; guest_ids_json: string }
      | undefined;
    if (!stream || stream.host_id !== req.socialUser!.id) {
      res.status(403).json({ error: 'Chỉ chủ phòng mới mời được khách tham gia live.' });
      return;
    }
    const guestId = String(req.body.userId || '');
    const action = req.body.action === 'remove' ? 'remove' : 'add';
    const current = new Set(safeJson<string[]>(stream.guest_ids_json, []));
    if (action === 'remove') current.delete(guestId);
    else if (guestId && guestId !== stream.host_id) current.add(guestId);
    const nextIds = Array.from(current).slice(0, 4);
    db.prepare('UPDATE social_livestreams SET guest_ids_json = ? WHERE id = ?').run(JSON.stringify(nextIds), req.params.id);
    const guests = nextIds
      .map((gid) => db.prepare('SELECT id, display_name, username, avatar FROM social_users WHERE id = ?').get(gid))
      .filter(Boolean);
    emitToStream(req.params.id, 'stream:guests', { streamId: req.params.id, guests });
    res.json({ guests });
  });

  router.post('/livestreams/:id/pin-comment', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const stream = db.prepare('SELECT host_id FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { host_id: string }
      | undefined;
    if (!stream || stream.host_id !== req.socialUser!.id) {
      res.status(403).json({ error: 'Chỉ chủ phòng mới ghim được bình luận.' });
      return;
    }
    const commentId = String(req.body.commentId || '');
    db.prepare('UPDATE social_livestream_comments SET is_pinned = 0 WHERE stream_id = ?').run(req.params.id);
    if (commentId) {
      db.prepare('UPDATE social_livestream_comments SET is_pinned = 1 WHERE id = ? AND stream_id = ?').run(commentId, req.params.id);
    }
    db.prepare('UPDATE social_livestreams SET pinned_comment_id = ? WHERE id = ?').run(commentId, req.params.id);
    res.json({ ok: true, pinned_comment_id: commentId });
  });

  router.get('/livestreams/:id/summary', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const stream = db.prepare('SELECT * FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { id: string; summary_json: string; total_likes: number; peak_viewers: number; started_at: string; ended_at: string }
      | undefined;
    if (!stream) {
      res.status(404).json({ error: 'Không tìm thấy phòng live.' });
      return;
    }
    res.json({ summary: safeJson(stream.summary_json, null), stream });
  });

  router.post('/livestreams/:id/ban', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const stream = db.prepare('SELECT host_id, banned_users_json FROM social_livestreams WHERE id = ?').get(req.params.id) as
      | { host_id: string; banned_users_json: string }
      | undefined;
    if (!stream || stream.host_id !== req.socialUser!.id) {
      res.status(403).json({ error: 'Chỉ chủ phòng live mới được chặn người xem.' });
      return;
    }
    const targetUserId = String(req.body.userId || '');
    const banned = Array.from(new Set([...safeJson<string[]>(stream.banned_users_json, []), targetUserId]));
    db.prepare('UPDATE social_livestreams SET banned_users_json = ? WHERE id = ?').run(JSON.stringify(banned), req.params.id);
    emitToUser(targetUserId, 'stream:banned', { streamId: req.params.id });
    res.json({ banned });
  });

  // ==========================================
  // 10B. CONTEXTUAL AI SOCIAL SIMULATION ENGINE
  // ==========================================
  router.post('/ai/tick', requireSocialAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { characterId, action = 'auto', triggerContext } = (req.body || {}) as {
        characterId?: string;
        action?: 'auto' | 'create_post' | 'create_story' | 'comment_post' | 'react_post' | 'follow_or_friend' | 'send_dm' | 'join_livestream';
        triggerContext?: string;
      };
      const result = await runContextualSocialTick(db, {
        force: true,
        characterId,
        action,
        triggerContext,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi mô phỏng hoạt động AI' });
    }
  });

  router.post('/ai/trigger-stream-chat', requireSocialAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { characterId } = (req.body || {}) as { characterId?: string };
      const result = await runContextualSocialTick(db, {
        force: true,
        characterId,
        action: 'join_livestream',
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi gọi khán giả AI' });
    }
  });

  // ==========================================
  // 11. NOTIFICATIONS
  // ==========================================
  router.get('/notifications', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const list = db
      .prepare('SELECT * FROM social_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 80')
      .all(req.socialUser!.id);
    const unreadCount = (
      db.prepare('SELECT COUNT(*) as c FROM social_notifications WHERE user_id = ? AND is_read = 0').get(req.socialUser!.id) as { c: number }
    ).c;
    res.json({ notifications: list, unreadCount });
  });

  router.post('/notifications/read-all', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_notifications SET is_read = 1 WHERE user_id = ?').run(req.socialUser!.id);
    res.json({ ok: true });
  });

  router.patch('/notifications/:id/read', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE social_notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.socialUser!.id);
    res.json({ ok: true });
  });

  // ==========================================
  // 12. CREATOR STUDIO ANALYTICS (REAL DB AGGREGATION)
  // ==========================================
  router.get('/creator/analytics', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const uidMe = req.socialUser!.id;
    const rangeDays = req.query.range === '30d' ? 30 : req.query.range === '90d' ? 90 : 7;
    const sinceIso = new Date(Date.now() - rangeDays * 24 * 3600_000).toISOString();

    const postAgg = db
      .prepare(
        `SELECT COUNT(*) as total_posts,
                COALESCE(SUM(views_count), 0) as post_views,
                COALESCE(SUM(likes_count), 0) as post_likes,
                COALESCE(SUM(comments_count), 0) as post_comments,
                COALESCE(SUM(shares_count), 0) as post_shares
         FROM social_posts WHERE author_id = ? AND status = 'published'`
      )
      .get(uidMe) as Record<string, number>;

    const videoAgg = db
      .prepare(
        `SELECT COUNT(*) as total_videos,
                COALESCE(SUM(views_count), 0) as video_views,
                COALESCE(SUM(likes_count), 0) as video_likes,
                COALESCE(SUM(saves_count), 0) as video_saves
         FROM social_videos WHERE author_id = ? AND status = 'published'`
      )
      .get(uidMe) as Record<string, number>;

    const followers = (db.prepare('SELECT COUNT(*) as c FROM social_follows WHERE following_id = ?').get(uidMe) as { c: number }).c;
    const recentFollowers = (
      db.prepare('SELECT COUNT(*) as c FROM social_follows WHERE following_id = ? AND created_at >= ?').get(uidMe, sinceIso) as { c: number }
    ).c;

    const topPosts = db
      .prepare("SELECT id, content, post_type, views_count, likes_count, comments_count, shares_count, created_at FROM social_posts WHERE author_id = ? AND status = 'published' ORDER BY views_count DESC LIMIT 5")
      .all(uidMe);
    const topVideos = db
      .prepare("SELECT id, title, views_count, likes_count, saves_count, created_at FROM social_videos WHERE author_id = ? AND status = 'published' ORDER BY views_count DESC LIMIT 5")
      .all(uidMe);

    // Daily engagement series built from real DB records
    const dailyRows = db
      .prepare(
        `SELECT SUBSTR(created_at, 1, 10) as day,
                COALESCE(SUM(views_count), 0) as views,
                COALESCE(SUM(likes_count + comments_count + shares_count), 0) as engagements
         FROM social_posts
         WHERE author_id = ? AND created_at >= ?
         GROUP BY SUBSTR(created_at, 1, 10)
         ORDER BY day ASC`
      )
      .all(uidMe, sinceIso) as Array<{ day: string; views: number; engagements: number }>;

    res.json({
      rangeDays,
      summary: {
        totalViews: (postAgg.post_views || 0) + (videoAgg.video_views || 0),
        totalEngagements:
          (postAgg.post_likes || 0) +
          (postAgg.post_comments || 0) +
          (postAgg.post_shares || 0) +
          (videoAgg.video_likes || 0) +
          (videoAgg.video_saves || 0),
        followers,
        newFollowersInRange: recentFollowers,
        totalPosts: postAgg.total_posts || 0,
        totalVideos: videoAgg.total_videos || 0,
      },
      dailySeries: dailyRows,
      topPosts,
      topVideos,
    });
  });

  // ==========================================
  // 13. REPORTS, APPEALS & ADMIN MODERATION
  // ==========================================
  router.post('/reports', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const { target_type, target_id, reason, detail = '' } = req.body as Record<string, string>;
    if (!target_type || !target_id || !reason) {
      res.status(400).json({ error: 'Thiếu thông tin báo cáo vi phạm.' });
      return;
    }
    const id = uid('rep');
    db.prepare(
      'INSERT INTO social_reports (id, reporter_id, target_type, target_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.socialUser!.id, target_type, target_id, reason, detail, 'pending', new Date().toISOString());
    logSocialAudit(req.socialUser!.id, 'submit_report', target_type, target_id, { reason });
    res.json({ report: db.prepare('SELECT * FROM social_reports WHERE id = ?').get(id) });
  });

  router.post('/appeals', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const { report_id = '', target_type, target_id, reason } = req.body as Record<string, string>;
    if (!target_type || !target_id || !reason) {
      res.status(400).json({ error: 'Vui lòng cung cấp lý do khiếu nại.' });
      return;
    }
    const id = uid('apl');
    db.prepare(
      'INSERT INTO social_appeals (id, user_id, report_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.socialUser!.id, report_id, target_type, target_id, reason, 'pending', new Date().toISOString());
    logSocialAudit(req.socialUser!.id, 'submit_appeal', target_type, target_id, { reason });
    res.json({ appeal: db.prepare('SELECT * FROM social_appeals WHERE id = ?').get(id) });
  });

  router.get('/admin/overview', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const u = req.socialUser!;
    if (u.role !== 'admin' && u.role !== 'moderator') {
      res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền truy cập khu vực kiểm duyệt.' });
      return;
    }
    const reports = db
      .prepare(
        `SELECT r.*, rep.display_name as reporter_name
         FROM social_reports r LEFT JOIN social_users rep ON rep.id = r.reporter_id
         ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC`
      )
      .all();
    const appeals = db
      .prepare(
        `SELECT a.*, usr.display_name as appellant_name
         FROM social_appeals a LEFT JOIN social_users usr ON usr.id = a.user_id
         ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC`
      )
      .all();
    const users = (db.prepare('SELECT * FROM social_users ORDER BY created_at DESC').all() as SocialUserRow[]).map(sanitizeUser);
    const auditLogs = db
      .prepare(
        `SELECT l.*, u.display_name as actor_name
         FROM social_audit_logs l LEFT JOIN social_users u ON u.id = l.actor_id
         ORDER BY l.created_at DESC LIMIT 60`
      )
      .all();
    res.json({ reports, appeals, users, auditLogs });
  });

  router.patch('/admin/reports/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const admin = req.socialUser!;
    if (admin.role !== 'admin' && admin.role !== 'moderator') {
      res.status(403).json({ error: 'Không có quyền kiểm duyệt.' });
      return;
    }
    const rep = db.prepare('SELECT * FROM social_reports WHERE id = ?').get(req.params.id) as
      | { id: string; target_type: string; target_id: string }
      | undefined;
    if (!rep) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
      return;
    }
    const { action, note = '' } = req.body as { action: 'dismiss' | 'remove_content' | 'ban_author'; note?: string };
    const now = new Date().toISOString();
    const nextStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
    db.prepare('UPDATE social_reports SET status = ?, resolution_note = ?, reviewed_by = ?, resolved_at = ? WHERE id = ?').run(
      nextStatus,
      note,
      admin.id,
      now,
      rep.id
    );

    if (action === 'remove_content') {
      if (rep.target_type === 'post') db.prepare("UPDATE social_posts SET status = 'removed' WHERE id = ?").run(rep.target_id);
      if (rep.target_type === 'video') db.prepare("UPDATE social_videos SET status = 'removed' WHERE id = ?").run(rep.target_id);
      if (rep.target_type === 'comment') db.prepare('UPDATE social_comments SET is_hidden = 1 WHERE id = ?').run(rep.target_id);
    } else if (action === 'ban_author' && rep.target_type === 'user') {
      db.prepare("UPDATE social_users SET status = 'banned', updated_at = ? WHERE id = ? AND role != 'admin'").run(now, rep.target_id);
    }

    logSocialAudit(admin.id, `moderate_${action}`, rep.target_type, rep.target_id, { reportId: rep.id, note });
    res.json({ ok: true });
  });

  router.patch('/admin/appeals/:id', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const admin = req.socialUser!;
    if (admin.role !== 'admin' && admin.role !== 'moderator') {
      res.status(403).json({ error: 'Không có quyền duyệt khiếu nại.' });
      return;
    }
    const { status, admin_note = '' } = req.body as { status: 'approved' | 'rejected'; admin_note?: string };
    const apl = db.prepare('SELECT * FROM social_appeals WHERE id = ?').get(req.params.id) as
      | { id: string; user_id: string; target_type: string; target_id: string }
      | undefined;
    if (!apl) {
      res.status(404).json({ error: 'Không tìm thấy khiếu nại.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE social_appeals SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?').run(status, admin_note, now, apl.id);
    if (status === 'approved' && apl.target_type === 'post') {
      db.prepare("UPDATE social_posts SET status = 'published' WHERE id = ?").run(apl.target_id);
    }
    pushSocialNotification({
      userId: apl.user_id,
      actor: admin,
      type: 'moderation',
      title: 'Kết quả khiếu nại',
      body: status === 'approved' ? 'Khiếu nại của bạn đã được chấp thuận.' : `Khiếu nại không được chấp thuận: ${admin_note}`,
      targetType: apl.target_type,
      targetId: apl.target_id,
    });
    logSocialAudit(admin.id, `appeal_${status}`, apl.target_type, apl.target_id, { appealId: apl.id, admin_note });
    res.json({ ok: true });
  });

  router.patch('/admin/users/:id/verify', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const admin = req.socialUser!;
    if (admin.role !== 'admin') {
      res.status(403).json({ error: 'Chỉ Admin cấp cao mới có quyền cấp/thu hồi dấu xác minh.' });
      return;
    }
    const verified = req.body.is_verified ? 1 : 0;
    db.prepare('UPDATE social_users SET is_verified = ?, updated_at = ? WHERE id = ?').run(verified, new Date().toISOString(), req.params.id);
    logSocialAudit(admin.id, verified ? 'grant_verified' : 'revoke_verified', 'user', req.params.id);
    res.json({ ok: true, is_verified: verified });
  });

  router.patch('/admin/users/:id/status', requireSocialAuth, (req: AuthedRequest, res: Response) => {
    const admin = req.socialUser!;
    if (admin.role !== 'admin') {
      res.status(403).json({ error: 'Chỉ Admin mới có quyền khóa/mở khóa tài khoản.' });
      return;
    }
    const nextStatus = req.body.status === 'banned' ? 'banned' : 'active';
    db.prepare("UPDATE social_users SET status = ?, updated_at = ? WHERE id = ? AND role != 'admin'").run(
      nextStatus,
      new Date().toISOString(),
      req.params.id
    );
    logSocialAudit(admin.id, `user_status_${nextStatus}`, 'user', req.params.id);
    res.json({ ok: true, status: nextStatus });
  });

  return router;
}
