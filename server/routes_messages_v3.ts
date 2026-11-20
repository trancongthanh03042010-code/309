import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.ts';
import {
  getPublicAiConfig,
  sanitizeAllowedModel,
  verifyAiAdminToken,
} from './ai_provider.ts';
import {
  generateCharacterPreviewReply,
  generateCharacterReply,
  generateCharacterReplyStream,
  generateGroupChatTurns,
  generateProactiveCheckIn,
  generateRoleplayRecap,
  generateVoiceCallTurn,
  summarizeConversationWithDelta,
  transcribeAudioBase64,
  type ResponseTuningOptions,
  type RoleplayStateContext,
} from './gemini.ts';
import {
  finalizeAiChatBankingTransfer,
  prepareAiChatBankingContext,
  stripHikariTransferTags,
} from './banking_engine.ts';
import {
  deleteCharacterAcrossApps,
  mirrorOSMessageToSocial,
  syncCharacterAcrossApps,
} from './character_sync.ts';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function normalizeViText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
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

function getScheduleHint(scheduleJson?: string): string {
  if (!scheduleJson) return '';
  try {
    const items = JSON.parse(scheduleJson) as Array<{ time: string; activity: string }>;
    if (!Array.isArray(items) || items.length === 0) return '';
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    let best = items[0];
    let bestDiff = Infinity;
    for (const item of items) {
      const [h, m] = (item.time || '').split(':').map(Number);
      if (Number.isNaN(h)) continue;
      const mins = h * 60 + (m || 0);
      const diff = curMin >= mins ? curMin - mins : curMin + 1440 - mins;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = item;
      }
    }
    return best ? `${best.time} - ${best.activity}` : '';
  } catch {
    return '';
  }
}

// Track active in-flight AI generations so user can cancel cleanly
const activeAiControllers = new Map<string, AbortController>();

export function cancelAiGeneration(key: string): boolean {
  const ctrl = activeAiControllers.get(key);
  if (ctrl) {
    ctrl.abort();
    activeAiControllers.delete(key);
    return true;
  }
  return false;
}

export function upsertSmartMemory(
  characterId: string,
  content: string,
  memoryType: 'long_term' | 'short_term' | 'relationship' | 'preference' | 'event' = 'long_term',
  importance = 7,
  sourceKind: 'user_requested' | 'ai_inferred' | 'manual' = 'ai_inferred',
  sourceMessageId = '',
  confidence = 0.85
) {
  const clean = content.trim();
  if (!clean) return null;
  const now = new Date().toISOString();
  const normNew = normalizeViText(clean);

  const existingList = db
    .prepare('SELECT id, content, memory_type, importance, source_kind FROM character_memories WHERE character_id = ?')
    .all(characterId) as Array<{
    id: string;
    content: string;
    memory_type: string;
    importance: number;
    source_kind?: string;
  }>;

  // Deduplicate exact or strongly overlapping memories
  for (const existing of existingList) {
    const normEx = normalizeViText(existing.content);
    if (normEx === normNew || (normEx.length > 16 && (normEx.includes(normNew) || normNew.includes(normEx)))) {
      const nextImportance = Math.max(existing.importance, importance);
      const nextContent = clean.length >= existing.content.length ? clean : existing.content;
      db.prepare(
        'UPDATE character_memories SET content = ?, memory_type = ?, importance = ?, confidence = ?, updated_at = ?, is_active = 1 WHERE id = ?'
      ).run(nextContent, memoryType, nextImportance, confidence, now, existing.id);
      return db.prepare('SELECT * FROM character_memories WHERE id = ?').get(existing.id);
    }
  }

  const memId = uid('mem');
  db.prepare(`
    INSERT INTO character_memories (
      id, character_id, user_id, memory_type, content, importance, confidence, source_message_id, source_kind, created_at, updated_at, is_active
    ) VALUES (?, ?, 'user_1', ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(memId, characterId, memoryType, clean, importance, confidence, sourceMessageId, sourceKind, now, now);

  return db.prepare('SELECT * FROM character_memories WHERE id = ?').get(memId);
}

function updateCharacterRelationshipNatural(
  charId: string,
  reason: string,
  affDelta = 1,
  famDelta = 1,
  truDelta = 1,
  respectDelta = 1,
  emotionTag = ''
) {
  try {
    const rel = db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(charId) as
      | {
          affection: number;
          trust: number;
          familiarity: number;
          respect?: number;
          conflict: number;
          stage: string;
          history_json: string;
        }
      | undefined;
    if (!rel) return;
    const now = new Date().toISOString();
    const aff = Math.max(0, Math.min(100, rel.affection + affDelta));
    const fam = Math.max(0, Math.min(100, rel.familiarity + famDelta));
    const tru = Math.max(0, Math.min(100, rel.trust + truDelta));
    const resScore = Math.max(0, Math.min(100, (rel.respect ?? 50) + respectDelta));
    const stage =
      rel.conflict >= 35
        ? 'Căng thẳng'
        : aff >= 85 && tru >= 80
        ? 'Gắn bó sâu sắc'
        : aff >= 65
        ? 'Thân thiết'
        : fam >= 40
        ? 'Bạn bè'
        : 'Bạn mới';
    const hist = JSON.parse(rel.history_json || '[]') as Array<{ time: string; delta: string; reason: string }>;
    const summaryDelta = `${affDelta >= 0 ? `+${affDelta}` : affDelta} Tình cảm · ${truDelta >= 0 ? `+${truDelta}` : truDelta} Tin tưởng`;
    hist.unshift({ time: now, delta: summaryDelta, reason });
    db.prepare(
      'UPDATE ai_relationships SET affection = ?, trust = ?, familiarity = ?, respect = ?, stage = ?, history_json = ?, updated_at = ? WHERE character_id = ?'
    ).run(aff, tru, fam, resScore, stage, JSON.stringify(hist.slice(0, 20)), now, charId);

    db.prepare(`
      INSERT INTO relationship_events (id, character_id, event_type, description, affection_delta, trust_delta, familiarity_delta, respect_delta, emotion_tag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('relev'),
      charId,
      stage !== rel.stage ? 'stage_up' : 'interaction',
      reason || 'Trò chuyện cùng bạn',
      affDelta,
      truDelta,
      famDelta,
      respectDelta,
      emotionTag,
      now
    );
  } catch {
    // non-fatal
  }
}

function getEffectiveTuningForConversation(convSettingsRaw?: string): ResponseTuningOptions {
  let dokiDefaults: Record<string, string> = {};
  try {
    dokiDefaults =
      (db.prepare('SELECT * FROM doki_user_settings WHERE id = ?').get('default') as Record<string, string> | undefined) || {};
  } catch {
    dokiDefaults = {};
  }
  let convCfg: Record<string, string> = {};
  try {
    convCfg = JSON.parse(convSettingsRaw || '{}') as Record<string, string>;
  } catch {
    convCfg = {};
  }
  return {
    responseLength: (convCfg.responseLength || dokiDefaults.default_response_length || 'medium') as ResponseTuningOptions['responseLength'],
    detailLevel: (convCfg.detailLevel || dokiDefaults.default_detail_level || 'balanced') as ResponseTuningOptions['detailLevel'],
    humorLevel: (convCfg.humorLevel || dokiDefaults.default_humor || 'balanced') as ResponseTuningOptions['humorLevel'],
    proactivity: (convCfg.proactivity || dokiDefaults.proactive_frequency || 'medium') as ResponseTuningOptions['proactivity'],
    narrationStyle: (convCfg.narrationStyle || dokiDefaults.default_narration || 'chat') as ResponseTuningOptions['narrationStyle'],
    pronouns: convCfg.pronouns || undefined,
    responseLanguage: convCfg.responseLanguage || dokiDefaults.default_language || 'vi',
  };
}

function isAntiSpamThrottled(conversationId: string, latestContent: string): boolean {
  if ((latestContent || '').trim().length <= 2) return true;
  try {
    const last2 = db
      .prepare("SELECT created_at FROM messages WHERE conversation_id = ? AND sender_type = 'user' ORDER BY created_at DESC LIMIT 2")
      .all(conversationId) as Array<{ created_at: string }>;
    if (last2.length === 2) {
      const diffMs = Math.abs(new Date(last2[0].created_at).getTime() - new Date(last2[1].created_at).getTime());
      if (diffMs < 4000) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function generateAndStoreAiReplyV3(
  conversation_id: string,
  latestContent: string,
  latestMsgType: string,
  latestAttachmentJson: unknown,
  options?: { requestId?: string; lastMessageId?: string }
) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as
    | {
        id: string;
        title: string;
        is_group: number;
        character_id: string;
        members_json: string;
        roleplay_mode: number;
        roleplay_state_json?: string;
        group_mode?: 'mention_only' | 'turn_based' | 'open_discussion';
        max_ai_turns?: number;
        settings_json?: string;
      }
    | undefined;

  if (!conv) {
    return {
      aiMessage: null,
      aiMessages: [] as unknown[],
      aiError: 'Không tìm thấy cuộc trò chuyện',
      updatedCharacter: null,
      newMemoryRecord: null,
    };
  }

  const reqKey = options?.requestId || conversation_id;
  // Abort any stale in-flight request for the exact same key
  if (options?.requestId) {
    cancelAiGeneration(reqKey);
  }
  const controller = new AbortController();
  activeAiControllers.set(reqKey, controller);
  activeAiControllers.set(conversation_id, controller);

  try {
    const profile = db.prepare('SELECT name, avatar, ai_memory_enabled FROM user_profile LIMIT 1').get() as {
      name: string;
      avatar: string;
      ai_memory_enabled?: number;
    };
    const globalMemoryOn = profile.ai_memory_enabled !== 0;

    let roleplayState: RoleplayStateContext = {};
    try {
      roleplayState = JSON.parse(conv.roleplay_state_json || '{}') as RoleplayStateContext;
    } catch {
      roleplayState = {};
    }

    let convSettings: { responseLanguage?: string } = {};
    try {
      convSettings = JSON.parse(conv.settings_json || '{}') as { responseLanguage?: string };
    } catch {
      convSettings = {};
    }

    const latestSummaryRow = db
      .prepare('SELECT summary FROM chat_summaries WHERE conversation_id = ? ORDER BY version DESC, created_at DESC LIMIT 1')
      .get(conversation_id) as { summary: string } | undefined;

    // ---------------------------------------------------------
    // GROUP CHAT MULTI-CHARACTER ORCHESTRATION
    // ---------------------------------------------------------
    if (conv.is_group) {
      // Query active & unmuted members from conversation_members (fallback to members_json)
      const activeMemberRows = db
        .prepare(
          "SELECT member_id, muted FROM conversation_members WHERE conversation_id = ? AND member_type = 'character' AND is_active = 1"
        )
        .all(conversation_id) as Array<{ member_id: string; muted: number }>;

      let activeIds = activeMemberRows.filter((m) => !m.muted).map((m) => m.member_id);
      if (activeMemberRows.length === 0) {
        try {
          activeIds = JSON.parse(conv.members_json || '[]') as string[];
        } catch {
          activeIds = [];
        }
      }

      if (activeIds.length === 0) {
        return {
          aiMessage: null,
          aiMessages: [],
          aiError: 'Không có thành viên AI đang hoạt động (hoặc tất cả đang tạm tắt tiếng).',
          updatedCharacter: null,
          newMemoryRecord: null,
        };
      }

      const placeholders = activeIds.map(() => '?').join(',');
      const groupChars = db
        .prepare(`SELECT * FROM characters WHERE id IN (${placeholders}) AND COALESCE(is_blocked, 0) = 0`)
        .all(...activeIds) as Array<{
        id: string;
        name: string;
        personality: string;
        speaking_style?: string;
        pronouns?: string;
        mood: string;
        avatar: string;
        speech_style_json?: string;
      }>;

      if (groupChars.length === 0) {
        return {
          aiMessage: null,
          aiMessages: [],
          aiError: 'Các thành viên trong nhóm đang bị chặn.',
          updatedCharacter: null,
          newMemoryRecord: null,
        };
      }

      // Detect @mentions against character names or first names
      const normLatest = normalizeViText(latestContent);
      const mentionedIds = groupChars
        .filter((c) => {
          const full = normalizeViText(c.name);
          const first = full.split(' ')[0];
          return (
            normLatest.includes(`@${full}`) ||
            (first && normLatest.includes(`@${first}`)) ||
            normLatest.includes(`@${c.id}`)
          );
        })
        .map((c) => c.id);

      const recentMsgs = db
        .prepare(
          "SELECT sender_name as sender, content FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 16"
        )
        .all(conversation_id) as Array<{ sender: string; content: string }>;
      recentMsgs.reverse();

      const groupMode = conv.group_mode || 'turn_based';
      const maxTurns = conv.max_ai_turns || (groupMode === 'open_discussion' ? 3 : 2);

      const turns = await generateGroupChatTurns(
        groupChars,
        recentMsgs,
        profile.name,
        latestContent || '[Tin nhắn nhóm]',
        Boolean(conv.roleplay_mode || roleplayState.active),
        {
          groupMode,
          maxTurns,
          mentionedIds,
          chatSummary: latestSummaryRow?.summary,
          roleplayState,
          signal: controller.signal,
        }
      );

      if (turns.length === 0 && groupMode === 'mention_only') {
        return {
          aiMessage: null,
          aiMessages: [],
          aiError: 'Nhóm đang bật chế độ chỉ phản hồi khi được @gọi tên. Hãy @tên thành viên hoặc đổi chế độ nhóm sang Luân phiên.',
          updatedCharacter: null,
          newMemoryRecord: null,
        };
      }

      const insertedMsgs: unknown[] = [];
      let lastChar = null;
      let lastMsgId = '';
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const ch = groupChars.find((c) => c.id === turn.characterId);
        if (!ch) continue;
        const turnNow = new Date(Date.now() + i * 350).toISOString();
        const msgId = uid('msg');
        lastMsgId = msgId;
        db.prepare(`
          INSERT INTO messages (
            id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, metadata_json, created_at
          ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)
        `).run(
          msgId,
          conversation_id,
          ch.id,
          ch.name,
          ch.avatar,
          turn.reply,
          JSON.stringify({ moodTag: turn.moodUpdate || ch.mood }),
          turnNow
        );
        db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ? WHERE id = ?').run(
          turnNow,
          msgId,
          conversation_id
        );
        db.prepare('UPDATE characters SET mood = COALESCE(?, mood), interactions_count = interactions_count + 1 WHERE id = ?').run(
          turn.moodUpdate || null,
          ch.id
        );
        updateCharacterRelationshipNatural(ch.id, 'Trò chuyện trong nhóm', 1, 1, 0);
        insertedMsgs.push(db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));
        lastChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(ch.id);
      }

      return {
        aiMessage: insertedMsgs[0] || null,
        aiMessages: insertedMsgs,
        aiError: null,
        updatedCharacter: lastChar,
        newMemoryRecord: null,
        lastMessageId: lastMsgId,
      };
    }

    // ---------------------------------------------------------
    // 1-ON-1 CHARACTER CHAT
    // ---------------------------------------------------------
    const targetCharId = conv.character_id;
    if (!targetCharId) {
      return { aiMessage: null, aiMessages: [], aiError: null, updatedCharacter: null, newMemoryRecord: null };
    }

    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(targetCharId) as
      | {
          id: string;
          name: string;
          age: number;
          personality: string;
          bio: string;
          likes: string;
          dislikes: string;
          scenario: string;
          mood: string;
          relationship_level: number;
          relationship_xp: number;
          avatar: string;
          interactions_count: number;
          is_blocked?: number;
          memory_enabled?: number;
          pronouns?: string;
          speaking_style?: string;
          role_title?: string;
          content_boundary?: string;
          personality_json?: string;
          background_json?: string;
          speech_style_json?: string;
          schedule_json?: string;
        }
      | undefined;

    if (!char) {
      return { aiMessage: null, aiMessages: [], aiError: null, updatedCharacter: null, newMemoryRecord: null };
    }
    if (char.is_blocked) {
      return {
        aiMessage: null,
        aiMessages: [],
        aiError: `${char.name} hiện đang nằm trong danh sách chặn.`,
        updatedCharacter: null,
        newMemoryRecord: null,
      };
    }

    const canUseMemory = globalMemoryOn && char.memory_enabled !== 0;
    // CRITICAL: Strictly scoped by character_id, prioritizing pinned memories first!
    const memories = canUseMemory
      ? (
          db
            .prepare(
              'SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY COALESCE(is_pinned, 0) DESC, importance DESC, created_at DESC LIMIT 14'
            )
            .all(char.id) as Array<{ content: string }>
        ).map((m) => m.content)
      : [];

    const recentMsgs = db
      .prepare(
        "SELECT sender_name as sender, content, msg_type FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 16"
      )
      .all(conversation_id) as Array<{ sender: string; content: string; msg_type: string }>;
    recentMsgs.reverse();

    const relRow = db.prepare('SELECT stage FROM ai_relationships WHERE character_id = ?').get(char.id) as
      | { stage: string }
      | undefined;

    let imageBase64: string | undefined;
    if (latestMsgType === 'image') {
      try {
        const parsedAtt =
          typeof latestAttachmentJson === 'string'
            ? (JSON.parse(latestAttachmentJson) as { dataUrl?: string; images?: Array<{ dataUrl?: string }> })
            : (latestAttachmentJson as { dataUrl?: string; images?: Array<{ dataUrl?: string }> });
        const candidateUrl = parsedAtt?.dataUrl || parsedAtt?.images?.[0]?.dataUrl;
        if (candidateUrl?.startsWith('data:image')) {
          imageBase64 = candidateUrl;
        }
      } catch {
        // ignore
      }
    }

    const effectiveTuning = getEffectiveTuningForConversation(conv.settings_json);

    const bankingPrep = prepareAiChatBankingContext({
      characterId: char.id,
      conversationId: conversation_id,
      userText: latestContent || '',
      character: { id: char.id, name: char.name, personality: char.personality },
    });

    const userMsgWithBankHint = `${
      latestContent || (latestMsgType === 'image' ? '[Đã gửi hình ảnh]' : `[Đã gửi ${latestMsgType}]`)
    }${bankingPrep.systemHintForGemini}`;

    const aiResult = await generateCharacterReply(
      {
        ...char,
        memories,
        recentMessages: recentMsgs,
        roleplayMode: Boolean(conv.roleplay_mode || (roleplayState.active && !roleplayState.paused)),
        roleplayState,
        userName: profile.name,
        chatSummary: latestSummaryRow?.summary,
        relationshipStage: relRow?.stage,
        currentTimeLabel: new Date().toLocaleString('vi-VN'),
        scheduleHint: getScheduleHint(char.schedule_json),
        responseLanguage: effectiveTuning.responseLanguage || convSettings.responseLanguage,
        tuning: effectiveTuning,
      },
      userMsgWithBankHint,
      imageBase64,
      controller.signal
    );

    const bubbleGroupId = uid('bg');
    const bubbles = aiResult.bubbles.length > 0 ? aiResult.bubbles : [aiResult.reply];
    const insertedMsgs: unknown[] = [];
    let lastCreatedAt = new Date().toISOString();
    let lastAiMsgId = '';

    for (let i = 0; i < bubbles.length; i++) {
      const bubbleText = stripHikariTransferTags(bubbles[i]);
      if (!bubbleText) continue;
      const aiNow = new Date(Date.now() + i * 250).toISOString();
      lastCreatedAt = aiNow;
      const aiMsgId = uid('msg');
      lastAiMsgId = aiMsgId;
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, metadata_json, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)
      `).run(
        aiMsgId,
        conversation_id,
        char.id,
        char.name,
        char.avatar,
        bubbleText,
        JSON.stringify({
          bubbleGroupId,
          bubbleIndex: i,
          bubbleTotal: bubbles.length,
          emotionTag: aiResult.emotionTag || '',
          emotionReason: aiResult.emotionReason || '',
          roleplay: Boolean(conv.roleplay_mode || (roleplayState.active && !roleplayState.paused)),
        }),
        aiNow
      );
      insertedMsgs.push(db.prepare('SELECT * FROM messages WHERE id = ?').get(aiMsgId));
      mirrorOSMessageToSocial(db, {
        osMessageId: aiMsgId,
        conversationId: conversation_id,
        senderId: char.id,
        content: bubbleText,
        msgType: 'text',
        createdAt: aiNow,
      });
    }

    const finalizedTransfer = controller.signal.aborted
      ? {}
      : finalizeAiChatBankingTransfer({
          pendingTransfer: bankingPrep.pendingTransfer,
          replyText: aiResult.reply,
          schemaApproved: aiResult.approveTransfer,
        });

    const bankAttachmentPayload = finalizedTransfer.executedTransfer || bankingPrep.resendReceipt;
    if (bankAttachmentPayload) {
      const billNow = new Date(Date.now() + bubbles.length * 250 + 200).toISOString();
      const billMsgId = uid('msg');
      lastCreatedAt = billNow;
      lastAiMsgId = billMsgId;
      const isResend = Boolean(bankingPrep.resendReceipt && !finalizedTransfer.executedTransfer);
      const billContent = isResend
        ? `Gửi lại biên lai Hikari Bank · Mã ${bankAttachmentPayload.refCode}`
        : `Biên lai chuyển khoản Hikari Bank · Mã ${bankAttachmentPayload.refCode}`;
      const attachmentStr = JSON.stringify({
        dataUrl: bankAttachmentPayload.billImageDataUrl,
        isBill: true,
        cardType: 'hikari_tx_card',
        direction: 'char_to_player',
        txId: bankAttachmentPayload.txId,
        refCode: bankAttachmentPayload.refCode,
        amount: bankAttachmentPayload.amount,
        receipt: bankAttachmentPayload.receipt,
      });
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, metadata_json, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'image', ?, 'sent', ?, ?)
      `).run(
        billMsgId,
        conversation_id,
        char.id,
        char.name,
        char.avatar,
        billContent,
        attachmentStr,
        JSON.stringify({ isBill: true, txId: bankAttachmentPayload.txId, isResend }),
        billNow
      );
      insertedMsgs.push(db.prepare('SELECT * FROM messages WHERE id = ?').get(billMsgId));
      mirrorOSMessageToSocial(db, {
        osMessageId: billMsgId,
        conversationId: conversation_id,
        senderId: char.id,
        content: billContent,
        msgType: 'image',
        attachmentJson: attachmentStr,
        createdAt: billNow,
      });
    }

    if (lastAiMsgId) {
      db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ? WHERE id = ?').run(
        lastCreatedAt,
        lastAiMsgId,
        conversation_id
      );
    }

    const throttled = isAntiSpamThrottled(conversation_id, latestContent);
    const actualXp = throttled ? Math.min(1, aiResult.xpGain) : aiResult.xpGain;
    let newXp = char.relationship_xp + actualXp;
    let newLevel = char.relationship_level;
    while (newXp >= 100) {
      newLevel += 1;
      newXp -= 100;
    }
    db.prepare(
      'UPDATE characters SET relationship_xp = ?, relationship_level = ?, mood = COALESCE(?, mood), interactions_count = interactions_count + 1 WHERE id = ?'
    ).run(newXp, newLevel, aiResult.moodUpdate || null, char.id);

    updateCharacterRelationshipNatural(
      char.id,
      aiResult.emotionReason || 'Trò chuyện cùng bạn',
      throttled ? 0 : (aiResult.affectionDelta ?? 1),
      throttled ? 0 : (aiResult.familiarityDelta ?? 1),
      throttled ? 0 : (aiResult.trustDelta ?? 1),
      throttled ? 0 : (aiResult.respectDelta ?? 1),
      aiResult.emotionTag || ''
    );

    let newMemoryRecord = null;
    if (canUseMemory && aiResult.newMemory && !roleplayState.active) {
      newMemoryRecord = upsertSmartMemory(
        char.id,
        aiResult.newMemory,
        aiResult.memoryType || 'long_term',
        7,
        'ai_inferred',
        options?.lastMessageId || '',
        aiResult.memoryConfidence ?? 0.85
      );
    }

    const updatedCharacter = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id);
    return {
      aiMessage: insertedMsgs[0] || null,
      aiMessages: insertedMsgs,
      aiError: null,
      updatedCharacter,
      newMemoryRecord,
    };
  } catch (err) {
    return {
      aiMessage: null,
      aiMessages: [],
      aiError: err instanceof Error ? err.message : 'AI phản hồi thất bại',
      updatedCharacter: null,
      newMemoryRecord: null,
    };
  } finally {
    if (activeAiControllers.get(reqKey) === controller) activeAiControllers.delete(reqKey);
    if (activeAiControllers.get(conversation_id) === controller) activeAiControllers.delete(conversation_id);
  }
}

export function createMessagesV3Router(): Router {
  const router = Router();

  // 1. Cancel in-flight AI reply
  router.post('/ai/cancel', (req: Request, res: Response) => {
    const { conversation_id, request_id } = req.body as { conversation_id?: string; request_id?: string };
    let cancelled = false;
    if (request_id) cancelled = cancelAiGeneration(request_id) || cancelled;
    if (conversation_id) cancelled = cancelAiGeneration(conversation_id) || cancelled;
    res.json({ ok: true, cancelled });
  });

  // 2. Regenerate latest or specific AI turn
  router.post('/ai/regenerate', async (req: Request, res: Response) => {
    try {
      const { conversation_id, target_message_id, request_id } = req.body as {
        conversation_id?: string;
        target_message_id?: string;
        request_id?: string;
      };
      if (!conversation_id) {
        res.status(400).json({ error: 'Thiếu conversation_id' });
        return;
      }

      if (target_message_id) {
        const target = db.prepare('SELECT id, metadata_json, sender_type FROM messages WHERE id = ? AND conversation_id = ?').get(
          target_message_id,
          conversation_id
        ) as { id: string; metadata_json?: string; sender_type: string } | undefined;

        if (target && target.sender_type === 'character') {
          let bubbleGroupId = '';
          try {
            bubbleGroupId = (JSON.parse(target.metadata_json || '{}') as { bubbleGroupId?: string }).bubbleGroupId || '';
          } catch {
            bubbleGroupId = '';
          }
          if (bubbleGroupId) {
            const siblings = db
              .prepare("SELECT id, metadata_json FROM messages WHERE conversation_id = ? AND sender_type = 'character'")
              .all(conversation_id) as Array<{ id: string; metadata_json?: string }>;
            for (const s of siblings) {
              if (s.metadata_json?.includes(bubbleGroupId)) {
                db.prepare('DELETE FROM messages WHERE id = ?').run(s.id);
              }
            }
          } else {
            db.prepare('DELETE FROM messages WHERE id = ?').run(target.id);
          }
        }
      }

      const lastUserMsg = db
        .prepare(
          "SELECT id, content, msg_type, attachment_json FROM messages WHERE conversation_id = ? AND sender_type = 'user' AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 1"
        )
        .get(conversation_id) as
        | { id: string; content: string; msg_type: string; attachment_json: string }
        | undefined;

      const aiRes = await generateAndStoreAiReplyV3(
        conversation_id,
        lastUserMsg?.content || 'Hãy phản hồi tiếp tục cuộc trò chuyện một cách mới mẻ hơn.',
        lastUserMsg?.msg_type || 'text',
        lastUserMsg?.attachment_json || '{}',
        { requestId: request_id, lastMessageId: lastUserMsg?.id }
      );
      res.json(aiRes);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Tạo lại phản hồi thất bại' });
    }
  });

  // 3. Paginated messages for a conversation
  router.get('/conversations/:id/messages', (req: Request, res: Response) => {
    const convId = req.params.id;
    const before = typeof req.query.before === 'string' ? req.query.before : '';
    const limit = Math.max(10, Math.min(100, Number(req.query.limit || 40)));

    const totalRow = db
      .prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = ''")
      .get(convId) as { c: number };

    const rows = before
      ? (db
          .prepare(
            "SELECT * FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' AND created_at < ? ORDER BY created_at DESC LIMIT ?"
          )
          .all(convId, before, limit) as unknown[])
      : (db
          .prepare("SELECT * FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT ?")
          .all(convId, limit) as unknown[]);

    rows.reverse();
    const oldest = (rows[0] as { created_at?: string } | undefined)?.created_at || '';
    const hasMore = before
      ? (
          db
            .prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' AND created_at < ?")
            .get(convId, oldest) as { c: number }
        ).c > 0
      : totalRow.c > rows.length;

    res.json({ messages: rows, hasMore, totalCount: totalRow.c });
  });

  // 4. Mark conversation read & sync related OS notifications
  router.post('/conversations/:id/mark-read', (req: Request, res: Response) => {
    const convId = req.params.id;
    db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(convId);
    db.prepare("UPDATE notifications SET is_read = 1 WHERE action_route = 'messages' AND action_payload = ?").run(convId);
    res.json({ ok: true });
  });

  // 5. Clear conversation history safely
  router.post('/conversations/:id/clear-history', (req: Request, res: Response) => {
    const convId = req.params.id;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
      db.prepare("UPDATE conversations SET last_message_id = '', unread_count = 0, updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        convId
      );
    });
    tx();
    res.json({ ok: true });
  });

  // 6. Export conversation JSON / TXT
  router.get('/conversations/:id/export', (req: Request, res: Response) => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
      | { id: string; title: string; is_group: number; created_at?: string }
      | undefined;
    if (!conv) {
      res.status(404).json({ error: 'Không tìm thấy đoạn chat' });
      return;
    }
    const msgs = db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at ASC")
      .all(conv.id) as Array<{
      id: string;
      sender_name: string;
      content: string;
      msg_type: string;
      created_at: string;
    }>;
    const format = req.query.format === 'txt' ? 'txt' : 'json';

    if (format === 'txt') {
      const lines = [
        `CUỘC TRÒ CHUYỆN: ${conv.title}`,
        `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
        '==================================================',
        '',
        ...msgs.map(
          (m) => `[${new Date(m.created_at).toLocaleString('vi-VN')}] ${m.sender_name}: ${m.content}`
        ),
      ];
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="chat_${conv.id}.txt"`);
      res.send(lines.join('\n'));
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chat_${conv.id}.json"`);
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), conversation: conv, messages: msgs }, null, 2));
  });

  // 7. Group Members & Turn Settings
  router.get('/conversations/:id/members', (req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at ASC').all(req.params.id);
    res.json(rows);
  });

  router.post('/conversations/:id/members', (req: Request, res: Response) => {
    const convId = req.params.id;
    const { character_id, role = 'member' } = req.body as { character_id?: string; role?: 'admin' | 'member' };
    if (!character_id) {
      res.status(400).json({ error: 'Thiếu character_id' });
      return;
    }
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as
      | { id: string; members_json: string }
      | undefined;
    const char = db.prepare('SELECT id, name, avatar FROM characters WHERE id = ?').get(character_id) as
      | { id: string; name: string; avatar: string }
      | undefined;
    if (!conv || !char) {
      res.status(404).json({ error: 'Không tìm thấy nhóm hoặc nhân vật' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversation_members (id, conversation_id, member_type, member_id, role, joined_at, muted, is_active)
      VALUES (?, ?, 'character', ?, ?, ?, 0, 1)
      ON CONFLICT(conversation_id, member_id) DO UPDATE SET is_active = 1, muted = 0, role = excluded.role
    `).run(`cm_${convId}_${character_id}`, convId, character_id, role, now);

    const members = Array.from(new Set([...(JSON.parse(conv.members_json || '[]') as string[]), character_id]));
    db.prepare('UPDATE conversations SET members_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(members), now, convId);

    const sysId = uid('msg');
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, msg_type, created_at)
      VALUES (?, ?, 'system', 'system', 'Hệ thống', ?, 'system', ?)
    `).run(sysId, convId, `${char.name} đã tham gia nhóm chat.`, now);

    res.json({
      members: db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND is_active = 1').all(convId),
      systemMessage: db.prepare('SELECT * FROM messages WHERE id = ?').get(sysId),
    });
  });

  router.patch('/conversations/:id/members/:memberId', (req: Request, res: Response) => {
    const { id: convId, memberId } = req.params;
    const { muted, role, is_active } = req.body as { muted?: number; role?: string; is_active?: number };
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (muted !== undefined) {
      sets.push('muted = ?');
      vals.push(muted ? 1 : 0);
    }
    if (role !== undefined) {
      sets.push('role = ?');
      vals.push(role);
    }
    if (is_active !== undefined) {
      sets.push('is_active = ?');
      vals.push(is_active ? 1 : 0);
    }
    if (sets.length > 0) {
      vals.push(convId, memberId);
      db.prepare(`UPDATE conversation_members SET ${sets.join(', ')} WHERE conversation_id = ? AND member_id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND member_id = ?').get(convId, memberId));
  });

  router.delete('/conversations/:id/members/:memberId', (req: Request, res: Response) => {
    const { id: convId, memberId } = req.params;
    const conv = db.prepare('SELECT members_json FROM conversations WHERE id = ?').get(convId) as { members_json: string } | undefined;
    const char = db.prepare('SELECT name FROM characters WHERE id = ?').get(memberId) as { name: string } | undefined;
    const now = new Date().toISOString();

    db.prepare('UPDATE conversation_members SET is_active = 0 WHERE conversation_id = ? AND member_id = ?').run(convId, memberId);
    if (conv) {
      const nextMembers = (JSON.parse(conv.members_json || '[]') as string[]).filter((m) => m !== memberId);
      db.prepare('UPDATE conversations SET members_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(nextMembers), now, convId);
    }
    const sysId = uid('msg');
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, msg_type, created_at)
      VALUES (?, ?, 'system', 'system', 'Hệ thống', ?, 'system', ?)
    `).run(sysId, convId, `${char?.name || memberId} đã rời khỏi nhóm.`, now);

    res.json({ ok: true, systemMessage: db.prepare('SELECT * FROM messages WHERE id = ?').get(sysId) });
  });

  // Update extended conversation fields (settings_json, group_mode, max_ai_turns, roleplay_state_json)
  router.patch('/conversations/:id/config', (req: Request, res: Response) => {
    const allowed = ['title', 'avatar', 'wallpaper', 'bubble_color', 'roleplay_mode', 'roleplay_state_json', 'settings_json', 'group_mode', 'max_ai_turns', 'pinned', 'archived', 'muted', 'unread_count'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of allowed) {
      if (f in req.body) {
        const val = req.body[f];
        sets.push(`${f} = ?`);
        vals.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    if (sets.length > 0) {
      vals.push(req.params.id);
      db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json(db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id));
  });

  // 8. Roleplay State & Recap
  router.patch('/conversations/:id/roleplay', (req: Request, res: Response) => {
    const convId = req.params.id;
    const { active, paused, genre, scenario, userRole, aiRole, moodTone, sceneTitle, emitSystemNotice } = req.body as RoleplayStateContext & {
      emitSystemNotice?: string;
    };
    const nextState: RoleplayStateContext = {
      active: Boolean(active),
      paused: Boolean(paused),
      genre: genre || 'Đời thường',
      scenario: scenario || '',
      userRole: userRole || '',
      aiRole: aiRole || '',
      moodTone: moodTone || '',
      sceneTitle: sceneTitle || '',
    };
    const now = new Date().toISOString();
    db.prepare('UPDATE conversations SET roleplay_mode = ?, roleplay_state_json = ?, updated_at = ? WHERE id = ?').run(
      nextState.active && !nextState.paused ? 1 : 0,
      JSON.stringify(nextState),
      now,
      convId
    );

    let systemMessage = null;
    if (emitSystemNotice) {
      const sysId = uid('msg');
      db.prepare(`
        INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, msg_type, created_at)
        VALUES (?, ?, 'system', 'system', 'Kịch bản', ?, 'system', ?)
      `).run(sysId, convId, emitSystemNotice, now);
      systemMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(sysId);
    }

    res.json({ conversation: db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId), systemMessage });
  });

  router.post('/conversations/:id/roleplay/recap', async (req: Request, res: Response) => {
    try {
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
        | { id: string; title: string; character_id: string; roleplay_state_json?: string }
        | undefined;
      if (!conv) {
        res.status(404).json({ error: 'Không tìm thấy hội thoại' });
        return;
      }
      const char = conv.character_id
        ? (db.prepare('SELECT name FROM characters WHERE id = ?').get(conv.character_id) as { name: string } | undefined)
        : undefined;
      const memories = conv.character_id
        ? (
            db
              .prepare('SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY importance DESC LIMIT 6')
              .all(conv.character_id) as Array<{ content: string }>
          ).map((m) => m.content)
        : [];
      const msgs = db
        .prepare("SELECT sender_name as sender, content FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 20")
        .all(conv.id) as Array<{ sender: string; content: string }>;
      msgs.reverse();
      const rp = JSON.parse(conv.roleplay_state_json || '{}') as RoleplayStateContext;
      const recap = await generateRoleplayRecap(char?.name || conv.title, rp, msgs, memories);
      res.json({ recap });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không thể tóm tắt cốt truyện' });
    }
  });

  // 9. Chat Summaries (Versioned + Restore)
  router.get('/conversations/:id/summaries', (req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM chat_summaries WHERE conversation_id = ? ORDER BY version DESC, created_at DESC')
      .all(req.params.id);
    res.json(rows);
  });

  router.post('/conversations/:id/summaries', async (req: Request, res: Response) => {
    try {
      const conv = db.prepare('SELECT id, title FROM conversations WHERE id = ?').get(req.params.id) as
        | { id: string; title: string }
        | undefined;
      if (!conv) {
        res.status(404).json({ error: 'Không tìm thấy đoạn chat' });
        return;
      }
      const prev = db
        .prepare('SELECT summary, version FROM chat_summaries WHERE conversation_id = ? ORDER BY version DESC LIMIT 1')
        .get(conv.id) as { summary: string; version: number } | undefined;
      const msgs = db
        .prepare("SELECT id, sender_name as sender, content FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 30")
        .all(conv.id) as Array<{ id: string; sender: string; content: string }>;
      msgs.reverse();
      if (msgs.length === 0) {
        res.status(400).json({ error: 'Chưa có tin nhắn nào để tóm tắt' });
        return;
      }
      const summary = await summarizeConversationWithDelta(conv.title, prev?.summary || '', msgs);
      const sumId = uid('sum');
      const now = new Date().toISOString();
      const nextVersion = (prev?.version || 0) + 1;
      const lastId = msgs[msgs.length - 1]?.id || '';
      db.prepare(`
        INSERT INTO chat_summaries (id, conversation_id, summary, covered_until_message_id, version, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sumId, conv.id, summary, lastId, nextVersion, now);

      res.json(db.prepare('SELECT * FROM chat_summaries WHERE id = ?').get(sumId));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Tóm tắt hội thoại thất bại' });
    }
  });

  router.post('/summaries/:sumId/restore', (req: Request, res: Response) => {
    const target = db.prepare('SELECT * FROM chat_summaries WHERE id = ?').get(req.params.sumId) as
      | { id: string; conversation_id: string; summary: string; covered_until_message_id: string }
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'Không tìm thấy bản tóm tắt' });
      return;
    }
    const maxRow = db
      .prepare('SELECT MAX(version) as v FROM chat_summaries WHERE conversation_id = ?')
      .get(target.conversation_id) as { v: number | null };
    const nextVersion = (maxRow?.v || 0) + 1;
    const id = uid('sum');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chat_summaries (id, conversation_id, summary, covered_until_message_id, version, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, target.conversation_id, target.summary, target.covered_until_message_id, nextVersion, now);
    res.json(db.prepare('SELECT * FROM chat_summaries WHERE id = ?').get(id));
  });

  // 10. Rich Message Actions
  router.post('/messages/:id/save', (req: Request, res: Response) => {
    const msg = db.prepare('SELECT id, is_saved FROM messages WHERE id = ?').get(req.params.id) as
      | { id: string; is_saved: number }
      | undefined;
    if (!msg) {
      res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
      return;
    }
    const nextSaved = req.body.is_saved !== undefined ? (req.body.is_saved ? 1 : 0) : msg.is_saved ? 0 : 1;
    db.prepare('UPDATE messages SET is_saved = ? WHERE id = ?').run(nextSaved, msg.id);
    res.json(db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id));
  });

  router.post('/messages/:id/remember', (req: Request, res: Response) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id) as
      | { id: string; conversation_id: string; sender_id: string; sender_name: string; content: string }
      | undefined;
    if (!msg) {
      res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
      return;
    }
    const conv = db.prepare('SELECT character_id FROM conversations WHERE id = ?').get(msg.conversation_id) as
      | { character_id: string }
      | undefined;
    const charId = (req.body as { character_id?: string }).character_id || conv?.character_id || msg.sender_id;
    if (!charId || charId === 'user_1') {
      res.status(400).json({ error: 'Hãy chọn nhân vật AI để lưu ký ức này' });
      return;
    }
    const content = (req.body as { content?: string }).content?.trim() || `${msg.sender_name} nói: "${msg.content.slice(0, 180)}"`;
    const memory = upsertSmartMemory(charId, content, 'long_term', 9, 'user_requested', msg.id, 1.0);
    res.json({ ok: true, memory });
  });

  router.post('/messages/:id/forward', (req: Request, res: Response) => {
    const { target_conversation_id } = req.body as { target_conversation_id?: string };
    if (!target_conversation_id) {
      res.status(400).json({ error: 'Thiếu cuộc trò chuyện đích' });
      return;
    }
    const src = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id) as
      | {
          id: string;
          sender_name: string;
          content: string;
          msg_type: string;
          attachment_json: string;
        }
      | undefined;
    const targetConv = db.prepare('SELECT id FROM conversations WHERE id = ?').get(target_conversation_id);
    if (!src || !targetConv) {
      res.status(404).json({ error: 'Không tìm thấy tin nhắn hoặc hội thoại đích' });
      return;
    }
    const profile = db.prepare('SELECT name, avatar FROM user_profile LIMIT 1').get() as { name: string; avatar: string };
    const now = new Date().toISOString();
    const newId = uid('msg');
    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, metadata_json, created_at
      ) VALUES (?, ?, 'user', 'user_1', ?, ?, ?, ?, ?, 'sent', ?, ?)
    `).run(
      newId,
      target_conversation_id,
      profile.name,
      profile.avatar,
      src.content,
      src.msg_type,
      src.attachment_json,
      JSON.stringify({ forwardedFrom: src.sender_name, originalMessageId: src.id }),
      now
    );
    db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ? WHERE id = ?').run(now, newId, target_conversation_id);
    res.json(db.prepare('SELECT * FROM messages WHERE id = ?').get(newId));
  });

  router.post('/messages/:id/report', (req: Request, res: Response) => {
    const { reason = 'Nội dung không phù hợp', detail = '' } = req.body as { reason?: string; detail?: string };
    const id = uid('rep');
    db.prepare('INSERT INTO message_reports (id, target_type, target_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      'message',
      req.params.id,
      reason,
      detail,
      new Date().toISOString()
    );
    res.json({ ok: true, id });
  });

  router.post('/messages/:id/delete-scoped', (req: Request, res: Response) => {
    const { scope = 'all' } = req.body as { scope?: 'self' | 'all' };
    const now = new Date().toISOString();
    if (scope === 'self') {
      db.prepare("UPDATE messages SET deleted_at = ?, deleted_scope = 'self' WHERE id = ?").run(now, req.params.id);
    } else {
      db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  // 11. Vietnamese Diacritic-Insensitive Search + Search History
  router.get('/search', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
    const senderType = typeof req.query.senderType === 'string' ? req.query.senderType : '';
    const msgType = typeof req.query.msgType === 'string' ? req.query.msgType : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';

    const normQ = normalizeViText(q);
    let sql = "SELECT * FROM messages WHERE COALESCE(deleted_at, '') = ''";
    const params: unknown[] = [];
    if (conversationId) {
      sql += ' AND conversation_id = ?';
      params.push(conversationId);
    }
    if (senderType) {
      sql += ' AND sender_type = ?';
      params.push(senderType);
    }
    if (msgType) {
      sql += ' AND msg_type = ?';
      params.push(msgType);
    }
    if (dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND created_at <= ?';
      params.push(`${dateTo}T23:59:59`);
    }
    sql += ' ORDER BY created_at DESC LIMIT 400';

    const candidates = db.prepare(sql).all(...params) as Array<{
      id: string;
      conversation_id: string;
      sender_name: string;
      content: string;
      attachment_json: string;
      msg_type: string;
      created_at: string;
    }>;

    const matchedMessages = normQ
      ? candidates.filter(
          (m) =>
            normalizeViText(m.content).includes(normQ) ||
            normalizeViText(m.sender_name).includes(normQ) ||
            normalizeViText(m.attachment_json).includes(normQ)
        )
      : candidates.slice(0, 60);

    const conversations = db.prepare('SELECT * FROM conversations').all() as Array<{ id: string; title: string }>;
    const matchedConversations = normQ ? conversations.filter((c) => normalizeViText(c.title).includes(normQ)) : [];

    const characters = db.prepare('SELECT * FROM characters').all() as Array<{ id: string; name: string; tagline: string; genres_json?: string }>;
    const matchedCharacters = normQ
      ? characters.filter(
          (c) =>
            normalizeViText(c.name).includes(normQ) ||
            normalizeViText(c.tagline).includes(normQ) ||
            normalizeViText(c.genres_json || '').includes(normQ)
        )
      : [];

    res.json({
      messages: matchedMessages.slice(0, 80),
      conversations: matchedConversations,
      characters: matchedCharacters,
    });
  });

  router.get('/search-history', (_req: Request, res: Response) => {
    res.json(db.prepare('SELECT * FROM chat_search_history ORDER BY created_at DESC LIMIT 15').all());
  });

  router.post('/search-history', (req: Request, res: Response) => {
    const query = String((req.body as { query?: string }).query || '').trim();
    const scope = String((req.body as { scope?: string }).scope || 'all');
    if (!query) {
      res.status(400).json({ error: 'Thiếu từ khóa' });
      return;
    }
    db.prepare('DELETE FROM chat_search_history WHERE query = ?').run(query);
    const id = uid('sh');
    db.prepare('INSERT INTO chat_search_history (id, query, scope, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      query,
      scope,
      new Date().toISOString()
    );
    res.json(db.prepare('SELECT * FROM chat_search_history WHERE id = ?').get(id));
  });

  router.delete('/search-history/:id', (req: Request, res: Response) => {
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM chat_search_history').run();
    } else {
      db.prepare('DELETE FROM chat_search_history WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  // 12. Structured Character CRUD / Duplicate / Export / Import / Report
  router.post('/characters', (req: Request, res: Response) => {
    const b = req.body as Record<string, unknown>;
    const name = String(b.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Tên nhân vật không được để trống' });
      return;
    }
    const id = uid('char');
    const now = new Date().toISOString();
    const avatar = String(b.avatar || '/src/assets/images/char_yuki_1794880089308.jpg');
    const coverImage = String(b.cover_image || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg');
    const age = Number(b.age || 20);
    const tagline = String(b.tagline || 'Nhân vật AI tự tạo');
    const personality = String(b.personality || 'Thân thiện, tự nhiên và giàu cảm xúc');
    const bio = String(b.bio || personality);
    const likes = String(b.likes || 'Trò chuyện, âm nhạc');
    const dislikes = String(b.dislikes || 'Sự nhàm chán');
    const voiceName = String(b.voice_name || 'Kore');
    const voiceStyle = String(b.voice_style || 'Giọng tự nhiên, ấm áp');
    const scenario = String(b.scenario || 'Đang online trên PHONE OS');
    const greeting = String(b.greeting || `Chào bạn! Mình là ${name}. Rất vui được nói chuyện với bạn!`);
    const pronouns = String(b.pronouns || 'Mình - Bạn');
    const speakingStyle = String(b.speaking_style || 'Tự nhiên');
    const roleTitle = String(b.role_title || 'Bạn đồng hành AI');
    const contentBoundary = String(b.content_boundary || 'standard');
    const contentNotice = String(b.content_notice || '');
    const privacy = b.privacy === 'private' ? 'private' : 'public';
    const gender = ['male', 'female', 'unknown'].includes(String(b.gender || '')) ? String(b.gender) : 'unknown';
    const style = ['anime', 'realistic'].includes(String(b.style || '')) ? String(b.style) : 'anime';
    const systemPrompt = String(b.system_prompt || '');
    const memoryPrompt = String(b.memory_prompt || '');
    const emotionalBehavior = String(b.emotional_behavior || '');
    const responseStyleJson =
      typeof b.response_style_json === 'string'
        ? b.response_style_json
        : JSON.stringify(b.response_style_obj || {});
    const genresJson = typeof b.genres_json === 'string' ? b.genres_json : JSON.stringify(b.genres || ['Custom AI', 'Anime']);
    const personalityJson =
      typeof b.personality_json === 'string' ? b.personality_json : JSON.stringify(b.personality_obj || {});
    const backgroundJson =
      typeof b.background_json === 'string' ? b.background_json : JSON.stringify(b.background_obj || {});
    const speechStyleJson =
      typeof b.speech_style_json === 'string' ? b.speech_style_json : JSON.stringify(b.speech_style_obj || {});
    const proactiveSettingsJson =
      typeof b.proactive_settings_json === 'string'
        ? b.proactive_settings_json
        : JSON.stringify(b.proactive_settings_obj || { enabled: true, dailyCap: 2, cooldownMin: 180 });
    const sampleDialoguesJson =
      typeof b.sample_dialogues_json === 'string' ? b.sample_dialogues_json : JSON.stringify(b.sample_dialogues || []);
    const scheduleJson =
      typeof b.schedule_json === 'string'
        ? b.schedule_json
        : JSON.stringify(b.schedule || [{ time: '09:00', activity: 'Online trò chuyện' }]);

    db.prepare(`
      INSERT INTO characters (
        id, name, age, tagline, personality, bio, likes, dislikes, voice_name, voice_style,
        avatar, cover_image, scenario, greeting, author, interactions_count, is_followed, is_favorite,
        relationship_level, relationship_xp, mood, schedule_json, is_featured,
        pronouns, speaking_style, role_title, activity_status, is_blocked, memory_enabled, content_boundary,
        proactive_msg_enabled, personality_json, background_json, speech_style_json, proactive_settings_json,
        genres_json, sample_dialogues_json, content_notice, privacy, is_hidden, is_custom, has_story_mode,
        gender, style, system_prompt, memory_prompt, emotional_behavior, response_style_json,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'Bạn (Tự tạo)', 0, 1, 0,
        1, 20, 'Vui vẻ · Sẵn sàng trò chuyện', ?, 0,
        ?, ?, ?, 'Đang hoạt động', 0, 1, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 0, 1, 1,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id,
      name,
      age,
      tagline,
      personality,
      bio,
      likes,
      dislikes,
      voiceName,
      voiceStyle,
      avatar,
      coverImage,
      scenario,
      greeting,
      scheduleJson,
      pronouns,
      speakingStyle,
      roleTitle,
      contentBoundary,
      b.proactive_msg_enabled === 0 ? 0 : 1,
      personalityJson,
      backgroundJson,
      speechStyleJson,
      proactiveSettingsJson,
      genresJson,
      sampleDialoguesJson,
      contentNotice,
      privacy,
      gender,
      style,
      systemPrompt,
      memoryPrompt,
      emotionalBehavior,
      responseStyleJson,
      now,
      now
    );

    const username = String(b.username || '').trim();
    const occupation = String(b.occupation || '').trim();
    const city = String(b.city || '').trim();
    const joinSocial = b.join_social === 0 || b.join_social === false ? 0 : 1;
    const isVerified = b.is_verified ? 1 : 0;
    const socialBio = String(b.social_bio || bio).trim();
    const relationshipLabel = String(b.relationship_label || '').trim();

    db.prepare(`
      UPDATE characters
      SET username = ?, occupation = ?, city = ?, join_social = ?, is_verified = ?, social_bio = ?, relationship_label = ?
      WHERE id = ?
    `).run(username, occupation, city, joinSocial, isVerified, socialBio, relationshipLabel, id);

    db.prepare(`
      INSERT OR IGNORE INTO ai_relationships (character_id, affection, trust, familiarity, respect, jealousy, conflict, stage, history_json, updated_at)
      VALUES (?, 30, 40, 25, 50, 0, 0, 'Bạn mới', '[]', ?)
    `).run(id, now);

    db.prepare(`
      INSERT INTO contacts (id, name, nickname, phone, avatar, is_ai, character_id, group_name)
      VALUES (?, ?, ?, ?, ?, 1, ?, 'Bạn đồng hành AI')
    `).run(uid('ct'), name, name.split(' ')[0], `+81 90-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`, avatar, id);

    syncCharacterAcrossApps(db, id);

    res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(id));
  });

  router.patch('/characters/:id', (req: Request, res: Response) => {
    const charId = req.params.id;
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }

    const applyScope = (req.body as { applyScope?: 'existing' | 'new_only' }).applyScope || 'existing';

    // If user chooses "Chỉ áp dụng cho chat mới", clone a new versioned character so old chat stays untouched!
    if (applyScope === 'new_only') {
      const hasConv = db.prepare('SELECT id FROM conversations WHERE character_id = ? LIMIT 1').get(charId);
      if (hasConv) {
        const cloneId = uid('char');
        const now = new Date().toISOString();
        const merged = { ...existing, ...req.body, id: cloneId, is_custom: 1, created_at: now, updated_at: now };
        const cols = (db.prepare('PRAGMA table_info(characters)').all() as Array<{ name: string }>).map((c) => c.name);
        const safeCols = cols.filter((c) => c in merged);
        const placeholders = safeCols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO characters (${safeCols.join(', ')}) VALUES (${placeholders})`).run(
          ...safeCols.map((c) => (typeof merged[c] === 'object' && merged[c] !== null ? JSON.stringify(merged[c]) : merged[c]))
        );
        db.prepare(`
          INSERT OR IGNORE INTO ai_relationships (character_id, affection, trust, familiarity, respect, jealousy, conflict, stage, history_json, updated_at)
          VALUES (?, 30, 40, 25, 50, 0, 0, 'Bạn mới', '[]', ?)
        `).run(cloneId, now);
        res.json({ character: db.prepare('SELECT * FROM characters WHERE id = ?').get(cloneId), clonedForNewChat: true });
        return;
      }
    }

    const allowed = [
      'name', 'age', 'tagline', 'personality', 'bio', 'likes', 'dislikes', 'voice_name', 'voice_style',
      'avatar', 'cover_image', 'scenario', 'greeting', 'pronouns', 'speaking_style', 'role_title',
      'activity_status', 'mood', 'is_followed', 'is_favorite', 'is_blocked', 'is_hidden', 'memory_enabled',
      'content_boundary', 'content_notice', 'privacy', 'proactive_msg_enabled', 'proactive_call_enabled',
      'proactive_photo_enabled', 'proactive_notif_enabled', 'personality_json', 'background_json',
      'speech_style_json', 'proactive_settings_json', 'genres_json', 'sample_dialogues_json', 'schedule_json',
      'gender', 'style', 'system_prompt', 'memory_prompt', 'emotional_behavior', 'response_style_json',
      'username', 'occupation', 'city', 'join_social', 'is_verified', 'social_bio', 'relationship_label',
      'full_name', 'nickname', 'birthday', 'height', 'body_type', 'hair_color', 'hair_style', 'eye_color',
      'outfit_style', 'living_place', 'zodiac', 'fears', 'goals', 'past_story', 'family_relations',
      'turning_events', 'long_term_goal', 'secrets', 'world_rules', 'timeline_json', 'gallery_json',
      'chat_wallpaper', 'hangout_spots_json', 'related_characters_json', 'catchphrases_json',
      'conversation_starters_json', 'storylines_json', 'user_call_name', 'reply_length_default',
      'intimacy_pace', 'favorite_topics',
    ];
    const now = new Date().toISOString();
    const sets = ['updated_at = ?'];
    const vals: unknown[] = [now];
    for (const f of allowed) {
      if (f in req.body) {
        const val = req.body[f];
        sets.push(`${f} = ?`);
        vals.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    vals.push(charId);
    db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    syncCharacterAcrossApps(db, charId);

    res.json({ character: db.prepare('SELECT * FROM characters WHERE id = ?').get(charId), clonedForNewChat: false });
  });

  router.post('/characters/:id/duplicate', (req: Request, res: Response) => {
    const src = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!src) {
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }
    const newId = uid('char');
    const now = new Date().toISOString();
    const copy: Record<string, unknown> = {
      ...src,
      id: newId,
      name: `${src.name} (Bản sao)`,
      author: 'Bạn (Nhân bản)',
      interactions_count: 0,
      relationship_level: 1,
      relationship_xp: 20,
      is_custom: 1,
      is_hidden: 0,
      is_blocked: 0,
      created_at: now,
      updated_at: now,
    };
    const cols = Object.keys(copy);
    db.prepare(`INSERT INTO characters (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => copy[c]));
    db.prepare(`
      INSERT OR IGNORE INTO ai_relationships (character_id, affection, trust, familiarity, respect, jealousy, conflict, stage, history_json, updated_at)
      VALUES (?, 30, 40, 25, 50, 0, 0, 'Bạn mới', '[]', ?)
    `).run(newId, now);
    syncCharacterAcrossApps(db, newId);
    res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(newId));
  });

  router.get('/characters/:id/export', (req: Request, res: Response) => {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!char) {
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="character_${req.params.id}.json"`);
    res.send(JSON.stringify({ schema: 'phone-os-character-v1', exportedAt: new Date().toISOString(), character: char }, null, 2));
  });

  router.post('/characters/import', (req: Request, res: Response) => {
    try {
      const { jsonText } = req.body as { jsonText?: string };
      const parsed = JSON.parse(jsonText || '{}') as { character?: Record<string, unknown> } & Record<string, unknown>;
      const charData = (parsed.character || parsed) as Record<string, unknown>;
      if (!charData?.name) {
        res.status(400).json({ error: 'JSON nhân vật không hợp lệ (thiếu trường name)' });
        return;
      }
      const newId = uid('char');
      const now = new Date().toISOString();
      const validCols = (db.prepare('PRAGMA table_info(characters)').all() as Array<{ name: string }>).map((c) => c.name);
      const record: Record<string, unknown> = {
        ...charData,
        id: newId,
        username: '',
        author: 'Nhập từ JSON',
        is_custom: 1,
        created_at: now,
        updated_at: now,
      };
      const safeCols = validCols.filter((c) => c in record);
      db.prepare(`INSERT INTO characters (${safeCols.join(', ')}) VALUES (${safeCols.map(() => '?').join(', ')})`).run(
        ...safeCols.map((c) => (typeof record[c] === 'object' && record[c] !== null ? JSON.stringify(record[c]) : record[c]))
      );
      db.prepare(`
        INSERT OR IGNORE INTO ai_relationships (character_id, affection, trust, familiarity, respect, jealousy, conflict, stage, history_json, updated_at)
        VALUES (?, 30, 40, 25, 50, 0, 0, 'Bạn mới', '[]', ?)
      `).run(newId, now);
      syncCharacterAcrossApps(db, newId);
      res.json(db.prepare('SELECT * FROM characters WHERE id = ?').get(newId));
    } catch {
      res.status(400).json({ error: 'Không thể đọc JSON nhân vật' });
    }
  });

  router.post('/characters/:id/report', (req: Request, res: Response) => {
    const { reason = 'Nội dung không phù hợp', detail = '' } = req.body as { reason?: string; detail?: string };
    const id = uid('rep');
    db.prepare('INSERT INTO message_reports (id, target_type, target_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      'character',
      req.params.id,
      reason,
      detail,
      new Date().toISOString()
    );
    res.json({ ok: true, id });
  });

  router.delete('/characters/:id', (req: Request, res: Response) => {
    const char = db.prepare('SELECT is_custom FROM characters WHERE id = ?').get(req.params.id) as { is_custom?: number } | undefined;
    if (!char) {
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }
    if (!char.is_custom) {
      res.status(400).json({ error: 'Nhân vật hệ thống chỉ có thể Ẩn hoặc Chặn, không thể xóa vĩnh viễn.' });
      return;
    }
    db.prepare('DELETE FROM character_memories WHERE character_id = ?').run(req.params.id);
    db.prepare('DELETE FROM ai_relationships WHERE character_id = ?').run(req.params.id);
    db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
    deleteCharacterAcrossApps(db, req.params.id);
    res.json({ ok: true });
  });

  // 13. Memory Manager Extended Patch (supports is_active, is_pinned, emotional_context + editing)
  router.patch('/memories/:memId', (req: Request, res: Response) => {
    const { content, memory_type, is_active, is_pinned, importance, emotional_context } = req.body as {
      content?: string;
      memory_type?: string;
      is_active?: number;
      is_pinned?: number;
      importance?: number;
      emotional_context?: string;
    };
    const sets = ['updated_at = ?'];
    const vals: unknown[] = [new Date().toISOString()];
    if (content !== undefined) {
      sets.push('content = ?');
      vals.push(content.trim());
    }
    if (memory_type !== undefined) {
      sets.push('memory_type = ?');
      vals.push(memory_type);
    }
    if (is_active !== undefined) {
      sets.push('is_active = ?');
      vals.push(is_active ? 1 : 0);
    }
    if (is_pinned !== undefined) {
      sets.push('is_pinned = ?');
      vals.push(is_pinned ? 1 : 0);
    }
    if (importance !== undefined) {
      sets.push('importance = ?');
      vals.push(importance);
    }
    if (emotional_context !== undefined) {
      sets.push('emotional_context = ?');
      vals.push(emotional_context);
    }
    vals.push(req.params.memId);
    db.prepare(`UPDATE character_memories SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json(db.prepare('SELECT * FROM character_memories WHERE id = ?').get(req.params.memId));
  });

  // 14. Proactive AI Messenger (Respects Frequency, Daily Cap, Quiet Hours, Anti-Spam)
  router.get('/proactive/jobs', (_req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM proactive_message_jobs ORDER BY created_at DESC LIMIT 40').all();
    res.json(rows);
  });

  router.post('/proactive/trigger', async (req: Request, res: Response) => {
    try {
      const { characterId, force = false } = req.body as { characterId?: string; force?: boolean };
      const profile = db.prepare('SELECT proactive_ai_enabled, dnd, focus_mode, quiet_start, quiet_end FROM user_profile LIMIT 1').get() as
        | { proactive_ai_enabled?: number; dnd?: number; focus_mode?: string; quiet_start?: string; quiet_end?: string }
        | undefined;

      const now = new Date();
      const nowIso = now.toISOString();
      const todayPrefix = nowIso.slice(0, 10);

      if (!force && profile) {
        if (profile.proactive_ai_enabled === 0) {
          res.json({ skipped: true, reason: 'Bạn đã tắt AI chủ động nhắn tin trong Cài đặt hệ thống.' });
          return;
        }
        if (profile.dnd || (profile.focus_mode && profile.focus_mode !== 'off')) {
          res.json({ skipped: true, reason: 'Đang bật Không làm phiền / Chế độ tập trung.' });
          return;
        }
        if (isQuietHoursNow(profile.quiet_start, profile.quiet_end)) {
          res.json({ skipped: true, reason: `Đang trong giờ yên tĩnh (${profile.quiet_start} - ${profile.quiet_end}).` });
          return;
        }
      }

      const charQuery = characterId
        ? 'SELECT * FROM characters WHERE id = ?'
        : 'SELECT * FROM characters WHERE COALESCE(is_blocked, 0) = 0 AND COALESCE(is_hidden, 0) = 0 AND COALESCE(proactive_msg_enabled, 1) = 1';
      const candidates = (characterId ? db.prepare(charQuery).all(characterId) : db.prepare(charQuery).all()) as Array<{
        id: string;
        name: string;
        personality: string;
        mood: string;
        avatar: string;
        pronouns?: string;
        speaking_style?: string;
        schedule_json?: string;
        proactive_msg_enabled?: number;
        proactive_settings_json?: string;
        is_blocked?: number;
      }>;

      if (candidates.length === 0) {
        res.json({ skipped: true, reason: 'Không có nhân vật nào đang bật chế độ chủ động nhắn tin.' });
        return;
      }

      const char = candidates[Math.floor(Math.random() * candidates.length)];
      if (char.is_blocked) {
        res.json({ skipped: true, reason: `${char.name} đang bị chặn.` });
        return;
      }
      if (!force && char.proactive_msg_enabled === 0) {
        res.json({ skipped: true, reason: `${char.name} đang tắt chế độ tự nhắn tin chủ động.` });
        return;
      }

      let proactiveCfg: { enabled?: boolean; dailyCap?: number; reasons?: string[] } = {};
      try {
        proactiveCfg = JSON.parse(char.proactive_settings_json || '{}');
      } catch {
        proactiveCfg = {};
      }
      const dailyCap = Math.max(1, Number(proactiveCfg.dailyCap || 2));

      if (!force) {
        const sentToday = (
          db
            .prepare("SELECT COUNT(*) as c FROM proactive_message_jobs WHERE character_id = ? AND status = 'sent' AND created_at >= ?")
            .get(char.id, `${todayPrefix}T00:00:00`) as { c: number }
        ).c;
        if (sentToday >= dailyCap) {
          const skipId = uid('pjob');
          db.prepare(
            'INSERT INTO proactive_message_jobs (id, character_id, conversation_id, scheduled_at, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(skipId, char.id, '', nowIso, `Đã đạt giới hạn ${dailyCap} tin chủ động hôm nay`, 'skipped', nowIso);
          res.json({ skipped: true, reason: `${char.name} đã đạt giới hạn ${dailyCap} tin nhắn chủ động hôm nay.` });
          return;
        }
      }

      let conv = db.prepare('SELECT * FROM conversations WHERE is_group = 0 AND character_id = ?').get(char.id) as
        | { id: string; muted: number }
        | undefined;
      if (!conv) {
        const convId = uid('conv');
        db.prepare('INSERT INTO conversations (id, title, is_group, avatar, character_id, members_json, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)').run(
          convId,
          char.name,
          char.avatar,
          char.id,
          JSON.stringify([char.id]),
          nowIso
        );
        conv = { id: convId, muted: 0 };
      }

      // Anti-spam check: don't send multiple proactive messages in a row if user hasn't replied yet
      const last2Msgs = db
        .prepare("SELECT sender_type, metadata_json FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 2")
        .all(conv.id) as Array<{ sender_type: string; metadata_json?: string }>;
      if (!force && last2Msgs.length > 0 && last2Msgs[0].sender_type === 'character' && last2Msgs[0].metadata_json?.includes('"proactive":true')) {
        res.json({ skipped: true, reason: `${char.name} đang chờ bạn phản hồi tin nhắn chủ động trước đó.` });
        return;
      }

      const memories = (
        db
          .prepare('SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY importance DESC LIMIT 6')
          .all(char.id) as Array<{ content: string }>
      ).map((m) => m.content);
      const recentMsgs = db
        .prepare("SELECT sender_name as sender, content FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 6")
        .all(conv.id) as Array<{ sender: string; content: string }>;
      recentMsgs.reverse();

      const scheduleHint = getScheduleHint(char.schedule_json);
      const reasonHint = scheduleHint || (proactiveCfg.reasons?.[0] ?? 'Nhớ tới bạn và hỏi thăm theo khung giờ');

      const generated = await generateProactiveCheckIn(
        char,
        memories,
        recentMsgs,
        now.toLocaleString('vi-VN'),
        reasonHint
      );

      const msgId = uid('msg');
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, metadata_json, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)
      `).run(
        msgId,
        conv.id,
        char.id,
        char.name,
        char.avatar,
        generated.text,
        JSON.stringify({ proactive: true, reason: reasonHint }),
        nowIso
      );

      db.prepare('UPDATE conversations SET unread_count = unread_count + 1, updated_at = ?, last_message_id = ? WHERE id = ?').run(
        nowIso,
        msgId,
        conv.id
      );

      if (generated.moodUpdate) {
        db.prepare('UPDATE characters SET mood = ? WHERE id = ?').run(generated.moodUpdate, char.id);
      }

      const jobId = uid('pjob');
      db.prepare(
        'INSERT INTO proactive_message_jobs (id, character_id, conversation_id, scheduled_at, reason, status, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(jobId, char.id, conv.id, nowIso, reasonHint, 'sent', msgId, nowIso);

      let notification = null;
      if (!conv.muted) {
        const notifId = uid('notif');
        db.prepare(`
          INSERT INTO notifications (id, app_id, group_key, title, body, avatar, action_route, action_payload, priority, is_read, created_at)
          VALUES (?, 'messages', 'Tin nhắn', ?, ?, ?, 'messages', ?, 1, 0, ?)
        `).run(notifId, char.name, generated.text.slice(0, 100), char.avatar, conv.id, nowIso);
        notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
      }

      res.json({
        skipped: false,
        character: db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id),
        conversationId: conv.id,
        message: db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId),
        job: db.prepare('SELECT * FROM proactive_message_jobs WHERE id = ?').get(jobId),
        notification,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Chủ động nhắn tin thất bại' });
    }
  });

  // =========================================================================
  // 15. DOKICHAT ULTIMATE 3.0 — REAL SSE STREAMING & CONTINUATION
  // =========================================================================
  router.post('/ai/stream', async (req: Request, res: Response) => {
    const {
      conversation_id,
      content = '',
      msg_type = 'text',
      attachment_json = '{}',
      reply_to_id = '',
      client_temp_id = '',
      request_id = '',
      skip_save_user = false,
      tuning = undefined,
    } = req.body as {
      conversation_id?: string;
      content?: string;
      msg_type?: string;
      attachment_json?: unknown;
      reply_to_id?: string;
      client_temp_id?: string;
      request_id?: string;
      skip_save_user?: boolean;
      tuning?: ResponseTuningOptions;
    };

    if (!conversation_id) {
      res.status(400).json({ error: 'Thiếu conversation_id' });
      return;
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as
      | {
          id: string;
          title: string;
          is_group: number;
          character_id: string;
          members_json: string;
          roleplay_mode: number;
          roleplay_state_json?: string;
          settings_json?: string;
        }
      | undefined;

    if (!conv) {
      res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    const reqKey = request_id || conversation_id;
    cancelAiGeneration(reqKey);
    const controller = new AbortController();
    activeAiControllers.set(reqKey, controller);
    activeAiControllers.set(conversation_id, controller);

    let finished = false;
    res.on('close', () => {
      if (!finished) {
        controller.abort();
      }
    });

    try {
      const profile = db.prepare('SELECT name, avatar, ai_memory_enabled FROM user_profile LIMIT 1').get() as {
        name: string;
        avatar: string;
        ai_memory_enabled?: number;
      };
      const now = new Date().toISOString();
      let userMessage: unknown = null;

      // Step 1: Persist or deduplicate User Message
      if (!skip_save_user) {
        if (client_temp_id) {
          userMessage = db
            .prepare('SELECT * FROM messages WHERE conversation_id = ? AND client_temp_id = ? LIMIT 1')
            .get(conversation_id, client_temp_id);
        }
        if (!userMessage) {
          const userMsgId = uid('msg');
          const attStr = typeof attachment_json === 'string' ? attachment_json : JSON.stringify(attachment_json || {});
          db.prepare(`
            INSERT INTO messages (
              id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type,
              attachment_json, reply_to_id, delivery_status, metadata_json, client_temp_id, created_at
            ) VALUES (?, ?, 'user', 'user_1', ?, ?, ?, ?, ?, ?, 'sent', '{}', ?, ?)
          `).run(
            userMsgId,
            conversation_id,
            profile.name,
            profile.avatar,
            content,
            msg_type,
            attStr,
            reply_to_id,
            client_temp_id || '',
            now
          );
          db.prepare('UPDATE conversations SET updated_at = ?, unread_count = 0, last_message_id = ? WHERE id = ?').run(
            now,
            userMsgId,
            conversation_id
          );
          userMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(userMsgId);
        }
        writeEvent({ type: 'user_saved', userMessage });
      }

      // Group chat delegates cleanly with status + final done event
      if (conv.is_group) {
        writeEvent({ type: 'status', label: 'Các thành viên nhóm đang soạn tin...' });
        const groupRes = await generateAndStoreAiReplyV3(conversation_id, content, msg_type, attachment_json, {
          requestId: reqKey,
          lastMessageId: (userMessage as { id?: string } | null)?.id,
        });
        finished = true;
        if (groupRes.aiError) {
          writeEvent({ type: 'error', error: groupRes.aiError });
        } else {
          writeEvent({
            type: 'done',
            userMessage,
            aiMessage: groupRes.aiMessage,
            aiMessages: groupRes.aiMessages,
            updatedCharacter: groupRes.updatedCharacter,
            newMemoryRecord: groupRes.newMemoryRecord,
          });
        }
        res.end();
        return;
      }

      // 1-on-1 Streaming AI Chat
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(conv.character_id) as Record<string, unknown> | undefined;
      if (!char) {
        finished = true;
        writeEvent({ type: 'error', error: 'Không tìm thấy nhân vật AI' });
        res.end();
        return;
      }
      if (char.is_blocked) {
        finished = true;
        writeEvent({ type: 'error', error: `${String(char.name)} hiện đang nằm trong danh sách chặn.` });
        res.end();
        return;
      }

      writeEvent({ type: 'status', label: `${String(char.name)} đang suy nghĩ...` });

      const globalMemoryOn = profile.ai_memory_enabled !== 0;
      const canUseMemory = globalMemoryOn && char.memory_enabled !== 0;
      // STRICT ISOLATION: Query ONLY memories belonging to this exact character_id
      const memories = canUseMemory
        ? (
            db
              .prepare(
                'SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY COALESCE(is_pinned, 0) DESC, importance DESC, created_at DESC LIMIT 14'
              )
              .all(String(char.id)) as Array<{ content: string }>
          ).map((m) => m.content)
        : [];

      const recentMsgs = db
        .prepare(
          "SELECT sender_name as sender, content, msg_type FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 16"
        )
        .all(conversation_id) as Array<{ sender: string; content: string; msg_type: string }>;
      recentMsgs.reverse();

      let roleplayState: RoleplayStateContext = {};
      try {
        roleplayState = JSON.parse(conv.roleplay_state_json || '{}') as RoleplayStateContext;
      } catch {
        roleplayState = {};
      }

      const latestSummaryRow = db
        .prepare('SELECT summary FROM chat_summaries WHERE conversation_id = ? ORDER BY version DESC, created_at DESC LIMIT 1')
        .get(conversation_id) as { summary: string } | undefined;
      const relRow = db.prepare('SELECT stage FROM ai_relationships WHERE character_id = ?').get(String(char.id)) as
        | { stage: string }
        | undefined;

      const imagesBase64: string[] = [];
      if (msg_type === 'image') {
        try {
          const parsedAtt =
            typeof attachment_json === 'string'
              ? (JSON.parse(attachment_json) as { dataUrl?: string; images?: Array<{ dataUrl?: string }> })
              : (attachment_json as { dataUrl?: string; images?: Array<{ dataUrl?: string }> });
          if (parsedAtt?.images?.length) {
            for (const im of parsedAtt.images) {
              if (im.dataUrl?.startsWith('data:image')) imagesBase64.push(im.dataUrl);
            }
          } else if (parsedAtt?.dataUrl?.startsWith('data:image')) {
            imagesBase64.push(parsedAtt.dataUrl);
          }
        } catch {
          // ignore
        }
      }

      const baseTuning = getEffectiveTuningForConversation(conv.settings_json);
      const mergedTuning: ResponseTuningOptions = { ...baseTuning, ...(tuning || {}) };

      const bankingPrep = prepareAiChatBankingContext({
        characterId: String(char.id),
        conversationId: conversation_id,
        userText: content || '',
        character: { id: String(char.id), name: String(char.name), personality: String(char.personality || '') },
      });

      const userMsgWithBankHint = `${
        content || (msg_type === 'image' ? '[Đã gửi hình ảnh]' : `[Đã gửi ${msg_type}]`)
      }${bankingPrep.systemHintForGemini}`;

      const aiResult = await generateCharacterReplyStream(
        {
          id: String(char.id),
          name: String(char.name),
          age: Number(char.age || 20),
          personality: String(char.personality || ''),
          bio: String(char.bio || ''),
          likes: String(char.likes || ''),
          dislikes: String(char.dislikes || ''),
          scenario: String(char.scenario || ''),
          mood: String(char.mood || ''),
          relationship_level: Number(char.relationship_level || 1),
          relationship_xp: Number(char.relationship_xp || 0),
          memories,
          recentMessages: recentMsgs,
          roleplayMode: Boolean(conv.roleplay_mode || (roleplayState.active && !roleplayState.paused)),
          roleplayState,
          userName: profile.name,
          pronouns: char.pronouns ? String(char.pronouns) : undefined,
          speaking_style: char.speaking_style ? String(char.speaking_style) : undefined,
          role_title: char.role_title ? String(char.role_title) : undefined,
          content_boundary: char.content_boundary ? String(char.content_boundary) : undefined,
          personality_json: char.personality_json ? String(char.personality_json) : undefined,
          background_json: char.background_json ? String(char.background_json) : undefined,
          speech_style_json: char.speech_style_json ? String(char.speech_style_json) : undefined,
          system_prompt: char.system_prompt ? String(char.system_prompt) : undefined,
          memory_prompt: char.memory_prompt ? String(char.memory_prompt) : undefined,
          emotional_behavior: char.emotional_behavior ? String(char.emotional_behavior) : undefined,
          chatSummary: latestSummaryRow?.summary,
          relationshipStage: relRow?.stage,
          currentTimeLabel: new Date().toLocaleString('vi-VN'),
          scheduleHint: getScheduleHint(char.schedule_json ? String(char.schedule_json) : undefined),
          tuning: mergedTuning,
        },
        userMsgWithBankHint,
        {
          imagesBase64,
          signal: controller.signal,
          onChunk: (visibleText) => {
            writeEvent({ type: 'chunk', text: visibleText });
          },
        }
      );

      const bubbleGroupId = uid('bg');
      const bubbles = aiResult.bubbles.length > 0 ? aiResult.bubbles : [aiResult.reply];
      const insertedMsgs: unknown[] = [];
      let lastCreatedAt = new Date().toISOString();
      let lastAiMsgId = '';

      for (let i = 0; i < bubbles.length; i++) {
        const bubbleText = stripHikariTransferTags(bubbles[i]);
        if (!bubbleText) continue;
        const aiNow = new Date(Date.now() + i * 220).toISOString();
        lastCreatedAt = aiNow;
        const aiMsgId = uid('msg');
        lastAiMsgId = aiMsgId;
        db.prepare(`
          INSERT INTO messages (
            id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, metadata_json, created_at
          ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)
        `).run(
          aiMsgId,
          conversation_id,
          String(char.id),
          String(char.name),
          String(char.avatar),
          bubbleText,
          JSON.stringify({
            bubbleGroupId,
            bubbleIndex: i,
            bubbleTotal: bubbles.length,
            emotionTag: aiResult.emotionTag || '',
            emotionReason: aiResult.emotionReason || '',
            roleplay: Boolean(conv.roleplay_mode || (roleplayState.active && !roleplayState.paused)),
          }),
          aiNow
        );
        insertedMsgs.push(db.prepare('SELECT * FROM messages WHERE id = ?').get(aiMsgId));
      }

      const finalizedTransfer = controller.signal.aborted
        ? {}
        : finalizeAiChatBankingTransfer({
            pendingTransfer: bankingPrep.pendingTransfer,
            replyText: aiResult.reply,
            schemaApproved: aiResult.approveTransfer,
          });

      const bankAttachmentPayload = finalizedTransfer.executedTransfer || bankingPrep.resendReceipt;
      if (bankAttachmentPayload) {
        const billNow = new Date(Date.now() + bubbles.length * 220 + 200).toISOString();
        const billMsgId = uid('msg');
        lastCreatedAt = billNow;
        lastAiMsgId = billMsgId;
        const isResend = Boolean(bankingPrep.resendReceipt && !finalizedTransfer.executedTransfer);
        db.prepare(`
          INSERT INTO messages (
            id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, attachment_json, delivery_status, metadata_json, created_at
          ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'image', ?, 'sent', ?, ?)
        `).run(
          billMsgId,
          conversation_id,
          String(char.id),
          String(char.name),
          String(char.avatar),
          isResend
            ? `Gửi lại biên lai Hikari Bank · Mã ${bankAttachmentPayload.refCode}`
            : `Biên lai chuyển khoản Hikari Bank · Mã ${bankAttachmentPayload.refCode}`,
          JSON.stringify({
            dataUrl: bankAttachmentPayload.billImageDataUrl,
            isBill: true,
            cardType: 'hikari_tx_card',
            direction: 'char_to_player',
            txId: bankAttachmentPayload.txId,
            refCode: bankAttachmentPayload.refCode,
            amount: bankAttachmentPayload.amount,
            receipt: bankAttachmentPayload.receipt,
          }),
          JSON.stringify({ isBill: true, txId: bankAttachmentPayload.txId, isResend }),
          billNow
        );
        insertedMsgs.push(db.prepare('SELECT * FROM messages WHERE id = ?').get(billMsgId));
      }

      if (lastAiMsgId) {
        db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ? WHERE id = ?').run(
          lastCreatedAt,
          lastAiMsgId,
          conversation_id
        );
      }

      const throttled = isAntiSpamThrottled(conversation_id, content);
      const actualXp = throttled ? Math.min(1, aiResult.xpGain) : aiResult.xpGain;
      let newXp = Number(char.relationship_xp || 0) + actualXp;
      let newLevel = Number(char.relationship_level || 1);
      while (newXp >= 100) {
        newLevel += 1;
        newXp -= 100;
      }
      db.prepare(
        'UPDATE characters SET relationship_xp = ?, relationship_level = ?, mood = COALESCE(?, mood), interactions_count = interactions_count + 1 WHERE id = ?'
      ).run(newXp, newLevel, aiResult.moodUpdate || null, String(char.id));

      updateCharacterRelationshipNatural(
        String(char.id),
        aiResult.emotionReason || 'Trò chuyện cùng bạn',
        throttled ? 0 : (aiResult.affectionDelta ?? 1),
        throttled ? 0 : (aiResult.familiarityDelta ?? 1),
        throttled ? 0 : (aiResult.trustDelta ?? 1),
        throttled ? 0 : (aiResult.respectDelta ?? 1),
        aiResult.emotionTag || ''
      );

      let newMemoryRecord = null;
      if (canUseMemory && aiResult.newMemory && !roleplayState.active) {
        newMemoryRecord = upsertSmartMemory(
          String(char.id),
          aiResult.newMemory,
          aiResult.memoryType || 'long_term',
          7,
          'ai_inferred',
          (userMessage as { id?: string } | null)?.id || '',
          aiResult.memoryConfidence ?? 0.85
        );
      }

      finished = true;
      writeEvent({
        type: 'done',
        userMessage,
        aiMessage: insertedMsgs[0] || null,
        aiMessages: insertedMsgs,
        updatedCharacter: db.prepare('SELECT * FROM characters WHERE id = ?').get(String(char.id)),
        newMemoryRecord,
        relationship: db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(String(char.id)),
        emotionTag: aiResult.emotionTag,
        emotionReason: aiResult.emotionReason,
      });
      res.end();
    } catch (err) {
      finished = true;
      writeEvent({ type: 'error', error: err instanceof Error ? err.message : 'Streaming AI thất bại' });
      res.end();
    } finally {
      if (activeAiControllers.get(reqKey) === controller) activeAiControllers.delete(reqKey);
      if (activeAiControllers.get(conversation_id) === controller) activeAiControllers.delete(conversation_id);
    }
  });

  // 16. Continue last AI response
  router.post('/ai/continue', async (req: Request, res: Response) => {
    try {
      const { conversation_id } = req.body as { conversation_id?: string };
      if (!conversation_id) {
        res.status(400).json({ error: 'Thiếu conversation_id' });
        return;
      }
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as
        | { id: string; character_id: string; roleplay_mode: number; roleplay_state_json?: string; settings_json?: string }
        | undefined;
      if (!conv || !conv.character_id) {
        res.status(404).json({ error: 'Chỉ hỗ trợ tiếp tục hội thoại 1-1 với nhân vật AI' });
        return;
      }
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(conv.character_id) as Record<string, unknown> | undefined;
      if (!char) {
        res.status(404).json({ error: 'Không tìm thấy nhân vật' });
        return;
      }
      const lastAiMsg = db
        .prepare("SELECT * FROM messages WHERE conversation_id = ? AND sender_type = 'character' AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 1")
        .get(conversation_id) as { id: string; content: string } | undefined;

      const profile = db.prepare('SELECT name FROM user_profile LIMIT 1').get() as { name: string };
      const memories = (
        db
          .prepare('SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY COALESCE(is_pinned, 0) DESC, importance DESC LIMIT 10')
          .all(String(char.id)) as Array<{ content: string }>
      ).map((m) => m.content);
      const recentMsgs = db
        .prepare("SELECT sender_name as sender, content, msg_type FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 12")
        .all(conversation_id) as Array<{ sender: string; content: string; msg_type: string }>;
      recentMsgs.reverse();

      const aiRes = await generateCharacterReplyStream(
        {
          id: String(char.id),
          name: String(char.name),
          age: Number(char.age || 20),
          personality: String(char.personality || ''),
          bio: String(char.bio || ''),
          likes: String(char.likes || ''),
          dislikes: String(char.dislikes || ''),
          scenario: String(char.scenario || ''),
          mood: String(char.mood || ''),
          relationship_level: Number(char.relationship_level || 1),
          relationship_xp: Number(char.relationship_xp || 0),
          memories,
          recentMessages: recentMsgs,
          userName: profile.name,
          pronouns: char.pronouns ? String(char.pronouns) : undefined,
          speaking_style: char.speaking_style ? String(char.speaking_style) : undefined,
          system_prompt: char.system_prompt ? String(char.system_prompt) : undefined,
          tuning: getEffectiveTuningForConversation(conv.settings_json),
        },
        'Hãy viết tiếp phần suy nghĩ/lời nói còn lại một cách tự nhiên.',
        {
          continuationPrefix: lastAiMsg?.content || '',
          onChunk: () => {},
        }
      );

      const now = new Date().toISOString();
      const msgId = uid('msg');
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, sender_type, sender_id, sender_name, sender_avatar, content, msg_type, delivery_status, metadata_json, created_at
        ) VALUES (?, ?, 'character', ?, ?, ?, ?, 'text', 'sent', ?, ?)
      `).run(
        msgId,
        conversation_id,
        String(char.id),
        String(char.name),
        String(char.avatar),
        aiRes.reply,
        JSON.stringify({ continuedFrom: lastAiMsg?.id || '', emotionTag: aiRes.emotionTag || '' }),
        now
      );
      db.prepare('UPDATE conversations SET updated_at = ?, last_message_id = ? WHERE id = ?').run(now, msgId, conversation_id);

      res.json({
        aiMessage: db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId),
        aiMessages: [db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId)],
        updatedCharacter: db.prepare('SELECT * FROM characters WHERE id = ?').get(String(char.id)),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Tiếp tục phản hồi thất bại' });
    }
  });

  // 17. Character Creator Live Preview (before saving)
  router.post('/characters/preview-reply', async (req: Request, res: Response) => {
    try {
      const { characterDraft, sampleMessage } = req.body as {
        characterDraft?: Record<string, unknown>;
        sampleMessage?: string;
      };
      const result = await generateCharacterPreviewReply(
        {
          name: String(characterDraft?.name || 'Nhân vật thử nghiệm'),
          age: Number(characterDraft?.age || 20),
          personality: String(characterDraft?.personality || ''),
          bio: String(characterDraft?.bio || ''),
          pronouns: String(characterDraft?.pronouns || 'Mình - Bạn'),
          speaking_style: String(characterDraft?.speaking_style || 'Tự nhiên'),
          scenario: String(characterDraft?.scenario || ''),
          system_prompt: String(characterDraft?.system_prompt || ''),
          emotional_behavior: String(characterDraft?.emotional_behavior || ''),
        },
        sampleMessage || 'Chào cậu, hôm nay cậu thấy thế nào?'
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Xem trước phản hồi thất bại' });
    }
  });

  // 18. DokiChat User Settings
  router.get('/settings', (_req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM doki_user_settings WHERE id = ?').get('default');
    res.json(row || {});
  });

  router.patch('/settings', (req: Request, res: Response) => {
    const allowed = [
      'theme_mode', 'bubble_style', 'wallpaper', 'font_size', 'sound_enabled', 'haptic_enabled',
      'proactive_enabled', 'proactive_frequency', 'quiet_start', 'quiet_end',
      'default_response_length', 'default_detail_level', 'default_creativity', 'default_humor',
      'default_language', 'default_narration', 'tts_speed',
    ];
    const now = new Date().toISOString();
    const sets = ['updated_at = ?'];
    const vals: unknown[] = [now];
    for (const k of allowed) {
      if (k in req.body) {
        sets.push(`${k} = ?`);
        vals.push(req.body[k]);
      }
    }
    vals.push('default');
    db.prepare(`UPDATE doki_user_settings SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json(db.prepare('SELECT * FROM doki_user_settings WHERE id = ?').get('default'));
  });

  // 19. Protected AI Provider Configuration (strictly locked on backend unless valid server-verified admin token)
  const logAiConfigAudit = (action: string, allowed: boolean, detail: string) => {
    try {
      db.prepare(`
        INSERT INTO ai_config_audit_logs (id, action, allowed, detail, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(uid('aica'), action, allowed ? 1 : 0, detail, new Date().toISOString());
    } catch {
      // non-fatal audit log
    }
  };

  router.get('/ai-config', (req: Request, res: Response) => {
    const token = req.header('x-ai-admin-token');
    const isAdmin = verifyAiAdminToken(token);
    res.json(getPublicAiConfig(isAdmin));
  });

  router.post('/ai-config/verify-admin', (req: Request, res: Response) => {
    const token = (req.body as { adminToken?: string })?.adminToken || req.header('x-ai-admin-token');
    const isAdmin = verifyAiAdminToken(token);
    logAiConfigAudit('verify_admin', isAdmin, isAdmin ? 'Admin verified' : 'Invalid or unconfigured admin token');
    if (!isAdmin) {
      res.status(403).json({
        error: 'Khu vực cấu hình AI được bảo vệ. Không thể mở khóa với mã xác thực hiện tại.',
        ...getPublicAiConfig(false),
      });
      return;
    }
    res.json(getPublicAiConfig(true));
  });

  const handleProtectedAiConfigWrite = (req: Request, res: Response) => {
    const token = req.header('x-ai-admin-token') || (req.body as { adminToken?: string })?.adminToken;
    const isAdmin = verifyAiAdminToken(token);
    if (!isAdmin) {
      logAiConfigAudit('write_denied', false, `Blocked ${req.method} /ai-config`);
      res.status(403).json({ error: 'Khu vực cấu hình AI được bảo vệ' });
      return;
    }
    const { model_id, fallback_model_id, thinking_level, streaming_enabled, max_tokens, timeout_ms } = req.body as {
      model_id?: string;
      fallback_model_id?: string;
      thinking_level?: string;
      streaming_enabled?: number;
      max_tokens?: number;
      timeout_ms?: number;
    };
    const now = new Date().toISOString();
    const cleanModel = sanitizeAllowedModel(model_id, 'gemini-4-hydrogen');
    const cleanFallback = sanitizeAllowedModel(fallback_model_id, 'gemini-3.1-flash-lite');
    const cleanThinking = String(thinking_level || 'LOW').toUpperCase() === 'MEDIUM' ? 'MEDIUM' : 'LOW';
    db.prepare(`
      UPDATE ai_provider_settings SET
        model_id = ?, fallback_model_id = ?, thinking_level = ?, streaming_enabled = ?,
        max_tokens = ?, timeout_ms = ?, updated_at = ?
      WHERE id = 'default'
    `).run(
      cleanModel,
      cleanFallback,
      cleanThinking,
      streaming_enabled === 0 ? 0 : 1,
      Math.max(256, Math.min(4096, Number(max_tokens || 1200))),
      Math.max(5000, Math.min(35000, Number(timeout_ms || 15000))),
      now
    );
    logAiConfigAudit('update_config', true, `Updated model=${cleanModel}, thinking=${cleanThinking}`);
    res.json(getPublicAiConfig(true));
  };

  router.patch('/ai-config', handleProtectedAiConfigWrite);
  router.put('/ai-config', handleProtectedAiConfigWrite);
  router.post('/ai-config', handleProtectedAiConfigWrite);

  // 20. Sticker & GIF Favorites + Usage Tracking
  router.get('/stickers/stats', (_req: Request, res: Response) => {
    res.json(db.prepare('SELECT * FROM sticker_favorites ORDER BY is_favorite DESC, last_used_at DESC').all());
  });

  router.post('/stickers/track', (req: Request, res: Response) => {
    const { sticker_id, item_type = 'sticker', payload = {}, toggleFavorite } = req.body as {
      sticker_id?: string;
      item_type?: 'sticker' | 'gif';
      payload?: Record<string, unknown>;
      toggleFavorite?: boolean;
    };
    if (!sticker_id) {
      res.status(400).json({ error: 'Thiếu sticker_id' });
      return;
    }
    const existing = db.prepare('SELECT * FROM sticker_favorites WHERE sticker_id = ?').get(sticker_id) as
      | { id: string; is_favorite: number; use_count: number }
      | undefined;
    const now = new Date().toISOString();
    if (!existing) {
      const id = uid('stk');
      db.prepare(`
        INSERT INTO sticker_favorites (id, sticker_id, item_type, payload_json, is_favorite, use_count, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sticker_id,
        item_type,
        JSON.stringify(payload),
        toggleFavorite ? 1 : 0,
        toggleFavorite ? 0 : 1,
        now
      );
      res.json(db.prepare('SELECT * FROM sticker_favorites WHERE id = ?').get(id));
      return;
    }

    const nextFav = toggleFavorite ? (existing.is_favorite ? 0 : 1) : existing.is_favorite;
    const nextUse = toggleFavorite ? existing.use_count : existing.use_count + 1;
    db.prepare(`
      UPDATE sticker_favorites SET is_favorite = ?, use_count = ?, last_used_at = ? WHERE id = ?
    `).run(nextFav, nextUse, now, existing.id);
    res.json(db.prepare('SELECT * FROM sticker_favorites WHERE id = ?').get(existing.id));
  });

  // 21. Roleplay Scenarios & Story Restart
  router.get('/scenarios', (_req: Request, res: Response) => {
    res.json(db.prepare('SELECT * FROM roleplay_scenarios ORDER BY created_at DESC').all());
  });

  router.post('/scenarios', (req: Request, res: Response) => {
    const { character_id = '', title, genre = 'Roleplay', description, user_role = '', ai_role = '', opening_scene = '', branches = [] } =
      req.body as {
        character_id?: string;
        title?: string;
        genre?: string;
        description?: string;
        user_role?: string;
        ai_role?: string;
        opening_scene?: string;
        branches?: string[];
      };
    if (!title?.trim()) {
      res.status(400).json({ error: 'Thiếu tiêu đề kịch bản' });
      return;
    }
    const id = uid('rp');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO roleplay_scenarios (id, character_id, title, genre, description, user_role, ai_role, opening_scene, branches_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      character_id,
      title.trim(),
      genre,
      description || title.trim(),
      user_role,
      ai_role,
      opening_scene,
      JSON.stringify(branches),
      now
    );
    res.json(db.prepare('SELECT * FROM roleplay_scenarios WHERE id = ?').get(id));
  });

  router.post('/conversations/:id/roleplay/restart', (req: Request, res: Response) => {
    const convId = req.params.id;
    const { sceneTitle, scenario } = req.body as { sceneTitle?: string; scenario?: string };
    const now = new Date().toISOString();
    const conv = db.prepare('SELECT roleplay_state_json FROM conversations WHERE id = ?').get(convId) as
      | { roleplay_state_json?: string }
      | undefined;
    let state: Record<string, unknown> = {};
    try {
      state = JSON.parse(conv?.roleplay_state_json || '{}') as Record<string, unknown>;
    } catch {
      state = {};
    }
    state = {
      ...state,
      active: true,
      paused: false,
      sceneTitle: sceneTitle || state.sceneTitle || 'Chương mới',
      scenario: scenario || state.scenario || '',
    };
    db.prepare('UPDATE conversations SET roleplay_mode = 1, roleplay_state_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(state),
      now,
      convId
    );
    const sysId = uid('msg');
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, content, msg_type, created_at)
      VALUES (?, ?, 'system', 'system', 'Cốt truyện', ?, 'system', ?)
    `).run(sysId, convId, `Bắt đầu phân nhánh cốt truyện mới: ${String(state.sceneTitle)}`, now);
    res.json({
      conversation: db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId),
      systemMessage: db.prepare('SELECT * FROM messages WHERE id = ?').get(sysId),
    });
  });

  // 22. Relationship Detail & User Profile Overview
  router.get('/relationships/:charId', (req: Request, res: Response) => {
    const charId = req.params.charId;
    const relationship = db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(charId);
    const events = db
      .prepare('SELECT * FROM relationship_events WHERE character_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(charId);
    res.json({ relationship, events });
  });

  router.get('/profile-overview', (_req: Request, res: Response) => {
    const profile = db.prepare('SELECT id, name, username, email, avatar, bio, joined_at FROM user_profile LIMIT 1').get();
    const sentCount = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE sender_type = 'user' AND COALESCE(deleted_at, '') = ''").get() as { c: number }).c;
    const totalChars = (db.prepare('SELECT COUNT(*) as c FROM characters WHERE COALESCE(is_hidden, 0) = 0').get() as { c: number }).c;
    const favCount = (db.prepare('SELECT COUNT(*) as c FROM characters WHERE is_favorite = 1').get() as { c: number }).c;
    const customCount = (db.prepare('SELECT COUNT(*) as c FROM characters WHERE is_custom = 1').get() as { c: number }).c;
    const memCount = (db.prepare('SELECT COUNT(*) as c FROM character_memories WHERE COALESCE(is_active, 1) = 1').get() as { c: number }).c;
    const callCount = (db.prepare('SELECT COUNT(*) as c FROM call_history WHERE is_ai = 1').get() as { c: number }).c;
    const recentRelEvents = db.prepare('SELECT * FROM relationship_events ORDER BY created_at DESC LIMIT 12').all();
    res.json({
      profile,
      stats: { sentCount, totalChars, favCount, customCount, memCount, callCount },
      recentRelEvents,
    });
  });

  // 23. Voice & Video Call Real Turn + Session Storage
  router.post('/calls/turn', async (req: Request, res: Response) => {
    try {
      const { character_id, conversation_id, text, audioDataUrl, mimeType, voiceName, withAudio = true } = req.body as {
        character_id?: string;
        conversation_id?: string;
        text?: string;
        audioDataUrl?: string;
        mimeType?: string;
        voiceName?: string;
        withAudio?: boolean;
      };
      let spokenText = (text || '').trim();
      if (!spokenText && audioDataUrl) {
        spokenText = await transcribeAudioBase64(audioDataUrl, mimeType || 'audio/webm');
      }
      if (!spokenText) {
        res.status(400).json({ error: 'Không nhận được nội dung giọng nói hoặc văn bản' });
        return;
      }
      const char = character_id
        ? (db.prepare('SELECT * FROM characters WHERE id = ?').get(character_id) as Record<string, unknown> | undefined)
        : undefined;
      if (!char) {
        res.status(404).json({ error: 'Không tìm thấy nhân vật AI cho cuộc gọi' });
        return;
      }
      const profile = db.prepare('SELECT name FROM user_profile LIMIT 1').get() as { name: string };
      const memories = (
        db
          .prepare('SELECT content FROM character_memories WHERE character_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY COALESCE(is_pinned, 0) DESC, importance DESC LIMIT 8')
          .all(String(char.id)) as Array<{ content: string }>
      ).map((m) => m.content);
      const recentMsgs = conversation_id
        ? (db
            .prepare("SELECT sender_name as sender, content, msg_type FROM messages WHERE conversation_id = ? AND COALESCE(deleted_at, '') = '' ORDER BY created_at DESC LIMIT 8")
            .all(conversation_id) as Array<{ sender: string; content: string; msg_type: string }>).reverse()
        : [];

      const turn = await generateVoiceCallTurn(
        {
          id: String(char.id),
          name: String(char.name),
          age: Number(char.age || 20),
          personality: String(char.personality || ''),
          bio: String(char.bio || ''),
          likes: String(char.likes || ''),
          dislikes: String(char.dislikes || ''),
          scenario: String(char.scenario || ''),
          mood: String(char.mood || ''),
          relationship_level: Number(char.relationship_level || 1),
          relationship_xp: Number(char.relationship_xp || 0),
          memories,
          recentMessages: recentMsgs,
          userName: profile.name,
          pronouns: char.pronouns ? String(char.pronouns) : undefined,
          speaking_style: char.speaking_style ? String(char.speaking_style) : undefined,
        },
        spokenText,
        Boolean(withAudio),
        voiceName || String(char.voice_name || 'Kore')
      );

      db.prepare('UPDATE characters SET mood = ?, interactions_count = interactions_count + 1 WHERE id = ?').run(
        `${turn.emotionTag} · Đang gọi thoại`,
        String(char.id)
      );
      updateCharacterRelationshipNatural(String(char.id), 'Trò chuyện qua cuộc gọi', 1, 1, 1, 1, turn.emotionTag);

      res.json({
        transcript: spokenText,
        reply: turn.reply,
        emotionTag: turn.emotionTag,
        audioBase64: turn.audioBase64,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Xử lý lượt gọi thất bại' });
    }
  });

  router.post('/calls/session', (req: Request, res: Response) => {
    const { character_id = '', call_type = 'voice', duration_sec = 0, transcript = [], emotion_summary = '' } = req.body as {
      character_id?: string;
      call_type?: 'voice' | 'video';
      duration_sec?: number;
      transcript?: Array<{ who: string; text: string }>;
      emotion_summary?: string;
    };
    const id = uid('csess');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO call_sessions (id, character_id, call_type, duration_sec, transcript_json, emotion_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, character_id, call_type, Math.max(0, Number(duration_sec)), JSON.stringify(transcript), emotion_summary, now);
    res.json(db.prepare('SELECT * FROM call_sessions WHERE id = ?').get(id));
  });

  // 24. DokiChat Clear Cache / Export
  router.post('/data/clear', (req: Request, res: Response) => {
    const { target } = req.body as { target?: 'search_history' | 'inactive_memories' | 'proactive_logs' };
    if (target === 'search_history') {
      db.prepare('DELETE FROM chat_search_history').run();
    } else if (target === 'inactive_memories') {
      db.prepare('DELETE FROM character_memories WHERE COALESCE(is_active, 1) = 0').run();
    } else if (target === 'proactive_logs') {
      db.prepare('DELETE FROM proactive_message_jobs').run();
    }
    res.json({ ok: true });
  });

  return router;
}
