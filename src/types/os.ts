export type AppId =
  | 'phone'
  | 'messages'
  | 'browser'
  | 'camera'
  | 'photos'
  | 'characters'
  | 'social'
  | 'assistant'
  | 'contacts'
  | 'mail'
  | 'calendar'
  | 'reminders'
  | 'notes'
  | 'files'
  | 'maps'
  | 'weather'
  | 'clock'
  | 'calculator'
  | 'music'
  | 'video'
  | 'recorder'
  | 'scanner'
  | 'appstore'
  | 'settings'
  | 'health'
  | 'wallet'
  | 'passwords'
  | 'translate'
  | 'news'
  | 'books'
  | 'shortcuts'
  | 'games'
  | 'podcast'
  | 'shopping'
  | 'food'
  | 'banking'
  | 'ride'
  | 'office'
  | 'community'
  | 'smarthome'
  | 'youtube'
  | 'movies'
  | 'musichub'
  | 'telecom';

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  joined_at: string;
  pin_code: string;
  has_lock_secret?: boolean;
  has_recovery_code?: boolean;
  recovery_email?: string;
  schema_version?: string;
  aod_timeout_sec?: number;
  gestures_enabled?: number;
  gesture_sensitivity?: 'low' | 'normal' | 'high';
  unlock_mode: 'swipe' | 'pin' | 'password' | 'pattern';
  theme: 'light' | 'dark';
  wallpaper: string;
  lock_clock_style: 'modern' | 'editorial' | 'minimal';
  lock_clock_font: 'display' | 'mono' | 'serif';
  lock_clock_color: string;
  aod_enabled: number;
  hide_sensitive_lock: number;
  font_size: 'small' | 'medium' | 'large';
  icon_size: 'compact' | 'medium' | 'large';
  battery_level: number;
  battery_saver: number;
  dnd: number;
  silent_mode: number;
  airplane_mode: number;
  wifi_on: number;
  bluetooth_on: number;
  mobile_data_on: number;
  hotspot_on: number;
  brightness: number;
  volume: number;
  permissions_json: string;
  boot_count: number;

  // OS 3.0 extensions
  bio?: string;
  language?: string;
  timezone?: string;
  clock_24h?: number;
  game_time_offset_min?: number;
  show_battery_pct?: number;
  low_battery_threshold?: number;
  auto_saver_threshold?: number;
  charging?: number;
  fast_charging?: number;
  vpn_on?: number;
  nfc_on?: number;
  selected_wifi?: string;
  sound_profile?: 'normal' | 'vibrate' | 'silent';
  vol_ring?: number;
  vol_notif?: number;
  vol_media?: number;
  vol_call?: number;
  vol_alarm?: number;
  sys_sounds?: number;
  kb_sounds?: number;
  cam_shutter?: number;
  haptic_touch?: number;
  haptic_call?: number;
  haptic_msg?: number;
  vibrate_intensity?: 'light' | 'medium' | 'strong';
  vibrate_pattern?: 'pulse' | 'double' | 'short';
  ringtone?: string;
  msg_tone?: string;
  notif_tone?: string;
  auto_lock_sec?: number;
  font_weight?: 'normal' | 'bold';
  ui_zoom?: 'compact' | 'normal' | 'large';
  anim_level?: 'full' | 'reduced' | 'none';
  high_contrast?: number;
  reduce_motion?: number;
  icon_labels?: number;
  lock_wallpaper?: string;
  wallpaper_pos?: string;
  transition_style?: 'slide' | 'zoom' | 'fade';
  pin_length?: number;
  guest_mode?: number;
  failed_unlock_count?: number;
  focus_mode?: 'off' | 'work' | 'sleep' | 'study';
  focus_schedule_json?: string;
  muted_apps_json?: string;
  quiet_start?: string;
  quiet_end?: string;
  proactive_ai_enabled?: number;
  proactive_ai_level?: 'low' | 'medium' | 'high';
  ai_memory_enabled?: number;
  home_columns?: number;
  icon_pack?: string;
  dock_pos?: 'bottom' | 'left';
  kb_theme?: 'auto' | 'light' | 'dark' | 'lavender';
  kb_height?: 'compact' | 'medium' | 'tall';
}

export interface InstalledApp {
  app_id: AppId;
  name: string;
  category: string;
  installed: number;
  pinned_dock: number;
  dock_order: number;
  page_index: number;
  sort_order: number;
  folder_name: string;
  hidden: number;
  version: string;
  size_mb: number;
  author: string;
  reality_type: 'A' | 'B' | 'A/B' | 'B/C';
  description: string;
  usage_count: number;
  last_opened_at: string;
}

export interface OSNotification {
  id: string;
  app_id: string;
  group_key: string;
  title: string;
  body: string;
  avatar: string;
  action_route: string;
  action_payload: string;
  priority: number;
  is_read: number;
  created_at: string;
}

export interface Character {
  id: string;
  name: string;
  age: number;
  tagline: string;
  personality: string;
  bio: string;
  likes: string;
  dislikes: string;
  voice_name: string;
  voice_style: string;
  avatar: string;
  scenario: string;
  greeting: string;
  author: string;
  interactions_count: number;
  is_followed: number;
  is_favorite: number;
  relationship_level: number;
  relationship_xp: number;
  mood: string;
  schedule_json: string;
  is_featured: number;
  pronouns?: string;
  cover_image?: string;
  speaking_style?: string;
  role_title?: string;
  other_relations_json?: string;
  activity_status?: string;
  is_blocked?: number;
  memory_enabled?: number;
  content_boundary?: 'standard' | 'strict' | 'platonic';
  proactive_msg_enabled?: number;
  proactive_call_enabled?: number;
  proactive_photo_enabled?: number;
  proactive_notif_enabled?: number;
  personality_json?: string;
  background_json?: string;
  speech_style_json?: string;
  proactive_settings_json?: string;
  genres_json?: string;
  sample_dialogues_json?: string;
  content_notice?: string;
  privacy?: 'public' | 'private';
  is_hidden?: number;
  is_custom?: number;
  has_story_mode?: number;
  created_at?: string;
  updated_at?: string;
  gender?: 'male' | 'female' | 'unknown' | string;
  style?: 'anime' | 'realistic' | string;
  system_prompt?: string;
  memory_prompt?: string;
  emotional_behavior?: string;
  response_style_json?: string;
  // Unified Character System (Phone OS 3.0)
  username?: string;
  occupation?: string;
  city?: string;
  join_social?: number;
  is_verified?: number;
  social_bio?: string;
  relationship_label?: string;
  // Extended 8-Section Character Profile (Update 2.X)
  full_name?: string;
  nickname?: string;
  birthday?: string;
  height?: string;
  body_type?: string;
  hair_color?: string;
  hair_style?: string;
  eye_color?: string;
  outfit_style?: string;
  living_place?: string;
  zodiac?: string;
  fears?: string;
  goals?: string;
  past_story?: string;
  family_relations?: string;
  turning_events?: string;
  long_term_goal?: string;
  secrets?: string;
  world_rules?: string;
  timeline_json?: string;
  gallery_json?: string;
  chat_wallpaper?: string;
  hangout_spots_json?: string;
  related_characters_json?: string;
  catchphrases_json?: string;
  conversation_starters_json?: string;
  storylines_json?: string;
  user_call_name?: string;
  reply_length_default?: string;
  intimacy_pace?: string;
  favorite_topics?: string;
}

export interface CharacterMemory {
  id: string;
  character_id: string;
  user_id?: string;
  memory_type: 'short_term' | 'long_term' | 'relationship' | 'preference' | 'event';
  content: string;
  importance: number;
  confidence?: number;
  source_message_id?: string;
  source_kind?: 'user_requested' | 'ai_inferred' | 'manual';
  created_at: string;
  updated_at?: string;
  is_active?: number;
  is_pinned?: number;
  emotional_context?: string;
}

export interface ResponseTuningOptions {
  length?: 'short' | 'medium' | 'long';
  detail?: 'concise' | 'balanced' | 'rich';
  humor?: 'low' | 'balanced' | 'playful';
  proactivity?: 'low' | 'medium' | 'high';
  narration?: 'chat' | 'novel' | 'roleplay';
  pronouns?: string;
  language?: 'vi' | 'en' | 'ja' | string;
}

export interface DokiUserSettings {
  id: string;
  theme_mode: 'auto' | 'light' | 'dark';
  bubble_style: 'glass' | 'pastel' | 'minimal';
  wallpaper: string;
  font_size: 'small' | 'medium' | 'large';
  sound_enabled: number;
  haptic_enabled: number;
  proactive_enabled: number;
  proactive_frequency: 'low' | 'medium' | 'high';
  quiet_start: string;
  quiet_end: string;
  default_response_length: 'short' | 'medium' | 'long';
  default_detail_level: 'concise' | 'balanced' | 'rich';
  default_creativity: 'low' | 'medium' | 'high';
  default_humor: 'low' | 'balanced' | 'playful';
  default_language: string;
  default_narration: 'chat' | 'novel' | 'roleplay';
  tts_speed: number;
  updated_at: string;
}

export interface AiProviderConfig {
  id: string;
  provider_name: string;
  model_id: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | string;
  fallback_model_id: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | string;
  thinking_level: 'LOW' | 'MEDIUM' | string;
  streaming_enabled: number;
  max_tokens: number;
  timeout_ms: number;
  apiKeyConfigured: boolean;
  isLocked?: boolean;
  canEdit?: boolean;
  allowedModels: Array<{ id: string; label: string; description: string }>;
  updated_at: string;
}

export interface StickerStatRecord {
  id: string;
  sticker_id: string;
  item_type: 'sticker' | 'gif';
  payload_json: string;
  is_favorite: number;
  use_count: number;
  last_used_at: string;
}

export interface RoleplayScenario {
  id: string;
  character_id: string;
  title: string;
  genre: string;
  description: string;
  user_role: string;
  ai_role: string;
  opening_scene: string;
  branches_json: string;
  created_at: string;
}

export interface RelationshipEventRecord {
  id: string;
  character_id: string;
  event_type: string;
  description: string;
  affection_delta: number;
  trust_delta: number;
  familiarity_delta: number;
  respect_delta: number;
  emotion_tag: string;
  created_at: string;
}

export interface CallSessionRecord {
  id: string;
  character_id: string;
  call_type: 'voice' | 'video';
  duration_sec: number;
  transcript_json: string;
  emotion_summary: string;
  created_at: string;
}

export interface DokiProfileOverview {
  profile: {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar: string;
    bio?: string;
    joined_at: string;
  };
  stats: {
    sentCount: number;
    totalChars: number;
    favCount: number;
    customCount: number;
    memCount: number;
    callCount: number;
  };
  recentRelEvents: RelationshipEventRecord[];
}

export interface Contact {
  id: string;
  name: string;
  nickname: string;
  phone: string;
  email: string;
  birthday: string;
  address: string;
  company: string;
  role: string;
  website: string;
  notes: string;
  avatar: string;
  is_favorite: number;
  is_blocked: number;
  is_ai: number;
  character_id: string;
  group_name: string;
}

export interface CallRecord {
  id: string;
  contact_id: string;
  name: string;
  phone: string;
  avatar: string;
  direction: 'incoming' | 'outgoing' | 'missed' | 'rejected';
  is_ai: number;
  character_id: string;
  duration_sec: number;
  voicemail_text: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  is_group: number;
  avatar: string;
  character_id: string;
  members_json: string;
  pinned: number;
  archived: number;
  muted: number;
  unread_count: number;
  wallpaper: string;
  bubble_color: string;
  roleplay_mode: number;
  updated_at: string;
  last_message_id?: string;
  settings_json?: string;
  roleplay_state_json?: string;
  group_mode?: 'mention_only' | 'turn_based' | 'open_discussion';
  max_ai_turns?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'character' | 'system';
  sender_id: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  msg_type: 'text' | 'image' | 'voice' | 'location' | 'contact' | 'file' | 'sticker' | 'event' | 'video' | 'system';
  attachment_json: string;
  reply_to_id: string;
  reactions_json: string;
  is_edited: number;
  is_pinned: number;
  created_at: string;
  delivery_status?: 'sending' | 'sent' | 'failed' | 'queued';
  edited_at?: string;
  deleted_at?: string;
  deleted_scope?: string;
  is_saved?: number;
  metadata_json?: string;
  client_temp_id?: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  member_type: 'user' | 'character';
  member_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  muted: number;
  is_active: number;
}

export interface ChatSummaryRecord {
  id: string;
  conversation_id: string;
  summary: string;
  covered_until_message_id: string;
  version: number;
  created_at: string;
}

export interface ProactiveJobRecord {
  id: string;
  character_id: string;
  conversation_id: string;
  scheduled_at: string;
  reason: string;
  status: string;
  message_id: string;
  created_at: string;
}

export interface ChatSearchHistoryItem {
  id: string;
  query: string;
  scope: string;
  created_at: string;
}

export interface SocialPost {
  id: string;
  author_type: 'user' | 'character';
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  media_url: string;
  media_type: string;
  hashtags_json: string;
  likes_count: number;
  is_liked: number;
  is_saved: number;
  created_at: string;
}

export interface SocialComment {
  id: string;
  post_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  created_at: string;
}

export interface SocialStory {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  media_url: string;
  caption: string;
  viewed: number;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  type: 'photo' | 'video';
  title: string;
  data_url: string;
  album: string;
  is_favorite: number;
  is_deleted: number;
  deleted_at: string;
  location_name: string;
  character_id: string;
  tags_json: string;
  created_at: string;
  category?: string;
  caption?: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  folder: string;
  is_pinned: number;
  is_locked: number;
  is_deleted: number;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_iso: string;
  end_iso: string;
  all_day: number;
  location: string;
  notes: string;
  color: string;
  reminder_min: number;
  repeat_rule: string;
  character_id: string;
  attendees_json: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  notes: string;
  due_date: string;
  due_time: string;
  priority: 'low' | 'medium' | 'high';
  list_name: string;
  is_completed: number;
  repeat_rule: string;
  synced_calendar_id: string;
}

export interface EmailItem {
  id: string;
  folder: 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive';
  from_name: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  attachment_name: string;
  attachment_content: string;
  is_starred: number;
  is_read: number;
  labels_json: string;
  created_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  folder: string;
  mime_type: string;
  size_bytes: number;
  content_text: string;
  data_url: string;
  is_favorite: number;
  updated_at: string;
}

export interface RecordingItem {
  id: string;
  title: string;
  duration_sec: number;
  data_url: string;
  mime_type: string;
  transcript: string;
  created_at: string;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  folder: string;
  created_at: string;
}

export interface BrowserHistoryItem {
  id: string;
  title: string;
  url: string;
  visited_at: string;
}

export interface AlarmItem {
  id: string;
  time_str: string;
  label: string;
  repeat_days: string;
  sound: string;
  enabled: number;
}

export interface WorldClockItem {
  id: string;
  city: string;
  timezone: string;
}

export interface HealthLog {
  id: string;
  log_type: 'steps' | 'water' | 'sleep' | 'weight' | 'workout';
  value_num: number;
  unit: string;
  label: string;
  extra_json: string;
  logged_at: string;
}

export interface WalletCard {
  id: string;
  card_type: 'member' | 'gift' | 'event' | 'transit';
  title: string;
  subtitle: string;
  code_value: string;
  color: string;
  expires_at: string;
}

export interface VaultItem {
  id: string;
  site: string;
  username: string;
  encrypted_payload: string;
  iv_hex: string;
  notes: string;
  updated_at: string;
}

export interface ShortcutRule {
  id: string;
  name: string;
  trigger_event: string;
  action_type: string;
  action_payload: string;
  enabled: number;
  last_run: string;
  run_count: number;
}

export interface TranslationRecord {
  id: string;
  source_lang: string;
  target_lang: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  cover_color: string;
  pages_json: string;
  current_page: number;
  bookmarks_json: string;
  is_favorite: number;
}

export interface GameScore {
  id: string;
  game_id: string;
  score: number;
  detail: string;
  played_at: string;
}

// OS 3.0 Interfaces
export interface DeviceItem {
  id: string;
  name: string;
  platform: string;
  last_active: string;
  is_current: number;
}

export interface WifiNetwork {
  ssid: string;
  security: string;
  signal: number;
  is_saved: number;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  device_type: string;
  connected: number;
  paired: number;
  battery_pct: number;
}

export interface BatteryHistoryPoint {
  id: string;
  level: number;
  charging: number;
  recorded_at: string;
}

export interface AppPermissionItem {
  app_id: string;
  permission_key: string;
  status: 'granted' | 'while_using' | 'denied' | 'prompt';
  reason: string;
  last_accessed_at: string;
}

export interface HomeWidget {
  id: string;
  widget_type: 'weather_calendar' | 'ai_companion' | 'music_podcast' | 'health_battery' | 'notes_reminders' | 'banking_summary';
  title: string;
  size: '2x2' | '4x2';
  page_index: number;
  sort_order: number;
  config_json: string;
}

export interface BackupRecord {
  id: string;
  schema_version: string;
  os_version: string;
  integrity_hash: string;
  size_kb: number;
  summary_json: string;
  created_at: string;
}

export interface SyncJobRecord {
  id: string;
  category: string;
  status: string;
  conflict_policy: string;
  synced_at: string;
  detail: string;
}

export interface SystemErrorRecord {
  id: string;
  app_id: string;
  error_code: string;
  message: string;
  detail: string;
  resolved: number;
  created_at: string;
}

export interface ScheduledJobRecord {
  id: string;
  job_type: string;
  target_id: string;
  title: string;
  payload_json: string;
  run_at: string;
  status: string;
  retry_count: number;
  created_at: string;
}

export interface AiRelationshipRecord {
  character_id: string;
  affection: number;
  trust: number;
  familiarity: number;
  respect: number;
  jealousy: number;
  conflict: number;
  stage: string;
  history_json: string;
  updated_at: string;
}

export interface AiEventRecord {
  id: string;
  character_id: string;
  chapter: number;
  event_type: string;
  title: string;
  summary: string;
  choices_json: string;
  chosen_option: string;
  impact_json: string;
  status: 'available' | 'completed' | 'skipped';
  created_at: string;
}

export interface PodcastChannel {
  id: string;
  title: string;
  host: string;
  category: string;
  description: string;
  cover_url: string;
  is_followed: number;
}

export interface PodcastEpisode {
  id: string;
  podcast_id: string;
  title: string;
  description: string;
  duration_sec: number;
  progress_sec: number;
  is_downloaded: number;
  is_favorite: number;
  published_at: string;
}

export interface ShoppingProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  original_price: number;
  rating: number;
  stock: number;
  image_url: string;
  description: string;
  variants_json: string;
  is_featured: number;
}

export interface ShoppingCartItem {
  id: string;
  product_id: string;
  quantity: number;
  selected_variant: string;
}

export interface ShoppingOrder {
  id: string;
  items_json: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  coupon_code: string;
  address: string;
  status: string;
  history_json: string;
  created_at: string;
}

export interface FoodRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  eta_min: number;
  price_tier: string;
  hours: string;
  address: string;
  image_url: string;
  menu_json: string;
}

export interface FoodOrder {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  items_json: string;
  total: number;
  delivery_address: string;
  payment_method: string;
  status: string;
  driver_name: string;
  driver_plate: string;
  rating: number;
  review_text: string;
  created_at: string;
}

export interface BankingAccountDemo {
  id: string;
  bank_name: string;
  account_number: string;
  holder_name: string;
  balance: number;
  has_pin?: boolean;
  account_type?: string;
  available_balance?: number;
  held_balance?: number;
  daily_limit?: number;
  monthly_limit?: number;
  status?: string;
  opened_at?: string;
  nickname?: string;
  avatar?: string;
  is_hidden?: number;
  is_primary?: number;
  package_tier?: string;
  owner_type?: 'user' | 'ai';
  character_id?: string;
  account_role?: 'payment' | 'sub' | 'receive_only' | 'ai';
  financial_personality?: string;
  personality_label?: string;
  character_name?: string;
  character_mood?: string;
  monthly_income?: number;
  monthly_expense?: number;
}

export type BillTemplateType =
  | 'transfer'
  | 'receive'
  | 'topup'
  | 'bill'
  | 'shopping'
  | 'withdraw'
  | 'savings_open'
  | 'savings_settle'
  | 'loan_pay'
  | 'ai_tx'
  | 'refund'
  | 'failed';

export interface BankingTransactionDemo {
  id: string;
  account_id: string;
  tx_type: 'income' | 'expense';
  amount: number;
  counterparty: string;
  note: string;
  status: string;
  created_at: string;
  category?: string;
  channel?: string;
  bank_name?: string;
  account_number?: string;
  fee?: number;
  balance_after?: number;
  ref_code?: string;
  receipt_json?: string;
  bill_template?: BillTemplateType;
  linked_ref?: string;
  sender_name?: string;
  sender_account?: string;
  sender_avatar?: string;
  recipient_avatar?: string;
  client_tx_id?: string;
  target_account_id?: string;
  is_ai_tx?: number;
  bill_image_url?: string;
  receipt_sig?: string;
  completed_at?: string;
  failure_reason?: string;
  source_type?: string;
  source_chat_id?: string;
  total_debit?: number;
  idempotency_key?: string;
  source_card_id?: string;
  source_card_last4?: string;
  tx_status_code?: string;
}

export interface BankingBillDemo {
  id: string;
  provider: string;
  bill_type: string;
  amount: number;
  due_date: string;
  is_paid: number;
  paid_at: string;
  customer_code?: string;
  is_saved?: number;
  recurring_enabled?: number;
  recurring_day?: number;
}

export interface BankingAiBill {
  id: string;
  character_id: string;
  title: string;
  bill_type: string;
  amount: number;
  due_date: string;
  is_paid: number;
  recurring_enabled: number;
  created_at: string;
}

export interface BankingBeneficiary {
  id: string;
  name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  is_internal: number;
  alias: string;
  is_favorite: number;
  last_used_at: string;
}

export type BankBrandId = 'hikari' | 'sakura' | 'akuma' | 'tsuki' | 'aoi';
export type CardTierId = 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'infinite';

export interface CardTierUpgradeReq {
  minLinkedBalance: number;
  minTotalAssets: number;
  minCardSpend: number;
  minTxCount: number;
  minRewardPoints: number;
}

export interface CardTierPolicy {
  tierId: CardTierId;
  tierLabel: string;
  cardTitle: string;
  cashbackRate: number;
  interestRate: number;
  interestBalanceCap: number;
  txFeePct: number;
  fixedTxFee: number;
  withdrawFee: number;
  intlFeePct: number;
  maintenanceFee: number;
  rewardPointRate: number;
  perTxLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  transferLimit: number;
  withdrawLimit: number;
  onlineLimit: number;
  cashbackCapMonth: number;
  creditLimit: number;
  benefits: string[];
  upgradeReq: CardTierUpgradeReq;
}

export interface CardBankBrand {
  id: BankBrandId;
  name: string;
  jp_name: string;
  short_code: string;
  tagline: string;
  specialty: string;
  network_brand: string;
  bin_prefix: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_variant: BankBrandId;
  tier_policies: Record<CardTierId | string, CardTierPolicy>;
}

export interface CardPartnerOffer {
  id: string;
  merchant_name: string;
  category: string;
  bank_id: string;
  min_tier: CardTierId | string;
  cashback_bonus_pct: number;
  discount_pct: number;
  max_discount?: number;
  points_bonus_pct?: number;
  default_amount?: number;
  description: string;
  conditions_text?: string;
  accent_color?: string;
  is_active: number;
}

export interface CardRewardCatalogItem {
  id: string;
  title: string;
  description: string;
  item_type: 'cash_bonus' | 'voucher' | 'item' | 'perk' | string;
  points_cost: number;
  cash_value: number;
  voucher_discount_pct: number;
  voucher_max_discount: number;
  min_tier: CardTierId | string;
  category: string;
  is_active: number;
}

export interface CardUserVoucher {
  id: string;
  card_id: string;
  catalog_id: string;
  title: string;
  reward_type?: string;
  voucher_code: string;
  code?: string;
  cash_value?: number;
  discount_pct: number;
  max_discount: number;
  min_spend?: number;
  category: string;
  status: 'available' | 'used' | string;
  redeemed_at: string;
  used_at: string;
}

export interface CardPointsLedgerItem {
  id: string;
  card_id: string;
  tx_id: string;
  delta: number;
  balance_after: number;
  source: string;
  detail: string;
  created_at: string;
}

export interface CardCashbackLogItem {
  id: string;
  card_id: string;
  account_id: string;
  source_tx_id: string;
  merchant: string;
  category: string;
  spend_amount: number;
  cashback_rate: number;
  cashback_amount: number;
  created_at: string;
}

export interface CardInterestLogItem {
  id: string;
  card_id: string;
  account_id: string;
  cycle_key: string;
  balance_snapshot: number;
  annual_rate: number;
  days_accrued: number;
  interest_amount: number;
  tx_id: string;
  created_at: string;
}

export interface CardUpgradeCheck {
  key: string;
  label: string;
  current: number;
  required: number;
  passed: boolean;
}

export interface CardUpgradeStatus {
  hasNextTier: boolean;
  nextTier: CardTierId | null;
  nextTierLabel: string | null;
  nextCardTitle?: string;
  nextCashbackRate?: number;
  nextInterestRate?: number;
  nextDailyLimit?: number;
  eligible: boolean;
  checks: CardUpgradeCheck[];
  missingReasons: string[];
}

export interface CardInterestPreview {
  eligibleBalance: number;
  interestRate: number;
  elapsedDays: number;
  estimatedInterest: number;
  alreadyClaimedToday: boolean;
  cycleKey: string;
}

export interface BankingCardItem {
  id: string;
  account_id: string;
  card_type:
    | 'domestic_debit'
    | 'international_debit'
    | 'credit'
    | 'premium'
    | 'platinum'
    | 'black_edition'
    | 'virtual'
    | 'hikari_classic'
    | 'hikari_premier'
    | 'hikari_anime'
    | 'hikari_character'
    | string;
  card_name: string;
  card_nickname?: string;
  is_primary?: number;
  masked_number: string;
  last4: string;
  expiry: string;
  cvv: string;
  holder_name: string;
  status: 'active' | 'locked' | 'cancelled';
  card_category?: 'debit' | 'credit';
  issued_at?: string;
  locked_at?: string;
  unlocked_at?: string;
  cancelled_at?: string;
  replaced_by_card_id?: string;
  online_payment_enabled: number;
  contactless_enabled: number;
  intl_payment_enabled?: number;
  daily_limit: number;
  monthly_limit: number;
  spent_month: number;
  credit_limit: number;
  has_pin?: boolean;
  has_card_pin?: boolean;
  design_theme: string;
  created_at: string;
  bank_id?: BankBrandId | string;
  bank_name?: string;
  bank_jp_name?: string;
  bank_short_code?: string;
  bank_primary_color?: string;
  bank_secondary_color?: string;
  bank_accent_color?: string;
  card_tier?: CardTierId | string;
  tier_label?: string;
  network_brand?: string;
  cashback_rate?: number;
  interest_rate?: number;
  tx_fee_pct?: number;
  fixed_tx_fee?: number;
  withdraw_fee?: number;
  intl_fee_pct?: number;
  maintenance_fee?: number;
  reward_point_rate?: number;
  reward_points?: number;
  per_tx_limit?: number;
  transfer_limit?: number;
  withdraw_limit?: number;
  online_limit?: number;
  spent_today?: number;
  spent_date?: string;
  cashback_cap_month?: number;
  cashback_used_month?: number;
  interest_balance_cap?: number;
  last_interest_at?: string;
  linked_status?: 'linked' | 'unlinked' | string;
  linked_account_number?: string;
  linked_account_name?: string;
  linked_balance?: number;
  benefits?: string[];
  tx_count?: number;
  total_card_spend?: number;
  upgrade_status?: CardUpgradeStatus;
  interest_preview?: CardInterestPreview;
}

export interface CardBillItem {
  id: string;
  title: string;
  merchant_name: string;
  category: string;
  partner_id: string;
  amount: number;
  due_date: string;
  description: string;
  status: 'unpaid' | 'completed';
  paid_at: string;
  paid_tx_id: string;
  paid_card_id: string;
  cashback_bonus_pct: number;
  discount_pct: number;
  created_at: string;
}

export interface CardRevealResult {
  cardId: string;
  cardNumber: string;
  cardNumberDigits: string;
  cvv: string;
  expiry: string;
  holderName: string;
  issuedAt: string;
  cardCategory: 'debit' | 'credit';
  maskedNumber: string;
  expiresInSec: number;
}

export interface CardLookupResult {
  found: boolean;
  bankName?: string;
  bankShortCode?: string;
  cardCategory?: 'debit' | 'credit';
  tierLabel?: string;
  maskedNumber?: string;
  last4?: string;
  holderName?: string;
  status?: 'active' | 'locked' | 'cancelled';
}

export interface BankingSavingsBook {
  id: string;
  account_id: string;
  product_type: 'demand' | 'term' | 'online' | 'accumulation' | 'flexible';
  product_name: string;
  principal: number;
  interest_rate: number;
  term_months: number;
  opened_at: string;
  maturity_date: string;
  expected_interest: number;
  auto_renew: number;
  status: 'active' | 'settled';
  settled_at: string;
  actual_payout: number;
}

export interface BankingLoanItem {
  id: string;
  account_id: string;
  loan_type: string;
  loan_name: string;
  principal: number;
  remaining_balance: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  paid_months: number;
  next_due_date: string;
  status: 'active' | 'paid_off';
  schedule_json: string;
  created_at: string;
  counterparty_char_id?: string;
  direction?: 'borrow' | 'lend';
}

export interface BankingBudgetItem {
  id: string;
  category: string;
  monthly_limit: number;
  alert_threshold: number;
}

export interface BankingNotificationItem {
  id: string;
  notif_type: string;
  title: string;
  body: string;
  amount: number;
  is_read: number;
  ref_id: string;
  created_at: string;
}

export interface BankingPaymentRequest {
  id: string;
  account_id: string;
  target_character_id: string;
  requester_name: string;
  amount: number;
  note: string;
  qr_payload: string;
  status: string;
  ref_tx_id: string;
  created_at: string;
  description?: string;
  responded_at?: string;
  response_message?: string;
  proposed_amount?: number;
  deadline_at?: string;
  source_chat_id?: string;
  transaction_id?: string;
}

export type CharTransferRequest = BankingPaymentRequest;

export interface BankingInvestmentItem {
  id: string;
  account_id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  units: number;
  avg_buy_price: number;
  current_price: number;
  invested_amount: number;
  status: string;
  updated_at: string;
}

export interface BankingSavingsGoal {
  id: string;
  account_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  category: string;
  auto_save_amount: number;
  status: string;
  created_at: string;
}

export interface BankingSupportTicket {
  id: string;
  category: string;
  subject: string;
  description: string;
  tx_ref: string;
  status: string;
  admin_reply: string;
  created_at: string;
  updated_at: string;
}

export interface BankingSecurityState {
  id: string;
  has_password?: boolean;
  biometric_enabled: number;
  notif_balance: number;
  notif_security: number;
  notif_promo: number;
  kyc_status: string;
  id_number: string;
  kyc_verified_at: string;
  unusual_alert_active: number;
  devices_json: string;
  login_logs_json: string;
  app_lock_enabled?: number;
  is_logged_out?: number;
  failed_pin_count?: number;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  reward_points?: number;
}

export interface BankingComputedStats {
  totalAssets: number;
  availableBalance: number;
  heldBalance: number;
  totalSavings: number;
  totalInvestments: number;
  totalDebt: number;
  monthlyIncome: number;
  monthlyExpense: number;
  totalReceived: number;
  totalTransferred: number;
  tierName: 'Standard' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Private Banking';
  nextTier: string;
  nextThreshold: number;
  tierProgressPct: number;
}

export type BankingThemeId = 'coral' | 'sakura' | 'sumi' | 'sunrise';

export interface BankingPreferences {
  customer_code: string;
  theme_id: BankingThemeId;
  assistant_char_id: string;
  assistant_outfit: string;
  assistant_expression: string;
  unlocked_outfits: string[];
  dashboard_wallpaper: string;
  inactivity_lock_sec: number;
  privacy_hide_balance: boolean;
  hikari_banner_dismissed: boolean;
  onboarding_completed: boolean;
}

export interface BankingReceiptRecord {
  id: string;
  transaction_id: string;
  ref_code: string;
  receipt_json: string;
  signature: string;
  image_reference?: string;
  created_at: string;
}

export interface BankingLedgerAuditItem {
  id: string;
  event_type: string;
  account_id: string;
  transaction_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  detail: string;
  created_at: string;
}

export interface BankingOverviewPayload {
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  aiAccounts: BankingAccountDemo[];
  transactions: BankingTransactionDemo[];
  bills: BankingBillDemo[];
  aiBills: BankingAiBill[];
  beneficiaries: BankingBeneficiary[];
  cards: BankingCardItem[];
  cardBills?: CardBillItem[];
  cardBanks?: CardBankBrand[];
  cardPartners?: CardPartnerOffer[];
  cardRewardCatalog?: CardRewardCatalogItem[];
  cardVouchers?: CardUserVoucher[];
  cardPointsLedger?: CardPointsLedgerItem[];
  cardCashbackLogs?: CardCashbackLogItem[];
  cardInterestLogs?: CardInterestLogItem[];
  savings: BankingSavingsBook[];
  loans: BankingLoanItem[];
  budgets: BankingBudgetItem[];
  notifications: BankingNotificationItem[];
  security: BankingSecurityState | null;
  preferences?: BankingPreferences | null;
  paymentRequests: BankingPaymentRequest[];
  charRequests?: BankingPaymentRequest[];
  investments: BankingInvestmentItem[];
  savingsGoals: BankingSavingsGoal[];
  supportTickets: BankingSupportTicket[];
  receipts?: BankingReceiptRecord[];
  auditLogs?: BankingLedgerAuditItem[];
  telecomCarriers?: TelecomCarrier[];
  telecomSims?: TelecomUserSim[];
  computedStats: BankingComputedStats;
}

export interface RideTrip {
  id: string;
  pickup: string;
  dropoff: string;
  vehicle_type: string;
  fare: number;
  driver_name: string;
  vehicle_plate: string;
  eta_min: number;
  status: string;
  rating: number;
  created_at: string;
}

export interface OfficeDoc {
  id: string;
  title: string;
  doc_type: 'document' | 'spreadsheet' | 'presentation' | 'pdf';
  folder: string;
  content_json: string;
  is_pinned: number;
  is_shared: number;
  version: number;
  updated_at: string;
}

export interface CommunityGroup {
  id: string;
  name: string;
  topic: string;
  description: string;
  is_private: number;
  is_joined: number;
  members_count: number;
}

export interface CommunityPost {
  id: string;
  group_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  title: string;
  content: string;
  media_url: string;
  link_url: string;
  likes_count: number;
  is_liked: number;
  is_saved: number;
  is_hidden: number;
  reported: number;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  parent_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  created_at: string;
}

export interface SmartDevice {
  id: string;
  room: string;
  name: string;
  device_type: string;
  is_on: number;
  value_num: number;
  unit: string;
  is_online: number;
}

export interface SmartScene {
  id: string;
  name: string;
  schedule_time: string;
  auto_enabled: number;
  actions_json: string;
}

export interface SmartLog {
  id: string;
  device_name: string;
  action: string;
  created_at: string;
}

export interface SharePayload {
  title: string;
  text?: string;
  url?: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video' | 'file' | 'location' | 'contact' | 'event';
  sourceApp?: string;
  extra?: Record<string, unknown>;
}

export interface ActiveCallState {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  isAi: boolean;
  isVideo?: boolean;
  characterId?: string;
  status: 'incoming' | 'ringing' | 'connected';
  startedAt: number;
  muted: boolean;
  speaker: boolean;
  onHold: boolean;
  cameraOff?: boolean;
}

export interface OSBootstrapData {
  profile: UserProfile;
  apps: InstalledApp[];
  notifications: OSNotification[];
  characters: Character[];
  memories: CharacterMemory[];
  contacts: Contact[];
  calls: CallRecord[];
  conversations: Conversation[];
  messages: ChatMessage[];
  socialPosts: SocialPost[];
  socialComments: SocialComment[];
  socialStories: SocialStory[];
  media: MediaAsset[];
  notes: NoteItem[];
  events: CalendarEvent[];
  reminders: ReminderItem[];
  emails: EmailItem[];
  files: FileItem[];
  recordings: RecordingItem[];
  bookmarks: BookmarkItem[];
  browserHistory: BrowserHistoryItem[];
  alarms: AlarmItem[];
  worldClocks: WorldClockItem[];
  healthLogs: HealthLog[];
  walletCards: WalletCard[];
  vaultItems: VaultItem[];
  shortcuts: ShortcutRule[];
  translations: TranslationRecord[];
  books: BookItem[];
  gameScores: GameScore[];
  auditLogs?: Array<{ id: string; action: string; detail: string; created_at: string }>;
  // OS 3.0
  devices: DeviceItem[];
  wifiNetworks: WifiNetwork[];
  bluetoothDevices: BluetoothDevice[];
  batteryHistory: BatteryHistoryPoint[];
  appPermissions: AppPermissionItem[];
  homeWidgets: HomeWidget[];
  backups: BackupRecord[];
  syncJobs: SyncJobRecord[];
  systemErrors: SystemErrorRecord[];
  scheduledJobs: ScheduledJobRecord[];
  aiRelationships: AiRelationshipRecord[];
  aiEvents: AiEventRecord[];
  podcasts: PodcastChannel[];
  podcastEpisodes: PodcastEpisode[];
  shoppingProducts: ShoppingProduct[];
  shoppingCart: ShoppingCartItem[];
  shoppingOrders: ShoppingOrder[];
  foodRestaurants: FoodRestaurant[];
  foodOrders: FoodOrder[];
  bankingAccounts: BankingAccountDemo[];
  bankingTransactions: BankingTransactionDemo[];
  bankingBills: BankingBillDemo[];
  rideTrips: RideTrip[];
  officeDocs: OfficeDoc[];
  communityGroups: CommunityGroup[];
  communityPosts: CommunityPost[];
  communityComments: CommunityComment[];
  smartDevices: SmartDevice[];
  smartScenes: SmartScene[];
  smartLogs: SmartLog[];
  // OS 4.0
  youtubeLibrary?: YouTubeLibraryItem[];
  movieWatchlist?: MovieWatchlistItem[];
  musicPlaylists?: MusicPlaylist[];
  migrations?: MigrationRecord[];
  // Messages v3
  conversationMembers?: ConversationMember[];
  chatSummaries?: ChatSummaryRecord[];
  proactiveJobs?: ProactiveJobRecord[];
  searchHistory?: ChatSearchHistoryItem[];
  // DokiChat Ultimate 3.0
  dokiSettings?: DokiUserSettings | null;
  aiProviderConfig?: AiProviderConfig | null;
  roleplayScenarios?: RoleplayScenario[];
  relationshipEvents?: RelationshipEventRecord[];
  stickerStats?: StickerStatRecord[];
  callSessions?: CallSessionRecord[];
  // Anime Telecom
  telecomCarriers?: TelecomCarrier[];
  telecomSims?: TelecomUserSim[];
  telecomPackages?: TelecomPackage[];
  telecomTransactions?: TelecomTransaction[];
  telecomNotifications?: TelecomNotification[];
}

export interface YouTubeLibraryItem {
  id: string;
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  duration_label: string;
  list_type: 'history' | 'favorite' | 'watch_later' | 'liked';
  progress_sec?: number;
  duration_sec?: number;
  liked?: number;
  channel_id?: string;
  category?: string;
  updated_at?: string;
  created_at: string;
}

export interface YouTubeSubscription {
  channel_id: string;
  channel_title: string;
  avatar_url: string;
  subscribed_at: string;
}

export interface YouTubeComment {
  id: string;
  video_id: string;
  parent_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  likes_count: number;
  is_liked: number;
  created_at: string;
}

export interface YouTubePlaylistVideoItem {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url?: string;
  duration_label?: string;
}

export interface YouTubePlaylist {
  id: string;
  name: string;
  description: string;
  items_json: string;
  items: YouTubePlaylistVideoItem[];
  created_at: string;
  updated_at: string;
}

export interface YouTubeSearchHistoryItem {
  id: string;
  query: string;
  created_at: string;
}

export type YouTubePlanId = 'free' | 'basic' | 'standard' | 'premium';
export type YouTubeMovieAccessType = 'FREE' | 'PREMIUM' | 'RENT' | 'BUY' | 'LOCKED';

export interface YouTubePlanConfig {
  id: YouTubePlanId;
  name: string;
  tagline: string;
  price: number;
  maxQuality: '480p' | '720p' | '1080p' | '4K';
  maxDevices: number;
  adFree: boolean;
  adFreeScope: string;
  downloadSupported: boolean;
  exclusivePriority: boolean;
  badge?: string;
  features: string[];
}

export interface YouTubeSubtitleCue {
  startSec: number;
  endSec: number;
  vi: string;
  en: string;
}

export interface YouTubeEpisodeItem {
  episodeNumber: number;
  title: string;
  durationLabel: string;
  durationSec: number;
  synopsis: string;
  accentColor: string;
  subtitles: YouTubeSubtitleCue[];
}

export interface YouTubeEntitlementItem {
  id: string;
  entitlementType: 'rent' | 'buy';
  pricePaid: number;
  purchasedAt: string;
  expiresAt: string;
}

export interface YouTubeMovieItem {
  id: string;
  title: string;
  originalTitle: string;
  description: string;
  genre: string;
  categories: string[];
  contentKind: 'movie' | 'series' | 'tv_show' | 'documentary' | 'exclusive' | string;
  accessType: YouTubeMovieAccessType;
  minTier: YouTubePlanId;
  rentPrice: number;
  buyPrice: number;
  posterUrl: string;
  backdropUrl: string;
  year: number;
  durationLabel: string;
  durationSec: number;
  rating: number;
  cast: string[];
  director: string;
  trailerVideoId: string;
  episodes: YouTubeEpisodeItem[];
  isTrending: boolean;
  isNewRelease: boolean;
  isFeatured: boolean;
  isExclusive: boolean;
  maxSourceQuality: string;
  lockedReason: string;
  isFavorite: boolean;
  isUnlocked: boolean;
  progress: {
    episodeNumber: number;
    progressSec: number;
    durationSec: number;
    updatedAt: string;
  } | null;
  entitlement: YouTubeEntitlementItem | null;
}

export interface YouTubeSavedCardSummary {
  cardId: string;
  bankId: string;
  bankName: string;
  cardNickname: string;
  cardCategory: 'debit' | 'credit' | string;
  last4: string;
  maskedNumber: string;
  expiry: string;
  liveStatus: 'active' | 'locked' | 'cancelled' | 'expired' | 'deleted' | string;
  statusReason: string;
}

export interface YouTubeMembershipState {
  planId: YouTubePlanId;
  effectivePlanId: YouTubePlanId;
  planName: string;
  status: 'active' | 'expired' | 'cancelled' | 'free' | string;
  subscribedAt: string;
  expiresAt: string;
  nextBillingAt: string;
  autoRenew: boolean;
  cancelledAt: string;
  deviceLimit: number;
  maxQuality: string;
  downloadEnabled: boolean;
  adFree: boolean;
  exclusivePriority: boolean;
  lastRenewalError: string;
  savedCard: YouTubeSavedCardSummary | null;
}

export interface YouTubeInvoiceItem {
  id: string;
  invoiceCode: string;
  txId: string;
  cardId: string;
  cardLast4: string;
  bankName: string;
  actionType: 'subscribe' | 'upgrade' | 'downgrade' | 'renew' | 'rent' | 'buy' | 'renew_failed' | 'cancel' | string;
  planId: string;
  movieId: string;
  title: string;
  amount: number;
  status: 'paid' | 'failed' | 'cancelled' | string;
  failureCode: string;
  failureReason: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface YouTubeShortItem {
  id: string;
  videoId: string;
  title: string;
  creatorName: string;
  creatorAvatar: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  thumbnailUrl: string;
  durationSec: number;
  accentColor: string;
  caption: string;
}

export interface YouTubeMovieAccessResult {
  movieId: string;
  allowed: boolean;
  accessType: YouTubeMovieAccessType;
  minTier: YouTubePlanId;
  currentPlanId: YouTubePlanId;
  membershipStatus: string;
  recommendedPlanId: YouTubePlanId;
  reasonCode: string;
  reasonMessage: string;
  canRent: boolean;
  canBuy: boolean;
  rentPrice: number;
  buyPrice: number;
  maxQuality: string;
  availableQualities: string[];
  maxDevices: number;
  adFree: boolean;
  downloadAllowed: boolean;
  entitlement: YouTubeEntitlementItem | null;
}

export interface YouTubeStreamingOverview {
  plans: YouTubePlanConfig[];
  categories: string[];
  membership: YouTubeMembershipState;
  lifecycleEvent: { type: string; message: string } | null;
  movies: YouTubeMovieItem[];
  recommendedMovies: YouTubeMovieItem[];
  shorts: YouTubeShortItem[];
  invoices: YouTubeInvoiceItem[];
  notifications: OSNotification[];
}

export interface MovieWatchlistItem {
  movie_id: string;
  title: string;
  poster_url: string;
  is_watchlisted: number;
  is_favorite: number;
  user_rating: number;
  watched_at: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  tracks_json: string;
  updated_at: string;
}

export interface MigrationRecord {
  id: string;
  from_version: string;
  to_version: string;
  backup_id: string;
  status: string;
  detail: string;
  migrated_at: string;
}

export type OsReleaseType = 'major' | 'minor' | 'patch';

export interface OsVersionEntry {
  id: string;
  osName: string;
  version: string;
  releaseName: string;
  releaseType: OsReleaseType;
  releaseDate: string;
  buildNumber: string;
  summary: string;
  features: string[];
  uiUpgrades: string[];
  systemUpgrades: string[];
  performanceImprovements: string[];
  fixes: string[];
  optimizations: string[];
  compatibilityNotes: string[];
  isCurrent?: boolean;
  isLatest?: boolean;
  source?: string;
  createdAt?: string;
  date?: string;
  knownIssues?: string[];
}

export interface SystemUpdatePayload {
  osName: string;
  currentVersion: string;
  releaseName: string;
  buildNumber: string;
  releaseDate: string;
  systemStatus: string;
  updateAvailable: boolean;
  totalVersions: number;
  years: string[];
  serverNote: string;
  migrations: MigrationRecord[];
  versions: OsVersionEntry[];
}

export interface IntegrationServiceStatus {
  key: string;
  name: string;
  type: 'A' | 'B' | 'C' | 'D';
  status: 'connected' | 'unconfigured' | 'simulated';
  detail: string;
  configGuide?: string;
}

export type TelecomSimTier =
  | 'normal'
  | 'easy'
  | 'tam_hoa'
  | 'tu_quy'
  | 'ngu_quy'
  | 'luc_quy'
  | 'progressive'
  | 'repeating'
  | 'symmetric'
  | 'vip'
  | 'premium'
  | 'limited';

export interface TelecomCarrier {
  id: string;
  code: string;
  name: string;
  jp_name: string;
  tagline: string;
  theme_json: string;
  positioning: string;
  history_lore: string;
  service_info_json: string;
  promotions_json: string;
  prefixes_json: string;
  logo_variant: string;
  sort_order: number;
  is_active: number;
}

export interface TelecomCatalogSim {
  id: string;
  phone_number: string;
  carrier_id: string;
  sim_type: string;
  sim_tier: TelecomSimTier;
  tier_label: string;
  rarity_score: number;
  price: number;
  initial_balance: number;
  prefix: string;
  suffix: string;
  traits_json: string;
  perks_json: string;
  event_tag: string;
  description: string;
  status: 'available' | 'sold';
  sold_to_user_id: string;
  sold_at: string;
  created_at: string;
}

export interface TelecomPackage {
  id: string;
  carrier_id: string;
  name: string;
  package_type: 'data' | 'voice' | 'sms' | 'combo' | 'limited';
  cycle_type: 'daily' | 'weekly' | 'monthly' | 'night' | 'high_cap' | 'event';
  price: number;
  validity_days: number;
  data_mb: number;
  voice_minutes: number;
  sms_count: number;
  benefits_json: string;
  terms_text: string;
  badge_text: string;
  is_featured: number;
  sort_order: number;
}

export interface TelecomUserPackage {
  id: string;
  user_sim_id: string;
  package_id: string;
  carrier_id: string;
  package_name: string;
  package_type: 'data' | 'voice' | 'sms' | 'combo' | 'limited';
  price_paid: number;
  data_total_mb: number;
  data_remaining_mb: number;
  voice_total_min: number;
  voice_remaining_min: number;
  sms_total: number;
  sms_remaining: number;
  status: 'active' | 'expired' | 'replaced';
  activated_at: string;
  expires_at: string;
}

export interface TelecomUserSim {
  id: string;
  user_id: string;
  catalog_sim_id: string;
  phone_number: string;
  carrier_id: string;
  carrier_name?: string;
  carrier_code?: string;
  carrier_logo?: string;
  alias_name: string;
  sim_type: string;
  sim_tier: TelecomSimTier;
  purchase_price: number;
  sim_balance: number;
  total_topped_up: number;
  total_spent: number;
  is_primary: number;
  status: 'active' | 'locked' | 'cancelled';
  activated_at: string;
  purchased_at: string;
  updated_at: string;
  active_packages?: TelecomUserPackage[];
  primary_package?: TelecomUserPackage | null;
  package_history?: TelecomUserPackage[];
}

export interface TelecomTransaction {
  id: string;
  transaction_id: string;
  ref_code: string;
  user_id: string;
  sim_id: string;
  phone_number: string;
  carrier_id: string;
  tx_type: 'buy_sim' | 'topup' | 'buy_package' | 'refund';
  amount: number;
  fee: number;
  total_amount: number;
  payment_channel: 'bank' | 'sim_balance';
  bank_account_id: string;
  bank_card_id: string;
  bank_source_label: string;
  card_last4: string;
  sim_balance_before: number;
  sim_balance_after: number;
  bank_balance_before: number;
  bank_balance_after: number;
  status: string;
  title: string;
  description: string;
  detail_json: string;
  idempotency_key: string;
  created_at: string;
}

export interface TelecomNotification {
  id: string;
  sim_id: string;
  title: string;
  body: string;
  notif_type: string;
  ref_id: string;
  is_read: number;
  created_at: string;
}

export interface TelecomOverviewPayload {
  carriers: TelecomCarrier[];
  catalog: TelecomCatalogSim[];
  userSims: TelecomUserSim[];
  packages: TelecomPackage[];
  userPackages: TelecomUserPackage[];
  transactions: TelecomTransaction[];
  notifications: TelecomNotification[];
  bankAccounts: BankingAccountDemo[];
  bankCards: BankingCardItem[];
  primarySim: TelecomUserSim | null;
}


