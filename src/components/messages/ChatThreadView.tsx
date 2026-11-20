import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Bookmark,
  BookOpen,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  FileText,
  Flag,
  Forward,
  Info,
  Languages,
  Layers,
  MapPin,
  MoreHorizontal,
  Pause,
  Phone,
  Pin,
  Play,
  RefreshCw,
  Reply,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  UserCheck,
  Video,
  Volume2,
  X,
  Landmark,
} from 'lucide-react';
import type {
  AiRelationshipRecord,
  CalendarEvent,
  Character,
  CharacterMemory,
  ChatMessage,
  ChatSummaryRecord,
  Contact,
  Conversation,
  ConversationMember,
  DokiUserSettings,
  MediaAsset,
  RelationshipEventRecord,
  ResponseTuningOptions,
  RoleplayScenario,
  StickerStatRecord,
} from '../../types/os';
import {
  ALL_STICKERS,
  DEFAULT_CONV_SETTINGS,
  DEFAULT_ROLEPLAY_STATE,
  DEFAULT_TUNING,
  formatDayDivider,
  formatRelativeTime,
  getCharacterScheduleActivity,
  getEmotionStyle,
  GIF_CATALOG,
  handleCharImgError,
  isGifAttachment,
  isSameDay,
  normalizeVi,
  parseFormattedTokens,
  QUICK_REACTIONS,
  safeJson,
  type ConversationSettings,
  type RoleplayState,
} from './utils';
import { ChatComposer, GifReactionCard, StickerSvg } from './ChatComposer';
import {
  ChatSettingsDrawer,
  MemoryAndRelationshipDrawer,
  RoleplaySetupModal,
} from './ChatSettingsAndMemoryDrawers';
import { downloadDataUrlAsPng, renderReceiptPreviewFromPayload } from '../banking/billRenderer';
import { osApi } from '../../services/api';

interface ChatThreadViewProps {
  conversation: Conversation;
  allConversations: Conversation[];
  messages: ChatMessage[];
  characters: Character[];
  memories: CharacterMemory[];
  relationships: AiRelationshipRecord[];
  relationshipEvents?: RelationshipEventRecord[];
  conversationMembers: ConversationMember[];
  chatSummaries: ChatSummaryRecord[];
  roleplayScenarios?: RoleplayScenario[];
  stickerStats: StickerStatRecord[];
  mediaAssets: MediaAsset[];
  contacts: Contact[];
  events: CalendarEvent[];
  dokiSettings?: DokiUserSettings | null;
  isOnline: boolean;
  isTyping: boolean;
  streamingText?: string;
  streamingStatus?: string;
  aiError: string | null;
  draft: string;
  jumpToMessageId: string | null;
  onClearJumpToMessage: () => void;
  onChangeDraft: (text: string) => void;
  onBack: () => void;
  onSendMessage: (payload: {
    content: string;
    msg_type: ChatMessage['msg_type'];
    attachment_json?: string;
    reply_to_id?: string;
    trigger_ai?: boolean;
    tuning?: ResponseTuningOptions;
  }) => Promise<void>;
  onCancelAi: () => Promise<void>;
  onRetryAi: () => Promise<void>;
  onRegenerateAi: (targetMsgId: string) => Promise<void>;
  onContinueAi?: () => Promise<void>;
  onStartCall: (isVideo: boolean) => void;
  onOpenCharacterProfile?: (char: Character) => void;
  onOpenMaps: (query: string) => void;
  onToggleVirtualKeyboard: () => void;
  onMicActiveChange: (active: boolean) => void;
  onPlayTts: (base64Wav: string) => Promise<void>;
  onAddClipboard: (text: string) => void;
  onRefreshData: () => Promise<void>;
  onRemoveLocalMessage: (msgId: string) => void;
  onUpsertLocalMessage: (msg: ChatMessage) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: { title: string; message: string; destructive?: boolean; onConfirm: () => Promise<void> }) => void;
  onOpenBankingTx?: (txId: string) => void;
  onQuickBankTransfer?: () => void;
  onRegisterOverlayBack?: (closer: (() => boolean) | null) => void;
}

function fmtAudioSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ChatThreadView({
  conversation,
  allConversations,
  messages,
  characters,
  memories,
  relationships,
  relationshipEvents = [],
  conversationMembers,
  chatSummaries,
  roleplayScenarios = [],
  stickerStats,
  mediaAssets,
  contacts,
  events,
  dokiSettings,
  isOnline,
  isTyping,
  streamingText = '',
  streamingStatus = '',
  aiError,
  draft,
  jumpToMessageId,
  onClearJumpToMessage,
  onChangeDraft,
  onBack,
  onSendMessage,
  onCancelAi,
  onRetryAi,
  onRegenerateAi,
  onContinueAi,
  onStartCall,
  onOpenCharacterProfile,
  onOpenMaps,
  onToggleVirtualKeyboard,
  onMicActiveChange,
  onPlayTts,
  onAddClipboard,
  onRefreshData,
  onRemoveLocalMessage,
  onUpsertLocalMessage,
  onShowToast,
  onRequestConfirm,
  onOpenBankingTx,
  onQuickBankTransfer,
  onRegisterOverlayBack,
}: ChatThreadViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const composerTrayCloserRef = useRef<(() => boolean) | null>(null);

  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [activeMenuMsg, setActiveMenuMsg] = useState<ChatMessage | null>(null);
  const [detailMsg, setDetailMsg] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('Phản hồi chưa phù hợp');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);
  const [billPngCache, setBillPngCache] = useState<Record<string, string>>({});
  const renderedBillIdsRef = useRef<Set<string>>(new Set());
  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);
  const [resolvedReqOverrides, setResolvedReqOverrides] = useState<Record<string, string>>({});

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [voiceSpeed, setVoiceSpeed] = useState<Record<string, 1 | 1.5 | 2>>({});
  const [voiceCurrentTime, setVoiceCurrentTime] = useState<Record<string, number>>({});
  const [voiceDuration, setVoiceDuration] = useState<Record<string, number>>({});
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const [inSearchOpen, setInSearchOpen] = useState(false);
  const [inSearchQuery, setInSearchQuery] = useState('');
  const [inSearchIdx, setInSearchIdx] = useState(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [roleplayModalOpen, setRoleplayModalOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);

  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (!onRegisterOverlayBack) return;
    onRegisterOverlayBack(() => {
      if (lightboxUrl) {
        setLightboxUrl(null);
        setLightboxZoomed(false);
        return true;
      }
      if (activeMenuMsg) {
        setActiveMenuMsg(null);
        return true;
      }
      if (detailMsg) {
        setDetailMsg(null);
        return true;
      }
      if (forwardMsg) {
        setForwardMsg(null);
        return true;
      }
      if (reportMsg) {
        setReportMsg(null);
        return true;
      }
      if (recapText) {
        setRecapText(null);
        return true;
      }
      if (tuningOpen) {
        setTuningOpen(false);
        return true;
      }
      if (roleplayModalOpen) {
        setRoleplayModalOpen(false);
        return true;
      }
      if (memoryOpen) {
        setMemoryOpen(false);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (inSearchOpen) {
        setInSearchOpen(false);
        setInSearchQuery('');
        return true;
      }
      if (composerTrayCloserRef.current?.()) {
        return true;
      }
      return false;
    });
    return () => onRegisterOverlayBack(null);
  }, [
    onRegisterOverlayBack,
    lightboxUrl,
    activeMenuMsg,
    detailMsg,
    forwardMsg,
    reportMsg,
    recapText,
    tuningOpen,
    roleplayModalOpen,
    memoryOpen,
    settingsOpen,
    inSearchOpen,
  ]);

  const character = useMemo(
    () => characters.find((c) => c.id === conversation.character_id),
    [characters, conversation.character_id]
  );

  const groupCharacters = useMemo(() => {
    if (!conversation.is_group) return [];
    const activeIds = conversationMembers
      .filter((m) => m.conversation_id === conversation.id && m.member_type === 'character' && m.is_active)
      .map((m) => m.member_id);
    const ids = activeIds.length > 0 ? activeIds : safeJson<string[]>(conversation.members_json, []);
    return characters.filter((c) => ids.includes(c.id));
  }, [conversation, conversationMembers, characters]);

  const settings = safeJson<ConversationSettings>(conversation.settings_json, DEFAULT_CONV_SETTINGS);
  const roleplay = safeJson<RoleplayState>(conversation.roleplay_state_json, DEFAULT_ROLEPLAY_STATE);
  const currentTuning: ResponseTuningOptions = useMemo(
    () => ({
      ...DEFAULT_TUNING,
      language: dokiSettings?.default_language || 'vi',
      ...(settings.tuning || {}),
    }),
    [dokiSettings?.default_language, settings.tuning]
  );

  const [tuningDraft, setTuningDraft] = useState<ResponseTuningOptions>(currentTuning);
  useEffect(() => {
    setTuningDraft(currentTuning);
  }, [currentTuning]);

  const threadMessages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of olderMessages) {
      if (m.conversation_id === conversation.id && !m.deleted_at) map.set(m.id, m);
    }
    for (const m of messages) {
      if (m.conversation_id === conversation.id && !m.deleted_at) map.set(m.id, m);
    }
    return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [olderMessages, messages, conversation.id]);

  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(false);
    osApi.messagesV3
      .getMessagesPaginated(conversation.id, undefined, 40)
      .then((res) => {
        if (res.hasMore) setHasMoreOlder(true);
      })
      .catch(() => {});
  }, [conversation.id]);

  useEffect(() => {
    let active = true;
    const renderPendingBills = async () => {
      for (const m of threadMessages) {
        if (m.msg_type !== 'image' || renderedBillIdsRef.current.has(m.id)) continue;
        const att = safeJson<Record<string, unknown>>(m.attachment_json, {});
        const isBill = Boolean(att.isBill || att.receipt || att.refCode || att.txId);
        if (!isBill) continue;
        const hasPngAlready = typeof att.dataUrl === 'string' && att.dataUrl.startsWith('data:image/png');
        if (hasPngAlready) {
          renderedBillIdsRef.current.add(m.id);
          continue;
        }
        renderedBillIdsRef.current.add(m.id);
        try {
          let receiptObj =
            att.receipt && typeof att.receipt === 'object'
              ? (att.receipt as Record<string, unknown>)
              : null;
          if (!receiptObj && (att.refCode || att.txId)) {
            const verified = await osApi.banking.verifyTx(String(att.refCode || att.txId)).catch(() => null);
            if (verified?.receipt) receiptObj = verified.receipt;
          }
          if (!receiptObj) continue;
          const png = await renderReceiptPreviewFromPayload(receiptObj, {
            txId: String(att.txId || ''),
            refCode: String(att.refCode || ''),
            amount: Number(att.amount || 0),
            createdAt: m.created_at,
          });
          if (active && png) {
            setBillPngCache((prev) => ({ ...prev, [m.id]: png }));
          }
        } catch {
          // ignore individual render error
        }
      }
    };
    void renderPendingBills();
    return () => {
      active = false;
    };
  }, [threadMessages]);

  const loadOlderMessages = async () => {
    if (loadingOlder || threadMessages.length === 0) return;
    const oldest = threadMessages[0]?.created_at;
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await osApi.messagesV3.getMessagesPaginated(conversation.id, oldest, 30);
      setOlderMessages((prev) => [...res.messages, ...prev]);
      setHasMoreOlder(res.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  };

  const scrollToMessage = useCallback(
    (msgId: string) => {
      const el = msgRefs.current[msgId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(msgId);
        setTimeout(() => setHighlightedId((curr) => (curr === msgId ? null : curr)), 2200);
      } else {
        onShowToast('Không tìm thấy tin nhắn', 'Tin nhắn này có thể đã bị xóa hoặc nằm ở trang cũ hơn.');
      }
    },
    [onShowToast]
  );

  useEffect(() => {
    if (jumpToMessageId) {
      setTimeout(() => {
        scrollToMessage(jumpToMessageId);
        onClearJumpToMessage();
      }, 150);
    }
  }, [jumpToMessageId, scrollToMessage, onClearJumpToMessage]);

  const prevLenRef = useRef(0);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isInitial = prevLenRef.current === 0 && threadMessages.length > 0;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (isInitial || ((threadMessages.length > prevLenRef.current || Boolean(streamingText)) && nearBottom)) {
      setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: isInitial ? 'auto' : 'smooth' });
      }, 30);
    } else if (threadMessages.length > prevLenRef.current) {
      setShowScrollBottomPill(true);
    }
    prevLenRef.current = threadMessages.length;
  }, [threadMessages.length, streamingText]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBottomPill(dist > 160);
  };

  const pinnedMsg = useMemo(
    () => [...threadMessages].reverse().find((m) => m.is_pinned === 1),
    [threadMessages]
  );

  const inSearchMatches = useMemo(() => {
    const q = normalizeVi(inSearchQuery);
    if (!q) return [];
    return threadMessages.filter((m) => normalizeVi(m.content).includes(q));
  }, [threadMessages, inSearchQuery]);

  const latestAiMsgId = useMemo(() => {
    const aiMsgs = threadMessages.filter((m) => m.sender_type === 'character');
    return aiMsgs[aiMsgs.length - 1]?.id || null;
  }, [threadMessages]);

  const relationship = useMemo(
    () => (character ? relationships.find((r) => r.character_id === character.id) : undefined),
    [relationships, character]
  );

  const fontSizeClass =
    settings.fontSize === 'small'
      ? 'text-[12px]'
      : settings.fontSize === 'large'
        ? 'text-[15px]'
        : 'text-[13.5px]';

  const wallpaperStyle: React.CSSProperties = useMemo(() => {
    const wp = conversation.wallpaper || dokiSettings?.wallpaper || '';
    if (!wp) return {};
    if (wp.startsWith('linear-gradient')) return { backgroundImage: wp };
    return {
      backgroundImage: `url(${wp})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }, [conversation.wallpaper, dokiSettings?.wallpaper]);

  const toggleVoicePlay = (msgId: string, dataUrl: string) => {
    const speed = voiceSpeed[msgId] || 1;
    if (playingVoiceId === msgId && voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      setPlayingVoiceId(null);
      return;
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
    }
    const audio = new Audio(dataUrl);
    audio.playbackRate = speed;
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setVoiceDuration((prev) => ({ ...prev, [msgId]: audio.duration }));
      }
    };
    audio.ontimeupdate = () => {
      setVoiceCurrentTime((prev) => ({ ...prev, [msgId]: audio.currentTime }));
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setVoiceDuration((prev) => ({ ...prev, [msgId]: audio.duration }));
      }
    };
    audio.onended = () => {
      setPlayingVoiceId(null);
      setVoiceCurrentTime((prev) => ({ ...prev, [msgId]: 0 }));
    };
    voiceAudioRef.current = audio;
    audio.play().catch(() => {
      onShowToast('Không phát được âm thanh', 'Tệp ghi âm không hợp lệ.', 'error');
    });
    setPlayingVoiceId(msgId);
  };

  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    const current = safeJson<Record<string, number>>(msg.reactions_json, {});
    const next = { ...current };
    if (next[emoji]) {
      delete next[emoji];
    } else {
      next[emoji] = 1;
    }
    const updated = (await osApi.updateMessage(msg.id, {
      reactions_json: JSON.stringify(next),
    })) as ChatMessage;
    onUpsertLocalMessage(updated);
    setActiveMenuMsg(null);
  };

  const renderFormattedContent = (text: string) => {
    const tokens = parseFormattedTokens(text);
    return tokens.map((tok, idx) => {
      if (tok.type === 'italic') {
        return (
          <em key={idx} className="italic opacity-80">
            {tok.value}
          </em>
        );
      }
      if (tok.type === 'mention') {
        return (
          <span key={idx} className="font-semibold underline decoration-dotted">
            {tok.value}
          </span>
        );
      }
      if (tok.type === 'url') {
        return (
          <a
            key={idx}
            href={tok.value}
            target="_blank"
            rel="noreferrer"
            className="underline break-all"
          >
            {tok.value}
          </a>
        );
      }
      return <React.Fragment key={idx}>{tok.value}</React.Fragment>;
    });
  };

  const emotionStyle = getEmotionStyle(character?.mood);
  const statusLine = useMemo(() => {
    if (isTyping) return streamingStatus || 'Đang nhập phản hồi...';
    if (!isOnline) return 'Đang ngoại tuyến · Tin nhắn sẽ xếp hàng đợi';
    if (conversation.is_group) return `${groupCharacters.length + 1} thành viên`;
    if (character) return getCharacterScheduleActivity(character);
    return 'Nhân vật AI';
  }, [isTyping, streamingStatus, isOnline, conversation.is_group, groupCharacters.length, character]);

  const saveTuningOptions = async (nextTuning: ResponseTuningOptions) => {
    const nextSettings = { ...settings, tuning: nextTuning };
    await osApi.messagesV3.updateConversationConfig(conversation.id, {
      settings_json: JSON.stringify(nextSettings),
    });
    await onRefreshData();
    setTuningOpen(false);
    onShowToast('Đã cập nhật tinh chỉnh AI', 'Áp dụng ngay cho phản hồi tiếp theo.', 'success');
  };

  return (
    <div className="h-full flex flex-col doki-soft-surface relative overflow-hidden">
      {/* Liquid Glass Header */}
      <div className="px-2 py-2 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 flex items-center gap-1.5 z-20 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-2xl hover:bg-violet-500/10 flex items-center justify-center shrink-0"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => character && onOpenCharacterProfile?.(character)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <div className="relative shrink-0">
            <img
              src={conversation.avatar || character?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
              alt={conversation.title}
              loading="lazy"
              onError={(e) => handleCharImgError(e, conversation.title)}
              className="w-10 h-10 rounded-2xl object-cover ring-2 ring-violet-400/40"
            />
            {isOnline && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900 absolute -bottom-0.5 -right-0.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {conversation.title}
              </h3>
              {character?.mood && (
                <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold shrink-0 ${emotionStyle.bg} ${emotionStyle.color}`}>
                  {character.mood.split('·')[0].trim()}
                </span>
              )}
            </div>
            <p className={`text-[11px] truncate ${isTyping ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-zinc-500'}`}>
              {statusLine}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {!conversation.is_group && character && (
            <>
              <button
                onClick={() => onStartCall(false)}
                className="w-8 h-8 rounded-xl hover:bg-violet-500/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300"
                title="Gọi thoại AI"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => onStartCall(true)}
                className="w-8 h-8 rounded-xl hover:bg-violet-500/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300"
                title="Gọi Video AI"
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMemoryOpen(true)}
                className="w-8 h-8 rounded-xl hover:bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400"
                title="Ký ức & Quan hệ"
              >
                <Brain className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setTuningOpen(true)}
            className="w-8 h-8 rounded-xl hover:bg-violet-500/10 flex items-center justify-center text-pink-600 dark:text-pink-400"
            title="Tinh chỉnh phản hồi AI"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRoleplayModalOpen(true)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              roleplay.active
                ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white'
                : 'hover:bg-violet-500/10 text-zinc-700 dark:text-zinc-300'
            }`}
            title="Chế độ nhập vai / Bối cảnh"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => setInSearchOpen((v) => !v)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              inSearchOpen
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'hover:bg-violet-500/10 text-zinc-700 dark:text-zinc-300'
            }`}
            title="Tìm trong đoạn chat"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-xl hover:bg-violet-500/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300"
            title="Cài đặt đoạn chat"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Roleplay Active Strip */}
      {roleplay.active && (
        <div className="px-3 py-2 bg-violet-600/10 dark:bg-violet-950/50 border-b border-violet-300/40 dark:border-violet-800/50 flex items-center justify-between gap-2 text-[11px] z-10">
          <div className="min-w-0">
            <span className="font-bold text-violet-700 dark:text-violet-300 truncate block">
              Nhập vai · {roleplay.sceneTitle || roleplay.genre}
              {roleplay.paused ? ' (Đang tạm dừng)' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={async () => {
                setRecapLoading(true);
                try {
                  const res = await osApi.messagesV3.getRoleplayRecap(conversation.id);
                  setRecapText(res.recap);
                } catch (err) {
                  onShowToast('Không thể tóm tắt', err instanceof Error ? err.message : 'Lỗi AI', 'error');
                } finally {
                  setRecapLoading(false);
                }
              }}
              className="px-2 py-1 rounded-lg bg-white/80 dark:bg-zinc-800 font-semibold flex items-center gap-1"
            >
              <BookOpen className="w-3 h-3" />
              <span>{recapLoading ? '...' : 'Trước đó'}</span>
            </button>
            <button
              onClick={async () => {
                await osApi.messagesV3.updateRoleplay(conversation.id, {
                  ...roleplay,
                  active: true,
                  paused: !roleplay.paused,
                });
                await onRefreshData();
              }}
              className="px-2 py-1 rounded-lg bg-white/80 dark:bg-zinc-800 font-semibold"
            >
              {roleplay.paused ? 'Tiếp tục' : 'Tạm dừng'}
            </button>
            <button
              onClick={() => setRoleplayModalOpen(true)}
              className="px-2 py-1 rounded-lg bg-violet-600 text-white font-semibold"
            >
              Đổi cảnh
            </button>
          </div>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMsg && (
        <button
          onClick={() => scrollToMessage(pinnedMsg.id)}
          className="px-3.5 py-2 bg-amber-50/90 dark:bg-amber-950/35 border-b border-amber-200/70 dark:border-amber-800/40 flex items-center justify-between gap-2 text-left text-xs z-10"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate text-zinc-700 dark:text-zinc-200">
              <strong className="font-semibold">{pinnedMsg.sender_name}: </strong>
              {pinnedMsg.content}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
            Xem
          </span>
        </button>
      )}

      {/* In-Thread Search Bar */}
      {inSearchOpen && (
        <div className="px-3 py-2 doki-glass border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs z-10">
          <input
            value={inSearchQuery}
            onChange={(e) => {
              setInSearchQuery(e.target.value);
              setInSearchIdx(0);
            }}
            placeholder="Tìm trong đoạn chat (không phân biệt dấu)..."
            autoFocus
            className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
          />
          {inSearchMatches.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-mono-num text-[11px] text-zinc-500">
                {inSearchIdx + 1}/{inSearchMatches.length}
              </span>
              <button
                onClick={() => {
                  const next = (inSearchIdx - 1 + inSearchMatches.length) % inSearchMatches.length;
                  setInSearchIdx(next);
                  scrollToMessage(inSearchMatches[next].id);
                }}
                className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const next = (inSearchIdx + 1) % inSearchMatches.length;
                  setInSearchIdx(next);
                  scrollToMessage(inSearchMatches[next].id);
                }}
                className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setInSearchOpen(false);
              setInSearchQuery('');
            }}
            className="p-1.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={wallpaperStyle}
        className="flex-1 overflow-y-auto os-scroll px-3 py-3 space-y-2 relative"
      >
        {(conversation.wallpaper || dokiSettings?.wallpaper) &&
          !(conversation.wallpaper || dokiSettings?.wallpaper || '').startsWith('linear-gradient') && (
            <div className="fixed inset-0 bg-white/55 dark:bg-black/55 pointer-events-none" />
          )}

        <div className="relative z-10 space-y-2">
          {hasMoreOlder && (
            <div className="flex justify-center pb-2">
              <button
                disabled={loadingOlder}
                onClick={loadOlderMessages}
                className="px-3.5 py-1.5 rounded-full doki-glass text-[11px] font-semibold shadow-sm"
              >
                {loadingOlder ? 'Đang tải...' : 'Tải thêm tin nhắn cũ'}
              </button>
            </div>
          )}

          {threadMessages.map((msg, idx) => {
            const prev = threadMessages[idx - 1];
            const showDayDivider = !prev || !isSameDay(prev.created_at, msg.created_at);
            const sameSenderAsPrev =
              prev &&
              prev.sender_type === msg.sender_type &&
              prev.sender_id === msg.sender_id &&
              new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60_000;

            if (msg.sender_type === 'system' || msg.msg_type === 'system') {
              return (
                <React.Fragment key={msg.id}>
                  {showDayDivider && (
                    <div className="flex justify-center py-2">
                      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                        {formatDayDivider(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center py-1">
                    <span className="px-3 py-1 rounded-full doki-glass text-[11px] text-zinc-600 dark:text-zinc-300 text-center">
                      {msg.content}
                    </span>
                  </div>
                </React.Fragment>
              );
            }

            const isUser = msg.sender_type === 'user';
            const att = safeJson<Record<string, unknown>>(msg.attachment_json, {});
            const meta = safeJson<{ emotionTag?: string; forwardedFrom?: string }>(msg.metadata_json, {});
            const reactions = safeJson<Record<string, number>>(msg.reactions_json, {});
            const replyOrig = msg.reply_to_id
              ? threadMessages.find((m) => m.id === msg.reply_to_id)
              : undefined;
            const userBg = conversation.bubble_color || '#7C3AED';
            const isGif = msg.msg_type === 'sticker' && isGifAttachment(att);
            const gifObj = isGif ? GIF_CATALOG.find((g) => g.id === (att.gifId as string)) || GIF_CATALOG[0] : null;
            const stickerObj =
              msg.msg_type === 'sticker' && !isGif
                ? ALL_STICKERS.find((s) => s.id === (att.stickerId as string)) || ALL_STICKERS[0]
                : null;

            const audioCur = voiceCurrentTime[msg.id] || 0;
            const audioDur = voiceDuration[msg.id] || (typeof att.durationSec === 'number' ? att.durationSec : 0);

            return (
              <React.Fragment key={msg.id}>
                {showDayDivider && (
                  <div className="flex justify-center py-2">
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {formatDayDivider(msg.created_at)}
                    </span>
                  </div>
                )}

                <div
                  ref={(el) => {
                    msgRefs.current[msg.id] = el;
                  }}
                  className={`flex items-end gap-2 group ${isUser ? 'justify-end' : 'justify-start'} ${
                    highlightedId === msg.id ? 'ring-2 ring-violet-500 rounded-2xl p-1 -m-1' : ''
                  }`}
                >
                  {!isUser && (
                    <div className="w-8 shrink-0">
                      {!sameSenderAsPrev && (
                        <img
                          src={msg.sender_avatar || character?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                          alt={msg.sender_name}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, msg.sender_name)}
                          onClick={() => character && onOpenCharacterProfile?.(character)}
                          className="w-8 h-8 rounded-full object-cover cursor-pointer ring-1 ring-violet-300/50"
                        />
                      )}
                    </div>
                  )}

                  <div className={`max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    {!isUser && !sameSenderAsPrev && conversation.is_group === 1 && (
                      <span className="text-[10px] font-semibold text-zinc-500 ml-1 mb-0.5">
                        {msg.sender_name}
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      {isUser && (
                        <button
                          onClick={() => setActiveMenuMsg(msg)}
                          className="opacity-60 hover:opacity-100 p-1 rounded-lg text-zinc-400"
                          title="Tùy chọn tin nhắn"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isGif && gifObj ? (
                        <div className="p-0.5">
                          <GifReactionCard item={gifObj} />
                        </div>
                      ) : msg.msg_type === 'sticker' && stickerObj ? (
                        <div className="p-1">
                          <StickerSvg item={stickerObj} size={92} />
                        </div>
                      ) : (
                        <div
                          onDoubleClick={() => handleToggleReaction(msg, '❤️')}
                          style={isUser ? { backgroundColor: userBg } : undefined}
                          className={`rounded-2xl px-3.5 py-2 shadow-sm ${fontSizeClass} ${
                            isUser
                              ? 'text-white rounded-br-md'
                              : 'doki-glass text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                          }`}
                        >
                          {meta.forwardedFrom && (
                            <p className="text-[10px] opacity-75 mb-1 flex items-center gap-1">
                              <Forward className="w-3 h-3" />
                              <span>Chuyển tiếp từ {meta.forwardedFrom}</span>
                            </p>
                          )}

                          {msg.reply_to_id && (
                            <button
                              onClick={() => replyOrig && scrollToMessage(replyOrig.id)}
                              className={`w-full text-left mb-1.5 px-2.5 py-1.5 rounded-xl text-[11px] block ${
                                isUser ? 'bg-black/20 text-white/90' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                              }`}
                            >
                              {replyOrig ? (
                                <>
                                  <span className="font-semibold block truncate">{replyOrig.sender_name}</span>
                                  <span className="line-clamp-1 opacity-85">{replyOrig.content}</span>
                                </>
                              ) : (
                                <span className="italic opacity-75">Tin nhắn gốc đã bị xóa</span>
                              )}
                            </button>
                          )}

                          {/* Image(s) */}
                          {msg.msg_type === 'image' && (
                            <div className="space-y-1.5 mb-1.5">
                              {Array.isArray(att.images) && att.images.length > 0 ? (
                                <div className={`grid ${att.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
                                  {(att.images as Array<{ dataUrl: string }>).map((im, i) => (
                                    <img
                                      key={i}
                                      src={im.dataUrl}
                                      alt=""
                                      onClick={() => setLightboxUrl(im.dataUrl)}
                                      className="rounded-xl max-h-52 w-full object-cover cursor-pointer"
                                    />
                                  ))}
                                </div>
                                ) : (typeof att.dataUrl === 'string' && att.dataUrl) || billPngCache[msg.id] ? (
                                  (() => {
                                    const isBillAtt = Boolean(att.isBill || att.refCode || att.txId || att.receipt);
                                    const imgSrc = billPngCache[msg.id] || (att.dataUrl as string);
                                    return (
                                      <>
                                        <img
                                          src={imgSrc}
                                          alt=""
                                          onClick={() => {
                                            setLightboxZoomed(false);
                                            setLightboxUrl(imgSrc);
                                          }}
                                          className="rounded-xl max-h-60 w-full object-cover cursor-pointer"
                                        />
                                        {isBillAtt && (
                                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                            {onOpenBankingTx && (
                                              <button
                                                type="button"
                                                onClick={() => onOpenBankingTx(String(att.txId || att.refCode || ''))}
                                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#E14B5A] hover:bg-[#c83c4b] text-white text-[11px] font-bold flex items-center justify-center gap-1 min-h-[36px]"
                                              >
                                                <Landmark className="w-3.5 h-3.5 shrink-0" />
                                                <span>Xem trong Hikari Bank</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                downloadDataUrlAsPng(
                                                  imgSrc,
                                                  `HikariBank_${String(att.refCode || att.txId || 'BienLai')}.png`
                                                );
                                                onShowToast('Đã tải xuống', 'Biên lai Hikari Bank PNG đã được tải về thiết bị.', 'success');
                                              }}
                                              className="py-1.5 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 text-current text-[11px] font-bold flex items-center justify-center gap-1 min-h-[36px]"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                              <span>Tải PNG</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                try {
                                                  await osApi.createMedia({
                                                    type: 'photo',
                                                    title: `Biên lai Hikari ${String(att.refCode || att.txId || '')}`.trim(),
                                                    data_url: imgSrc,
                                                    album: 'Biên lai Hikari Bank',
                                                    category: 'bill',
                                                    caption: msg.content.slice(0, 120),
                                                  });
                                                  onShowToast('Đã lưu ảnh bill', 'Đã lưu vào Thư viện Ảnh.', 'success');
                                                } catch {
                                                  onShowToast('Lỗi lưu ảnh', 'Không thể lưu vào Thư viện Ảnh', 'error');
                                                }
                                              }}
                                              className="py-1.5 px-2.5 rounded-lg bg-black/20 hover:bg-black/30 text-current text-[11px] font-bold flex items-center justify-center gap-1 min-h-[36px]"
                                            >
                                              <Bookmark className="w-3.5 h-3.5" />
                                              <span>Lưu Ảnh</span>
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()
                                ) : null}
                            </div>
                          )}

                          {/* Video */}
                          {msg.msg_type === 'video' && typeof att.dataUrl === 'string' && (
                            <video src={att.dataUrl} controls className="rounded-xl max-h-52 w-full mb-1.5" />
                          )}

                          {/* Voice Player with Interactive Seekbar & Speed */}
                          {msg.msg_type === 'voice' && typeof att.dataUrl === 'string' && (
                            <div className="space-y-1.5 min-w-[205px]">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleVoicePlay(msg.id, att.dataUrl as string)}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                    isUser ? 'bg-white/25 text-white' : 'bg-violet-600 text-white'
                                  }`}
                                >
                                  {playingVoiceId === msg.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <input
                                    type="range"
                                    min={0}
                                    max={Math.max(1, audioDur)}
                                    step={0.1}
                                    value={Math.min(audioCur, Math.max(1, audioDur))}
                                    onChange={(e) => {
                                      const t = Number(e.target.value);
                                      setVoiceCurrentTime((prev) => ({ ...prev, [msg.id]: t }));
                                      if (playingVoiceId === msg.id && voiceAudioRef.current) {
                                        voiceAudioRef.current.currentTime = t;
                                      }
                                    }}
                                    className="w-full h-1.5 accent-violet-500 cursor-pointer"
                                  />
                                  <div className="flex items-center justify-between text-[9px] font-mono-num opacity-80">
                                    <span>{fmtAudioSec(audioCur)}</span>
                                    <span>{fmtAudioSec(audioDur)}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    const cur = voiceSpeed[msg.id] || 1;
                                    const next: 1 | 1.5 | 2 = cur === 1 ? 1.5 : cur === 1.5 ? 2 : 1;
                                    setVoiceSpeed((prev) => ({ ...prev, [msg.id]: next }));
                                    if (playingVoiceId === msg.id && voiceAudioRef.current) {
                                      voiceAudioRef.current.playbackRate = next;
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-black/15 text-[10px] font-mono-num"
                                >
                                  {voiceSpeed[msg.id] || 1}x
                                </button>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await osApi.transcribe(
                                      att.dataUrl as string,
                                      (att.mimeType as string) || 'audio/webm'
                                    );
                                    setTranscripts((prev) => ({ ...prev, [msg.id]: res.transcript }));
                                  } catch (err) {
                                    onShowToast(
                                      'Không thể chuyển giọng nói',
                                      err instanceof Error ? err.message : 'Lỗi STT',
                                      'error'
                                    );
                                  }
                                }}
                                className="text-[10px] underline opacity-85"
                              >
                                Chuyển thành văn bản
                              </button>
                              {transcripts[msg.id] && (
                                <p className="text-[11px] opacity-90 pt-1 border-t border-white/15">
                                  “{transcripts[msg.id]}”
                                </p>
                              )}
                            </div>
                          )}

                          {/* Location */}
                          {msg.msg_type === 'location' && (
                            <button
                              onClick={() => onOpenMaps((att.label as string) || msg.content)}
                              className="flex items-center gap-2 text-left underline"
                            >
                              <MapPin className="w-4 h-4 shrink-0" />
                              <span>{msg.content}</span>
                            </button>
                          )}

                          {/* Contact */}
                          {msg.msg_type === 'contact' && (
                            <div className="flex items-center gap-2">
                              <UserCheck className="w-4 h-4 shrink-0" />
                              <span>{msg.content}</span>
                            </div>
                          )}

                          {/* Event */}
                          {msg.msg_type === 'event' && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 shrink-0" />
                              <span>Lịch hẹn: {msg.content}</span>
                            </div>
                          )}

                          {/* File */}
                          {msg.msg_type === 'file' && (
                            <a
                              href={(att.dataUrl as string) || '#'}
                              download={(att.name as string) || 'file'}
                              className="flex items-center gap-2 underline"
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <span>{msg.content}</span>
                              <Download className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          )}

                          {/* Interactive Hikari Bank CHAR Request Card */}
                          {att.cardType === 'hikari_request_card' && (() => {
                            const reqId = String(att.requestId || '');
                            const effectiveStatus = resolvedReqOverrides[reqId] || String(att.status || 'pending');
                            const reqAmount = Math.round(Number(att.amount || 0));
                            const proposedAmt = Math.round(Number(att.proposedAmount || 0));
                            const statusLabel =
                              effectiveStatus === 'accepted'
                                ? 'Đã chuyển'
                                : effectiveStatus === 'counter_offered'
                                ? 'Đề xuất mới'
                                : effectiveStatus === 'declined'
                                ? 'Từ chối'
                                : effectiveStatus === 'cancelled'
                                ? 'Đã hủy'
                                : 'Đang xử lý';
                            const statusTone =
                              effectiveStatus === 'accepted'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : effectiveStatus === 'counter_offered'
                                ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                                : effectiveStatus === 'declined' || effectiveStatus === 'cancelled'
                                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                : 'bg-zinc-500/20 text-zinc-700 dark:text-zinc-300';
                            return (
                              <div className="mb-2 rounded-2xl p-2.5 bg-white/95 dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 border border-rose-200/80 dark:border-rose-800/60 shadow-xs space-y-2 min-w-[220px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold flex items-center gap-1.5 text-[#E14B5A]">
                                    <Landmark className="w-3.5 h-3.5 shrink-0" />
                                    <span>Hikari Bank · Yêu cầu thanh toán</span>
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${statusTone}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-sm font-extrabold font-mono-num tabular-nums">
                                    {reqAmount.toLocaleString('vi-VN')} VNĐ
                                  </span>
                                  {proposedAmt > 0 && effectiveStatus === 'counter_offered' && (
                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 font-mono-num tabular-nums">
                                      Đề xuất: {proposedAmt.toLocaleString('vi-VN')}đ
                                    </span>
                                  )}
                                </div>
                                {!isUser && effectiveStatus === 'counter_offered' && reqId && (
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <button
                                      type="button"
                                      disabled={respondingReqId === reqId}
                                      onClick={async () => {
                                        setRespondingReqId(reqId);
                                        try {
                                          await osApi.banking.respondCharRequest(reqId, 'confirm');
                                          setResolvedReqOverrides((prev) => ({ ...prev, [reqId]: 'accepted' }));
                                          await onRefreshData();
                                          onShowToast('Đã xác nhận nhận', 'Giao dịch Hikari Bank đã hoàn tất.', 'success');
                                        } catch (err) {
                                          onShowToast('Không thể xác nhận', err instanceof Error ? err.message : 'Lỗi Hikari Bank', 'error');
                                        } finally {
                                          setRespondingReqId(null);
                                        }
                                      }}
                                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold min-h-[36px]"
                                    >
                                      {respondingReqId === reqId ? 'Đang xử lý...' : 'Xác nhận nhận'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={respondingReqId === reqId}
                                      onClick={async () => {
                                        setRespondingReqId(reqId);
                                        try {
                                          await osApi.banking.respondCharRequest(reqId, 'cancel');
                                          setResolvedReqOverrides((prev) => ({ ...prev, [reqId]: 'cancelled' }));
                                          await onRefreshData();
                                          onShowToast('Đã hủy đề xuất', 'Yêu cầu chuyển tiền đã được hủy.');
                                        } catch (err) {
                                          onShowToast('Không thể hủy', err instanceof Error ? err.message : 'Lỗi Hikari Bank', 'error');
                                        } finally {
                                          setRespondingReqId(null);
                                        }
                                      }}
                                      className="py-1.5 px-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 text-[11px] font-semibold min-h-[36px]"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                )}
                                {Boolean((att.txId || att.refCode) && onOpenBankingTx) && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenBankingTx?.(String(att.txId || att.refCode))}
                                    className="w-full py-1.5 px-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[#E14B5A] text-[11px] font-bold flex items-center justify-center gap-1 min-h-[36px]"
                                  >
                                    <Landmark className="w-3.5 h-3.5 shrink-0" />
                                    <span>Xem biên lai Hikari Bank</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}

                          {/* Non-image Hikari TX card */}
                          {att.cardType === 'hikari_tx_card' && msg.msg_type !== 'image' && (
                            <div className="mb-2 rounded-2xl p-2.5 bg-white/95 dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 border border-rose-200/80 dark:border-rose-800/60 shadow-xs space-y-1.5 min-w-[210px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold flex items-center gap-1 text-[#E14B5A]">
                                  <Landmark className="w-3.5 h-3.5" />
                                  <span>Hikari Bank</span>
                                </span>
                                <span className="text-[10px] font-mono-num text-zinc-500">{String(att.refCode || '')}</span>
                              </div>
                              <p className="text-sm font-extrabold font-mono-num tabular-nums">
                                {Math.round(Number(att.amount || 0)).toLocaleString('vi-VN')} VNĐ
                              </p>
                              {Boolean(onOpenBankingTx && (att.txId || att.refCode)) && (
                                <button
                                  type="button"
                                  onClick={() => onOpenBankingTx?.(String(att.txId || att.refCode || ''))}
                                  className="w-full py-1.5 px-2.5 rounded-xl bg-[#E14B5A] text-white text-[11px] font-bold min-h-[36px]"
                                >
                                  Xem trong Hikari Bank
                                </button>
                              )}
                            </div>
                          )}

                          {/* Main Text */}
                          {(msg.msg_type === 'text' ||
                            (msg.msg_type === 'image' && msg.content && !msg.content.startsWith('Đã gửi '))) && (
                            <p className="whitespace-pre-wrap leading-relaxed break-words">
                              {renderFormattedContent(msg.content)}
                            </p>
                          )}

                          {translations[msg.id] && (
                            <p className="mt-1.5 pt-1.5 border-t border-current/15 text-[11px] opacity-90">
                              Dịch: {translations[msg.id]}
                            </p>
                          )}
                        </div>
                      )}

                      {!isUser && (
                        <button
                          onClick={() => setActiveMenuMsg(msg)}
                          className="opacity-60 hover:opacity-100 p-1 rounded-lg text-zinc-400"
                          title="Tùy chọn tin nhắn"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {Object.keys(reactions).length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5 px-1">
                        {Object.entries(reactions).map(([em, count]) => (
                          <button
                            key={em}
                            onClick={() => handleToggleReaction(msg, em)}
                            className="px-1.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] shadow-xs"
                          >
                            {em} {count > 1 ? count : ''}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-0.5 px-1 text-[10px] text-zinc-400">
                      <span className="font-mono-num">{formatRelativeTime(msg.created_at)}</span>
                      {msg.is_edited === 1 && <span>· Đã sửa</span>}
                      {msg.is_saved === 1 && <Bookmark className="w-2.5 h-2.5 text-amber-500 fill-current" />}
                      {!isUser && meta.emotionTag && (
                        <span className={`px-1.5 py-0.2 rounded ${getEmotionStyle(meta.emotionTag).bg} ${getEmotionStyle(meta.emotionTag).color} font-semibold`}>
                          {meta.emotionTag}
                        </span>
                      )}
                      {isUser && msg.delivery_status === 'sending' && <span>· Đang gửi...</span>}
                      {isUser && msg.delivery_status === 'queued' && (
                        <span className="text-amber-500">· Chờ kết nối</span>
                      )}
                      {isUser && msg.delivery_status === 'failed' && (
                        <button
                          onClick={() =>
                            onSendMessage({
                              content: msg.content,
                              msg_type: msg.msg_type,
                              attachment_json: msg.attachment_json,
                              reply_to_id: msg.reply_to_id,
                              trigger_ai: true,
                              tuning: currentTuning,
                            })
                          }
                          className="text-rose-500 font-semibold underline"
                        >
                          Gửi lỗi · Thử lại
                        </button>
                      )}
                    </div>

                    {/* Regenerate & Continue actions on latest AI turn */}
                    {!isUser && msg.id === latestAiMsgId && !isTyping && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => onRegenerateAi(msg.id)}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-medium text-zinc-500 hover:text-violet-600 flex items-center gap-1 bg-white/60 dark:bg-zinc-900/50"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Tạo lại</span>
                        </button>
                        {onContinueAi && (
                          <button
                            onClick={onContinueAi}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 bg-violet-50/70 dark:bg-violet-950/30"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Tiếp tục phản hồi</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* Live Streaming AI Bubble OR Thinking Indicator with Stop Button */}
          {isTyping && (
            <div className="flex items-end gap-2 pt-1">
              <img
                src={character?.avatar || conversation.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                alt={character?.name || conversation.title}
                loading="lazy"
                onError={(e) => handleCharImgError(e, character?.name || conversation.title)}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
              {streamingText ? (
                <div className="max-w-[78%] space-y-1.5">
                  <div className={`rounded-2xl rounded-bl-md px-3.5 py-2 doki-glass text-zinc-900 dark:text-zinc-100 shadow-sm ${fontSizeClass}`}>
                    <p className="whitespace-pre-wrap leading-relaxed break-words">
                      {renderFormattedContent(streamingText)}
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-violet-500 animate-pulse align-middle rounded-sm" />
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-1 text-[10px]">
                    <span className="text-violet-600 dark:text-violet-400 font-semibold">
                      {streamingStatus || 'Đang truyền trực tiếp...'}
                    </span>
                    <button
                      onClick={onCancelAi}
                      className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 font-semibold flex items-center gap-1"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>Dừng</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-2 rounded-2xl doki-glass flex items-center gap-2.5 text-xs">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce [animation-delay:0.3s]" />
                  </span>
                  <span className="text-zinc-500">{streamingStatus || 'AI đang suy nghĩ...'}</span>
                  <button
                    onClick={onCancelAi}
                    className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 font-semibold flex items-center gap-1"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    <span>Dừng</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Honest AI Error Banner with Retry */}
          {aiError && !isTyping && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-snug">{aiError}</p>
              </div>
              <button
                onClick={onRetryAi}
                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-semibold shrink-0 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử lại</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Scroll-to-Bottom Pill */}
      {showScrollBottomPill && (
        <button
          onClick={() => {
            scrollContainerRef.current?.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: 'smooth',
            });
            setShowScrollBottomPill(false);
          }}
          className="absolute bottom-20 right-4 z-20 px-3 py-1.5 rounded-full bg-violet-600 text-white text-[11px] font-semibold shadow-lg flex items-center gap-1"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>Tin nhắn mới</span>
        </button>
      )}

      {/* Composer */}
      <ChatComposer
        draft={draft}
        onChangeDraft={onChangeDraft}
        enterToSend={settings.enterToSend}
        isGroup={conversation.is_group === 1}
        groupCharacters={groupCharacters}
        stickerStats={stickerStats}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        editTarget={editTarget}
        onCancelEdit={() => setEditTarget(null)}
        onSaveEdit={async (newText) => {
          if (!editTarget) return;
          const updated = (await osApi.updateMessage(editTarget.id, { content: newText })) as ChatMessage;
          onUpsertLocalMessage(updated);
          setEditTarget(null);
          onShowToast('Đã chỉnh sửa', 'Tin nhắn đã được cập nhật.', 'success');
        }}
        onSendMessage={async (payload) => {
          const rId = replyTarget?.id || '';
          setReplyTarget(null);
          await onSendMessage({ ...payload, reply_to_id: rId, tuning: currentTuning });
        }}
        mediaAssets={mediaAssets}
        contacts={contacts}
        events={events}
        onToggleVirtualKeyboard={onToggleVirtualKeyboard}
        onMicActiveChange={onMicActiveChange}
        onRefreshData={onRefreshData}
        onShowToast={onShowToast}
        onQuickBankTransfer={onQuickBankTransfer}
        onRegisterTrayBack={(closer) => {
          composerTrayCloserRef.current = closer;
        }}
      />

      {/* Response Tuning Drawer */}
      {tuningOpen && (
        <div onClick={() => setTuningOpen(false)} className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-pink-500" />
                <h4 className="text-sm font-bold">Tinh chỉnh phản hồi AI</h4>
              </div>
              <button onClick={() => setTuningOpen(false)} className="p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Độ dài câu trả lời</label>
                <select
                  value={tuningDraft.length}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, length: e.target.value as ResponseTuningOptions['length'] })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="short" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Ngắn gọn (1-2 câu)</option>
                  <option value="medium" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Vừa phải tự nhiên</option>
                  <option value="long" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Dài & giàu cảm xúc</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Mức độ miêu tả</label>
                <select
                  value={tuningDraft.detail}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, detail: e.target.value as ResponseTuningOptions['detail'] })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="concise" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Trực tiếp</option>
                  <option value="balanced" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Cân bằng</option>
                  <option value="rich" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chi tiết sâu sắc</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Phong cách trần thuật</label>
                <select
                  value={tuningDraft.narration}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, narration: e.target.value as ResponseTuningOptions['narration'] })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="chat" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Nhắn tin tự nhiên</option>
                  <option value="novel" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tiểu thuyết tả cảnh</option>
                  <option value="roleplay" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Nhập vai *hành động*</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Tính hài hước</label>
                <select
                  value={tuningDraft.humor}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, humor: e.target.value as ResponseTuningOptions['humor'] })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="low" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Nghiêm túc</option>
                  <option value="balanced" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Vui vẻ vừa phải</option>
                  <option value="playful" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Hóm hỉnh nhiều</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Độ chủ động dẫn dắt</label>
                <select
                  value={tuningDraft.proactivity}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, proactivity: e.target.value as ResponseTuningOptions['proactivity'] })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="low" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Lắng nghe nhiều hơn</option>
                  <option value="medium" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Cân bằng</option>
                  <option value="high" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chủ động gợi mở</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Ngôn ngữ phản hồi</label>
                <select
                  value={tuningDraft.language || 'vi'}
                  onChange={(e) => setTuningDraft({ ...tuningDraft, language: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="vi" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tiếng Việt</option>
                  <option value="en" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">English</option>
                  <option value="ja" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">日本語</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Xưng hô tùy chỉnh (VD: anh - em, cậu - tớ)</label>
              <input
                value={tuningDraft.pronouns || ''}
                onChange={(e) => setTuningDraft({ ...tuningDraft, pronouns: e.target.value })}
                placeholder="Để trống nếu dùng mặc định của nhân vật"
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setTuningOpen(false)} className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold">
                Đóng
              </button>
              <button
                onClick={() => saveTuningOptions(tuningDraft)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-semibold"
              >
                Áp dụng tinh chỉnh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Context Action Sheet */}
      {activeMenuMsg && (
        <div
          onClick={() => setActiveMenuMsg(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-around py-1 border-b border-zinc-100 dark:border-zinc-800">
              {QUICK_REACTIONS.map((em) => (
                <button
                  key={em}
                  onClick={() => handleToggleReaction(activeMenuMsg, em)}
                  className="text-xl hover:scale-125 transition-transform p-1.5"
                >
                  {em}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] font-medium">
              <button
                onClick={() => {
                  setReplyTarget(activeMenuMsg);
                  setActiveMenuMsg(null);
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Reply className="w-4 h-4" />
                <span>Trả lời</span>
              </button>

              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  try {
                    await osApi.messagesV3.rememberMessage(target.id, {
                      character_id: character?.id || target.sender_id,
                    });
                    await onRefreshData();
                    onShowToast('Đã ghi nhớ', 'AI sẽ lưu chi tiết này vào Ký ức riêng.', 'success');
                  } catch (err) {
                    onShowToast('Không thể ghi nhớ', err instanceof Error ? err.message : 'Lỗi', 'error');
                  }
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1 text-violet-600"
              >
                <Brain className="w-4 h-4" />
                <span>Ghi nhớ</span>
              </button>

              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  const updated = await osApi.messagesV3.toggleSaveMessage(target.id);
                  onUpsertLocalMessage(updated);
                  onShowToast(updated.is_saved ? 'Đã lưu Kỷ niệm' : 'Đã bỏ lưu', '');
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1 text-amber-600"
              >
                <Bookmark className="w-4 h-4" />
                <span>{activeMenuMsg.is_saved ? 'Bỏ lưu' : 'Lưu kỷ niệm'}</span>
              </button>

              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  try {
                    const ch = characters.find((c) => c.id === target.sender_id) || character;
                    const tts = await osApi.tts(
                      target.content,
                      ch?.voice_name || 'Kore',
                      ch?.voice_style || 'Warm'
                    );
                    await onPlayTts(tts.audioBase64);
                  } catch (err) {
                    onShowToast('Không phát được TTS', err instanceof Error ? err.message : 'Lỗi TTS', 'error');
                  }
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Volume2 className="w-4 h-4" />
                <span>Nghe (TTS)</span>
              </button>

              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  try {
                    const tr = (await osApi.translate(target.content, 'Auto', 'Vietnamese')) as {
                      translated_text: string;
                    };
                    setTranslations((prev) => ({ ...prev, [target.id]: tr.translated_text }));
                  } catch (err) {
                    onShowToast('Dịch thất bại', err instanceof Error ? err.message : 'Lỗi AI', 'error');
                  }
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Languages className="w-4 h-4" />
                <span>Dịch</span>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard?.writeText(activeMenuMsg.content).catch(() => {});
                  onAddClipboard(activeMenuMsg.content);
                  setActiveMenuMsg(null);
                  onShowToast('Đã sao chép', 'Đã lưu vào bộ nhớ tạm');
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Copy className="w-4 h-4" />
                <span>Sao chép</span>
              </button>

              <button
                onClick={() => {
                  setForwardMsg(activeMenuMsg);
                  setActiveMenuMsg(null);
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Forward className="w-4 h-4" />
                <span>Chuyển tiếp</span>
              </button>

              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  const updated = (await osApi.updateMessage(target.id, {
                    is_pinned: target.is_pinned ? 0 : 1,
                  })) as ChatMessage;
                  onUpsertLocalMessage(updated);
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
              >
                <Pin className="w-4 h-4" />
                <span>{activeMenuMsg.is_pinned ? 'Bỏ ghim' : 'Ghim'}</span>
              </button>

              {activeMenuMsg.sender_type === 'user' ? (
                <button
                  onClick={() => {
                    setEditTarget(activeMenuMsg);
                    setActiveMenuMsg(null);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center gap-1"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Chỉnh sửa</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setReportMsg(activeMenuMsg);
                    setActiveMenuMsg(null);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-rose-500 flex flex-col items-center gap-1"
                >
                  <Flag className="w-4 h-4" />
                  <span>Báo cáo</span>
                </button>
              )}
            </div>

            {activeMenuMsg.sender_type === 'character' && onContinueAi && (
              <button
                onClick={() => {
                  setActiveMenuMsg(null);
                  void onContinueAi();
                }}
                className="w-full py-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tiếp tục phản hồi AI</span>
              </button>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-semibold">
              <button
                onClick={() => {
                  setDetailMsg(activeMenuMsg);
                  setActiveMenuMsg(null);
                }}
                className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center gap-1"
              >
                <Info className="w-3.5 h-3.5" />
                <span>Chi tiết</span>
              </button>
              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  await osApi.messagesV3.deleteMessageScoped(target.id, 'self');
                  onRemoveLocalMessage(target.id);
                }}
                className="py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ẩn phía tôi</span>
              </button>
              <button
                onClick={async () => {
                  const target = activeMenuMsg;
                  setActiveMenuMsg(null);
                  await osApi.messagesV3.deleteMessageScoped(target.id, 'all');
                  onRemoveLocalMessage(target.id);
                }}
                className="py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa vĩnh viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Details Modal */}
      {detailMsg && (
        <div
          onClick={() => setDetailMsg(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Chi tiết tin nhắn</h4>
              <button onClick={() => setDetailMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
              <p><strong>Người gửi:</strong> {detailMsg.sender_name}</p>
              <p><strong>Loại:</strong> {detailMsg.msg_type}</p>
              <p><strong>Thời gian:</strong> {new Date(detailMsg.created_at).toLocaleString('vi-VN')}</p>
              <p><strong>Trạng thái:</strong> {detailMsg.delivery_status || 'sent'}</p>
              {detailMsg.edited_at && (
                <p><strong>Chỉnh sửa lúc:</strong> {new Date(detailMsg.edited_at).toLocaleString('vi-VN')}</p>
              )}
              {safeJson<{ emotionReason?: string }>(detailMsg.metadata_json, {}).emotionReason && (
                <p>
                  <strong>Cảm xúc ngữ cảnh:</strong>{' '}
                  {safeJson<{ emotionReason?: string }>(detailMsg.metadata_json, {}).emotionReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          onClick={() => setForwardMsg(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Chuyển tiếp tin nhắn tới...</h4>
              <button onClick={() => setForwardMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto os-scroll space-y-1.5">
              {allConversations
                .filter((c) => c.id !== conversation.id)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const sent = await osApi.messagesV3.forwardMessage(forwardMsg.id, c.id);
                      onUpsertLocalMessage(sent);
                      setForwardMsg(null);
                      onShowToast('Đã chuyển tiếp', `Đã gửi tới ${c.title}`, 'success');
                    }}
                    className="w-full p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2.5 text-left"
                  >
                    <img
                      src={c.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                      alt={c.title}
                      loading="lazy"
                      onError={(e) => handleCharImgError(e, c.title)}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <span className="font-semibold truncate">{c.title}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Report Message Modal */}
      {reportMsg && (
        <div
          onClick={() => setReportMsg(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs"
          >
            <h4 className="font-bold text-sm">Báo cáo tin nhắn</h4>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value="Phản hồi chưa phù hợp" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Phản hồi chưa phù hợp</option>
              <option value="Lặp lại / lạc đề" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Lặp lại / lạc đề</option>
              <option value="Quên ngữ cảnh quan trọng" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Quên ngữ cảnh quan trọng</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReportMsg(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  await osApi.messagesV3.reportMessage(reportMsg.id, reportReason);
                  setReportMsg(null);
                  onShowToast('Đã ghi nhận báo cáo', 'Cảm ơn phản hồi của bạn.', 'success');
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 text-white font-semibold"
              >
                Gửi báo cáo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roleplay Recap Modal */}
      {recapText && (
        <div
          onClick={() => setRecapText(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span>Trước đó trong câu chuyện</span>
              </h4>
              <button onClick={() => setRecapText(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="leading-relaxed text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{recapText}</p>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[70] bg-black/92 flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
          >
            <button
              type="button"
              onClick={() => setLightboxZoomed((z) => !z)}
              className="px-3 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
            >
              {lightboxZoomed ? 'Thu nhỏ' : 'Phóng to'}
            </button>
            <button
              type="button"
              onClick={() => downloadDataUrlAsPng(lightboxUrl, `PhoneOS_Image_${Date.now()}.png`)}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
              title="Tải ảnh"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full overflow-auto flex items-center justify-center"
          >
            <img
              src={lightboxUrl}
              alt=""
              onClick={() => setLightboxZoomed((z) => !z)}
              className={`rounded-2xl transition-all cursor-zoom-in ${
                lightboxZoomed ? 'w-[145%] max-w-none' : 'max-w-full max-h-[85vh] object-contain'
              }`}
            />
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      <ChatSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        conversation={conversation}
        messages={threadMessages}
        characters={characters}
        conversationMembers={conversationMembers}
        chatSummaries={chatSummaries}
        onRefreshData={onRefreshData}
        onDeleteConversation={() =>
          onRequestConfirm({
            title: `Xóa cuộc trò chuyện "${conversation.title}"?`,
            message: 'Tất cả tin nhắn trong cuộc trò chuyện này sẽ bị xóa vĩnh viễn.',
            destructive: true,
            onConfirm: async () => {
              await osApi.deleteConversation(conversation.id);
              setSettingsOpen(false);
              await onRefreshData();
              onBack();
              onShowToast('Đã xóa đoạn chat', conversation.title);
            },
          })
        }
        onClearHistory={() =>
          onRequestConfirm({
            title: 'Xóa toàn bộ lịch sử tin nhắn?',
            message: 'Cuộc trò chuyện vẫn giữ lại nhưng mọi tin nhắn cũ sẽ bị xóa sạch.',
            destructive: true,
            onConfirm: async () => {
              await osApi.messagesV3.clearConversationHistory(conversation.id);
              setOlderMessages([]);
              setSettingsOpen(false);
              await onRefreshData();
              onShowToast('Đã làm sạch lịch sử', conversation.title);
            },
          })
        }
        onShowToast={onShowToast}
      />

      {/* Memory & Relationship Drawer */}
      {character && (
        <MemoryAndRelationshipDrawer
          open={memoryOpen}
          onClose={() => setMemoryOpen(false)}
          character={character}
          conversation={conversation}
          memories={memories}
          relationship={relationship}
          relationshipEvents={relationshipEvents}
          onJumpToMessage={scrollToMessage}
          onRefreshData={onRefreshData}
          onAiReplyApplied={() => {}}
          onShowToast={onShowToast}
        />
      )}

      {/* Roleplay Setup Modal */}
      <RoleplaySetupModal
        open={roleplayModalOpen}
        onClose={() => setRoleplayModalOpen(false)}
        conversation={conversation}
        characterName={character?.name || conversation.title}
        characterId={character?.id}
        scenarios={roleplayScenarios}
        onRefreshData={onRefreshData}
        onShowToast={onShowToast}
      />
    </div>
  );
}
