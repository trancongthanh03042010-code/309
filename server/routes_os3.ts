import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.ts';
import { summarizeConversationMemory } from './gemini.ts';
import { syncCharacterAcrossApps } from './character_sync.ts';
import { getOsVersionHistoryPayload } from './os_releases.ts';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(`phoneos-v3::${secret}`).digest('hex');
}

function sanitizeErrorText(text: string): string {
  return text
    .replace(/(api[_-]?key|token|password|pin|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

export function createOS3Router(): Router {
  const router = Router();

  // ==========================================
  // SECURITY / LOCK VERIFICATION (HASHED)
  // ==========================================
  router.post('/verify-lock', (req: Request, res: Response) => {
    const { secret = '' } = req.body as { secret?: string };
    const profile = db.prepare('SELECT id, pin_code, pin_hash, failed_unlock_count FROM user_profile WHERE id = ?').get('user_1') as {
      id: string; pin_code: string; pin_hash: string; failed_unlock_count: number;
    } | undefined;
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Không tìm thấy hồ sơ' });
      return;
    }
    if (!profile.pin_hash && !profile.pin_code) {
      res.json({ ok: true });
      return;
    }
    const candidateHash = hashSecret(secret);
    const matched = profile.pin_hash
      ? candidateHash === profile.pin_hash
      : secret === profile.pin_code;

    if (matched) {
      // Auto-migrate legacy plaintext pin_code to hashed pin_hash
      if (!profile.pin_hash && profile.pin_code) {
        db.prepare("UPDATE user_profile SET pin_hash = ?, pin_code = '', failed_unlock_count = 0 WHERE id = ?").run(candidateHash, 'user_1');
      } else {
        db.prepare('UPDATE user_profile SET failed_unlock_count = 0 WHERE id = ?').run('user_1');
      }
      res.json({ ok: true, failedCount: 0 });
      return;
    }

    const nextFailed = (profile.failed_unlock_count || 0) + 1;
    db.prepare('UPDATE user_profile SET failed_unlock_count = ? WHERE id = ?').run(nextFailed, 'user_1');
    res.status(401).json({ ok: false, failedCount: nextFailed, error: 'Mã mở khóa không chính xác' });
  });

  // ==========================================
  // BATTERY, WI-FI & BLUETOOTH
  // ==========================================
  router.post('/battery/log', (req: Request, res: Response) => {
    const { level, charging = 0 } = req.body as { level: number; charging?: number };
    const id = uid('bh');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO battery_history (id, level, charging, recorded_at) VALUES (?, ?, ?, ?)').run(id, level, charging ? 1 : 0, now);
    db.prepare('UPDATE user_profile SET battery_level = ?, charging = ? WHERE id = ?').run(level, charging ? 1 : 0, 'user_1');
    res.json(db.prepare('SELECT * FROM battery_history WHERE id = ?').get(id));
  });

  router.post('/wifi/connect', (req: Request, res: Response) => {
    const { ssid, password = '' } = req.body as { ssid: string; password?: string };
    const net = db.prepare('SELECT * FROM wifi_networks WHERE ssid = ?').get(ssid) as { ssid: string; security: string; is_saved: number } | undefined;
    if (!net) {
      res.status(404).json({ error: 'Không tìm thấy mạng Wi-Fi' });
      return;
    }
    if (net.security !== 'Mở' && !net.is_saved && password.length < 4) {
      res.status(400).json({ error: 'Mật khẩu Wi-Fi cần ít nhất 4 ký tự' });
      return;
    }
    const pwHash = password ? hashSecret(password) : '';
    db.prepare('UPDATE wifi_networks SET is_saved = 1, password_hash = COALESCE(NULLIF(?, \'\'), password_hash) WHERE ssid = ?').run(pwHash, ssid);
    db.prepare('UPDATE user_profile SET wifi_on = 1, selected_wifi = ? WHERE id = ?').run(ssid, 'user_1');
    res.json({ ok: true, network: db.prepare('SELECT ssid, security, signal, is_saved FROM wifi_networks WHERE ssid = ?').get(ssid) });
  });

  router.post('/wifi/forget', (req: Request, res: Response) => {
    const { ssid } = req.body as { ssid: string };
    db.prepare("UPDATE wifi_networks SET is_saved = 0, password_hash = '' WHERE ssid = ?").run(ssid);
    db.prepare("UPDATE user_profile SET selected_wifi = CASE WHEN selected_wifi = ? THEN '' ELSE selected_wifi END WHERE id = ?").run(ssid, 'user_1');
    res.json({ ok: true });
  });

  router.post('/bluetooth/scan', (_req: Request, res: Response) => {
    const names = [
      { name: 'Tai nghe Pixel Pods Studio', type: 'earbuds' },
      { name: 'Bàn phím Bluetooth Mini', type: 'keyboard' },
      { name: 'Loa Để Bàn Ambient', type: 'speaker' },
    ];
    const pick = names[Math.floor(Math.random() * names.length)];
    const existing = db.prepare('SELECT * FROM bluetooth_devices WHERE name = ?').get(pick.name);
    if (!existing) {
      db.prepare('INSERT INTO bluetooth_devices (id, name, device_type, connected, paired, battery_pct) VALUES (?, ?, ?, 0, 0, ?)').run(
        uid('bt'), pick.name, pick.type, 70 + Math.floor(Math.random() * 28)
      );
    }
    res.json(db.prepare('SELECT * FROM bluetooth_devices').all());
  });

  router.patch('/bluetooth/:id', (req: Request, res: Response) => {
    const { name, connected, paired } = req.body as { name?: string; connected?: number; paired?: number };
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (connected !== undefined) { sets.push('connected = ?'); vals.push(connected ? 1 : 0); }
    if (paired !== undefined) { sets.push('paired = ?'); vals.push(paired ? 1 : 0); }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE bluetooth_devices SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM bluetooth_devices WHERE id = ?').get(req.params.id));
  });

  router.delete('/bluetooth/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM bluetooth_devices WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ==========================================
  // PERMISSIONS & WIDGETS
  // ==========================================
  router.patch('/permissions', (req: Request, res: Response) => {
    const { app_id, permission_key, status, reason = 'Quyền truy cập tính năng ứng dụng', touch_accessed = false } = req.body as {
      app_id: string; permission_key: string; status: string; reason?: string; touch_accessed?: boolean;
    };
    const now = touch_accessed ? new Date().toISOString() : '';
    db.prepare(`
      INSERT INTO app_permissions (app_id, permission_key, status, reason, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(app_id, permission_key) DO UPDATE SET
        status = excluded.status,
        last_accessed_at = CASE WHEN ? != '' THEN ? ELSE app_permissions.last_accessed_at END
    `).run(app_id, permission_key, status, reason, now, now, now);
    res.json(db.prepare('SELECT * FROM app_permissions WHERE app_id = ? AND permission_key = ?').get(app_id, permission_key));
  });

  router.post('/widgets', (req: Request, res: Response) => {
    const id = uid('wd');
    const { widget_type, title, size = '2x2', page_index = 0, config_json = '{}' } = req.body;
    const count = (db.prepare('SELECT COUNT(*) as c FROM home_widgets').get() as { c: number }).c;
    db.prepare('INSERT INTO home_widgets (id, widget_type, title, size, page_index, sort_order, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, widget_type, title, size, page_index, count, typeof config_json === 'string' ? config_json : JSON.stringify(config_json)
    );
    res.json(db.prepare('SELECT * FROM home_widgets WHERE id = ?').get(id));
  });

  router.patch('/widgets/:id', (req: Request, res: Response) => {
    const allowed = ['size', 'page_index', 'sort_order', 'config_json', 'title'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE home_widgets SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM home_widgets WHERE id = ?').get(req.params.id));
  });

  router.delete('/widgets/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM home_widgets WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/home/reset', (_req: Request, res: Response) => {
    db.prepare('DELETE FROM home_widgets').run();
    db.prepare('INSERT INTO home_widgets (id, widget_type, title, size, page_index, sort_order, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'wd_weather', 'weather_calendar', 'Thời tiết & Lịch', '2x2', 0, 0, '{}'
    );
    db.prepare('INSERT INTO home_widgets (id, widget_type, title, size, page_index, sort_order, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'wd_ai', 'ai_companion', 'Nhân vật AI & Sức khỏe', '2x2', 0, 1, JSON.stringify({ characterId: 'char_yuki' })
    );
    db.prepare("UPDATE installed_apps SET hidden = 0, folder_name = ''").run();
    db.prepare("UPDATE user_profile SET home_columns = 4, dock_pos = 'bottom' WHERE id = 'user_1'").run();
    res.json({ ok: true });
  });

  // ==========================================
  // BACKUP, RESTORE, SYNC, UPDATES, ERRORS, JOBS
  // ==========================================
  const BACKUP_TABLES = [
    'user_profile', 'installed_apps', 'home_widgets', 'app_permissions', 'contacts',
    'conversations', 'messages', 'characters', 'character_memories', 'ai_relationships',
    'ai_events', 'notes', 'calendar_events', 'reminders', 'emails', 'files', 'health_logs',
    'wallet_cards', 'shortcuts', 'browser_bookmarks', 'alarms', 'world_clocks', 'books',
    'podcasts', 'podcast_episodes', 'shopping_orders', 'food_orders', 'ride_trips',
    'office_docs', 'smart_devices', 'smart_scenes', 'banking_accounts_demo',
    'banking_transactions_demo', 'banking_bills_demo', 'banking_beneficiaries',
    'banking_cards', 'banking_savings', 'banking_loans', 'banking_budgets',
    'banking_notifications', 'banking_security_state', 'community_groups', 'community_posts'
  ];

  function tableExists(tableName: string): boolean {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return Boolean(row);
  }

  function buildBackupPayload(includeAiChat: boolean) {
    const tables = includeAiChat ? BACKUP_TABLES : BACKUP_TABLES.filter((t) => !['messages', 'conversations', 'character_memories'].includes(t));
    const data: Record<string, unknown[]> = {};
    for (const t of tables) {
      if (!tableExists(t)) continue;
      data[t] = db.prepare(`SELECT * FROM ${t}`).all() as unknown[];
    }
    const rawStr = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(rawStr).digest('hex');
    return { schemaVersion: '3.0.0', osVersion: 'PHONE OS 3.0.0', createdAt: new Date().toISOString(), integrityHash: hash, data };
  }

  router.post('/backups', (req: Request, res: Response) => {
    const { includeAiChat = true } = req.body as { includeAiChat?: boolean };
    const pkg = buildBackupPayload(includeAiChat);
    const payloadJson = JSON.stringify(pkg);
    const id = uid('bak');
    const summary = {
      notes: (pkg.data.notes || []).length,
      contacts: (pkg.data.contacts || []).length,
      messages: (pkg.data.messages || []).length,
      apps: (pkg.data.installed_apps || []).length,
      includeAiChat,
    };
    db.prepare(`
      INSERT INTO backups (id, schema_version, os_version, integrity_hash, size_kb, summary_json, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, pkg.schemaVersion, pkg.osVersion, pkg.integrityHash, Math.round((payloadJson.length / 1024) * 10) / 10, JSON.stringify(summary), payloadJson, pkg.createdAt);
    res.json(db.prepare('SELECT id, schema_version, os_version, integrity_hash, size_kb, summary_json, created_at FROM backups WHERE id = ?').get(id));
  });

  router.get('/backups/:id/download', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id) as { payload_json: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="phone_os_3_backup_${req.params.id}.json"`);
    res.send(row.payload_json);
  });

  router.post('/backups/import', (req: Request, res: Response) => {
    try {
      const { backupJson } = req.body as { backupJson: string };
      const parsed = JSON.parse(backupJson) as {
        schemaVersion?: string; osVersion?: string; createdAt?: string; integrityHash?: string; data?: Record<string, unknown[]>;
      };
      if (!parsed.data || !parsed.schemaVersion) {
        res.status(400).json({ error: 'Tệp sao lưu không đúng định dạng PHONE OS' });
        return;
      }
      const computed = crypto.createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
      const integrityValid = !parsed.integrityHash || parsed.integrityHash === computed;
      const id = uid('bak');
      const summary = {
        notes: (parsed.data.notes || []).length,
        contacts: (parsed.data.contacts || []).length,
        messages: (parsed.data.messages || []).length,
        apps: (parsed.data.installed_apps || []).length,
        imported: true,
      };
      db.prepare(`
        INSERT INTO backups (id, schema_version, os_version, integrity_hash, size_kb, summary_json, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, parsed.schemaVersion, parsed.osVersion || 'PHONE OS', computed, Math.round((backupJson.length / 1024) * 10) / 10, JSON.stringify(summary), backupJson, parsed.createdAt || new Date().toISOString());
      res.json({ ok: true, integrityValid, backup: db.prepare('SELECT id, schema_version, os_version, integrity_hash, size_kb, summary_json, created_at FROM backups WHERE id = ?').get(id), summary });
    } catch {
      res.status(400).json({ error: 'Không thể phân tích JSON sao lưu' });
    }
  });

  router.post('/backups/:id/restore', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id) as { payload_json: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
      return;
    }
    const parsed = JSON.parse(row.payload_json) as { data?: Record<string, Array<Record<string, unknown>>> };
    if (!parsed.data) {
      res.status(400).json({ error: 'Dữ liệu sao lưu trống' });
      return;
    }
    // Atomic SQLite transaction with rollback if any table write fails
    const restoreTx = db.transaction((restoreData: Record<string, Array<Record<string, unknown>>>) => {
      for (const [table, rows] of Object.entries(restoreData)) {
        if (!BACKUP_TABLES.includes(table) || !Array.isArray(rows)) continue;
        db.prepare(`DELETE FROM ${table}`).run();
        for (const r of rows) {
          const cols = Object.keys(r);
          if (cols.length === 0) continue;
          const validCols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
          const safeCols = cols.filter((c) => validCols.includes(c));
          if (safeCols.length === 0) continue;
          const placeholders = safeCols.map(() => '?').join(', ');
          db.prepare(`INSERT OR REPLACE INTO ${table} (${safeCols.join(', ')}) VALUES (${placeholders})`).run(...safeCols.map((c) => r[c]));
        }
      }
    });

    try {
      restoreTx(parsed.data);
      res.json({ ok: true, restoredAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: `Khôi phục thất bại và đã rollback an toàn: ${err instanceof Error ? err.message : 'Lỗi DB'}` });
    }
  });

  router.delete('/backups/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM backups WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/sync', (req: Request, res: Response) => {
    const { categories = ['Hồ sơ', 'Ghi chú', 'Danh bạ', 'Lịch'], conflict_policy = 'newest' } = req.body as {
      categories?: string[]; conflict_policy?: string;
    };
    const id = uid('sync');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO sync_jobs (id, category, status, conflict_policy, synced_at, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, categories.join(', '), 'Hoàn tất (Mô phỏng Đám mây cục bộ)', conflict_policy, now, `Đã đồng bộ ${categories.length} nhóm dữ liệu không xung đột`
    );
    res.json(db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id));
  });

  router.get('/system-update', (_req: Request, res: Response) => {
    res.json(getOsVersionHistoryPayload(db));
  });

  router.get('/health', (_req: Request, res: Response) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'healthy',
        database: 'SQLite WAL OK',
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'degraded', error: err instanceof Error ? err.message : 'DB Error' });
    }
  });

  router.post('/errors', (req: Request, res: Response) => {
    const { app_id = 'system', error_code = 'APP_ERR', message, detail = '' } = req.body as {
      app_id?: string; error_code?: string; message: string; detail?: string;
    };
    const id = uid('err');
    db.prepare('INSERT INTO system_errors (id, app_id, error_code, message, detail, resolved, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)').run(
      id, app_id, error_code, sanitizeErrorText(message || 'Lỗi không xác định'), sanitizeErrorText(detail), new Date().toISOString()
    );
    res.json(db.prepare('SELECT * FROM system_errors WHERE id = ?').get(id));
  });

  router.patch('/errors/:id', (req: Request, res: Response) => {
    db.prepare('UPDATE system_errors SET resolved = ? WHERE id = ?').run(req.body.resolved ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM system_errors WHERE id = ?').get(req.params.id));
  });

  router.delete('/errors/:id', (req: Request, res: Response) => {
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM system_errors').run();
    } else {
      db.prepare('DELETE FROM system_errors WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  router.post('/jobs', (req: Request, res: Response) => {
    const id = uid('job');
    const { job_type, target_id = '', title, payload_json = '{}', run_at } = req.body;
    db.prepare('INSERT INTO scheduled_jobs (id, job_type, target_id, title, payload_json, run_at, status, retry_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)').run(
      id, job_type, target_id, title, typeof payload_json === 'string' ? payload_json : JSON.stringify(payload_json), run_at || new Date().toISOString(), 'pending', new Date().toISOString()
    );
    res.json(db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id));
  });

  router.patch('/jobs/:id', (req: Request, res: Response) => {
    const { status } = req.body as { status?: string };
    if (status) {
      db.prepare('UPDATE scheduled_jobs SET status = ? WHERE id = ?').run(status, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(req.params.id));
  });

  router.post('/jobs/run-due', (_req: Request, res: Response) => {
    const now = new Date().toISOString();
    const due = db.prepare("SELECT * FROM scheduled_jobs WHERE status = 'pending' AND run_at <= ? LIMIT 5").all(now) as Array<{
      id: string; job_type: string; target_id: string; title: string;
    }>;
    for (const j of due) {
      db.prepare("UPDATE scheduled_jobs SET status = 'done' WHERE id = ?").run(j.id);
      db.prepare('INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)').run(
        uid('notif'), j.job_type === 'reminder' ? 'reminders' : 'calendar', 'Lịch trình', 'Sự kiện đến giờ', j.title, j.job_type === 'reminder' ? 'reminders' : 'calendar', j.target_id, now
      );
    }
    res.json({ executed: due.length });
  });

  // ==========================================
  // LIVING AI WORLD UPGRADES
  // ==========================================
  router.patch('/characters/:id/full', (req: Request, res: Response) => {
    const allowed = [
      'name', 'age', 'tagline', 'personality', 'bio', 'likes', 'dislikes', 'avatar', 'cover_image',
      'username', 'occupation', 'city', 'gender', 'join_social', 'is_verified', 'social_bio',
      'relationship_label', 'role_title', 'pronouns', 'speaking_style',
      'is_blocked', 'memory_enabled', 'content_boundary', 'activity_status', 'mood',
      'is_followed', 'is_favorite', 'proactive_msg_enabled', 'proactive_call_enabled',
      'proactive_photo_enabled', 'proactive_notif_enabled',
    ];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      vals.push(new Date().toISOString());
      vals.push(req.params.id);
      db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      syncCharacterAcrossApps(db, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id));
  });

  router.patch('/memories/:memId', (req: Request, res: Response) => {
    const { content, memory_type } = req.body as { content?: string; memory_type?: string };
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (content !== undefined) { sets.push('content = ?'); vals.push(content); }
    if (memory_type !== undefined) { sets.push('memory_type = ?'); vals.push(memory_type); }
    if (sets.length > 0) {
      vals.push(req.params.memId);
      db.prepare(`UPDATE character_memories SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM character_memories WHERE id = ?').get(req.params.memId));
  });

  router.post('/characters/:id/summarize', async (req: Request, res: Response) => {
    try {
      const char = db.prepare('SELECT id, name FROM characters WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
      if (!char) {
        res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        return;
      }
      const conv = db.prepare('SELECT id FROM conversations WHERE is_group = 0 AND character_id = ?').get(char.id) as { id: string } | undefined;
      if (!conv) {
        res.json({ summary: 'Chưa có cuộc trò chuyện để tóm tắt.' });
        return;
      }
      const msgs = db.prepare('SELECT sender_name as sender, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conv.id) as Array<{ sender: string; content: string }>;
      const summary = await summarizeConversationMemory(char.name, msgs);
      if (summary) {
        const memId = uid('mem');
        db.prepare('INSERT INTO character_memories (id, character_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          memId, char.id, 'event', `[Tóm tắt] ${summary}`, 8, new Date().toISOString()
        );
      }
      res.json({ summary });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Tóm tắt thất bại' });
    }
  });

  router.patch('/relationships/:charId', (req: Request, res: Response) => {
    const rel = db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(req.params.charId) as Record<string, unknown> | undefined;
    if (!rel) {
      res.status(404).json({ error: 'Không tìm thấy hồ sơ quan hệ' });
      return;
    }
    const { stage, resetBoundary } = req.body as { stage?: string; resetBoundary?: boolean };
    const now = new Date().toISOString();
    const hist = JSON.parse((rel.history_json as string) || '[]') as Array<{ time: string; delta: string; reason: string }>;
    if (resetBoundary) {
      hist.unshift({ time: now, delta: 'Đặt ranh giới', reason: 'Người dùng chọn giữ ranh giới bạn bè thoải mái' });
      db.prepare("UPDATE ai_relationships SET stage = 'Bạn bè', jealousy = 0, history_json = ?, updated_at = ? WHERE character_id = ?").run(
        JSON.stringify(hist.slice(0, 15)), now, req.params.charId
      );
    } else if (stage) {
      hist.unshift({ time: now, delta: `-> ${stage}`, reason: 'Cập nhật giai đoạn quan hệ' });
      db.prepare('UPDATE ai_relationships SET stage = ?, history_json = ?, updated_at = ? WHERE character_id = ?').run(
        stage, JSON.stringify(hist.slice(0, 15)), now, req.params.charId
      );
    }
    res.json(db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(req.params.charId));
  });

  router.post('/ai-events/:id/choose', (req: Request, res: Response) => {
    const { choiceId } = req.body as { choiceId: string };
    const ev = db.prepare('SELECT * FROM ai_events WHERE id = ?').get(req.params.id) as {
      id: string; character_id: string; title: string; choices_json: string; status: string;
    } | undefined;
    if (!ev) {
      res.status(404).json({ error: 'Không tìm thấy sự kiện' });
      return;
    }
    const choices = JSON.parse(ev.choices_json || '[]') as Array<{
      id: string; label: string; affection?: number; trust?: number; familiarity?: number; conflict?: number;
    }>;
    const picked = choices.find((c) => c.id === choiceId);
    if (!picked) {
      res.status(400).json({ error: 'Lựa chọn không hợp lệ' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE ai_events SET chosen_option = ?, impact_json = ?, status = 'completed' WHERE id = ?").run(
      picked.label, JSON.stringify(picked), ev.id
    );

    const rel = db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(ev.character_id) as {
      affection: number; trust: number; familiarity: number; respect: number; conflict: number; stage: string; history_json: string;
    } | undefined;
    if (rel) {
      const aff = Math.max(0, Math.min(100, rel.affection + (picked.affection || 0)));
      const tru = Math.max(0, Math.min(100, rel.trust + (picked.trust || 0)));
      const fam = Math.max(0, Math.min(100, rel.familiarity + (picked.familiarity || 0)));
      const con = Math.max(0, Math.min(100, rel.conflict + (picked.conflict || 0)));
      const stage = con >= 35 ? 'Căng thẳng' : aff >= 85 && tru >= 80 ? 'Tình yêu' : aff >= 65 ? 'Thân thiết' : 'Bạn bè';
      const hist = JSON.parse(rel.history_json || '[]') as Array<{ time: string; delta: string; reason: string }>;
      hist.unshift({ time: now, delta: `Tình cảm ${picked.affection || 0 >= 0 ? '+' : ''}${picked.affection || 0}`, reason: ev.title });
      db.prepare('UPDATE ai_relationships SET affection = ?, trust = ?, familiarity = ?, conflict = ?, stage = ?, history_json = ?, updated_at = ? WHERE character_id = ?').run(
        aff, tru, fam, con, stage, JSON.stringify(hist.slice(0, 15)), now, ev.character_id
      );
    }

    db.prepare('INSERT INTO character_memories (id, character_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uid('mem'), ev.character_id, 'event', `Sự kiện "${ev.title}": ${picked.label}`, 8, now
    );
    res.json({ ok: true, event: db.prepare('SELECT * FROM ai_events WHERE id = ?').get(ev.id) });
  });

  router.post('/ai-events/:id/skip', (req: Request, res: Response) => {
    db.prepare("UPDATE ai_events SET status = 'skipped' WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  // ==========================================
  // 11. PODCAST
  // ==========================================
  router.patch('/podcasts/:id', (req: Request, res: Response) => {
    db.prepare('UPDATE podcasts SET is_followed = ? WHERE id = ?').run(req.body.is_followed ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM podcasts WHERE id = ?').get(req.params.id));
  });

  router.patch('/podcast-episodes/:id', (req: Request, res: Response) => {
    const allowed = ['progress_sec', 'is_downloaded', 'is_favorite'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE podcast_episodes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM podcast_episodes WHERE id = ?').get(req.params.id));
  });

  // ==========================================
  // 12. SHOPPING (SIMULATED)
  // ==========================================
  router.post('/shopping/cart', (req: Request, res: Response) => {
    const { product_id, quantity = 1, selected_variant = '' } = req.body;
    const existing = db.prepare('SELECT * FROM shopping_cart WHERE product_id = ? AND selected_variant = ?').get(product_id, selected_variant) as { id: string; quantity: number } | undefined;
    if (existing) {
      db.prepare('UPDATE shopping_cart SET quantity = ? WHERE id = ?').run(existing.quantity + quantity, existing.id);
      res.json(db.prepare('SELECT * FROM shopping_cart WHERE id = ?').get(existing.id));
      return;
    }
    const id = uid('cart');
    db.prepare('INSERT INTO shopping_cart (id, product_id, quantity, selected_variant) VALUES (?, ?, ?, ?)').run(id, product_id, quantity, selected_variant);
    res.json(db.prepare('SELECT * FROM shopping_cart WHERE id = ?').get(id));
  });

  router.patch('/shopping/cart/:id', (req: Request, res: Response) => {
    const qty = Math.max(1, Number(req.body.quantity || 1));
    db.prepare('UPDATE shopping_cart SET quantity = ? WHERE id = ?').run(qty, req.params.id);
    res.json(db.prepare('SELECT * FROM shopping_cart WHERE id = ?').get(req.params.id));
  });

  router.delete('/shopping/cart/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM shopping_cart WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/shopping/checkout', (req: Request, res: Response) => {
    const { items, subtotal, discount = 0, shipping_fee = 25000, coupon_code = '', address = 'Địa chỉ mô phỏng PHONE OS' } = req.body;
    const total = Math.max(0, Number(subtotal) - Number(discount) + Number(shipping_fee));
    const id = uid('ord');
    const now = new Date().toISOString();
    const history = [{ status: 'Chờ xác nhận', time: now }];
    db.prepare(`
      INSERT INTO shopping_orders (id, items_json, subtotal, discount, shipping_fee, total, coupon_code, address, status, history_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Chờ xác nhận', ?, ?)
    `).run(id, JSON.stringify(items), subtotal, discount, shipping_fee, total, coupon_code, address, JSON.stringify(history), now);
    db.prepare('DELETE FROM shopping_cart').run();
    res.json(db.prepare('SELECT * FROM shopping_orders WHERE id = ?').get(id));
  });

  router.patch('/shopping/orders/:id', (req: Request, res: Response) => {
    const ord = db.prepare('SELECT * FROM shopping_orders WHERE id = ?').get(req.params.id) as { history_json: string } | undefined;
    if (!ord) { res.status(404).json({ error: 'Không tìm thấy đơn' }); return; }
    const { status } = req.body as { status: string };
    const hist = JSON.parse(ord.history_json || '[]') as Array<{ status: string; time: string }>;
    hist.push({ status, time: new Date().toISOString() });
    db.prepare('UPDATE shopping_orders SET status = ?, history_json = ? WHERE id = ?').run(status, JSON.stringify(hist), req.params.id);
    res.json(db.prepare('SELECT * FROM shopping_orders WHERE id = ?').get(req.params.id));
  });

  // ==========================================
  // 13. FOOD DELIVERY (SIMULATED)
  // ==========================================
  router.post('/food/orders', (req: Request, res: Response) => {
    const { restaurant_id, restaurant_name, items, total, delivery_address, payment_method = 'Ví mô phỏng' } = req.body;
    const id = uid('ford');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO food_orders (id, restaurant_id, restaurant_name, items_json, total, delivery_address, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Đã nhận đơn', ?)
    `).run(id, restaurant_id, restaurant_name, JSON.stringify(items), total, delivery_address, payment_method, now);
    db.prepare('INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)').run(
      uid('notif'), 'food', 'Đặt đồ ăn', restaurant_name, 'Đơn đồ ăn mô phỏng đã được tiếp nhận!', 'food', id, now
    );
    res.json(db.prepare('SELECT * FROM food_orders WHERE id = ?').get(id));
  });

  router.patch('/food/orders/:id', (req: Request, res: Response) => {
    const allowed = ['status', 'rating', 'review_text'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE food_orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM food_orders WHERE id = ?').get(req.params.id));
  });

  // ==========================================
  // 14. BANKING DEMO (SIMULATED)
  // ==========================================
  router.post('/banking/pin', (req: Request, res: Response) => {
    const { pin } = req.body as { pin: string };
    if (!/^\d{4,6}$/.test(pin)) {
      res.status(400).json({ error: 'PIN giao dịch mô phỏng gồm 4–6 chữ số' });
      return;
    }
    db.prepare('UPDATE banking_accounts_demo SET pin_hash = ? WHERE id = ?').run(hashSecret(pin), 'bank_1');
    res.json({ ok: true });
  });

  router.post('/banking/transfer', (req: Request, res: Response) => {
    const { amount, counterparty, note = '', pin = '' } = req.body as { amount: number; counterparty: string; note?: string; pin?: string };
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get('bank_1') as { id: string; balance: number; pin_hash: string } | undefined;
    if (!acc) { res.status(404).json({ error: 'Không tìm thấy tài khoản demo' }); return; }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
      return;
    }
    if (amount > acc.balance) {
      res.status(400).json({ error: 'Số dư tài khoản ảo không đủ' });
      return;
    }
    if (acc.pin_hash && hashSecret(pin) !== acc.pin_hash) {
      res.status(401).json({ error: 'Mã PIN giao dịch mô phỏng không đúng' });
      return;
    }
    const nextBal = acc.balance - amount;
    const now = new Date().toISOString();
    const txId = uid('tx');
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = MAX(0, ? - COALESCE(held_balance, 0)) WHERE id = ?').run(nextBal, nextBal, acc.id);
    db.prepare('INSERT INTO banking_transactions_demo (id, account_id, tx_type, amount, counterparty, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      txId, acc.id, 'expense', amount, counterparty, note, 'Thành công (Mô phỏng)', now
    );
    db.prepare('INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)').run(
      uid('notif'), 'banking', 'Ngân hàng Demo', 'Biến động số dư (Mô phỏng)', `-${amount.toLocaleString('vi-VN')}đ tới ${counterparty}. Số dư: ${nextBal.toLocaleString('vi-VN')}đ`, 'banking', txId, now
    );
    res.json({ transaction: db.prepare('SELECT * FROM banking_transactions_demo WHERE id = ?').get(txId), balance: nextBal });
  });

  router.post('/banking/bills/:id/pay', (req: Request, res: Response) => {
    const bill = db.prepare('SELECT * FROM banking_bills_demo WHERE id = ?').get(req.params.id) as { id: string; provider: string; bill_type: string; amount: number; is_paid: number } | undefined;
    const acc = db.prepare('SELECT * FROM banking_accounts_demo WHERE id = ?').get('bank_1') as { id: string; balance: number } | undefined;
    if (!bill || !acc) { res.status(404).json({ error: 'Không tìm thấy hóa đơn' }); return; }
    if (bill.is_paid) { res.status(400).json({ error: 'Hóa đơn đã thanh toán' }); return; }
    if (bill.amount > acc.balance) { res.status(400).json({ error: 'Số dư tài khoản ảo không đủ' }); return; }
    const now = new Date().toISOString();
    const nextBal = acc.balance - bill.amount;
    db.prepare('UPDATE banking_accounts_demo SET balance = ?, available_balance = MAX(0, ? - COALESCE(held_balance, 0)) WHERE id = ?').run(nextBal, nextBal, acc.id);
    db.prepare('UPDATE banking_bills_demo SET is_paid = 1, paid_at = ? WHERE id = ?').run(now, bill.id);
    db.prepare('INSERT INTO banking_transactions_demo (id, account_id, tx_type, amount, counterparty, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      uid('tx'), acc.id, 'expense', bill.amount, bill.provider, `Thanh toán ${bill.bill_type}`, 'Thành công (Mô phỏng)', now
    );
    res.json({ ok: true, balance: nextBal });
  });

  // ==========================================
  // 15. RIDE DEMO (SIMULATED)
  // ==========================================
  router.post('/rides', (req: Request, res: Response) => {
    const { pickup, dropoff, vehicle_type, fare } = req.body;
    const id = uid('ride');
    const drivers = [
      { name: 'Trần Hoàng Nam (Tài xế mô phỏng)', plate: '59-G2 612.88' },
      { name: 'Lê Quốc Bảo (Tài xế mô phỏng)', plate: '51H-492.15' },
    ];
    const d = drivers[Math.floor(Math.random() * drivers.length)];
    db.prepare(`
      INSERT INTO ride_trips (id, pickup, dropoff, vehicle_type, fare, driver_name, vehicle_plate, eta_min, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 3, 'Tài xế đang đến', ?)
    `).run(id, pickup, dropoff, vehicle_type, fare, d.name, d.plate, new Date().toISOString());
    res.json(db.prepare('SELECT * FROM ride_trips WHERE id = ?').get(id));
  });

  router.patch('/rides/:id', (req: Request, res: Response) => {
    const allowed = ['status', 'rating', 'eta_min'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE ride_trips SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM ride_trips WHERE id = ?').get(req.params.id));
  });

  // ==========================================
  // 16. OFFICE & DOCS
  // ==========================================
  router.post('/office', (req: Request, res: Response) => {
    const id = uid('doc');
    const now = new Date().toISOString();
    const { title, doc_type = 'document', folder = 'Tài liệu', content_json = '{}' } = req.body;
    db.prepare('INSERT INTO office_docs (id, title, doc_type, folder, content_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, title, doc_type, folder, typeof content_json === 'string' ? content_json : JSON.stringify(content_json), now
    );
    res.json(db.prepare('SELECT * FROM office_docs WHERE id = ?').get(id));
  });

  router.patch('/office/:id', (req: Request, res: Response) => {
    const now = new Date().toISOString();
    const allowed = ['title', 'folder', 'content_json', 'is_pinned', 'is_shared', 'version'];
    const sets = ['updated_at = ?'];
    const vals: unknown[] = [now];
    for (const f of allowed) {
      if (f in req.body) { sets.push(`${f} = ?`); vals.push(f === 'content_json' && typeof req.body[f] !== 'string' ? JSON.stringify(req.body[f]) : req.body[f]); }
    }
    vals.push(req.params.id);
    db.prepare(`UPDATE office_docs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json(db.prepare('SELECT * FROM office_docs WHERE id = ?').get(req.params.id));
  });

  router.delete('/office/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM office_docs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ==========================================
  // 17. COMMUNITY
  // ==========================================
  router.patch('/community/groups/:id', (req: Request, res: Response) => {
    db.prepare('UPDATE community_groups SET is_joined = ? WHERE id = ?').run(req.body.is_joined ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM community_groups WHERE id = ?').get(req.params.id));
  });

  router.post('/community/posts', (req: Request, res: Response) => {
    const id = uid('cpost');
    const now = new Date().toISOString();
    const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
    const { group_id, title, content, media_url = '', link_url = '' } = req.body;
    db.prepare(`
      INSERT INTO community_posts (id, group_id, author_id, author_name, author_avatar, title, content, media_url, link_url, created_at)
      VALUES (?, ?, 'user_1', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, group_id, profile.name, profile.avatar, title, content, media_url, link_url, now);
    res.json(db.prepare('SELECT * FROM community_posts WHERE id = ?').get(id));
  });

  router.patch('/community/posts/:id', (req: Request, res: Response) => {
    const p = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(req.params.id) as { is_liked: number; likes_count: number; is_saved: number } | undefined;
    if (!p) { res.status(404).json({ error: 'Không tìm thấy bài' }); return; }
    if (req.body.toggleLike) {
      const next = p.is_liked ? 0 : 1;
      db.prepare('UPDATE community_posts SET is_liked = ?, likes_count = ? WHERE id = ?').run(next, Math.max(0, p.likes_count + (next ? 1 : -1)), req.params.id);
    }
    if (req.body.toggleSave) {
      db.prepare('UPDATE community_posts SET is_saved = ? WHERE id = ?').run(p.is_saved ? 0 : 1, req.params.id);
    }
    if ('is_hidden' in req.body) {
      db.prepare('UPDATE community_posts SET is_hidden = ? WHERE id = ?').run(req.body.is_hidden ? 1 : 0, req.params.id);
    }
    if ('reported' in req.body) {
      db.prepare('UPDATE community_posts SET reported = ? WHERE id = ?').run(req.body.reported ? 1 : 0, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM community_posts WHERE id = ?').get(req.params.id));
  });

  router.delete('/community/posts/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM community_comments WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM community_posts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/community/comments', (req: Request, res: Response) => {
    const id = uid('ccmt');
    const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
    const { post_id, parent_id = '', content } = req.body;
    db.prepare('INSERT INTO community_comments (id, post_id, parent_id, author_name, author_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, post_id, parent_id, profile.name, profile.avatar, content, new Date().toISOString()
    );
    res.json(db.prepare('SELECT * FROM community_comments WHERE id = ?').get(id));
  });

  // ==========================================
  // 18. SMART HOME (SIMULATED)
  // ==========================================
  router.patch('/smarthome/devices/:id', (req: Request, res: Response) => {
    const dev = db.prepare('SELECT * FROM smart_devices WHERE id = ?').get(req.params.id) as { name: string } | undefined;
    if (!dev) { res.status(404).json({ error: 'Không tìm thấy thiết bị' }); return; }
    const sets: string[] = [];
    const vals: unknown[] = [];
    if ('is_on' in req.body) { sets.push('is_on = ?'); vals.push(req.body.is_on ? 1 : 0); }
    if ('value_num' in req.body) { sets.push('value_num = ?'); vals.push(req.body.value_num); }
    if ('is_online' in req.body) { sets.push('is_online = ?'); vals.push(req.body.is_online ? 1 : 0); }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE smart_devices SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      db.prepare('INSERT INTO smart_logs (id, device_name, action, created_at) VALUES (?, ?, ?, ?)').run(
        uid('sml'), dev.name, req.body.is_on !== undefined ? (req.body.is_on ? 'Bật thiết bị' : 'Tắt thiết bị') : `Điều chỉnh thông số (${req.body.value_num})`, new Date().toISOString()
      );
    }
    res.json(db.prepare('SELECT * FROM smart_devices WHERE id = ?').get(req.params.id));
  });

  router.post('/smarthome/scenes/:id/run', (req: Request, res: Response) => {
    const scn = db.prepare('SELECT * FROM smart_scenes WHERE id = ?').get(req.params.id) as { name: string; actions_json: string } | undefined;
    if (!scn) { res.status(404).json({ error: 'Không tìm thấy cảnh' }); return; }
    const actions = JSON.parse(scn.actions_json || '{}') as Record<string, unknown>;
    if (actions.allOff) {
      db.prepare("UPDATE smart_devices SET is_on = 0 WHERE device_type != 'camera'").run();
    } else if (actions.lightOff) {
      db.prepare("UPDATE smart_devices SET is_on = 0 WHERE device_type = 'light'").run();
      if (actions.acTemp) db.prepare("UPDATE smart_devices SET is_on = 1, value_num = ? WHERE device_type = 'ac'").run(actions.acTemp);
      if (actions.curtainClose) db.prepare("UPDATE smart_devices SET is_on = 0, value_num = 0 WHERE device_type = 'curtain'").run();
    } else if (actions.lightDim) {
      db.prepare("UPDATE smart_devices SET is_on = 1, value_num = ? WHERE device_type = 'light'").run(actions.lightDim);
      if (actions.tvOn) db.prepare("UPDATE smart_devices SET is_on = 1 WHERE device_type = 'tv'").run();
    } else if (actions.lightFull) {
      db.prepare("UPDATE smart_devices SET is_on = 1, value_num = ? WHERE device_type = 'light'").run(actions.lightFull);
      if (actions.fanOn) db.prepare("UPDATE smart_devices SET is_on = 1 WHERE device_type = 'fan'").run();
    }
    db.prepare('INSERT INTO smart_logs (id, device_name, action, created_at) VALUES (?, ?, ?, ?)').run(
      uid('sml'), `Cảnh: ${scn.name}`, 'Kích hoạt kịch bản tự động', new Date().toISOString()
    );
    res.json({ ok: true });
  });

  router.patch('/smarthome/scenes/:id', (req: Request, res: Response) => {
    db.prepare('UPDATE smart_scenes SET auto_enabled = ? WHERE id = ?').run(req.body.auto_enabled ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM smart_scenes WHERE id = ?').get(req.params.id));
  });

  // Account reset (preserving app structure)
  router.post('/account/reset', (_req: Request, res: Response) => {
    db.prepare("UPDATE user_profile SET name = 'Minh Anh', bio = 'Người dùng PHONE OS 3.0', pin_code = '', pin_hash = '', unlock_mode = 'swipe', failed_unlock_count = 0, guest_mode = 0 WHERE id = 'user_1'").run();
    res.json({ ok: true });
  });

  return router;
}
