import type {
  AiProviderConfig,
  AiRelationshipRecord,
  BankingOverviewPayload,
  BankingTransactionDemo,
  CallSessionRecord,
  CardLookupResult,
  CardRevealResult,
  Character,
  CharacterMemory,
  ChatMessage,
  ChatSearchHistoryItem,
  ChatSummaryRecord,
  Conversation,
  ConversationMember,
  DokiProfileOverview,
  DokiUserSettings,
  OSBootstrapData,
  ProactiveJobRecord,
  RelationshipEventRecord,
  ResponseTuningOptions,
  RoleplayScenario,
  StickerStatRecord,
  SystemUpdatePayload,
  TelecomOverviewPayload,
  TelecomTransaction,
  TelecomUserPackage,
  YouTubeComment,
  YouTubeEpisodeItem,
  YouTubeInvoiceItem,
  YouTubeMovieAccessResult,
  YouTubePlanId,
  YouTubePlaylist,
  YouTubePlaylistVideoItem,
  YouTubeSearchHistoryItem,
  YouTubeStreamingOverview,
  YouTubeSubscription,
} from '../types/os';

export const TELECOM_SYNC_EVENT = 'phoneos:telecom-sync';
export const BANKING_SYNC_EVENT = 'phoneos:banking-updated';
export const YOUTUBE_SYNC_EVENT = 'phoneos:youtube-updated';

export function emitTelecomSyncEvent(source: 'telecom' | 'banking') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TELECOM_SYNC_EVENT, { detail: { source, at: Date.now() } }));
  }
}

export function emitBankingSyncEvent(source = 'banking') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BANKING_SYNC_EVENT, { detail: { source, at: Date.now() } }));
  }
}

export function emitYoutubeSyncEvent(source = 'youtube') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(YOUTUBE_SYNC_EVENT, { detail: { source, at: Date.now() } }));
  }
}

export class ApiHttpError extends Error {
  status: number;
  code?: string;
  reason?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = typeof data?.code === 'string' ? data.code : undefined;
    this.reason = typeof data?.reason === 'string' ? data.reason : undefined;
    this.details = data;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errText =
      typeof data.error === 'string'
        ? data.reason && typeof data.reason === 'string'
          ? `${data.error}: ${data.reason}`
          : data.error
        : `Request failed (${res.status})`;
    throw new ApiHttpError(errText, res.status, data);
  }
  return data as T;
}

export const osApi = {
  bootstrap: () => request<OSBootstrapData>('/api/os/bootstrap'),
  updateProfile: (patch: Record<string, unknown>) =>
    request('/api/os/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
  updateApp: (appId: string, patch: Record<string, unknown>) =>
    request(`/api/os/apps/${appId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createNotification: (payload: Record<string, unknown>) =>
    request('/api/os/notifications', { method: 'POST', body: JSON.stringify(payload) }),
  markAllNotificationsRead: () =>
    request('/api/os/notifications/read-all', { method: 'PATCH' }),
  deleteNotification: (id: string) =>
    request(`/api/os/notifications/${id}`, { method: 'DELETE' }),
  exportData: () => request<Record<string, unknown>>('/api/os/export'),

  // Contacts & Calls
  createContact: (payload: Record<string, unknown>) =>
    request('/api/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  updateContact: (id: string, patch: Record<string, unknown>) =>
    request(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteContact: (id: string) =>
    request(`/api/contacts/${id}`, { method: 'DELETE' }),
  logCall: (payload: Record<string, unknown>) =>
    request('/api/calls', { method: 'POST', body: JSON.stringify(payload) }),
  deleteCall: (id: string) =>
    request(`/api/calls/${id}`, { method: 'DELETE' }),

  // Messages
  createConversation: (payload: Record<string, unknown>) =>
    request('/api/messages/conversations', { method: 'POST', body: JSON.stringify(payload) }),
  updateConversation: (id: string, patch: Record<string, unknown>) =>
    request(`/api/messages/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteConversation: (id: string) =>
    request(`/api/messages/conversations/${id}`, { method: 'DELETE' }),
  sendMessage: (payload: Record<string, unknown>) =>
    request<{
      userMessage: ChatMessage;
      aiMessage: ChatMessage | null;
      aiMessages?: ChatMessage[];
      aiError: string | null;
      updatedCharacter: Character | null;
      newMemoryRecord?: CharacterMemory | null;
    }>('/api/messages/send', { method: 'POST', body: JSON.stringify(payload) }),
  requestAiReply: (payload: { conversation_id: string; last_message_id?: string; request_id?: string }) =>
    request<{
      aiMessage: ChatMessage | null;
      aiMessages?: ChatMessage[];
      aiError: string | null;
      updatedCharacter: Character | null;
      newMemoryRecord?: CharacterMemory | null;
    }>('/api/messages/ai-reply', { method: 'POST', body: JSON.stringify(payload) }),
  updateMessage: (id: string, patch: Record<string, unknown>) =>
    request(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteMessage: (id: string) =>
    request(`/api/messages/${id}`, { method: 'DELETE' }),

  // Characters
  createCharacter: (payload: Record<string, unknown>) =>
    request('/api/characters', { method: 'POST', body: JSON.stringify(payload) }),
  updateCharacter: (id: string, patch: Record<string, unknown>) =>
    request(`/api/characters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addCharacterMemory: (id: string, payload: Record<string, unknown>) =>
    request(`/api/characters/${id}/memories`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteCharacterMemory: (memId: string) =>
    request(`/api/characters/memories/${memId}`, { method: 'DELETE' }),

  // Social
  createPost: (payload: Record<string, unknown>) =>
    request('/api/social/posts', { method: 'POST', body: JSON.stringify(payload) }),
  updatePost: (id: string, patch: Record<string, unknown>) =>
    request(`/api/social/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePost: (id: string) =>
    request(`/api/social/posts/${id}`, { method: 'DELETE' }),
  addComment: (payload: Record<string, unknown>) =>
    request('/api/social/comments', { method: 'POST', body: JSON.stringify(payload) }),
  markStoryViewed: (id: string) =>
    request(`/api/social/stories/${id}/view`, { method: 'PATCH' }),

  // Media
  createMedia: (payload: Record<string, unknown>) =>
    request('/api/media', { method: 'POST', body: JSON.stringify(payload) }),
  updateMedia: (id: string, patch: Record<string, unknown>) =>
    request(`/api/media/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteMedia: (id: string) =>
    request(`/api/media/${id}`, { method: 'DELETE' }),

  // Notes, Calendar, Reminders, Mail, Files, Recordings
  createNote: (payload: Record<string, unknown>) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (id: string, patch: Record<string, unknown>) =>
    request(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNote: (id: string) =>
    request(`/api/notes/${id}`, { method: 'DELETE' }),

  createEvent: (payload: Record<string, unknown>) =>
    request('/api/calendar', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id: string, patch: Record<string, unknown>) =>
    request(`/api/calendar/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEvent: (id: string) =>
    request(`/api/calendar/${id}`, { method: 'DELETE' }),

  createReminder: (payload: Record<string, unknown>) =>
    request('/api/reminders', { method: 'POST', body: JSON.stringify(payload) }),
  updateReminder: (id: string, patch: Record<string, unknown>) =>
    request(`/api/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteReminder: (id: string) =>
    request(`/api/reminders/${id}`, { method: 'DELETE' }),

  createEmail: (payload: Record<string, unknown>) =>
    request('/api/emails', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmail: (id: string, patch: Record<string, unknown>) =>
    request(`/api/emails/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEmail: (id: string) =>
    request(`/api/emails/${id}`, { method: 'DELETE' }),

  createFile: (payload: Record<string, unknown>) =>
    request('/api/files', { method: 'POST', body: JSON.stringify(payload) }),
  updateFile: (id: string, patch: Record<string, unknown>) =>
    request(`/api/files/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteFile: (id: string) =>
    request(`/api/files/${id}`, { method: 'DELETE' }),

  createRecording: (payload: Record<string, unknown>) =>
    request('/api/recordings', { method: 'POST', body: JSON.stringify(payload) }),
  updateRecording: (id: string, patch: Record<string, unknown>) =>
    request(`/api/recordings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRecording: (id: string) =>
    request(`/api/recordings/${id}`, { method: 'DELETE' }),

  // Browser, Clock, Health, Wallet, Vault, Shortcuts, Books, Games
  createBookmark: (payload: Record<string, unknown>) =>
    request('/api/browser/bookmarks', { method: 'POST', body: JSON.stringify(payload) }),
  deleteBookmark: (id: string) =>
    request(`/api/browser/bookmarks/${id}`, { method: 'DELETE' }),
  addBrowserHistory: (payload: Record<string, unknown>) =>
    request('/api/browser/history', { method: 'POST', body: JSON.stringify(payload) }),
  deleteBrowserHistory: (id: string) =>
    request(`/api/browser/history/${id}`, { method: 'DELETE' }),

  createAlarm: (payload: Record<string, unknown>) =>
    request('/api/clock/alarms', { method: 'POST', body: JSON.stringify(payload) }),
  updateAlarm: (id: string, patch: Record<string, unknown>) =>
    request(`/api/clock/alarms/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAlarm: (id: string) =>
    request(`/api/clock/alarms/${id}`, { method: 'DELETE' }),
  createWorldClock: (payload: Record<string, unknown>) =>
    request('/api/clock/world', { method: 'POST', body: JSON.stringify(payload) }),
  deleteWorldClock: (id: string) =>
    request(`/api/clock/world/${id}`, { method: 'DELETE' }),

  createHealthLog: (payload: Record<string, unknown>) =>
    request('/api/health', { method: 'POST', body: JSON.stringify(payload) }),
  deleteHealthLog: (id: string) =>
    request(`/api/health/${id}`, { method: 'DELETE' }),

  createWalletCard: (payload: Record<string, unknown>) =>
    request('/api/wallet', { method: 'POST', body: JSON.stringify(payload) }),
  deleteWalletCard: (id: string) =>
    request(`/api/wallet/${id}`, { method: 'DELETE' }),

  createVaultItem: (payload: Record<string, unknown>) =>
    request('/api/vault', { method: 'POST', body: JSON.stringify(payload) }),
  deleteVaultItem: (id: string) =>
    request(`/api/vault/${id}`, { method: 'DELETE' }),

  createShortcut: (payload: Record<string, unknown>) =>
    request('/api/shortcuts', { method: 'POST', body: JSON.stringify(payload) }),
  updateShortcut: (id: string, patch: Record<string, unknown>) =>
    request(`/api/shortcuts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteShortcut: (id: string) =>
    request(`/api/shortcuts/${id}`, { method: 'DELETE' }),

  createBook: (payload: Record<string, unknown>) =>
    request('/api/books', { method: 'POST', body: JSON.stringify(payload) }),
  updateBook: (id: string, patch: Record<string, unknown>) =>
    request(`/api/books/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  addGameScore: (payload: Record<string, unknown>) =>
    request('/api/games/scores', { method: 'POST', body: JSON.stringify(payload) }),

  // AI Endpoints
  tts: (text: string, voiceName: string, style: string) =>
    request<{ audioBase64: string; mimeType: string }>('/api/ai/tts', {
      method: 'POST',
      body: JSON.stringify({ text, voiceName, style }),
    }),
  transcribe: (audioDataUrl: string, mimeType: string) =>
    request<{ transcript: string }>('/api/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audioDataUrl, mimeType }),
    }),
  ocr: (imageDataUrl: string) =>
    request<{ text: string }>('/api/ai/ocr', {
      method: 'POST',
      body: JSON.stringify({ imageDataUrl }),
    }),
  translate: (text: string, sourceLang: string, targetLang: string) =>
    request('/api/ai/translate', {
      method: 'POST',
      body: JSON.stringify({ text, sourceLang, targetLang }),
    }),
  assistant: (prompt: string) =>
    request<{
      answer: string;
      proposedAction?: {
        type: string;
        requiresConfirmation: boolean;
        label: string;
        payload: Record<string, string>;
      };
    }>('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  lifeTick: (force = false) =>
    request('/api/ai/life-tick', { method: 'POST', body: JSON.stringify({ force }) }),

  // External Real APIs
  weather: (params: { city?: string; lat?: number; lon?: number }) => {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', params.city);
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lon !== undefined) qs.set('lon', String(params.lon));
    return request<{
      locationName: string;
      latitude: number;
      longitude: number;
      source: string;
      forecast: Record<string, unknown>;
    }>(`/api/external/weather?${qs.toString()}`);
  },
  currency: (base = 'USD') =>
    request<{ base: string; date: string; rates: Record<string, number>; source: string }>(
      `/api/external/currency?base=${encodeURIComponent(base)}`
    ),
  news: (category = 'top') =>
    request<{
      articles: Array<{ id: number; title: string; url?: string; by?: string; score?: number; time?: number }>;
      source: string;
    }>(`/api/external/news?category=${encodeURIComponent(category)}`),
  mapsSearch: (q: string) =>
    request<{
      results: Array<{ place_id: number; display_name: string; lat: string; lon: string; type?: string }>;
      source: string;
    }>(`/api/external/maps-search?q=${encodeURIComponent(q)}`),

  // OS 3.0 Security, Hardware & System
  verifyLock: (secret: string) =>
    request<{ ok: boolean; failedCount?: number }>('/api/os3/verify-lock', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    }),
  logBattery: (level: number, charging = 0) =>
    request('/api/os3/battery/log', { method: 'POST', body: JSON.stringify({ level, charging }) }),
  connectWifi: (ssid: string, password = '') =>
    request('/api/os3/wifi/connect', { method: 'POST', body: JSON.stringify({ ssid, password }) }),
  forgetWifi: (ssid: string) =>
    request('/api/os3/wifi/forget', { method: 'POST', body: JSON.stringify({ ssid }) }),
  scanBluetooth: () => request('/api/os3/bluetooth/scan', { method: 'POST' }),
  updateBluetooth: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/bluetooth/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBluetooth: (id: string) => request(`/api/os3/bluetooth/${id}`, { method: 'DELETE' }),
  updatePermission: (payload: { app_id: string; permission_key: string; status: string; reason?: string; touch_accessed?: boolean }) =>
    request('/api/os3/permissions', { method: 'PATCH', body: JSON.stringify(payload) }),
  createWidget: (payload: Record<string, unknown>) =>
    request('/api/os3/widgets', { method: 'POST', body: JSON.stringify(payload) }),
  updateWidget: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteWidget: (id: string) => request(`/api/os3/widgets/${id}`, { method: 'DELETE' }),
  resetHomeLayout: () => request('/api/os3/home/reset', { method: 'POST' }),

  // Backups, Sync, Updates, Errors, Jobs
  createBackup: (includeAiChat = true) =>
    request('/api/os3/backups', { method: 'POST', body: JSON.stringify({ includeAiChat }) }),
  importBackup: (backupJson: string) =>
    request<{ ok: boolean; integrityValid: boolean }>('/api/os3/backups/import', {
      method: 'POST',
      body: JSON.stringify({ backupJson }),
    }),
  restoreBackup: (id: string) => request(`/api/os3/backups/${id}/restore`, { method: 'POST' }),
  deleteBackup: (id: string) => request(`/api/os3/backups/${id}`, { method: 'DELETE' }),
  runSync: (categories?: string[], conflict_policy = 'newest') =>
    request('/api/os3/sync', { method: 'POST', body: JSON.stringify({ categories, conflict_policy }) }),
  getSystemUpdate: () => request<SystemUpdatePayload>('/api/os3/system-update'),
  getHealth: () =>
    request<{ status: string; database: string; geminiConfigured: boolean; uptimeSec: number; timestamp: string }>('/api/os3/health'),
  logSystemError: (payload: { app_id?: string; error_code?: string; message: string; detail?: string }) =>
    request('/api/os3/errors', { method: 'POST', body: JSON.stringify(payload) }),
  updateSystemError: (id: string, resolved: boolean) =>
    request(`/api/os3/errors/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved }) }),
  deleteSystemError: (id: string) => request(`/api/os3/errors/${id}`, { method: 'DELETE' }),
  createJob: (payload: Record<string, unknown>) =>
    request('/api/os3/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  runDueJobs: () => request<{ executed: number }>('/api/os3/jobs/run-due', { method: 'POST' }),
  resetAccount: () => request('/api/os3/account/reset', { method: 'POST' }),

  // Living AI World Upgrades
  updateCharacterFull: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/characters/${id}/full`, { method: 'PATCH', body: JSON.stringify(patch) }),
  updateMemory: (memId: string, patch: { content?: string; memory_type?: string }) =>
    request(`/api/os3/memories/${memId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  summarizeCharacter: (id: string) =>
    request<{ summary: string }>(`/api/os3/characters/${id}/summarize`, { method: 'POST' }),
  updateRelationship: (charId: string, patch: { stage?: string; resetBoundary?: boolean }) =>
    request(`/api/os3/relationships/${charId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  chooseAiEvent: (id: string, choiceId: string) =>
    request(`/api/os3/ai-events/${id}/choose`, { method: 'POST', body: JSON.stringify({ choiceId }) }),
  skipAiEvent: (id: string) => request(`/api/os3/ai-events/${id}/skip`, { method: 'POST' }),

  // 8 New Apps
  updatePodcast: (id: string, is_followed: boolean) =>
    request(`/api/os3/podcasts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_followed }) }),
  updatePodcastEpisode: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/podcast-episodes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  addToCart: (payload: { product_id: string; quantity?: number; selected_variant?: string }) =>
    request('/api/os3/shopping/cart', { method: 'POST', body: JSON.stringify(payload) }),
  updateCartItem: (id: string, quantity: number) =>
    request(`/api/os3/shopping/cart/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
  removeCartItem: (id: string) => request(`/api/os3/shopping/cart/${id}`, { method: 'DELETE' }),
  checkoutShopping: (payload: Record<string, unknown>) =>
    request('/api/os3/shopping/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  updateShoppingOrder: (id: string, status: string) =>
    request(`/api/os3/shopping/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  createFoodOrder: (payload: Record<string, unknown>) =>
    request('/api/os3/food/orders', { method: 'POST', body: JSON.stringify(payload) }),
  updateFoodOrder: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/food/orders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  setBankingPin: (pin: string) =>
    request('/api/os3/banking/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  transferBanking: (payload: { amount: number; counterparty: string; note?: string; pin?: string }) =>
    request('/api/os3/banking/transfer', { method: 'POST', body: JSON.stringify(payload) }),
  payBankingBill: (id: string) =>
    request(`/api/os3/banking/bills/${id}/pay`, { method: 'POST' }),

  createRide: (payload: { pickup: string; dropoff: string; vehicle_type: string; fare: number }) =>
    request('/api/os3/rides', { method: 'POST', body: JSON.stringify(payload) }),
  updateRide: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/rides/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  createOfficeDoc: (payload: Record<string, unknown>) =>
    request('/api/os3/office', { method: 'POST', body: JSON.stringify(payload) }),
  updateOfficeDoc: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/office/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteOfficeDoc: (id: string) => request(`/api/os3/office/${id}`, { method: 'DELETE' }),

  updateCommunityGroup: (id: string, is_joined: boolean) =>
    request(`/api/os3/community/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ is_joined }) }),
  createCommunityPost: (payload: Record<string, unknown>) =>
    request('/api/os3/community/posts', { method: 'POST', body: JSON.stringify(payload) }),
  updateCommunityPost: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/community/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCommunityPost: (id: string) => request(`/api/os3/community/posts/${id}`, { method: 'DELETE' }),
  addCommunityComment: (payload: { post_id: string; parent_id?: string; content: string }) =>
    request('/api/os3/community/comments', { method: 'POST', body: JSON.stringify(payload) }),

  updateSmartDevice: (id: string, patch: Record<string, unknown>) =>
    request(`/api/os3/smarthome/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  runSmartScene: (id: string) => request(`/api/os3/smarthome/scenes/${id}/run`, { method: 'POST' }),
  updateSmartScene: (id: string, auto_enabled: boolean) =>
    request(`/api/os3/smarthome/scenes/${id}`, { method: 'PATCH', body: JSON.stringify({ auto_enabled }) }),

  // OS 4.0 Endpoints
  getIntegrations: () =>
    request<{ osVersion: string; services: Array<import('../types/os').IntegrationServiceStatus> }>('/api/os4/integrations'),

  searchYoutube: (
    q: string,
    category = '',
    opts?: { sort?: string; duration?: string; type?: string; save?: boolean }
  ) => {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (category) qs.set('category', category);
    if (opts?.sort) qs.set('sort', opts.sort);
    if (opts?.duration) qs.set('duration', opts.duration);
    if (opts?.type) qs.set('type', opts.type);
    if (opts?.save) qs.set('save', '1');
    return request<{
      apiConfigured: boolean;
      source: string;
      note?: string;
      error?: string;
      items: Array<{
        videoId: string;
        title: string;
        channelTitle: string;
        channelId?: string;
        thumbnail: string;
        durationLabel: string;
        viewCountText?: string;
        publishedTimeText?: string;
        category: string;
        description: string;
      }>;
    }>(`/api/os4/youtube/search?${qs.toString()}`);
  },

  getYoutubeSearchHistory: () =>
    request<{ items: YouTubeSearchHistoryItem[] }>('/api/os4/youtube/search-history'),

  deleteYoutubeSearchHistory: (id: string) =>
    request<{ ok: boolean }>(`/api/os4/youtube/search-history/${id}`, { method: 'DELETE' }),

  saveYoutubeLibrary: (payload: {
    video_id: string;
    title: string;
    channel_title: string;
    thumbnail_url?: string;
    duration_label?: string;
    list_type?: 'history' | 'favorite' | 'watch_later' | 'liked';
    progress_sec?: number;
    duration_sec?: number;
    channel_id?: string;
    category?: string;
  }) => request('/api/os4/youtube/library', { method: 'POST', body: JSON.stringify(payload) }),

  deleteYoutubeLibrary: (id: string) => request(`/api/os4/youtube/library/${id}`, { method: 'DELETE' }),

  saveYoutubeProgress: (payload: {
    video_id: string;
    title?: string;
    channel_title?: string;
    thumbnail_url?: string;
    duration_label?: string;
    progress_sec: number;
    duration_sec?: number;
  }) => request<{ ok: boolean }>('/api/os4/youtube/progress', { method: 'POST', body: JSON.stringify(payload) }),

  toggleYoutubeLike: (payload: {
    video_id: string;
    title?: string;
    channel_title?: string;
    thumbnail_url?: string;
    duration_label?: string;
    value?: number;
  }) => request<{ liked: number; likesCount: number }>('/api/os4/youtube/like', { method: 'POST', body: JSON.stringify(payload) }),

  getYoutubeVideoMeta: (videoId: string, channel?: string) => {
    const qs = channel ? `?channel=${encodeURIComponent(channel)}` : '';
    return request<{
      videoId: string;
      liked: number;
      likesCount: number;
      progressSec: number;
      durationSec: number;
      inWatchLater: boolean;
      watchLaterId: string;
      isSubscribed: boolean;
      inPlaylistIds: string[];
    }>(`/api/os4/youtube/video-meta/${encodeURIComponent(videoId)}${qs}`);
  },

  getYoutubeSubscriptions: () =>
    request<{ subscriptions: YouTubeSubscription[] }>('/api/os4/youtube/subscriptions'),

  toggleYoutubeSubscribe: (payload: { channel_id?: string; channel_title: string; avatar_url?: string }) =>
    request<{ subscribed: boolean; subscriptions: YouTubeSubscription[] }>('/api/os4/youtube/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getYoutubeComments: (videoId: string) =>
    request<{ comments: YouTubeComment[] }>(`/api/os4/youtube/comments?videoId=${encodeURIComponent(videoId)}`),

  addYoutubeComment: (payload: { video_id: string; parent_id?: string; content: string }) =>
    request<{ comment: YouTubeComment }>('/api/os4/youtube/comments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleYoutubeCommentLike: (id: string) =>
    request<{ comment: YouTubeComment }>(`/api/os4/youtube/comments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ toggleLike: true }),
    }),

  deleteYoutubeComment: (id: string) =>
    request<{ ok: boolean }>(`/api/os4/youtube/comments/${id}`, { method: 'DELETE' }),

  getYoutubePlaylists: () =>
    request<{ playlists: YouTubePlaylist[] }>('/api/os4/youtube/playlists'),

  createYoutubePlaylist: (payload: {
    name: string;
    description?: string;
    firstVideo?: YouTubePlaylistVideoItem;
  }) =>
    request<{ playlist: YouTubePlaylist }>('/api/os4/youtube/playlists', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateYoutubePlaylist: (
    id: string,
    payload: { name?: string; addVideo?: YouTubePlaylistVideoItem; removeVideoId?: string }
  ) =>
    request<{ playlist: YouTubePlaylist }>(`/api/os4/youtube/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteYoutubePlaylist: (id: string) =>
    request<{ ok: boolean }>(`/api/os4/youtube/playlists/${id}`, { method: 'DELETE' }),

  getYoutubeStreamingOverview: () =>
    request<YouTubeStreamingOverview>('/api/os4/youtube/streaming/overview'),

  checkYoutubeMovieAccess: (movieId: string) =>
    request<YouTubeMovieAccessResult>(`/api/os4/youtube/movies/${encodeURIComponent(movieId)}/access`),

  playYoutubeMovie: (movieId: string, episodeNumber = 1) =>
    request<{
      ok: boolean;
      access: YouTubeMovieAccessResult;
      episode: YouTubeEpisodeItem | null;
      streamManifest: {
        movieId: string;
        episodeNumber: number;
        maxQuality: string;
        availableQualities: string[];
        adFree: boolean;
        downloadAllowed: boolean;
        streamToken: string;
      };
    }>(`/api/os4/youtube/movies/${encodeURIComponent(movieId)}/play`, {
      method: 'POST',
      body: JSON.stringify({ episodeNumber }),
    }),

  toggleYoutubeMovieFavorite: (movieId: string) =>
    request<{ isFavorite: boolean; overview: YouTubeStreamingOverview }>(
      `/api/os4/youtube/movies/${encodeURIComponent(movieId)}/favorite`,
      { method: 'POST' }
    ),

  saveYoutubeMovieProgress: (
    movieId: string,
    payload: { episodeNumber?: number; progressSec: number; durationSec?: number }
  ) =>
    request<{ ok: boolean }>(`/api/os4/youtube/movies/${encodeURIComponent(movieId)}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  purchaseYoutubeMovie: (
    movieId: string,
    payload: {
      mode: 'rent' | 'buy';
      cardId?: string;
      cardNumber?: string;
      holderName?: string;
      expiry?: string;
      cvv?: string;
      idempotencyKey?: string;
    }
  ) =>
    request<{
      ok: boolean;
      entitlementId: string;
      payment: Record<string, unknown>;
      overview: YouTubeStreamingOverview;
    }>(`/api/os4/youtube/movies/${encodeURIComponent(movieId)}/purchase`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  subscribeYoutubePremium: (payload: {
    planId: YouTubePlanId;
    autoRenew?: boolean;
    savePaymentMethod?: boolean;
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
    idempotencyKey?: string;
  }) =>
    request<{
      ok: boolean;
      actionType: string;
      payment: Record<string, unknown>;
      invoice: YouTubeInvoiceItem | null;
      overview: YouTubeStreamingOverview;
    }>('/api/os4/youtube/premium/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelYoutubePremium: () =>
    request<{ ok: boolean; overview: YouTubeStreamingOverview }>('/api/os4/youtube/premium/cancel', {
      method: 'POST',
    }),

  toggleYoutubeAutoRenew: (enabled: boolean, cardId?: string) =>
    request<{ ok: boolean; overview: YouTubeStreamingOverview }>('/api/os4/youtube/premium/toggle-autorenew', {
      method: 'POST',
      body: JSON.stringify({ enabled, cardId }),
    }),

  updateYoutubePaymentMethod: (payload: {
    unlink?: boolean;
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
  }) =>
    request<{ ok: boolean; overview: YouTubeStreamingOverview }>('/api/os4/youtube/premium/payment-method', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  simulateYoutubeBillingCycle: () =>
    request<{ ok: boolean; overview: YouTubeStreamingOverview }>('/api/os4/youtube/premium/simulate-cycle', {
      method: 'POST',
    }),

  getMoviesCatalog: () =>
    request<{
      realityType: string;
      tmdbConfigured: boolean;
      note: string;
      items: Array<{
        id: string;
        title: string;
        originalTitle: string;
        year: number;
        genre: string;
        duration: string;
        rating: number;
        poster: string;
        trailerYoutubeId: string;
        synopsis: string;
        cast: string[];
        providers: Array<{ name: string; url: string; note: string }>;
      }>;
    }>('/api/os4/movies/catalog'),

  updateMovieWatchlist: (payload: {
    movie_id: string;
    title: string;
    poster_url?: string;
    is_watchlisted?: number;
    is_favorite?: number;
    user_rating?: number;
  }) => request('/api/os4/movies/watchlist', { method: 'POST', body: JSON.stringify(payload) }),

  createMusicPlaylist: (name: string, tracks: string[] = []) =>
    request('/api/os4/music/playlists', { method: 'POST', body: JSON.stringify({ name, tracks }) }),
  updateMusicPlaylist: (id: string, patch: { name?: string; tracks?: string[] }) =>
    request(`/api/os4/music/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteMusicPlaylist: (id: string) => request(`/api/os4/music/playlists/${id}`, { method: 'DELETE' }),

  getMusicOAuthStatus: () => {
    const qs =
      typeof window !== 'undefined' && window.location?.origin
        ? `?origin=${encodeURIComponent(window.location.origin)}`
        : '';
    return request<{
      spotify: {
        configured: boolean;
        connected: boolean;
        redirectUri: string;
        callbackPath: string;
        profile: {
          accountId: string;
          displayName: string;
          avatarUrl: string;
          profileUrl: string;
          connectedAt: string;
        } | null;
      };
    }>(`/api/os4/music/oauth/status${qs}`);
  },
  getSpotifyAuthUrl: () => {
    const qs =
      typeof window !== 'undefined' && window.location?.origin
        ? `?origin=${encodeURIComponent(window.location.origin)}`
        : '';
    return request<{ url: string; redirectUri: string }>(`/api/os4/music/oauth/spotify/url${qs}`);
  },
  getSpotifyLibrary: () =>
    request<{
      playlists: Array<{
        id: string;
        name: string;
        imageUrl: string;
        tracksTotal: number;
        externalUrl: string;
      }>;
      tracks: Array<{
        id: string;
        title: string;
        artist: string;
        durationSec: number;
        cover: string;
        previewUrl: string;
        externalUrl: string;
      }>;
    }>('/api/os4/music/oauth/spotify/library'),
  disconnectSpotify: () =>
    request<{ ok: boolean }>('/api/os4/music/oauth/spotify/disconnect', { method: 'POST' }),
  getSpotifyEmbeds: () =>
    request<{
      items: Array<{
        id: string;
        spotify_type: string;
        spotify_id: string;
        title: string;
        thumbnail_url: string;
        canonical_url: string;
        embed_url: string;
        created_at: string;
      }>;
    }>('/api/os4/music/spotify/embeds'),
  addSpotifyEmbed: (url: string) =>
    request<{
      item: {
        id: string;
        spotify_type: string;
        spotify_id: string;
        title: string;
        thumbnail_url: string;
        canonical_url: string;
        embed_url: string;
        created_at: string;
      };
    }>('/api/os4/music/spotify/embeds', { method: 'POST', body: JSON.stringify({ url }) }),
  deleteSpotifyEmbed: (id: string) =>
    request<{ ok: boolean }>(`/api/os4/music/spotify/embeds/${id}`, { method: 'DELETE' }),

  subscribePodcastRss: (feedUrl: string) =>
    request<{ ok: boolean; episodesCount: number }>('/api/os4/podcast/rss', {
      method: 'POST',
      body: JSON.stringify({ feedUrl }),
    }),

  setupLockRecovery: (recoveryEmail: string, recoveryCode: string) =>
    request('/api/os4/security/recovery-setup', {
      method: 'POST',
      body: JSON.stringify({ recoveryEmail, recoveryCode }),
    }),
  recoverLockPin: (recoveryCode: string, newMode = 'swipe', newPin = '') =>
    request('/api/os4/security/recover-pin', {
      method: 'POST',
      body: JSON.stringify({ recoveryCode, newMode, newPin }),
    }),

  previewBackup: (id: string) =>
    request<{
      id: string;
      schemaVersion: string;
      osVersion: string;
      createdAt: string;
      integrityValid: boolean;
      counts: Record<string, number>;
      modules: string[];
    }>(`/api/os4/backups/${id}/preview`),

  selectiveRestoreBackup: (id: string, modules: string[]) =>
    request<{ ok: boolean; restoredModules: string[] }>(`/api/os4/backups/${id}/selective-restore`, {
      method: 'POST',
      body: JSON.stringify({ modules }),
    }),

  deleteAccountData: (confirmText: string) =>
    request('/api/os4/account', { method: 'DELETE', body: JSON.stringify({ confirmText }) }),

  getDiagnostics: () =>
    request<{
      correlationId: string;
      generatedAt: string;
      osVersion: string;
      uptimeSec: number;
      migrations: Array<import('../types/os').MigrationRecord>;
      redactedErrors: Array<{ id: string; app_id: string; error_code: string; message: string; resolved: number; created_at: string }>;
      privacyNote: string;
    }>('/api/os4/diagnostics'),

  getSystemUpdate4: () => request<SystemUpdatePayload>('/api/os4/system-update'),
  exportSystemVersionHistory: () =>
    request<{
      schema: string;
      osName: string;
      exportedAt: string;
      totalVersions: number;
      integrityHash: string;
      versions: SystemUpdatePayload['versions'];
    }>('/api/os4/system-update/export'),
  restoreSystemVersionHistory: (payload: unknown) =>
    request<{
      ok: boolean;
      imported: number;
      skippedExisting: number;
      totalVersions: number;
      history: SystemUpdatePayload;
    }>('/api/os4/system-update/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Messages v3 (DokiChat Engine)
  messagesV3: {
    cancelAi: (payload: { conversation_id?: string; request_id?: string }) =>
      request<{ ok: boolean; cancelled: boolean }>('/api/messages-v3/ai/cancel', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    regenerateAi: (payload: { conversation_id: string; target_message_id?: string; request_id?: string }) =>
      request<{
        aiMessage: ChatMessage | null;
        aiMessages?: ChatMessage[];
        aiError: string | null;
        updatedCharacter: Character | null;
        newMemoryRecord?: CharacterMemory | null;
      }>('/api/messages-v3/ai/regenerate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getMessagesPaginated: (convId: string, before?: string, limit = 40) => {
      const qs = new URLSearchParams();
      if (before) qs.set('before', before);
      qs.set('limit', String(limit));
      return request<{ messages: ChatMessage[]; hasMore: boolean; totalCount: number }>(
        `/api/messages-v3/conversations/${convId}/messages?${qs.toString()}`
      );
    },
    markConversationRead: (convId: string) =>
      request<{ ok: boolean }>(`/api/messages-v3/conversations/${convId}/mark-read`, { method: 'POST' }),
    clearConversationHistory: (convId: string) =>
      request<{ ok: boolean }>(`/api/messages-v3/conversations/${convId}/clear-history`, { method: 'POST' }),
    exportConversationUrl: (convId: string, format: 'json' | 'txt' = 'json') =>
      `/api/messages-v3/conversations/${convId}/export?format=${format}`,
    getMembers: (convId: string) =>
      request<ConversationMember[]>(`/api/messages-v3/conversations/${convId}/members`),
    addMember: (convId: string, character_id: string, role: 'admin' | 'member' = 'member') =>
      request<{ members: ConversationMember[]; systemMessage: ChatMessage }>(
        `/api/messages-v3/conversations/${convId}/members`,
        { method: 'POST', body: JSON.stringify({ character_id, role }) }
      ),
    updateMember: (convId: string, memberId: string, patch: { muted?: number; role?: string; is_active?: number }) =>
      request<ConversationMember>(`/api/messages-v3/conversations/${convId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    removeMember: (convId: string, memberId: string) =>
      request<{ ok: boolean; systemMessage: ChatMessage }>(
        `/api/messages-v3/conversations/${convId}/members/${memberId}`,
        { method: 'DELETE' }
      ),
    updateConversationConfig: (convId: string, patch: Record<string, unknown>) =>
      request<Conversation>(`/api/messages-v3/conversations/${convId}/config`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    updateRoleplay: (convId: string, payload: Record<string, unknown>) =>
      request<{ conversation: Conversation; systemMessage: ChatMessage | null }>(
        `/api/messages-v3/conversations/${convId}/roleplay`,
        { method: 'PATCH', body: JSON.stringify(payload) }
      ),
    getRoleplayRecap: (convId: string) =>
      request<{ recap: string }>(`/api/messages-v3/conversations/${convId}/roleplay/recap`, { method: 'POST' }),
    getSummaries: (convId: string) =>
      request<ChatSummaryRecord[]>(`/api/messages-v3/conversations/${convId}/summaries`),
    createSummary: (convId: string) =>
      request<ChatSummaryRecord>(`/api/messages-v3/conversations/${convId}/summaries`, { method: 'POST' }),
    restoreSummary: (sumId: string) =>
      request<ChatSummaryRecord>(`/api/messages-v3/summaries/${sumId}/restore`, { method: 'POST' }),
    toggleSaveMessage: (msgId: string, is_saved?: boolean) =>
      request<ChatMessage>(`/api/messages-v3/messages/${msgId}/save`, {
        method: 'POST',
        body: JSON.stringify(is_saved !== undefined ? { is_saved } : {}),
      }),
    rememberMessage: (msgId: string, payload: { character_id?: string; content?: string } = {}) =>
      request<{ ok: boolean; memory: CharacterMemory }>(`/api/messages-v3/messages/${msgId}/remember`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    forwardMessage: (msgId: string, target_conversation_id: string) =>
      request<ChatMessage>(`/api/messages-v3/messages/${msgId}/forward`, {
        method: 'POST',
        body: JSON.stringify({ target_conversation_id }),
      }),
    reportMessage: (msgId: string, reason: string, detail = '') =>
      request<{ ok: boolean; id: string }>(`/api/messages-v3/messages/${msgId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, detail }),
      }),
    deleteMessageScoped: (msgId: string, scope: 'self' | 'all' = 'all') =>
      request<{ ok: boolean }>(`/api/messages-v3/messages/${msgId}/delete-scoped`, {
        method: 'POST',
        body: JSON.stringify({ scope }),
      }),
    searchMessages: (params: {
      q?: string;
      conversationId?: string;
      senderType?: string;
      msgType?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.conversationId) qs.set('conversationId', params.conversationId);
      if (params.senderType) qs.set('senderType', params.senderType);
      if (params.msgType) qs.set('msgType', params.msgType);
      if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params.dateTo) qs.set('dateTo', params.dateTo);
      return request<{
        messages: ChatMessage[];
        conversations: Conversation[];
        characters: Character[];
      }>(`/api/messages-v3/search?${qs.toString()}`);
    },
    getSearchHistory: () => request<ChatSearchHistoryItem[]>('/api/messages-v3/search-history'),
    addSearchHistory: (query: string, scope = 'all') =>
      request<ChatSearchHistoryItem>('/api/messages-v3/search-history', {
        method: 'POST',
        body: JSON.stringify({ query, scope }),
      }),
    deleteSearchHistory: (id: string) =>
      request<{ ok: boolean }>(`/api/messages-v3/search-history/${id}`, { method: 'DELETE' }),
    createCharacterV3: (payload: Record<string, unknown>) =>
      request<Character>('/api/messages-v3/characters', { method: 'POST', body: JSON.stringify(payload) }),
    updateCharacterV3: (id: string, payload: Record<string, unknown>) =>
      request<{ character: Character; clonedForNewChat: boolean }>(`/api/messages-v3/characters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    duplicateCharacter: (id: string) =>
      request<Character>(`/api/messages-v3/characters/${id}/duplicate`, { method: 'POST' }),
    exportCharacterUrl: (id: string) => `/api/messages-v3/characters/${id}/export`,
    importCharacterJson: (jsonText: string) =>
      request<Character>('/api/messages-v3/characters/import', {
        method: 'POST',
        body: JSON.stringify({ jsonText }),
      }),
    reportCharacter: (id: string, reason: string, detail = '') =>
      request<{ ok: boolean; id: string }>(`/api/messages-v3/characters/${id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, detail }),
      }),
    deleteCustomCharacter: (id: string) =>
      request<{ ok: boolean }>(`/api/messages-v3/characters/${id}`, { method: 'DELETE' }),
    updateMemoryV3: (
      memId: string,
      patch: {
        content?: string;
        memory_type?: string;
        is_active?: number;
        importance?: number;
        is_pinned?: number;
        emotional_context?: string;
      }
    ) =>
      request<CharacterMemory>(`/api/messages-v3/memories/${memId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    getProactiveJobs: () => request<ProactiveJobRecord[]>('/api/messages-v3/proactive/jobs'),
    triggerProactive: (payload: { characterId?: string; force?: boolean } = {}) =>
      request<{
        skipped: boolean;
        reason?: string;
        character?: Character;
        conversationId?: string;
        message?: ChatMessage;
        job?: ProactiveJobRecord;
      }>('/api/messages-v3/proactive/trigger', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // DokiChat Ultimate 3.0 SSE Stream & Extensions
    streamMessage: async (
      payload: {
        conversation_id: string;
        content: string;
        msg_type: ChatMessage['msg_type'];
        attachment_json?: unknown;
        reply_to_id?: string;
        client_temp_id?: string;
        request_id?: string;
        skip_save_user?: boolean;
        tuning?: ResponseTuningOptions;
      },
      callbacks: {
        signal?: AbortSignal;
        onUserSaved?: (userMessage: ChatMessage) => void;
        onStatus?: (label: string) => void;
        onChunk?: (visibleText: string) => void;
        onDone?: (res: {
          userMessage?: ChatMessage | null;
          aiMessage?: ChatMessage | null;
          aiMessages?: ChatMessage[];
          updatedCharacter?: Character | null;
          newMemoryRecord?: CharacterMemory | null;
          relationship?: AiRelationshipRecord | null;
          emotionTag?: string;
          emotionReason?: string;
        }) => void;
        onError?: (errMessage: string) => void;
      }
    ) => {
      const response = await fetch('/api/messages-v3/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: callbacks.signal,
      });
      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => 'Stream connection error');
        throw new Error(errText || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const raw of events) {
          const lines = raw.split('\n').filter((l) => l.startsWith('data: '));
          for (const line of lines) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr) as Record<string, unknown>;
              if (evt.type === 'user_saved' && evt.userMessage) {
                callbacks.onUserSaved?.(evt.userMessage as ChatMessage);
              } else if (evt.type === 'status' && typeof evt.label === 'string') {
                callbacks.onStatus?.(evt.label);
              } else if (evt.type === 'chunk' && typeof evt.text === 'string') {
                callbacks.onChunk?.(evt.text);
              } else if (evt.type === 'done') {
                callbacks.onDone?.(evt as {
                  userMessage?: ChatMessage | null;
                  aiMessage?: ChatMessage | null;
                  aiMessages?: ChatMessage[];
                  updatedCharacter?: Character | null;
                  newMemoryRecord?: CharacterMemory | null;
                  relationship?: AiRelationshipRecord | null;
                  emotionTag?: string;
                  emotionReason?: string;
                });
              } else if (evt.type === 'error') {
                callbacks.onError?.(String(evt.error || 'Lỗi tạo phản hồi AI'));
              }
            } catch {
              // ignore malformed SSE chunk
            }
          }
        }
      }
    },

    continueAi: (conversation_id: string) =>
      request<{
        aiMessage: ChatMessage | null;
        aiMessages: ChatMessage[];
        updatedCharacter: Character | null;
      }>('/api/messages-v3/ai/continue', {
        method: 'POST',
        body: JSON.stringify({ conversation_id }),
      }),

    previewCharacterReply: (characterDraft: Record<string, unknown>, sampleMessage: string) =>
      request<{ reply: string; emotionTag: string; bubbles: string[] }>(
        '/api/messages-v3/characters/preview-reply',
        { method: 'POST', body: JSON.stringify({ characterDraft, sampleMessage }) }
      ),

    getDokiSettings: () => request<DokiUserSettings>('/api/messages-v3/settings'),
    updateDokiSettings: (patch: Partial<DokiUserSettings>) =>
      request<DokiUserSettings>('/api/messages-v3/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    getAiConfig: () => request<AiProviderConfig>('/api/messages-v3/ai-config'),
    verifyAiAdmin: (adminToken: string) =>
      request<AiProviderConfig & { ok?: boolean; verified?: boolean }>('/api/messages-v3/ai-config/verify-admin', {
        method: 'POST',
        body: JSON.stringify({ adminToken }),
      }),
    updateAiConfig: (
      patch: {
        model_id?: string;
        fallback_model_id?: string;
        thinking_level?: string;
        streaming_enabled?: number;
        max_tokens?: number;
        timeout_ms?: number;
      },
      adminToken?: string
    ) =>
      request<AiProviderConfig>('/api/messages-v3/ai-config', {
        method: 'PATCH',
        headers: adminToken ? { 'x-ai-admin-token': adminToken } : undefined,
        body: JSON.stringify(patch),
      }),

    getStickerStats: () => request<StickerStatRecord[]>('/api/messages-v3/stickers/stats'),
    trackSticker: (payload: {
      sticker_id: string;
      item_type: 'sticker' | 'gif';
      payload?: Record<string, unknown>;
      toggleFavorite?: boolean;
    }) =>
      request<StickerStatRecord>('/api/messages-v3/stickers/track', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getScenarios: () => request<RoleplayScenario[]>('/api/messages-v3/scenarios'),
    createScenario: (payload: {
      character_id?: string;
      title: string;
      genre?: string;
      description?: string;
      user_role?: string;
      ai_role?: string;
      opening_scene?: string;
      branches?: string[];
    }) =>
      request<RoleplayScenario>('/api/messages-v3/scenarios', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    restartRoleplay: (convId: string, payload: { sceneTitle?: string; scenario?: string }) =>
      request<{ conversation: Conversation; systemMessage: ChatMessage | null }>(
        `/api/messages-v3/conversations/${convId}/roleplay/restart`,
        { method: 'POST', body: JSON.stringify(payload) }
      ),

    getRelationshipDetail: (charId: string) =>
      request<{ relationship: AiRelationshipRecord | null; events: RelationshipEventRecord[] }>(
        `/api/messages-v3/relationships/${charId}`
      ),
    getProfileOverview: () => request<DokiProfileOverview>('/api/messages-v3/profile-overview'),

    callTurn: (payload: {
      character_id: string;
      conversation_id?: string;
      text?: string;
      audioDataUrl?: string;
      mimeType?: string;
      voiceName?: string;
      withAudio?: boolean;
    }) =>
      request<{ transcript: string; reply: string; emotionTag: string; audioBase64: string }>(
        '/api/messages-v3/calls/turn',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    saveCallSession: (payload: {
      character_id: string;
      call_type: 'voice' | 'video';
      duration_sec: number;
      transcript: Array<{ who: string; text: string }>;
      emotion_summary: string;
    }) =>
      request<CallSessionRecord>('/api/messages-v3/calls/session', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    clearData: (target: 'search_history' | 'inactive_memories' | 'proactive_logs') =>
      request<{ ok: boolean }>('/api/messages-v3/data/clear', {
        method: 'POST',
        body: JSON.stringify({ target }),
      }),
  },

  banking: {
    getOverview: () => request<BankingOverviewPayload>('/api/banking/overview'),
    lookupRecipient: (accountNumber: string, bankCode: string) =>
      request<{
        valid: boolean;
        recipientName: string;
        displayName?: string;
        bankCode: string;
        bankName?: string;
        avatar?: string;
        status?: string;
        isAi?: boolean;
        characterId?: string;
        targetAccountId?: string;
      }>('/api/banking/lookup-recipient', {
        method: 'POST',
        body: JSON.stringify({ accountNumber, bankCode }),
      }),
    transfer: (payload: {
      sourceAccountId?: string;
      sourceCardId?: string;
      clientTxId?: string;
      idempotencyKey?: string;
      amount: number;
      counterparty: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      note?: string;
      memo?: string;
      method?: string;
      pin?: string;
      authMethod?: 'pin' | 'biometric';
      saveBeneficiary?: boolean;
      category?: string;
      targetCharacterId?: string;
      sourceType?: string;
      sourceChatId?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
          creditedInternal?: boolean;
          idempotentHit?: boolean;
        }
      >('/api/banking/transfer', { method: 'POST', body: JSON.stringify(payload) }),
    createAccount: (payload: {
      nickname: string;
      account_role: 'sub' | 'receive_only';
      package_tier?: string;
      initial_deposit?: number;
      avatar?: string;
    }) => request<BankingOverviewPayload>('/api/banking/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    updateAccount: (
      id: string,
      patch: { nickname?: string; avatar?: string; is_hidden?: number; daily_limit?: number; monthly_limit?: number }
    ) => request<BankingOverviewPayload>(`/api/banking/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    setPrimaryAccount: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/accounts/${id}/set-primary`, { method: 'POST' }),
    closeAccount: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/accounts/${id}/close`, { method: 'POST' }),
    receiveDemo: (payload: { amount: number; senderName?: string; note?: string; accountId?: string; idempotencyKey?: string }) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown>; idempotentHit?: boolean }>(
        '/api/banking/receive-demo',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    depositDemo: (payload: { amount: number; senderName?: string; note?: string; accountId?: string; idempotencyKey?: string }) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown>; idempotentHit?: boolean }>(
        '/api/banking/deposit-demo',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    withdraw: (payload: {
      amount: number;
      counterparty?: string;
      note?: string;
      accountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
          cashbackEarned?: number;
          pointsEarned?: number;
          idempotentHit?: boolean;
        }
      >('/api/banking/withdraw', { method: 'POST', body: JSON.stringify(payload) }),
    charSend: (payload: {
      characterId: string;
      targetAccountId?: string;
      amount: number;
      note?: string;
      scenario?: 'repay' | 'gift' | 'bonus' | 'refund' | 'split' | 'support';
      kind?: 'transfer' | 'loan' | 'split' | 'refund';
      idempotencyKey?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
          sourceChatId?: string;
          idempotentHit?: boolean;
        }
      >('/api/banking/char-send', { method: 'POST', body: JSON.stringify(payload) }),
    getCharRequests: () => request<{ requests: BankingOverviewPayload['paymentRequests'] }>('/api/banking/char-requests'),
    createCharRequest: (payload: {
      characterId: string;
      amount: number;
      note?: string;
      description?: string;
      deadlineAt?: string;
      idempotencyKey?: string;
      targetAccountId?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          request: BankingOverviewPayload['paymentRequests'][number];
          transaction?: BankingTransactionDemo | null;
          receipt?: Record<string, unknown> | null;
          idempotentHit?: boolean;
        }
      >('/api/banking/char-requests', { method: 'POST', body: JSON.stringify(payload) }),
    respondCharRequest: (id: string, action: 'confirm' | 'cancel') =>
      request<
        BankingOverviewPayload & {
          request: BankingOverviewPayload['paymentRequests'][number];
          transaction?: BankingTransactionDemo | null;
          receipt?: Record<string, unknown> | null;
        }
      >(`/api/banking/char-requests/${encodeURIComponent(id)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    addBeneficiary: (payload: {
      name: string;
      account_number: string;
      bank_code: string;
      bank_name: string;
      alias?: string;
      is_favorite?: number;
    }) => request<BankingOverviewPayload>('/api/banking/beneficiaries', { method: 'POST', body: JSON.stringify(payload) }),
    togglePinBeneficiary: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/beneficiaries/${id}/pin`, { method: 'POST' }),
    deleteBeneficiary: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/beneficiaries/${id}`, { method: 'DELETE' }),
    updateAccountLimits: (daily_limit: number, monthly_limit: number, accountId?: string) =>
      request<BankingOverviewPayload>('/api/banking/account/limits', {
        method: 'PATCH',
        body: JSON.stringify({ daily_limit, monthly_limit, accountId }),
      }),
    issueCard: (payload: {
      bank_id?: string;
      card_tier?: string;
      card_type?: string;
      card_category?: 'debit' | 'credit';
      card_name?: string;
      card_nickname?: string;
      account_id?: string;
      daily_limit?: number;
      monthly_limit?: number;
      pin?: string;
      design_theme?: string;
    }) =>
      request<BankingOverviewPayload & { issuedCard?: BankingOverviewPayload['cards'][number] }>('/api/banking/cards', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    setPrimaryCard: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/cards/${id}/set-primary`, { method: 'POST' }),
    updateCard: (
      id: string,
      patch: {
        card_name?: string;
        card_nickname?: string;
        account_id?: string;
        status?: 'active' | 'locked';
        online_payment_enabled?: number;
        contactless_enabled?: number;
        intl_payment_enabled?: number;
        design_theme?: string;
        per_tx_limit?: number;
        daily_limit?: number;
        monthly_limit?: number;
        transfer_limit?: number;
        withdraw_limit?: number;
        online_limit?: number;
        pin?: string;
      }
    ) => request<BankingOverviewPayload>(`/api/banking/cards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    revealCard: (id: string, pin: string) =>
      request<CardRevealResult>(`/api/banking/cards/${encodeURIComponent(id)}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    changeCardPin: (id: string, currentPin: string, newPin: string) =>
      request<BankingOverviewPayload & { ok: boolean }>(`/api/banking/cards/${encodeURIComponent(id)}/pin`, {
        method: 'POST',
        body: JSON.stringify({ currentPin, newPin }),
      }),
    cancelCard: (id: string, pin: string) =>
      request<BankingOverviewPayload>(`/api/banking/cards/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    reissueCard: (id: string, pin: string) =>
      request<BankingOverviewPayload & { issuedCard?: BankingOverviewPayload['cards'][number] }>(
        `/api/banking/cards/${encodeURIComponent(id)}/reissue`,
        {
          method: 'POST',
          body: JSON.stringify({ pin }),
        }
      ),
    lookupCard: (payload: { cardId?: string; cardNumber?: string }) =>
      request<CardLookupResult>('/api/banking/cards/lookup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    chargeCard: (payload: {
      cardId?: string;
      cardNumber?: string;
      holderName?: string;
      expiry?: string;
      cvv?: string;
      amount: number;
      merchant: string;
      category?: string;
      channelType?: 'online' | 'pos' | 'intl';
      appSource?: string;
      idempotencyKey?: string;
      billId?: string;
      partnerId?: string;
      voucherId?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
          discountAmount?: number;
          fee?: number;
          cashbackEarned?: number;
          pointsEarned?: number;
          idempotentHit?: boolean;
        }
      >('/api/banking/cards/charge', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    payCardDemo: (id: string, payload: { merchant: string; amount: number }) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/cards/${id}/pay-demo`,
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    payCard: (
      id: string,
      payload: {
        merchant: string;
        amount: number;
        category?: string;
        billId?: string;
        partnerId?: string;
        voucherId?: string;
        channelType?: 'online' | 'pos' | 'intl';
        idempotencyKey?: string;
      }
    ) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
          discountAmount?: number;
          fee?: number;
          cashbackEarned?: number;
          pointsEarned?: number;
        }
      >(`/api/banking/cards/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
    upgradeCard: (id: string, targetTier?: string) =>
      request<
        BankingOverviewPayload & {
          upgradedCard: BankingOverviewPayload['cards'][number];
          fromTier: string;
          toTier: string;
        }
      >(`/api/banking/cards/${id}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ targetTier }),
      }),
    claimCardInterest: (id: string) =>
      request<BankingOverviewPayload & { interestAmount: number; daysAccrued: number; cycleKey: string }>(
        `/api/banking/cards/${id}/interest/claim`,
        { method: 'POST' }
      ),
    redeemCardReward: (id: string, catalogId: string) =>
      request<BankingOverviewPayload & { redeemed?: Record<string, unknown> }>(`/api/banking/cards/${id}/rewards/redeem`, {
        method: 'POST',
        body: JSON.stringify({ catalogId }),
      }),
    linkCard: (id: string, accountId: string) =>
      request<BankingOverviewPayload>(`/api/banking/cards/${id}/link`, {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      }),
    unlinkCard: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/cards/${id}/unlink`, {
        method: 'POST',
      }),
    openSavings: (payload: {
      product_type: string;
      product_name: string;
      principal: number;
      interest_rate: number;
      term_months: number;
      auto_renew?: number;
      accountId?: string;
    }) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        '/api/banking/savings',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    depositSavings: (id: string, amount: number) =>
      request<BankingOverviewPayload>(`/api/banking/savings/${id}/deposit`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    toggleSavingsAutoRenew: (id: string, auto_renew: number) =>
      request<BankingOverviewPayload>(`/api/banking/savings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ auto_renew }),
      }),
    earlyWithdrawSavings: (id: string) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/savings/${id}/early-withdraw`,
        { method: 'POST' }
      ),
    settleSavings: (id: string) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/savings/${id}/settle`,
        { method: 'POST' }
      ),
    applyLoan: (payload: {
      loan_type: string;
      loan_name: string;
      principal: number;
      interest_rate: number;
      term_months: number;
      counterparty_char_id?: string;
      direction?: 'borrow' | 'lend';
    }) => request<BankingOverviewPayload>('/api/banking/loans', { method: 'POST', body: JSON.stringify(payload) }),
    payLoanInstallment: (id: string) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/loans/${id}/pay`,
        { method: 'POST' }
      ),
    earlyPayoffLoan: (id: string) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/loans/${id}/early-payoff`,
        { method: 'POST' }
      ),
    lookupBill: (bill_type: string, customer_code: string) =>
      request<{
        found: boolean;
        bill: { provider: string; bill_type: string; amount: number; customer_code: string; due_date: string };
      }>('/api/banking/bills/lookup', { method: 'POST', body: JSON.stringify({ bill_type, customer_code }) }),
    createBill: (payload: {
      provider: string;
      bill_type: string;
      amount: number;
      due_date?: string;
      customer_code?: string;
      recurring_enabled?: number;
    }) => request<BankingOverviewPayload>('/api/banking/bills', { method: 'POST', body: JSON.stringify(payload) }),
    updateBill: (id: string, patch: { recurring_enabled?: number; is_saved?: number }) =>
      request<BankingOverviewPayload>(`/api/banking/bills/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    payBill: (id: string, payload?: { sourceAccountId?: string; sourceCardId?: string; idempotencyKey?: string }) =>
      request<BankingOverviewPayload & { transaction: BankingTransactionDemo; receipt: Record<string, unknown> }>(
        `/api/banking/bills/${id}/pay`,
        { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }
      ),
    payAiBill: (id: string, payer: 'ai' | 'user' = 'ai') =>
      request<BankingOverviewPayload>(`/api/banking/ai-bills/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ payer }),
      }),
    topupPhone: (payload: {
      simId?: string;
      carrierId?: string;
      carrier?: string;
      phone?: string;
      amount: number;
      sourceAccountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    }) =>
      request<
        BankingOverviewPayload & {
          transaction: BankingTransactionDemo;
          telecomTransaction?: TelecomTransaction;
          telecomOverview?: TelecomOverviewPayload;
          receipt: Record<string, unknown>;
        }
      >('/api/banking/topup', { method: 'POST', body: JSON.stringify(payload) }),
    tradeInvestment: (payload: { asset_code: string; side: 'buy' | 'sell'; amount: number }) =>
      request<BankingOverviewPayload>('/api/banking/investments/trade', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    createGoal: (payload: { title: string; target_amount: number; deadline: string; category?: string }) =>
      request<BankingOverviewPayload>('/api/banking/goals', { method: 'POST', body: JSON.stringify(payload) }),
    contributeGoal: (id: string, amount: number) =>
      request<BankingOverviewPayload>(`/api/banking/goals/${id}/contribute`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    deleteGoal: (id: string) => request<BankingOverviewPayload>(`/api/banking/goals/${id}`, { method: 'DELETE' }),
    updateTxCategory: (id: string, category: string) =>
      request<BankingOverviewPayload>(`/api/banking/transactions/${id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category }),
      }),
    upsertBudget: (payload: { category: string; monthly_limit: number; alert_threshold?: number }) =>
      request<BankingOverviewPayload>('/api/banking/budgets', { method: 'POST', body: JSON.stringify(payload) }),
    validateQr: (payload: string) =>
      request<{
        valid: boolean;
        accountNumber: string;
        recipientName: string;
        bankCode: string;
        bankName: string;
        amount: number;
        note: string;
      }>('/api/banking/qr/validate', { method: 'POST', body: JSON.stringify({ payload }) }),
    createPaymentRequest: (payload: { amount: number; note?: string; target_character_id?: string }) =>
      request<BankingOverviewPayload>('/api/banking/payment-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    markAllNotificationsRead: () =>
      request<BankingOverviewPayload>('/api/banking/notifications/read-all', { method: 'PATCH' }),
    markNotificationRead: (id: string) =>
      request<BankingOverviewPayload>(`/api/banking/notifications/${id}/read`, { method: 'PATCH' }),
    updateProfile: (patch: { holder_name?: string; avatar?: string; dob?: string; phone?: string; email?: string; address?: string }) =>
      request<BankingOverviewPayload>('/api/banking/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
    setPin: (pin: string) =>
      request<BankingOverviewPayload>('/api/banking/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
    changePassword: (newPassword: string) =>
      request<BankingOverviewPayload>('/api/banking/security/password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      }),
    lockApp: () => request<BankingOverviewPayload>('/api/banking/security/lock', { method: 'POST' }),
    unlockApp: (secret: string, method: 'pin' | 'password' | 'biometric') =>
      request<BankingOverviewPayload>('/api/banking/security/unlock', {
        method: 'POST',
        body: JSON.stringify({ secret, method }),
      }),
    updateSecuritySettings: (patch: {
      biometric_enabled?: number;
      notif_balance?: number;
      notif_security?: number;
      notif_promo?: number;
      unusual_alert_active?: number;
      app_lock_enabled?: number;
      removeDeviceId?: string;
    }) =>
      request<BankingOverviewPayload>('/api/banking/security/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    createSupportTicket: (payload: { category: string; subject: string; description: string; tx_ref?: string }) =>
      request<BankingOverviewPayload>('/api/banking/support/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    askSupportAi: (question: string) =>
      request<{ reply: string }>('/api/banking/support/ai-chat', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    verifyTx: (refOrId: string) =>
      request<{
        valid: boolean;
        simulated: boolean;
        signatureVerified: boolean;
        transaction: BankingTransactionDemo;
        receipt: Record<string, unknown>;
      }>(`/api/banking/verify-tx/${encodeURIComponent(refOrId)}`),
    saveBillImage: (id: string, dataUrl: string) =>
      request<{ ok: boolean; id: string }>(`/api/banking/transactions/${encodeURIComponent(id)}/bill-image`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      }),
    completeOnboarding: (payload: { holder_name?: string; avatar?: string }) =>
      request<BankingOverviewPayload>('/api/banking/onboarding', { method: 'POST', body: JSON.stringify(payload) }),
    updatePreferences: (patch: {
      theme_id?: string;
      assistant_char_id?: string;
      assistant_outfit?: string;
      assistant_expression?: string;
      unlock_outfit?: string;
      dashboard_wallpaper?: string;
      inactivity_lock_sec?: number;
      privacy_hide_balance?: boolean | number;
      hikari_banner_dismissed?: boolean | number;
      onboarding_completed?: boolean | number;
    }) =>
      request<BankingOverviewPayload>('/api/banking/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    resetUi: () => request<BankingOverviewPayload>('/api/banking/reset-ui', { method: 'POST' }),
    resetDemo: () => request<BankingOverviewPayload>('/api/banking/reset-demo', { method: 'POST' }),
  },
  telecom: {
    getOverview: () => request<TelecomOverviewPayload>('/api/telecom/overview'),
    buySim: (payload: {
      catalogId: string;
      aliasName?: string;
      setAsPrimary?: boolean;
      sourceAccountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    }) =>
      request<
        TelecomOverviewPayload & {
          purchasedSimId: string;
          phoneNumber: string;
          carrierName: string;
          amount: number;
          transaction: TelecomTransaction;
          bankTransaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
        }
      >('/api/telecom/sims/buy', { method: 'POST', body: JSON.stringify(payload) }),
    setPrimarySim: (simId: string) =>
      request<TelecomOverviewPayload>(`/api/telecom/sims/${encodeURIComponent(simId)}/primary`, { method: 'POST' }),
    updateSim: (simId: string, patch: { aliasName?: string; status?: 'active' | 'locked' | 'cancelled' }) =>
      request<TelecomOverviewPayload>(`/api/telecom/sims/${encodeURIComponent(simId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    topupSim: (payload: {
      simId?: string;
      phone?: string;
      carrierId?: string;
      amount: number;
      sourceAccountId?: string;
      sourceCardId?: string;
      idempotencyKey?: string;
    }) =>
      request<
        TelecomOverviewPayload & {
          simId: string;
          telecomTransaction: TelecomTransaction;
          transaction: BankingTransactionDemo;
          receipt: Record<string, unknown>;
        }
      >('/api/telecom/topup', { method: 'POST', body: JSON.stringify(payload) }),
    buyPackage: async (payload: {
      simId: string;
      packageId: string;
      confirmReplace?: boolean;
      idempotencyKey?: string;
    }) => {
      const res = await fetch('/api/telecom/packages/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error((data as { error?: string }).error || `Request failed (${res.status})`) as Error & {
          code?: string;
          details?: Record<string, unknown>;
        };
        err.code = (data as { code?: string }).code;
        err.details = data as Record<string, unknown>;
        throw err;
      }
      return data as TelecomOverviewPayload & {
        transaction: TelecomTransaction;
        userPackage: TelecomUserPackage;
      };
    },
    markNotificationsRead: () =>
      request<TelecomOverviewPayload>('/api/telecom/notifications/read-all', { method: 'PATCH' }),
  },
};




