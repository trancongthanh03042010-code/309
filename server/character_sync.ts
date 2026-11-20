import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { hashPassword } from './db_social.ts';
import { broadcastSocialEvent, emitToUsers } from './ws_social.ts';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function slugifyUsername(raw: string, fallbackId: string): string {
  const base = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (base.length >= 3) return base.slice(0, 28);
  return fallbackId.toLowerCase().replace(/[^a-z0-9._]/g, '');
}

export function ensureUniqueSocialUsername(database: Database.Database, desired: string, excludeUserId?: string): string {
  const cleanBase = slugifyUsername(desired, excludeUserId || uid('u'));
  let candidate = cleanBase;
  let counter = 1;
  while (true) {
    const clash = database
      .prepare('SELECT id FROM social_users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1')
      .get(candidate, excludeUserId || '') as { id: string } | undefined;
    if (!clash) return candidate;
    counter += 1;
    candidate = `${cleanBase}.${counter}`;
  }
}

interface CharacterRow {
  id: string;
  name: string;
  age: number;
  tagline: string;
  personality: string;
  bio: string;
  likes: string;
  avatar: string;
  cover_image?: string;
  role_title?: string;
  activity_status?: string;
  is_blocked?: number;
  is_featured?: number;
  is_followed?: number;
  gender?: string;
  username?: string;
  occupation?: string;
  city?: string;
  join_social?: number;
  is_verified?: number;
  social_bio?: string;
  relationship_label?: string;
  background_json?: string;
}

export function syncCharacterAcrossApps(
  database: Database.Database,
  charId: string,
  options?: { broadcast?: boolean }
): void {
  const char = database.prepare('SELECT * FROM characters WHERE id = ?').get(charId) as CharacterRow | undefined;
  if (!char) return;

  const now = new Date().toISOString();
  let bg: { occupation?: string; origin?: string } = {};
  try {
    bg = JSON.parse(char.background_json || '{}') as { occupation?: string; origin?: string };
  } catch {
    bg = {};
  }

  const effectiveOccupation = (char.occupation || bg.occupation || char.role_title || '').trim();
  const effectiveCity = (char.city || bg.origin || '').trim();
  const effectiveSocialBio = (char.social_bio || char.bio || char.tagline || '').trim();
  const effectiveCover = char.cover_image || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg';
  const joinSocial = char.join_social !== 0;

  const existingSocial = database.prepare('SELECT * FROM social_users WHERE id = ?').get(charId) as
    | { id: string; username: string; is_verified: number; email: string }
    | undefined;

  let finalUsername = (char.username || existingSocial?.username || '').trim();
  if (!finalUsername) {
    finalUsername = ensureUniqueSocialUsername(database, char.name, charId);
  } else {
    finalUsername = ensureUniqueSocialUsername(database, finalUsername, charId);
  }

  const finalVerified =
    typeof char.is_verified === 'number' && char.is_verified > 0
      ? 1
      : existingSocial?.is_verified || (char.is_featured ? 1 : 0);

  // Keep derived columns backfilled on characters row
  database
    .prepare(
      `UPDATE characters
       SET username = ?, occupation = ?, city = ?, is_verified = ?, social_bio = ?
       WHERE id = ?`
    )
    .run(finalUsername, effectiveOccupation, effectiveCity, finalVerified, effectiveSocialBio, charId);

  if (!joinSocial) {
    if (existingSocial) {
      database
        .prepare("UPDATE social_users SET status = 'deactivated', updated_at = ? WHERE id = ?")
        .run(now, charId);
    }
  } else {
    const nextStatus = char.is_blocked ? 'banned' : 'active';
    const nextOnline = char.activity_status && !char.activity_status.toLowerCase().includes('ngoại tuyến') ? 'online' : 'offline';
    const interests = (char.likes || '')
      .split(/[,·]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);

    if (existingSocial) {
      database
        .prepare(
          `UPDATE social_users
           SET username = ?, display_name = ?, bio = ?, avatar = ?, cover_url = ?,
               is_verified = ?, online_status = ?, status = ?,
               character_id = ?, gender = ?, age = ?, occupation = ?, city = ?, relationship_label = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          finalUsername,
          char.name,
          effectiveSocialBio,
          char.avatar,
          effectiveCover,
          finalVerified,
          nextOnline,
          nextStatus,
          charId,
          char.gender || 'unknown',
          char.age || 20,
          effectiveOccupation,
          effectiveCity,
          char.relationship_label || '',
          now,
          charId
        );
    } else {
      database
        .prepare(
          `INSERT INTO social_users (
            id, username, email, phone, password_hash, display_name, bio, avatar, cover_url,
            links_json, account_type, role, is_verified, online_status, status, interests_json,
            character_id, gender, age, occupation, city, relationship_label, created_at, updated_at
          ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, '[]', 'creator', 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          charId,
          finalUsername,
          `${finalUsername}@vibesphere.local`,
          hashPassword('VibeOS@2026'),
          char.name,
          effectiveSocialBio,
          char.avatar,
          effectiveCover,
          finalVerified,
          nextOnline,
          nextStatus,
          JSON.stringify(interests),
          charId,
          char.gender || 'unknown',
          char.age || 20,
          effectiveOccupation,
          effectiveCity,
          char.relationship_label || '',
          now,
          now
        );
    }
  }

  // Propagate identity changes across Contacts, Messages, Social Posts, Comments, Stories, Videos, Livestreams, Notifications
  database
    .prepare('UPDATE contacts SET name = ?, avatar = ?, is_blocked = ? WHERE character_id = ?')
    .run(char.name, char.avatar, char.is_blocked ? 1 : 0, charId);

  database
    .prepare('UPDATE conversations SET title = ?, avatar = ? WHERE is_group = 0 AND character_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE messages SET sender_name = ?, sender_avatar = ? WHERE sender_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_posts SET author_name = ?, author_avatar = ? WHERE author_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_comments SET author_name = ?, author_avatar = ? WHERE author_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_stories SET author_name = ?, author_avatar = ? WHERE author_id = ?')
    .run(char.name.split(' ')[0] || char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_videos SET author_name = ?, author_avatar = ? WHERE author_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_livestream_comments SET user_name = ?, user_avatar = ? WHERE user_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare('UPDATE social_notifications SET actor_name = ?, actor_avatar = ? WHERE actor_id = ?')
    .run(char.name, char.avatar, charId);

  database
    .prepare(
      `UPDATE social_chats
       SET title = ?, avatar = ?
       WHERE is_group = 0
         AND id IN (SELECT chat_id FROM social_chat_members WHERE user_id = ?)
         AND id IN (SELECT chat_id FROM social_chat_members WHERE user_id = 'user_1')`
    )
    .run(char.name, char.avatar, charId);

  database
    .prepare("UPDATE notifications SET avatar = ? WHERE action_payload = ? AND action_route IN ('characters', 'social', 'messages')")
    .run(char.avatar, charId);

  if (options?.broadcast !== false) {
    broadcastSocialEvent('character:synced', {
      characterId: charId,
      name: char.name,
      avatar: char.avatar,
      username: finalUsername,
    });
  }
}

export function deleteCharacterAcrossApps(database: Database.Database, charId: string): void {
  database.prepare('DELETE FROM contacts WHERE character_id = ?').run(charId);
  database.prepare('DELETE FROM social_posts WHERE author_id = ?').run(charId);
  database.prepare('DELETE FROM social_comments WHERE author_id = ?').run(charId);
  database.prepare('DELETE FROM social_stories WHERE author_id = ?').run(charId);
  database.prepare('DELETE FROM social_videos WHERE author_id = ?').run(charId);
  database.prepare('DELETE FROM social_follows WHERE follower_id = ? OR following_id = ?').run(charId, charId);
  database.prepare('DELETE FROM social_friendships WHERE requester_id = ? OR addressee_id = ?').run(charId, charId);
  database.prepare('DELETE FROM social_users WHERE id = ?').run(charId);
}

export function syncMainUserAcrossApps(database: Database.Database, options?: { broadcast?: boolean }): void {
  const profile = database.prepare("SELECT id, name, username, email, avatar, bio FROM user_profile WHERE id = 'user_1'").get() as
    | { id: string; name: string; username: string; email: string; avatar: string; bio?: string }
    | undefined;
  if (!profile) return;

  const now = new Date().toISOString();
  const existingSocial = database.prepare("SELECT id FROM social_users WHERE id = 'user_1'").get();
  const cleanUser = ensureUniqueSocialUsername(database, profile.username || profile.name || 'minhanh.os', 'user_1');

  if (existingSocial) {
    database
      .prepare(
        `UPDATE social_users
         SET display_name = ?, avatar = ?, bio = COALESCE(NULLIF(?, ''), bio), updated_at = ?
         WHERE id = 'user_1'`
      )
      .run(profile.name, profile.avatar, profile.bio || '', now);
  } else {
    database
      .prepare(
        `INSERT INTO social_users (
          id, username, email, phone, password_hash, display_name, bio, avatar, cover_url,
          account_type, role, is_verified, online_status, created_at, updated_at
        ) VALUES ('user_1', ?, ?, '', ?, ?, ?, ?, '/src/assets/images/social_saigon_cafe_1794918924529.jpg', 'creator', 'admin', 1, 'online', ?, ?)`
      )
      .run(
        cleanUser,
        profile.email || 'minhanh@phoneos.local',
        hashPassword('VibeOS@2026'),
        profile.name,
        profile.bio || 'Người dùng PHONE OS',
        profile.avatar,
        now,
        now
      );
  }

  database
    .prepare("UPDATE social_posts SET author_name = ?, author_avatar = ? WHERE author_id = 'user_1'")
    .run(profile.name, profile.avatar);
  database
    .prepare("UPDATE social_comments SET author_name = ?, author_avatar = ? WHERE author_id = 'user_1'")
    .run(profile.name, profile.avatar);
  database
    .prepare("UPDATE social_stories SET author_name = ?, author_avatar = ? WHERE author_id = 'user_1'")
    .run(profile.name.split(' ')[0] || profile.name, profile.avatar);
  database
    .prepare("UPDATE social_videos SET author_name = ?, author_avatar = ? WHERE author_id = 'user_1'")
    .run(profile.name, profile.avatar);
  database
    .prepare("UPDATE social_livestream_comments SET user_name = ?, user_avatar = ? WHERE user_id = 'user_1'")
    .run(profile.name, profile.avatar);
  database
    .prepare("UPDATE social_notifications SET actor_name = ?, actor_avatar = ? WHERE actor_id = 'user_1'")
    .run(profile.name, profile.avatar);
  database
    .prepare("UPDATE messages SET sender_name = ?, sender_avatar = ? WHERE sender_id = 'user_1'")
    .run(profile.name, profile.avatar);

  if (options?.broadcast !== false) {
    broadcastSocialEvent('character:synced', {
      characterId: 'user_1',
      name: profile.name,
      avatar: profile.avatar,
    });
  }
}

export function syncSocialUserBackToCharacterOrProfile(database: Database.Database, userId: string): void {
  const sUser = database.prepare('SELECT * FROM social_users WHERE id = ?').get(userId) as
    | {
        id: string;
        display_name: string;
        username: string;
        bio: string;
        avatar: string;
        cover_url: string;
        occupation?: string;
        city?: string;
        gender?: string;
        age?: number;
        character_id?: string;
      }
    | undefined;
  if (!sUser) return;

  if (userId === 'user_1') {
    database
      .prepare("UPDATE user_profile SET name = ?, avatar = ?, bio = ? WHERE id = 'user_1'")
      .run(sUser.display_name, sUser.avatar, sUser.bio || '');
    syncMainUserAcrossApps(database);
    return;
  }

  const charId = sUser.character_id || userId;
  const char = database.prepare('SELECT id FROM characters WHERE id = ?').get(charId) as { id: string } | undefined;
  if (char) {
    database
      .prepare(
        `UPDATE characters
         SET name = ?, avatar = ?, cover_image = ?, social_bio = ?, bio = CASE WHEN bio = '' THEN ? ELSE bio END,
             occupation = COALESCE(NULLIF(?, ''), occupation),
             city = COALESCE(NULLIF(?, ''), city),
             gender = COALESCE(NULLIF(?, ''), gender),
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        sUser.display_name,
        sUser.avatar,
        sUser.cover_url || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
        sUser.bio || '',
        sUser.bio || '',
        sUser.occupation || '',
        sUser.city || '',
        sUser.gender || '',
        new Date().toISOString(),
        charId
      );
    syncCharacterAcrossApps(database, charId);
  }
}

export function getOrCreateUnifiedCharChat(database: Database.Database, charId: string): { chatId: string; convId: string } | null {
  const char = database.prepare('SELECT id, name, avatar, greeting FROM characters WHERE id = ?').get(charId) as
    | { id: string; name: string; avatar: string; greeting: string }
    | undefined;
  if (!char) return null;

  const now = new Date().toISOString();

  // Ensure OS 1-on-1 conversation exists
  let conv = database.prepare('SELECT id FROM conversations WHERE is_group = 0 AND character_id = ? LIMIT 1').get(charId) as
    | { id: string }
    | undefined;
  if (!conv) {
    const convId = uid('conv');
    database
      .prepare(
        'INSERT INTO conversations (id, title, is_group, avatar, character_id, members_json, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)'
      )
      .run(convId, char.name, char.avatar, charId, JSON.stringify([charId]), now);
    database
      .prepare(
        "INSERT OR IGNORE INTO conversation_members (id, conversation_id, member_type, member_id, role, joined_at, muted, is_active) VALUES (?, ?, 'user', 'user_1', 'admin', ?, 0, 1)"
      )
      .run(`cm_${convId}_user_1`, convId, now);
    database
      .prepare(
        "INSERT OR IGNORE INTO conversation_members (id, conversation_id, member_type, member_id, role, joined_at, muted, is_active) VALUES (?, ?, 'character', ?, 'member', ?, 0, 1)"
      )
      .run(`cm_${convId}_${charId}`, convId, charId, now);
    conv = { id: convId };
  }

  // Ensure VibeSphere social_users row exists
  const hasSocialUser = database.prepare('SELECT id FROM social_users WHERE id = ?').get(charId);
  if (!hasSocialUser) {
    syncCharacterAcrossApps(database, charId, { broadcast: false });
  }

  // Ensure VibeSphere 1-on-1 social_chat exists
  let chat = database
    .prepare(
      `SELECT c.id FROM social_chats c
       JOIN social_chat_members m1 ON m1.chat_id = c.id AND m1.user_id = 'user_1'
       JOIN social_chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
       WHERE c.is_group = 0 LIMIT 1`
    )
    .get(charId) as { id: string } | undefined;

  if (!chat) {
    const chatId = `schat_${charId}`;
    database
      .prepare(
        'INSERT OR IGNORE INTO social_chats (id, title, is_group, avatar, created_by, updated_at, created_at) VALUES (?, ?, 0, ?, ?, ?, ?)'
      )
      .run(chatId, char.name, char.avatar, 'user_1', now, now);
    database
      .prepare("INSERT OR IGNORE INTO social_chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, 'user_1', 'admin', ?)")
      .run(`scm_${chatId}_user_1`, chatId, now);
    database
      .prepare("INSERT OR IGNORE INTO social_chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?)")
      .run(`scm_${chatId}_${charId}`, chatId, charId, now);
    chat = { id: chatId };
  }

  return { chatId: chat.id, convId: conv.id };
}

export function mirrorOSMessageToSocial(
  database: Database.Database,
  opts: {
    osMessageId: string;
    conversationId: string;
    senderId: string;
    content: string;
    msgType?: string;
    attachmentJson?: string;
    createdAt?: string;
  }
): void {
  try {
    const conv = database
      .prepare('SELECT is_group, character_id FROM conversations WHERE id = ?')
      .get(opts.conversationId) as { is_group: number; character_id: string } | undefined;
    if (!conv || conv.is_group || !conv.character_id) return;

    const alreadySynced = database
      .prepare('SELECT id FROM social_chat_messages WHERE external_sync_id = ? OR id = ? LIMIT 1')
      .get(opts.osMessageId, opts.osMessageId);
    if (alreadySynced) return;

    const pair = getOrCreateUnifiedCharChat(database, conv.character_id);
    if (!pair) return;

    const msgId = uid('scmsg');
    const now = opts.createdAt || new Date().toISOString();
    const senderId = opts.senderId === 'user_1' ? 'user_1' : conv.character_id;
    let parsedAtt = '{}';
    if (opts.attachmentJson && opts.attachmentJson !== '{}') {
      parsedAtt = opts.attachmentJson;
    }

    database
      .prepare(
        `INSERT INTO social_chat_messages (
          id, chat_id, sender_id, content, msg_type, attachment_json, read_by_json, delivered_to_json, external_sync_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        msgId,
        pair.chatId,
        senderId,
        opts.content || '',
        opts.msgType || 'text',
        parsedAtt,
        JSON.stringify([senderId]),
        JSON.stringify(['user_1']),
        opts.osMessageId,
        now
      );

    database.prepare('UPDATE social_chats SET updated_at = ? WHERE id = ?').run(now, pair.chatId);

    const sender = database
      .prepare('SELECT display_name, avatar FROM social_users WHERE id = ?')
      .get(senderId) as { display_name: string; avatar: string } | undefined;

    emitToUsers(['user_1', conv.character_id], 'chat:message', {
      chatId: pair.chatId,
      message: {
        id: msgId,
        chat_id: pair.chatId,
        sender_id: senderId,
        sender_name: sender?.display_name || 'Người dùng',
        sender_avatar: sender?.avatar || '',
        content: opts.content || '',
        msg_type: opts.msgType || 'text',
        attachment: (() => {
          try {
            return JSON.parse(parsedAtt);
          } catch {
            return {};
          }
        })(),
        reactions: [],
        read_by: [senderId],
        delivered_to: ['user_1'],
        created_at: now,
      },
    });
  } catch {
    // non-fatal mirror
  }
}

export function mirrorSocialMessageToOS(
  database: Database.Database,
  opts: {
    socialMessageId: string;
    chatId: string;
    senderId: string;
    content: string;
    msgType?: string;
    attachmentJson?: string;
    createdAt?: string;
  }
): string | null {
  try {
    const chat = database.prepare('SELECT is_group FROM social_chats WHERE id = ?').get(opts.chatId) as
      | { is_group: number }
      | undefined;
    if (!chat || chat.is_group) return null;

    const peer = database
      .prepare("SELECT user_id FROM social_chat_members WHERE chat_id = ? AND user_id != 'user_1' LIMIT 1")
      .get(opts.chatId) as { user_id: string } | undefined;
    if (!peer) return null;

    const char = database.prepare('SELECT id, name, avatar FROM characters WHERE id = ?').get(peer.user_id) as
      | { id: string; name: string; avatar: string }
      | undefined;
    if (!char) return null;

    const alreadySynced = database
      .prepare('SELECT id FROM messages WHERE external_sync_id = ? OR id = ? LIMIT 1')
      .get(opts.socialMessageId, opts.socialMessageId);
    if (alreadySynced) return null;

    const pair = getOrCreateUnifiedCharChat(database, char.id);
    if (!pair) return null;

    const now = opts.createdAt || new Date().toISOString();
    const osMsgId = uid('msg');
    const isUser = opts.senderId === 'user_1';
    const profile = isUser
      ? (database.prepare("SELECT name, avatar FROM user_profile WHERE id = 'user_1'").get() as
          | { name: string; avatar: string }
          | undefined)
      : undefined;

    database
      .prepare(
        `INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, external_sync_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`
      )
      .run(
        osMsgId,
        pair.convId,
        isUser ? 'user' : 'character',
        isUser ? 'user_1' : char.id,
        isUser ? profile?.name || 'Minh Anh' : char.name,
        isUser ? profile?.avatar || '' : char.avatar,
        opts.content || '',
        opts.msgType || 'text',
        opts.attachmentJson || '{}',
        opts.socialMessageId,
        now
      );

    database
      .prepare('UPDATE conversations SET updated_at = ?, last_message_id = ?, unread_count = CASE WHEN ? = 1 THEN 0 ELSE unread_count + 1 END WHERE id = ?')
      .run(now, osMsgId, isUser ? 1 : 0, pair.convId);

    return char.id;
  } catch {
    return null;
  }
}

export function backfillUnifiedCharactersAndSocial(database: Database.Database): void {
  const apply = database.transaction(() => {
    syncMainUserAcrossApps(database, { broadcast: false });

    const chars = database.prepare('SELECT * FROM characters').all() as CharacterRow[];
    const now = new Date().toISOString();

    for (const c of chars) {
      const hadSocial = Boolean(database.prepare('SELECT 1 FROM social_users WHERE id = ?').get(c.id));
      syncCharacterAcrossApps(database, c.id, { broadcast: false });

      if (!hadSocial && c.join_social !== 0 && !c.is_blocked) {
        // Ensure basic follow symmetry if user is already connected in OS
        database
          .prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)')
          .run(uid('fl'), 'user_1', c.id, now);
        database
          .prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)')
          .run(uid('fl'), c.id, 'user_1', now);
      }
    }

    // Backfill 1-on-1 message sync without duplicating existing rows
    const charConvs = database
      .prepare("SELECT id, character_id FROM conversations WHERE is_group = 0 AND COALESCE(character_id, '') != ''")
      .all() as Array<{ id: string; character_id: string }>;

    for (const conv of charConvs) {
      const pair = getOrCreateUnifiedCharChat(database, conv.character_id);
      if (!pair) continue;

      const existingSocialCount = (
        database.prepare('SELECT COUNT(*) as c FROM social_chat_messages WHERE chat_id = ?').get(pair.chatId) as { c: number }
      ).c;

      if (existingSocialCount === 0) {
        const recentMsgs = database
          .prepare(
            "SELECT id, sender_id, content, msg_type, attachment_json, created_at FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at ASC LIMIT 30"
          )
          .all(conv.id) as Array<{
          id: string;
          sender_id: string;
          content: string;
          msg_type: string;
          attachment_json: string;
          created_at: string;
        }>;
        for (const m of recentMsgs) {
          database
            .prepare(
              `INSERT OR IGNORE INTO social_chat_messages (
                id, chat_id, sender_id, content, msg_type, attachment_json, read_by_json, delivered_to_json, external_sync_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              uid('scmsg'),
              pair.chatId,
              m.sender_id === 'user_1' ? 'user_1' : conv.character_id,
              m.content,
              m.msg_type || 'text',
              m.attachment_json || '{}',
              JSON.stringify(['user_1', conv.character_id]),
              JSON.stringify(['user_1', conv.character_id]),
              m.id,
              m.created_at
            );
        }
      }
    }
  });

  apply();
}
