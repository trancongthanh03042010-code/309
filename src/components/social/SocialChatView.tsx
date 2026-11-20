import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BellOff,
  Check,
  CheckCheck,
  CornerDownRight,
  Image as ImageIcon,
  Info,
  Mic,
  MicOff,
  MoreVertical,
  Phone,
  PhoneOff,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Send,
  Smile,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { socialApi } from '../../services/socialApi';
import type { SocialChatMsg, SocialChatRoom, SocialUser } from '../../types/social';
import {
  formatRelativeVi,
  SOCIAL_STICKERS,
  SocialEmptyState,
  UserAvatar,
  VerifiedBadge,
} from './SocialUI';

export interface IncomingRtcSignal {
  event: string;
  payload: Record<string, unknown>;
}

interface SocialChatViewProps {
  currentUser: SocialUser;
  activeChatId: string | null;
  onSelectChat: (chatId: string | null) => void;
  sendWs: (event: string, payload: Record<string, unknown>) => boolean;
  wsConnected: boolean;
  latestWsSignal: IncomingRtcSignal | null;
  onOpenProfile: (userId: string) => void;
  showToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function SocialChatView({
  currentUser,
  activeChatId,
  onSelectChat,
  sendWs,
  wsConnected,
  latestWsSignal,
  onOpenProfile,
  showToast,
}: SocialChatViewProps) {
  const [chats, setChats] = useState<SocialChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [searchQ, setSearchQ] = useState('');

  // Room state
  const [messages, setMessages] = useState<SocialChatMsg[]>([]);
  const [msgText, setMsgText] = useState('');
  const [replyTo, setReplyTo] = useState<SocialChatMsg | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [recording, setRecording] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New chat modal
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<SocialUser[]>([]);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');

  // WebRTC Voice/Video Call Modal
  const [callState, setCallState] = useState<{
    active: boolean;
    peerId: string;
    peerName: string;
    peerAvatar: string;
    isVideo: boolean;
    direction: 'outgoing' | 'incoming';
    status: 'ringing' | 'connected';
    muted: boolean;
    camOff: boolean;
    startedAt: number;
    note: string;
  } | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const loadChats = async () => {
    try {
      const res = await socialApi.getChats();
      setChats(res.chats);
    } catch (err) {
      showToast('Tin nhắn', err instanceof Error ? err.message : 'Không tải được hộp thư', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    void socialApi
      .getChatMessages(activeChatId)
      .then((res) => {
        setMessages(res.messages);
        void socialApi.markChatRead(activeChatId).catch(() => {});
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      })
      .catch((err) => showToast('Tin nhắn', err instanceof Error ? err.message : 'Lỗi tải tin nhắn', 'error'));
  }, [activeChatId]);

  const cleanupCallMedia = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  };

  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendWs('rtc:ice_candidate', { targetUserId: peerId, candidate: ev.candidate });
      }
    };
    pc.ontrack = (ev) => {
      if (remoteVideoRef.current && ev.streams[0]) {
        remoteVideoRef.current.srcObject = ev.streams[0];
      }
    };
    pcRef.current = pc;
    return pc;
  };

  // Handle incoming WebSocket chat & RTC events
  useEffect(() => {
    if (!latestWsSignal) return;
    const { event, payload } = latestWsSignal;
    if (event === 'chat:message') {
      const chatId = String(payload.chatId || '');
      const msg = payload.message as SocialChatMsg | undefined;
      if (msg && activeChatId === chatId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.sender_id !== currentUser.id) {
          void socialApi.markChatRead(chatId).catch(() => {});
        }
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      void loadChats();
    } else if (event === 'chat:typing') {
      if (String(payload.chatId) === activeChatId && String(payload.userId) !== currentUser.id) {
        setTypingUsers((prev) => ({ ...prev, [String(payload.userId)]: Boolean(payload.isTyping) }));
      }
    } else if (event === 'chat:read') {
      const chatId = String(payload.chatId);
      const readerId = String(payload.userId);
      if (chatId === activeChatId) {
        setMessages((prev) =>
          prev.map((m) => (m.read_by.includes(readerId) ? m : { ...m, read_by: [...m.read_by, readerId] }))
        );
      }
    } else if (event === 'chat:recall') {
      if (String(payload.chatId) === activeChatId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === String(payload.msgId) ? { ...m, is_recalled: 1, content: 'Tin nhắn đã được thu hồi' } : m))
        );
      }
      void loadChats();
    } else if (event === 'presence:update') {
      void loadChats();
    } else if (event === 'rtc:call_invite') {
      const fromId = String(payload.fromUserId || '');
      setCallState({
        active: true,
        peerId: fromId,
        peerName: String(payload.callerName || 'Cuộc gọi đến'),
        peerAvatar: String(payload.callerAvatar || ''),
        isVideo: Boolean(payload.isVideo),
        direction: 'incoming',
        status: 'ringing',
        muted: false,
        camOff: false,
        startedAt: Date.now(),
        note: 'Kết nối WebRTC P2P qua STUN công cộng (môi trường đa NAT chặt cần máy chủ TURN).',
      });
      // Save remote offer temporarily on window
      (window as unknown as Record<string, unknown>).__vibePendingOffer = payload.sdp;
    } else if (event === 'rtc:call_answer' && pcRef.current && payload.sdp) {
      void pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
      setCallState((prev) => (prev ? { ...prev, status: 'connected', startedAt: Date.now() } : null));
    } else if (event === 'rtc:ice_candidate' && pcRef.current && payload.candidate) {
      void pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate as RTCIceCandidateInit)).catch(() => {});
    } else if (event === 'rtc:call_hangup' || event === 'rtc:call_reject') {
      cleanupCallMedia();
      setCallState(null);
      showToast('Cuộc gọi', event === 'rtc:call_reject' ? 'Người nhận đã từ chối cuộc gọi.' : 'Cuộc gọi đã kết thúc.');
    }
  }, [latestWsSignal]);

  useEffect(() => {
    return () => {
      cleanupCallMedia();
    };
  }, []);

  const activeRoom = useMemo(() => chats.find((c) => c.id === activeChatId) || null, [chats, activeChatId]);
  const peerIn1v1 = useMemo(
    () => (activeRoom && !activeRoom.is_group ? activeRoom.members.find((m) => m.id !== currentUser.id) : null),
    [activeRoom, currentUser.id]
  );

  const visibleChats = useMemo(() => {
    return chats
      .filter((c) => {
        if (filterTab === 'archived') return c.is_archived;
        if (c.is_archived) return false;
        if (filterTab === 'unread') return c.unread_count > 0;
        return true;
      })
      .filter((c) => (searchQ.trim() ? c.display_title.toLowerCase().includes(searchQ.toLowerCase()) : true))
      .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));
  }, [chats, filterTab, searchQ]);

  const handleTyping = (val: string) => {
    setMsgText(val);
    if (!activeChatId) return;
    sendWs('chat:typing', { chatId: activeChatId, isTyping: true });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendWs('chat:typing', { chatId: activeChatId, isTyping: false });
    }, 1500);
  };

  const handleSend = async (
    overridePayload?: { content: string; msg_type: string; attachment?: Record<string, string> }
  ) => {
    if (!activeChatId) return;
    const payload = overridePayload || {
      content: msgText.trim(),
      msg_type: 'text',
      reply_to_id: replyTo?.id || '',
    };
    if (!payload.content && !overridePayload?.attachment) return;
    if (!overridePayload) {
      setMsgText('');
      setReplyTo(null);
      sendWs('chat:typing', { chatId: activeChatId, isTyping: false });
    }
    try {
      const res = await socialApi.sendChatMessage(activeChatId, payload);
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
      void loadChats();
    } catch (err) {
      showToast('Gửi tin nhắn', err instanceof Error ? err.message : 'Lỗi gửi tin nhắn', 'error');
    }
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void handleSend({
          content: '[Hình ảnh]',
          msg_type: 'image',
          attachment: { url: reader.result, fileName: file.name },
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleVoiceRecord = async () => {
    if (recording && mediaRecRef.current) {
      mediaRecRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            void handleSend({
              content: '[Tin nhắn thoại]',
              msg_type: 'voice',
              attachment: { url: reader.result },
            });
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      showToast('Micro', 'Trình duyệt không cấp quyền micro hoặc thiết bị không khả dụng.', 'error');
    }
  };

  const startRtcCall = async (isVideo: boolean) => {
    if (!peerIn1v1) return;
    if (!wsConnected) {
      showToast('Cuộc gọi', 'Kết nối thời gian thực WebSocket chưa sẵn sàng.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(peerIn1v1.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendWs('rtc:call_invite', {
        targetUserId: peerIn1v1.id,
        callerName: currentUser.display_name,
        callerAvatar: currentUser.avatar,
        isVideo,
        sdp: offer,
      });

      setCallState({
        active: true,
        peerId: peerIn1v1.id,
        peerName: peerIn1v1.display_name,
        peerAvatar: peerIn1v1.avatar,
        isVideo,
        direction: 'outgoing',
        status: peerIn1v1.is_online ? 'ringing' : 'ringing',
        muted: false,
        camOff: false,
        startedAt: Date.now(),
        note: peerIn1v1.is_online
          ? 'Đang gửi tín hiệu WebRTC P2P qua WebSocket (STUN công cộng; mạng NAT đối xứng cần máy chủ TURN riêng).'
          : 'Người nhận đang ngoại tuyến — họ cần mở VibeSphere để nhận cuộc gọi thời gian thực.',
      });
    } catch {
      showToast('Cuộc gọi', 'Không thể truy cập camera/micro trên thiết bị.', 'error');
    }
  };

  const acceptIncomingCall = async () => {
    if (!callState) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callState.isVideo });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(callState.peerId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const pendingOffer = (window as unknown as Record<string, unknown>).__vibePendingOffer as RTCSessionDescriptionInit;
      if (pendingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWs('rtc:call_answer', { targetUserId: callState.peerId, sdp: answer });
      setCallState((prev) => (prev ? { ...prev, status: 'connected', startedAt: Date.now() } : null));
    } catch {
      showToast('Cuộc gọi', 'Không thể nhận cuộc gọi do thiếu quyền micro/camera.', 'error');
    }
  };

  const hangupCall = async () => {
    if (callState) {
      sendWs(callState.direction === 'incoming' && callState.status === 'ringing' ? 'rtc:call_reject' : 'rtc:call_hangup', {
        targetUserId: callState.peerId,
      });
      if (activeChatId) {
        const durSec = callState.status === 'connected' ? Math.max(1, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;
        await socialApi
          .sendChatMessage(activeChatId, {
            content: `${callState.isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại'} (${durSec} giây)`,
            msg_type: 'call_log',
          })
          .catch(() => {});
      }
    }
    cleanupCallMedia();
    setCallState(null);
  };

  const openNewChatModal = async () => {
    setNewChatOpen(true);
    setSelectedPeers([]);
    setGroupTitle('');
    try {
      const exp = await socialApi.getExplore();
      setCandidateUsers(exp.suggestedUsers);
    } catch {
      // ignore
    }
  };

  const handleCreateChat = async () => {
    if (selectedPeers.length === 0) return;
    try {
      const res = await socialApi.createChat(selectedPeers, selectedPeers.length > 1 || Boolean(groupTitle.trim()), groupTitle);
      setNewChatOpen(false);
      await loadChats();
      onSelectChat(res.chatId);
    } catch (err) {
      showToast('Tạo hội thoại', err instanceof Error ? err.message : 'Lỗi tạo hội thoại', 'error');
    }
  };

  // RENDER INBOX LIST
  if (!activeChatId || !activeRoom) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-50 dark:bg-[#0D0F14]">
        <div className="p-3 bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Tin nhắn VibeSphere</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {wsConnected ? 'Kết nối thời gian thực đang bật' : 'Đang đồng bộ lại kết nối...'}
              </p>
            </div>
            <button
              onClick={() => void openNewChatModal()}
              className="min-h-[44px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Nhắn mới
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Tìm cuộc trò chuyện..."
              className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 outline-none"
            />
          </div>

          <div className="flex gap-2">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'unread', label: 'Chưa đọc' },
                { id: 'archived', label: 'Lưu trữ' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterTab(t.id)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  filterTab === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <p className="text-center text-xs text-zinc-500 py-8">Đang tải danh sách hội thoại...</p>
          ) : visibleChats.length === 0 ? (
            <SocialEmptyState
              title="Chưa có cuộc trò chuyện"
              description="Bắt đầu nhắn tin 1-1 hoặc tạo nhóm trò chuyện mới với bạn bè trên VibeSphere."
              actionLabel="Tạo cuộc trò chuyện"
              onAction={() => void openNewChatModal()}
            />
          ) : (
            visibleChats.map((c) => {
              const other = !c.is_group ? c.members.find((m) => m.id !== currentUser.id) : null;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className="w-full min-h-[64px] p-3 rounded-2xl bg-white dark:bg-[#14161D] border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                >
                  <UserAvatar
                    src={c.display_avatar}
                    name={c.display_title}
                    online={Boolean(other?.is_online)}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1">
                        {c.is_pinned && <Pin className="w-3 h-3 text-indigo-500 shrink-0" />}
                        {c.display_title}
                        {other && <VerifiedBadge verified={other.is_verified} />}
                        {c.is_muted && <BellOff className="w-3 h-3 text-zinc-400 shrink-0" />}
                      </span>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {formatRelativeVi(c.last_message?.created_at || c.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {c.last_message ? c.last_message.content : 'Chưa có tin nhắn nào'}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="px-1.5 min-w-[20px] h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* New Chat Modal */}
        {newChatOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 max-h-[85dvh] flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Cuộc trò chuyện mới</h3>
                <button
                  onClick={() => setNewChatOpen(false)}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {selectedPeers.length > 1 && (
                  <input
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Tên nhóm chat..."
                    className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                )}
                <p className="text-xs font-semibold text-zinc-500">Chọn một hoặc nhiều người bạn:</p>
                {candidateUsers.map((u) => {
                  const picked = selectedPeers.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() =>
                        setSelectedPeers((prev) => (picked ? prev.filter((id) => id !== u.id) : [...prev, u.id]))
                      }
                      className={`w-full min-h-[52px] p-2.5 rounded-xl flex items-center gap-3 border text-left ${
                        picked
                          ? 'border-indigo-600 bg-indigo-500/10'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40'
                      }`}
                    >
                      <UserAvatar src={u.avatar} name={u.display_name} size="sm" online={u.is_online} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{u.display_name}</p>
                        <p className="text-[11px] text-zinc-500 truncate">@{u.username}</p>
                      </div>
                      {picked && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
              <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => void handleCreateChat()}
                  disabled={selectedPeers.length === 0}
                  className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {selectedPeers.length > 1 ? `Tạo nhóm (${selectedPeers.length})` : 'Bắt đầu nhắn tin'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const anyTyping = Object.values(typingUsers).some(Boolean);

  // RENDER ACTIVE CHAT THREAD
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-50 dark:bg-[#0D0F14] relative">
      {/* Header */}
      <div className="px-2 py-2 bg-white dark:bg-[#14161D] border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
        <button
          onClick={() => onSelectChat(null)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-300"
          aria-label="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => peerIn1v1 && onOpenProfile(peerIn1v1.id)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <UserAvatar
            src={activeRoom.display_avatar}
            name={activeRoom.display_title}
            online={Boolean(peerIn1v1?.is_online)}
            size="sm"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1">
              {activeRoom.display_title}
              {peerIn1v1 && <VerifiedBadge verified={peerIn1v1.is_verified} />}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {anyTyping
                ? 'Đang nhập...'
                : activeRoom.is_group
                  ? `${activeRoom.members.length} thành viên`
                  : peerIn1v1?.is_online
                    ? 'Đang hoạt động'
                    : 'Ngoại tuyến'}
            </p>
          </div>
        </button>

        {peerIn1v1 && (
          <>
            <button
              onClick={() => void startRtcCall(false)}
              className="w-11 h-11 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Gọi thoại"
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={() => void startRtcCall(true)}
              className="w-11 h-11 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Gọi video"
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-500"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-30 w-44 rounded-2xl bg-white dark:bg-[#1A1D26] border border-zinc-200 dark:border-zinc-700 shadow-xl py-1">
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await socialApi.updateChatSettings(activeRoom.id, { pinned: !activeRoom.is_pinned });
                  void loadChats();
                }}
                className="w-full min-h-[44px] px-3 text-left text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Pin className="w-3.5 h-3.5" /> {activeRoom.is_pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
              </button>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await socialApi.updateChatSettings(activeRoom.id, { muted: !activeRoom.is_muted });
                  void loadChats();
                }}
                className="w-full min-h-[44px] px-3 text-left text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <BellOff className="w-3.5 h-3.5" /> {activeRoom.is_muted ? 'Bật thông báo' : 'Tắt thông báo'}
              </button>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await socialApi.updateChatSettings(activeRoom.id, { archived: !activeRoom.is_archived });
                  onSelectChat(null);
                  void loadChats();
                }}
                className="w-full min-h-[44px] px-3 text-left text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Archive className="w-3.5 h-3.5" /> {activeRoom.is_archived ? 'Bỏ lưu trữ' : 'Lưu trữ đoạn chat'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.map((m) => {
          const isMe = m.sender_id === currentUser.id;
          const replied = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          const isReadByPeer = m.read_by.some((uid) => uid !== currentUser.id);
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && <UserAvatar src={m.sender_avatar} name={m.sender_name || 'User'} size="xs" />}
              <div className={`max-w-[78%] space-y-1 ${isMe ? 'items-end flex flex-col' : ''}`}>
                {replied && (
                  <div className="px-2.5 py-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70 text-[11px] text-zinc-600 dark:text-zinc-300 border-l-2 border-indigo-500">
                    {replied.content.slice(0, 60)}
                  </div>
                )}

                <div
                  className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    m.is_recalled
                      ? 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-400 italic'
                      : isMe
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white dark:bg-[#1A1D26] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-bl-sm'
                  }`}
                >
                  {m.msg_type === 'image' && m.attachment?.url && !m.is_recalled && (
                    <img src={m.attachment.url} alt="" className="max-h-52 rounded-xl mb-1.5 object-cover" />
                  )}
                  {m.msg_type === 'voice' && m.attachment?.url && !m.is_recalled && (
                    <audio controls src={m.attachment.url} className="max-w-[210px] h-9 mb-1" />
                  )}
                  {m.msg_type === 'sticker' ? (
                    <span className="text-3xl leading-none block py-1">{m.content}</span>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 px-1 text-[10px] text-zinc-400">
                  <span>{formatRelativeVi(m.created_at)}</span>
                  {isMe && !m.is_recalled && (
                    <>
                      <span>{isReadByPeer ? <CheckCheck className="w-3 h-3 text-indigo-500 inline" /> : <Check className="w-3 h-3 inline" />}</span>
                      <button
                        onClick={async () => {
                          await socialApi.recallChatMessage(m.id);
                        }}
                        className="hover:text-rose-500 flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Thu hồi
                      </button>
                    </>
                  )}
                  {!m.is_recalled && (
                    <button onClick={() => setReplyTo(m)} className="hover:text-indigo-500 flex items-center gap-0.5">
                      <CornerDownRight className="w-2.5 h-2.5" /> Trả lời
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={msgEndRef} />
      </div>

      {/* Sticker Drawer */}
      {stickerOpen && (
        <div className="px-3 py-2 bg-white dark:bg-[#14161D] border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2">
          {SOCIAL_STICKERS.map((st) => (
            <button
              key={st}
              onClick={() => {
                setStickerOpen(false);
                void handleSend({ content: st, msg_type: 'sticker' });
              }}
              className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xl flex items-center justify-center hover:scale-110 transition-transform"
            >
              {st}
            </button>
          ))}
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="px-3 py-1.5 bg-indigo-500/10 border-t border-indigo-500/20 flex items-center justify-between text-xs">
          <span className="text-indigo-600 dark:text-indigo-400 truncate">
            Đang trả lời {replyTo.sender_name}: {replyTo.content}
          </span>
          <button onClick={() => setReplyTo(null)} className="text-zinc-500 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="p-2 bg-white dark:bg-[#14161D] border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 shrink-0">
        <label className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0">
          <ImageIcon className="w-5 h-5" />
          <input type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
        </label>
        <button
          onClick={() => void toggleVoiceRecord()}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            recording ? 'bg-rose-600 text-white animate-pulse' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          title="Ghi âm giọng nói"
        >
          {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button
          onClick={() => setStickerOpen((s) => !s)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
        >
          <Smile className="w-5 h-5" />
        </button>
        <input
          value={msgText}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Nhắn tin..."
          className="flex-1 min-h-[42px] px-3.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!msgText.trim()}
          className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* WebRTC Call Overlay */}
      {callState?.active && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 text-white flex flex-col justify-between p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{callState.note}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center relative my-4">
            {callState.isVideo ? (
              <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute bottom-3 right-3 w-24 h-32 rounded-2xl object-cover border-2 border-white/40 bg-black"
                />
                {callState.status === 'ringing' && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                    <UserAvatar src={callState.peerAvatar} name={callState.peerName} size="xl" />
                    <p className="text-lg font-bold">{callState.peerName}</p>
                    <p className="text-xs text-zinc-300">
                      {callState.direction === 'incoming' ? 'Cuộc gọi video đến...' : 'Đang đổ chuông...'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <UserAvatar src={callState.peerAvatar} name={callState.peerName} size="xl" ring />
                <h3 className="text-xl font-bold">{callState.peerName}</h3>
                <p className="text-sm text-zinc-400">
                  {callState.status === 'connected'
                    ? 'Đã kết nối âm thanh'
                    : callState.direction === 'incoming'
                      ? 'Cuộc gọi thoại đến...'
                      : 'Đang chờ kết nối...'}
                </p>
                <video ref={remoteVideoRef} autoPlay className="hidden" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-5 pb-4">
            {callState.direction === 'incoming' && callState.status === 'ringing' ? (
              <>
                <button
                  onClick={() => void hangupCall()}
                  className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <button
                  onClick={() => void acceptIncomingCall()}
                  className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                >
                  <Phone className="w-7 h-7" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    const next = !callState.muted;
                    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
                    setCallState({ ...callState, muted: next });
                  }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center ${
                    callState.muted ? 'bg-white text-zinc-900' : 'bg-white/15 text-white'
                  }`}
                >
                  {callState.muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                {callState.isVideo && (
                  <button
                    onClick={() => {
                      const next = !callState.camOff;
                      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
                      setCallState({ ...callState, camOff: next });
                    }}
                    className={`w-14 h-14 rounded-full flex items-center justify-center ${
                      callState.camOff ? 'bg-white text-zinc-900' : 'bg-white/15 text-white'
                    }`}
                  >
                    {callState.camOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                )}
                <button
                  onClick={() => void hangupCall()}
                  className="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
