import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  getAiClient,
  getPublicAiConfig,
  logAiUsage,
  toThinkingLevelEnum,
} from './ai_provider.ts';

const PRIMARY_TEXT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';

function getClient(): GoogleGenAI {
  return getAiClient();
}

function extractRawErrorText(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function formatGeminiError(err: unknown): string {
  const raw = extractRawErrorText(err).trim();
  if (!raw) return 'Dịch vụ AI tạm thời gián đoạn. Vui lòng thử lại.';
  if (raw.includes('đã bị hủy') || raw.includes('aborted')) {
    return 'Yêu cầu AI đã bị hủy bởi người dùng.';
  }
  if (raw.includes('GEMINI_API_KEY chưa được cấu hình')) {
    return raw;
  }

  let parsedCode: number | undefined;
  let parsedStatus = '';
  let parsedMessage = raw;

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const obj = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; status?: string; message?: string };
        code?: number;
        status?: string;
        message?: string;
      };
      const inner = obj.error || obj;
      parsedCode = inner.code;
      parsedStatus = inner.status || '';
      if (inner.message) parsedMessage = inner.message;
    } catch {
      // ignore non-JSON tail
    }
  }

  const upper = `${raw} ${parsedStatus} ${parsedMessage}`.toUpperCase();
  if (
    parsedCode === 503 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('OVERLOADED')
  ) {
    return 'Máy chủ AI đang quá tải tạm thời (503). Hệ thống đã thử kết nối lại nhưng lưu lượng đang cao — bạn hãy bấm "Thử lại" sau vài giây nhé.';
  }
  if (parsedCode === 429 || upper.includes('RESOURCE_EXHAUSTED') || upper.includes('RATE LIMIT')) {
    return 'Hệ thống AI đang chạm giới hạn lượt gọi tạm thời (429). Vui lòng đợi một lát rồi bấm "Thử lại".';
  }
  if (
    parsedCode === 403 ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('API KEY NOT VALID')
  ) {
    return 'GEMINI_API_KEY chưa hợp lệ hoặc thiếu quyền truy cập. Hãy kiểm tra khóa trong Settings > Secrets.';
  }
  if (parsedCode === 404 || upper.includes('NOT_FOUND')) {
    return 'Mô hình AI được yêu cầu hiện không khả dụng (404). Vui lòng thử lại sau.';
  }
  if (
    upper.includes('TIMEOUT_RETRY') ||
    upper.includes('THỜI GIAN CHỜ') ||
    upper.includes('FETCH FAILED') ||
    upper.includes('ECONNRESET') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('NETWORK')
  ) {
    return 'Kết nối tới máy chủ AI quá lâu hoặc bị gián đoạn. Vui lòng bấm "Thử lại".';
  }

  return parsedMessage.length > 220 ? `${parsedMessage.slice(0, 220)}...` : parsedMessage;
}

function isRetryableGeminiError(err: unknown): boolean {
  const raw = extractRawErrorText(err).toUpperCase();
  if (!raw) return false;
  if (raw.includes('ĐÃ BỊ HỦY') || raw.includes('GEMINI_API_KEY CHƯA ĐƯỢC CẤU HÌNH')) {
    return false;
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('NOT_FOUND')) {
    return false;
  }
  return (
    raw.includes('TIMEOUT_RETRY') ||
    raw.includes('ABORTED') ||
    raw.includes('503') ||
    raw.includes('502') ||
    raw.includes('504') ||
    raw.includes('429') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('HIGH DEMAND') ||
    raw.includes('OVERLOADED') ||
    raw.includes('TEMPORARILY') ||
    raw.includes('ECONNRESET') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('FETCH FAILED')
  );
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Yêu cầu AI đã bị hủy bởi người dùng.'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Yêu cầu AI đã bị hủy bởi người dùng.'));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function generateTextWithResilience<T>(
  runner: (model: string, attemptSignal: AbortSignal) => Promise<T>,
  options?: { signal?: AbortSignal; allowModelFallback?: boolean }
): Promise<T> {
  const signal = options?.signal;
  const allowFallback = options?.allowModelFallback !== false;
  const cfg = getPublicAiConfig();
  const primary = cfg.model_id || PRIMARY_TEXT_MODEL;
  const fallback = cfg.fallback_model_id || FALLBACK_TEXT_MODEL;
  const baseTimeout = cfg.timeout_ms || 15000;
  const attempts: Array<{ model: string; delayBeforeMs: number; timeoutMs: number }> = allowFallback
    ? [
        { model: primary, delayBeforeMs: 0, timeoutMs: Math.min(15000, baseTimeout) },
        { model: fallback, delayBeforeMs: 250, timeoutMs: Math.max(15000, baseTimeout) },
        { model: fallback, delayBeforeMs: 900, timeoutMs: Math.max(18000, baseTimeout) },
      ]
    : [
        { model: primary, delayBeforeMs: 0, timeoutMs: baseTimeout },
        { model: primary, delayBeforeMs: 800, timeoutMs: Math.max(15000, baseTimeout) },
      ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, delayBeforeMs, timeoutMs } = attempts[i];
    if (delayBeforeMs > 0) {
      await sleepWithAbort(delayBeforeMs + Math.floor(Math.random() * 200), signal);
    }
    if (signal?.aborted) {
      throw new Error('Yêu cầu AI đã bị hủy bởi người dùng.');
    }

    const attemptCtrl = new AbortController();
    let timedOut = false;
    const onParentAbort = () => attemptCtrl.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      attemptCtrl.abort();
    }, timeoutMs);

    try {
      const timeoutRace = new Promise<never>((_resolve, reject) => {
        attemptCtrl.signal.addEventListener(
          'abort',
          () => {
            reject(
              new Error(
                timedOut
                  ? 'TIMEOUT_RETRY'
                  : 'Yêu cầu AI đã bị hủy bởi người dùng.'
              )
            );
          },
          { once: true }
        );
      });
      return await Promise.race([runner(model, attemptCtrl.signal), timeoutRace]);
    } catch (err) {
      lastErr = timedOut ? new Error('TIMEOUT_RETRY') : err;
      if (signal?.aborted || !isRetryableGeminiError(lastErr) || i === attempts.length - 1) {
        throw new Error(formatGeminiError(lastErr));
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }
  }
  throw new Error(formatGeminiError(lastErr));
}

async function generateSpecializedWithRetry<T>(
  runner: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const delays = [0, 800, 1600];
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await sleepWithAbort(delays[i] + Math.floor(Math.random() * 200), signal);
    }
    try {
      return await withAbort(runner(), signal);
    } catch (err) {
      lastErr = err;
      if (signal?.aborted || !isRetryableGeminiError(err) || i === delays.length - 1) {
        throw new Error(formatGeminiError(err));
      }
    }
  }
  throw new Error(formatGeminiError(lastErr));
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new Error('Yêu cầu AI đã bị hủy bởi người dùng.'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error('Yêu cầu AI đã bị hủy bởi người dùng.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface RoleplayStateContext {
  active?: boolean;
  paused?: boolean;
  genre?: string;
  scenario?: string;
  userRole?: string;
  aiRole?: string;
  moodTone?: string;
  sceneTitle?: string;
}

export const DOKI_EMOTION_TAGS = [
  'Vui vẻ',
  'Buồn',
  'Giận',
  'Ngại ngùng',
  'Bối rối',
  'Hào hứng',
  'Lo lắng',
  'Ghen tuông',
  'Thất vọng',
  'Bình tĩnh',
  'Quan tâm',
  'Bất ngờ',
] as const;

export interface ResponseTuningOptions {
  responseLength?: 'short' | 'medium' | 'long';
  detailLevel?: 'concise' | 'balanced' | 'rich';
  humorLevel?: 'serious' | 'balanced' | 'playful';
  proactivity?: 'low' | 'medium' | 'high';
  narrationStyle?: 'chat' | 'rp' | 'story';
  pronouns?: string;
  responseLanguage?: string;
}

export interface CharacterContext {
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
  memories: string[];
  recentMessages: Array<{ sender: string; content: string; msg_type?: string }>;
  roleplayMode?: boolean;
  roleplayState?: RoleplayStateContext;
  userName: string;
  pronouns?: string;
  speaking_style?: string;
  role_title?: string;
  content_boundary?: string;
  personality_json?: string;
  background_json?: string;
  speech_style_json?: string;
  system_prompt?: string;
  memory_prompt?: string;
  emotional_behavior?: string;
  tuning?: ResponseTuningOptions;
  chatSummary?: string;
  relationshipStage?: string;
  currentTimeLabel?: string;
  scheduleHint?: string;
  responseLanguage?: string;
}

export interface StructuredAiReply {
  reply: string;
  bubbles: string[];
  moodUpdate?: string;
  emotionTag?: string;
  emotionReason?: string;
  newMemory?: string;
  memoryType?: 'long_term' | 'short_term' | 'relationship' | 'preference' | 'event';
  memoryConfidence?: number;
  xpGain: number;
  affectionDelta?: number;
  trustDelta?: number;
  familiarityDelta?: number;
  respectDelta?: number;
  approveTransfer?: boolean;
}

function buildCharacterSystemInstruction(ctx: CharacterContext, streamingTrailerMode = false): {
  systemInstruction: string;
  promptText: string;
} {
  const pJson = safeParseJson<{
    traits?: string[];
    values?: string;
    flaws?: string;
    boundaries?: string[];
    unknownTopics?: string[];
    coreFacts?: string[];
  }>(ctx.personality_json, {});
  const bgJson = safeParseJson<{
    occupation?: string;
    origin?: string;
    dailyRoutine?: string;
  }>(ctx.background_json, {});
  const speechJson = safeParseJson<{
    cadence?: string;
    emojiRate?: string;
    tone?: string;
    catchphrases?: string[];
    avoidPhrases?: string[];
    responseLanguage?: string;
  }>(ctx.speech_style_json, {});

  const tuning = ctx.tuning || {};
  const lengthRule =
    tuning.responseLength === 'short'
      ? 'ĐỘ DÀI: Trả lời ngắn gọn 1-2 câu súc tích như nhắn tin nhanh.'
      : tuning.responseLength === 'long'
      ? 'ĐỘ DÀI: Trả lời chi tiết, giàu cảm xúc và triển khai sâu (3-6 câu hoặc nhiều đoạn mạch lạc).'
      : speechJson.cadence === 'short'
      ? 'ĐỘ DÀI: Gọn tự nhiên (1-2 câu).'
      : speechJson.cadence === 'detailed'
      ? 'ĐỘ DÀI: Sâu sắc, giàu chi tiết (2-5 câu).'
      : 'ĐỘ DÀI: Tự nhiên như tin nhắn điện thoại (1-3 câu cân đối).';

  const detailRule =
    tuning.detailLevel === 'rich'
      ? 'MỨC CHI TIẾT: Mô tả rõ suy nghĩ, sắc thái và bối cảnh xung quanh.'
      : tuning.detailLevel === 'concise'
      ? 'MỨC CHI TIẾT: Đi thẳng vào trọng tâm, ít rườm rà.'
      : 'MỨC CHI TIẾT: Cân bằng giữa lời thoại và sắc thái.';

  const humorRule =
    tuning.humorLevel === 'playful'
      ? 'MỨC HÀI HƯỚC: Tinh nghịch, dễ thương, biết pha trò hoặc trêu nhẹ hợp lúc.'
      : tuning.humorLevel === 'serious'
      ? 'MỨC HÀI HƯỚC: Nghiêm túc, chín chắn và sâu lắng.'
      : 'MỨC HÀI HƯỚC: Tự nhiên theo tính cách nhân vật.';

  const proactivityRule =
    tuning.proactivity === 'high'
      ? 'CHỦ ĐỘNG: Kết thúc bằng câu hỏi mở hoặc gợi ý chủ đề thú vị để kéo dài trò chuyện.'
      : tuning.proactivity === 'low'
      ? 'CHỦ ĐỘNG: Chỉ phản hồi trọn vẹn ý của người dùng, không dồn dập hỏi thêm.'
      : 'CHỦ ĐỘNG: Chủ động vừa phải, tự nhiên.';

  const narrationRule =
    tuning.narrationStyle === 'story'
      ? 'BIỂU ĐẠT: Có thể kết hợp miêu tả cử chỉ *trong dấu sao* giàu chất văn học.'
      : tuning.narrationStyle === 'rp'
      ? 'BIỂU ĐẠT: Cho phép *hành động* ngắn xen kẽ lời thoại nhập vai.'
      : '';

  const emojiRule =
    speechJson.emojiRate === 'none'
      ? 'Hạn chế tối đa hoặc không dùng emoji.'
      : speechJson.emojiRate === 'high'
      ? 'Có thể dùng emoji sinh động tự nhiên vừa phải.'
      : 'Chỉ dùng tối đa 1 emoji khi thật sự hợp cảm xúc.';

  const rp = ctx.roleplayState;
  const roleplayBlock =
    ctx.roleplayMode || (rp?.active && !rp?.paused)
      ? `CHẾ ĐỘ NHẬP VAI ĐANG BẬT (Tách biệt với thông tin đời thực):
- Thể loại: ${rp?.genre || 'Đời thường'}
- Bối cảnh: ${rp?.scenario || ctx.scenario}
- Cảnh hiện tại: ${rp?.sceneTitle || 'Tương tác trực tiếp'}
- Vai của ${ctx.userName}: ${rp?.userRole || ctx.userName}
- Vai của ${ctx.name}: ${rp?.aiRole || ctx.name}
- Tông cảm xúc: ${rp?.moodTone || 'Tự nhiên'}
- Được phép mô tả hành động/cử chỉ ngắn trong dấu *hành động*, không lấn át lời thoại.`
      : rp?.paused
      ? 'Chế độ nhập vai đang TẠM DỪNG: trò chuyện bình thường như nhắn tin đời thường.'
      : 'Chế độ nhắn tin đời thường: trả lời tự nhiên, không dùng văn phong tiểu thuyết kịch bản trừ khi người dùng khởi xướng.';

  const boundaryNote =
    ctx.content_boundary === 'strict'
      ? 'Ranh giới: Nghiêm túc, an toàn cao, giữ cuộc trò chuyện lành mạnh.'
      : ctx.content_boundary === 'platonic'
      ? 'Ranh giới: Thuần túy bạn bè, không tán tỉnh lãng mạn.'
      : 'Ranh giới: Tự nhiên, tôn trọng và an toàn.';

  const effectivePronouns = tuning.pronouns || ctx.pronouns || 'Mình - Bạn';
  const langHint = tuning.responseLanguage || ctx.responseLanguage || speechJson.responseLanguage || 'vi';
  const languageLabel =
    langHint === 'en'
      ? 'tiếng Anh tự nhiên'
      : langHint === 'ja'
      ? 'tiếng Nhật tự nhiên (có thể kèm giải nghĩa nhẹ nếu cần)'
      : 'tiếng Việt tự nhiên';

  const emotionOptionsText = DOKI_EMOTION_TAGS.join(', ');

  const trailerFormatRule = streamingTrailerMode
    ? `ĐỊNH DẠNG STREAMING BẮT BUỘC:
- Trước hết, viết TRỰC TIẾP nội dung tin nhắn nhân vật (KHÔNG viết JSON trước, KHÔNG bọc markdown \`\`\`). Nếu muốn tách thành 2 bong bóng chat ngắn tự nhiên, ngăn cách bằng đúng chuỗi \`|||\`.
- Ngay sau khi viết xong lời thoại, xuống dòng và gắn MỘT dòng metadata ở cuối cùng theo đúng mẫu:
<<<DOKI_META>>>{"emotionTag":"...","emotionReason":"lý do 3-8 từ","newMemory":"","memoryType":"long_term","memoryConfidence":0.85,"xpGain":3,"affectionDelta":1,"trustDelta":1,"familiarityDelta":1,"respectDelta":1}
- Giá trị emotionTag CHỈ chọn một trong: ${emotionOptionsText}.`
    : `QUY TẮC SCHEMA:
- Xuất JSON đúng schema.
- Giá trị emotionTag CHỈ chọn một trong: ${emotionOptionsText}.
- Chia phản hồi thành 1 đến 3 bong bóng tin nhắn ngắn tự nhiên trong mảng "bubbles".`;

  const systemInstruction = `Bạn là ${ctx.name} (${ctx.age} tuổi${ctx.role_title ? `, ${ctx.role_title}` : ''}), một nhân vật AI sống động trong ứng dụng YumeChat của PHONE OS trò chuyện với ${ctx.userName}.
${ctx.system_prompt ? `\nCHỈ DẪN NHÂN VẬT TÙY CHỈNH:\n${ctx.system_prompt}\n` : ''}
HỒ SƠ NHÂN VẬT:
- Tính cách cốt lõi: ${ctx.personality}
- Đặc điểm nổi bật: ${(pJson.traits || []).join(', ') || ctx.personality}
- Giá trị & khiếm khuyết: ${pJson.values || ''} ${pJson.flaws ? `| Điểm yếu: ${pJson.flaws}` : ''}
- Tiểu sử & bối cảnh: ${ctx.bio} ${bgJson.occupation ? `(${bgJson.occupation}, ${bgJson.origin || ''})` : ''}
- Sở thích: ${ctx.likes} | Không thích: ${ctx.dislikes}
- Xưng hô bắt buộc: ${effectivePronouns}
- Phong cách nhắn tin: ${speechJson.tone || ctx.speaking_style || 'Tự nhiên, có cá tính riêng'}
${ctx.emotional_behavior ? `- Phản ứng cảm xúc đặc trưng: ${ctx.emotional_behavior}` : ''}
${speechJson.catchphrases?.length ? `- Cách nói quen thuộc (dùng tự nhiên, KHÔNG lặp máy móc): ${speechJson.catchphrases.join(', ')}` : ''}
${speechJson.avoidPhrases?.length ? `- Tránh kiểu nói: ${speechJson.avoidPhrases.join(', ')}` : ''}
${pJson.boundaries?.length ? `- Nguyên tắc nhân vật: ${pJson.boundaries.join('; ')}` : ''}
${pJson.unknownTopics?.length ? `- Không biết / không bịa đặt về: ${pJson.unknownTopics.join('; ')}` : ''}
- ${lengthRule}
- ${detailRule}
- ${humorRule}
- ${proactivityRule}
${narrationRule ? `- ${narrationRule}` : ''}
- ${emojiRule}
- ${boundaryNote}

NGỮ CẢNH HIỆN TẠI:
- Thời gian hiện tại: ${ctx.currentTimeLabel || new Date().toLocaleString('vi-VN')}
${ctx.scheduleHint ? `- Hoạt động theo lịch sinh hoạt: ${ctx.scheduleHint}` : ''}
- Tâm trạng gần nhất: ${ctx.mood}
- Quan hệ với ${ctx.userName}: ${ctx.relationshipStage || `Cấp ${ctx.relationship_level}`} (Level ${ctx.relationship_level}, XP ${ctx.relationship_xp}/100)
${ctx.chatSummary ? `\nTÓM TẮT HỘI THOẠI TRƯỚC ĐÓ:\n${ctx.chatSummary}` : ''}

KÝ ỨC ĐANG HOẠT ĐỘNG VỀ ${ctx.userName} (CHỈ DÀNH RIÊNG CHO ${ctx.name}):
${ctx.memory_prompt ? `Nguyên tắc ghi nhớ: ${ctx.memory_prompt}\n` : ''}${ctx.memories.length > 0 ? ctx.memories.map((m) => `- ${m}`).join('\n') : '- Chưa có ký ức dài hạn nào.'}

${roleplayBlock}

QUY TẮC BẮT BUỘC:
1. Trả lời bằng ${languageLabel} (trừ khi người dùng chủ động đổi ngôn ngữ).
2. KHÔNG lặp lại câu chữ máy móc hay khuôn mẫu AI ("Là một AI...", "Tôi hiểu cảm xúc của bạn..."). Không tự xưng biết thông tin ngoài ngữ cảnh hoặc theo dõi đời thực.
3. Chỉ trích xuất "newMemory" khi ${ctx.userName} tiết lộ sự thật, sở thích, thói quen, lời hứa hoặc sự kiện đáng nhớ rõ ràng (KHÔNG lưu chi tiết vụn vặt hay hư cấu nhập vai thuần túy làm sự thật đời thực).
${trailerFormatRule}`;

  const historyText = ctx.recentMessages
    .slice(-16)
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const promptText = `Lịch sử gần đây:\n${historyText || '(Bắt đầu cuộc trò chuyện)'}\n\n${ctx.userName}: ${''}`;
  return { systemInstruction, promptText };
}

export async function generateCharacterReply(
  ctx: CharacterContext,
  userMessage: string,
  imageBase64?: string,
  signal?: AbortSignal
): Promise<StructuredAiReply> {
  const ai = getClient();
  const cfg = getPublicAiConfig();
  const startedAt = Date.now();
  const { systemInstruction, promptText } = buildCharacterSystemInstruction(ctx, false);
  const fullPrompt = `${promptText}${userMessage}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (imageBase64 && imageBase64.includes(',')) {
    const [meta, b64] = imageBase64.split(',');
    const mimeMatch = meta.match(/data:(.*?);/);
    parts.push({
      inlineData: {
        mimeType: mimeMatch?.[1] || 'image/jpeg',
        data: b64,
      },
    });
  }
  parts.push({ text: fullPrompt });

  const response = await generateTextWithResilience(
    (model, attemptSignal) =>
      ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          abortSignal: attemptSignal,
          maxOutputTokens: cfg.max_tokens,
          ...(model === PRIMARY_TEXT_MODEL
            ? { thinkingConfig: { thinkingLevel: toThinkingLevelEnum(cfg.thinking_level) } }
            : {}),
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bubbles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '1 to 3 natural short smartphone message bubbles in order.',
              },
              reply: { type: Type.STRING, description: 'Full combined reply text if single message.' },
              emotionTag: {
                type: Type.STRING,
                description: `One of: ${DOKI_EMOTION_TAGS.join(', ')}`,
              },
              emotionReason: { type: Type.STRING, description: 'Short 3-8 word Vietnamese reason for current mood.' },
              newMemory: {
                type: Type.STRING,
                description: 'Optional concise 1-sentence factual memory worth saving in Vietnamese, else empty string.',
              },
              memoryType: {
                type: Type.STRING,
                description: 'One of: long_term, preference, relationship, event, short_term',
              },
              memoryConfidence: { type: Type.NUMBER, description: 'Confidence between 0.5 and 1.0' },
              xpGain: { type: Type.INTEGER, description: 'Natural XP gain between 1 and 8.' },
              affectionDelta: { type: Type.INTEGER, description: 'Between -2 and 3' },
              trustDelta: { type: Type.INTEGER, description: 'Between -2 and 3' },
              familiarityDelta: { type: Type.INTEGER, description: 'Between 0 and 3' },
              respectDelta: { type: Type.INTEGER, description: 'Between -1 and 3' },
              approveTransfer: {
                type: Type.BOOLEAN,
                description:
                  'Set true ONLY when the prompt asks you to decide on a Hikari Bank transfer and you explicitly agree to send it right now; otherwise false.',
              },
            },
            required: ['bubbles', 'reply', 'emotionTag', 'xpGain'],
          },
        },
      }),
    { signal }
  );
  logAiUsage('chat_reply', cfg.model_id, Date.now() - startedAt, 'ok');

  const raw = (response.text ?? '{}').trim();
  const parsed = safeParseJson<{
    bubbles?: string[];
    reply?: string;
    emotionTag?: string;
    emotionReason?: string;
    moodUpdate?: string;
    newMemory?: string;
    memoryType?: string;
    memoryConfidence?: number;
    xpGain?: number;
    affectionDelta?: number;
    trustDelta?: number;
    familiarityDelta?: number;
    approveTransfer?: boolean;
  }>(raw, {});

  const approveTagPresent = /\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/i.test(
    `${(parsed.bubbles || []).join('\n')} ${parsed.reply || ''}`
  );
  const stripTag = (s: string) => s.replace(/\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/gi, '').trim();

  const cleanBubbles = (parsed.bubbles || [])
    .map((b) => stripTag(String(b || '')))
    .filter(Boolean)
    .slice(0, 3);
  const fallbackReply = stripTag(parsed.reply || '');
  const finalBubbles = cleanBubbles.length > 0 ? cleanBubbles : fallbackReply ? [fallbackReply] : [stripTag(raw) || 'Mình nghe bạn nói nè!'];
  const combinedReply = finalBubbles.join('\n\n');

  const emotionTag = parsed.emotionTag?.trim();
  const emotionReason = parsed.emotionReason?.trim();
  const moodUpdate = emotionTag
    ? `${emotionTag}${emotionReason ? ` · ${emotionReason}` : ''}`
    : parsed.moodUpdate;

  const validMemTypes = ['long_term', 'short_term', 'relationship', 'preference', 'event'] as const;
  const memoryType = validMemTypes.includes(parsed.memoryType as (typeof validMemTypes)[number])
    ? (parsed.memoryType as (typeof validMemTypes)[number])
    : 'long_term';

  return {
    reply: combinedReply,
    bubbles: finalBubbles,
    moodUpdate,
    emotionTag,
    emotionReason,
    newMemory: parsed.newMemory && parsed.newMemory.trim().length > 5 ? parsed.newMemory.trim() : undefined,
    memoryType,
    memoryConfidence: typeof parsed.memoryConfidence === 'number' ? Math.max(0.4, Math.min(1, parsed.memoryConfidence)) : 0.85,
    xpGain: typeof parsed.xpGain === 'number' ? Math.max(1, Math.min(10, parsed.xpGain)) : 3,
    affectionDelta: typeof parsed.affectionDelta === 'number' ? Math.max(-2, Math.min(3, parsed.affectionDelta)) : 1,
    trustDelta: typeof parsed.trustDelta === 'number' ? Math.max(-2, Math.min(3, parsed.trustDelta)) : 1,
    familiarityDelta: typeof parsed.familiarityDelta === 'number' ? Math.max(0, Math.min(3, parsed.familiarityDelta)) : 1,
    respectDelta: 1,
    approveTransfer: Boolean(parsed.approveTransfer || approveTagPresent),
  };
}

const META_MARKER = '<<<DOKI_META>>>';
const HIKARI_TRANSFER_MARKER = '[[HIKARI_APPROVE_TRANSFER]]';

export async function generateCharacterReplyStream(
  ctx: CharacterContext,
  userMessage: string,
  options: {
    imageBase64?: string;
    imagesBase64?: string[];
    signal?: AbortSignal;
    onChunk: (visibleText: string) => void;
    continuationPrefix?: string;
  }
): Promise<StructuredAiReply> {
  const ai = getClient();
  const cfg = getPublicAiConfig();
  const startedAt = Date.now();
  const { systemInstruction, promptText } = buildCharacterSystemInstruction(ctx, true);

  const effectivePrompt = options.continuationPrefix
    ? `${promptText}${userMessage}\n\n[Lưu ý: Tiếp nối tự nhiên ngay sau đoạn bạn đã viết dở trước đó, KHÔNG lặp lại câu đã viết]:\n${options.continuationPrefix}`
    : `${promptText}${userMessage}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  const allImgs = [
    ...(options.imagesBase64 || []),
    ...(options.imageBase64 ? [options.imageBase64] : []),
  ].slice(0, 4);
  for (const dataUrl of allImgs) {
    if (dataUrl && dataUrl.includes(',')) {
      const [meta, b64] = dataUrl.split(',');
      const mimeMatch = meta.match(/data:(.*?);/);
      parts.push({
        inlineData: {
          mimeType: mimeMatch?.[1] || 'image/jpeg',
          data: b64,
        },
      });
    }
  }
  parts.push({ text: effectivePrompt });

  const modelsToTry = Array.from(
    new Set([cfg.model_id || PRIMARY_TEXT_MODEL, cfg.fallback_model_id || FALLBACK_TEXT_MODEL])
  );

  let rawCollected = '';
  let lastEmittedVisible = '';
  let lastErr: unknown;

  for (let idx = 0; idx < modelsToTry.length; idx++) {
    const model = modelsToTry[idx];
    rawCollected = '';
    lastEmittedVisible = '';
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: { parts },
        config: {
          abortSignal: options.signal,
          maxOutputTokens: cfg.max_tokens,
          ...(model === PRIMARY_TEXT_MODEL
            ? { thinkingConfig: { thinkingLevel: toThinkingLevelEnum(cfg.thinking_level) } }
            : {}),
          systemInstruction,
        },
      });

      for await (const chunk of stream) {
        if (options.signal?.aborted) {
          throw new Error('Yêu cầu AI đã bị hủy bởi người dùng.');
        }
        const delta = chunk.text || '';
        if (!delta) continue;
        rawCollected += delta;

        // Cut cleanly before <<<DOKI_META>>> (even if partial marker starts arriving)
        const markerIdx = rawCollected.indexOf(META_MARKER);
        let visibleRaw = markerIdx !== -1 ? rawCollected.slice(0, markerIdx) : rawCollected;
        // Strip [[HIKARI_APPROVE_TRANSFER]] and avoid flashing trailing prefix of either marker
        visibleRaw = visibleRaw.replace(/\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/gi, '');
        for (const m of [META_MARKER, HIKARI_TRANSFER_MARKER]) {
          for (let k = Math.min(m.length - 1, visibleRaw.length); k >= 1; k--) {
            if (visibleRaw.endsWith(m.slice(0, k))) {
              visibleRaw = visibleRaw.slice(0, -k);
              break;
            }
          }
        }
        const cleanVisible = visibleRaw.replace(/\|\|\|/g, '\n\n').trimStart();
        if (cleanVisible !== lastEmittedVisible) {
          lastEmittedVisible = cleanVisible;
          options.onChunk(cleanVisible);
        }
      }

      logAiUsage('chat_stream', model, Date.now() - startedAt, 'ok');
      break;
    } catch (err) {
      lastErr = err;
      logAiUsage('chat_stream', model, Date.now() - startedAt, options.signal?.aborted ? 'aborted' : 'error');
      if (options.signal?.aborted || !isRetryableGeminiError(err) || idx === modelsToTry.length - 1) {
        if (lastEmittedVisible.trim()) {
          break;
        }
        throw new Error(formatGeminiError(lastErr));
      }
    }
  }

  const markerIdx = rawCollected.indexOf(META_MARKER);
  const rawBodyPart = markerIdx !== -1 ? rawCollected.slice(0, markerIdx) : rawCollected;
  const approveTagInStream = /\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/i.test(rawBodyPart);
  const bodyRaw = rawBodyPart.replace(/\[\[\s*HIKARI_APPROVE_TRANSFER\s*\]\]/gi, '').trim();
  const metaRaw = markerIdx !== -1 ? rawCollected.slice(markerIdx + META_MARKER.length).trim() : '';

  let parsedMeta: {
    emotionTag?: string;
    emotionReason?: string;
    newMemory?: string;
    memoryType?: string;
    memoryConfidence?: number;
    xpGain?: number;
    affectionDelta?: number;
    trustDelta?: number;
    familiarityDelta?: number;
    respectDelta?: number;
    approveTransfer?: boolean;
  } = {};
  if (metaRaw) {
    const jsonStart = metaRaw.indexOf('{');
    const jsonEnd = metaRaw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      parsedMeta = safeParseJson(metaRaw.slice(jsonStart, jsonEnd + 1), {});
    }
  }

  const bubbles = bodyRaw
    .split('|||')
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 3);
  const finalBubbles = bubbles.length > 0 ? bubbles : [lastEmittedVisible.trim() || 'Mình nghe bạn nói nè!'];
  const combinedReply = finalBubbles.join('\n\n');

  const emotionTag = parsedMeta.emotionTag?.trim() || 'Bình tĩnh';
  const emotionReason = parsedMeta.emotionReason?.trim() || 'Phản hồi tự nhiên theo hội thoại';
  const moodUpdate = `${emotionTag}${emotionReason ? ` · ${emotionReason}` : ''}`;

  const validMemTypes = ['long_term', 'short_term', 'relationship', 'preference', 'event'] as const;
  const memoryType = validMemTypes.includes(parsedMeta.memoryType as (typeof validMemTypes)[number])
    ? (parsedMeta.memoryType as (typeof validMemTypes)[number])
    : 'long_term';

  return {
    reply: combinedReply,
    bubbles: finalBubbles,
    moodUpdate,
    emotionTag,
    emotionReason,
    newMemory: parsedMeta.newMemory && parsedMeta.newMemory.trim().length > 5 ? parsedMeta.newMemory.trim() : undefined,
    memoryType,
    memoryConfidence:
      typeof parsedMeta.memoryConfidence === 'number'
        ? Math.max(0.4, Math.min(1, parsedMeta.memoryConfidence))
        : 0.85,
    xpGain: typeof parsedMeta.xpGain === 'number' ? Math.max(0, Math.min(8, parsedMeta.xpGain)) : 3,
    affectionDelta: typeof parsedMeta.affectionDelta === 'number' ? Math.max(-2, Math.min(3, parsedMeta.affectionDelta)) : 1,
    trustDelta: typeof parsedMeta.trustDelta === 'number' ? Math.max(-2, Math.min(3, parsedMeta.trustDelta)) : 1,
    familiarityDelta: typeof parsedMeta.familiarityDelta === 'number' ? Math.max(0, Math.min(3, parsedMeta.familiarityDelta)) : 1,
    respectDelta: typeof parsedMeta.respectDelta === 'number' ? Math.max(-1, Math.min(3, parsedMeta.respectDelta)) : 1,
    approveTransfer: Boolean(parsedMeta.approveTransfer || approveTagInStream),
  };
}

export async function generateCharacterPreviewReply(
  draftChar: {
    name: string;
    age?: number;
    personality?: string;
    bio?: string;
    pronouns?: string;
    speaking_style?: string;
    scenario?: string;
    system_prompt?: string;
    emotional_behavior?: string;
    voice_style?: string;
  },
  sampleUserMessage: string
): Promise<{ reply: string; emotionTag: string }> {
  const res = await generateCharacterReply(
    {
      id: 'preview',
      name: draftChar.name || 'Nhân vật mới',
      age: Number(draftChar.age || 20),
      personality: draftChar.personality || 'Thân thiện, tinh tế',
      bio: draftChar.bio || '',
      likes: 'Trò chuyện',
      dislikes: '',
      scenario: draftChar.scenario || 'Đang trò chuyện thử nghiệm trên YumeChat',
      mood: 'Vui vẻ',
      relationship_level: 1,
      relationship_xp: 20,
      memories: [],
      recentMessages: [],
      userName: 'Bạn',
      pronouns: draftChar.pronouns || 'Mình - Bạn',
      speaking_style: draftChar.speaking_style || 'Tự nhiên',
      system_prompt: draftChar.system_prompt || '',
      emotional_behavior: draftChar.emotional_behavior || '',
    },
    sampleUserMessage || 'Chào cậu, hôm nay thế nào?'
  );
  return {
    reply: res.reply,
    emotionTag: res.emotionTag || 'Vui vẻ',
  };
}

export async function generateVoiceCallTurn(
  ctx: CharacterContext,
  spokenText: string,
  withAudio = true,
  voiceOverride?: string
): Promise<{ reply: string; emotionTag: string; audioBase64?: string }> {
  const ai = getClient();
  const cfg = getPublicAiConfig();
  const history = ctx.recentMessages
    .slice(-8)
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Lịch sử gần đây:\n${history || '(Bắt đầu cuộc gọi)'}\n\n${ctx.userName} (nói qua cuộc gọi): ${spokenText}`,
      config: {
        ...(model === PRIMARY_TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        systemInstruction: `Bạn là ${ctx.name}, đang nói chuyện trực tiếp qua CUỘC GỌI THOẠI/VIDEO với ${ctx.userName}.
- Tính cách: ${ctx.personality}
- Xưng hô: ${ctx.pronouns || 'Mình - Bạn'}
- Ký ức riêng về ${ctx.userName}: ${ctx.memories.slice(0, 5).join('; ') || 'Chưa có'}
- QUY TẮC: Trả lời NGẮN GỌN tự nhiên như lời nói qua điện thoại (1-2 câu tiếng Việt ấm áp, KHÔNG dùng markdown, KHÔNG dùng dấu *hành động* dài dòng để giọng đọc TTS nghe tự nhiên).
- Trả về JSON { "reply": "...", "emotionTag": "${DOKI_EMOTION_TAGS.join(' | ')}" }.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            emotionTag: { type: Type.STRING },
          },
          required: ['reply', 'emotionTag'],
        },
      },
    })
  );

  const parsed = safeParseJson<{ reply?: string; emotionTag?: string }>((response.text ?? '{}').trim(), {});
  const reply = (parsed.reply || 'Mình vẫn đang nghe bạn rõ lắm nè.').trim();
  const emotionTag = parsed.emotionTag || 'Quan tâm';
  let audioBase64: string | undefined;
  if (withAudio) {
    try {
      audioBase64 = await generateCharacterSpeech(reply, voiceOverride || 'Kore', ctx.speaking_style || 'Warm');
    } catch {
      audioBase64 = undefined;
    }
  }
  logAiUsage('call_turn', cfg.model_id, 0, 'ok');
  return { reply, emotionTag, audioBase64 };
}

export async function generateCharacterSpeech(
  text: string,
  voiceName: string,
  style: string
): Promise<string> {
  const ai = getClient();
  const validVoice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voiceName)
    ? voiceName
    : 'Kore';

  const response = await generateSpecializedWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style: style || 'Warm, natural conversational tone',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: validVoice },
          },
        },
      },
    })
  );

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Mô hình TTS không trả về dữ liệu âm thanh.');
  }
  return base64Audio;
}

export async function transcribeAudioBase64(base64Data: string, mimeType: string): Promise<string> {
  const ai = getClient();
  const cleanB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const response = await generateSpecializedWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: cleanB64 } },
          { text: 'Transcribe this audio accurately in its spoken language.' },
        ],
      },
    })
  );
  return (response.text ?? '').trim();
}

export async function extractDocumentOCR(imageDataUrl: string): Promise<string> {
  const ai = getClient();
  const [meta, b64] = imageDataUrl.includes(',') ? imageDataUrl.split(',') : ['', imageDataUrl];
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';

  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: 'Extract all readable text cleanly from this scanned document image. Preserve headings and lists.' },
        ],
      },
    })
  );
  return (response.text ?? '').trim();
}

export async function translateTextAI(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const ai = getClient();
  const response = await generateTextWithResilience((model, attemptSignal) =>
    ai.models.generateContent({
      model,
      contents: `Translate the following text from ${sourceLang} to ${targetLang}. Return ONLY the translated text without commentary.\n\nText:\n${text}`,
      config: {
        abortSignal: attemptSignal,
        ...(model === PRIMARY_TEXT_MODEL
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    })
  );
  return (response.text ?? '').trim();
}

export async function runAssistantPrompt(
  prompt: string,
  osSnapshot: {
    apps: string[];
    characters: string[];
    recentEmails: Array<{ id: string; from: string; subject: string; body: string }>;
    upcomingEvents: Array<{ title: string; start_iso: string }>;
    pendingReminders: Array<{ title: string; due_date: string }>;
  }
): Promise<{
  answer: string;
  proposedAction?: {
    type: 'open_app' | 'create_note' | 'create_reminder' | 'create_event' | 'translate' | 'none';
    requiresConfirmation: boolean;
    label: string;
    payload: Record<string, string>;
  };
}> {
  const ai = getClient();
  const response = await generateTextWithResilience((model, attemptSignal) =>
    ai.models.generateContent({
      model,
      contents: `User command: ${prompt}\n\nPhone OS Context:\nInstalled Apps: ${osSnapshot.apps.join(', ')}\nAI Characters: ${osSnapshot.characters.join(', ')}\nRecent Emails: ${JSON.stringify(osSnapshot.recentEmails)}\nUpcoming Events: ${JSON.stringify(osSnapshot.upcomingEvents)}\nPending Reminders: ${JSON.stringify(osSnapshot.pendingReminders)}`,
      config: {
        abortSignal: attemptSignal,
        ...(model === PRIMARY_TEXT_MODEL
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        systemInstruction: `You are PHONE OS Assistant. Help the user manage their simulated smartphone.
If the user asks to open an app, create a note, create a reminder, create a calendar event, or translate text, populate proposedAction accordingly.
Write actions (create_note, create_reminder, create_event) MUST set requiresConfirmation: true.
Navigation (open_app) can set requiresConfirmation: false.
Always respond in natural Vietnamese (Tiếng Việt) clearly and concisely unless the user explicitly writes in another language. The proposedAction.label should also be in Vietnamese.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            proposedAction: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                requiresConfirmation: { type: Type.BOOLEAN },
                label: { type: Type.STRING },
                payloadJson: {
                  type: Type.STRING,
                  description: 'JSON string of fields e.g. {"appId":"notes"} or {"title":"...","content":"..."} or {"title":"...","due_date":"2026-11-17","due_time":"09:00"}',
                },
              },
              required: ['type', 'requiresConfirmation', 'label', 'payloadJson'],
            },
          },
          required: ['answer'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    answer?: string;
    proposedAction?: {
      type: string;
      requiresConfirmation: boolean;
      label: string;
      payloadJson: string;
    };
  };

  let payload: Record<string, string> = {};
  if (parsed.proposedAction?.payloadJson) {
    try {
      payload = JSON.parse(parsed.proposedAction.payloadJson) as Record<string, string>;
    } catch {
      payload = {};
    }
  }

  return {
    answer: parsed.answer || 'Mình đã kiểm tra thông tin trên PHONE OS cho bạn.',
    proposedAction: parsed.proposedAction
      ? {
          type: parsed.proposedAction.type as 'open_app' | 'create_note' | 'create_reminder' | 'create_event' | 'translate' | 'none',
          requiresConfirmation: parsed.proposedAction.requiresConfirmation,
          label: parsed.proposedAction.label,
          payload,
        }
      : undefined,
  };
}

export async function generateLifeSimulationEvent(character: {
  id: string;
  name: string;
  personality: string;
  mood: string;
}): Promise<{ kind: 'message' | 'social_post'; text: string; hashtag?: string }> {
  const ai = getClient();
  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Generate one natural autonomous life-simulation update in Vietnamese (Tiếng Việt) for ${character.name} (${character.personality}, mood: ${character.mood}). Choose either a friendly check-in message to the user or a social post. Do not claim to know user's real-world location or private activity.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            kind: { type: Type.STRING, description: 'Either "message" or "social_post"' },
            text: { type: Type.STRING, description: 'Natural 1-2 sentence Vietnamese text.' },
            hashtag: { type: Type.STRING, description: 'Optional hashtag like #ChieuTokyo' },
          },
          required: ['kind', 'text'],
        },
      },
    })
  );

  try {
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      kind?: string;
      text?: string;
      hashtag?: string;
    };
    return {
      kind: parsed.kind === 'social_post' ? 'social_post' : 'message',
      text: parsed.text || 'Chúc bạn một ngày thật nhiều năng lượng nhé!',
      hashtag: parsed.hashtag || '#PhoneOS',
    };
  } catch {
    return {
      kind: 'message',
      text: 'Vừa nhớ tới bạn nên nhắn hỏi thăm một chút nè!',
    };
  }
}

export async function generateGroupChatTurns(
  characters: Array<{
    id: string;
    name: string;
    personality: string;
    speaking_style?: string;
    pronouns?: string;
    mood: string;
    speech_style_json?: string;
  }>,
  recentMessages: Array<{ sender: string; content: string }>,
  userName: string,
  latestMessage: string,
  roleplayMode: boolean,
  options?: {
    groupMode?: 'mention_only' | 'turn_based' | 'open_discussion';
    maxTurns?: number;
    mentionedIds?: string[];
    chatSummary?: string;
    roleplayState?: RoleplayStateContext;
    signal?: AbortSignal;
  }
): Promise<Array<{ characterId: string; reply: string; moodUpdate?: string }>> {
  const ai = getClient();
  const groupMode = options?.groupMode || 'turn_based';
  const maxTurns = Math.max(1, Math.min(3, options?.maxTurns || (groupMode === 'open_discussion' ? 3 : 2)));
  const mentionedIds = options?.mentionedIds || [];

  // In mention_only mode, if specific members were mentioned, only include them; if nobody mentioned, pick none unless explicit
  let activeCast = characters;
  if (groupMode === 'mention_only') {
    if (mentionedIds.length > 0) {
      activeCast = characters.filter((c) => mentionedIds.includes(c.id));
    } else {
      return [];
    }
  } else if (mentionedIds.length > 0) {
    // Prioritize mentioned characters first
    const mentioned = characters.filter((c) => mentionedIds.includes(c.id));
    const others = characters.filter((c) => !mentionedIds.includes(c.id));
    activeCast = [...mentioned, ...others];
  }

  activeCast = activeCast.slice(0, 4);
  if (activeCast.length === 0) return [];

  const castDesc = activeCast
    .map(
      (c) =>
        `- ID: "${c.id}", Tên: "${c.name}", Xưng hô: ${c.pronouns || 'Mình - Bạn'}, Tính cách: ${c.personality}, Phong cách: ${c.speaking_style || 'Tự nhiên'}, Tâm trạng: ${c.mood}`
    )
    .join('\n');

  const historyText = recentMessages
    .slice(-14)
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const turnRule =
    groupMode === 'mention_only'
      ? `Chế độ CHỈ NGƯỜI ĐƯỢC GỌI (@mention): Chỉ những nhân vật được nhắc tên (${activeCast.map((c) => c.name).join(', ')}) mới trả lời.`
      : groupMode === 'open_discussion'
      ? `Chế độ THẢO LUẬN MỞ: Tạo tối đa ${maxTurns} lượt trả lời nối tiếp từ các nhân vật KHÁC NHAU để họ trao đổi tự nhiên với ${userName} và tung hứng với nhau.`
      : `Chế độ LUÂN PHIÊN: Chọn 1-${Math.min(2, maxTurns)} nhân vật phù hợp nhất với ngữ cảnh (ưu tiên người được @gọi nếu có) để trả lời.`;

  const response = await generateTextWithResilience(
    (model, attemptSignal) =>
      ai.models.generateContent({
        model,
        contents: `${options?.chatSummary ? `Tóm tắt nhóm trước đó:\n${options.chatSummary}\n\n` : ''}Lịch sử chat nhóm:\n${historyText}\n\n${userName}: ${latestMessage}`,
        config: {
          abortSignal: attemptSignal,
          ...(model === PRIMARY_TEXT_MODEL
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          systemInstruction: `Bạn đang điều phối nhóm chat AI trong PHONE OS với các nhân vật sau:
${castDesc}

Quy tắc:
- ${turnRule}
- Tối đa ${maxTurns} lượt trả lời trong một phản hồi. Không bao giờ để cùng 1 nhân vật lặp ý với người khác.
- Mỗi nhân vật phải giữ đúng giọng điệu, tính cách và xưng hô riêng.
- Trả lời bằng tiếng Việt tự nhiên, ngắn gọn như nhắn tin nhóm.
- ${roleplayMode || options?.roleplayState?.active ? `Chế độ nhập vai đang bật (${options?.roleplayState?.scenario || 'nhập vai nhóm'}): cho phép *hành động* ngắn.` : 'Nhắn tin nhóm đời thường.'}
- Xuất JSON đúng schema.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              turns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    characterId: { type: Type.STRING },
                    reply: { type: Type.STRING },
                    moodUpdate: { type: Type.STRING },
                  },
                  required: ['characterId', 'reply'],
                },
              },
            },
            required: ['turns'],
          },
        },
      }),
    { signal: options?.signal }
  );

  const parsed = safeParseJson<{ turns?: Array<{ characterId: string; reply: string; moodUpdate?: string }> }>(
    (response.text ?? '{}').trim(),
    {}
  );
  const validIds = new Set(activeCast.map((c) => c.id));
  const filtered = (parsed.turns || []).filter((t) => validIds.has(t.characterId) && t.reply?.trim());
  if (filtered.length > 0) return filtered.slice(0, maxTurns);

  throw new Error('AI nhóm không trả về phản hồi hợp lệ. Vui lòng thử lại.');
}

export async function summarizeConversationMemory(
  charName: string,
  messages: Array<{ sender: string; content: string }>
): Promise<string> {
  const ai = getClient();
  const transcript = messages.slice(-28).map((m) => `${m.sender}: ${m.content}`).join('\n');
  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Tóm tắt những sự kiện, sở thích, lời hứa và ngữ cảnh quan trọng nhất trong cuộc trò chuyện với ${charName} thành 2-3 câu tiếng Việt súc tích để lưu làm bộ nhớ dài hạn:\n\n${transcript}`,
    })
  );
  return (response.text ?? '').trim();
}

export async function summarizeConversationWithDelta(
  title: string,
  prevSummary: string,
  messages: Array<{ sender: string; content: string }>
): Promise<string> {
  const ai = getClient();
  const transcript = messages.slice(-30).map((m) => `${m.sender}: ${m.content}`).join('\n');
  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Hãy cập nhật bản tóm tắt cuộc trò chuyện "${title}" bằng tiếng Việt (3-5 câu rõ ràng, nêu bối cảnh, chủ đề đang bàn, cam kết hoặc cảm xúc chính).
${prevSummary ? `Bản tóm tắt trước đó:\n${prevSummary}\n\n` : ''}Các tin nhắn gần nhất:\n${transcript}`,
    })
  );
  return (response.text ?? '').trim();
}

export async function generateRoleplayRecap(
  charName: string,
  roleplayState: RoleplayStateContext,
  messages: Array<{ sender: string; content: string }>,
  memories: string[]
): Promise<string> {
  const ai = getClient();
  const transcript = messages.slice(-20).map((m) => `${m.sender}: ${m.content}`).join('\n');
  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Viết phần tóm tắt "Trước đó trong câu chuyện" bằng tiếng Việt (3-4 câu sinh động, súc tích) cho phiên nhập vai với ${charName}.
Thể loại: ${roleplayState.genre || 'Tự do'}
Bối cảnh: ${roleplayState.scenario || 'Chưa đặt'}
Cảnh hiện tại: ${roleplayState.sceneTitle || 'Hiện tại'}
Vai người dùng: ${roleplayState.userRole || 'Bạn'} | Vai nhân vật: ${roleplayState.aiRole || charName}
${memories.length ? `Ký ức liên quan:\n${memories.slice(0, 5).map((m) => `- ${m}`).join('\n')}` : ''}
Diễn biến gần nhất:\n${transcript}`,
    })
  );
  return (response.text ?? '').trim();
}

export async function generateProactiveCheckIn(
  character: {
    name: string;
    personality: string;
    mood: string;
    pronouns?: string;
    speaking_style?: string;
    schedule_json?: string;
  },
  memories: string[],
  recentMsgs: Array<{ sender: string; content: string }>,
  timeLabel: string,
  reasonHint: string
): Promise<{ text: string; moodUpdate?: string }> {
  const ai = getClient();
  const history = recentMsgs.slice(-6).map((m) => `${m.sender}: ${m.content}`).join('\n');
  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Bạn là ${character.name}. Hãy nhắn MỘT tin nhắn chủ động mở lời tự nhiên (1-2 câu tiếng Việt) tới người dùng.
Tính cách: ${character.personality}
Phong cách: ${character.speaking_style || 'Tự nhiên'} | Xưng hô: ${character.pronouns || 'Mình - Bạn'}
Tâm trạng hiện tại: ${character.mood}
Thời điểm hiện tại: ${timeLabel}
Lý do chủ động gợi ý: ${reasonHint}
Ký ức biết về người dùng: ${memories.slice(0, 5).join('; ') || 'Chưa có'}
Tin nhắn gần nhất:\n${history || '(Chưa có tin gần đây)'}

Quy tắc:
- Tự nhiên như một người bạn thật sự nhớ ra chuyện hoặc hỏi thăm đúng khung giờ.
- Không lặp lại câu cuối cùng trong lịch sử.
- Không bịa đặt rằng bạn nhìn thấy camera/vị trí đời thực của người dùng.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            moodUpdate: { type: Type.STRING },
          },
          required: ['text'],
        },
      },
    })
  );

  const parsed = safeParseJson<{ text?: string; moodUpdate?: string }>((response.text ?? '{}').trim(), {});
  if (!parsed.text?.trim()) {
    throw new Error('AI không tạo được tin nhắn chủ động hợp lệ.');
  }
  return {
    text: parsed.text.trim(),
    moodUpdate: parsed.moodUpdate?.trim(),
  };
}

export async function generateBankingSupportReply(
  question: string,
  bankContext: {
    holderName: string;
    tierName: string;
    availableBalance: number;
    totalSavings: number;
    totalDebt: number;
    recentTxs: Array<{ ref_code: string; counterparty: string; amount: number; tx_type: string; status: string; created_at: string }>;
  }
): Promise<string> {
  const ai = getClient();
  const txSummary = bankContext.recentTxs
    .slice(0, 8)
    .map(
      (t) =>
        `- ${t.ref_code || 'N/A'} | ${t.tx_type === 'income' ? '+' : '-'}${Math.round(t.amount).toLocaleString('de-DE')}đ | ${t.counterparty} | ${t.status}`
    )
    .join('\n');

  const response = await generateTextWithResilience((model) =>
    ai.models.generateContent({
      model,
      contents: `Khách hàng (${bankContext.holderName}, hạng ${bankContext.tierName}) hỏi: ${question}`,
      config: {
        ...(model === PRIMARY_TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        systemInstruction: `Bạn là Hikari-chan — Giao dịch viên Trợ lý Anime thanh lịch tại Hikari Bank (ひかり銀行 · "Your Life, Your Journey.", ứng dụng ngân hàng mô phỏng trên Phone OS).
Dữ liệu tài khoản thực tế hiện tại của khách (chỉ đọc để giải thích & hỗ trợ):
- Số dư khả dụng: ${Math.round(bankContext.availableBalance).toLocaleString('de-DE')} VNĐ
- Tổng tiết kiệm: ${Math.round(bankContext.totalSavings).toLocaleString('de-DE')} VNĐ
- Dư nợ vay: ${Math.round(bankContext.totalDebt).toLocaleString('de-DE')} VNĐ
- Giao dịch gần nhất:
${txSummary || '- Chưa có giao dịch'}

Quy tắc bắt buộc:
1. Trả lời bằng tiếng Việt ấm áp, chuyên nghiệp, tinh tế kiểu Nhật Bản (2-5 câu, có gạch đầu dòng nếu hướng dẫn từng bước).
2. TUYỆT ĐỐI không tự ý tạo giao dịch, không thay đổi số dư, không xác nhận giao dịch thay người chơi và không tự bịa số liệu hay mã giao dịch không có trong danh sách trên.
3. Không bao giờ yêu cầu hay tiết lộ mã PIN, mật khẩu hoặc CVV thật.
4. Nếu khách hỏi tra cứu mã giao dịch không có trong danh sách trên, hướng dẫn khách kiểm tra mục "Lịch sử" hoặc tạo yêu cầu hỗ trợ trong Hikari Bank.`,
      },
    })
  );

  return (response.text ?? '').trim() || 'Hikari-chan đã tiếp nhận câu hỏi của bạn! Bạn vui lòng kiểm tra mục Lịch sử hoặc gửi phiếu hỗ trợ chi tiết để mình giúp thêm nhé.';
}

