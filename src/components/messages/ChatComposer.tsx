import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Camera,
  Check,
  FileText,
  Film,
  Heart,
  Image as ImageIcon,
  Keyboard,
  MapPin,
  Mic,
  Paperclip,
  Send,
  Smile,
  Square,
  Sticker,
  Trash2,
  UserCheck,
  Video,
  X,
  Landmark,
} from 'lucide-react';
import type {
  CalendarEvent,
  Character,
  ChatMessage,
  Contact,
  MediaAsset,
  StickerStatRecord,
} from '../../types/os';
import {
  ALL_STICKERS,
  FULL_EMOJIS,
  GIF_CATALOG,
  handleCharImgError,
  normalizeVi,
  STICKER_PACKS,
  type GifReactionItem,
  type StickerItem,
} from './utils';
import { osApi } from '../../services/api';

export function StickerSvg({ item, size = 76 }: { item: StickerItem; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className="select-none">
      <rect x="4" y="4" width="88" height="88" rx="26" fill={item.bg} />
      <circle cx="48" cy="44" r="24" fill="#FFFFFF" stroke={item.accent} strokeWidth="3" />
      {item.face === 'love' && (
        <>
          <path d="M36 39c0-3 4-4 5-1 1-3 5-2 5 1 0 3-5 6-5 6s-5-3-5-6z" fill={item.accent} />
          <path d="M50 39c0-3 4-4 5-1 1-3 5-2 5 1 0 3-5 6-5 6s-5-3-5-6z" fill={item.accent} />
          <path d="M42 52c3 3 9 3 12 0" fill="none" stroke={item.accent} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )}
      {item.face === 'happy' && (
        <>
          <path d="M36 42c1-3 5-3 6 0" fill="none" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M54 42c1-3 5-3 6 0" fill="none" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M40 50c3 5 13 5 16 0" fill="none" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {item.face === 'hug' && (
        <>
          <circle cx="39" cy="41" r="2.6" fill={item.accent} />
          <circle cx="57" cy="41" r="2.6" fill={item.accent} />
          <path d="M42 51c3 3 9 3 12 0" fill="none" stroke={item.accent} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M24 52c6 6 12 6 15 2M72 52c-6 6-12 6-15 2" fill="none" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {item.face === 'sparkle' && (
        <>
          <circle cx="39" cy="41" r="2.8" fill={item.accent} />
          <circle cx="57" cy="41" r="2.8" fill={item.accent} />
          <path d="M41 50c3 5 11 5 14 0" fill="none" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M74 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={item.accent} />
        </>
      )}
      {item.face === 'cry' && (
        <>
          <path d="M35 42h7M54 42h7" stroke={item.accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M38 44v8M58 44v8" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
          <path d="M43 54c3-3 7-3 10 0" fill="none" stroke={item.accent} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )}
      {item.face === 'cool' && (
        <>
          <rect x="33" y="37" width="12" height="7" rx="3" fill={item.accent} />
          <rect x="51" y="37" width="12" height="7" rx="3" fill={item.accent} />
          <path d="M45 40h6" stroke={item.accent} strokeWidth="2.5" />
          <path d="M42 52c4 3 9 2 13-1" fill="none" stroke={item.accent} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )}
      {item.face === 'sleepy' && (
        <>
          <path d="M35 43c2 2 5 2 7 0M54 43c2 2 5 2 7 0" fill="none" stroke={item.accent} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="48" cy="52" r="3" fill={item.accent} />
          <text x="65" y="27" fontSize="11" fontWeight="bold" fill={item.accent}>Z</text>
        </>
      )}
      {item.face === 'shock' && (
        <>
          <circle cx="39" cy="40" r="3.2" fill={item.accent} />
          <circle cx="57" cy="40" r="3.2" fill={item.accent} />
          <ellipse cx="48" cy="53" rx="4.5" ry="5.5" fill={item.accent} />
        </>
      )}
      <text x="48" y="84" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={item.accent}>
        {item.label}
      </text>
    </svg>
  );
}

export function GifReactionCard({ item, compact = false }: { item: GifReactionItem; compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} text-white select-none ${
        compact ? 'p-2.5 h-22 flex flex-col justify-between' : 'p-3.5 w-44 h-28 flex flex-col justify-between shadow-md'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/25">GIF</span>
        <span
          className={`text-xl ${
            item.anim === 'bounce' ? 'animate-bounce' : item.anim === 'float' ? 'doki-float' : ''
          }`}
        >
          {item.symbol}
        </span>
      </div>
      <div>
        <p className="text-xs font-bold leading-tight truncate">{item.label}</p>
        {!compact && <p className="text-[10px] text-white/90 truncate mt-0.5">{item.caption}</p>}
      </div>
    </div>
  );
}

interface PendingImage {
  dataUrl: string;
  title: string;
}

interface ChatComposerProps {
  draft: string;
  onChangeDraft: (next: string) => void;
  enterToSend: boolean;
  isGroup: boolean;
  groupCharacters: Character[];
  stickerStats: StickerStatRecord[];
  replyTarget: ChatMessage | null;
  onCancelReply: () => void;
  editTarget: ChatMessage | null;
  onCancelEdit: () => void;
  onSaveEdit: (newText: string) => Promise<void>;
  onSendMessage: (payload: {
    content: string;
    msg_type: ChatMessage['msg_type'];
    attachment_json?: string;
    trigger_ai?: boolean;
  }) => Promise<void>;
  mediaAssets: MediaAsset[];
  contacts: Contact[];
  events: CalendarEvent[];
  onToggleVirtualKeyboard: () => void;
  onMicActiveChange: (active: boolean) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onQuickBankTransfer?: () => void;
  onRegisterTrayBack?: (closer: (() => boolean) | null) => void;
}

export function ChatComposer({
  draft,
  onChangeDraft,
  enterToSend,
  isGroup,
  groupCharacters,
  stickerStats,
  replyTarget,
  onCancelReply,
  editTarget,
  onCancelEdit,
  onSaveEdit,
  onSendMessage,
  mediaAssets,
  contacts,
  events,
  onToggleVirtualKeyboard,
  onMicActiveChange,
  onRefreshData,
  onShowToast,
  onQuickBankTransfer,
  onRegisterTrayBack,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [trayMode, setTrayMode] = useState<'none' | 'emoji' | 'attach' | 'photos' | 'contact' | 'event'>('none');
  const [emojiTab, setEmojiTab] = useState<'sticker' | 'gif' | 'emoji'>('sticker');
  const [stickerSearch, setStickerSearch] = useState('');
  const [activePackId, setActivePackId] = useState<string>('all');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<{ dataUrl: string; durationSec: number; mimeType: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!onRegisterTrayBack) return;
    onRegisterTrayBack(() => {
      if (trayMode !== 'none') {
        setTrayMode('none');
        return true;
      }
      return false;
    });
    return () => onRegisterTrayBack(null);
  }, [trayMode, onRegisterTrayBack]);

  useEffect(() => {
    if (editTarget) {
      onChangeDraft(editTarget.content);
      setTimeout(() => textareaRef.current?.focus(), 40);
    }
  }, [editTarget, onChangeDraft]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(116, Math.max(38, el.scrollHeight))}px`;
  }, [draft]);

  useEffect(() => {
    if (!isGroup) {
      setMentionQuery(null);
      return;
    }
    const match = draft.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  }, [draft, isGroup]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const statByStickerId = useMemo(() => {
    const map: Record<string, StickerStatRecord> = {};
    for (const s of stickerStats) map[s.sticker_id] = s;
    return map;
  }, [stickerStats]);

  const handleInsertMention = (char: Character) => {
    const next = draft.replace(/@([^\s@]*)$/, `@${char.name} `);
    onChangeDraft(next);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const runWithSubmitLock = async (fn: () => Promise<void>) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await fn();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmitTextOrImages = async () => {
    if (submittingRef.current) return;
    if (editTarget) {
      const trimmed = draft.trim();
      if (!trimmed) return;
      await runWithSubmitLock(async () => {
        await onSaveEdit(trimmed);
        onChangeDraft('');
      });
      return;
    }

    if (pendingImages.length > 0) {
      const imgs = [...pendingImages];
      const caption = draft.trim();
      await runWithSubmitLock(async () => {
        setPendingImages([]);
        onChangeDraft('');
        await onSendMessage({
          content: caption || (imgs.length > 1 ? `Đã gửi ${imgs.length} hình ảnh` : imgs[0].title || 'Hình ảnh'),
          msg_type: 'image',
          attachment_json: JSON.stringify({
            dataUrl: imgs[0].dataUrl,
            title: imgs[0].title,
            images: imgs,
          }),
          trigger_ai: true,
        });
      });
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) return;
    await runWithSubmitLock(async () => {
      onChangeDraft('');
      setTrayMode('none');
      await onSendMessage({
        content: trimmed,
        msg_type: 'text',
        attachment_json: '{}',
        trigger_ai: true,
      });
    });
  };

  const handleFileImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files)
      .slice(0, 4)
      .forEach((f) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setPendingImages((prev) => [...prev.slice(0, 3), { dataUrl: reader.result as string, title: f.name }]);
          }
        };
        reader.readAsDataURL(f);
      });
    setTrayMode('none');
  };

  const handleVideoFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      onShowToast('Video quá lớn', 'Vui lòng chọn video dưới 15MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setTrayMode('none');
        await onSendMessage({
          content: file.name,
          msg_type: 'video',
          attachment_json: JSON.stringify({ dataUrl: reader.result, fileName: file.name, sizeBytes: file.size }),
          trigger_ai: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenericFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setTrayMode('none');
        await onSendMessage({
          content: file.name,
          msg_type: 'file',
          attachment_json: JSON.stringify({
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: reader.result,
          }),
          trigger_ai: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onShowToast('Không hỗ trợ ghi âm', 'Trình duyệt chưa hỗ trợ MediaRecorder.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onMicActiveChange(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setRecordedAudio({ dataUrl: reader.result, durationSec: Math.max(1, recordSec), mimeType });
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      onMicActiveChange(true);
      setRecordSec(0);
      setRecordedAudio(null);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      onMicActiveChange(false);
      onShowToast('Bị từ chối quyền Micro', 'Hãy cấp quyền micro để ghi âm.', 'error');
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendRecordedVoice = async () => {
    if (!recordedAudio || submittingRef.current) return;
    const payload = recordedAudio;
    await runWithSubmitLock(async () => {
      setRecordedAudio(null);
      await onSendMessage({
        content: `Tin nhắn thoại (${payload.durationSec}s)`,
        msg_type: 'voice',
        attachment_json: JSON.stringify(payload),
        trigger_ai: true,
      });
    });
  };

  const handleSendLocation = () => {
    setTrayMode('none');
    if (!navigator.geolocation) {
      onShowToast('Định vị', 'Trình duyệt không hỗ trợ Geolocation.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await onSendMessage({
          content: `Vị trí của tôi (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
          msg_type: 'location',
          attachment_json: JSON.stringify({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label: 'Vị trí hiện tại',
          }),
          trigger_ai: true,
        });
      },
      async () => {
        await onSendMessage({
          content: 'TP. Hồ Chí Minh (10.7769, 106.7009)',
          msg_type: 'location',
          attachment_json: JSON.stringify({ lat: 10.7769, lon: 106.7009, label: 'Trung tâm TP.HCM' }),
          trigger_ai: true,
        });
      }
    );
  };

  const sendStickerItem = async (st: StickerItem) => {
    if (submittingRef.current) return;
    await runWithSubmitLock(async () => {
      setTrayMode('none');
      await osApi.messagesV3.trackSticker({ sticker_id: st.id, item_type: 'sticker', payload: { label: st.label } }).catch(() => {});
      onRefreshData().catch(() => {});
      await onSendMessage({
        content: st.label,
        msg_type: 'sticker',
        attachment_json: JSON.stringify({ stickerId: st.id, label: st.label }),
        trigger_ai: true,
      });
    });
  };

  const sendGifItem = async (gif: GifReactionItem) => {
    if (submittingRef.current) return;
    await runWithSubmitLock(async () => {
      setTrayMode('none');
      await osApi.messagesV3.trackSticker({ sticker_id: gif.id, item_type: 'gif', payload: { label: gif.label } }).catch(() => {});
      onRefreshData().catch(() => {});
      await onSendMessage({
        content: `[GIF] ${gif.label}`,
        msg_type: 'sticker',
        attachment_json: JSON.stringify({ kind: 'gif', gifId: gif.id, label: gif.label }),
        trigger_ai: true,
      });
    });
  };

  const toggleFavoriteMediaItem = async (e: React.MouseEvent, id: string, type: 'sticker' | 'gif') => {
    e.stopPropagation();
    await osApi.messagesV3.trackSticker({ sticker_id: id, item_type: type, toggleFavorite: true }).catch(() => {});
    await onRefreshData().catch(() => {});
  };

  const filteredStickers = useMemo(() => {
    const base =
      activePackId === 'all'
        ? ALL_STICKERS
        : activePackId === 'fav'
          ? ALL_STICKERS.filter((s) => statByStickerId[s.id]?.is_favorite === 1)
          : activePackId === 'recent'
            ? ALL_STICKERS.filter((s) => (statByStickerId[s.id]?.use_count || 0) > 0).sort((a, b) =>
                (statByStickerId[b.id]?.last_used_at || '').localeCompare(statByStickerId[a.id]?.last_used_at || '')
              )
            : STICKER_PACKS.find((p) => p.id === activePackId)?.items || ALL_STICKERS;
    const q = normalizeVi(stickerSearch);
    return q ? base.filter((s) => normalizeVi(s.label).includes(q)) : base;
  }, [activePackId, stickerSearch, statByStickerId]);

  const filteredGifs = useMemo(() => {
    const q = normalizeVi(stickerSearch);
    return q
      ? GIF_CATALOG.filter((g) => normalizeVi(g.label).includes(q) || normalizeVi(g.caption).includes(q))
      : GIF_CATALOG;
  }, [stickerSearch]);

  const matchingMentions =
    mentionQuery !== null
      ? groupCharacters.filter((c) => c.name.toLowerCase().includes(mentionQuery))
      : [];

  return (
    <div className="doki-glass border-t border-violet-200/40 dark:border-violet-900/30 relative pb-safe">
      {/* @mention autocomplete */}
      {matchingMentions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-800 shadow-xl overflow-hidden z-20">
          {matchingMentions.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleInsertMention(ch)}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-xs hover:bg-violet-50 dark:hover:bg-violet-950/40"
            >
              <img
                src={ch.avatar}
                alt={ch.name}
                loading="lazy"
                onError={(e) => handleCharImgError(e, ch.name)}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="font-semibold">{ch.name}</span>
              <span className="text-[10px] text-zinc-400 truncate">{ch.role_title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply / Edit Banner */}
      {(replyTarget || editTarget) && (
        <div className="px-3.5 py-2 bg-violet-500/10 border-b border-violet-300/30 flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="font-semibold text-violet-700 dark:text-violet-300 block text-[11px]">
              {editTarget ? 'Đang chỉnh sửa tin nhắn' : `Đang trả lời ${replyTarget?.sender_name}`}
            </span>
            <p className="text-zinc-600 dark:text-zinc-300 truncate">
              {editTarget ? editTarget.content : replyTarget?.content}
            </p>
          </div>
          <button
            onClick={() => {
              if (editTarget) {
                onCancelEdit();
                onChangeDraft('');
              } else {
                onCancelReply();
              }
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-image preview tray */}
      {pendingImages.length > 0 && (
        <div className="px-3.5 py-2 flex items-center gap-2 overflow-x-auto os-scroll-hidden border-b border-violet-200/30">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative shrink-0">
              <img src={img.dataUrl} alt="" className="w-16 h-16 rounded-xl object-cover" />
              <button
                onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Live Voice Recording Strip */}
      {(isRecording || recordedAudio) && (
        <div className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 flex items-center justify-between gap-2 text-xs">
          {isRecording ? (
            <>
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Đang ghi âm · {Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')}</span>
              </div>
              <button
                onClick={stopVoiceRecording}
                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-semibold flex items-center gap-1"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Dừng</span>
              </button>
            </>
          ) : recordedAudio ? (
            <>
              <audio src={recordedAudio.dataUrl} controls className="h-8 flex-1" />
              <button
                onClick={() => setRecordedAudio(null)}
                className="p-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={sendRecordedVoice}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-violet-600 disabled:opacity-50 text-white font-semibold flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Gửi</span>
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Main Composer Row */}
      <div className="px-2.5 py-2 flex items-end gap-1.5">
        <button
          type="button"
          onClick={() => setTrayMode((m) => (m === 'attach' ? 'none' : 'attach'))}
          className={`min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
            trayMode === 'attach'
              ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white'
              : 'text-zinc-600 dark:text-zinc-300 hover:bg-violet-500/10'
          }`}
          title="Đính kèm ảnh, camera, video, tài liệu"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-end gap-1 bg-white/85 dark:bg-zinc-900/80 border border-violet-200/50 dark:border-violet-800/40 rounded-2xl px-3 py-1 min-h-[44px]">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => onChangeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && enterToSend) {
                e.preventDefault();
                void handleSubmitTextOrImages();
              }
            }}
            placeholder={
              pendingImages.length > 0
                ? 'Thêm chú thích cho ảnh...'
                : isGroup
                  ? 'Nhắn tin hoặc @nhắc nhân vật...'
                  : 'Nhắn tin với nhân vật...'
            }
            className="flex-1 bg-transparent text-[13px] leading-snug outline-none resize-none max-h-[116px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 py-1.5"
          />
          <button
            type="button"
            onClick={() => setTrayMode((m) => (m === 'emoji' ? 'none' : 'emoji'))}
            className={`p-1.5 rounded-xl shrink-0 ${
              trayMode === 'emoji' ? 'text-violet-600' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
            title="Sticker, GIF & Emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleVirtualKeyboard}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
            title="Bàn phím ảo OS"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>

        {draft.trim() || pendingImages.length > 0 ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmitTextOrImages()}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 disabled:opacity-60 text-white flex items-center justify-center shrink-0 shadow-sm"
            title={editTarget ? 'Lưu chỉnh sửa' : 'Gửi tin nhắn'}
          >
            {editTarget ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
            className={`min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center shrink-0 ${
              isRecording
                ? 'bg-rose-600 text-white'
                : 'bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-300 border border-violet-200/40 dark:border-violet-800/40'
            }`}
            title="Ghi âm tin nhắn thoại"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Attachment Tray */}
      {trayMode === 'attach' && (
        <div className="px-3 pb-3 pt-1.5 grid grid-cols-4 gap-2 text-[11px] border-t border-violet-200/30">
          <button
            onClick={() => setTrayMode('photos')}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <ImageIcon className="w-4 h-4 text-violet-500" />
            <span>Thư viện</span>
          </button>
          <label className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1 cursor-pointer">
            <Camera className="w-4 h-4 text-pink-500" />
            <span>Chụp ảnh</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileImages(e.target.files)}
            />
          </label>
          <label className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1 cursor-pointer">
            <ImageIcon className="w-4 h-4 text-fuchsia-500" />
            <span>Chọn ảnh</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileImages(e.target.files)}
            />
          </label>
          <label className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1 cursor-pointer">
            <Video className="w-4 h-4 text-indigo-500" />
            <span>Video</span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleVideoFile(e.target.files?.[0])}
            />
          </label>
          <button
            onClick={() => {
              setTrayMode('emoji');
              setEmojiTab('gif');
            }}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <Film className="w-4 h-4 text-amber-500" />
            <span>GIF</span>
          </button>
          <button
            onClick={() => {
              setTrayMode('emoji');
              setEmojiTab('sticker');
            }}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <Sticker className="w-4 h-4 text-violet-500" />
            <span>Sticker</span>
          </button>
          <button
            onClick={handleSendLocation}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <MapPin className="w-4 h-4 text-emerald-500" />
            <span>Vị trí</span>
          </button>
          <label className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1 cursor-pointer">
            <FileText className="w-4 h-4 text-teal-500" />
            <span>Tài liệu</span>
            <input type="file" className="hidden" onChange={(e) => handleGenericFile(e.target.files?.[0])} />
          </label>
          <button
            onClick={() => setTrayMode('contact')}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <UserCheck className="w-4 h-4 text-sky-500" />
            <span>Danh thiếp</span>
          </button>
          <button
            onClick={() => setTrayMode('event')}
            className="p-2.5 rounded-2xl bg-white/80 dark:bg-zinc-800/80 flex flex-col items-center gap-1"
          >
            <Calendar className="w-4 h-4 text-rose-500" />
            <span>Lịch hẹn</span>
          </button>
          {!isGroup && onQuickBankTransfer && (
            <button
              type="button"
              onClick={() => {
                setTrayMode('none');
                onQuickBankTransfer();
              }}
              className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex flex-col items-center gap-1 min-h-[44px]"
            >
              <Landmark className="w-4 h-4 text-[#E14B5A]" />
              <span>Chuyển Hikari</span>
            </button>
          )}
        </div>
      )}

      {/* Sticker / GIF / Emoji Drawer */}
      {trayMode === 'emoji' && (
        <div className="border-t border-violet-200/30 p-2.5 space-y-2 max-h-64 overflow-y-auto os-scroll">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  ['sticker', `Sticker (${ALL_STICKERS.length})`],
                  ['gif', `GIF (${GIF_CATALOG.length})`],
                  ['emoji', 'Emoji'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setEmojiTab(k)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold ${
                    emojiTab === k ? 'bg-violet-600 text-white' : 'bg-white/70 dark:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {emojiTab !== 'emoji' && (
              <input
                value={stickerSearch}
                onChange={(e) => setStickerSearch(e.target.value)}
                placeholder="Tìm nhanh..."
                className="w-28 px-2.5 py-1 rounded-xl bg-white/80 dark:bg-zinc-800 text-[11px] outline-none"
              />
            )}
          </div>

          {emojiTab === 'sticker' && (
            <>
              <div className="flex items-center gap-1 overflow-x-auto os-scroll-hidden">
                {(
                  [
                    ['all', 'Tất cả'],
                    ['fav', 'Yêu thích'],
                    ['recent', 'Gần đây'],
                    ...STICKER_PACKS.map((p) => [p.id, p.name]),
                  ] as Array<[string, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActivePackId(id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold shrink-0 ${
                      activePackId === id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'text-zinc-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filteredStickers.length === 0 ? (
                <p className="text-center text-[11px] text-zinc-400 py-6">Chưa có sticker nào trong mục này.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filteredStickers.map((st) => {
                    const isFav = statByStickerId[st.id]?.is_favorite === 1;
                    return (
                      <div key={st.id} className="relative group">
                        <button
                          onClick={() => sendStickerItem(st)}
                          className="w-full p-1 rounded-2xl hover:bg-violet-500/10 flex items-center justify-center"
                        >
                          <StickerSvg item={st} size={66} />
                        </button>
                        <button
                          onClick={(e) => toggleFavoriteMediaItem(e, st.id, 'sticker')}
                          className={`absolute top-1 right-1 p-1 rounded-full bg-white/85 dark:bg-zinc-900/85 shadow-xs ${
                            isFav ? 'text-pink-500' : 'text-zinc-400 opacity-70 hover:opacity-100'
                          }`}
                          title="Yêu thích sticker"
                        >
                          <Heart className={`w-3 h-3 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {emojiTab === 'gif' && (
            <div className="grid grid-cols-2 gap-2">
              {filteredGifs.map((g) => {
                const isFav = statByStickerId[g.id]?.is_favorite === 1;
                return (
                  <div key={g.id} className="relative cursor-pointer" onClick={() => sendGifItem(g)}>
                    <GifReactionCard item={g} compact />
                    <button
                      onClick={(e) => toggleFavoriteMediaItem(e, g.id, 'gif')}
                      className={`absolute bottom-1.5 right-1.5 p-1 rounded-full bg-black/35 text-white ${
                        isFav ? 'text-pink-400' : 'opacity-75'
                      }`}
                    >
                      <Heart className={`w-3 h-3 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {emojiTab === 'emoji' && (
            <div className="grid grid-cols-8 gap-1.5">
              {FULL_EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => onChangeDraft(`${draft}${em}`)}
                  className="h-9 rounded-xl hover:bg-violet-500/10 text-lg flex items-center justify-center"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {trayMode === 'photos' && (
        <div className="border-t border-violet-200/30 p-2.5 space-y-2 max-h-48 overflow-y-auto os-scroll">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Chọn ảnh từ PHONE OS Photos</span>
            <button onClick={() => setTrayMode('none')} className="text-violet-600 font-semibold">
              Đóng
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {mediaAssets
              .filter((m) => m.type === 'photo' && !m.is_deleted)
              .slice(0, 12)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setPendingImages((prev) => [...prev.slice(0, 3), { dataUrl: m.data_url, title: m.title }]);
                    setTrayMode('none');
                  }}
                  className="aspect-square rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800"
                >
                  <img
                    src={m.data_url}
                    alt={m.title}
                    loading="lazy"
                    onError={(e) => handleCharImgError(e, m.title)}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
          </div>
        </div>
      )}

      {trayMode === 'contact' && (
        <div className="border-t border-violet-200/30 p-2.5 space-y-1.5 max-h-48 overflow-y-auto os-scroll text-xs">
          <p className="text-[11px] font-semibold text-zinc-500">Chọn danh thiếp để chia sẻ</p>
          {contacts.slice(0, 8).map((ct) => (
            <button
              key={ct.id}
              onClick={async () => {
                setTrayMode('none');
                await onSendMessage({
                  content: `Danh thiếp: ${ct.name} (${ct.phone})`,
                  msg_type: 'contact',
                  attachment_json: JSON.stringify({ name: ct.name, phone: ct.phone, avatar: ct.avatar }),
                  trigger_ai: true,
                });
              }}
              className="w-full p-2 rounded-xl bg-white/80 dark:bg-zinc-800 flex items-center justify-between text-left"
            >
              <span className="font-semibold">{ct.name}</span>
              <span className="text-[11px] text-zinc-500 font-mono-num">{ct.phone}</span>
            </button>
          ))}
        </div>
      )}

      {trayMode === 'event' && (
        <div className="border-t border-violet-200/30 p-2.5 space-y-1.5 max-h-48 overflow-y-auto os-scroll text-xs">
          <p className="text-[11px] font-semibold text-zinc-500">Gửi lời mời từ Lịch</p>
          {events.slice(0, 6).map((ev) => (
            <button
              key={ev.id}
              onClick={async () => {
                setTrayMode('none');
                await onSendMessage({
                  content: ev.title,
                  msg_type: 'event',
                  attachment_json: JSON.stringify({
                    title: ev.title,
                    startIso: ev.start_iso,
                    location: ev.location,
                  }),
                  trigger_ai: true,
                });
              }}
              className="w-full p-2 rounded-xl bg-white/80 dark:bg-zinc-800 flex items-center justify-between text-left"
            >
              <span className="font-semibold truncate">{ev.title}</span>
              <span className="text-[11px] text-zinc-500 shrink-0">
                {new Date(ev.start_iso).toLocaleDateString('vi-VN')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
