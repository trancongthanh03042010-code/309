import type Database from 'better-sqlite3';

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initOS3Database(db: Database.Database): void {
  // 1. Safe migrations on user_profile
  ensureColumn(db, 'user_profile', 'bio', "TEXT DEFAULT 'Đam mê công nghệ & thế giới Anime AI'");
  ensureColumn(db, 'user_profile', 'language', "TEXT DEFAULT 'vi'");
  ensureColumn(db, 'user_profile', 'timezone', "TEXT DEFAULT 'Asia/Ho_Chi_Minh'");
  ensureColumn(db, 'user_profile', 'clock_24h', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'game_time_offset_min', 'INTEGER DEFAULT 0');

  ensureColumn(db, 'user_profile', 'show_battery_pct', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'low_battery_threshold', 'INTEGER DEFAULT 20');
  ensureColumn(db, 'user_profile', 'auto_saver_threshold', 'INTEGER DEFAULT 15');
  ensureColumn(db, 'user_profile', 'charging', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'fast_charging', 'INTEGER DEFAULT 0');

  ensureColumn(db, 'user_profile', 'vpn_on', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'nfc_on', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'selected_wifi', "TEXT DEFAULT 'PhoneOS-5G-Studio'");

  ensureColumn(db, 'user_profile', 'sound_profile', "TEXT DEFAULT 'normal'");
  ensureColumn(db, 'user_profile', 'vol_ring', 'INTEGER DEFAULT 80');
  ensureColumn(db, 'user_profile', 'vol_notif', 'INTEGER DEFAULT 75');
  ensureColumn(db, 'user_profile', 'vol_media', 'INTEGER DEFAULT 75');
  ensureColumn(db, 'user_profile', 'vol_call', 'INTEGER DEFAULT 85');
  ensureColumn(db, 'user_profile', 'vol_alarm', 'INTEGER DEFAULT 90');
  ensureColumn(db, 'user_profile', 'sys_sounds', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'kb_sounds', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'cam_shutter', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'haptic_touch', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'haptic_call', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'haptic_msg', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'vibrate_intensity', "TEXT DEFAULT 'medium'");
  ensureColumn(db, 'user_profile', 'vibrate_pattern', "TEXT DEFAULT 'pulse'");
  ensureColumn(db, 'user_profile', 'ringtone', "TEXT DEFAULT 'Ánh Sao Đêm'");
  ensureColumn(db, 'user_profile', 'msg_tone', "TEXT DEFAULT 'Giọt Sương'");
  ensureColumn(db, 'user_profile', 'notif_tone', "TEXT DEFAULT 'Tinh Thể'");

  ensureColumn(db, 'user_profile', 'auto_lock_sec', 'INTEGER DEFAULT 120');
  ensureColumn(db, 'user_profile', 'font_weight', "TEXT DEFAULT 'normal'");
  ensureColumn(db, 'user_profile', 'ui_zoom', "TEXT DEFAULT 'normal'");
  ensureColumn(db, 'user_profile', 'anim_level', "TEXT DEFAULT 'full'");
  ensureColumn(db, 'user_profile', 'high_contrast', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'reduce_motion', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'icon_labels', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'lock_wallpaper', "TEXT DEFAULT ''");
  ensureColumn(db, 'user_profile', 'wallpaper_pos', "TEXT DEFAULT '50% 50%'");
  ensureColumn(db, 'user_profile', 'transition_style', "TEXT DEFAULT 'slide'");

  ensureColumn(db, 'user_profile', 'pin_hash', "TEXT DEFAULT ''");
  ensureColumn(db, 'user_profile', 'pin_length', 'INTEGER DEFAULT 4');
  ensureColumn(db, 'user_profile', 'guest_mode', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'user_profile', 'failed_unlock_count', 'INTEGER DEFAULT 0');

  ensureColumn(db, 'user_profile', 'focus_mode', "TEXT DEFAULT 'off'");
  ensureColumn(db, 'user_profile', 'focus_schedule_json', "TEXT DEFAULT '{\"enabled\":false,\"start\":\"23:00\",\"end\":\"07:00\",\"allowAlarms\":true,\"allowFavContacts\":true}'");
  ensureColumn(db, 'user_profile', 'muted_apps_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'user_profile', 'quiet_start', "TEXT DEFAULT '23:00'");
  ensureColumn(db, 'user_profile', 'quiet_end', "TEXT DEFAULT '07:00'");
  ensureColumn(db, 'user_profile', 'proactive_ai_enabled', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'user_profile', 'proactive_ai_level', "TEXT DEFAULT 'medium'");
  ensureColumn(db, 'user_profile', 'ai_memory_enabled', 'INTEGER DEFAULT 1');

  ensureColumn(db, 'user_profile', 'home_columns', 'INTEGER DEFAULT 4');
  ensureColumn(db, 'user_profile', 'icon_pack', "TEXT DEFAULT 'default'");
  ensureColumn(db, 'user_profile', 'dock_pos', "TEXT DEFAULT 'bottom'");
  ensureColumn(db, 'user_profile', 'kb_theme', "TEXT DEFAULT 'auto'");
  ensureColumn(db, 'user_profile', 'kb_height', "TEXT DEFAULT 'medium'");

  // Safe migrations on characters
  ensureColumn(db, 'characters', 'pronouns', "TEXT DEFAULT 'Mình - Bạn'");
  ensureColumn(db, 'characters', 'cover_image', "TEXT DEFAULT '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'");
  ensureColumn(db, 'characters', 'speaking_style', "TEXT DEFAULT 'Ấm áp, tự nhiên, giàu cảm xúc'");
  ensureColumn(db, 'characters', 'role_title', "TEXT DEFAULT 'Bạn đồng hành AI'");
  ensureColumn(db, 'characters', 'other_relations_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'characters', 'activity_status', "TEXT DEFAULT 'Đang hoạt động'");
  ensureColumn(db, 'characters', 'is_blocked', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'characters', 'memory_enabled', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'characters', 'content_boundary', "TEXT DEFAULT 'standard'");

  // Safe migration on media_assets
  ensureColumn(db, 'media_assets', 'category', "TEXT DEFAULT 'đời thường'");
  ensureColumn(db, 'media_assets', 'caption', "TEXT DEFAULT ''");

  // 2. OS 3.0 New Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      last_active TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS wifi_networks (
      ssid TEXT PRIMARY KEY,
      security TEXT DEFAULT 'WPA3',
      signal INTEGER DEFAULT 85,
      is_saved INTEGER DEFAULT 0,
      password_hash TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bluetooth_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      connected INTEGER DEFAULT 0,
      paired INTEGER DEFAULT 1,
      battery_pct INTEGER DEFAULT 90
    );

    CREATE TABLE IF NOT EXISTS app_permissions (
      app_id TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      status TEXT DEFAULT 'prompt',
      reason TEXT NOT NULL,
      last_accessed_at TEXT DEFAULT '',
      PRIMARY KEY (app_id, permission_key)
    );

    CREATE TABLE IF NOT EXISTS home_widgets (
      id TEXT PRIMARY KEY,
      widget_type TEXT NOT NULL,
      title TEXT NOT NULL,
      size TEXT DEFAULT '2x2',
      page_index INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      os_version TEXT NOT NULL,
      integrity_hash TEXT NOT NULL,
      size_kb REAL DEFAULT 0,
      summary_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      conflict_policy TEXT DEFAULT 'newest',
      synced_at TEXT NOT NULL,
      detail TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS system_errors (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      error_code TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT DEFAULT '',
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      payload_json TEXT DEFAULT '{}',
      run_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battery_history (
      id TEXT PRIMARY KEY,
      level INTEGER NOT NULL,
      charging INTEGER DEFAULT 0,
      recorded_at TEXT NOT NULL
    );

    -- Living AI World Extended Tables
    CREATE TABLE IF NOT EXISTS ai_relationships (
      character_id TEXT PRIMARY KEY,
      affection INTEGER DEFAULT 35,
      trust INTEGER DEFAULT 40,
      familiarity INTEGER DEFAULT 45,
      respect INTEGER DEFAULT 50,
      jealousy INTEGER DEFAULT 5,
      conflict INTEGER DEFAULT 0,
      stage TEXT DEFAULT 'Bạn bè',
      history_json TEXT DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_events (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      chapter INTEGER DEFAULT 1,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      choices_json TEXT DEFAULT '[]',
      chosen_option TEXT DEFAULT '',
      impact_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'available',
      created_at TEXT NOT NULL
    );

    -- 11. Podcast
    CREATE TABLE IF NOT EXISTS podcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      host TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      cover_url TEXT NOT NULL,
      is_followed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS podcast_episodes (
      id TEXT PRIMARY KEY,
      podcast_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_sec INTEGER DEFAULT 600,
      progress_sec INTEGER DEFAULT 0,
      is_downloaded INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      published_at TEXT NOT NULL
    );

    -- 12. Shopping
    CREATE TABLE IF NOT EXISTS shopping_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      original_price INTEGER NOT NULL,
      rating REAL DEFAULT 4.8,
      stock INTEGER DEFAULT 20,
      image_url TEXT NOT NULL,
      description TEXT NOT NULL,
      variants_json TEXT DEFAULT '{}',
      is_featured INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shopping_cart (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      selected_variant TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS shopping_orders (
      id TEXT PRIMARY KEY,
      items_json TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER DEFAULT 0,
      shipping_fee INTEGER DEFAULT 0,
      total INTEGER NOT NULL,
      coupon_code TEXT DEFAULT '',
      address TEXT NOT NULL,
      status TEXT DEFAULT 'Chờ xác nhận',
      history_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 13. Food Delivery
    CREATE TABLE IF NOT EXISTS food_restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cuisine TEXT NOT NULL,
      rating REAL DEFAULT 4.8,
      eta_min INTEGER DEFAULT 25,
      price_tier TEXT DEFAULT '$$',
      hours TEXT DEFAULT '08:00 - 22:30',
      address TEXT NOT NULL,
      image_url TEXT NOT NULL,
      menu_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS food_orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total INTEGER NOT NULL,
      delivery_address TEXT NOT NULL,
      payment_method TEXT DEFAULT 'Ví mô phỏng',
      status TEXT DEFAULT 'Đã nhận đơn',
      driver_name TEXT DEFAULT 'Nguyễn Minh Khôi',
      driver_plate TEXT DEFAULT '59-X3 842.19',
      rating INTEGER DEFAULT 0,
      review_text TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    -- 14. Banking Demo
    CREATE TABLE IF NOT EXISTS banking_accounts_demo (
      id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      balance INTEGER NOT NULL,
      pin_hash TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS banking_transactions_demo (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      tx_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      counterparty TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'Thành công',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banking_bills_demo (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      bill_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      is_paid INTEGER DEFAULT 0,
      paid_at TEXT DEFAULT ''
    );

    -- 15. Ride Demo
    CREATE TABLE IF NOT EXISTS ride_trips (
      id TEXT PRIMARY KEY,
      pickup TEXT NOT NULL,
      dropoff TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      fare INTEGER NOT NULL,
      driver_name TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      eta_min INTEGER DEFAULT 4,
      status TEXT DEFAULT 'Đang tìm tài xế',
      rating INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 16. Office & Docs
    CREATE TABLE IF NOT EXISTS office_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      folder TEXT DEFAULT 'Tài liệu',
      content_json TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_shared INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    -- 17. Community
    CREATE TABLE IF NOT EXISTS community_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      topic TEXT NOT NULL,
      description TEXT NOT NULL,
      is_private INTEGER DEFAULT 0,
      is_joined INTEGER DEFAULT 1,
      members_count INTEGER DEFAULT 128
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      likes_count INTEGER DEFAULT 0,
      is_liked INTEGER DEFAULT 0,
      is_saved INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      reported INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      parent_id TEXT DEFAULT '',
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 18. Smart Home Demo
    CREATE TABLE IF NOT EXISTS smart_devices (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      is_on INTEGER DEFAULT 0,
      value_num INTEGER DEFAULT 80,
      unit TEXT DEFAULT '%',
      is_online INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS smart_scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_time TEXT DEFAULT '',
      auto_enabled INTEGER DEFAULT 0,
      actions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smart_logs (
      id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  seedOS3Data(db);
}

function seedOS3Data(db: Database.Database): void {
  const now = new Date().toISOString();

  // Devices
  if ((db.prepare('SELECT COUNT(*) as c FROM devices').get() as { c: number }).c === 0) {
    db.prepare('INSERT INTO devices (id, name, platform, last_active, is_current) VALUES (?, ?, ?, ?, ?)').run(
      'dev_current', 'PHONE OS 3.0 Web/Android', 'Browser / PWA', now, 1
    );
    db.prepare('INSERT INTO devices (id, name, platform, last_active, is_current) VALUES (?, ?, ?, ?, ?)').run(
      'dev_tablet', 'Máy tính bảng Studio', 'PHONE OS Tablet Mode', now, 0
    );
  }

  // Wi-Fi
  if ((db.prepare('SELECT COUNT(*) as c FROM wifi_networks').get() as { c: number }).c === 0) {
    const w = db.prepare('INSERT INTO wifi_networks (ssid, security, signal, is_saved, password_hash) VALUES (?, ?, ?, ?, ?)');
    w.run('PhoneOS-5G-Studio', 'WPA3', 96, 1, 'hashed_demo_1');
    w.run('Shibuya-Cafe-Free', 'Mở', 82, 1, '');
    w.run('AnimeWorld-Mesh-6E', 'WPA2/WPA3', 74, 0, '');
    w.run('Neighbors-Fiber', 'WPA2', 45, 0, '');
  }

  // Bluetooth
  if ((db.prepare('SELECT COUNT(*) as c FROM bluetooth_devices').get() as { c: number }).c === 0) {
    const b = db.prepare('INSERT INTO bluetooth_devices (id, name, device_type, connected, paired, battery_pct) VALUES (?, ?, ?, ?, ?, ?)');
    b.run('bt_1', 'Tai nghe Sakura Buds Pro', 'earbuds', 1, 1, 88);
    b.run('bt_2', 'Loa Lo-Fi Yuki Mini', 'speaker', 0, 1, 64);
    b.run('bt_3', 'Đồng hồ thông minh OS Watch', 'watch', 1, 1, 92);
    b.run('bt_4', 'Bàn phím cơ Keychron K3', 'keyboard', 0, 0, 75);
  }

  // Battery history
  if ((db.prepare('SELECT COUNT(*) as c FROM battery_history').get() as { c: number }).c === 0) {
    const bh = db.prepare('INSERT INTO battery_history (id, level, charging, recorded_at) VALUES (?, ?, ?, ?)');
    const levels = [98, 95, 92, 90, 88, 86];
    levels.forEach((lvl, idx) => {
      const dt = new Date(Date.now() - (levels.length - 1 - idx) * 3600_000).toISOString();
      bh.run(`bh_${idx}`, lvl, 0, dt);
    });
  }

  // App Permissions
  if ((db.prepare('SELECT COUNT(*) as c FROM app_permissions').get() as { c: number }).c === 0) {
    const p = db.prepare('INSERT INTO app_permissions (app_id, permission_key, status, reason, last_accessed_at) VALUES (?, ?, ?, ?, ?)');
    p.run('camera', 'camera', 'prompt', 'Chụp ảnh và quay video trực tiếp từ thiết bị', '');
    p.run('camera', 'photos', 'granted', 'Lưu ảnh và video mới chụp vào thư viện Ảnh', now);
    p.run('recorder', 'microphone', 'prompt', 'Ghi âm giọng nói và chuyển thành văn bản', '');
    p.run('maps', 'location', 'prompt', 'Xác định vị trí hiện tại trên bản đồ OpenStreetMap', '');
    p.run('weather', 'location', 'prompt', 'Tải dự báo thời tiết theo tọa độ GPS', '');
    p.run('messages', 'notifications', 'granted', 'Hiển thị thông báo tin nhắn mới từ nhân vật AI', now);
    p.run('messages', 'contacts', 'granted', 'Chọn người nhận từ Danh bạ hệ thống', now);
    p.run('calendar', 'calendar', 'granted', 'Tạo và nhắc lịch hẹn cá nhân', now);
    p.run('scanner', 'camera', 'prompt', 'Quét tài liệu và nhận dạng văn bản OCR', '');
    p.run('files', 'files', 'granted', 'Đọc, tải lên và chia sẻ tài liệu cá nhân', now);
    p.run('ride', 'location', 'prompt', 'Gợi ý điểm đón mô phỏng gần bạn', '');
    p.run('smarthome', 'bluetooth', 'while_using', 'Kết nối mô phỏng thiết bị nhà thông minh gần đây', '');
  }

  // Home Widgets
  if ((db.prepare('SELECT COUNT(*) as c FROM home_widgets').get() as { c: number }).c === 0) {
    const hw = db.prepare('INSERT INTO home_widgets (id, widget_type, title, size, page_index, sort_order, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
    hw.run('wd_weather', 'weather_calendar', 'Thời tiết & Lịch', '2x2', 0, 0, '{}');
    hw.run('wd_ai', 'ai_companion', 'Nhân vật AI & Sức khỏe', '2x2', 0, 1, JSON.stringify({ characterId: 'char_yuki' }));
  }

  // AI Relationships & Story Events
  if ((db.prepare('SELECT COUNT(*) as c FROM ai_relationships').get() as { c: number }).c === 0) {
    const rel = db.prepare(`
      INSERT INTO ai_relationships (character_id, affection, trust, familiarity, respect, jealousy, conflict, stage, history_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rel.run('char_yuki', 68, 74, 72, 78, 8, 0, 'Thân thiết', JSON.stringify([{ time: now, delta: '+5 Tin tưởng', reason: 'Cùng nghe playlist lo-fi đầu tiên' }]), now);
    rel.run('char_sakura', 72, 69, 76, 70, 12, 0, 'Thân thiết', JSON.stringify([{ time: now, delta: '+6 Tình cảm', reason: 'Hẹn đi chụp ảnh hoa anh đào cuối tuần' }]), now);
    rel.run('char_akira', 48, 66, 58, 82, 0, 0, 'Bạn bè', JSON.stringify([{ time: now, delta: '+4 Tôn trọng', reason: 'Thảo luận về kiến trúc hệ thống' }]), now);
    rel.run('char_rin', 52, 60, 62, 76, 4, 2, 'Bạn bè', JSON.stringify([{ time: now, delta: '+3 Thân quen', reason: 'Tham gia đố vui thiết kế' }]), now);
  }

  if ((db.prepare('SELECT COUNT(*) as c FROM ai_events').get() as { c: number }).c === 0) {
    const ev = db.prepare(`
      INSERT INTO ai_events (id, character_id, chapter, event_type, title, summary, choices_json, chosen_option, impact_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    ev.run(
      'ev_yuki_rain',
      'char_yuki',
      1,
      'Cuộc hẹn',
      'Chương 1: Buổi chiều mưa ở quán cà phê Shibuya',
      'Yuki rủ bạn ghé quán cà phê quen để cùng nghe thử bản thu tiếng mưa vừa phối xong.',
      JSON.stringify([
        { id: 'c1', label: 'Nhận lời ngay và mang theo chiếc bánh ngọt nhỏ', affection: 6, trust: 5, familiarity: 4, conflict: 0 },
        { id: 'c2', label: 'Hẹn nghe online qua cuộc gọi thoại tối nay', affection: 3, trust: 4, familiarity: 2, conflict: 0 },
        { id: 'c3', label: 'Xin khất sang cuối tuần vì đang bận việc', affection: -1, trust: 2, familiarity: 0, conflict: 1 },
      ]),
      '',
      '{}',
      'available',
      now
    );
    ev.run(
      'ev_sakura_festival',
      'char_sakura',
      1,
      'Lễ hội',
      'Chương 1: Săn ánh hoàng hôn công viên Meguro',
      'Sakura vừa mua cuộn phim 35mm mới và muốn chụp một bộ ảnh hoàng hôn cùng bạn.',
      JSON.stringify([
        { id: 'c1', label: 'Đồng ý làm người mẫu và chụp giúp cô ấy vài tấm', affection: 7, trust: 4, familiarity: 6, conflict: 0 },
        { id: 'c2', label: 'Đề xuất rủ thêm Yuki và Akira đi cùng cho vui', affection: 3, trust: 5, familiarity: 5, conflict: 0 },
      ]),
      '',
      '{}',
      'available',
      now
    );
    ev.run(
      'ev_rin_debate',
      'char_rin',
      1,
      'Thử thách',
      'Chương 1: Cuộc tranh luận về thiết kế tối giản',
      'Rin gửi bạn hai bản layout tạp chí và muốn nghe nhận xét thật lòng của bạn.',
      JSON.stringify([
        { id: 'c1', label: 'Góp ý thẳng thắn từng chi tiết lưới và khoảng trắng', affection: 4, trust: 7, familiarity: 4, conflict: 0 },
        { id: 'c2', label: 'Khen cả hai bản đều ổn để tránh mất lòng', affection: 1, trust: -2, familiarity: 1, conflict: 2 },
      ]),
      '',
      '{}',
      'available',
      now
    );
  }

  // Update AI character metadata cleanly
  db.prepare("UPDATE characters SET pronouns = 'Mình - Bạn', role_title = 'Nhà thiết kế âm thanh Lo-Fi', speaking_style = 'Nhẹ nhàng, tinh tế, hay dùng ẩn dụ âm thanh', activity_status = 'Đang hoạt động' WHERE id = 'char_yuki'").run();
  db.prepare("UPDATE characters SET pronouns = 'Mình - Cậu', role_title = 'Nhiếp ảnh gia Phim 35mm', speaking_style = 'Năng động, nhiệt tình, dùng nhiều emoji hoa và máy ảnh', activity_status = 'Đang hoạt động' WHERE id = 'char_sakura'").run();
  db.prepare("UPDATE characters SET pronouns = 'Mình - Bạn', role_title = 'Kiến trúc sư Hệ thống', speaking_style = 'Ngắn gọn, thực tế, hài hước kín đáo', activity_status = 'Đang bận'").run();
  db.prepare("UPDATE characters SET pronouns = 'Tôi - Bạn', role_title = 'Biên tập & Thiết kế Tạp chí', speaking_style = 'Sắc sảo, hay trêu nhẹ nhưng quan tâm ngầm', activity_status = 'Đang hoạt động' WHERE id = 'char_rin'").run();

  // 11. Podcasts
  if ((db.prepare('SELECT COUNT(*) as c FROM podcasts').get() as { c: number }).c === 0) {
    const p = db.prepare('INSERT INTO podcasts (id, title, host, category, description, cover_url, is_followed) VALUES (?, ?, ?, ?, ?, ?, ?)');
    p.run('pod_1', 'Tần Số Shibuya', 'Yuki Shirakawa', 'Đời sống', 'Những câu chuyện êm dịu bên ly cà phê và âm thanh phố đêm Tokyo.', '/src/assets/images/char_yuki_1794880089308.jpg', 1);
    p.run('pod_2', 'Kiến Trúc Số 4.0', 'Akira Kurosawa', 'Công nghệ', 'Bàn về thiết kế hệ điều hành, AI cục bộ và tương lai di động.', '/src/assets/images/char_akira_1794880089961.jpg', 1);
    p.run('pod_3', 'Góc Nhìn Phim 35mm', 'Sakura Hinata', 'Giải trí', 'Nhật ký săn ánh sáng, nhiếp ảnh đường phố và du lịch Nhật Bản.', '/src/assets/images/char_sakura_1794880090451.jpg', 0);
    p.run('pod_4', 'Học Thiết Kế Mỗi Ngày', 'Rin Tachibana', 'Học tập', '15 phút mỗi ngày nâng cấp tư duy thị giác và kiểu chữ.', '/src/assets/images/char_rin_1794880090553.jpg', 0);

    const ep = db.prepare('INSERT INTO podcast_episodes (id, podcast_id, title, description, duration_sec, progress_sec, is_downloaded, is_favorite, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    ep.run('ep_1', 'pod_1', 'Tập 12: Tiếng mưa rơi và nghệ thuật nghỉ ngơi', 'Cách lắng nghe nhịp điệu thành phố để giảm căng thẳng cuối tuần.', 420, 95, 1, 1, now);
    ep.run('ep_2', 'pod_1', 'Tập 11: Bản phối Vinyl lúc nửa đêm', 'Trò chuyện cùng người sưu tầm đĩa than ở Shibuya.', 360, 0, 0, 0, now);
    ep.run('ep_3', 'pod_2', 'Tập 08: Vì sao giao diện tối giản luôn trường tồn', 'Phân tích kiến trúc ứng dụng liên kết và quyền riêng tư AI.', 510, 0, 0, 1, now);
    ep.run('ep_4', 'pod_3', 'Tập 05: Giờ vàng bên bờ sông Meguro', 'Mẹo chọn góc sáng tự nhiên khi chụp ảnh chân dung.', 300, 0, 0, 0, now);
    ep.run('ep_5', 'pod_4', 'Tập 03: Lưới thiết kế 8px & Nhịp điệu chữ', 'Quy tắc vàng giúp app Android gọn mắt và dễ bấm bằng một tay.', 390, 0, 0, 0, now);
  }

  // 12. Shopping
  if ((db.prepare('SELECT COUNT(*) as c FROM shopping_products').get() as { c: number }).c === 0) {
    const sp = db.prepare('INSERT INTO shopping_products (id, name, category, price, original_price, rating, stock, image_url, description, variants_json, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    sp.run('prod_1', 'Tai nghe Sakura Buds Pro (Mô phỏng)', 'Âm thanh', 1490000, 1890000, 4.9, 18, '/src/assets/images/char_yuki_1794880089308.jpg', 'Tai nghe chống ồn chủ động thiết kế lấy cảm hứng từ âm thanh Lo-Fi.', JSON.stringify({ colors: ['Trắng Sứ', 'Tím Oải Hương', 'Đen Nhám'], sizes: ['Tiêu chuẩn'] }), 1);
    sp.run('prod_2', 'Máy ảnh phim Retro 35mm Sakura Edition', 'Nhiếp ảnh', 2850000, 3200000, 4.8, 9, '/src/assets/images/char_sakura_1794880090451.jpg', 'Thân máy kim loại gọn nhẹ kèm dây đeo cổ tay màu hồng sakura.', JSON.stringify({ colors: ['Hồng Sakura', 'Bạc Cổ Điển'], sizes: ['Body', 'Kèm 2 cuộn phim'] }), 1);
    sp.run('prod_3', 'Áo khoác Hoodie PHONE OS Night Ride', 'Thời trang', 650000, 790000, 4.7, 32, '/src/assets/images/char_akira_1794880089961.jpg', 'Chất liệu nỉ cotton thoáng khí phù hợp đạp xe đêm.', JSON.stringify({ colors: ['Đen', 'Xám Khói'], sizes: ['M', 'L', 'XL'] }), 0);
    sp.run('prod_4', 'Bộ Sổ Phác Thảo & Bút Lưới Thụy Sĩ', 'Văn phòng phẩm', 290000, 350000, 4.9, 40, '/src/assets/images/char_rin_1794880090553.jpg', 'Giấy kem dày 120gsm in lưới chấm dot-grid dành cho nhà thiết kế.', JSON.stringify({ colors: ['Be Tối Giản', 'Than Chì'], sizes: ['A5', 'B5'] }), 0);
  }

  // 13. Food Delivery
  if ((db.prepare('SELECT COUNT(*) as c FROM food_restaurants').get() as { c: number }).c === 0) {
    const fr = db.prepare('INSERT INTO food_restaurants (id, name, cuisine, rating, eta_min, price_tier, hours, address, image_url, menu_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    fr.run(
      'rest_1',
      'Shibuya Matcha & Ramen House',
      'Đồ Nhật',
      4.9,
      20,
      '$$',
      '08:00 - 22:30',
      '42 Nguyễn Huệ, Quận 1 (Địa chỉ mô phỏng)',
      '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
      JSON.stringify([
        { id: 'm1', name: 'Tonkotsu Ramen Đặc Biệt', price: 95000, desc: 'Nước dùng hầm 12 giờ, trứng lòng đào, thịt xá xíu', toppings: ['Thêm trứng (+15k)', 'Thêm rong biển (+10k)', 'Ớt cay (+0k)'] },
        { id: 'm2', name: 'Matcha Latte Đá Xay', price: 58000, desc: 'Trà xanh Uji nguyên chất vị thanh nhẹ', toppings: ['Trân châu trắng (+12k)', 'Kem cheese (+15k)', 'Ít đường (+0k)'] },
      ])
    );
    fr.run(
      'rest_2',
      'Bếp Cơm Nhà & Trà Đào',
      'Cơm & Trà',
      4.8,
      25,
      '$',
      '09:00 - 21:30',
      '118 Lê Lợi, Quận 1 (Địa chỉ mô phỏng)',
      '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      JSON.stringify([
        { id: 'm3', name: 'Cơm Gà Teriyaki Nóng Hổi', price: 69000, desc: 'Gà nướng sốt teriyaki thơm lừng kèm salad mè rang', toppings: ['Thêm cơm (+8k)', 'Trứng ốp la (+10k)'] },
        { id: 'm4', name: 'Trà Đào Cam Sả', price: 45000, desc: 'Giải nhiệt tươi mát với đào miếng giòn', toppings: ['Thêm đào (+10k)', 'Hạt chia (+8k)'] },
      ])
    );
  }

  // 14. Banking Demo
  if ((db.prepare('SELECT COUNT(*) as c FROM banking_accounts_demo').get() as { c: number }).c === 0) {
    db.prepare('INSERT INTO banking_accounts_demo (id, bank_name, account_number, holder_name, balance, pin_hash) VALUES (?, ?, ?, ?, ?, ?)').run(
      'bank_1', 'PHONE BANK (Mô phỏng)', '8800-2026-9901', 'Minh Anh', 12500000, ''
    );
    const tx = db.prepare('INSERT INTO banking_transactions_demo (id, account_id, tx_type, amount, counterparty, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    tx.run('tx_1', 'bank_1', 'income', 15000000, 'Tiền thưởng khởi tạo Demo', 'Nạp số dư ảo trải nghiệm PHONE OS 3.0', 'Thành công', now);
    tx.run('tx_2', 'bank_1', 'expense', 2500000, 'Quỹ tiết kiệm Studio', 'Chuyển nội bộ mô phỏng', 'Thành công', now);

    const bill = db.prepare('INSERT INTO banking_bills_demo (id, provider, bill_type, amount, due_date, is_paid, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    bill.run('bill_1', 'Điện lực Mô phỏng EVN-Sim', 'Tiền điện', 420000, '2026-11-25', 0, '');
    bill.run('bill_2', 'Cấp nước Thành phố (Demo)', 'Tiền nước', 145000, '2026-11-26', 0, '');
    bill.run('bill_3', 'Cáp quang AnimeFiber 1Gbps', 'Internet', 280000, '2026-11-28', 0, '');
  }

  // 16. Office & Docs
  if ((db.prepare('SELECT COUNT(*) as c FROM office_docs').get() as { c: number }).c === 0) {
    const od = db.prepare('INSERT INTO office_docs (id, title, doc_type, folder, content_json, is_pinned, is_shared, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    od.run(
      'doc_1',
      'Kế hoạch Dự án PHONE OS 3.0.docx',
      'document',
      'Tài liệu',
      JSON.stringify({
        blocks: [
          { type: 'h1', text: 'PHONE OS 3.0 — Hệ sinh thái Smartphone & Thế giới AI' },
          { type: 'p', text: 'Tài liệu mô tả kiến trúc thống nhất giữa 40 ứng dụng, bộ nhớ nhân vật AI và quy trình sao lưu dữ liệu bền vững.' },
          { type: 'list', text: '- Kiểm tra pin, mạng và hồ sơ âm thanh\n- Đồng bộ ký ức và quan hệ nhân vật\n- Hỗ trợ thao tác một tay trên màn hình Android' },
        ],
      }),
      1,
      1,
      2,
      now
    );
    od.run(
      'doc_2',
      'Ngân sách Chi tiêu Tháng 11.xlsx',
      'spreadsheet',
      'Tài liệu',
      JSON.stringify({
        rows: [
          ['Hạng mục', 'Dự kiến', 'Thực tế', 'Ghi chú'],
          ['Cà phê & Matcha', '450000', '380000', 'Quán góc Shibuya'],
          ['Phim 35mm', '600000', '550000', 'Chụp cùng Sakura'],
          ['Internet & Dịch vụ', '280000', '280000', 'Đã lập kế hoạch'],
          ['Tổng cộng', '=SUM(B2:B4)', '=SUM(C2:C4)', 'Tự động tính'],
        ],
      }),
      1,
      0,
      1,
      now
    );
    od.run(
      'doc_3',
      'Giới thiệu Living AI World.pptx',
      'presentation',
      'Chia sẻ',
      JSON.stringify({
        slides: [
          { title: 'PHONE OS 3.0', body: 'Trải nghiệm Smartphone mô phỏng kết hợp thế giới Anime AI sống động.', bg: '#1E1B4B' },
          { title: 'Nhân vật có Ký ức & Lịch sinh hoạt', body: 'Yuki, Sakura, Akira và Rin giao tiếp tự nhiên, có cảm xúc và cốt truyện riêng.', bg: '#31102F' },
          { title: 'An toàn & Minh bạch', body: 'Phân rõ Loại A (Thật) - Loại B (Mô phỏng) - Loại C (Phần cứng).', bg: '#0F172A' },
        ],
      }),
      0,
      1,
      1,
      now
    );
    od.run(
      'doc_4',
      'Đặc tả Kỹ thuật Giao diện Android.pdf',
      'pdf',
      'Tài liệu',
      JSON.stringify({
        pages: [
          'Trang 1: Nguyên tắc Thiết kế Một Tay trên Android\n\nVùng chạm tối thiểu 44x44px cho mọi nút hành động chính. Thanh điều hướng dưới cùng cho phép quay lại, về trang chủ và mở đa nhiệm nhanh chóng.',
          'Trang 2: Kiến trúc Bảo mật & Quyền Riêng Tư\n\nMọi mã PIN mở khóa được băm SHA-256 trên máy chủ. Dữ liệu nhạy cảm trong Két sắt được mã hóa bằng Web Crypto AES-256-GCM.',
        ],
        bookmarks: [0],
        notes: 'Cần giữ font chữ rõ nét ở cả Dark Mode và Light Mode.',
      }),
      0,
      0,
      1,
      now
    );
  }

  // 17. Community
  if ((db.prepare('SELECT COUNT(*) as c FROM community_groups').get() as { c: number }).c === 0) {
    const cg = db.prepare('INSERT INTO community_groups (id, name, topic, description, is_private, is_joined, members_count) VALUES (?, ?, ?, ?, ?, ?, ?)');
    cg.run('grp_1', 'Cộng đồng PHONE OS Việt Nam', 'Công nghệ', 'Chia sẻ mẹo tùy biến Widget, Phím tắt và trải nghiệm Android PWA.', 0, 1, 1420);
    cg.run('grp_2', 'Góc Lo-Fi & Nhiếp ảnh Anime', 'Nghệ thuật', 'Nơi giao lưu ảnh giờ vàng, playlist nhạc mưa và review phim 35mm.', 0, 1, 864);
    cg.run('grp_3', 'CLB Thiết kế Tối giản (Riêng tư)', 'Thiết kế', 'Nhóm trao đổi về lưới bố cục, typography và trải nghiệm người dùng.', 1, 1, 215);

    const cp = db.prepare('INSERT INTO community_posts (id, group_id, author_id, author_name, author_avatar, title, content, media_url, link_url, likes_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    cp.run('cpost_1', 'grp_1', 'char_akira', 'Akira Kurosawa', '/src/assets/images/char_akira_1794880089961.jpg', 'Mẹo dùng chế độ Chia đôi màn hình & Widget trên PHONE OS 3.0', 'Mọi người thử mở Đa nhiệm rồi bật Chia đôi màn hình giữa Ghi chú và Trình duyệt hoặc Tin nhắn nhé, làm việc cực kỳ tiện!', '', '', 34, now);
    cp.run('cpost_2', 'grp_2', 'char_sakura', 'Sakura Hinata', '/src/assets/images/char_sakura_1794880090451.jpg', 'Bộ ảnh hoàng hôn cuối tuần bằng cuộn phim mới 🌸', 'Ánh nắng tầm 16:30 bên bờ sông lên màu tím hồng cực kỳ dịu mắt luôn!', '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg', '', 57, now);

    const cc = db.prepare('INSERT INTO community_comments (id, post_id, parent_id, author_name, author_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    cc.run('ccmt_1', 'cpost_2', '', 'Yuki Shirakawa', '/src/assets/images/char_yuki_1794880089308.jpg', 'Tấm ảnh này ghép với nhạc lo-fi của mình thì hết ý luôn Sakura!', now);
  }

  // 18. Smart Home Demo
  if ((db.prepare('SELECT COUNT(*) as c FROM smart_devices').get() as { c: number }).c === 0) {
    const sd = db.prepare('INSERT INTO smart_devices (id, room, name, device_type, is_on, value_num, unit, is_online) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    sd.run('sm_1', 'Phòng khách', 'Đèn trần thông minh', 'light', 1, 75, '%', 1);
    sd.run('sm_2', 'Phòng khách', 'Máy lạnh Inverter', 'ac', 1, 25, '°C', 1);
    sd.run('sm_3', 'Phòng khách', 'Smart TV 4K', 'tv', 0, 40, '%', 1);
    sd.run('sm_4', 'Phòng ngủ', 'Đèn ngủ Sakura', 'light', 1, 35, '%', 1);
    sd.run('sm_5', 'Phòng ngủ', 'Rèm cửa tự động', 'curtain', 1, 80, '%', 1);
    sd.run('sm_6', 'Bếp', 'Ổ cắm thông minh Bếp', 'plug', 1, 100, 'W', 1);
    sd.run('sm_7', 'Phòng làm việc', 'Quạt đứng AI', 'fan', 1, 2, 'Cấp', 1);
    sd.run('sm_8', 'Phòng khách', 'Camera Hành lang (Mô phỏng)', 'camera', 1, 1080, 'p', 1);

    const ss = db.prepare('INSERT INTO smart_scenes (id, name, schedule_time, auto_enabled, actions_json) VALUES (?, ?, ?, ?, ?)');
    ss.run('scn_1', 'Đi ngủ', '23:00', 1, JSON.stringify({ lightOff: true, acTemp: 26, curtainClose: true }));
    ss.run('scn_2', 'Ra ngoài', '08:30', 0, JSON.stringify({ allOff: true }));
    ss.run('scn_3', 'Thư giãn', '20:00', 0, JSON.stringify({ lightDim: 35, tvOn: true }));
    ss.run('scn_4', 'Làm việc', '09:00', 1, JSON.stringify({ lightFull: 90, fanOn: true }));

    db.prepare('INSERT INTO smart_logs (id, device_name, action, created_at) VALUES (?, ?, ?, ?)').run(
      'sml_1', 'Hệ thống Nhà thông minh', 'Khởi tạo 8 thiết bị mô phỏng trực tuyến', now
    );
  }
}
