import React, { useMemo, useState } from 'react';
import {
  Bell,
  Brain,
  Check,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Film,
  Heart,
  History,
  Image as ImageIcon,
  Layers,
  Mic,
  Pin,
  Plus,
  Power,
  RotateCcw,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AiRelationshipRecord,
  Character,
  CharacterMemory,
  ChatMessage,
  ChatSummaryRecord,
  Conversation,
  ConversationMember,
  RelationshipEventRecord,
  RoleplayScenario,
} from '../../types/os';
import {
  BUBBLE_COLORS,
  CHAT_WALLPAPERS,
  DEFAULT_CONV_SETTINGS,
  DEFAULT_ROLEPLAY_STATE,
  formatRelativeTime,
  GIF_CATALOG,
  handleCharImgError,
  isGifAttachment,
  normalizeVi,
  RELATIONSHIP_MILESTONES,
  safeJson,
  type ConversationSettings,
  type RoleplayState,
} from './utils';
import { GifReactionCard } from './ChatComposer';
import { osApi } from '../../services/api';

interface ChatSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  messages: ChatMessage[];
  characters: Character[];
  conversationMembers: ConversationMember[];
  chatSummaries: ChatSummaryRecord[];
  onRefreshData: () => Promise<void>;
  onDeleteConversation: () => void;
  onClearHistory: () => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatSettingsDrawer({
  open,
  onClose,
  conversation,
  messages,
  characters,
  conversationMembers,
  chatSummaries,
  onRefreshData,
  onDeleteConversation,
  onClearHistory,
  onShowToast,
}: ChatSettingsDrawerProps) {
  const [titleInput, setTitleInput] = useState(conversation.title);
  const [tab, setTab] = useState<'general' | 'media' | 'summaries'>('general');
  const [mediaSubTab, setMediaSubTab] = useState<'images' | 'videos' | 'gifs' | 'audio' | 'files'>('images');
  const [addMemberId, setAddMemberId] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const settings = safeJson<ConversationSettings>(conversation.settings_json, DEFAULT_CONV_SETTINGS);

  const convSummaries = useMemo(
    () =>
      chatSummaries
        .filter((s) => s.conversation_id === conversation.id)
        .sort((a, b) => b.version - a.version),
    [chatSummaries, conversation.id]
  );

  const sharedImages = useMemo(
    () => messages.filter((m) => !m.deleted_at && m.msg_type === 'image'),
    [messages]
  );
  const sharedVideos = useMemo(
    () => messages.filter((m) => !m.deleted_at && m.msg_type === 'video'),
    [messages]
  );
  const sharedGifs = useMemo(
    () =>
      messages.filter((m) => {
        if (m.deleted_at || m.msg_type !== 'sticker') return false;
        const att = safeJson<Record<string, unknown>>(m.attachment_json, {});
        return isGifAttachment(att);
      }),
    [messages]
  );
  const sharedAudio = useMemo(
    () => messages.filter((m) => !m.deleted_at && m.msg_type === 'voice'),
    [messages]
  );
  const sharedFiles = useMemo(
    () => messages.filter((m) => !m.deleted_at && m.msg_type === 'file'),
    [messages]
  );

  if (!open) return null;

  const updateSettingsPatch = async (patch: Partial<ConversationSettings>) => {
    const next = { ...settings, ...patch };
    await osApi.messagesV3.updateConversationConfig(conversation.id, {
      settings_json: JSON.stringify(next),
    });
    await onRefreshData();
  };

  const activeGroupMembers = conversationMembers.filter(
    (m) => m.conversation_id === conversation.id && m.member_type === 'character' && m.is_active
  );

  const totalVaultCount =
    sharedImages.length + sharedVideos.length + sharedGifs.length + sharedAudio.length + sharedFiles.length;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex justify-end">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl border-l border-violet-200/30 dark:border-violet-900/40"
      >
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
          <h4 className="text-sm font-bold">Cài đặt đoạn chat</h4>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-4 py-2 border-b border-zinc-200/70 dark:border-zinc-800 text-[11px] font-semibold">
          <button
            onClick={() => setTab('general')}
            className={`py-1.5 rounded-xl ${
              tab === 'general' ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
            }`}
          >
            Chung
          </button>
          <button
            onClick={() => setTab('media')}
            className={`py-1.5 rounded-xl ${
              tab === 'media' ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
            }`}
          >
            Kho lưu ({totalVaultCount})
          </button>
          <button
            onClick={() => setTab('summaries')}
            className={`py-1.5 rounded-xl ${
              tab === 'summaries' ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
            }`}
          >
            Tóm tắt ({convSummaries.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4 text-xs">
          {tab === 'general' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500">Tên hiển thị đoạn chat</label>
                <div className="flex gap-1.5">
                  <input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                  />
                  <button
                    onClick={async () => {
                      await osApi.messagesV3.updateConversationConfig(conversation.id, {
                        title: titleInput.trim() || conversation.title,
                      });
                      await onRefreshData();
                      onShowToast('Đã đổi tên', titleInput.trim(), 'success');
                    }}
                    className="px-3 py-2 rounded-xl bg-violet-600 text-white font-semibold"
                  >
                    Lưu
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500">Hình nền đoạn chat</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {CHAT_WALLPAPERS.map((wp) => {
                    const active = (conversation.wallpaper || '') === wp.value;
                    return (
                      <button
                        key={wp.id}
                        onClick={async () => {
                          await osApi.messagesV3.updateConversationConfig(conversation.id, {
                            wallpaper: wp.value,
                          });
                          await onRefreshData();
                        }}
                        className={`p-2 rounded-xl border text-[11px] font-medium ${
                          active
                            ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        {wp.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500">Màu bong bóng tin nhắn của bạn</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {BUBBLE_COLORS.map((bc) => (
                    <button
                      key={bc.value}
                      onClick={async () => {
                        await osApi.messagesV3.updateConversationConfig(conversation.id, {
                          bubble_color: bc.value,
                        });
                        await onRefreshData();
                      }}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                        (conversation.bubble_color || '#7C3AED') === bc.value
                          ? 'border-zinc-900 dark:border-white scale-110'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: bc.value }}
                      title={bc.label}
                    >
                      {(conversation.bubble_color || '#7C3AED') === bc.value && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80">
                <div className="flex items-center justify-between">
                  <span>Cỡ chữ tin nhắn</span>
                  <div className="flex gap-1">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => updateSettingsPatch({ fontSize: sz })}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
                          settings.fontSize === sz
                            ? 'bg-violet-600 text-white'
                            : 'bg-white dark:bg-zinc-900'
                        }`}
                      >
                        {sz === 'small' ? 'Nhỏ' : sz === 'large' ? 'Lớn' : 'Vừa'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between pt-1">
                  <span>Nhấn Enter để gửi</span>
                  <input
                    type="checkbox"
                    checked={settings.enterToSend}
                    onChange={(e) => updateSettingsPatch({ enterToSend: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span>Âm thanh khi có tin nhắn</span>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => updateSettingsPatch({ soundEnabled: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span>Ẩn thanh chỉ số khi nhập vai</span>
                  <input
                    type="checkbox"
                    checked={settings.hideMetersInRoleplay}
                    onChange={(e) => updateSettingsPatch({ hideMetersInRoleplay: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                </label>
              </div>

              {conversation.is_group === 1 && (
                <div className="space-y-2 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80">
                  <p className="font-semibold">Thành viên & Chế độ nhóm</p>
                  <select
                    value={conversation.group_mode || 'turn_based'}
                    onChange={async (e) => {
                      await osApi.messagesV3.updateConversationConfig(conversation.id, {
                        group_mode: e.target.value,
                      });
                      await onRefreshData();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none"
                  >
                    <option value="turn_based" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Luân phiên tự nhiên</option>
                    <option value="open_discussion" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Thảo luận mở</option>
                    <option value="mention_only" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Chỉ trả lời khi @nhắc tên</option>
                  </select>
                  {activeGroupMembers.map((m) => {
                    const ch = characters.find((c) => c.id === m.member_id);
                    if (!ch) return null;
                    return (
                      <div key={m.member_id} className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={ch.avatar}
                            alt={ch.name}
                            loading="lazy"
                            onError={(e) => handleCharImgError(e, ch.name)}
                            className="w-7 h-7 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800"
                          />
                          <span className="truncate font-medium">{ch.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              await osApi.messagesV3.updateMember(conversation.id, ch.id, {
                                muted: m.muted ? 0 : 1,
                              });
                              await onRefreshData();
                            }}
                            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900"
                          >
                            {m.muted ? <VolumeX className="w-3.5 h-3.5 text-amber-500" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={async () => {
                              await osApi.messagesV3.removeMember(conversation.id, ch.id);
                              await onRefreshData();
                            }}
                            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 text-rose-500"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-1.5 pt-1">
                    <select
                      value={addMemberId}
                      onChange={(e) => setAddMemberId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none"
                    >
                      <option value="" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Thêm nhân vật AI...</option>
                      {characters
                        .filter((c) => !c.is_blocked && !activeGroupMembers.some((m) => m.member_id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={!addMemberId}
                      onClick={async () => {
                        if (!addMemberId) return;
                        await osApi.messagesV3.addMember(conversation.id, addMemberId);
                        setAddMemberId('');
                        await onRefreshData();
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-violet-600 text-white disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    await osApi.messagesV3.updateConversationConfig(conversation.id, {
                      pinned: conversation.pinned ? 0 : 1,
                    });
                    await onRefreshData();
                  }}
                  className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center gap-1.5 font-medium"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{conversation.pinned ? 'Bỏ ghim' : 'Ghim chat'}</span>
                </button>
                <button
                  onClick={async () => {
                    await osApi.messagesV3.updateConversationConfig(conversation.id, {
                      muted: conversation.muted ? 0 : 1,
                    });
                    await onRefreshData();
                  }}
                  className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center gap-1.5 font-medium"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{conversation.muted ? 'Bật thông báo' : 'Tắt thông báo'}</span>
                </button>
                <a
                  href={osApi.messagesV3.exportConversationUrl(conversation.id, 'json')}
                  download
                  className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center gap-1.5 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất JSON</span>
                </a>
                <a
                  href={osApi.messagesV3.exportConversationUrl(conversation.id, 'txt')}
                  download
                  className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center gap-1.5 font-medium"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Xuất TXT</span>
                </a>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={onClearHistory}
                  className="w-full py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-semibold"
                >
                  Xóa toàn bộ lịch sử tin nhắn
                </button>
                <button
                  onClick={onDeleteConversation}
                  className="w-full py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold"
                >
                  Xóa cuộc trò chuyện
                </button>
              </div>
            </>
          )}

          {/* 5-Tab Media Vault */}
          {tab === 'media' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1 overflow-x-auto os-scroll-hidden pb-0.5">
                {(
                  [
                    { id: 'images', label: `Ảnh (${sharedImages.length})`, icon: ImageIcon },
                    { id: 'videos', label: `Video (${sharedVideos.length})`, icon: Video },
                    { id: 'gifs', label: `GIF (${sharedGifs.length})`, icon: Film },
                    { id: 'audio', label: `Thoại (${sharedAudio.length})`, icon: Mic },
                    { id: 'files', label: `Tệp (${sharedFiles.length})`, icon: FileText },
                  ] as const
                ).map((sub) => {
                  const Icon = sub.icon;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setMediaSubTab(sub.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-semibold shrink-0 flex items-center gap-1 ${
                        mediaSubTab === sub.id
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              {mediaSubTab === 'images' && (
                sharedImages.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">Chưa có hình ảnh nào được chia sẻ.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {sharedImages.flatMap((m) => {
                      const att = safeJson<{ dataUrl?: string; images?: Array<{ dataUrl: string }> }>(m.attachment_json, {});
                      const urls = Array.isArray(att.images) && att.images.length > 0
                        ? att.images.map((x) => x.dataUrl)
                        : att.dataUrl
                          ? [att.dataUrl]
                          : [];
                      return urls.map((u, idx) => (
                        <div key={`${m.id}_${idx}`} className="aspect-square rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                          <img src={u} alt="" className="w-full h-full object-cover" />
                        </div>
                      ));
                    })}
                  </div>
                )
              )}

              {mediaSubTab === 'videos' && (
                sharedVideos.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">Chưa có video nào được chia sẻ.</p>
                ) : (
                  <div className="space-y-2">
                    {sharedVideos.map((m) => {
                      const att = safeJson<{ dataUrl?: string }>(m.attachment_json, {});
                      return att.dataUrl ? (
                        <video key={m.id} src={att.dataUrl} controls className="w-full rounded-2xl max-h-48 bg-black" />
                      ) : null;
                    })}
                  </div>
                )
              )}

              {mediaSubTab === 'gifs' && (
                sharedGifs.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">Chưa có GIF biểu cảm nào được gửi.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sharedGifs.map((m) => {
                      const att = safeJson<{ gifId?: string }>(m.attachment_json, {});
                      const gifItem = GIF_CATALOG.find((g) => g.id === att.gifId) || GIF_CATALOG[0];
                      return <GifReactionCard key={m.id} item={gifItem} compact />;
                    })}
                  </div>
                )
              )}

              {mediaSubTab === 'audio' && (
                sharedAudio.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">Chưa có tin nhắn thoại nào.</p>
                ) : (
                  <div className="space-y-2">
                    {sharedAudio.map((m) => {
                      const att = safeJson<{ dataUrl?: string }>(m.attachment_json, {});
                      return (
                        <div key={m.id} className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-zinc-500">
                            <span className="font-semibold">{m.sender_name}</span>
                            <span className="font-mono-num">{formatRelativeTime(m.created_at)}</span>
                          </div>
                          {att.dataUrl ? (
                            <audio src={att.dataUrl} controls className="w-full h-8" />
                          ) : (
                            <span className="text-zinc-400">{m.content}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {mediaSubTab === 'files' && (
                sharedFiles.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">Chưa có tệp tài liệu nào.</p>
                ) : (
                  <div className="space-y-2">
                    {sharedFiles.map((f) => {
                      const att = safeJson<{ dataUrl?: string; name?: string }>(f.attachment_json, {});
                      return (
                        <a
                          key={f.id}
                          href={att.dataUrl || '#'}
                          download={att.name || f.content}
                          className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-violet-500 shrink-0" />
                            <span className="truncate">{f.content}</span>
                          </div>
                          <Download className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          )}

          {tab === 'summaries' && (
            <div className="space-y-3">
              <button
                disabled={summarizing}
                onClick={async () => {
                  setSummarizing(true);
                  try {
                    await osApi.messagesV3.createSummary(conversation.id);
                    await onRefreshData();
                    onShowToast('Đã tạo bản tóm tắt mới', 'AI sẽ ghi nhớ mạch truyện liền mạch hơn.', 'success');
                  } catch (err) {
                    onShowToast('Không thể tóm tắt', err instanceof Error ? err.message : 'Lỗi AI', 'error');
                  } finally {
                    setSummarizing(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{summarizing ? 'Đang tóm tắt...' : 'Tóm tắt hội thoại hiện tại'}</span>
              </button>

              {convSummaries.length === 0 ? (
                <p className="text-center text-zinc-400 py-8">Chưa có bản tóm tắt nào cho đoạn chat này.</p>
              ) : (
                convSummaries.map((s) => (
                  <div key={s.id} className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-semibold text-violet-600 dark:text-violet-400">
                        Phiên bản v{s.version}
                      </span>
                      <span className="font-mono-num">{formatRelativeTime(s.created_at)}</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{s.summary}</p>
                    <button
                      onClick={async () => {
                        await osApi.messagesV3.restoreSummary(s.id);
                        await onRefreshData();
                        onShowToast('Đã khôi phục tóm tắt', `Bản v${s.version} đã được đặt làm ngữ cảnh hiện tại.`);
                      }}
                      className="text-[11px] text-violet-600 font-semibold flex items-center gap-1"
                    >
                      <History className="w-3 h-3" />
                      <span>Dùng bản này làm ngữ cảnh chính</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MemoryAndRelationshipDrawerProps {
  open: boolean;
  onClose: () => void;
  character: Character;
  conversation: Conversation;
  memories: CharacterMemory[];
  relationship?: AiRelationshipRecord;
  relationshipEvents?: RelationshipEventRecord[];
  onJumpToMessage?: (msgId: string) => void;
  onRefreshData: () => Promise<void>;
  onAiReplyApplied: (res: { conversationId: string }) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function MemoryAndRelationshipDrawer({
  open,
  onClose,
  character,
  conversation,
  memories,
  relationship,
  relationshipEvents = [],
  onJumpToMessage,
  onRefreshData,
  onShowToast,
}: MemoryAndRelationshipDrawerProps) {
  const [memQuery, setMemQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pinned' | 'user_requested' | 'ai_inferred' | 'manual'>('all');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemType, setNewMemType] = useState<'long_term' | 'preference' | 'relationship' | 'event'>('long_term');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [proactiveLoading, setProactiveLoading] = useState(false);

  const settings = safeJson<ConversationSettings>(conversation.settings_json, DEFAULT_CONV_SETTINGS);
  const roleplay = safeJson<RoleplayState>(conversation.roleplay_state_json, DEFAULT_ROLEPLAY_STATE);
  const hideMeters = Boolean(roleplay.active && settings.hideMetersInRoleplay);

  const charMemories = useMemo(() => {
    const q = normalizeVi(memQuery);
    return memories
      .filter((m) => m.character_id === character.id)
      .filter((m) => {
        if (sourceFilter === 'pinned') return m.is_pinned === 1;
        return sourceFilter === 'all' ? true : (m.source_kind || 'ai_inferred') === sourceFilter;
      })
      .filter((m) => (!q ? true : normalizeVi(m.content).includes(q)))
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0));
  }, [memories, character.id, memQuery, sourceFilter]);

  const charEvents = useMemo(
    () => relationshipEvents.filter((e) => e.character_id === character.id).slice(0, 6),
    [relationshipEvents, character.id]
  );

  const nextMilestone = useMemo(
    () => RELATIONSHIP_MILESTONES.find((m) => m.level > (character.relationship_level || 1)) || RELATIONSHIP_MILESTONES[RELATIONSHIP_MILESTONES.length - 1],
    [character.relationship_level]
  );

  if (!open) return null;

  const handleAddMemory = async () => {
    if (!newMemContent.trim()) return;
    await osApi.addCharacterMemory(character.id, {
      memory_type: newMemType,
      content: newMemContent.trim(),
      importance: 8,
    });
    setNewMemContent('');
    await onRefreshData();
    onShowToast('Đã thêm ký ức mới', character.name, 'success');
  };

  const handleTriggerProactive = async (force: boolean) => {
    setProactiveLoading(true);
    try {
      const res = await osApi.messagesV3.triggerProactive({ characterId: character.id, force });
      if (res.skipped) {
        onShowToast('Chưa gửi tin chủ động', res.reason || 'Đang tuân thủ quy tắc giới hạn');
      } else {
        await onRefreshData();
        onClose();
        onShowToast(character.name, 'Vừa chủ động nhắn tin cho bạn!', 'success');
      }
    } catch (err) {
      onShowToast('Lỗi nhắn chủ động', err instanceof Error ? err.message : 'Lỗi AI', 'error');
    } finally {
      setProactiveLoading(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex justify-end">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col overflow-hidden shadow-2xl border-l border-violet-200/30 dark:border-violet-900/40"
      >
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-600" />
            <h4 className="text-sm font-bold">Ký ức & Quan hệ · {character.name}</h4>
          </div>
          <button onClick={onClose} className="p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4 text-xs">
          {/* Grounded Emotion & Relationship Section */}
          {!hideMeters ? (
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-pink-500/10 border border-violet-300/40 dark:border-violet-800/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-pink-500 fill-current" />
                  <span>{relationship?.stage || `Cấp ${character.relationship_level}`}</span>
                </span>
                <span className="text-[11px] text-zinc-500">Tâm trạng: {character.mood}</span>
              </div>
              {relationship && (
                <div className="grid grid-cols-4 gap-1.5 pt-0.5 text-center">
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-zinc-900/80">
                    <span className="text-[9px] text-zinc-500 block">Tình cảm</span>
                    <span className="font-bold text-rose-500 font-mono-num">{relationship.affection}%</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-zinc-900/80">
                    <span className="text-[9px] text-zinc-500 block">Tin tưởng</span>
                    <span className="font-bold text-sky-500 font-mono-num">{relationship.trust}%</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-zinc-900/80">
                    <span className="text-[9px] text-zinc-500 block">Thân quen</span>
                    <span className="font-bold text-emerald-500 font-mono-num">{relationship.familiarity}%</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-zinc-900/80">
                    <span className="text-[9px] text-zinc-500 block">Tôn trọng</span>
                    <span className="font-bold text-violet-500 font-mono-num">{relationship.respect ?? 65}%</span>
                  </div>
                </div>
              )}
              <div className="p-2 rounded-xl bg-white/60 dark:bg-zinc-900/60 text-[10px] text-zinc-600 dark:text-zinc-300">
                <strong>Cột mốc kế tiếp ({nextMilestone.stage}):</strong> {nextMilestone.reward}
              </div>
              {charEvents.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-violet-200/40 dark:border-violet-800/40 text-[10px]">
                  <p className="font-semibold text-zinc-500">Biến động gần đây</p>
                  {charEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{ev.description}</span>
                      <span className="text-zinc-400 shrink-0 font-mono-num">{formatRelativeTime(ev.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-400 italic">
              Đã ẩn thanh chỉ số quan hệ theo cài đặt chế độ nhập vai.
            </p>
          )}

          {/* Memory Toggle + Proactive Check */}
          <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 space-y-2.5">
            <label className="flex items-center justify-between font-medium">
              <span>Dùng ký ức riêng với {character.name}</span>
              <input
                type="checkbox"
                checked={character.memory_enabled !== 0}
                onChange={async (e) => {
                  await osApi.messagesV3.updateCharacterV3(character.id, {
                    memory_enabled: e.target.checked ? 1 : 0,
                  });
                  await onRefreshData();
                }}
                className="w-4 h-4 accent-violet-600"
              />
            </label>
            <label className="flex items-center justify-between font-medium">
              <span>Cho phép tự nhắn tin chủ động</span>
              <input
                type="checkbox"
                checked={character.proactive_msg_enabled !== 0}
                onChange={async (e) => {
                  await osApi.messagesV3.updateCharacterV3(character.id, {
                    proactive_msg_enabled: e.target.checked ? 1 : 0,
                  });
                  await onRefreshData();
                }}
                className="w-4 h-4 accent-violet-600"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                disabled={proactiveLoading}
                onClick={() => handleTriggerProactive(false)}
                className="py-2 rounded-xl bg-white dark:bg-zinc-900 font-semibold border border-zinc-200 dark:border-zinc-700"
              >
                Kiểm tra lịch chủ động
              </button>
              <button
                disabled={proactiveLoading}
                onClick={() => handleTriggerProactive(true)}
                className="py-2 rounded-xl bg-violet-600 text-white font-semibold"
              >
                {proactiveLoading ? 'Đang tạo...' : 'Nhắn chủ động ngay'}
              </button>
            </div>
          </div>

          {/* Add New Memory */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-500">Thêm ký ức riêng cho {character.name}</label>
            <div className="flex gap-1.5">
              <input
                value={newMemContent}
                onChange={(e) => setNewMemContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                placeholder="Ví dụ: Mình thích uống trà đào ít ngọt..."
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
              />
              <button
                onClick={handleAddMemory}
                className="px-3 py-2 rounded-xl bg-violet-600 text-white font-semibold"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <select
              value={newMemType}
              onChange={(e) =>
                setNewMemType(e.target.value as 'long_term' | 'preference' | 'relationship' | 'event')
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 text-[11px] outline-none"
            >
              <option value="long_term" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Ký ức dài hạn</option>
              <option value="preference" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Sở thích</option>
              <option value="relationship" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Mối quan hệ</option>
              <option value="event" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Sự kiện đáng nhớ</option>
            </select>
          </div>

          {/* Search & Filter Memories */}
          <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <input
              value={memQuery}
              onChange={(e) => setMemQuery(e.target.value)}
              placeholder="Tìm trong ký ức cô lập..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
            />
            <div className="flex items-center gap-1 overflow-x-auto os-scroll-hidden">
              {(
                [
                  ['all', 'Tất cả'],
                  ['pinned', 'Đã ghim'],
                  ['user_requested', 'Bạn yêu cầu'],
                  ['ai_inferred', 'AI suy luận'],
                  ['manual', 'Tự thêm'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSourceFilter(k)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 ${
                    sourceFilter === k ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {charMemories.length === 0 ? (
              <p className="text-center text-zinc-400 py-6">Chưa có ký ức nào khớp.</p>
            ) : (
              <div className="space-y-2">
                {charMemories.map((m) => {
                  const active = m.is_active !== 0;
                  const pinned = m.is_pinned === 1;
                  return (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-2xl border space-y-1.5 ${
                        pinned
                          ? 'border-violet-400/60 bg-violet-50/70 dark:bg-violet-950/30'
                          : active
                            ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40'
                            : 'border-zinc-200/40 dark:border-zinc-800/40 opacity-55'
                      }`}
                    >
                      {editingId === m.id ? (
                        <div className="flex gap-1.5">
                          <input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 outline-none"
                          />
                          <button
                            onClick={async () => {
                              await osApi.messagesV3.updateMemoryV3(m.id, { content: editContent });
                              setEditingId(null);
                              await onRefreshData();
                            }}
                            className="p-1.5 rounded-lg bg-violet-600 text-white"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="leading-relaxed">
                          {pinned && <Pin className="w-3 h-3 inline mr-1 text-violet-600" />}
                          {m.content}
                        </p>
                      )}
                      {m.emotional_context && (
                        <p className="text-[10px] text-pink-600 dark:text-pink-300">
                          Cảm xúc gắn liền: {m.emotional_context}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>{active ? 'Đang dùng' : 'Đã tắt'} · {m.memory_type}</span>
                        <div className="flex items-center gap-1">
                          {m.source_message_id && onJumpToMessage && (
                            <button
                              onClick={() => {
                                onJumpToMessage(m.source_message_id!);
                                onClose();
                              }}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-violet-600"
                              title="Đi tới tin nhắn gốc"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await osApi.messagesV3.updateMemoryV3(m.id, { is_pinned: pinned ? 0 : 1 });
                              await onRefreshData();
                            }}
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            title={pinned ? 'Bỏ ghim' : 'Ghim lên ưu tiên'}
                          >
                            <Pin className={`w-3 h-3 ${pinned ? 'text-violet-600 fill-current' : 'text-zinc-400'}`} />
                          </button>
                          <button
                            onClick={async () => {
                              await osApi.messagesV3.updateMemoryV3(m.id, { is_active: active ? 0 : 1 });
                              await onRefreshData();
                            }}
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            title={active ? 'Tạm tắt' : 'Bật lại'}
                          >
                            <Power className={`w-3 h-3 ${active ? 'text-emerald-500' : 'text-zinc-400'}`} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(m.id);
                              setEditContent(m.content);
                            }}
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={async () => {
                              await osApi.deleteCharacterMemory(m.id);
                              await onRefreshData();
                            }}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleplaySetupModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  characterName: string;
  characterId?: string;
  scenarios?: RoleplayScenario[];
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function RoleplaySetupModal({
  open,
  onClose,
  conversation,
  characterName,
  characterId,
  scenarios = [],
  onRefreshData,
  onShowToast,
}: RoleplaySetupModalProps) {
  const existing = safeJson<RoleplayState>(conversation.roleplay_state_json, DEFAULT_ROLEPLAY_STATE);
  const [genre, setGenre] = useState(existing.genre || 'Đời thường');
  const [sceneTitle, setSceneTitle] = useState(existing.sceneTitle || 'Buổi chiều quán cà phê');
  const [scenario, setScenario] = useState(existing.scenario || '');
  const [userRole, setUserRole] = useState(existing.userRole || 'Người đồng hành');
  const [aiRole, setAiRole] = useState(existing.aiRole || characterName);
  const [moodTone, setMoodTone] = useState(existing.moodTone || 'Ấm áp, tự nhiên');

  const relevantScenarios = useMemo(
    () => scenarios.filter((s) => !s.character_id || s.character_id === characterId),
    [scenarios, characterId]
  );

  if (!open) return null;

  const saveRoleplay = async (nextActive: boolean, paused = false, notice?: string) => {
    await osApi.messagesV3.updateRoleplay(conversation.id, {
      active: nextActive,
      paused,
      genre,
      sceneTitle,
      scenario,
      userRole,
      aiRole,
      moodTone,
      emitSystemNotice: notice,
    });
    await onRefreshData();
    onClose();
    onShowToast('Chế độ nhập vai', nextActive ? 'Đã cập nhật bối cảnh nhập vai!' : 'Đã kết thúc nhập vai.', 'success');
  };

  const handleRestartBranch = async () => {
    await osApi.messagesV3.restartRoleplay(conversation.id, {
      sceneTitle,
      scenario,
    });
    await onRefreshData();
    onClose();
    onShowToast('Đã mở nhánh cốt truyện mới', sceneTitle || 'Chương mới đã sẵn sàng.', 'success');
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] rounded-t-3xl sm:rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col overflow-hidden text-xs shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-600" />
            <h4 className="text-sm font-bold">Thiết lập Nhập vai & Kịch bản</h4>
          </div>
          <button onClick={onClose} className="p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3">
          {relevantScenarios.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-zinc-500">Chọn nhanh kịch bản có sẵn</p>
              <div className="flex gap-2 overflow-x-auto os-scroll-hidden pb-1">
                {relevantScenarios.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setGenre(sc.genre || 'Roleplay');
                      setSceneTitle(sc.title);
                      setScenario(sc.opening_scene || sc.description);
                      setUserRole(sc.user_role || 'Bạn');
                      setAiRole(sc.ai_role || characterName);
                      onShowToast('Đã nạp kịch bản', sc.title);
                    }}
                    className="w-48 shrink-0 text-left p-2.5 rounded-2xl bg-violet-50/80 dark:bg-violet-950/35 border border-violet-300/50 dark:border-violet-800/50 space-y-1"
                  >
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-300 block truncate">
                      {sc.genre}
                    </span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{sc.title}</p>
                    <p className="text-[10px] text-zinc-500 line-clamp-2">{sc.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Thể loại</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none"
              >
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Đời thường</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Romance</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Fantasy</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">School Life</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Mystery</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Action</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Drama</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Roleplay</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Không khí / Tông cảm xúc</label>
              <input
                value={moodTone}
                onChange={(e) => setMoodTone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Tên cảnh / Chương hiện tại</label>
            <input
              value={sceneTitle}
              onChange={(e) => setSceneTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Vai của bạn</label>
              <input
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Vai của {characterName}</label>
              <input
                value={aiRole}
                onChange={(e) => setAiRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Bối cảnh chi tiết</label>
            <textarea
              rows={3}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Mô tả địa điểm, tình huống mở đầu hoặc sự kiện vừa xảy ra..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          {existing.active && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => saveRoleplay(false, false, 'Đã kết thúc chế độ nhập vai, quay lại trò chuyện bình thường.')}
                className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Kết thúc</span>
              </button>
              <button
                onClick={handleRestartBranch}
                className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 font-semibold"
              >
                Nhánh mới
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold"
            >
              Hủy
            </button>
            <button
              onClick={() =>
                saveRoleplay(
                  true,
                  false,
                  `Cảnh mới: "${sceneTitle || genre}" (${userRole} & ${aiRole}).`
                )
              }
              className="px-4 py-2 rounded-xl bg-violet-600 text-white font-semibold"
            >
              {existing.active ? 'Cập nhật cảnh' : 'Bắt đầu nhập vai'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
