import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Home, MessageCircle, Sparkles, User } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { Character, ChatMessage, Conversation, ResponseTuningOptions } from '../types/os';
import { DokiHomeView } from '../components/messages/DokiHomeView';
import { ConversationListView } from '../components/messages/ConversationListView';
import { DiscoverCharactersView } from '../components/messages/DiscoverCharactersView';
import { MyCharactersView } from '../components/messages/MyCharactersView';
import { GroupsTabView } from '../components/messages/GroupsTabView';
import { MemoriesJournalView } from '../components/messages/MemoriesJournalView';
import { CharacterProfileView } from '../components/messages/CharacterProfileView';
import {
  DokiNotificationsView,
  DokiSettingsView,
  DokiUserProfileView,
} from '../components/messages/DokiUserAndSettingsViews';
import { ChatThreadView } from '../components/messages/ChatThreadView';

type MessagesTab =
  | 'home'
  | 'chats'
  | 'discover'
  | 'characters'
  | 'groups'
  | 'memories'
  | 'notifications'
  | 'settings'
  | 'profile';

const VALID_TABS: MessagesTab[] = [
  'home',
  'chats',
  'discover',
  'characters',
  'groups',
  'memories',
  'notifications',
  'settings',
  'profile',
];
const SUB_TABS = new Set<MessagesTab>(['groups', 'memories', 'notifications', 'settings']);
const DRAFTS_STORAGE_KEY = 'phoneos_msg_drafts_v3';
const ACTIVE_TAB_STORAGE_KEY = 'phoneos_doki_active_tab_v1';

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function loadSavedTab(): MessagesTab {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) as MessagesTab | null;
    if (saved && VALID_TABS.includes(saved)) return saved;
  } catch {
    // ignore
  }
  return 'home';
}

export function MessagesApp() {
  const {
    data,
    appParams,
    refreshData,
    openApp,
    openShareSheet,
    startCall,
    playTtsAudio,
    showToast,
    requestConfirm,
    registerBackHandler,
    isOnline,
    queueOfflineMessage,
    virtualKeyboardOpen,
    setVirtualKeyboardOpen,
    setMicActive,
    addClipboardEntry,
    upsertLocalMessage,
    replaceLocalMessage,
    removeLocalMessage,
    markConversationRead,
    applyAiReplyState,
    playSoundEffect,
    triggerHaptic,
  } = useOS();

  const [activeTab, setActiveTab] = useState<MessagesTab>(() => loadSavedTab());
  const sourceTabRef = useRef<MessagesTab>(
    SUB_TABS.has(activeTab) ? 'home' : activeTab
  );
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [profileCharId, setProfileCharId] = useState<string | null>(null);
  const [chatOpenedFromProfile, setChatOpenedFromProfile] = useState(false);
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts());
  const [typingConvIds, setTypingConvIds] = useState<Record<string, boolean>>({});
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [streamingStatuses, setStreamingStatuses] = useState<Record<string, string>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string | null>>({});
  const activeReqIdsRef = useRef<Record<string, string>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [editCharTarget, setEditCharTarget] = useState<Character | null>(null);

  const threadOverlayCloserRef = useRef<(() => boolean) | null>(null);
  const profileOverlayCloserRef = useRef<(() => boolean) | null>(null);
  const tabOverlayCloserRef = useRef<(() => boolean) | null>(null);

  const conversations = useMemo(() => data?.conversations || [], [data?.conversations]);
  const messages = useMemo(() => data?.messages || [], [data?.messages]);
  const characters = useMemo(() => data?.characters || [], [data?.characters]);
  const memories = useMemo(() => data?.memories || [], [data?.memories]);
  const relationships = useMemo(() => data?.aiRelationships || [], [data?.aiRelationships]);
  const relationshipEvents = useMemo(() => data?.relationshipEvents || [], [data?.relationshipEvents]);
  const conversationMembers = useMemo(() => data?.conversationMembers || [], [data?.conversationMembers]);
  const chatSummaries = useMemo(() => data?.chatSummaries || [], [data?.chatSummaries]);
  const searchHistory = useMemo(() => data?.searchHistory || [], [data?.searchHistory]);
  const roleplayScenarios = useMemo(() => data?.roleplayScenarios || [], [data?.roleplayScenarios]);
  const stickerStats = useMemo(() => data?.stickerStats || [], [data?.stickerStats]);
  const dokiSettings = data?.dokiSettings || null;
  const aiProviderConfig = data?.aiProviderConfig || null;
  const notifications = useMemo(() => data?.notifications || [], [data?.notifications]);
  const mediaAssets = useMemo(() => data?.media || [], [data?.media]);
  const contacts = useMemo(() => data?.contacts || [], [data?.contacts]);
  const events = useMemo(() => data?.events || [], [data?.events]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  // Persist drafts per conversation safely
  useEffect(() => {
    try {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // ignore storage quota errors
    }
  }, [drafts]);

  // Clean up stale IDs if character or conversation was deleted
  useEffect(() => {
    if (profileCharId && characters.length > 0 && !characters.some((c) => c.id === profileCharId)) {
      setProfileCharId(null);
      setChatOpenedFromProfile(false);
    }
  }, [profileCharId, characters]);

  useEffect(() => {
    if (selectedConvId && conversations.length > 0 && !conversations.some((c) => c.id === selectedConvId)) {
      setSelectedConvId(null);
    }
  }, [selectedConvId, conversations]);

  const navigateToTab = useCallback(
    (nextTab: MessagesTab) => {
      if (!SUB_TABS.has(activeTab) && SUB_TABS.has(nextTab)) {
        sourceTabRef.current = activeTab;
      } else if (!SUB_TABS.has(nextTab)) {
        sourceTabRef.current = nextTab;
      }
      setActiveTab(nextTab);
    },
    [activeTab]
  );

  const openConversation = useCallback(
    (convId: string, jumpMsgId?: string, opts?: { fromProfile?: boolean }) => {
      const fromProfile = Boolean(opts?.fromProfile);
      setChatOpenedFromProfile(fromProfile);
      if (!fromProfile) {
        setProfileCharId(null);
      }
      setSelectedConvId(convId);
      setJumpToMessageId(jumpMsgId || null);
      markConversationRead(convId);
    },
    [markConversationRead]
  );

  const handleCloseThread = useCallback(() => {
    setSelectedConvId(null);
    setJumpToMessageId(null);
    if (!chatOpenedFromProfile) {
      setProfileCharId(null);
    }
    setChatOpenedFromProfile(false);
  }, [chatOpenedFromProfile]);

  const handleChangeDraft = useCallback((convId: string, text: string) => {
    setDrafts((prev) => {
      if (!text && !prev[convId]) return prev;
      if (!text) {
        const next = { ...prev };
        delete next[convId];
        return next;
      }
      return { ...prev, [convId]: text };
    });
  }, []);

  const handleStartChatWithCharacter = useCallback(
    async (char: Character, opts?: { fromProfile?: boolean; starterText?: string }) => {
      const existing = conversations.find((c) => !c.is_group && c.character_id === char.id);
      if (existing) {
        if (existing.archived) {
          await osApi.updateConversation(existing.id, { archived: 0 }).catch(() => {});
          await refreshData();
        }
        if (opts?.starterText) {
          handleChangeDraft(existing.id, opts.starterText);
        }
        openConversation(existing.id, undefined, { fromProfile: opts?.fromProfile });
        return;
      }
      try {
        const created = (await osApi.createConversation({
          title: char.name,
          is_group: 0,
          avatar: char.avatar,
          character_id: char.id,
        })) as Conversation;
        await refreshData();
        if (created?.id) {
          if (opts?.starterText) {
            handleChangeDraft(created.id, opts.starterText);
          }
          openConversation(created.id, undefined, { fromProfile: opts?.fromProfile });
        }
      } catch (err) {
        showToast('Không thể mở trò chuyện', err instanceof Error ? err.message : 'Lỗi kết nối', 'error');
      }
    },
    [conversations, handleChangeDraft, openConversation, refreshData, showToast]
  );

  const runStreamOrStandardReply = useCallback(
    async (
      convId: string,
      opts: {
        content: string;
        msg_type: ChatMessage['msg_type'];
        attachment_json?: string;
        reply_to_id?: string;
        client_temp_id?: string;
        skip_save_user?: boolean;
        tuning?: ResponseTuningOptions;
      }
    ) => {
      const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      activeReqIdsRef.current[convId] = reqId;
      const controller = new AbortController();
      abortControllersRef.current[convId] = controller;

      setAiErrors((prev) => ({ ...prev, [convId]: null }));
      setTypingConvIds((prev) => ({ ...prev, [convId]: true }));
      setStreamingTexts((prev) => ({ ...prev, [convId]: '' }));
      setStreamingStatuses((prev) => ({ ...prev, [convId]: 'Đang đọc ngữ cảnh & ký ức...' }));

      const useStreaming = (aiProviderConfig?.streaming_enabled ?? 1) !== 0;

      try {
        if (useStreaming) {
          let receivedError = '';
          await osApi.messagesV3.streamMessage(
            {
              conversation_id: convId,
              content: opts.content,
              msg_type: opts.msg_type,
              attachment_json: opts.attachment_json || '{}',
              reply_to_id: opts.reply_to_id || '',
              client_temp_id: opts.client_temp_id,
              request_id: reqId,
              skip_save_user: opts.skip_save_user,
              tuning: opts.tuning,
            },
            {
              signal: controller.signal,
              onUserSaved: (userMessage) => {
                if (opts.client_temp_id) {
                  replaceLocalMessage(opts.client_temp_id, userMessage);
                } else {
                  upsertLocalMessage(userMessage);
                }
              },
              onStatus: (label) => {
                setStreamingStatuses((prev) => ({ ...prev, [convId]: label }));
              },
              onChunk: (visibleText) => {
                setStreamingTexts((prev) => ({ ...prev, [convId]: visibleText }));
              },
              onDone: (res) => {
                setStreamingTexts((prev) => ({ ...prev, [convId]: '' }));
                setStreamingStatuses((prev) => ({ ...prev, [convId]: '' }));
                if (res.userMessage && opts.client_temp_id) {
                  replaceLocalMessage(opts.client_temp_id, res.userMessage);
                }
                applyAiReplyState({
                  aiMessage: res.aiMessage || null,
                  aiMessages: res.aiMessages,
                  updatedCharacter: res.updatedCharacter || null,
                  newMemoryRecord: res.newMemoryRecord || null,
                });
                refreshData().catch(() => {});
              },
              onError: (errMessage) => {
                receivedError = errMessage;
              },
            }
          );
          if (receivedError) {
            setAiErrors((prev) => ({ ...prev, [convId]: receivedError }));
          }
        } else {
          const res = await osApi.sendMessage({
            conversation_id: convId,
            content: opts.content,
            msg_type: opts.msg_type,
            attachment_json: opts.attachment_json || '{}',
            reply_to_id: opts.reply_to_id || '',
            trigger_ai: true,
            client_temp_id: opts.client_temp_id,
            request_id: reqId,
          });
          if (opts.client_temp_id && res.userMessage) {
            replaceLocalMessage(opts.client_temp_id, res.userMessage);
          }
          if (res.aiError) {
            setAiErrors((prev) => ({ ...prev, [convId]: res.aiError }));
          } else {
            applyAiReplyState({
              aiMessage: res.aiMessage,
              aiMessages: res.aiMessages,
              updatedCharacter: res.updatedCharacter,
              newMemoryRecord: res.newMemoryRecord,
            });
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Không thể tạo phản hồi AI.';
        setAiErrors((prev) => ({ ...prev, [convId]: msg }));
        playSoundEffect('error');
      } finally {
        if (activeReqIdsRef.current[convId] === reqId) {
          delete activeReqIdsRef.current[convId];
          delete abortControllersRef.current[convId];
          setTypingConvIds((prev) => ({ ...prev, [convId]: false }));
          setStreamingTexts((prev) => ({ ...prev, [convId]: '' }));
          setStreamingStatuses((prev) => ({ ...prev, [convId]: '' }));
        }
      }
    },
    [aiProviderConfig?.streaming_enabled, applyAiReplyState, playSoundEffect, refreshData, replaceLocalMessage, upsertLocalMessage]
  );

  const handleRetryAi = useCallback(
    async (convId: string, lastMessageId?: string) => {
      const latestUserMsg = [...messages]
        .filter((m) => m.conversation_id === convId && m.sender_type === 'user' && !m.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

      if (latestUserMsg) {
        await runStreamOrStandardReply(convId, {
          content: latestUserMsg.content,
          msg_type: latestUserMsg.msg_type,
          attachment_json: latestUserMsg.attachment_json,
          skip_save_user: true,
        });
        return;
      }

      const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      activeReqIdsRef.current[convId] = reqId;
      setAiErrors((prev) => ({ ...prev, [convId]: null }));
      setTypingConvIds((prev) => ({ ...prev, [convId]: true }));
      try {
        const res = await osApi.requestAiReply({
          conversation_id: convId,
          last_message_id: lastMessageId,
          request_id: reqId,
        });
        if (res.aiError) {
          setAiErrors((prev) => ({ ...prev, [convId]: res.aiError }));
        } else {
          applyAiReplyState({
            aiMessage: res.aiMessage,
            aiMessages: res.aiMessages,
            updatedCharacter: res.updatedCharacter,
            newMemoryRecord: res.newMemoryRecord,
          });
        }
      } catch (err) {
        setAiErrors((prev) => ({
          ...prev,
          [convId]: err instanceof Error ? err.message : 'Không thể tạo phản hồi AI.',
        }));
      } finally {
        if (activeReqIdsRef.current[convId] === reqId) {
          delete activeReqIdsRef.current[convId];
          setTypingConvIds((prev) => ({ ...prev, [convId]: false }));
        }
      }
    },
    [applyAiReplyState, messages, runStreamOrStandardReply]
  );

  // Sync launch params (conversationId / characterId / tab / autoReplyMsgId)
  const handledLaunchRef = useRef<string>('');
  useEffect(() => {
    const key = `${appParams.conversationId || ''}|${appParams.characterId || ''}|${appParams.tab || ''}|${appParams.autoReplyMsgId || ''}`;
    if (!key || key === '|||' || handledLaunchRef.current === key) return;
    handledLaunchRef.current = key;

    if (appParams.tab && VALID_TABS.includes(appParams.tab as MessagesTab)) {
      navigateToTab(appParams.tab as MessagesTab);
    }
    if (appParams.conversationId) {
      openConversation(appParams.conversationId);
      if (appParams.autoReplyMsgId) {
        void handleRetryAi(appParams.conversationId, appParams.autoReplyMsgId);
      }
    } else if (appParams.characterId) {
      const char = characters.find((c) => c.id === appParams.characterId);
      if (char) {
        void handleStartChatWithCharacter(char);
      }
    }
  }, [appParams, characters, handleRetryAi, handleStartChatWithCharacter, navigateToTab, openConversation]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  const profileChar = useMemo(
    () => (profileCharId ? characters.find((c) => c.id === profileCharId) || null : null),
    [characters, profileCharId]
  );

  // Unified Android Back Priority
  useEffect(() => {
    return registerBackHandler(() => {
      if (selectedConv) {
        if (threadOverlayCloserRef.current?.()) return true;
        handleCloseThread();
        return true;
      }
      if (profileChar) {
        if (profileOverlayCloserRef.current?.()) return true;
        setProfileCharId(null);
        return true;
      }
      if (tabOverlayCloserRef.current?.()) {
        return true;
      }
      if (SUB_TABS.has(activeTab)) {
        setActiveTab(sourceTabRef.current || 'home');
        return true;
      }
      return false;
    });
  }, [registerBackHandler, selectedConv, profileChar, activeTab, handleCloseThread]);

  const totalUnread = useMemo(
    () =>
      conversations
        .filter((c) => !c.archived)
        .reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  );

  const handleUpdateConversation = useCallback(
    async (convId: string, patch: Record<string, unknown>) => {
      try {
        await osApi.updateConversation(convId, patch);
        await refreshData();
      } catch (err) {
        showToast('Lỗi cập nhật', err instanceof Error ? err.message : 'Không thể cập nhật hội thoại', 'error');
      }
    },
    [refreshData, showToast]
  );

  const handleDeleteConversation = useCallback(
    (conv: Conversation) => {
      requestConfirm({
        title: 'Xóa cuộc trò chuyện?',
        message: `Xóa toàn bộ lịch sử trò chuyện "${conv.title}"? Thao tác này không thể hoàn tác.`,
        destructive: true,
        confirmLabel: 'Xóa',
        onConfirm: async () => {
          await osApi.deleteConversation(conv.id);
          if (selectedConvId === conv.id) setSelectedConvId(null);
          await refreshData();
          showToast('Đã xóa', `Đã xóa hội thoại "${conv.title}"`, 'info');
        },
      });
    },
    [refreshData, requestConfirm, selectedConvId, showToast]
  );

  const handleSendMessage = useCallback(
    async (
      convId: string,
      payload: {
        content: string;
        msg_type: ChatMessage['msg_type'];
        attachment_json?: string;
        reply_to_id?: string;
        trigger_ai?: boolean;
        tuning?: ResponseTuningOptions;
      }
    ) => {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();
      const profileName = data?.profile?.name || 'Bạn';
      const profileAvatar = data?.profile?.avatar || '';

      const optimisticMsg: ChatMessage = {
        id: tempId,
        client_temp_id: tempId,
        conversation_id: convId,
        sender_type: 'user',
        sender_id: 'user_1',
        sender_name: profileName,
        sender_avatar: profileAvatar,
        content: payload.content,
        msg_type: payload.msg_type,
        attachment_json: payload.attachment_json || '{}',
        reply_to_id: payload.reply_to_id || '',
        reactions_json: '[]',
        is_edited: 0,
        is_pinned: 0,
        delivery_status: isOnline ? 'sending' : 'queued',
        metadata_json: '{}',
        created_at: nowIso,
      };

      upsertLocalMessage(optimisticMsg);
      handleChangeDraft(convId, '');
      playSoundEffect('msg');
      triggerHaptic('msg');

      if (!isOnline) {
        queueOfflineMessage({
          client_temp_id: tempId,
          conversation_id: convId,
          content: payload.content,
          msg_type: payload.msg_type,
          attachment_json: payload.attachment_json || '{}',
          reply_to_id: payload.reply_to_id || '',
        });
        showToast('Đang ngoại tuyến', 'Tin nhắn đã lưu vào hàng đợi và sẽ tự gửi khi có mạng.', 'info');
        return;
      }

      const conv = conversations.find((c) => c.id === convId);
      const shouldAiReply =
        payload.trigger_ai !== undefined
          ? payload.trigger_ai
          : Boolean(conv?.character_id || conv?.is_group);

      if (!shouldAiReply) {
        try {
          const res = await osApi.sendMessage({
            conversation_id: convId,
            content: payload.content,
            msg_type: payload.msg_type,
            attachment_json: payload.attachment_json || '{}',
            reply_to_id: payload.reply_to_id || '',
            trigger_ai: false,
            client_temp_id: tempId,
          });
          replaceLocalMessage(tempId, res.userMessage);
        } catch (err) {
          upsertLocalMessage({ ...optimisticMsg, delivery_status: 'failed' });
          showToast('Gửi lỗi', err instanceof Error ? err.message : 'Lỗi gửi tin', 'error');
        }
        return;
      }

      await runStreamOrStandardReply(convId, {
        content: payload.content,
        msg_type: payload.msg_type,
        attachment_json: payload.attachment_json,
        reply_to_id: payload.reply_to_id,
        client_temp_id: tempId,
        tuning: payload.tuning,
      });
    },
    [
      conversations,
      data?.profile?.avatar,
      data?.profile?.name,
      handleChangeDraft,
      isOnline,
      playSoundEffect,
      queueOfflineMessage,
      replaceLocalMessage,
      runStreamOrStandardReply,
      showToast,
      triggerHaptic,
      upsertLocalMessage,
    ]
  );

  const handleCancelAi = useCallback(async (convId: string) => {
    const reqId = activeReqIdsRef.current[convId];
    abortControllersRef.current[convId]?.abort();
    delete abortControllersRef.current[convId];
    delete activeReqIdsRef.current[convId];
    setTypingConvIds((prev) => ({ ...prev, [convId]: false }));
    setStreamingTexts((prev) => ({ ...prev, [convId]: '' }));
    setStreamingStatuses((prev) => ({ ...prev, [convId]: '' }));
    try {
      await osApi.messagesV3.cancelAi({ conversation_id: convId, request_id: reqId });
    } catch {
      // ignore cancel network error
    }
  }, []);

  const handleRegenerateAi = useCallback(
    async (convId: string, targetMsgId: string) => {
      const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      activeReqIdsRef.current[convId] = reqId;
      setAiErrors((prev) => ({ ...prev, [convId]: null }));
      setTypingConvIds((prev) => ({ ...prev, [convId]: true }));
      setStreamingStatuses((prev) => ({ ...prev, [convId]: 'Đang tạo phản hồi mới...' }));
      try {
        const res = await osApi.messagesV3.regenerateAi({
          conversation_id: convId,
          target_message_id: targetMsgId,
          request_id: reqId,
        });
        await refreshData();
        if (res.aiError) {
          setAiErrors((prev) => ({ ...prev, [convId]: res.aiError }));
        } else {
          applyAiReplyState({
            aiMessage: res.aiMessage,
            aiMessages: res.aiMessages,
            updatedCharacter: res.updatedCharacter,
            newMemoryRecord: res.newMemoryRecord,
          });
        }
      } catch (err) {
        setAiErrors((prev) => ({
          ...prev,
          [convId]: err instanceof Error ? err.message : 'Không thể tạo lại phản hồi AI.',
        }));
      } finally {
        if (activeReqIdsRef.current[convId] === reqId) {
          delete activeReqIdsRef.current[convId];
          setTypingConvIds((prev) => ({ ...prev, [convId]: false }));
          setStreamingStatuses((prev) => ({ ...prev, [convId]: '' }));
        }
      }
    },
    [applyAiReplyState, refreshData]
  );

  const handleContinueAi = useCallback(
    async (convId: string) => {
      setAiErrors((prev) => ({ ...prev, [convId]: null }));
      setTypingConvIds((prev) => ({ ...prev, [convId]: true }));
      setStreamingStatuses((prev) => ({ ...prev, [convId]: 'Đang viết tiếp mạch suy nghĩ...' }));
      try {
        const res = await osApi.messagesV3.continueAi(convId);
        applyAiReplyState({
          aiMessage: res.aiMessage,
          aiMessages: res.aiMessages,
          updatedCharacter: res.updatedCharacter,
        });
        await refreshData();
      } catch (err) {
        setAiErrors((prev) => ({
          ...prev,
          [convId]: err instanceof Error ? err.message : 'Không thể viết tiếp phản hồi.',
        }));
      } finally {
        setTypingConvIds((prev) => ({ ...prev, [convId]: false }));
        setStreamingStatuses((prev) => ({ ...prev, [convId]: '' }));
      }
    },
    [applyAiReplyState, refreshData]
  );

  const handleStartCallFromChar = useCallback(
    (char: Character, isVideo = false) => {
      startCall({
        name: char.name,
        phone: char.role_title || 'AI Voice',
        avatar: char.avatar,
        isAi: true,
        isVideo,
        characterId: char.id,
      });
    },
    [startCall]
  );

  const themeWrapperClass =
    dokiSettings?.theme_mode === 'dark' ? 'dark' : '';

  const showMainShell = !selectedConv && !profileChar;
  const convChar = selectedConv?.character_id
    ? characters.find((c) => c.id === selectedConv.character_id) || null
    : null;

  return (
    <div className={`flex flex-col h-full doki-soft-surface text-slate-900 dark:text-zinc-100 select-none overflow-hidden ${themeWrapperClass}`}>
      {/* 1. Active Thread View (rendered cleanly above persistent tab tree) */}
      {selectedConv && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ChatThreadView
            conversation={selectedConv}
            allConversations={conversations}
            messages={messages.filter((m) => m.conversation_id === selectedConv.id)}
            characters={characters}
            memories={memories}
            relationships={relationships}
            relationshipEvents={relationshipEvents}
            conversationMembers={conversationMembers.filter((m) => m.conversation_id === selectedConv.id)}
            chatSummaries={chatSummaries.filter((s) => s.conversation_id === selectedConv.id)}
            roleplayScenarios={roleplayScenarios}
            stickerStats={stickerStats}
            mediaAssets={mediaAssets}
            contacts={contacts}
            events={events}
            dokiSettings={dokiSettings}
            isOnline={isOnline}
            isTyping={Boolean(typingConvIds[selectedConv.id])}
            streamingText={streamingTexts[selectedConv.id] || ''}
            streamingStatus={streamingStatuses[selectedConv.id] || ''}
            aiError={aiErrors[selectedConv.id] || null}
            draft={drafts[selectedConv.id] || ''}
            jumpToMessageId={jumpToMessageId}
            onClearJumpToMessage={() => setJumpToMessageId(null)}
            onChangeDraft={(txt) => handleChangeDraft(selectedConv.id, txt)}
            onBack={handleCloseThread}
            onSendMessage={(payload) => handleSendMessage(selectedConv.id, payload)}
            onCancelAi={() => handleCancelAi(selectedConv.id)}
            onRetryAi={() => handleRetryAi(selectedConv.id)}
            onRegenerateAi={(targetMsgId) => handleRegenerateAi(selectedConv.id, targetMsgId)}
            onContinueAi={() => handleContinueAi(selectedConv.id)}
            onStartCall={(isVideo) => {
              if (convChar) {
                handleStartCallFromChar(convChar, isVideo);
              } else {
                startCall({
                  name: selectedConv.title,
                  phone: 'Nhóm AI',
                  avatar: selectedConv.avatar,
                  isAi: true,
                  isVideo,
                });
              }
            }}
            onOpenCharacterProfile={(ch) => {
              setSelectedConvId(null);
              setChatOpenedFromProfile(false);
              setProfileCharId(ch.id);
            }}
            onOpenMaps={(q) => openApp('maps', { mapQuery: q })}
            onToggleVirtualKeyboard={() => setVirtualKeyboardOpen(!virtualKeyboardOpen)}
            onMicActiveChange={setMicActive}
            onPlayTts={playTtsAudio}
            onAddClipboard={(text) => addClipboardEntry(text)}
            onRefreshData={refreshData}
            onRemoveLocalMessage={removeLocalMessage}
            onUpsertLocalMessage={upsertLocalMessage}
            onShowToast={showToast}
            onRequestConfirm={requestConfirm}
            onOpenBankingTx={(txId) => openApp('banking', { tab: 'history', txId })}
            onQuickBankTransfer={
              convChar ? () => openApp('banking', { tab: 'transfer', bankingAction: 'transfer', prefillCharId: convChar.id }) : undefined
            }
            onRegisterOverlayBack={(closer) => {
              threadOverlayCloserRef.current = closer;
            }}
          />
        </div>
      )}

      {/* 2. Dedicated 8-Section Character Profile View */}
      {!selectedConv && profileChar && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CharacterProfileView
            character={profileChar}
            allCharacters={characters}
            hasExistingConversation={conversations.some((c) => !c.is_group && c.character_id === profileChar.id)}
            relationship={relationships.find((r) => r.character_id === profileChar.id)}
            relationshipEvents={relationshipEvents}
            onBack={() => {
              setProfileCharId(null);
              setChatOpenedFromProfile(false);
            }}
            onStartChat={(ch) => void handleStartChatWithCharacter(ch, { fromProfile: true })}
            onStartChatWithStarter={(ch, starterText) =>
              void handleStartChatWithCharacter(ch, { fromProfile: true, starterText })
            }
            onOpenRelatedProfile={(target) => setProfileCharId(target.id)}
            onStartCall={(ch, isVid) => handleStartCallFromChar(ch, isVid)}
            onEditCharacter={(ch) => {
              setEditCharTarget(ch);
              setProfileCharId(null);
              setChatOpenedFromProfile(false);
              navigateToTab('characters');
            }}
            onShareCharacter={(ch) => {
              openShareSheet({
                title: `Nhân vật AI: ${ch.name}`,
                text: `${ch.name} — ${ch.tagline}\n${ch.bio}`,
                mediaUrl: ch.avatar,
              });
            }}
            onRefreshData={refreshData}
            onShowToast={showToast}
            onRegisterOverlayBack={(closer) => {
              profileOverlayCloserRef.current = closer;
            }}
          />
        </div>
      )}

      {/* 3. Main Tab Shell — kept mounted across Profile / Thread / Tab transitions to preserve scroll, search & filters */}
      <div className={showMainShell ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={activeTab === 'home' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <DokiHomeView
              profile={data?.profile}
              characters={characters}
              conversations={conversations}
              messages={messages}
              notifications={notifications}
              aiProviderConfig={aiProviderConfig}
              totalUnread={totalUnread}
              onStartChat={(char) => void handleStartChatWithCharacter(char)}
              onOpenConversation={(convId) => openConversation(convId)}
              onOpenCharacterProfile={(char) => setProfileCharId(char.id)}
              onSelectTopic={(topic) => {
                setTopicFilter(topic);
                navigateToTab('discover');
              }}
              onOpenSearch={() => navigateToTab('discover')}
              onOpenNotifications={() => navigateToTab('notifications')}
              onOpenSettings={() => navigateToTab('settings')}
              onOpenUserProfile={() => navigateToTab('profile')}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          </div>

          <div className={activeTab === 'chats' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <ConversationListView
              conversations={conversations}
              messages={messages}
              characters={characters}
              searchHistory={searchHistory}
              drafts={drafts}
              typingConvIds={typingConvIds}
              onSelectConversation={(convId) => openConversation(convId)}
              onJumpToMessage={(convId, msgId) => openConversation(convId, msgId)}
              onCreateGroup={() => {
                navigateToTab('groups');
                setCreateGroupOpen(true);
              }}
              onOpenGroups={() => navigateToTab('groups')}
              onOpenMemories={() => navigateToTab('memories')}
              onOpenDiscover={() => navigateToTab('discover')}
              onUpdateConversation={handleUpdateConversation}
              onDeleteConversation={handleDeleteConversation}
              onRefreshData={refreshData}
            />
          </div>

          <div className={activeTab === 'discover' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <DiscoverCharactersView
              characters={characters}
              searchHistory={searchHistory}
              initialTopicFilter={topicFilter}
              onStartChat={(char) => void handleStartChatWithCharacter(char)}
              onOpenProfile={(char) => setProfileCharId(char.id)}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          </div>

          <div className={activeTab === 'characters' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <MyCharactersView
              characters={characters}
              conversations={conversations}
              initialEditCharacter={editCharTarget}
              onClearInitialEdit={() => setEditCharTarget(null)}
              onStartChat={(char) => void handleStartChatWithCharacter(char)}
              onOpenProfile={(char) => setProfileCharId(char.id)}
              onRefreshData={refreshData}
              onShowToast={showToast}
              onRequestConfirm={requestConfirm}
              onRegisterOverlayBack={
                activeTab === 'characters'
                  ? (closer) => {
                      tabOverlayCloserRef.current = closer;
                    }
                  : undefined
              }
            />
          </div>

          <div className={activeTab === 'groups' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <GroupsTabView
              conversations={conversations}
              messages={messages}
              characters={characters}
              conversationMembers={conversationMembers}
              createModalOpen={createGroupOpen}
              onSetCreateModalOpen={setCreateGroupOpen}
              onOpenConversation={(convId) => openConversation(convId)}
              onRefreshData={refreshData}
              onShowToast={showToast}
              onRegisterOverlayBack={
                activeTab === 'groups'
                  ? (closer) => {
                      tabOverlayCloserRef.current = closer;
                    }
                  : undefined
              }
            />
          </div>

          <div className={activeTab === 'memories' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <MemoriesJournalView
              characters={characters}
              memories={memories}
              messages={messages}
              conversations={conversations}
              relationships={relationships}
              relationshipEvents={relationshipEvents}
              chatSummaries={chatSummaries}
              onJumpToMessage={(convId, msgId) => openConversation(convId, msgId)}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          </div>

          {activeTab === 'notifications' && (
            <DokiNotificationsView
              notifications={notifications}
              characters={characters}
              onBack={() => setActiveTab(sourceTabRef.current || 'home')}
              onOpenConversation={(convId) => openConversation(convId)}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <DokiSettingsView
              dokiSettings={dokiSettings}
              aiConfig={aiProviderConfig}
              onBack={() => setActiveTab(sourceTabRef.current || 'profile')}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          )}

          <div className={activeTab === 'profile' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
            <DokiUserProfileView
              profile={data?.profile}
              characters={characters}
              relationshipEvents={relationshipEvents}
              onOpenSettings={() => navigateToTab('settings')}
              onOpenMemories={() => navigateToTab('memories')}
              onOpenCharacterProfile={(char) => setProfileCharId(char.id)}
              onRefreshData={refreshData}
              onShowToast={showToast}
            />
          </div>
        </div>

        {/* Bottom 5-Tab Navigation Bar */}
        <nav
          aria-label="Điều hướng YumeChat"
          className="shrink-0 h-14 px-1.5 doki-glass border-t border-violet-200/40 dark:border-violet-900/30 grid grid-cols-5 items-center pb-safe"
        >
          {(
            [
              { id: 'home', label: 'Trang chủ', icon: Home, badge: 0 },
              { id: 'chats', label: 'Trò chuyện', icon: MessageCircle, badge: totalUnread },
              { id: 'discover', label: 'Khám phá', icon: Compass, badge: 0 },
              { id: 'characters', label: 'Nhân vật', icon: Sparkles, badge: 0 },
              { id: 'profile', label: 'Hồ sơ', icon: User, badge: 0 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive =
              activeTab === tab.id ||
              (tab.id === 'chats' && (activeTab === 'groups' || activeTab === 'memories')) ||
              (tab.id === 'profile' && (activeTab === 'settings' || activeTab === 'notifications'));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id !== 'discover') setTopicFilter('');
                  navigateToTab(tab.id);
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-colors min-h-[44px] ${
                  isActive
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
                  {tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] leading-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
