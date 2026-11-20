import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { db, initDatabase } from './server/db.ts';
import {
  extractDocumentOCR,
  generateCharacterSpeech,
  runAssistantPrompt,
  transcribeAudioBase64,
  translateTextAI,
} from './server/gemini.ts';
import { createOS3Router, hashSecret } from './server/routes_os3.ts';
import { createOS4Router, handleSpotifyOAuthCallback } from './server/routes_os4.ts';
import { createMessagesV3Router, generateAndStoreAiReplyV3 } from './server/routes_messages_v3.ts';
import { createBankingRouter } from './server/routes_banking.ts';
import { createTelecomRouter } from './server/routes_telecom.ts';
import { getTelecomOverview } from './server/telecom_engine.ts';
import { ensureAiCharacterBankAccount } from './server/db_banking.ts';
import { createSocialRouter } from './server/routes_social.ts';
import { attachSocialWebSocket } from './server/ws_social.ts';
import { getPublicAiConfig } from './server/ai_provider.ts';
import {
  mirrorOSMessageToSocial,
  syncCharacterAcrossApps,
  syncMainUserAcrossApps,
} from './server/character_sync.ts';
import { runContextualSocialTick } from './server/social_ai_engine.ts';

initDatabase();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.get(['/auth/spotify/callback', '/auth/spotify/callback/'], handleSpotifyOAuthCallback);
app.use('/api/os3', createOS3Router());
app.use('/api/os4', createOS4Router());
app.use('/api/messages-v3', createMessagesV3Router());
app.use('/api/banking', createBankingRouter());
app.use('/api/telecom', createTelecomRouter());
app.use('/api/social-v2', createSocialRouter());

function sanitizeProfile(row: Record<string, unknown> | undefined) {
  if (!row) return row;
  const hasSecret = Boolean(row.pin_hash || row.pin_code);
  const hasRecovery = Boolean(row.recovery_code_hash);
  const copy: Record<string, unknown> = {
    ...row,
    pin_code: '',
    has_lock_secret: hasSecret,
    has_recovery_code: hasRecovery,
  };
  delete copy.pin_hash;
  delete copy.recovery_code_hash;
  return copy;
}

function isQuietHoursNow(startStr?: string, endStr?: string): boolean {
  if (!startStr || !endStr) return false;
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return false;
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  if (startMin <= endMin) return curMin >= startMin && curMin < endMin;
  return curMin >= startMin || curMin < endMin;
}

// Simple in-memory rate limiter for AI endpoints
const aiRateWindow = new Map<string, { count: number; resetAt: number }>();
function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'local';
  const now = Date.now();
  const entry = aiRateWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    aiRateWindow.set(ip, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (entry.count >= 45) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
    return;
  }
  entry.count += 1;
  next();
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function logAudit(action: string, detail = ''): void {
  try {
    db.prepare('INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?, ?, ?, ?)').run(
      uid('aud'),
      action,
      detail,
      new Date().toISOString()
    );
  } catch {
    // non-fatal
  }
}

// ==========================================
// 1. OS BOOTSTRAP & SYSTEM
// ==========================================
app.get('/api/os/bootstrap', (_req: Request, res: Response) => {
  try {
    const rawProfile = db.prepare('SELECT * FROM user_profile LIMIT 1').get() as Record<string, unknown>;
    const profile = sanitizeProfile(rawProfile);
    const apps = db.prepare('SELECT * FROM installed_apps ORDER BY page_index ASC, sort_order ASC').all();
    const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 60').all();
    const characters = db.prepare('SELECT * FROM characters').all();
    const memories = db.prepare('SELECT * FROM character_memories ORDER BY created_at DESC').all();
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY name ASC').all();
    const calls = db.prepare('SELECT * FROM call_history ORDER BY created_at DESC LIMIT 50').all();
    const conversations = db.prepare('SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC').all();
    const messages = db.prepare("SELECT * FROM messages WHERE COALESCE(deleted_at, '') = '' ORDER BY created_at ASC").all();
    const conversationMembers = db.prepare('SELECT * FROM conversation_members WHERE is_active = 1').all();
    const chatSummaries = db.prepare('SELECT * FROM chat_summaries ORDER BY version DESC').all();
    const proactiveJobs = db.prepare('SELECT * FROM proactive_message_jobs ORDER BY created_at DESC LIMIT 40').all();
    const searchHistory = db.prepare('SELECT * FROM chat_search_history ORDER BY created_at DESC LIMIT 15').all();
    const socialPosts = db.prepare('SELECT * FROM social_posts ORDER BY created_at DESC').all();
    const socialComments = db.prepare('SELECT * FROM social_comments ORDER BY created_at ASC').all();
    const socialStories = db.prepare('SELECT * FROM social_stories ORDER BY created_at DESC').all();
    const media = db.prepare('SELECT * FROM media_assets ORDER BY created_at DESC').all();
    const notes = db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC').all();
    const events = db.prepare('SELECT * FROM calendar_events ORDER BY start_iso ASC').all();
    const reminders = db.prepare('SELECT * FROM reminders ORDER BY is_completed ASC, due_date ASC').all();
    const emails = db.prepare('SELECT * FROM emails ORDER BY created_at DESC').all();
    const files = db.prepare('SELECT * FROM files ORDER BY updated_at DESC').all();
    const recordings = db.prepare('SELECT * FROM recordings ORDER BY created_at DESC').all();
    const bookmarks = db.prepare('SELECT * FROM browser_bookmarks ORDER BY created_at DESC').all();
    const browserHistory = db.prepare('SELECT * FROM browser_history ORDER BY visited_at DESC LIMIT 50').all();
    const alarms = db.prepare('SELECT * FROM alarms ORDER BY time_str ASC').all();
    const worldClocks = db.prepare('SELECT * FROM world_clocks').all();
    const healthLogs = db.prepare('SELECT * FROM health_logs ORDER BY logged_at DESC LIMIT 100').all();
    const walletCards = db.prepare('SELECT * FROM wallet_cards').all();
    const vaultItems = db.prepare('SELECT * FROM vault_items ORDER BY updated_at DESC').all();
    const shortcuts = db.prepare('SELECT * FROM shortcuts').all();
    const translations = db.prepare('SELECT * FROM translations ORDER BY created_at DESC LIMIT 30').all();
    const books = db.prepare('SELECT * FROM books').all();
    const gameScores = db.prepare('SELECT * FROM game_scores ORDER BY played_at DESC LIMIT 30').all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30').all();

    // OS 3.0 tables
    const devices = db.prepare('SELECT * FROM devices ORDER BY is_current DESC, last_active DESC').all();
    const wifiNetworks = db.prepare('SELECT ssid, security, signal, is_saved FROM wifi_networks ORDER BY is_saved DESC, signal DESC').all();
    const bluetoothDevices = db.prepare('SELECT * FROM bluetooth_devices ORDER BY connected DESC, paired DESC').all();
    const batteryHistory = db.prepare('SELECT * FROM battery_history ORDER BY recorded_at ASC LIMIT 48').all();
    const appPermissions = db.prepare('SELECT * FROM app_permissions').all();
    const homeWidgets = db.prepare('SELECT * FROM home_widgets ORDER BY page_index ASC, sort_order ASC').all();
    const backups = db.prepare('SELECT id, schema_version, os_version, integrity_hash, size_kb, summary_json, created_at FROM backups ORDER BY created_at DESC').all();
    const syncJobs = db.prepare('SELECT * FROM sync_jobs ORDER BY synced_at DESC LIMIT 20').all();
    const systemErrors = db.prepare('SELECT * FROM system_errors ORDER BY created_at DESC LIMIT 40').all();
    const scheduledJobs = db.prepare('SELECT * FROM scheduled_jobs ORDER BY run_at ASC LIMIT 40').all();
    const aiRelationships = db.prepare('SELECT * FROM ai_relationships').all();
    const aiEvents = db.prepare('SELECT * FROM ai_events ORDER BY chapter ASC, created_at DESC').all();
    const podcasts = db.prepare('SELECT * FROM podcasts').all();
    const podcastEpisodes = db.prepare('SELECT * FROM podcast_episodes ORDER BY published_at DESC').all();
    const shoppingProducts = db.prepare('SELECT * FROM shopping_products').all();
    const shoppingCart = db.prepare('SELECT * FROM shopping_cart').all();
    const shoppingOrders = db.prepare('SELECT * FROM shopping_orders ORDER BY created_at DESC').all();
    const foodRestaurants = db.prepare('SELECT * FROM food_restaurants').all();
    const foodOrders = db.prepare('SELECT * FROM food_orders ORDER BY created_at DESC').all();
    const rawBankAccounts = db.prepare('SELECT * FROM banking_accounts_demo').all() as Array<Record<string, unknown>>;
    const bankingAccounts = rawBankAccounts.map(({ pin_hash, ...rest }) => {
      if (rest.owner_type === 'ai') {
        const {
          balance: _b,
          available_balance: _ab,
          held_balance: _hb,
          monthly_income: _mi,
          monthly_expense: _me,
          daily_limit: _dl,
          monthly_limit: _ml,
          ...publicAi
        } = rest;
        return { ...publicAi, has_pin: false };
      }
      return { ...rest, has_pin: Boolean(pin_hash) };
    });
    const bankingTransactions = db
      .prepare(
        "SELECT * FROM banking_transactions_demo WHERE account_id IN (SELECT id FROM banking_accounts_demo WHERE COALESCE(owner_type, 'user') = 'user') ORDER BY created_at DESC LIMIT 50"
      )
      .all();
    const bankingBills = db.prepare('SELECT * FROM banking_bills_demo').all();
    const rideTrips = db.prepare('SELECT * FROM ride_trips ORDER BY created_at DESC').all();
    const officeDocs = db.prepare('SELECT * FROM office_docs ORDER BY is_pinned DESC, updated_at DESC').all();
    const communityGroups = db.prepare('SELECT * FROM community_groups').all();
    const communityPosts = db.prepare('SELECT * FROM community_posts ORDER BY created_at DESC').all();
    const communityComments = db.prepare('SELECT * FROM community_comments ORDER BY created_at ASC').all();
    const smartDevices = db.prepare('SELECT * FROM smart_devices').all();
    const smartScenes = db.prepare('SELECT * FROM smart_scenes').all();
    const smartLogs = db.prepare('SELECT * FROM smart_logs ORDER BY created_at DESC LIMIT 30').all();
    // OS 4.0 tables
    const youtubeLibrary = db.prepare('SELECT * FROM youtube_library ORDER BY created_at DESC LIMIT 100').all();
    const movieWatchlist = db.prepare('SELECT * FROM movie_watchlist ORDER BY watched_at DESC').all();
    const musicPlaylists = db.prepare('SELECT * FROM music_playlists ORDER BY updated_at DESC').all();
    const migrations = db.prepare('SELECT * FROM os_migrations ORDER BY migrated_at DESC').all();
    // DokiChat Ultimate 3.0 tables
    const dokiSettings = db.prepare('SELECT * FROM doki_user_settings WHERE id = ?').get('default') || null;
    const aiProviderConfig = getPublicAiConfig();
    const roleplayScenarios = db.prepare('SELECT * FROM roleplay_scenarios ORDER BY created_at DESC').all();
    const relationshipEvents = db.prepare('SELECT * FROM relationship_events ORDER BY created_at DESC LIMIT 80').all();
    const stickerStats = db.prepare('SELECT * FROM sticker_favorites').all();
    const callSessions = db.prepare('SELECT * FROM call_sessions ORDER BY created_at DESC LIMIT 30').all();
    const telecomOverview = getTelecomOverview();

    res.json({
      profile,
      apps,
      notifications,
      characters,
      memories,
      contacts,
      calls,
      conversations,
      messages,
      socialPosts,
      socialComments,
      socialStories,
      media,
      notes,
      events,
      reminders,
      emails,
      files,
      recordings,
      bookmarks,
      browserHistory,
      alarms,
      worldClocks,
      healthLogs,
      walletCards,
      vaultItems,
      shortcuts,
      translations,
      books,
      gameScores,
      auditLogs,
      devices,
      wifiNetworks,
      bluetoothDevices,
      batteryHistory,
      appPermissions,
      homeWidgets,
      backups,
      syncJobs,
      systemErrors,
      scheduledJobs,
      aiRelationships,
      aiEvents,
      podcasts,
      podcastEpisodes,
      shoppingProducts,
      shoppingCart,
      shoppingOrders,
      foodRestaurants,
      foodOrders,
      bankingAccounts,
      bankingTransactions,
      bankingBills,
      rideTrips,
      officeDocs,
      communityGroups,
      communityPosts,
      communityComments,
      smartDevices,
      smartScenes,
      smartLogs,
      youtubeLibrary,
      movieWatchlist,
      musicPlaylists,
      migrations,
      conversationMembers,
      chatSummaries,
      proactiveJobs,
      searchHistory,
      dokiSettings,
      aiProviderConfig,
      roleplayScenarios,
      relationshipEvents,
      stickerStats,
      callSessions,
      telecomCarriers: telecomOverview.carriers,
      telecomSims: telecomOverview.userSims,
      telecomPackages: telecomOverview.packages,
      telecomTransactions: telecomOverview.transactions,
      telecomNotifications: telecomOverview.notifications,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bootstrap failed' });
  }
});

app.patch('/api/os/profile', (req: Request, res: Response) => {
  try {
    const allowed = [
      'name', 'username', 'email', 'avatar', 'unlock_mode', 'theme',
      'wallpaper', 'lock_clock_style', 'lock_clock_font', 'lock_clock_color',
      'aod_enabled', 'hide_sensitive_lock', 'font_size', 'icon_size', 'battery_level',
      'battery_saver', 'dnd', 'silent_mode', 'airplane_mode', 'wifi_on', 'bluetooth_on',
      'mobile_data_on', 'hotspot_on', 'brightness', 'volume', 'permissions_json', 'boot_count',
      'bio', 'language', 'timezone', 'clock_24h', 'game_time_offset_min',
      'show_battery_pct', 'low_battery_threshold', 'auto_saver_threshold', 'charging', 'fast_charging',
      'vpn_on', 'nfc_on', 'selected_wifi',
      'sound_profile', 'vol_ring', 'vol_notif', 'vol_media', 'vol_call', 'vol_alarm',
      'sys_sounds', 'kb_sounds', 'cam_shutter', 'haptic_touch', 'haptic_call', 'haptic_msg',
      'vibrate_intensity', 'vibrate_pattern', 'ringtone', 'msg_tone', 'notif_tone',
      'auto_lock_sec', 'font_weight', 'ui_zoom', 'anim_level', 'high_contrast', 'reduce_motion',
      'icon_labels', 'lock_wallpaper', 'wallpaper_pos', 'transition_style',
      'pin_length', 'guest_mode', 'failed_unlock_count',
      'focus_mode', 'focus_schedule_json', 'muted_apps_json', 'quiet_start', 'quiet_end',
      'proactive_ai_enabled', 'proactive_ai_level', 'ai_memory_enabled',
      'home_columns', 'icon_pack', 'dock_pos', 'kb_theme', 'kb_height',
      'aod_timeout_sec', 'gestures_enabled', 'gesture_sensitivity', 'recovery_email'
    ];
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if ('pin_code' in req.body) {
      const rawPin = String(req.body.pin_code || '');
      updates.push('pin_code = ?');
      values.push('');
      updates.push('pin_hash = ?');
      values.push(rawPin ? hashSecret(rawPin) : '');
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid profile fields provided' });
      return;
    }
    values.push('user_1');
    db.prepare(`UPDATE user_profile SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    if ('name' in req.body || 'avatar' in req.body || 'bio' in req.body || 'username' in req.body) {
      syncMainUserAcrossApps(db);
    }
    const updated = sanitizeProfile(db.prepare('SELECT * FROM user_profile WHERE id = ?').get('user_1') as Record<string, unknown>);
    logAudit('profile_update', updates.filter((u) => !u.startsWith('pin_')).join(', '));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Profile update failed' });
  }
});

app.patch('/api/os/apps/:appId', (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const allowed = ['installed', 'pinned_dock', 'dock_order', 'page_index', 'sort_order', 'folder_name', 'hidden', 'usage_count', 'last_opened_at'];
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (updates.length > 0) {
      values.push(appId);
      db.prepare(`UPDATE installed_apps SET ${updates.join(', ')} WHERE app_id = ?`).run(...values);
    }
    const appRow = db.prepare('SELECT * FROM installed_apps WHERE app_id = ?').get(appId);
    res.json(appRow);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'App update failed' });
  }
});

app.post('/api/os/notifications', (req: Request, res: Response) => {
  try {
    const id = uid('notif');
    const now = new Date().toISOString();
    const { app_id = 'system', group_key = 'System Alerts', title, body, avatar = '', action_route = '', action_payload = '', priority = 0 } = req.body;
    db.prepare(`
      INSERT INTO notifications (id, app_id, group_key, title, body, avatar, action_route, action_payload, priority, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, app_id, group_key, title, body, avatar, action_route, action_payload, priority, now);
    res.json(db.prepare('SELECT * FROM notifications WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Notification error' });
  }
});

app.patch('/api/os/notifications/read-all', (_req: Request, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1').run();
  res.json({ ok: true });
});

app.delete('/api/os/notifications/:id', (req: Request, res: Response) => {
  if (req.params.id === 'all') {
    db.prepare('DELETE FROM notifications').run();
  } else {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

app.get('/api/os/export', (_req: Request, res: Response) => {
  const tables = ['user_profile', 'contacts', 'conversations', 'messages', 'notes', 'calendar_events', 'reminders', 'emails', 'health_logs', 'wallet_cards', 'shortcuts', 'characters', 'character_memories'];
  const payload: Record<string, unknown> = { exportedAt: new Date().toISOString(), os: 'PHONE OS 2.0' };
  for (const t of tables) {
    payload[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  res.json(payload);
});

// ==========================================
// 2. CONTACTS & PHONE
// ==========================================
app.post('/api/contacts', (req: Request, res: Response) => {
  const id = uid('ct');
  const { name, nickname = '', phone, email = '', birthday = '', address = '', company = '', role = '', website = '', notes = '', avatar = '', is_favorite = 0, group_name = 'General' } = req.body;
  db.prepare(`
    INSERT INTO contacts (id, name, nickname, phone, email, birthday, address, company, role, website, notes, avatar, is_favorite, group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, nickname, phone, email, birthday, address, company, role, website, notes, avatar, is_favorite, group_name);
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
});

app.patch('/api/contacts/:id', (req: Request, res: Response) => {
  const fields = ['name', 'nickname', 'phone', 'email', 'birthday', 'address', 'company', 'role', 'website', 'notes', 'avatar', 'is_favorite', 'is_blocked', 'group_name'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

app.delete('/api/contacts/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/calls', (req: Request, res: Response) => {
  const id = uid('call');
  const now = new Date().toISOString();
  const { contact_id = '', name, phone, avatar = '', direction, is_ai = 0, character_id = '', duration_sec = 0, voicemail_text = '' } = req.body;
  db.prepare(`
    INSERT INTO call_history (id, contact_id, name, phone, avatar, direction, is_ai, character_id, duration_sec, voicemail_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, contact_id, name, phone, avatar, direction, is_ai, character_id, duration_sec, voicemail_text, now);
  res.json(db.prepare('SELECT * FROM call_history WHERE id = ?').get(id));
});

app.delete('/api/calls/:id', (req: Request, res: Response) => {
  if (req.params.id === 'all') {
    db.prepare('DELETE FROM call_history').run();
  } else {
    db.prepare('DELETE FROM call_history WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// ==========================================
// 3. MESSAGES & AI CHAT ENGINE
// ==========================================
app.post('/api/messages/conversations', (req: Request, res: Response) => {
  const { title, is_group = 0, avatar = '', character_id = '', members = [], group_mode = 'turn_based', max_ai_turns = 2 } = req.body;
  if (!is_group && character_id) {
    const existing = db.prepare('SELECT * FROM conversations WHERE is_group = 0 AND character_id = ?').get(character_id);
    if (existing) {
      res.json(existing);
      return;
    }
  }
  const id = uid('conv');
  const now = new Date().toISOString();
  const memberIds = Array.isArray(members) ? (members as string[]) : [];
  db.prepare(`
    INSERT INTO conversations (id, title, is_group, avatar, character_id, members_json, group_mode, max_ai_turns, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, is_group ? 1 : 0, avatar, character_id, JSON.stringify(memberIds), group_mode, max_ai_turns, now);

  db.prepare(`
    INSERT OR IGNORE INTO conversation_members (id, conversation_id, member_type, member_id, role, joined_at, muted, is_active)
    VALUES (?, ?, 'user', 'user_1', 'admin', ?, 0, 1)
  `).run(`cm_${id}_user_1`, id, now);

  const aiMembers = is_group ? memberIds : character_id ? [character_id] : [];
  for (const mId of aiMembers) {
    db.prepare(`
      INSERT OR IGNORE INTO conversation_members (id, conversation_id, member_type, member_id, role, joined_at, muted, is_active)
      VALUES (?, ?, 'character', ?, 'member', ?, 0, 1)
    `).run(`cm_${id}_${mId}`, id, mId, now);
  }

  if (character_id && !is_group) {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(character_id) as { name: string; avatar: string; greeting: string } | undefined;
    if (char) {
      const greetingId = uid('msg');
      db.prepare(`
        INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, created_at)
        VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?)
      `).run(greetingId, id, character_id, char.name, char.avatar, char.greeting, now);
      db.prepare('UPDATE conversations SET last_message_id = ? WHERE id = ?').run(greetingId, id);
    }
  }
  res.json(db.prepare('SELECT * FROM conversations WHERE id = ?').get(id));
});

app.patch('/api/messages/conversations/:id', (req: Request, res: Response) => {
  const allowed = ['title', 'pinned', 'archived', 'muted', 'unread_count', 'wallpaper', 'bubble_color', 'roleplay_mode', 'members_json', 'settings_json', 'roleplay_state_json', 'group_mode', 'max_ai_turns'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of allowed) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id));
});

app.delete('/api/messages/conversations/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM chat_summaries WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM proactive_message_jobs WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/messages/send', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const {
      conversation_id,
      content,
      msg_type = 'text',
      attachment_json = '{}',
      reply_to_id = '',
      trigger_ai = true,
      client_temp_id = '',
      request_id = '',
      metadata_json = '{}',
    } = req.body;
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
      id: string; is_group: number; character_id: string; members_json: string; roleplay_mode: number;
    } | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Idempotency guard for offline retry / double-submit
    if (client_temp_id) {
      const existingMsg = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? AND client_temp_id = ? LIMIT 1')
        .get(conversation_id, client_temp_id) as { id: string } | undefined;
      if (existingMsg) {
        res.json({ userMessage: existingMsg, aiMessage: null, aiMessages: [], aiError: null, updatedCharacter: null, deduplicated: true });
        return;
      }
    }

    const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
    const now = new Date().toISOString();
    const userMsgId = uid('msg');
    const attStr = typeof attachment_json === 'string' ? attachment_json : JSON.stringify(attachment_json);
    const metaStr = typeof metadata_json === 'string' ? metadata_json : JSON.stringify(metadata_json);

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type,
        attachment_json, reply_to_id, delivery_status, metadata_json, client_temp_id, created_at
      ) VALUES (?, ?, 'user', 'user_1', ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
    `).run(userMsgId, conversation_id, profile.name, profile.avatar, content, msg_type, attStr, reply_to_id, metaStr, client_temp_id || '', now);

    db.prepare('UPDATE conversations SET updated_at = ?, unread_count = 0, last_message_id = ? WHERE id = ?').run(now, userMsgId, conversation_id);
    const userMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(userMsgId);

    mirrorOSMessageToSocial(db, {
      osMessageId: userMsgId,
      conversationId: conversation_id,
      senderId: 'user_1',
      content: content || '',
      msgType: msg_type,
      attachmentJson: attStr,
      createdAt: now,
    });

    if (!trigger_ai) {
      res.json({ userMessage, aiMessage: null, aiMessages: [], aiError: null, updatedCharacter: null });
      return;
    }

    const aiRes = await generateAndStoreAiReplyV3(conversation_id, content, msg_type, attachment_json, {
      requestId: request_id || undefined,
      lastMessageId: userMsgId,
    });
    res.json({ userMessage, ...aiRes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Send message failed' });
  }
});

app.post('/api/messages/ai-reply', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { conversation_id, last_message_id, request_id } = req.body as {
      conversation_id?: string;
      last_message_id?: string;
      request_id?: string;
    };
    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id required' });
      return;
    }
    const lastMsg = last_message_id
      ? (db.prepare('SELECT content, msg_type, attachment_json FROM messages WHERE id = ?').get(last_message_id) as
          | { content: string; msg_type: string; attachment_json: string }
          | undefined)
      : (db.prepare("SELECT content, msg_type, attachment_json FROM messages WHERE conversation_id = ? AND sender_type = 'user' AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 1").get(conversation_id) as
          | { content: string; msg_type: string; attachment_json: string }
          | undefined);

    const aiRes = await generateAndStoreAiReplyV3(
      conversation_id,
      lastMsg?.content || '',
      lastMsg?.msg_type || 'text',
      lastMsg?.attachment_json || '{}',
      { requestId: request_id, lastMessageId: last_message_id }
    );
    res.json(aiRes);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI reply failed' });
  }
});

app.patch('/api/messages/:id', (req: Request, res: Response) => {
  const { content, reactions_json, is_pinned, is_saved } = req.body;
  const now = new Date().toISOString();
  if (content !== undefined) {
    db.prepare('UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?').run(content, now, req.params.id);
  }
  if (reactions_json !== undefined) {
    db.prepare('UPDATE messages SET reactions_json = ? WHERE id = ?').run(
      typeof reactions_json === 'string' ? reactions_json : JSON.stringify(reactions_json),
      req.params.id
    );
  }
  if (is_pinned !== undefined) {
    db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?').run(is_pinned ? 1 : 0, req.params.id);
  }
  if (is_saved !== undefined) {
    db.prepare('UPDATE messages SET is_saved = ? WHERE id = ?').run(is_saved ? 1 : 0, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id));
});

app.delete('/api/messages/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==========================================
// 4. CHARACTERS & MEMORIES
// ==========================================
app.post('/api/characters', (req: Request, res: Response) => {
  const id = uid('char');
  const now = new Date().toISOString();
  const {
    name, age = 20, tagline, personality, bio, likes = 'Music, coffee', dislikes = 'Noise',
    voice_name = 'Kore', voice_style = 'Warm, friendly', avatar = '/src/assets/images/char_yuki_1794880089308.jpg',
    cover_image = '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
    scenario = 'Relaxing at home', greeting = 'Xin chào! Rất vui được làm quen với bạn trên PHONE OS!',
    username = '', gender = 'unknown', occupation = '', city = '',
    join_social = 1, is_verified = 0, social_bio = '', role_title = 'Bạn đồng hành AI',
    relationship_label = ''
  } = req.body;
  db.prepare(`
    INSERT INTO characters (
      id, name, age, tagline, personality, bio, likes, dislikes, voice_name, voice_style,
      avatar, cover_image, scenario, greeting, author, schedule_json,
      username, gender, occupation, city, join_social, is_verified, social_bio, role_title, relationship_label,
      is_custom, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'You', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, name, age, tagline, personality, bio, likes, dislikes, voice_name, voice_style,
    avatar, cover_image, scenario, greeting, JSON.stringify([{ time: '09:00', activity: 'Morning hello' }]),
    username, gender, occupation, city, join_social ? 1 : 0, is_verified ? 1 : 0, social_bio || bio, role_title, relationship_label,
    now, now
  );

  // Also add to Contacts
  db.prepare(`
    INSERT INTO contacts (id, name, nickname, phone, avatar, is_ai, character_id, group_name)
    VALUES (?, ?, ?, ?, ?, 1, ?, 'AI Companions')
  `).run(uid('ct'), name, name.split(' ')[0], `+81 90-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`, avatar, id);

  ensureAiCharacterBankAccount(db, id);
  syncCharacterAcrossApps(db, id);

  res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(id));
});

app.patch('/api/characters/:id', (req: Request, res: Response) => {
  const fields = [
    'name', 'age', 'tagline', 'personality', 'bio', 'likes', 'dislikes', 'avatar', 'cover_image',
    'username', 'gender', 'occupation', 'city', 'join_social', 'is_verified', 'social_bio',
    'relationship_label', 'role_title', 'pronouns', 'speaking_style', 'activity_status',
    'is_followed', 'is_favorite', 'mood', 'relationship_level', 'relationship_xp',
  ];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
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

app.post('/api/characters/:id/memories', (req: Request, res: Response) => {
  const memId = uid('mem');
  const { memory_type = 'long_term', content, importance = 7 } = req.body;
  db.prepare('INSERT INTO character_memories (id, character_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    memId, req.params.id, memory_type, content, importance, new Date().toISOString()
  );
  res.json(db.prepare('SELECT * FROM character_memories WHERE id = ?').get(memId));
});

app.delete('/api/characters/memories/:memId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM character_memories WHERE id = ?').run(req.params.memId);
  res.json({ ok: true });
});

// ==========================================
// 5. ANIME SOCIAL
// ==========================================
app.post('/api/social/posts', (req: Request, res: Response) => {
  const id = uid('post');
  const now = new Date().toISOString();
  const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
  const { content, media_url = '', media_type = '', hashtags = [] } = req.body;
  const mediaJson = media_url ? JSON.stringify([{ url: media_url, type: media_type === 'video' ? 'video' : 'image' }]) : '[]';
  const postType = media_url ? (media_type === 'video' ? 'video' : 'image') : 'text';
  db.prepare(`
    INSERT INTO social_posts (id, author_type, author_id, author_name, author_avatar, content, post_type, media_url, media_type, media_json, hashtags_json, privacy, status, likes_count, created_at, updated_at)
    VALUES (?, 'user', 'user_1', ?, ?, ?, ?, ?, ?, ?, ?, 'public', 'published', 0, ?, ?)
  `).run(id, profile.name, profile.avatar, content, postType, media_url, media_type, mediaJson, JSON.stringify(hashtags), now, now);
  res.json(db.prepare('SELECT * FROM social_posts WHERE id = ?').get(id));
});

app.patch('/api/social/posts/:id', (req: Request, res: Response) => {
  const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id) as { is_liked: number; likes_count: number; is_saved: number } | undefined;
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  if (req.body.toggleLike) {
    const nextLiked = post.is_liked ? 0 : 1;
    const nextCount = Math.max(0, post.likes_count + (nextLiked ? 1 : -1));
    db.prepare('UPDATE social_posts SET is_liked = ?, likes_count = ? WHERE id = ?').run(nextLiked, nextCount, req.params.id);
  }
  if (req.body.toggleSave) {
    db.prepare('UPDATE social_posts SET is_saved = ? WHERE id = ?').run(post.is_saved ? 0 : 1, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id));
});

app.delete('/api/social/posts/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM social_comments WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM social_posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/social/comments', (req: Request, res: Response) => {
  const id = uid('cmt');
  const now = new Date().toISOString();
  const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
  const { post_id, content } = req.body;
  db.prepare('INSERT INTO social_comments (id, post_id, author_name, author_avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, post_id, profile.name, profile.avatar, content, now
  );
  res.json(db.prepare('SELECT * FROM social_comments WHERE id = ?').get(id));
});

app.patch('/api/social/stories/:id/view', (req: Request, res: Response) => {
  db.prepare('UPDATE social_stories SET viewed = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==========================================
// 6. MEDIA (CAMERA / PHOTOS), NOTES, CALENDAR, REMINDERS, MAIL, FILES
// ==========================================
app.post('/api/media', (req: Request, res: Response) => {
  const id = uid('med');
  const now = new Date().toISOString();
  const { type = 'photo', title = 'Capture', data_url, album = 'Camera', location_name = '', character_id = '', tags = [] } = req.body;
  db.prepare(`
    INSERT INTO media_assets (id, type, title, data_url, album, location_name, character_id, tags_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, title, data_url, album, location_name, character_id, JSON.stringify(tags), now);
  res.json(db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id));
});

app.patch('/api/media/:id', (req: Request, res: Response) => {
  const fields = ['title', 'data_url', 'album', 'is_favorite', 'is_deleted', 'deleted_at'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE media_assets SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id));
});

app.delete('/api/media/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/notes', (req: Request, res: Response) => {
  const id = uid('note');
  const now = new Date().toISOString();
  const { title = 'Untitled Note', content = '', folder = 'Personal', is_pinned = 0, is_locked = 0 } = req.body;
  db.prepare('INSERT INTO notes (id, title, content, folder, is_pinned, is_locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, title, content, folder, is_pinned, is_locked, now
  );
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
});

app.patch('/api/notes/:id', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const fields = ['title', 'content', 'folder', 'is_pinned', 'is_locked', 'is_deleted'];
  const sets = ['updated_at = ?'];
  const vals: unknown[] = [now];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  vals.push(req.params.id);
  db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

app.delete('/api/notes/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/calendar', (req: Request, res: Response) => {
  const id = uid('cal');
  const { title, start_iso, end_iso, all_day = 0, location = '', notes = '', color = '#A78BFA', reminder_min = 15, repeat_rule = 'none', character_id = '', attendees = [] } = req.body;
  db.prepare(`
    INSERT INTO calendar_events (id, title, start_iso, end_iso, all_day, location, notes, color, reminder_min, repeat_rule, character_id, attendees_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, start_iso, end_iso, all_day ? 1 : 0, location, notes, color, reminder_min, repeat_rule, character_id, JSON.stringify(attendees));
  res.json(db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id));
});

app.patch('/api/calendar/:id', (req: Request, res: Response) => {
  const fields = ['title', 'start_iso', 'end_iso', 'all_day', 'location', 'notes', 'color', 'reminder_min', 'repeat_rule'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id));
});

app.delete('/api/calendar/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/reminders', (req: Request, res: Response) => {
  const id = uid('rem');
  const { title, notes = '', due_date = '', due_time = '', priority = 'medium', list_name = 'Personal', repeat_rule = 'none' } = req.body;
  db.prepare(`
    INSERT INTO reminders (id, title, notes, due_date, due_time, priority, list_name, repeat_rule)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, notes, due_date, due_time, priority, list_name, repeat_rule);
  res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id));
});

app.patch('/api/reminders/:id', (req: Request, res: Response) => {
  const fields = ['title', 'notes', 'due_date', 'due_time', 'priority', 'list_name', 'is_completed', 'repeat_rule'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id));
});

app.delete('/api/reminders/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/emails', (req: Request, res: Response) => {
  const id = uid('mail');
  const now = new Date().toISOString();
  const profile = db.prepare('SELECT name, email FROM user_profile LIMIT 1').get() as { name: string; email: string };
  const { folder = 'sent', to_email, subject, body, attachment_name = '', attachment_content = '' } = req.body;
  db.prepare(`
    INSERT INTO emails (id, folder, from_name, from_email, to_email, subject, body, attachment_name, attachment_content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, folder, profile.name, profile.email, to_email, subject, body, attachment_name, attachment_content, now);
  res.json(db.prepare('SELECT * FROM emails WHERE id = ?').get(id));
});

app.patch('/api/emails/:id', (req: Request, res: Response) => {
  const fields = ['folder', 'is_starred', 'is_read', 'subject', 'body'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE emails SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id));
});

app.delete('/api/emails/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM emails WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/files', (req: Request, res: Response) => {
  const id = uid('file');
  const now = new Date().toISOString();
  const { name, folder = 'Documents', mime_type = 'text/plain', size_bytes = 0, content_text = '', data_url = '' } = req.body;
  db.prepare(`
    INSERT INTO files (id, name, folder, mime_type, size_bytes, content_text, data_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, folder, mime_type, size_bytes, content_text, data_url, now);
  res.json(db.prepare('SELECT * FROM files WHERE id = ?').get(id));
});

app.patch('/api/files/:id', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const fields = ['name', 'folder', 'is_favorite', 'content_text'];
  const sets = ['updated_at = ?'];
  const vals: unknown[] = [now];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  vals.push(req.params.id);
  db.prepare(`UPDATE files SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id));
});

app.delete('/api/files/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/recordings', (req: Request, res: Response) => {
  const id = uid('rec');
  const now = new Date().toISOString();
  const { title, duration_sec = 0, data_url, mime_type = 'audio/webm' } = req.body;
  db.prepare('INSERT INTO recordings (id, title, duration_sec, data_url, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, title, duration_sec, data_url, mime_type, now
  );
  res.json(db.prepare('SELECT * FROM recordings WHERE id = ?').get(id));
});

app.patch('/api/recordings/:id', (req: Request, res: Response) => {
  const fields = ['title', 'transcript'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE recordings SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id));
});

app.delete('/api/recordings/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM recordings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==========================================
// 7. BROWSER, CLOCK, HEALTH, WALLET, VAULT, SHORTCUTS, BOOKS, GAMES
// ==========================================
app.post('/api/browser/bookmarks', (req: Request, res: Response) => {
  const id = uid('bm');
  db.prepare('INSERT INTO browser_bookmarks (id, title, url, folder, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, req.body.title, req.body.url, req.body.folder || 'Favorites', new Date().toISOString()
  );
  res.json(db.prepare('SELECT * FROM browser_bookmarks WHERE id = ?').get(id));
});

app.delete('/api/browser/bookmarks/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM browser_bookmarks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/browser/history', (req: Request, res: Response) => {
  const id = uid('hist');
  db.prepare('INSERT INTO browser_history (id, title, url, visited_at) VALUES (?, ?, ?, ?)').run(
    id, req.body.title, req.body.url, new Date().toISOString()
  );
  res.json(db.prepare('SELECT * FROM browser_history WHERE id = ?').get(id));
});

app.delete('/api/browser/history/:id', (req: Request, res: Response) => {
  if (req.params.id === 'all') {
    db.prepare('DELETE FROM browser_history').run();
  } else {
    db.prepare('DELETE FROM browser_history WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

app.post('/api/clock/alarms', (req: Request, res: Response) => {
  const id = uid('alm');
  db.prepare('INSERT INTO alarms (id, time_str, label, repeat_days, sound, enabled) VALUES (?, ?, ?, ?, ?, 1)').run(
    id, req.body.time_str, req.body.label || 'Alarm', req.body.repeat_days || 'Daily', req.body.sound || 'Soft Chime'
  );
  res.json(db.prepare('SELECT * FROM alarms WHERE id = ?').get(id));
});

app.patch('/api/clock/alarms/:id', (req: Request, res: Response) => {
  const fields = ['time_str', 'label', 'repeat_days', 'sound', 'enabled'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE alarms SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM alarms WHERE id = ?').get(req.params.id));
});

app.delete('/api/clock/alarms/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM alarms WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/clock/world', (req: Request, res: Response) => {
  const id = uid('wc');
  db.prepare('INSERT INTO world_clocks (id, city, timezone) VALUES (?, ?, ?)').run(id, req.body.city, req.body.timezone);
  res.json(db.prepare('SELECT * FROM world_clocks WHERE id = ?').get(id));
});

app.delete('/api/clock/world/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM world_clocks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/health', (req: Request, res: Response) => {
  const id = uid('hl');
  const now = new Date().toISOString();
  const { log_type, value_num, unit, label = '', extra_json = '{}' } = req.body;
  db.prepare('INSERT INTO health_logs (id, log_type, value_num, unit, label, extra_json, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, log_type, value_num, unit, label, typeof extra_json === 'string' ? extra_json : JSON.stringify(extra_json), now
  );
  res.json(db.prepare('SELECT * FROM health_logs WHERE id = ?').get(id));
});

app.delete('/api/health/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM health_logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/wallet', (req: Request, res: Response) => {
  const id = uid('wal');
  const { card_type, title, subtitle, code_value, color = '#A78BFA', expires_at = '' } = req.body;
  db.prepare('INSERT INTO wallet_cards (id, card_type, title, subtitle, code_value, color, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, card_type, title, subtitle, code_value, color, expires_at
  );
  res.json(db.prepare('SELECT * FROM wallet_cards WHERE id = ?').get(id));
});

app.delete('/api/wallet/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM wallet_cards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/vault', (req: Request, res: Response) => {
  const id = uid('vlt');
  const now = new Date().toISOString();
  const { site, username, encrypted_payload, iv_hex, notes = '' } = req.body;
  db.prepare('INSERT INTO vault_items (id, site, username, encrypted_payload, iv_hex, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, site, username, encrypted_payload, iv_hex, notes, now
  );
  res.json(db.prepare('SELECT * FROM vault_items WHERE id = ?').get(id));
});

app.delete('/api/vault/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM vault_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/shortcuts', (req: Request, res: Response) => {
  const id = uid('sc');
  const { name, trigger_event, action_type, action_payload = '{}' } = req.body;
  db.prepare('INSERT INTO shortcuts (id, name, trigger_event, action_type, action_payload, enabled) VALUES (?, ?, ?, ?, ?, 1)').run(
    id, name, trigger_event, action_type, typeof action_payload === 'string' ? action_payload : JSON.stringify(action_payload)
  );
  res.json(db.prepare('SELECT * FROM shortcuts WHERE id = ?').get(id));
});

app.patch('/api/shortcuts/:id', (req: Request, res: Response) => {
  const fields = ['enabled', 'last_run', 'run_count', 'name'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE shortcuts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM shortcuts WHERE id = ?').get(req.params.id));
});

app.delete('/api/shortcuts/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM shortcuts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/books', (req: Request, res: Response) => {
  const id = uid('book');
  const { title, author = 'Uploaded', cover_color = '#6366F1', pages = [] } = req.body;
  db.prepare('INSERT INTO books (id, title, author, cover_color, pages_json) VALUES (?, ?, ?, ?, ?)').run(
    id, title, author, cover_color, JSON.stringify(pages)
  );
  res.json(db.prepare('SELECT * FROM books WHERE id = ?').get(id));
});

app.patch('/api/books/:id', (req: Request, res: Response) => {
  const fields = ['current_page', 'bookmarks_json', 'is_favorite'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id));
});

app.post('/api/games/scores', (req: Request, res: Response) => {
  const id = uid('gs');
  db.prepare('INSERT INTO game_scores (id, game_id, score, detail, played_at) VALUES (?, ?, ?, ?, ?)').run(
    id, req.body.game_id, req.body.score, req.body.detail || '', new Date().toISOString()
  );
  res.json(db.prepare('SELECT * FROM game_scores WHERE id = ?').get(id));
});

// ==========================================
// 8. AI SERVICES (GEMINI SERVER PROXY)
// ==========================================
app.post('/api/ai/tts', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { text, voiceName = 'Kore', style = 'Warm conversational' } = req.body;
    const base64Audio = await generateCharacterSpeech(text, voiceName, style);
    res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'TTS generation failed' });
  }
});

app.post('/api/ai/transcribe', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { audioDataUrl, mimeType = 'audio/webm' } = req.body;
    const transcript = await transcribeAudioBase64(audioDataUrl, mimeType);
    res.json({ transcript });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Transcription failed' });
  }
});

app.post('/api/ai/ocr', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { imageDataUrl } = req.body;
    const text = await extractDocumentOCR(imageDataUrl);
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'OCR extraction failed' });
  }
});

app.post('/api/ai/translate', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    const translated = await translateTextAI(text, sourceLang, targetLang);
    const id = uid('tr');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO translations (id, source_lang, target_lang, source_text, translated_text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, sourceLang, targetLang, text, translated, now
    );
    res.json(db.prepare('SELECT * FROM translations WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Translation failed' });
  }
});

app.post('/api/ai/assistant', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const apps = (db.prepare('SELECT app_id FROM installed_apps WHERE installed = 1').all() as Array<{ app_id: string }>).map((a) => a.app_id);
    const characters = (db.prepare('SELECT name FROM characters').all() as Array<{ name: string }>).map((c) => c.name);
    const recentEmails = db.prepare('SELECT id, from_name as "from", subject, body FROM emails WHERE folder = ? ORDER BY created_at DESC LIMIT 5').all('inbox') as Array<{ id: string; from: string; subject: string; body: string }>;
    const upcomingEvents = db.prepare('SELECT title, start_iso FROM calendar_events ORDER BY start_iso ASC LIMIT 5').all() as Array<{ title: string; start_iso: string }>;
    const pendingReminders = db.prepare('SELECT title, due_date FROM reminders WHERE is_completed = 0 LIMIT 5').all() as Array<{ title: string; due_date: string }>;

    const result = await runAssistantPrompt(prompt, {
      apps, characters, recentEmails, upcomingEvents, pendingReminders,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Assistant error' });
  }
});

app.post('/api/ai/life-tick', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const profile = db.prepare('SELECT proactive_ai_enabled, focus_mode, quiet_start, quiet_end FROM user_profile LIMIT 1').get() as {
      proactive_ai_enabled?: number; focus_mode?: string; quiet_start?: string; quiet_end?: string;
    } | undefined;
    const body = (req.body || {}) as { force?: boolean; characterId?: string; action?: 'auto' | 'create_post' | 'create_story' | 'comment_post' | 'react_post' | 'follow_or_friend' | 'send_dm' | 'join_livestream' };
    const force = Boolean(body.force);
    if (!force && profile) {
      if (profile.proactive_ai_enabled === 0 || (profile.focus_mode && profile.focus_mode !== 'off') || isQuietHoursNow(profile.quiet_start, profile.quiet_end)) {
        res.json({ skipped: true, reason: 'Đang bật giờ yên tĩnh, Chế độ tập trung hoặc đã tắt AI chủ động.' });
        return;
      }
    }

    const result = await runContextualSocialTick(db, {
      force: true,
      characterId: body.characterId,
      action: body.action || 'auto',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Life simulation tick failed' });
  }
});

// ==========================================
// 9. REAL EXTERNAL API PROXIES (LOẠI A)
// ==========================================
app.get('/api/external/weather', async (req: Request, res: Response) => {
  try {
    const city = typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim() : 'Ho Chi Minh City';
    let lat = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
    let lon = typeof req.query.lon === 'string' ? Number(req.query.lon) : NaN;
    let resolvedName = city;

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      const geoJson = (await geoRes.json()) as { results?: Array<{ latitude: number; longitude: number; name: string; country?: string }> };
      if (!geoJson.results || geoJson.results.length === 0) {
        res.status(404).json({ error: `Location "${city}" not found.` });
        return;
      }
      lat = geoJson.results[0].latitude;
      lon = geoJson.results[0].longitude;
      resolvedName = `${geoJson.results[0].name}${geoJson.results[0].country ? `, ${geoJson.results[0].country}` : ''}`;
    }

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max&timezone=auto`
    );
    const wxJson = await wxRes.json();
    res.json({ locationName: resolvedName, latitude: lat, longitude: lon, forecast: wxJson, source: 'Open-Meteo API' });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Weather service unavailable' });
  }
});

app.get('/api/external/currency', async (req: Request, res: Response) => {
  try {
    const base = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'USD';
    const fxRes = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);
    if (!fxRes.ok) {
      throw new Error('Exchange rate API unavailable');
    }
    const data = await fxRes.json();
    res.json({ ...data, source: 'Frankfurter ECB API' });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Currency API unavailable' });
  }
});

app.get('/api/external/news', async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : 'top';
    const listUrl = category === 'new'
      ? 'https://hacker-news.firebaseio.com/v0/newstories.json'
      : 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const idsRes = await fetch(listUrl);
    const ids = (await idsRes.json()) as number[];
    const topIds = ids.slice(0, 14);
    const items = await Promise.all(
      topIds.map(async (id) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return r.json();
      })
    );
    res.json({ articles: items.filter(Boolean), source: 'Hacker News Public API' });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'News feed unavailable' });
  }
});

app.get('/api/external/maps-search', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.status(400).json({ error: 'Search query required' });
      return;
    }
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8`,
      { headers: { 'User-Agent': 'PhoneOS-Simulation/2.0' } }
    );
    const results = await nomRes.json();
    res.json({ results, source: 'OpenStreetMap Nominatim' });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Map search unavailable' });
  }
});

// ==========================================
// 10. VITE / STATIC SERVER MOUNTING
// ==========================================
async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  attachSocialWebSocket(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PHONE OS running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
