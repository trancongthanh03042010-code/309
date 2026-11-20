import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import crypto from 'crypto';
import { db } from './db.ts';

export const ALLOWED_TEXT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

export type AllowedTextModel = (typeof ALLOWED_TEXT_MODELS)[number];

export interface PublicAiProviderConfig {
  id: string;
  provider_name: string;
  model_id: AllowedTextModel;
  fallback_model_id: AllowedTextModel;
  thinking_level: 'LOW' | 'MEDIUM';
  streaming_enabled: number;
  max_tokens: number;
  timeout_ms: number;
  updated_at: string;
  apiKeyConfigured: boolean;
  isLocked: boolean;
  canEdit: boolean;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function sanitizeAllowedModel(model: string | undefined, fallback: AllowedTextModel): AllowedTextModel {
  if (model && (ALLOWED_TEXT_MODELS as readonly string[]).includes(model)) {
    return model as AllowedTextModel;
  }
  return fallback;
}

export function verifyAiAdminToken(candidateToken?: string | null): boolean {
  const configuredSecret = (process.env.AI_ADMIN_SECRET || '').trim();
  if (!configuredSecret || !candidateToken) return false;
  const candidate = String(candidateToken).trim();
  const a = Buffer.from(configuredSecret, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getPublicAiConfig(canEdit = false): PublicAiProviderConfig {
  let row: Record<string, unknown> | undefined;
  try {
    row = db.prepare('SELECT * FROM ai_provider_settings WHERE id = ?').get('default') as
      | Record<string, unknown>
      | undefined;
  } catch {
    row = undefined;
  }

  const modelId = sanitizeAllowedModel(row?.model_id as string | undefined, 'gemini-4-hydrogen');
  const fallbackId = sanitizeAllowedModel(row?.fallback_model_id as string | undefined, 'gemini-3.1-flash-lite');
  const thinkingRaw = String(row?.thinking_level || 'LOW').toUpperCase();
  const thinkingLevel: 'LOW' | 'MEDIUM' = thinkingRaw === 'MEDIUM' ? 'MEDIUM' : 'LOW';

  return {
    id: 'default',
    provider_name: String(row?.provider_name || 'Gemini Server AI'),
    model_id: modelId,
    fallback_model_id: fallbackId,
    thinking_level: thinkingLevel,
    streaming_enabled: row?.streaming_enabled === 0 ? 0 : 1,
    max_tokens: Math.max(256, Math.min(4096, Number(row?.max_tokens || 1200))),
    timeout_ms: Math.max(5000, Math.min(35000, Number(row?.timeout_ms || 15000))),
    updated_at: String(row?.updated_at || new Date().toISOString()),
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    isLocked: !canEdit,
    canEdit,
  };
}

export function toThinkingLevelEnum(level: 'LOW' | 'MEDIUM'): ThinkingLevel {
  return level === 'MEDIUM' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;
}

export function logAiUsage(operation: string, modelId: string, latencyMs: number, status: 'ok' | 'error' | 'aborted'): void {
  try {
    db.prepare(
      'INSERT INTO ai_usage_logs (id, operation, model_id, latency_ms, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid('aiu'), operation, modelId, Math.max(0, Math.round(latencyMs)), status, new Date().toISOString());
  } catch {
    // non-fatal usage logging
  }
}
