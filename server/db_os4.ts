import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { CURRENT_OS_VERSION, syncOsVersionHistory } from './os_releases.ts';
import { ensureYoutubePremiumSchema } from './youtube_premium_engine.ts';

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initOS4Database(db: Database.Database): void {
  // 1. OS Migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS os_migrations (
      id TEXT PRIMARY KEY,
      from_version TEXT NOT NULL,
      to_version TEXT NOT NULL,
      backup_id TEXT DEFAULT '',
      status TEXT NOT NULL,
      detail TEXT DEFAULT '',
      migrated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_library (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      duration_label TEXT DEFAULT '',
      list_type TEXT DEFAULT 'history',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movie_watchlist (
      movie_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      poster_url TEXT DEFAULT '',
      is_watchlisted INTEGER DEFAULT 1,
      is_favorite INTEGER DEFAULT 0,
      user_rating INTEGER DEFAULT 0,
      watched_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS music_playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tracks_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS music_oauth_connections (
      provider TEXT PRIMARY KEY,
      account_id TEXT DEFAULT '',
      display_name TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      profile_url TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      refresh_token TEXT DEFAULT '',
      expires_at INTEGER DEFAULT 0,
      scope TEXT DEFAULT '',
      connected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spotify_saved_items (
      id TEXT PRIMARY KEY,
      spotify_type TEXT NOT NULL,
      spotify_id TEXT NOT NULL,
      title TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      canonical_url TEXT NOT NULL,
      embed_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 2. Check if 3.0 -> 4.0 migration already completed
  const alreadyMigrated = db
    .prepare("SELECT id FROM os_migrations WHERE to_version = '4.0.0' AND status = 'completed' LIMIT 1")
    .get();

  let autoBackupId = '';
  const now = new Date().toISOString();

  if (!alreadyMigrated) {
    // Auto-snapshot 3.0 state before applying 4.0 schema changes
    try {
      const snapshotTables = [
        'user_profile', 'installed_apps', 'home_widgets', 'app_permissions', 'contacts',
        'conversations', 'messages', 'characters', 'character_memories', 'notes',
        'calendar_events', 'reminders', 'emails', 'files', 'podcasts', 'podcast_episodes'
      ];
      const data: Record<string, unknown[]> = {};
      for (const t of snapshotTables) {
        const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
        if (exists) {
          data[t] = db.prepare(`SELECT * FROM ${t}`).all() as unknown[];
        }
      }
      const pkg = {
        schemaVersion: '3.0.0',
        osVersion: 'PHONE OS 3.0.0 (Pre-4.0 Auto Snapshot)',
        createdAt: now,
        integrityHash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        data,
      };
      const payloadJson = JSON.stringify(pkg);
      autoBackupId = 'bak_pre_os4_auto';
      const summary = {
        notes: (data.notes || []).length,
        contacts: (data.contacts || []).length,
        messages: (data.messages || []).length,
        apps: (data.installed_apps || []).length,
        preMigration: true,
      };
      db.prepare(`
        INSERT OR REPLACE INTO backups (id, schema_version, os_version, integrity_hash, size_kb, summary_json, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        autoBackupId,
        pkg.schemaVersion,
        pkg.osVersion,
        pkg.integrityHash,
        Math.round((payloadJson.length / 1024) * 10) / 10,
        JSON.stringify(summary),
        payloadJson,
        now
      );
    } catch {
      // Non-fatal if backups table didn't exist yet on empty install
    }
  }

  // 3. Apply 4.0 schema extensions atomically
  const applyMigrations = db.transaction(() => {
    ensureColumn(db, 'user_profile', 'schema_version', "TEXT DEFAULT '4.0.0'");
    ensureColumn(db, 'user_profile', 'aod_timeout_sec', 'INTEGER DEFAULT 30');
    ensureColumn(db, 'user_profile', 'gestures_enabled', 'INTEGER DEFAULT 1');
    ensureColumn(db, 'user_profile', 'gesture_sensitivity', "TEXT DEFAULT 'normal'");
    ensureColumn(db, 'user_profile', 'recovery_email', "TEXT DEFAULT ''");
    ensureColumn(db, 'user_profile', 'recovery_code_hash', "TEXT DEFAULT ''");

    ensureColumn(db, 'characters', 'proactive_msg_enabled', 'INTEGER DEFAULT 1');
    ensureColumn(db, 'characters', 'proactive_call_enabled', 'INTEGER DEFAULT 1');
    ensureColumn(db, 'characters', 'proactive_photo_enabled', 'INTEGER DEFAULT 1');
    ensureColumn(db, 'characters', 'proactive_notif_enabled', 'INTEGER DEFAULT 1');

    // YouTube 2.0 safe migrations
    ensureColumn(db, 'youtube_library', 'progress_sec', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'youtube_library', 'duration_sec', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'youtube_library', 'liked', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'youtube_library', 'channel_id', "TEXT DEFAULT ''");
    ensureColumn(db, 'youtube_library', 'category', "TEXT DEFAULT ''");
    ensureColumn(db, 'youtube_library', 'updated_at', "TEXT DEFAULT ''");

    db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_subscriptions (
        channel_id TEXT PRIMARY KEY,
        channel_title TEXT NOT NULL,
        avatar_url TEXT DEFAULT '',
        subscribed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS youtube_comments (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        parent_id TEXT DEFAULT '',
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_avatar TEXT DEFAULT '',
        content TEXT NOT NULL,
        likes_count INTEGER DEFAULT 0,
        is_liked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS youtube_playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        items_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS youtube_search_history (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_yt_comments_video ON youtube_comments(video_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_yt_lib_video ON youtube_library(video_id, list_type);
    `);

    if ((db.prepare('SELECT COUNT(*) as c FROM youtube_subscriptions').get() as { c: number }).c === 0) {
      db.prepare('INSERT OR IGNORE INTO youtube_subscriptions (channel_id, channel_title, avatar_url, subscribed_at) VALUES (?, ?, ?, ?)').run(
        'Lofi Girl',
        'Lofi Girl',
        '/src/assets/images/char_yuki_1794880089308.jpg',
        now
      );
      db.prepare('INSERT OR IGNORE INTO youtube_subscriptions (channel_id, channel_title, avatar_url, subscribed_at) VALUES (?, ?, ?, ?)').run(
        'Google for Developers',
        'Google for Developers',
        '/src/assets/images/char_akira_1794880089961.jpg',
        now
      );
    }

    if ((db.prepare('SELECT COUNT(*) as c FROM youtube_playlists').get() as { c: number }).c === 0) {
      db.prepare('INSERT OR IGNORE INTO youtube_playlists (id, name, description, items_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        'ytpl_focus',
        'Nhạc Tập Trung & Lo-Fi',
        'Danh sách phát nghe khi học tập và làm việc trên PHONE OS',
        JSON.stringify([
          {
            video_id: 'jfKfPfyJRdk',
            title: 'lofi hip hop radio - beats to relax/study to',
            channel_title: 'Lofi Girl',
            thumbnail_url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
            duration_label: 'Trực tiếp',
          },
          {
            video_id: '4xDzrJKXOOY',
            title: 'synthwave radio - chill synth / retro beats',
            channel_title: 'Lofi Girl Synthwave',
            thumbnail_url: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
            duration_label: 'Trực tiếp',
          },
        ]),
        now,
        now
      );
    }

    if ((db.prepare('SELECT COUNT(*) as c FROM youtube_comments').get() as { c: number }).c === 0) {
      db.prepare(`
        INSERT OR IGNORE INTO youtube_comments (id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, is_liked, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        'ytc_1',
        'jfKfPfyJRdk',
        '',
        'char_yuki',
        'Yuki Shirakawa',
        '/src/assets/images/char_yuki_1794880089308.jpg',
        'Kênh này nghe mỗi tối lúc mix nhạc hoặc đọc sách thật sự dễ chịu luôn 🎧☕',
        24,
        now
      );
      db.prepare(`
        INSERT OR IGNORE INTO youtube_comments (id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, is_liked, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        'ytc_2',
        'jfKfPfyJRdk',
        'ytc_1',
        'char_akira',
        'Akira Kurosawa',
        '/src/assets/images/char_akira_1794880089961.jpg',
        'Chuẩn luôn Yuki, bật kèm hẹn giờ Pomodoro làm việc năng suất hẳn.',
        9,
        now
      );
    }

    db.prepare('UPDATE user_profile SET schema_version = ? WHERE id = ?').run(CURRENT_OS_VERSION, 'user_1');

    // Update existing installed app versions gently to reflect current OS ecosystem compatibility
    db.prepare('UPDATE installed_apps SET version = ? WHERE app_id IN (\'settings\', \'appstore\', \'messages\', \'phone\', \'browser\', \'video\', \'music\', \'banking\', \'telecom\', \'wallet\')').run(CURRENT_OS_VERSION);

    // Register 3 new OS 4.0 apps cleanly without disturbing existing 40 apps
    const newApps = [
      {
        app_id: 'youtube',
        name: 'YouTube',
        category: 'Giải trí',
        page_index: 2,
        sort_order: 33,
        version: '4.0.0',
        size_mb: 34.2,
        author: 'Google LLC · Nhúng chính thức',
        reality_type: 'B/C',
        description: 'Xem video YouTube qua trình phát nhúng IFrame chính thức & tìm kiếm qua YouTube Data API (có fallback mở ứng dụng/web chính thức).',
      },
      {
        app_id: 'movies',
        name: 'Phim & Series',
        category: 'Giải trí',
        page_index: 2,
        sort_order: 34,
        version: '4.0.0',
        size_mb: 28.0,
        author: 'PHONE OS Media Hub',
        reality_type: 'B/D',
        description: 'Trung tâm khám phá phim, xem trailer chính thức, quản lý danh sách xem sau và mở liên kết hợp pháp tới Netflix, Disney+, Prime Video.',
      },
      {
        app_id: 'musichub',
        name: 'Kho Nhạc',
        category: 'Giải trí',
        page_index: 2,
        sort_order: 35,
        version: '4.0.0',
        size_mb: 29.5,
        author: 'PHONE OS Audio Hub',
        reality_type: 'A/B',
        description: 'Quản lý thư viện nhạc cá nhân, danh sách phát SQLite, hàng đợi phát và cổng liên kết Spotify / Apple Music / YouTube Music chính thức.',
      },
    ];

    const insertApp = db.prepare(`
      INSERT OR IGNORE INTO installed_apps (
        app_id, name, category, installed, pinned_dock, dock_order, page_index, sort_order,
        folder_name, hidden, version, size_mb, author, reality_type, description, usage_count, last_opened_at
      ) VALUES (?, ?, ?, 1, 0, 0, ?, ?, '', 0, ?, ?, ?, ?, ?, 0, '')
    `);
    for (const a of newApps) {
      insertApp.run(a.app_id, a.name, a.category, a.page_index, a.sort_order, a.version, a.size_mb, a.author, a.reality_type, a.description);
    }

    // Seed sample local playlist if empty
    const plCount = (db.prepare('SELECT COUNT(*) as c FROM music_playlists').get() as { c: number }).c;
    if (plCount === 0) {
      db.prepare('INSERT INTO music_playlists (id, name, tracks_json, updated_at) VALUES (?, ?, ?, ?)').run(
        'pl_lofi_night',
        'Đêm Tokyo Thư Giãn',
        JSON.stringify(['trk_rain_shibuya', 'trk_sakura_breeze', 'trk_midnight_loop']),
        now
      );
    }

    if (!alreadyMigrated) {
      db.prepare(`
        INSERT INTO os_migrations (id, from_version, to_version, backup_id, status, detail, migrated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'mig_3_to_4',
        '3.0.0',
        '4.0.0',
        autoBackupId,
        'completed',
        'Nâng cấp schema 3.0 -> 4.0 thành công với bản sao lưu tự động an toàn.',
        now
      );
    }
  });

  applyMigrations();
  ensureYoutubePremiumSchema(db);
  syncOsVersionHistory(db);
}
