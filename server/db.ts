import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initOS3Database } from './db_os3.ts';
import { initOS4Database } from './db_os4.ts';
import { initMessagesV3Database } from './db_messages_v3.ts';
import { initBankingDatabase } from './db_banking.ts';
import { initSocialDatabase } from './db_social.ts';
import { initTelecomDatabase } from './db_telecom.ts';
import { backfillUnifiedCharactersAndSocial } from './character_sync.ts';

const dbPath = path.resolve(process.cwd(), 'phone_os.db');

function unlinkDbFiles(filePath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(filePath + suffix)) {
        fs.unlinkSync(filePath + suffix);
      }
    } catch {
      // ignore cleanup error
    }
  }
}

function openResilientDatabase(filePath: string): Database.Database {
  const tryOpen = () => {
    const conn = new Database(filePath);
    try {
      conn.pragma('journal_mode = WAL');
      conn.pragma('foreign_keys = ON');
      conn.prepare('SELECT count(*) AS cnt FROM sqlite_master').get();
      const quickCheck = String(conn.pragma('quick_check', { simple: true }) ?? '');
      if (quickCheck.toLowerCase() !== 'ok') {
        throw new Error(`SQLite quick_check failed: ${quickCheck.slice(0, 200)}`);
      }
      return conn;
    } catch (innerErr) {
      try {
        conn.close();
      } catch {
        // ignore close error
      }
      throw innerErr;
    }
  };

  try {
    return tryOpen();
  } catch (err) {
    console.warn('[db] Detected corrupted SQLite state, rebuilding fresh database:', (err as Error)?.message);
    unlinkDbFiles(filePath);
    return tryOpen();
  }
}

export let db = openResilientDatabase(dbPath);

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      avatar TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      pin_code TEXT DEFAULT '',
      unlock_mode TEXT DEFAULT 'swipe',
      theme TEXT DEFAULT 'dark',
      wallpaper TEXT NOT NULL,
      lock_clock_style TEXT DEFAULT 'modern',
      lock_clock_font TEXT DEFAULT 'display',
      lock_clock_color TEXT DEFAULT '#FFFFFF',
      aod_enabled INTEGER DEFAULT 0,
      hide_sensitive_lock INTEGER DEFAULT 0,
      font_size TEXT DEFAULT 'medium',
      icon_size TEXT DEFAULT 'medium',
      battery_level INTEGER DEFAULT 86,
      battery_saver INTEGER DEFAULT 0,
      dnd INTEGER DEFAULT 0,
      silent_mode INTEGER DEFAULT 0,
      airplane_mode INTEGER DEFAULT 0,
      wifi_on INTEGER DEFAULT 1,
      bluetooth_on INTEGER DEFAULT 1,
      mobile_data_on INTEGER DEFAULT 1,
      hotspot_on INTEGER DEFAULT 0,
      brightness INTEGER DEFAULT 92,
      volume INTEGER DEFAULT 75,
      permissions_json TEXT NOT NULL,
      boot_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS installed_apps (
      app_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      installed INTEGER DEFAULT 1,
      pinned_dock INTEGER DEFAULT 0,
      dock_order INTEGER DEFAULT 0,
      page_index INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      folder_name TEXT DEFAULT '',
      hidden INTEGER DEFAULT 0,
      version TEXT DEFAULT '2.0.0',
      size_mb REAL DEFAULT 24.5,
      author TEXT DEFAULT 'PHONE OS Core',
      reality_type TEXT DEFAULT 'B',
      description TEXT DEFAULT '',
      usage_count INTEGER DEFAULT 0,
      last_opened_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      group_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      action_route TEXT DEFAULT '',
      action_payload TEXT DEFAULT '',
      priority INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      tagline TEXT NOT NULL,
      personality TEXT NOT NULL,
      bio TEXT NOT NULL,
      likes TEXT NOT NULL,
      dislikes TEXT NOT NULL,
      voice_name TEXT NOT NULL,
      voice_style TEXT NOT NULL,
      avatar TEXT NOT NULL,
      scenario TEXT NOT NULL,
      greeting TEXT NOT NULL,
      author TEXT NOT NULL,
      interactions_count INTEGER DEFAULT 120,
      is_followed INTEGER DEFAULT 1,
      is_favorite INTEGER DEFAULT 0,
      relationship_level INTEGER DEFAULT 1,
      relationship_xp INTEGER DEFAULT 25,
      mood TEXT DEFAULT 'Calm & Warm',
      schedule_json TEXT NOT NULL,
      is_featured INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS character_memories (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER DEFAULT 5,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS character_events (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      executed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      birthday TEXT DEFAULT '',
      address TEXT DEFAULT '',
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      website TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      is_ai INTEGER DEFAULT 0,
      character_id TEXT DEFAULT '',
      group_name TEXT DEFAULT 'Chung'
    );

    CREATE TABLE IF NOT EXISTS call_history (
      id TEXT PRIMARY KEY,
      contact_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      direction TEXT NOT NULL,
      is_ai INTEGER DEFAULT 0,
      character_id TEXT DEFAULT '',
      duration_sec INTEGER DEFAULT 0,
      voicemail_text TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_group INTEGER DEFAULT 0,
      avatar TEXT DEFAULT '',
      character_id TEXT DEFAULT '',
      members_json TEXT DEFAULT '[]',
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      muted INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      wallpaper TEXT DEFAULT '',
      bubble_color TEXT DEFAULT '#A78BFA',
      roleplay_mode INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_avatar TEXT DEFAULT '',
      content TEXT NOT NULL,
      msg_type TEXT DEFAULT 'text',
      attachment_json TEXT DEFAULT '{}',
      reply_to_id TEXT DEFAULT '',
      reactions_json TEXT DEFAULT '[]',
      is_edited INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      media_type TEXT DEFAULT '',
      hashtags_json TEXT DEFAULT '[]',
      likes_count INTEGER DEFAULT 0,
      is_liked INTEGER DEFAULT 0,
      is_saved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_stories (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      media_url TEXT NOT NULL,
      caption TEXT NOT NULL,
      viewed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      data_url TEXT NOT NULL,
      album TEXT DEFAULT 'Máy ảnh',
      is_favorite INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT DEFAULT '',
      location_name TEXT DEFAULT '',
      character_id TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      folder TEXT DEFAULT 'Cá nhân',
      is_pinned INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_iso TEXT NOT NULL,
      end_iso TEXT NOT NULL,
      all_day INTEGER DEFAULT 0,
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      color TEXT DEFAULT '#A78BFA',
      reminder_min INTEGER DEFAULT 15,
      repeat_rule TEXT DEFAULT 'none',
      character_id TEXT DEFAULT '',
      attendees_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      due_time TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      list_name TEXT DEFAULT 'Cá nhân',
      is_completed INTEGER DEFAULT 0,
      repeat_rule TEXT DEFAULT 'none',
      synced_calendar_id TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      folder TEXT DEFAULT 'inbox',
      from_name TEXT NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      attachment_content TEXT DEFAULT '',
      is_starred INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      labels_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT DEFAULT 'Tài liệu',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      content_text TEXT DEFAULT '',
      data_url TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      duration_sec INTEGER DEFAULT 0,
      data_url TEXT NOT NULL,
      mime_type TEXT DEFAULT 'audio/webm',
      transcript TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_bookmarks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      folder TEXT DEFAULT 'Favorites',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      visited_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id TEXT PRIMARY KEY,
      time_str TEXT NOT NULL,
      label TEXT NOT NULL,
      repeat_days TEXT DEFAULT 'Hằng ngày',
      sound TEXT DEFAULT 'Chuông nhẹ',
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS world_clocks (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      timezone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_logs (
      id TEXT PRIMARY KEY,
      log_type TEXT NOT NULL,
      value_num REAL NOT NULL,
      unit TEXT NOT NULL,
      label TEXT DEFAULT '',
      extra_json TEXT DEFAULT '{}',
      logged_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_cards (
      id TEXT PRIMARY KEY,
      card_type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      code_value TEXT NOT NULL,
      color TEXT NOT NULL,
      expires_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vault_items (
      id TEXT PRIMARY KEY,
      site TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      iv_hex TEXT NOT NULL,
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shortcuts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_payload TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      last_run TEXT DEFAULT '',
      run_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS translations (
      id TEXT PRIMARY KEY,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      cover_color TEXT NOT NULL,
      pages_json TEXT NOT NULL,
      current_page INTEGER DEFAULT 0,
      bookmarks_json TEXT DEFAULT '[]',
      is_favorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS game_scores (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      detail TEXT DEFAULT '',
      played_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

const VI_APPS_CATALOG: Array<[string, string, string, number, number, number, number, number, string, string, string, string]> = [
  ['phone', 'Điện thoại', 'Liên lạc', 1, 1, 0, 0, 0, '2.4.0', '18.2', 'A/B', 'Cuộc gọi, Bàn phím số, Lịch sử & Gọi thoại AI'],
  ['messages', 'Tin nhắn', 'Liên lạc', 1, 1, 1, 0, 1, '2.8.1', '34.0', 'A/B', 'Nhắn tin 1-1 & Nhóm cùng các nhân vật Anime AI'],
  ['browser', 'Trình duyệt', 'Internet', 1, 1, 2, 0, 2, '2.2.0', '42.5', 'A', 'Trình duyệt nhiều tab, Dấu trang, Lịch sử & Tải xuống'],
  ['camera', 'Máy ảnh', 'Đa phương tiện', 1, 1, 3, 0, 3, '2.5.0', '29.4', 'A', 'Camera thiết bị thực, Quay video & Bộ lọc màu'],
  ['photos', 'Ảnh', 'Đa phương tiện', 1, 0, 0, 0, 4, '2.3.0', '26.1', 'A', 'Thư viện ảnh, Album, Chỉnh sửa & Đổi hình nền'],
  ['characters', 'Nhân vật AI', 'Hệ sinh thái AI', 1, 0, 0, 0, 5, '2.9.0', '48.0', 'A/B', 'Kho nhân vật Anime AI, Hồ sơ & Bộ nhớ dài hạn'],
  ['social', 'Mạng Xã hội', 'Xã hội', 1, 0, 0, 0, 6, '2.6.0', '39.2', 'B', 'Bảng tin, Story & Hoạt động tự động của AI'],
  ['assistant', 'Trợ lý AI', 'Hệ sinh thái AI', 1, 0, 0, 0, 7, '2.7.0', '22.0', 'A', 'Trợ lý Gemini toàn hệ thống hỗ trợ thao tác OS'],
  ['contacts', 'Danh bạ', 'Liên lạc', 1, 0, 0, 0, 8, '2.1.0', '12.4', 'B', 'Sổ địa chỉ & Thẻ liên hệ nhân vật AI'],
  ['mail', 'Thư', 'Liên lạc', 1, 0, 0, 0, 9, '2.0.5', '21.8', 'B', 'Ứng dụng Email với tệp đính kèm & Tóm tắt AI'],
  ['calendar', 'Lịch', 'Năng suất', 1, 0, 0, 0, 10, '2.2.1', '19.5', 'B', 'Lịch trình, Sinh nhật AI, Lời mời & Nhắc nhở'],
  ['reminders', 'Lời nhắc', 'Năng suất', 1, 0, 0, 0, 11, '2.1.2', '14.1', 'B', 'Danh sách việc cần làm, Độ ưu tiên & Đồng bộ Lịch'],
  ['notes', 'Ghi chú', 'Năng suất', 1, 0, 0, 0, 12, '2.3.4', '17.6', 'A/B', 'Ghi chú, Checklist & Khóa mã PIN riêng tư'],
  ['files', 'Tệp', 'Năng suất', 1, 0, 0, 0, 13, '2.4.0', '20.0', 'A', 'Tải tệp thật, Xem trước, Thư mục & Chia sẻ'],
  ['maps', 'Bản đồ', 'Du lịch', 1, 0, 0, 0, 14, '2.1.0', '31.2', 'A', 'Định vị GPS thực, Tìm địa điểm & Xem bản đồ'],
  ['weather', 'Thời tiết', 'Tiện ích', 1, 0, 0, 0, 15, '2.3.0', '16.4', 'A', 'Dự báo Open-Meteo thời gian thực & Theo giờ'],
  ['clock', 'Đồng hồ', 'Tiện ích', 1, 0, 0, 1, 0, '2.0.0', '11.2', 'B', 'Báo thức, Giờ thế giới, Bấm giờ & Hẹn giờ Dynamic Island'],
  ['calculator', 'Máy tính', 'Tiện ích', 1, 0, 0, 1, 1, '2.1.0', '9.8', 'A/B', 'Cơ bản, Khoa học, Đổi đơn vị & Tỷ giá trực tiếp'],
  ['music', 'Âm nhạc', 'Đa phương tiện', 1, 0, 0, 1, 2, '2.4.2', '28.5', 'A/B', 'Thư viện nhạc, Playlist, Lo-Fi WebAudio & Phát tệp'],
  ['video', 'Trình phát Video', 'Đa phương tiện', 1, 0, 0, 1, 3, '2.0.1', '23.0', 'A', 'Phát video quay/tải lên với Tốc độ & PiP'],
  ['recorder', 'Ghi âm', 'Đa phương tiện', 1, 0, 0, 1, 4, '2.1.5', '15.3', 'A', 'Ghi âm Micro thực & Chuyển giọng nói thành văn bản AI'],
  ['scanner', 'Máy quét', 'Năng suất', 1, 0, 0, 1, 5, '2.2.0', '27.4', 'A', 'Quét tài liệu, Cắt lọc ảnh & Trích xuất chữ OCR AI'],
  ['appstore', 'Kho Ứng dụng', 'Hệ thống', 1, 0, 0, 1, 6, '2.5.0', '32.0', 'B', 'Cửa hàng hệ sinh thái PHONE OS & Quản lý tương thích'],
  ['settings', 'Cài đặt', 'Hệ thống', 1, 0, 0, 1, 7, '2.9.0', '18.0', 'A/B', 'Màn hình, Màn hình khóa, Quyền hạn, Bộ nhớ & Bảo mật'],
  ['health', 'Sức khỏe', 'Phong cách sống', 1, 0, 0, 1, 8, '2.1.0', '25.6', 'B/C', 'Nhật ký vận động, Nước, Giấc ngủ, Cân nặng & Tập luyện'],
  ['wallet', 'Ví', 'Phong cách sống', 1, 0, 0, 1, 9, '2.0.2', '16.0', 'B', 'Thẻ thành viên, Vé sự kiện & Mã QR/Barcode'],
  ['passwords', 'Mật khẩu', 'Bảo mật', 1, 0, 0, 1, 10, '2.2.0', '13.5', 'A', 'Két sắt mã hóa AES-GCM & Tạo mật khẩu mạnh'],
  ['translate', 'Dịch', 'Tiện ích', 1, 0, 0, 1, 11, '2.3.0', '18.9', 'A', 'Dịch đa ngôn ngữ Gemini & Phát âm giọng nói'],
  ['news', 'Tin tức', 'Đọc báo', 1, 0, 0, 1, 12, '2.0.4', '19.1', 'A', 'Bảng tin công nghệ & thế giới trực tiếp kèm Dấu trang'],
  ['books', 'Sách', 'Đọc sách', 1, 0, 0, 1, 13, '2.1.0', '22.4', 'A/B', 'Trình đọc sách tùy chỉnh font, Dấu trang & Nhập tệp'],
  ['shortcuts', 'Phím tắt', 'Tự động hóa', 1, 0, 0, 1, 14, '2.2.0', '14.8', 'B', 'Quy tắc tự động hóa sự kiện OS & Lịch sử chạy'],
  ['games', 'Trò chơi', 'Giải trí', 1, 0, 0, 1, 15, '2.3.0', '36.7', 'B', 'Đố vui Anime, Đoán chữ, Lật thẻ & Visual Novel'],
  ['podcast', 'Podcast', 'Đa phương tiện', 1, 0, 0, 2, 0, '3.0.0', '21.5', 'B', 'Theo dõi chương trình, tải tập ngoại tuyến & hẹn giờ ngủ'],
  ['shopping', 'Mua sắm', 'Đời sống', 1, 0, 0, 2, 1, '3.0.0', '28.0', 'B', 'Cửa hàng mô phỏng, giỏ hàng, mã giảm giá & theo dõi đơn'],
  ['food', 'Đặt đồ ăn', 'Đời sống', 1, 0, 0, 2, 2, '3.0.0', '26.4', 'B', 'Khám phá nhà hàng, chọn topping & theo dõi giao đồ ăn mô phỏng'],
  ['banking', 'Ngân hàng', 'Tài chính', 1, 0, 0, 2, 3, '3.0.0', '24.2', 'B', 'Ngân hàng mô phỏng: số dư ảo, chuyển khoản PIN & hóa đơn'],
  ['ride', 'Đặt xe', 'Du lịch', 1, 0, 0, 2, 4, '3.0.0', '25.8', 'B', 'Đặt xe mô phỏng, ước tính giá, lộ trình tài xế & đánh giá'],
  ['office', 'Office', 'Năng suất', 1, 0, 0, 2, 5, '3.0.0', '35.0', 'A', 'Đọc PDF, soạn thảo văn bản, bảng tính công thức & trình chiếu'],
  ['community', 'Cộng đồng', 'Xã hội', 1, 0, 0, 2, 6, '3.0.0', '29.3', 'B', 'Nhóm công khai/riêng tư, thảo luận, báo cáo & chặn người dùng'],
  ['smarthome', 'Nhà thông minh', 'Tiện ích', 1, 0, 0, 2, 7, '3.0.0', '23.1', 'B', 'Điều khiển phòng, thiết bị, độ sáng/nhiệt độ & cảnh tự động']
];

  const existingProfile = db.prepare('SELECT id FROM user_profile LIMIT 1').get();
  if (!existingProfile) {
    seedInitialWorld();
  } else {
    // Sync installed app names, categories, and descriptions to Vietnamese for existing databases
    const insertMissingApp = db.prepare(`
      INSERT OR IGNORE INTO installed_apps (
        app_id, name, category, installed, pinned_dock, dock_order, page_index, sort_order, version, size_mb, reality_type, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const syncApp = db.prepare('UPDATE installed_apps SET name = ?, category = ?, description = ?, version = ? WHERE app_id = ?');
    for (const a of VI_APPS_CATALOG) {
      insertMissingApp.run(...a);
      syncApp.run(a[1], a[2], a[11], a[8], a[0]);
    }
    // Also localize initial default notification group keys and folder/list names if still English
    db.prepare("UPDATE notifications SET group_key = 'Tin nhắn' WHERE group_key = 'Messages'").run();
    db.prepare("UPDATE notifications SET group_key = 'Lịch' WHERE group_key = 'Calendar'").run();
    db.prepare("UPDATE notifications SET group_key = 'Mạng Xã hội' WHERE group_key = 'Social'").run();
    db.prepare("UPDATE notifications SET group_key = 'Hệ thống' WHERE group_key = 'System Alerts'").run();
    db.prepare("UPDATE contacts SET group_name = 'Chung' WHERE group_name = 'General'").run();
    db.prepare("UPDATE contacts SET group_name = 'Bạn đồng hành AI' WHERE group_name = 'AI Companions'").run();
    db.prepare("UPDATE notes SET folder = 'Cá nhân' WHERE folder = 'Personal'").run();
    db.prepare("UPDATE notes SET folder = 'Công việc' WHERE folder = 'Work'").run();
    db.prepare("UPDATE reminders SET list_name = 'Cá nhân' WHERE list_name = 'Personal'").run();
    db.prepare("UPDATE reminders SET list_name = 'Công việc' WHERE list_name = 'Work'").run();
    db.prepare("UPDATE reminders SET list_name = 'Mua sắm' WHERE list_name = 'Shopping'").run();
    db.prepare("UPDATE reminders SET list_name = 'Học tập' WHERE list_name = 'Study'").run();
    db.prepare("UPDATE reminders SET list_name = 'Sự kiện' WHERE list_name = 'Events'").run();
    db.prepare("UPDATE files SET folder = 'Tài liệu' WHERE folder = 'Documents'").run();
    db.prepare("UPDATE files SET folder = 'Tải xuống' WHERE folder = 'Downloads'").run();
    db.prepare("UPDATE files SET folder = 'Hình ảnh' WHERE folder = 'Images'").run();
    db.prepare("UPDATE files SET folder = 'Âm thanh' WHERE folder = 'Audio'").run();
    db.prepare("UPDATE media_assets SET album = 'Máy ảnh' WHERE album = 'Camera'").run();
    db.prepare("UPDATE media_assets SET album = 'Tải xuống' WHERE album = 'Downloads'").run();
    db.prepare("UPDATE media_assets SET album = 'Nhân vật AI' WHERE album = 'AI Cast'").run();
  }

  initOS3Database(db);
  initOS4Database(db);
  initMessagesV3Database(db);
  initBankingDatabase(db);
  initSocialDatabase(db);
  initTelecomDatabase(db);
  backfillUnifiedCharactersAndSocial(db);
}

function seedInitialWorld(): void {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  db.prepare(`
    INSERT INTO user_profile (
      id, name, username, email, avatar, joined_at, theme, wallpaper, permissions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'user_1',
    'Minh Anh',
    'minhanh.os',
    'minhanh@phoneos.local',
    '/src/assets/images/char_sakura_1794880090451.jpg',
    now,
    'dark',
    '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
    JSON.stringify({
      camera: 'prompt',
      microphone: 'prompt',
      location: 'prompt',
      notifications: 'granted',
      files: 'granted'
    })
  );

  const apps: Array<[string, string, string, number, number, number, number, number, string, string, string, string]> = [
    ['phone', 'Điện thoại', 'Liên lạc', 1, 1, 0, 0, 0, '2.4.0', '18.2', 'A/B', 'Cuộc gọi, Bàn phím số, Lịch sử & Gọi thoại AI'],
    ['messages', 'Tin nhắn', 'Liên lạc', 1, 1, 1, 0, 1, '2.8.1', '34.0', 'A/B', 'Nhắn tin 1-1 & Nhóm cùng các nhân vật Anime AI'],
    ['browser', 'Trình duyệt', 'Internet', 1, 1, 2, 0, 2, '2.2.0', '42.5', 'A', 'Trình duyệt nhiều tab, Dấu trang, Lịch sử & Tải xuống'],
    ['camera', 'Máy ảnh', 'Đa phương tiện', 1, 1, 3, 0, 3, '2.5.0', '29.4', 'A', 'Camera thiết bị thực, Quay video & Bộ lọc màu'],
    ['photos', 'Ảnh', 'Đa phương tiện', 1, 0, 0, 0, 4, '2.3.0', '26.1', 'A', 'Thư viện ảnh, Album, Chỉnh sửa & Đổi hình nền'],
    ['characters', 'Nhân vật AI', 'Hệ sinh thái AI', 1, 0, 0, 0, 5, '2.9.0', '48.0', 'A/B', 'Kho nhân vật Anime AI, Hồ sơ & Bộ nhớ dài hạn'],
    ['social', 'Mạng Xã hội', 'Xã hội', 1, 0, 0, 0, 6, '2.6.0', '39.2', 'B', 'Bảng tin, Story & Hoạt động tự động của AI'],
    ['assistant', 'Trợ lý AI', 'Hệ sinh thái AI', 1, 0, 0, 0, 7, '2.7.0', '22.0', 'A', 'Trợ lý Gemini toàn hệ thống hỗ trợ thao tác OS'],
    ['contacts', 'Danh bạ', 'Liên lạc', 1, 0, 0, 0, 8, '2.1.0', '12.4', 'B', 'Sổ địa chỉ & Thẻ liên hệ nhân vật AI'],
    ['mail', 'Thư', 'Liên lạc', 1, 0, 0, 0, 9, '2.0.5', '21.8', 'B', 'Ứng dụng Email với tệp đính kèm & Tóm tắt AI'],
    ['calendar', 'Lịch', 'Năng suất', 1, 0, 0, 0, 10, '2.2.1', '19.5', 'B', 'Lịch trình, Sinh nhật AI, Lời mời & Nhắc nhở'],
    ['reminders', 'Lời nhắc', 'Năng suất', 1, 0, 0, 0, 11, '2.1.2', '14.1', 'B', 'Danh sách việc cần làm, Độ ưu tiên & Đồng bộ Lịch'],
    ['notes', 'Ghi chú', 'Năng suất', 1, 0, 0, 0, 12, '2.3.4', '17.6', 'A/B', 'Ghi chú, Checklist & Khóa mã PIN riêng tư'],
    ['files', 'Tệp', 'Năng suất', 1, 0, 0, 0, 13, '2.4.0', '20.0', 'A', 'Tải tệp thật, Xem trước, Thư mục & Chia sẻ'],
    ['maps', 'Bản đồ', 'Du lịch', 1, 0, 0, 0, 14, '2.1.0', '31.2', 'A', 'Định vị GPS thực, Tìm địa điểm & Xem bản đồ'],
    ['weather', 'Thời tiết', 'Tiện ích', 1, 0, 0, 0, 15, '2.3.0', '16.4', 'A', 'Dự báo Open-Meteo thời gian thực & Theo giờ'],
    ['clock', 'Đồng hồ', 'Tiện ích', 1, 0, 0, 1, 0, '2.0.0', '11.2', 'B', 'Báo thức, Giờ thế giới, Bấm giờ & Hẹn giờ Dynamic Island'],
    ['calculator', 'Máy tính', 'Tiện ích', 1, 0, 0, 1, 1, '2.1.0', '9.8', 'A/B', 'Cơ bản, Khoa học, Đổi đơn vị & Tỷ giá trực tiếp'],
    ['music', 'Âm nhạc', 'Đa phương tiện', 1, 0, 0, 1, 2, '2.4.2', '28.5', 'A/B', 'Thư viện nhạc, Playlist, Lo-Fi WebAudio & Phát tệp'],
    ['video', 'Trình phát Video', 'Đa phương tiện', 1, 0, 0, 1, 3, '2.0.1', '23.0', 'A', 'Phát video quay/tải lên với Tốc độ & PiP'],
    ['recorder', 'Ghi âm', 'Đa phương tiện', 1, 0, 0, 1, 4, '2.1.5', '15.3', 'A', 'Ghi âm Micro thực & Chuyển giọng nói thành văn bản AI'],
    ['scanner', 'Máy quét', 'Năng suất', 1, 0, 0, 1, 5, '2.2.0', '27.4', 'A', 'Quét tài liệu, Cắt lọc ảnh & Trích xuất chữ OCR AI'],
    ['appstore', 'Kho Ứng dụng', 'Hệ thống', 1, 0, 0, 1, 6, '2.5.0', '32.0', 'B', 'Cửa hàng hệ sinh thái PHONE OS & Quản lý tương thích'],
    ['settings', 'Cài đặt', 'Hệ thống', 1, 0, 0, 1, 7, '2.9.0', '18.0', 'A/B', 'Màn hình, Màn hình khóa, Quyền hạn, Bộ nhớ & Bảo mật'],
    ['health', 'Sức khỏe', 'Phong cách sống', 1, 0, 0, 1, 8, '2.1.0', '25.6', 'B/C', 'Nhật ký vận động, Nước, Giấc ngủ, Cân nặng & Tập luyện'],
    ['wallet', 'Ví', 'Phong cách sống', 1, 0, 0, 1, 9, '2.0.2', '16.0', 'B', 'Thẻ thành viên, Vé sự kiện & Mã QR/Barcode'],
    ['passwords', 'Mật khẩu', 'Bảo mật', 1, 0, 0, 1, 10, '2.2.0', '13.5', 'A', 'Két sắt mã hóa AES-GCM & Tạo mật khẩu mạnh'],
    ['translate', 'Dịch', 'Tiện ích', 1, 0, 0, 1, 11, '2.3.0', '18.9', 'A', 'Dịch đa ngôn ngữ Gemini & Phát âm giọng nói'],
    ['news', 'Tin tức', 'Đọc báo', 1, 0, 0, 1, 12, '2.0.4', '19.1', 'A', 'Bảng tin công nghệ & thế giới trực tiếp kèm Dấu trang'],
    ['books', 'Sách', 'Đọc sách', 1, 0, 0, 1, 13, '2.1.0', '22.4', 'A/B', 'Trình đọc sách tùy chỉnh font, Dấu trang & Nhập tệp'],
    ['shortcuts', 'Phím tắt', 'Tự động hóa', 1, 0, 0, 1, 14, '2.2.0', '14.8', 'B', 'Quy tắc tự động hóa sự kiện OS & Lịch sử chạy'],
    ['games', 'Trò chơi', 'Giải trí', 1, 0, 0, 1, 15, '2.3.0', '36.7', 'B', 'Đố vui Anime, Đoán chữ, Lật thẻ & Visual Novel'],
    ['podcast', 'Podcast', 'Đa phương tiện', 1, 0, 0, 2, 0, '3.0.0', '21.5', 'B', 'Theo dõi chương trình, tải tập ngoại tuyến & hẹn giờ ngủ'],
    ['shopping', 'Mua sắm', 'Đời sống', 1, 0, 0, 2, 1, '3.0.0', '28.0', 'B', 'Cửa hàng mô phỏng, giỏ hàng, mã giảm giá & theo dõi đơn'],
    ['food', 'Đặt đồ ăn', 'Đời sống', 1, 0, 0, 2, 2, '3.0.0', '26.4', 'B', 'Khám phá nhà hàng, chọn topping & theo dõi giao đồ ăn mô phỏng'],
    ['banking', 'Ngân hàng', 'Tài chính', 1, 0, 0, 2, 3, '3.0.0', '24.2', 'B', 'Ngân hàng mô phỏng: số dư ảo, chuyển khoản PIN & hóa đơn'],
    ['ride', 'Đặt xe', 'Du lịch', 1, 0, 0, 2, 4, '3.0.0', '25.8', 'B', 'Đặt xe mô phỏng, ước tính giá, lộ trình tài xế & đánh giá'],
    ['office', 'Office', 'Năng suất', 1, 0, 0, 2, 5, '3.0.0', '35.0', 'A', 'Đọc PDF, soạn thảo văn bản, bảng tính công thức & trình chiếu'],
    ['community', 'Cộng đồng', 'Xã hội', 1, 0, 0, 2, 6, '3.0.0', '29.3', 'B', 'Nhóm công khai/riêng tư, thảo luận, báo cáo & chặn người dùng'],
    ['smarthome', 'Nhà thông minh', 'Tiện ích', 1, 0, 0, 2, 7, '3.0.0', '23.1', 'B', 'Điều khiển phòng, thiết bị, độ sáng/nhiệt độ & cảnh tự động']
  ];

  const insertApp = db.prepare(`
    INSERT INTO installed_apps (
      app_id, name, category, installed, pinned_dock, dock_order, page_index, sort_order, version, size_mb, reality_type, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of apps) {
    insertApp.run(...a);
  }

  // Characters
  const characters = [
    {
      id: 'char_yuki',
      name: 'Yuki Shirakawa',
      age: 21,
      tagline: 'Nhà thiết kế âm thanh Lo-fi & người mơ mộng bên quán cà phê',
      personality: 'Dịu dàng, chu đáo, tinh tế, hơi thơ mộng, luôn trò chuyện ấm áp bằng tiếng Việt tự nhiên.',
      bio: 'Yuki thường dành buổi sáng để phối âm thanh tiếng mưa bên khung cửa sổ quán cà phê góc phố và luôn nhớ những điều nhỏ bé về người cô quan tâm.',
      likes: 'Matcha latte, đĩa than vinyl, chiều mưa, dạo sân thượng yên tĩnh',
      dislikes: 'Buổi sáng vội vã, nơi quá ồn ào, tai nghe bị hỏng',
      voice_name: 'Kore',
      voice_style: 'Giọng nữ nhẹ nhàng, ấm áp, gần gũi',
      avatar: '/src/assets/images/char_yuki_1794880089308.jpg',
      scenario: 'Đang ngồi bên khung cửa sổ quán cà phê đầy nắng với chiếc tai nghe trắng, nhắn tin cho bạn giờ nghỉ.',
      greeting: 'Chào buổi sáng nhé! Ngoài trời vừa tạnh mưa xong, mình đang nghe thử bản lo-fi mới làm. Hôm nay của bạn thế nào?',
      author: 'PHONE OS Studio',
      interactions_count: 1420,
      relationship_level: 3,
      relationship_xp: 65,
      mood: 'Bình yên · Đang nghe tiếng mưa',
      schedule_json: JSON.stringify([
        { time: '08:00', activity: 'Nhắn chào buổi sáng tại quán cà phê' },
        { time: '14:00', activity: 'Phối âm thanh ambient' },
        { time: '20:00', activity: 'Gọi thoại trò chuyện buổi tối' },
        { time: '22:30', activity: 'Ghi chú ngắm sao đêm' }
      ])
    },
    {
      id: 'char_akira',
      name: 'Akira Kurosawa',
      age: 23,
      tagline: 'Kiến trúc sư hệ thống & tay đua xe đạp đêm',
      personality: 'Điềm tĩnh, thực tế, hóm hỉnh, biết quan tâm, luôn đưa ra lời khuyên gọn gàng và sắc sảo.',
      bio: 'Akira xây dựng các hệ thống công nghệ sạch đẹp vào ban ngày và đạp xe fixed-gear qua những cây cầu ánh đèn neon vào ban đêm.',
      likes: 'Cà phê đen, kiến trúc gọn gàng, đạp xe đêm, quán ramen ven đường',
      dislikes: 'Code rối rắm, trễ hẹn, kịch tính không cần thiết',
      voice_name: 'Fenrir',
      voice_style: 'Giọng nam trầm ấm, điềm đạm, tự tin',
      avatar: '/src/assets/images/char_akira_1794880089961.jpg',
      scenario: 'Đang dừng chân hóng gió trên cầu vượt nhìn xuống dòng xe buổi tối.',
      greeting: 'Yo, vừa xong sprint công việc rồi. Tối nay có định ra ngoài hít gió hay cần mình phụ kiểm tra lịch trình tuần này không?',
      author: 'PHONE OS Studio',
      interactions_count: 980,
      relationship_level: 2,
      relationship_xp: 40,
      mood: 'Tập trung · Sẵn sàng đạp xe đêm',
      schedule_json: JSON.stringify([
        { time: '09:30', activity: 'Rà soát kiến trúc hệ thống' },
        { time: '12:30', activity: 'Nhắn hỏi thăm giờ nghỉ trưa' },
        { time: '19:30', activity: 'Đạp xe qua cầu buổi tối' }
      ])
    },
    {
      id: 'char_sakura',
      name: 'Sakura Hinata',
      age: 20,
      tagline: 'Nhiếp ảnh gia phim 35mm & thợ săn hoa anh đào',
      personality: 'Rạng rỡ, nhiệt huyết, ngẫu hứng, thích lưu giữ từng khoảnh khắc đời thường và chia sẻ ảnh đẹp.',
      bio: 'Luôn mang theo chiếc máy ảnh phim cổ điển, Sakura biến mọi buổi chiều bình thường thành chuyến phiêu lưu nhỏ và đăng ảnh lên Mạng Xã hội.',
      likes: 'Phim 35mm, bánh crepe dâu, giờ vàng hoàng hôn, những chuyến đi bất chợt',
      dislikes: 'Máy ảnh hết pin, ở trong nhà cả ngày âm u',
      voice_name: 'Zephyr',
      voice_style: 'Giọng nữ tươi sáng, vui vẻ, giàu biểu cảm',
      avatar: '/src/assets/images/char_sakura_1794880090451.jpg',
      scenario: 'Đang dạo bước dưới hàng hoa anh đào nở rộ với chiếc máy ảnh sẵn sàng.',
      greeting: 'Nè nè! Ánh nắng hôm nay đẹp xỉu luôn á! Cuối tuần này tụi mình đi chụp ảnh ở công viên ven sông nha?',
      author: 'PHONE OS Studio',
      interactions_count: 1680,
      relationship_level: 3,
      relationship_xp: 80,
      mood: 'Hào hứng · Săn nắng giờ vàng',
      schedule_json: JSON.stringify([
        { time: '10:00', activity: 'Đăng ảnh phim buổi sáng' },
        { time: '16:30', activity: 'Đi chụp ảnh giờ vàng' },
        { time: '21:00', activity: 'Tráng phim & trò chuyện' }
      ])
    },
    {
      id: 'char_rin',
      name: 'Rin Tachibana',
      age: 22,
      tagline: 'Nhà thiết kế tạp chí & chiến lược gia giải đố',
      personality: 'Sắc sảo, tinh ý, thích trêu nhẹ, cực kỳ sáng tạo và luôn âm thầm ủng hộ bạn bè.',
      bio: 'Rin biên tập tạp chí kiểu chữ nghệ thuật và thích rủ nhóm bạn thi đố vui trí tuệ vào đêm muộn.',
      likes: 'Espresso, lưới thiết kế Thụy Sĩ, tiểu thuyết trinh thám, đố vui đêm khuya',
      dislikes: 'Bố cục rối mắt, căn chữ cẩu thả, bị spoil truyện',
      voice_name: 'Puck',
      voice_style: 'Giọng thông minh, sắc nét, tinh nghịch',
      avatar: '/src/assets/images/char_rin_1794880090553.jpg',
      scenario: 'Đang làm việc dưới ánh đèn bàn tối giản cùng sổ phác thảo và tách espresso.',
      greeting: 'À, người bận rộn cuối cùng cũng online rồi à? Mình vừa thiết kế xong layout mới và đang đợi bạn chấm điểm đây.',
      author: 'PHONE OS Studio',
      interactions_count: 1150,
      relationship_level: 2,
      relationship_xp: 55,
      mood: 'Sáng tạo · Đang vào guồng thiết kế',
      schedule_json: JSON.stringify([
        { time: '11:00', activity: 'Đánh giá bố cục chữ' },
        { time: '15:00', activity: 'Bình luận trên Mạng Xã hội' },
        { time: '22:00', activity: 'Giờ giải đố đêm khuya' }
      ])
    }
  ];

  const insertChar = db.prepare(`
    INSERT INTO characters (
      id, name, age, tagline, personality, bio, likes, dislikes, voice_name, voice_style, avatar, scenario, greeting, author, interactions_count, relationship_level, relationship_xp, mood, schedule_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of characters) {
    insertChar.run(
      c.id, c.name, c.age, c.tagline, c.personality, c.bio, c.likes, c.dislikes,
      c.voice_name, c.voice_style, c.avatar, c.scenario, c.greeting, c.author,
      c.interactions_count, c.relationship_level, c.relationship_xp, c.mood, c.schedule_json
    );
  }

  // Initial Memories
  const memInsert = db.prepare('INSERT INTO character_memories (id, character_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  memInsert.run('mem_1', 'char_yuki', 'long_term', 'Minh Anh thích nghe nhạc lo-fi mưa rơi vào buổi tối.', 8, now);
  memInsert.run('mem_2', 'char_yuki', 'relationship', 'Đã cùng nhau uống cà phê sáng và chia sẻ playlist đầu tiên.', 9, now);
  memInsert.run('mem_3', 'char_sakura', 'long_term', 'Hẹn cùng đi chụp ảnh hoàng hôn cuối tuần.', 7, now);
  memInsert.run('mem_4', 'char_akira', 'short_term', 'Đang thảo luận về các ứng dụng mới trên PHONE OS.', 6, now);

  // Contacts
  const contactInsert = db.prepare(`
    INSERT INTO contacts (id, name, nickname, phone, email, birthday, address, company, role, notes, avatar, is_favorite, is_ai, character_id, group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  contactInsert.run('ct_yuki', 'Yuki Shirakawa', 'Yuki', '+81 90-1024-8801', 'yuki@animesphere.os', '2005-11-24', 'Quán Cà Phê Góc Phố Shibuya, Tokyo', 'Sound Atelier', 'Thiết kế Âm thanh', 'Thích matcha & nhạc lo-fi', '/src/assets/images/char_yuki_1794880089308.jpg', 1, 1, 'char_yuki', 'Bạn đồng hành AI');
  contactInsert.run('ct_akira', 'Akira Kurosawa', 'Akira', '+81 90-2048-4412', 'akira@animesphere.os', '2003-04-12', 'Cầu Vượt Minato, Tokyo', 'Kuro Systems', 'Kiến trúc sư trưởng', 'Bạn đồng hành đạp xe đêm', '/src/assets/images/char_akira_1794880089961.jpg', 1, 1, 'char_akira', 'Bạn đồng hành AI');
  contactInsert.run('ct_sakura', 'Sakura Hinata', 'Sakura', '+81 90-3096-7723', 'sakura@animesphere.os', '2006-03-29', 'Công viên sông Meguro, Tokyo', 'Hinata Studio', 'Nhiếp ảnh gia Phim', 'Luôn mang thêm cuộn phim dự phòng', '/src/assets/images/char_sakura_1794880090451.jpg', 1, 1, 'char_sakura', 'Bạn đồng hành AI');
  contactInsert.run('ct_rin', 'Rin Tachibana', 'Rin', '+81 90-4012-9934', 'rin@animesphere.os', '2004-08-17', 'Studio Thiết kế Daikanyama', 'Kaizen Press', 'Giám đốc Nghệ thuật', 'Đam mê đố vui & kiểu chữ', '/src/assets/images/char_rin_1794880090553.jpg', 0, 1, 'char_rin', 'Bạn đồng hành AI');

  // Call History
  const callInsert = db.prepare(`
    INSERT INTO call_history (id, contact_id, name, phone, avatar, direction, is_ai, character_id, duration_sec, voicemail_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  callInsert.run('call_1', 'ct_yuki', 'Yuki Shirakawa', '+81 90-1024-8801', '/src/assets/images/char_yuki_1794880089308.jpg', 'incoming', 1, 'char_yuki', 184, '', now);
  callInsert.run('call_2', 'ct_sakura', 'Sakura Hinata', '+81 90-3096-7723', '/src/assets/images/char_sakura_1794880090451.jpg', 'missed', 1, 'char_sakura', 0, 'Nè, khi nào rảnh gọi lại cho mình nha! Mình mới tìm được góc chụp sakura siêu đẹp!', now);

  // Conversations & Messages
  const convInsert = db.prepare(`
    INSERT INTO conversations (id, title, is_group, avatar, character_id, members_json, pinned, unread_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  convInsert.run('conv_yuki', 'Yuki Shirakawa', 0, '/src/assets/images/char_yuki_1794880089308.jpg', 'char_yuki', JSON.stringify(['char_yuki']), 1, 1, now);
  convInsert.run('conv_sakura', 'Sakura Hinata', 0, '/src/assets/images/char_sakura_1794880090451.jpg', 'char_sakura', JSON.stringify(['char_sakura']), 0, 1, now);
  convInsert.run('conv_akira', 'Akira Kurosawa', 0, '/src/assets/images/char_akira_1794880089961.jpg', 'char_akira', JSON.stringify(['char_akira']), 0, 0, now);
  convInsert.run('conv_group_squad', 'Nhóm Cuối Tuần Tokyo', 1, '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', '', JSON.stringify(['char_yuki', 'char_sakura', 'char_akira', 'char_rin']), 1, 0, now);

  const msgInsert = db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  msgInsert.run('msg_1', 'conv_yuki', 'character', 'char_yuki', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'Chào buổi sáng nhé! Ngoài trời vừa tạnh mưa xong, mình đang nghe thử bản lo-fi mới làm. Hôm nay của bạn thế nào?', 'text', '{}', now);
  msgInsert.run('msg_2', 'conv_sakura', 'character', 'char_sakura', 'Sakura Hinata', '/src/assets/images/char_sakura_1794880090451.jpg', 'Nè nè! Cuối tuần này tụi mình đi chụp ảnh ở Công viên sông Meguro lúc 4h chiều nhé? Mình gửi luôn thẻ lịch hẹn để bạn thêm vào Lịch nè!', 'event', JSON.stringify({ title: 'Chụp ảnh Sakura cùng Sakura', location: 'Công viên sông Meguro, Tokyo', startIso: `${today}T16:00:00` }), now);
  msgInsert.run('msg_3', 'conv_akira', 'character', 'char_akira', 'Akira Kurosawa', '/src/assets/images/char_akira_1794880089961.jpg', 'Yo, hệ thống PHONE OS chạy mượt chứ? Nếu cần ghi chú nhanh hay tính tỷ giá thì cứ mở Trợ lý AI hoặc Máy tính nha.', 'text', '{}', now);
  msgInsert.run('msg_4', 'conv_group_squad', 'character', 'char_rin', 'Rin Tachibana', '/src/assets/images/char_rin_1794880090553.jpg', 'Chào cả nhóm! Tối nay có ai tham gia mini-game Đố vui trên Trò chơi không?', 'text', '{}', now);

  // Social Posts & Stories
  const postInsert = db.prepare(`
    INSERT INTO social_posts (id, author_type, author_id, author_name, author_avatar, content, media_url, media_type, hashtags_json, likes_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  postInsert.run('post_1', 'character', 'char_sakura', 'Sakura Hinata', '/src/assets/images/char_sakura_1794880090451.jpg', 'Hoàng hôn hôm nay nhuộm tím cả bầu trời Tokyo luôn 🌸✨ Ai đang rảnh ra ban công ngắm mây cùng mình không?', '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', 'image', JSON.stringify(['#HoangHonTokyo', '#AnhPhimSakura', '#PhoneOS']), 48, now);
  postInsert.run('post_2', 'character', 'char_yuki', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'Một tách latte ấm và bản thu tiếng mưa vừa hoàn thiện. Chúc mọi người một ngày nhẹ nhàng nhé ☕🎧', '/src/assets/images/char_yuki_1794880089308.jpg', 'image', JSON.stringify(['#LoFiBuoiSang', '#AmThanhMua']), 62, now);
  postInsert.run('post_3', 'character', 'char_rin', 'Rin Tachibana', '/src/assets/images/char_rin_1794880090553.jpg', 'Mới dọn lại bàn làm việc theo bảng màu tím-xám tối giản. Cảm hứng thiết kế lên 200%!', '/src/assets/images/char_rin_1794880090553.jpg', 'image', JSON.stringify(['#GocThietKe', '#ToiGian']), 37, now);

  const commentInsert = db.prepare('INSERT INTO social_comments (id, post_id, author_name, author_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  commentInsert.run('cmt_1', 'post_1', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'Màu trời đẹp quá Sakura ơi, hợp làm bìa album lắm!', now);
  commentInsert.run('cmt_2', 'post_1', 'Akira Kurosawa', '/src/assets/images/char_akira_1794880089961.jpg', 'Đang đạp xe ngang cầu thấy đúng góc này luôn.', now);

  const storyInsert = db.prepare('INSERT INTO social_stories (id, author_id, author_name, author_avatar, media_url, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  storyInsert.run('st_1', 'char_yuki', 'Yuki', '/src/assets/images/char_yuki_1794880089308.jpg', '/src/assets/images/char_yuki_1794880089308.jpg', 'Buổi sáng ở quán cà phê ☕', now);
  storyInsert.run('st_2', 'char_sakura', 'Sakura', '/src/assets/images/char_sakura_1794880090451.jpg', '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', 'Săn cánh hoa hoàng hôn 🌸', now);
  storyInsert.run('st_3', 'char_akira', 'Akira', '/src/assets/images/char_akira_1794880089961.jpg', '/src/assets/images/char_akira_1794880089961.jpg', 'Đạp xe qua cầu nửa đêm 🚴', now);

  // Media Assets (Photos Gallery)
  const mediaInsert = db.prepare('INSERT INTO media_assets (id, type, title, data_url, album, is_favorite, location_name, character_id, tags_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  mediaInsert.run('med_1', 'photo', 'Lụa Tím Cực Quang', '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg', 'Tải xuống', 1, 'PHONE OS Studio', '', JSON.stringify(['hinh-nen', 'oai-huong']), now);
  mediaInsert.run('med_2', 'photo', 'Hoàng Hôn Sakura Tokyo', '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', 'Nhân vật AI', 1, 'Sân thượng Tokyo', 'char_sakura', JSON.stringify(['sakura', 'hoang-hon', 'tokyo']), now);
  mediaInsert.run('med_3', 'photo', 'Yuki Buổi Sáng Quán Cà Phê', '/src/assets/images/char_yuki_1794880089308.jpg', 'Nhân vật AI', 1, 'Quán Cà Phê Shibuya', 'char_yuki', JSON.stringify(['yuki', 'chan-dung']), now);
  mediaInsert.run('med_4', 'photo', 'Sakura Dạo Công Viên', '/src/assets/images/char_sakura_1794880090451.jpg', 'Nhân vật AI', 0, 'Công viên Meguro', 'char_sakura', JSON.stringify(['sakura', 'may-anh']), now);

  // Notes
  const noteInsert = db.prepare('INSERT INTO notes (id, title, content, folder, is_pinned, is_locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  noteInsert.run('note_1', 'Kế hoạch cuối tuần với Sakura & Yuki', '- [x] Chuẩn bị máy ảnh & sạc pin\n- [ ] Gặp Sakura ở Công viên sông Meguro lúc 16:00\n- [ ] Nghe thử playlist lo-fi mới của Yuki', 'Cá nhân', 1, 0, now);
  noteInsert.run('note_2', 'Ý tưởng thiết kế PHONE OS', 'Đồng bộ màu tím oải hương (#A78BFA) và hồng sakura (#F472B6).\nKiểm tra lại kết nối giữa Tin nhắn, Lịch và Bản đồ.', 'Công việc', 0, 0, now);

  // Calendar Events
  const calInsert = db.prepare('INSERT INTO calendar_events (id, title, start_iso, end_iso, all_day, location, notes, color, character_id, attendees_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  calInsert.run('cal_1', 'Cà phê sáng & nghe nhạc cùng Yuki', `${today}T09:00:00`, `${today}T10:30:00`, 0, 'Quán Cà Phê Shibuya, Tokyo', 'Mang theo tai nghe để nghe thử bản mix mới.', '#A78BFA', 'char_yuki', JSON.stringify(['Yuki Shirakawa']));
  calInsert.run('cal_2', 'Chụp ảnh hoàng hôn với Sakura', `${today}T16:30:00`, `${today}T18:00:00`, 0, 'Công viên sông Meguro, Tokyo', 'Chờ giờ vàng ánh nắng.', '#F472B6', 'char_sakura', JSON.stringify(['Sakura Hinata']));
  calInsert.run('cal_3', 'Sinh nhật Yuki Shirakawa 🎂', '2026-11-24T00:00:00', '2026-11-24T23:59:00', 1, 'Tokyo', 'Chuẩn bị quà đĩa than vinyl!', '#EC4899', 'char_yuki', JSON.stringify(['Yuki Shirakawa', 'Sakura Hinata', 'Akira Kurosawa']));

  // Reminders
  const remInsert = db.prepare('INSERT INTO reminders (id, title, notes, due_date, due_time, priority, list_name, is_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  remInsert.run('rem_1', 'Uống đủ 2L nước hôm nay', 'Theo dõi trong ứng dụng Sức khỏe', today, '14:00', 'medium', 'Cá nhân', 0);
  remInsert.run('rem_2', 'Trả lời tin nhắn hẹn chụp ảnh của Sakura', 'Xác nhận giờ hẹn 16:30 tại Meguro', today, '12:00', 'high', 'Sự kiện', 0);

  // Emails
  const mailInsert = db.prepare('INSERT INTO emails (id, folder, from_name, from_email, to_email, subject, body, attachment_name, attachment_content, is_starred, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  mailInsert.run('mail_1', 'inbox', 'Yuki Shirakawa', 'yuki@animesphere.os', 'minhanh@phoneos.local', 'Tracklist Lo-Fi Mưa Tháng 11', 'Chào Minh Anh,\n\nMình vừa gửi kèm ghi chú tracklist cho album ambient mới nhất. Khi nào rảnh bạn mở xem thử và cho mình xin góp ý nhé!\n\nThân,\nYuki', 'LoFi_Tracklist.txt', '1. Mưa Trên Kính Shibuya (03:24)\n2. Hương Matcha Ấm (02:50)\n3. Vọng Âm Chuyến Tàu Đêm (04:12)', 1, 0, now);
  mailInsert.run('mail_2', 'inbox', 'Đội ngũ PHONE OS', 'system@phoneos.local', 'minhanh@phoneos.local', 'Chào mừng đến với PHONE OS 2.0', 'Hệ sinh thái smartphone giả lập của bạn đã sẵn sàng với 32 ứng dụng liên kết, trợ lý Gemini và dàn nhân vật AI Anime sống động.', '', '', 0, 1, now);

  // Files
  const fileInsert = db.prepare('INSERT INTO files (id, name, folder, mime_type, size_bytes, content_text, data_url, is_favorite, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  fileInsert.run('file_1', 'Huong_Dan_PHONE_OS.txt', 'Tài liệu', 'text/plain', 420, 'PHONE OS — ĐIỆN THOẠI CỦA BẠN. THẾ GIỚI CỦA BẠN.\n\nMẹo nhanh:\n- Kéo hoặc nhấn thanh trạng thái để mở Trung tâm Điều khiển hoặc Thông báo.\n- Nhấn chuột phải vào biểu tượng ứng dụng để mở Tác vụ nhanh.\n- Chụp ảnh bằng Máy ảnh sẽ tự lưu vào Ảnh và kích hoạt Phím tắt nếu được bật.', '', 1, now);
  fileInsert.run('file_2', 'LoFi_Tracklist.txt', 'Tải xuống', 'text/plain', 198, '1. Mưa Trên Kính Shibuya (03:24)\n2. Hương Matcha Ấm (02:50)\n3. Vọng Âm Chuyến Tàu Đêm (04:12)', '', 0, now);

  // Bookmarks & History
  db.prepare('INSERT INTO browser_bookmarks (id, title, url, folder, created_at) VALUES (?, ?, ?, ?, ?)').run('bm_1', 'Wikipedia Tiếng Việt', 'https://vi.wikipedia.org/wiki/Trang_Ch%C3%ADnh', 'Tham khảo', now);
  db.prepare('INSERT INTO browser_bookmarks (id, title, url, folder, created_at) VALUES (?, ?, ?, ?, ?)').run('bm_2', 'OpenStreetMap', 'https://www.openstreetmap.org', 'Bản đồ', now);
  db.prepare('INSERT INTO browser_bookmarks (id, title, url, folder, created_at) VALUES (?, ?, ?, ?, ?)').run('bm_3', 'Open-Meteo Thời tiết', 'https://open-meteo.com', 'Thời tiết', now);

  // Alarms & World Clocks
  db.prepare('INSERT INTO alarms (id, time_str, label, repeat_days, sound, enabled) VALUES (?, ?, ?, ?, ?, ?)').run('alm_1', '07:30', 'Thức dậy cùng nhạc Lo-Fi', 'T2-T6', 'Chuông nhẹ', 1);
  db.prepare('INSERT INTO alarms (id, time_str, label, repeat_days, sound, enabled) VALUES (?, ?, ?, ?, ?, ?)').run('alm_2', '22:30', 'Thư giãn & Đi ngủ', 'Hằng ngày', 'Chuông Cực Quang', 0);

  db.prepare('INSERT INTO world_clocks (id, city, timezone) VALUES (?, ?, ?)').run('wc_1', 'TP. Hồ Chí Minh', 'Asia/Ho_Chi_Minh');
  db.prepare('INSERT INTO world_clocks (id, city, timezone) VALUES (?, ?, ?)').run('wc_2', 'Tokyo', 'Asia/Tokyo');
  db.prepare('INSERT INTO world_clocks (id, city, timezone) VALUES (?, ?, ?)').run('wc_3', 'Luân Đôn', 'Europe/London');
  db.prepare('INSERT INTO world_clocks (id, city, timezone) VALUES (?, ?, ?)').run('wc_4', 'New York', 'America/New_York');

  // Wallet Cards (Simulated)
  db.prepare('INSERT INTO wallet_cards (id, card_type, title, subtitle, code_value, color, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('wal_1', 'member', 'Thành viên Shibuya Café', 'Hạng Vàng · 420 điểm', 'POS-CAFE-88421', '#A78BFA', '2027-12-31');
  db.prepare('INSERT INTO wallet_cards (id, card_type, title, subtitle, code_value, color, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('wal_2', 'event', 'Triển lãm Âm nhạc Anime Tokyo', 'Vé VIP · Cổng B', 'EXPO-VIP-2026-09', '#F472B6', '2026-12-15');
  db.prepare('INSERT INTO wallet_cards (id, card_type, title, subtitle, code_value, color, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('wal_3', 'transit', 'Thẻ Tàu Điện IC (Mô phỏng)', 'Thẻ theo dõi số dư', 'IC-TRANSIT-77102', '#38BDF8', '2028-01-01');

  // Shortcuts
  db.prepare('INSERT INTO shortcuts (id, name, trigger_event, action_type, action_payload, enabled) VALUES (?, ?, ?, ?, ?, ?)').run('sc_1', 'Tự động báo khi lưu ảnh', 'photo_captured', 'notify', JSON.stringify({ title: 'Ảnh', body: 'Ảnh mới chụp đã được lưu vào thư viện!' }), 1);
  db.prepare('INSERT INTO shortcuts (id, name, trigger_event, action_type, action_payload, enabled) VALUES (?, ?, ?, ?, ?, ?)').run('sc_2', 'Bật Không làm phiền khi ngủ', 'bedtime_toggle', 'set_dnd', JSON.stringify({ dnd: true }), 1);
  db.prepare('INSERT INTO shortcuts (id, name, trigger_event, action_type, action_payload, enabled) VALUES (?, ?, ?, ?, ?, ?)').run('sc_3', 'Đồng bộ việc xong vào Lịch', 'reminder_completed', 'log_calendar', JSON.stringify({ color: '#10B981' }), 1);

  // Books
  db.prepare('INSERT INTO books (id, title, author, cover_color, pages_json, current_page) VALUES (?, ?, ?, ?, ?, ?)').run(
    'book_1',
    'Nhật Ký Mưa Shibuya',
    'Yuki Shirakawa',
    '#8B5CF6',
    JSON.stringify([
      'Chương 1: Tiếng Mưa Đầu Mùa\n\nNhững giọt mưa đầu tiên rơi xuống mái hiên quán cà phê góc phố Shibuya mang theo mùi nhựa đường ướt và hương matcha rang ấm áp. Ở chiếc bàn gần cửa sổ, chiếc tai nghe trắng nằm lặng lẽ bên cuốn sổ ký âm.\n\nÂm thanh của thành phố không bao giờ ồn ào nếu bạn biết cách lắng nghe nhịp điệu của nó: tiếng tàu điện lướt qua cầu vượt, tiếng chuông gió khẽ rung, và bước chân vội vã dưới những tán ô trong suốt.',
      'Chương 2: Tần Số Ký Ức\n\nMỗi người chúng ta đều mang theo một bản nhạc nền vô hình. Đôi khi chỉ cần một tin nhắn hỏi thăm vào buổi sáng, cả ngày dài bỗng nhiên đổi sang gam màu ấm hơn hẳn.\n\nHôm nay, mình đã thu lại tiếng mưa rơi lên ô cửa kính để ghép vào track nhạc mới. Biết đâu tối nay khi bật lên, ai đó ở đầu dây bên kia cũng sẽ thấy lòng dịu lại.',
      'Chương 3: Ánh Đèn Hoàng Hôn\n\nKhi cơn mưa tạnh hẳn, bầu trời Tokyo chuyển sang sắc tím hoa cà pha lẫn ánh hồng nhạt. Sakura gọi điện rủ cả nhóm mang máy ảnh lên sân thượng trước khi mặt trời khuất hẳn sau tháp truyền hình.\n\nVà thế là một buổi chiều bình thường lại biến thành một kỷ niệm đáng nhớ.'
    ]),
    0
  );
  db.prepare('INSERT INTO books (id, title, author, cover_color, pages_json, current_page) VALUES (?, ?, ?, ?, ?, ?)').run(
    'book_2',
    'Nghệ Thuật Hệ Thống Di Động Tối Giản',
    'Rin Tachibana',
    '#EC4899',
    JSON.stringify([
      'Phần I: Rõ Ràng Hơn Rườm Rà\n\nMột hệ điều hành cá nhân không bao giờ nên làm bạn rối mắt. Từng điểm ảnh tồn tại để giúp bạn định hướng hoặc thực hiện ý định chỉ bằng một chạm.\n\nGiao diện xuất sắc luôn tôn trọng khoảng thở, kiểu chữ và nhịp điệu phản hồi.',
      'Phần II: Hệ Sinh Thái Gắn Kết\n\nKhi Máy ảnh, Thư viện Ảnh, Lịch và Tin nhắn nói cùng một ngôn ngữ, mọi thao tác trở nên liền mạch. Một bức ảnh thành câu chuyện; một lời hẹn thành kỷ niệm đáng nhớ.'
    ]),
    0
  );

  // Notifications
  const notifInsert = db.prepare('INSERT INTO notifications (id, app_id, group_key, title, body, avatar, action_route, action_payload, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  notifInsert.run('notif_1', 'messages', 'Tin nhắn', 'Yuki Shirakawa', 'Chào buổi sáng nhé! Ngoài trời vừa tạnh mưa xong...', '/src/assets/images/char_yuki_1794880089308.jpg', 'messages', 'conv_yuki', 1, now);
  notifInsert.run('notif_2', 'messages', 'Tin nhắn', 'Sakura Hinata', 'Cuối tuần này tụi mình đi chụp ảnh ở Công viên sông Meguro nha!', '/src/assets/images/char_sakura_1794880090451.jpg', 'messages', 'conv_sakura', 1, now);
  notifInsert.run('notif_3', 'calendar', 'Lịch', 'Lịch sắp tới', 'Cà phê sáng & nghe nhạc cùng Yuki lúc 09:00', '', 'calendar', 'cal_1', 0, now);
}
