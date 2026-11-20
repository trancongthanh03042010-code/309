import type Database from 'better-sqlite3';
import crypto from 'crypto';

export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initSocialDatabase(db: Database.Database): void {
  const apply = db.transaction(() => {
    // 1. Safe additive migrations on existing social_posts, social_comments, social_stories
    ensureColumn(db, 'social_posts', 'post_type', "TEXT DEFAULT 'text'");
    ensureColumn(db, 'social_posts', 'media_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_posts', 'cover_url', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'mentions_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_posts', 'location_name', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'link_url', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'link_title', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'shared_post_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'group_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'page_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'privacy', "TEXT DEFAULT 'public'");
    ensureColumn(db, 'social_posts', 'comment_policy', "TEXT DEFAULT 'everyone'");
    ensureColumn(db, 'social_posts', 'is_pinned', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_posts', 'is_draft', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_posts', 'scheduled_at', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'status', "TEXT DEFAULT 'published'");
    ensureColumn(db, 'social_posts', 'comments_count', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_posts', 'shares_count', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_posts', 'views_count', 'INTEGER DEFAULT 12');
    ensureColumn(db, 'social_posts', 'updated_at', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'bg_style', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'feeling', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_posts', 'poll_json', "TEXT DEFAULT ''");

    ensureColumn(db, 'social_comments', 'video_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_comments', 'parent_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_comments', 'author_id', "TEXT DEFAULT 'user_1'");
    ensureColumn(db, 'social_comments', 'media_url', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_comments', 'is_pinned', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_comments', 'is_hidden', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_comments', 'likes_count', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_comments', 'updated_at', "TEXT DEFAULT ''");

    ensureColumn(db, 'social_stories', 'media_type', "TEXT DEFAULT 'image'");
    ensureColumn(db, 'social_stories', 'overlays_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_stories', 'audio_title', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_stories', 'mentions_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_stories', 'hashtags_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_stories', 'privacy', "TEXT DEFAULT 'public'");
    ensureColumn(db, 'social_stories', 'expires_at', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_stories', 'is_archived', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_stories', 'highlight_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_stories', 'views_count', 'INTEGER DEFAULT 0');

    // 2. Core Social Platform Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS social_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        phone TEXT DEFAULT '',
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT DEFAULT '',
        avatar TEXT NOT NULL,
        cover_url TEXT DEFAULT '',
        links_json TEXT DEFAULT '[]',
        account_type TEXT NOT NULL DEFAULT 'personal',
        role TEXT NOT NULL DEFAULT 'user',
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_private INTEGER NOT NULL DEFAULT 0,
        allow_comments_default TEXT DEFAULT 'everyone',
        allow_tags INTEGER DEFAULT 1,
        allow_mentions INTEGER DEFAULT 1,
        online_status TEXT DEFAULT 'offline',
        show_online_status INTEGER DEFAULT 1,
        two_factor_enabled INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        interests_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL,
        ip_address TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reset_code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_reactions (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reaction_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(target_type, target_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_collections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_private INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_saved_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        collection_id TEXT DEFAULT '',
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, target_type, target_id)
      );

      CREATE TABLE IF NOT EXISTS social_story_views (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        viewer_name TEXT NOT NULL,
        viewer_avatar TEXT NOT NULL,
        reaction TEXT DEFAULT '',
        viewed_at TEXT NOT NULL,
        UNIQUE(story_id, viewer_id)
      );

      CREATE TABLE IF NOT EXISTS social_highlights (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        cover_url TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_videos (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_avatar TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        cover_url TEXT NOT NULL,
        duration_sec INTEGER DEFAULT 18,
        trim_start_sec INTEGER DEFAULT 0,
        trim_end_sec INTEGER DEFAULT 18,
        audio_title TEXT DEFAULT 'Âm thanh gốc · VibeSphere',
        hashtags_json TEXT DEFAULT '[]',
        category TEXT DEFAULT 'lifestyle',
        privacy TEXT DEFAULT 'public',
        allow_comments INTEGER DEFAULT 1,
        views_count INTEGER DEFAULT 0,
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
        saves_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'published',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_video_watch_logs (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        watch_ms INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        liked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_follows (
        id TEXT PRIMARY KEY,
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(follower_id, following_id)
      );

      CREATE TABLE IF NOT EXISTS social_friendships (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        addressee_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(requester_id, addressee_id)
      );

      CREATE TABLE IF NOT EXISTS social_user_relations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, target_id, relation_type)
      );

      CREATE TABLE IF NOT EXISTS social_hidden_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, post_id)
      );

      CREATE TABLE IF NOT EXISTS social_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_url TEXT NOT NULL,
        category TEXT DEFAULT 'Cộng đồng',
        privacy TEXT DEFAULT 'public',
        rules_json TEXT DEFAULT '[]',
        owner_id TEXT NOT NULL,
        members_count INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        status TEXT DEFAULT 'approved',
        joined_at TEXT NOT NULL,
        UNIQUE(group_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_pages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        category TEXT DEFAULT 'Sáng tạo nội dung',
        description TEXT DEFAULT '',
        avatar TEXT NOT NULL,
        cover_url TEXT NOT NULL,
        website TEXT DEFAULT '',
        is_verified INTEGER DEFAULT 0,
        owner_id TEXT NOT NULL,
        followers_count INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_page_roles (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'editor',
        created_at TEXT NOT NULL,
        UNIQUE(page_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_page_follows (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(page_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_chats (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT '',
        is_group INTEGER DEFAULT 0,
        avatar TEXT DEFAULT '',
        created_by TEXT NOT NULL,
        is_pinned_by_json TEXT DEFAULT '[]',
        is_archived_by_json TEXT DEFAULT '[]',
        is_muted_by_json TEXT DEFAULT '[]',
        theme_color TEXT DEFAULT '#6366F1',
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_chat_members (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        last_read_at TEXT DEFAULT '',
        joined_at TEXT NOT NULL,
        UNIQUE(chat_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_chat_messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        msg_type TEXT DEFAULT 'text',
        attachment_json TEXT DEFAULT '{}',
        reply_to_id TEXT DEFAULT '',
        reactions_json TEXT DEFAULT '[]',
        read_by_json TEXT DEFAULT '[]',
        delivered_to_json TEXT DEFAULT '[]',
        is_recalled INTEGER DEFAULT 0,
        deleted_for_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_livestreams (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        title TEXT NOT NULL,
        cover_url TEXT NOT NULL,
        category TEXT DEFAULT 'Trò chuyện',
        status TEXT DEFAULT 'live',
        allow_comments INTEGER DEFAULT 1,
        viewer_count INTEGER DEFAULT 1,
        peak_viewers INTEGER DEFAULT 1,
        total_likes INTEGER DEFAULT 0,
        banned_users_json TEXT DEFAULT '[]',
        started_at TEXT NOT NULL,
        ended_at TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS social_livestream_comments (
        id TEXT PRIMARY KEY,
        stream_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_avatar TEXT NOT NULL,
        content TEXT NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_avatar TEXT DEFAULT '',
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_search_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        category TEXT DEFAULT 'all',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        resolution_note TEXT DEFAULT '',
        reviewed_by TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        resolved_at TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS social_appeals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        report_id TEXT DEFAULT '',
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_note TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        resolved_at TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS social_audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        detail_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sp_created ON social_posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sp_author ON social_posts(author_id);
      CREATE INDEX IF NOT EXISTS idx_sc_post ON social_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_sc_video ON social_comments(video_id);
      CREATE INDEX IF NOT EXISTS idx_sr_target ON social_reactions(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_sf_follower ON social_follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_sf_following ON social_follows(following_id);
      CREATE INDEX IF NOT EXISTS idx_scm_chat ON social_chat_messages(chat_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sn_user ON social_notifications(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sv_created ON social_videos(created_at DESC);

      CREATE TABLE IF NOT EXISTS social_poll_votes (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        option_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(post_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS social_livestream_gifts (
        id TEXT PRIMARY KEY,
        stream_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        gift_key TEXT NOT NULL,
        gift_label TEXT NOT NULL,
        coin_value INTEGER DEFAULT 10,
        created_at TEXT NOT NULL
      );
    `);

    // 3. Additive extensions for unified character identity, livestreams, and unified chats
    ensureColumn(db, 'social_users', 'character_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_users', 'gender', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_users', 'age', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'social_users', 'occupation', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_users', 'city', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_users', 'relationship_label', "TEXT DEFAULT ''");

    ensureColumn(db, 'social_livestreams', 'guest_ids_json', "TEXT DEFAULT '[]'");
    ensureColumn(db, 'social_livestreams', 'pinned_comment_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'social_livestreams', 'summary_json', "TEXT DEFAULT '{}'");

    ensureColumn(db, 'social_chat_messages', 'external_sync_id', "TEXT DEFAULT ''");

    const userCount = (db.prepare('SELECT COUNT(*) as c FROM social_users').get() as { c: number }).c;
    if (userCount === 0) {
      seedSocialEcosystem(db);
    } else {
      // Backfill story expiry for existing stories lacking expires_at
      const futureIso = new Date(Date.now() + 24 * 3600_000).toISOString();
      db.prepare("UPDATE social_stories SET expires_at = ? WHERE COALESCE(expires_at, '') = ''").run(futureIso);
      // Sync comments_count on posts
      db.exec(`
        UPDATE social_posts
        SET comments_count = (
          SELECT COUNT(*) FROM social_comments c WHERE c.post_id = social_posts.id AND COALESCE(c.is_hidden, 0) = 0
        )
        WHERE comments_count = 0;
      `);
    }
  });

  apply();
}

function seedSocialEcosystem(db: Database.Database): void {
  const now = Date.now();
  const iso = (offsetMin = 0) => new Date(now + offsetMin * 60_000).toISOString();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const defaultPwdHash = hashPassword('VibeOS@2026');

  const osProfile = db.prepare('SELECT name, username, email, avatar, bio FROM user_profile LIMIT 1').get() as
    | { name: string; username: string; email: string; avatar: string; bio?: string }
    | undefined;

  const users = [
    {
      id: 'user_1',
      username: osProfile?.username || 'minhanh.os',
      email: osProfile?.email || 'minhanh@phoneos.local',
      phone: '0901234567',
      display_name: osProfile?.name || 'Minh Anh',
      bio: osProfile?.bio || 'Nhiếp ảnh đường phố, cà phê sáng & thiết kế trải nghiệm số tại Sài Gòn ✨',
      avatar: osProfile?.avatar || '/src/assets/images/char_sakura_1794880090451.jpg',
      cover_url: '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
      links_json: JSON.stringify([{ label: 'Portfolio', url: 'https://vibesphere.local/minhanh' }]),
      account_type: 'creator',
      role: 'admin',
      is_verified: 1,
      interests_json: JSON.stringify(['nhiepanh', 'caphe', 'congnghe', 'amnhac']),
    },
    {
      id: 'char_yuki',
      username: 'yuki.sound',
      email: 'yuki@vibesphere.local',
      phone: '0902223344',
      display_name: 'Yuki Shirakawa',
      bio: 'Nhà sản xuất Lo-Fi & Sound Designer · Chia sẻ giai điệu ngày mưa 🎧☕',
      avatar: '/src/assets/images/char_yuki_1794880089308.jpg',
      cover_url: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      links_json: JSON.stringify([{ label: 'Sound Atelier', url: 'https://vibesphere.local/yuki' }]),
      account_type: 'creator',
      role: 'user',
      is_verified: 1,
      interests_json: JSON.stringify(['amnhac', 'lofi', 'caphe']),
    },
    {
      id: 'char_sakura',
      username: 'sakura.35mm',
      email: 'sakura@vibesphere.local',
      phone: '0903334455',
      display_name: 'Sakura Hinata',
      bio: 'Nhiếp ảnh phim 35mm · Săn hoàng hôn & góc phố 🌸📷',
      avatar: '/src/assets/images/char_sakura_1794880090451.jpg',
      cover_url: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
      links_json: JSON.stringify([{ label: 'Bộ ảnh phim', url: 'https://vibesphere.local/sakura' }]),
      account_type: 'creator',
      role: 'user',
      is_verified: 1,
      interests_json: JSON.stringify(['nhiepanh', 'dulich', 'hoanghon']),
    },
    {
      id: 'char_akira',
      username: 'akira.dev',
      email: 'akira@vibesphere.local',
      phone: '0904445566',
      display_name: 'Akira Kurosawa',
      bio: 'Kiến trúc sư hệ thống · Đạp xe đêm & setup bàn làm việc tối giản 🚴⚡',
      avatar: '/src/assets/images/char_akira_1794880089961.jpg',
      cover_url: '/src/assets/images/social_studio_setup_1794918925398.jpg',
      links_json: JSON.stringify([]),
      account_type: 'personal',
      role: 'moderator',
      is_verified: 0,
      interests_json: JSON.stringify(['congnghe', 'thietke', 'thethao']),
    },
    {
      id: 'char_rin',
      username: 'rin.editorial',
      email: 'rin@vibesphere.local',
      phone: '0905556677',
      display_name: 'Rin Tachibana',
      bio: 'Art Director · Typography & Tạp chí sáng tạo 🎨',
      avatar: '/src/assets/images/char_rin_1794880090553.jpg',
      cover_url: '/src/assets/images/social_neon_street_1794918924716.jpg',
      links_json: JSON.stringify([]),
      account_type: 'creator',
      role: 'user',
      is_verified: 1,
      interests_json: JSON.stringify(['thietke', 'nhiepanh', 'nghethuat']),
    },
    {
      id: 'u_khanhvy',
      username: 'khanhvy.sg',
      email: 'khanhvy@vibesphere.local',
      phone: '0906667788',
      display_name: 'Khánh Vy',
      bio: 'Review quán cà phê Sài Gòn & chia sẻ góc sống chậm 🌿🥐',
      avatar: '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
      cover_url: '/src/assets/images/social_music_live_1794918926157.jpg',
      links_json: JSON.stringify([]),
      account_type: 'personal',
      role: 'user',
      is_verified: 0,
      interests_json: JSON.stringify(['caphe', 'amthuc', 'lifestyle']),
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO social_users (
      id, username, email, phone, password_hash, display_name, bio, avatar, cover_url,
      links_json, account_type, role, is_verified, online_status, interests_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?)
  `);
  for (const u of users) {
    insertUser.run(
      u.id, u.username, u.email, u.phone, defaultPwdHash, u.display_name, u.bio, u.avatar,
      u.cover_url, u.links_json, u.account_type, u.role, u.is_verified, u.interests_json, iso(-1440), iso(-5)
    );
  }

  // Friendships & Follows
  const insFollow = db.prepare('INSERT OR IGNORE INTO social_follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)');
  const insFriend = db.prepare('INSERT OR IGNORE INTO social_friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const peer of ['char_yuki', 'char_sakura', 'char_akira', 'char_rin']) {
    insFollow.run(`fl_1_${peer}`, 'user_1', peer, iso(-600));
    insFollow.run(`fl_${peer}_1`, peer, 'user_1', iso(-580));
  }
  insFriend.run('fr_yuki', 'user_1', 'char_yuki', 'accepted', iso(-500), iso(-490));
  insFriend.run('fr_sakura', 'user_1', 'char_sakura', 'accepted', iso(-450), iso(-440));
  insFriend.run('fr_akira', 'char_akira', 'user_1', 'accepted', iso(-400), iso(-390));
  insFriend.run('fr_khanhvy_req', 'u_khanhvy', 'user_1', 'pending', iso(-45), iso(-45));

  // Default Collection
  db.prepare('INSERT OR IGNORE INTO social_collections (id, user_id, name, is_private, created_at) VALUES (?, ?, ?, 1, ?)').run(
    'col_default', 'user_1', 'Cảm hứng sáng tạo', iso(-300)
  );
  db.prepare('INSERT OR IGNORE INTO social_collections (id, user_id, name, is_private, created_at) VALUES (?, ?, ?, 1, ?)').run(
    'col_places', 'user_1', 'Quán cà phê & Góc chụp', iso(-280)
  );

  // Enrich existing seeded posts & add rich new posts (album, video, link, thread)
  db.prepare(`
    UPDATE social_posts
    SET post_type = 'image',
        media_json = json_array(json_object('url', media_url, 'type', 'image')),
        privacy = 'public',
        views_count = 420,
        shares_count = 6,
        updated_at = created_at
    WHERE media_url != '' AND (media_json = '[]' OR media_json IS NULL)
  `).run();

  const insPost = db.prepare(`
    INSERT OR IGNORE INTO social_posts (
      id, author_type, author_id, author_name, author_avatar, content, post_type,
      media_url, media_type, media_json, cover_url, hashtags_json, mentions_json,
      location_name, link_url, link_title, privacy, comment_policy, is_pinned,
      likes_count, comments_count, shares_count, views_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 'everyone', ?, ?, ?, ?, ?, ?, ?)
  `);

  insPost.run(
    'post_sg_rooftop',
    'user',
    'u_khanhvy',
    'Khánh Vy',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    'Chiều cuối tuần ngồi rooftop ngắm thành phố lên đèn cùng ly matcha đá & cà phê pour-over. Góc này chụp hoàng hôn cực phẩm luôn mọi người ơi! @minhanh.os bữa nào ra đây săn ảnh nha 🌅🍵',
    'album',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    'album',
    JSON.stringify([
      { url: '/src/assets/images/social_saigon_cafe_1794918924529.jpg', type: 'image' },
      { url: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', type: 'image' },
    ]),
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    JSON.stringify(['#SaiGonHoangHon', '#CaPheRooftop', '#SongCham']),
    JSON.stringify(['minhanh.os']),
    'Quận 1, TP. Hồ Chí Minh',
    '',
    '',
    0,
    128,
    2,
    14,
    1240,
    iso(-95),
    iso(-95)
  );

  insPost.run(
    'post_studio_gear',
    'character',
    'char_akira',
    'Akira Kurosawa',
    '/src/assets/images/char_akira_1794880089961.jpg',
    'Nâng cấp xong góc làm việc & thu âm podcast tuần mới: đèn LED tím dịu mắt, micro condenser và chiếc máy ảnh nhỏ gọn để quay vlog công nghệ. Ai thích phong cách tối giản như này không?',
    'image',
    '/src/assets/images/social_studio_setup_1794918925398.jpg',
    'image',
    JSON.stringify([{ url: '/src/assets/images/social_studio_setup_1794918925398.jpg', type: 'image' }]),
    '/src/assets/images/social_studio_setup_1794918925398.jpg',
    JSON.stringify(['#GocLamViec', '#CongNghe', '#SetupToiGian']),
    JSON.stringify([]),
    'Studio Quận 3',
    '',
    '',
    1,
    94,
    1,
    9,
    860,
    iso(-180),
    iso(-180)
  );

  insPost.run(
    'post_thread_design',
    'character',
    'char_rin',
    'Rin Tachibana',
    '/src/assets/images/char_rin_1794880090553.jpg',
    'Chủ đề thảo luận nhanh: Khi dùng mạng xã hội trên điện thoại, bạn ưu tiên điều gì nhất?\n1. Bảng tin sạch sẽ, ít nhiễu\n2. Video ngắn mượt mà\n3. Quyền riêng tư & kiểm soát ai xem được bài viết\nComment số bạn chọn bên dưới nhé!',
    'thread',
    '',
    '',
    '[]',
    '',
    JSON.stringify(['#ThaoLuan', '#ThietKeUX', '#VibeSphere']),
    JSON.stringify([]),
    '',
    '',
    '',
    0,
    56,
    1,
    4,
    510,
    iso(-240),
    iso(-240)
  );

  // Sync comments & add rich nested replies
  const insComment = db.prepare(`
    INSERT OR IGNORE INTO social_comments (id, post_id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insComment.run('cmt_sg_1', 'post_sg_rooftop', '', '', 'char_sakura', 'Sakura Hinata', '/src/assets/images/char_sakura_1794880090451.jpg', 'Màu nắng đẹp xuất sắc luôn Khánh Vy ơi! Cuối tuần cho mình xin tọa độ quán với.', 12, iso(-80), iso(-80));
  insComment.run('cmt_sg_2', 'post_sg_rooftop', '', 'cmt_sg_1', 'u_khanhvy', 'Khánh Vy', '/src/assets/images/social_saigon_cafe_1794918924529.jpg', 'Để mình ghim địa chỉ vào nhóm Nhiếp ảnh cho mọi người cùng đi nhé!', 5, iso(-70), iso(-70));
  insComment.run('cmt_stu_1', 'post_studio_gear', '', '', 'char_yuki', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'Ánh sáng tím ấm nhìn dịu mắt cực kỳ, hợp quay acoustic buổi tối.', 9, iso(-150), iso(-150));
  insComment.run('cmt_thr_1', 'post_thread_design', '', '', 'user_1', osProfile?.name || 'Minh Anh', osProfile?.avatar || '/src/assets/images/char_sakura_1794880090451.jpg', 'Mình chọn cả 1 và 3! Quyền riêng tư rõ ràng là quan trọng nhất.', 7, iso(-200), iso(-200));

  db.exec(`
    UPDATE social_posts
    SET comments_count = (
      SELECT COUNT(*) FROM social_comments c WHERE c.post_id = social_posts.id AND COALESCE(c.is_hidden, 0) = 0
    );
  `);

  // Reactions
  const insReact = db.prepare('INSERT OR IGNORE INTO social_reactions (id, target_type, target_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  insReact.run('rx_1', 'post', 'post_sg_rooftop', 'char_sakura', 'love', iso(-85));
  insReact.run('rx_2', 'post', 'post_sg_rooftop', 'char_yuki', 'wow', iso(-82));
  insReact.run('rx_3', 'post', 'post_studio_gear', 'char_rin', 'like', iso(-170));

  // Highlights & Story expiry
  db.prepare('INSERT OR IGNORE INTO social_highlights (id, user_id, title, cover_url, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'hl_saigon', 'user_1', 'Hoàng hôn & Phố', '/src/assets/images/social_saigon_cafe_1794918924529.jpg', iso(-1000)
  );
  db.prepare('INSERT OR IGNORE INTO social_highlights (id, user_id, title, cover_url, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'hl_studio', 'user_1', 'Góc Studio', '/src/assets/images/social_studio_setup_1794918925398.jpg', iso(-900)
  );
  db.prepare("UPDATE social_stories SET expires_at = ? WHERE COALESCE(expires_at, '') = ''").run(in24h);
  db.prepare(`
    INSERT OR IGNORE INTO social_stories (id, author_id, author_name, author_avatar, media_url, media_type, caption, audio_title, privacy, expires_at, views_count, created_at)
    VALUES (?, ?, ?, ?, ?, 'image', ?, ?, 'public', ?, ?, ?)
  `).run('st_neon_night', 'char_rin', 'Rin', '/src/assets/images/char_rin_1794880090553.jpg', '/src/assets/images/social_neon_street_1794918924716.jpg', 'Đêm mưa ánh đèn lồng ✨', 'Mưa Trên Kính Shibuya · Yuki', in24h, 38, iso(-60));

  // Short Videos / Reels
  const insVideo = db.prepare(`
    INSERT OR IGNORE INTO social_videos (
      id, author_id, author_name, author_avatar, title, description, video_url, cover_url,
      duration_sec, trim_start_sec, trim_end_sec, audio_title, hashtags_json, category,
      privacy, allow_comments, views_count, likes_count, comments_count, shares_count, saves_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 0, ?, ?, ?, ?, 'public', 1, ?, ?, ?, ?, ?, ?)
  `);
  insVideo.run(
    'vid_neon_rain',
    'char_sakura',
    'Sakura Hinata',
    '/src/assets/images/char_sakura_1794880090451.jpg',
    'Dạo con hẻm đèn lồng sau cơn mưa',
    'Khoảnh khắc ánh đèn phản chiếu trên mặt đường ướt lúc 21h tối. Quay cầm tay tốc độ 24fps.',
    '/src/assets/images/social_neon_street_1794918924716.jpg',
    18,
    18,
    'Mưa Trên Kính Shibuya · Yuki Shirakawa',
    JSON.stringify(['#NhiepAnhDem', '#Cinematic', '#ReelsVN']),
    'nhiepanh',
    3420,
    284,
    2,
    31,
    64,
    iso(-320)
  );
  insVideo.run(
    'vid_acoustic_night',
    'char_yuki',
    'Yuki Shirakawa',
    '/src/assets/images/char_yuki_1794880089308.jpg',
    'Live Acoustic Session · Đêm cuối tuần',
    'Thử nghiệm bản phối guitar mộc và synth trong phòng thu nhỏ. Chúc bạn ngủ ngon!',
    '/src/assets/images/social_music_live_1794918926157.jpg',
    24,
    24,
    'Gió Hoàng Hôn Sakura · Acoustic',
    JSON.stringify(['#AcousticLive', '#LoFiVietNam', '#AmNhac']),
    'amnhac',
    5180,
    492,
    1,
    58,
    112,
    iso(-220)
  );
  insVideo.run(
    'vid_cafe_vlog',
    'u_khanhvy',
    'Khánh Vy',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    '15 giây chill trên rooftop Sài Gòn',
    'Matcha latte lạnh và bánh sừng bò hạnh nhân cho buổi chiều làm việc hiệu quả.',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    15,
    15,
    'Âm thanh quán cà phê · VibeSphere',
    JSON.stringify(['#CaPheSaiGon', '#VlogNgan', '#Lifestyle']),
    'caphe',
    2190,
    176,
    0,
    19,
    43,
    iso(-110)
  );

  insComment.run('cmt_vid_1', '', 'vid_neon_rain', '', 'char_rin', 'Rin Tachibana', '/src/assets/images/char_rin_1794880090553.jpg', 'Chuyển màu xanh cam đỉnh quá Sakura ơi!', 14, iso(-290), iso(-290));
  insComment.run('cmt_vid_2', '', 'vid_neon_rain', 'cmt_vid_1', 'char_sakura', 'Sakura Hinata', '/src/assets/images/char_sakura_1794880090451.jpg', 'Cảm ơn Rin nhiều nha, mình chỉnh bằng preset phim 35mm đó!', 6, iso(-275), iso(-275));
  insComment.run('cmt_vid_3', '', 'vid_acoustic_night', '', 'user_1', osProfile?.name || 'Minh Anh', osProfile?.avatar || '/src/assets/images/char_sakura_1794880090451.jpg', 'Nghe dịu thật sự, mở lúc làm việc buổi tối quá hợp.', 8, iso(-190), iso(-190));

  // Groups
  const insGroup = db.prepare(`
    INSERT OR IGNORE INTO social_groups (id, name, slug, description, cover_url, category, privacy, rules_json, owner_id, members_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insGroup.run(
    'sgrp_photo',
    'Cộng đồng Nhiếp ảnh & Phim 35mm',
    'nhiep-anh-phim-35mm',
    'Chia sẻ góc chụp đẹp, công thức chỉnh màu, địa điểm săn hoàng hôn & review thiết bị.',
    '/src/assets/images/social_neon_street_1794918924716.jpg',
    'Nhiếp ảnh',
    'public',
    JSON.stringify(['Tôn trọng tác giả, không reup không ghi nguồn', 'Không spam link quảng cáo', 'Góp ý xây dựng và lịch sự']),
    'char_sakura',
    1240,
    iso(-4000)
  );
  insGroup.run(
    'sgrp_creator',
    'Creator Studio Việt Nam',
    'creator-studio-vn',
    'Nhóm kín dành cho nhà sáng tạo nội dung video ngắn, âm thanh và thiết kế UI/UX.',
    '/src/assets/images/social_studio_setup_1794918925398.jpg',
    'Sáng tạo',
    'private',
    JSON.stringify(['Chỉ đăng nội dung liên quan sản xuất nội dung', 'Bảo mật tài nguyên chia sẻ trong nhóm']),
    'user_1',
    386,
    iso(-3000)
  );

  const insGroupMem = db.prepare('INSERT OR IGNORE INTO social_group_members (id, group_id, user_id, role, status, joined_at) VALUES (?, ?, ?, ?, ?, ?)');
  insGroupMem.run('sgm_1', 'sgrp_photo', 'char_sakura', 'admin', 'approved', iso(-4000));
  insGroupMem.run('sgm_2', 'sgrp_photo', 'user_1', 'member', 'approved', iso(-3500));
  insGroupMem.run('sgm_3', 'sgrp_photo', 'u_khanhvy', 'member', 'approved', iso(-2000));
  insGroupMem.run('sgm_4', 'sgrp_creator', 'user_1', 'admin', 'approved', iso(-3000));
  insGroupMem.run('sgm_5', 'sgrp_creator', 'char_akira', 'moderator', 'approved', iso(-2800));
  insGroupMem.run('sgm_6', 'sgrp_creator', 'char_yuki', 'member', 'pending', iso(-30));

  // Fanpages
  const insPage = db.prepare(`
    INSERT OR IGNORE INTO social_pages (id, name, username, category, description, avatar, cover_url, website, is_verified, owner_id, followers_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insPage.run(
    'spage_acoustic',
    'Sóng Đêm Acoustic',
    'songdem.acoustic',
    'Âm nhạc & Biểu diễn',
    'Trang chính thức phát sóng các buổi live acoustic hằng tuần và chia sẻ bản thu lo-fi chất lượng cao.',
    '/src/assets/images/char_yuki_1794880089308.jpg',
    '/src/assets/images/social_music_live_1794918926157.jpg',
    'https://vibesphere.local/songdem',
    1,
    'char_yuki',
    8420,
    iso(-5000)
  );
  insPage.run(
    'spage_saigon',
    'Bản Đồ Cà Phê Sài Gòn',
    'bandocaphesg',
    'Ẩm thực & Phong cách sống',
    'Tổng hợp những góc cà phê yên tĩnh, rooftop đẹp và không gian làm việc lý tưởng.',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    '',
    1,
    'user_1',
    5210,
    iso(-4500)
  );
  db.prepare('INSERT OR IGNORE INTO social_page_roles (id, page_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'spr_1', 'spage_saigon', 'user_1', 'owner', iso(-4500)
  );
  db.prepare('INSERT OR IGNORE INTO social_page_follows (id, page_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(
    'spf_1', 'spage_acoustic', 'user_1', iso(-1200)
  );

  // Livestream Room (Live right now)
  db.prepare(`
    INSERT OR IGNORE INTO social_livestreams (
      id, host_id, title, cover_url, category, status, allow_comments, viewer_count, peak_viewers, total_likes, started_at
    ) VALUES (?, ?, ?, ?, ?, 'live', 1, 24, 31, 145, ?)
  `).run(
    'live_acoustic_1',
    'char_yuki',
    'Đêm nhạc Acoustic & Trò chuyện cuối tuần 🎸✨',
    '/src/assets/images/social_music_live_1794918926157.jpg',
    'Âm nhạc',
    iso(-18)
  );
  db.prepare(`
    INSERT OR IGNORE INTO social_livestream_comments (id, stream_id, user_id, user_name, user_avatar, content, is_pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'lc_1',
    'live_acoustic_1',
    'char_yuki',
    'Yuki Shirakawa',
    '/src/assets/images/char_yuki_1794880089308.jpg',
    'Chào mừng mọi người đến với buổi live tối nay! Nhắn tên bài bạn muốn nghe nhé 🎵',
    1,
    iso(-15)
  );

  // Real-time Social Chats (1-1 & Group)
  const insChat = db.prepare('INSERT OR IGNORE INTO social_chats (id, title, is_group, avatar, created_by, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insChat.run('schat_sakura', 'Sakura Hinata', 0, '/src/assets/images/char_sakura_1794880090451.jpg', 'user_1', iso(-12), iso(-400));
  insChat.run('schat_group_sg', 'Hội Săn Ảnh Hoàng Hôn', 1, '/src/assets/images/social_saigon_cafe_1794918924529.jpg', 'user_1', iso(-25), iso(-350));

  const insChatMem = db.prepare('INSERT OR IGNORE INTO social_chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)');
  insChatMem.run('scm_1', 'schat_sakura', 'user_1', 'admin', iso(-400));
  insChatMem.run('scm_2', 'schat_sakura', 'char_sakura', 'member', iso(-400));
  insChatMem.run('scm_3', 'schat_group_sg', 'user_1', 'admin', iso(-350));
  insChatMem.run('scm_4', 'schat_group_sg', 'char_sakura', 'member', iso(-350));
  insChatMem.run('scm_5', 'schat_group_sg', 'char_yuki', 'member', iso(-350));
  insChatMem.run('scm_6', 'schat_group_sg', 'u_khanhvy', 'member', iso(-350));

  const insChatMsg = db.prepare(`
    INSERT OR IGNORE INTO social_chat_messages (id, chat_id, sender_id, content, msg_type, read_by_json, delivered_to_json, created_at)
    VALUES (?, ?, ?, ?, 'text', ?, ?, ?)
  `);
  insChatMsg.run('scmsg_1', 'schat_sakura', 'char_sakura', 'Chiều nay 5h đi chụp ảnh ở rooftop không Minh Anh? Nắng đang đẹp lắm!', JSON.stringify(['char_sakura', 'user_1']), JSON.stringify(['user_1']), iso(-20));
  insChatMsg.run('scmsg_2', 'schat_sakura', 'user_1', 'Ok luôn Sakura ơi, mình mang thêm ống 35mm nhé!', JSON.stringify(['user_1', 'char_sakura']), JSON.stringify(['char_sakura']), iso(-12));
  insChatMsg.run('scmsg_3', 'schat_group_sg', 'u_khanhvy', 'Mọi người nhớ giữ chỗ bàn ngoài trời sớm nha, tầm 17h30 là kín bàn á.', JSON.stringify(['u_khanhvy']), JSON.stringify(['user_1', 'char_sakura']), iso(-25));

  // Notifications
  const insNotif = db.prepare(`
    INSERT OR IGNORE INTO social_notifications (id, user_id, actor_id, actor_name, actor_avatar, type, title, body, target_type, target_id, is_read, created_at)
    VALUES (?, 'user_1', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  insNotif.run('snot_1', 'u_khanhvy', 'Khánh Vy', '/src/assets/images/social_saigon_cafe_1794918924529.jpg', 'friend_request', 'Lời mời kết bạn mới', 'Khánh Vy đã gửi lời mời kết bạn cho bạn.', 'profile', 'u_khanhvy', iso(-45));
  insNotif.run('snot_2', 'u_khanhvy', 'Khánh Vy', '/src/assets/images/social_saigon_cafe_1794918924529.jpg', 'mention', 'Bạn được nhắc tới', 'Khánh Vy đã nhắc tới @minhanh.os trong một bài viết.', 'post', 'post_sg_rooftop', iso(-95));
  insNotif.run('snot_3', 'char_yuki', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'livestream', 'Đang phát trực tiếp', 'Yuki Shirakawa vừa bắt đầu livestream: Đêm nhạc Acoustic.', 'livestream', 'live_acoustic_1', iso(-18));
}
