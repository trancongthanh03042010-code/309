import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  Languages,
  Loader2,
  Mail,
  MessageCircle,
  Share2,
  Users,
  Wallpaper,
  X,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import { useDraggablePopup } from './useDraggablePopup';
import { sharePngViaNativeSystem } from '../banking/utils';
import { downloadDataUrlAsPng } from '../banking/billRenderer';
import type { Conversation } from '../../types/os';

interface ShareTargetItem {
  key: string;
  label: string;
  subLabel: string;
  avatar: string;
  conversationId?: string;
  characterId?: string;
  isGroup?: boolean;
}

export function ShareSheet() {
  const {
    data,
    sharePayload,
    closeShareSheet,
    openApp,
    updateProfile,
    refreshData,
    showToast,
    addClipboardEntry,
    upsertLocalMessage,
  } = useOS();

  const [busyTargetKey, setBusyTargetKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const drag = useDraggablePopup({
    clampMode: 'header',
    padding: 8,
    handleHeight: 56,
    minVisibleX: 140,
    resetKey: sharePayload ? `${sharePayload.title}:${sharePayload.url || ''}` : '',
  });

  const shareTargets = useMemo<ShareTargetItem[]>(() => {
    if (!data) return [];
    const activeConvs = data.conversations.filter((c) => !c.archived);
    const coveredCharIds = new Set(
      activeConvs.filter((c) => !c.is_group && c.character_id).map((c) => c.character_id)
    );

    const convItems: ShareTargetItem[] = activeConvs.map((conv) => ({
      key: `conv_${conv.id}`,
      label: conv.title,
      subLabel: conv.is_group ? 'Nhóm' : 'Nhân vật',
      avatar: conv.avatar || '/src/assets/images/char_yuki_1794880089308.jpg',
      conversationId: conv.id,
      characterId: conv.character_id || undefined,
      isGroup: Boolean(conv.is_group),
    }));

    const charItems: ShareTargetItem[] = data.characters
      .filter((ch) => !coveredCharIds.has(ch.id))
      .map((ch) => ({
        key: `char_${ch.id}`,
        label: ch.name,
        subLabel: 'Bắt đầu chat',
        avatar: ch.avatar || '/src/assets/images/char_yuki_1794880089308.jpg',
        characterId: ch.id,
      }));

    return [...convItems, ...charItems];
  }, [data]);

  if (!sharePayload || !data) return null;

  const textBody = sharePayload.text
    ? `${sharePayload.title}\n${sharePayload.text}`
    : sharePayload.url || sharePayload.title;

  const shareToTarget = async (target: ShareTargetItem) => {
    if (busyTargetKey || busyAction) return;
    setBusyTargetKey(target.key);
    try {
      let createdNewConv = false;
      let targetConvId = target.conversationId;
      if (!targetConvId && target.characterId) {
        const ch = data.characters.find((c) => c.id === target.characterId);
        const created = (await osApi.createConversation({
          title: ch?.name || target.label,
          is_group: 0,
          avatar: ch?.avatar || target.avatar,
          character_id: target.characterId,
        })) as Conversation;
        targetConvId = created.id;
        createdNewConv = true;
      }

      if (!targetConvId) {
        throw new Error('Không xác định được cuộc trò chuyện nhận.');
      }

      const content = sharePayload.mediaUrl
        ? sharePayload.text || sharePayload.title
        : textBody;

      const sendRes = await osApi.sendMessage({
        conversation_id: targetConvId,
        content,
        msg_type: sharePayload.mediaUrl ? 'image' : 'text',
        attachment_json: sharePayload.mediaUrl
          ? { ...(sharePayload.extra || {}), dataUrl: sharePayload.mediaUrl, title: sharePayload.title }
          : sharePayload.extra || {},
        trigger_ai: false,
      });

      if (sendRes?.userMessage) {
        upsertLocalMessage(sendRes.userMessage);
      }

      if (createdNewConv) {
        await refreshData();
      } else {
        void refreshData().catch(() => {});
      }

      const shouldTriggerAi = Boolean(sendRes?.userMessage?.id && (target.characterId || target.isGroup));

      closeShareSheet();
      openApp('messages', {
        conversationId: targetConvId,
        autoReplyMsgId: shouldTriggerAi ? sendRes.userMessage.id : undefined,
      });
      showToast('Đã chia sẻ', `Đã gửi tới ${target.label}`, 'success');
    } catch (err) {
      showToast(
        'Không thể chia sẻ',
        err instanceof Error ? err.message : 'Lỗi khi gửi tới nhân vật',
        'error'
      );
    } finally {
      setBusyTargetKey(null);
    }
  };

  const runAppAction = async (key: string, fn: () => Promise<void>) => {
    if (busyTargetKey || busyAction) return;
    setBusyAction(key);
    try {
      await fn();
    } catch (err) {
      showToast('Không thể chia sẻ', err instanceof Error ? err.message : 'Thao tác thất bại', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const shareToSocial = () =>
    runAppAction('social', async () => {
      await osApi.createPost({
        content: textBody,
        media_url: sharePayload.mediaUrl || '',
        media_type: sharePayload.mediaUrl ? 'image' : '',
        hashtags: ['#PhoneOS'],
      });
      await refreshData();
      closeShareSheet();
      openApp('social');
      showToast('Đã đăng', 'Đã chia sẻ lên Mạng Xã hội', 'success');
    });

  const shareToCommunity = () =>
    runAppAction('community', async () => {
      const firstGroup = data.communityGroups.find((g) => g.is_joined) || data.communityGroups[0];
      await osApi.createCommunityPost({
        group_id: firstGroup?.id || 'grp_ai_vn',
        title: sharePayload.title || 'Chia sẻ từ PHONE OS',
        content: textBody,
        media_url: sharePayload.mediaUrl || '',
        link_url: sharePayload.url || '',
      });
      await refreshData();
      closeShareSheet();
      openApp('community');
      showToast('Đã đăng', 'Đã chia sẻ lên Cộng đồng', 'success');
    });

  const saveToOffice = () =>
    runAppAction('office', async () => {
      await osApi.createOfficeDoc({
        title: sharePayload.title || 'Tài liệu được chia sẻ',
        doc_type: 'document',
        folder: 'Chia sẻ',
        content_json: JSON.stringify({ blocks: [textBody] }),
      });
      await refreshData();
      closeShareSheet();
      openApp('office');
      showToast('Đã lưu', 'Đã tạo tài liệu Văn phòng mới', 'success');
    });

  const saveToNotes = () =>
    runAppAction('notes', async () => {
      await osApi.createNote({
        title: sharePayload.title || 'Ghi chú được chia sẻ',
        content: textBody,
        folder: 'Cá nhân',
      });
      await refreshData();
      closeShareSheet();
      openApp('notes');
      showToast('Đã lưu', 'Đã thêm vào Ghi chú', 'success');
    });

  const sendViaMail = () =>
    runAppAction('mail', async () => {
      await osApi.createEmail({
        folder: 'sent',
        to_email: 'yuki@animesphere.os',
        subject: sharePayload.title || 'Chia sẻ từ PHONE OS',
        body: textBody,
      });
      await refreshData();
      closeShareSheet();
      openApp('mail');
      showToast('Đã gửi', 'Đã gửi qua Thư', 'success');
    });

  const setAsWallpaper = () =>
    runAppAction('wallpaper', async () => {
      if (!sharePayload.mediaUrl) return;
      await updateProfile({ wallpaper: sharePayload.mediaUrl });
      closeShareSheet();
      showToast('Đã đổi hình nền', 'Đã áp dụng cho Màn hình khóa & Chính', 'success');
    });

  const createCalendarFromShare = () =>
    runAppAction('calendar', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await osApi.createEvent({
        title: sharePayload.title || 'Sự kiện được chia sẻ',
        start_iso: `${today}T15:00:00`,
        end_iso: `${today}T16:00:00`,
        notes: textBody,
      });
      await refreshData();
      closeShareSheet();
      openApp('calendar');
      showToast('Đã thêm sự kiện', 'Đã tạo trong Lịch', 'success');
    });

  return (
    <div
      onClick={() => {
        if (!drag.wasJustDragged()) closeShareSheet();
      }}
      className="absolute inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-end p-3"
    >
      <div
        ref={drag.popupRef}
        style={drag.popupStyle}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 p-4 pt-2.5 space-y-4 shadow-2xl max-h-[85%] overflow-y-auto os-scroll"
      >
        <div
          {...drag.handleProps}
          title="Kéo để di chuyển bảng chia sẻ"
          className="cursor-grab active:cursor-grabbing select-none space-y-2"
        >
          <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">Bảng chia sẻ</p>
              <h3 className="text-sm font-semibold truncate">{sharePayload.title}</h3>
              {sharePayload.text && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 whitespace-pre-line">
                  {sharePayload.text}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={closeShareSheet}
              aria-label="Đóng bảng chia sẻ"
              className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Send to All Characters & Conversations */}
        <div>
          <p className="text-[11px] font-medium text-zinc-500 mb-2">
            Gửi trực tiếp tới Nhân vật & Tin nhắn ({shareTargets.length})
          </p>
          <div className="flex items-start gap-3 overflow-x-auto os-scroll-hidden pb-1">
            {shareTargets.map((target) => {
              const isBusy = busyTargetKey === target.key;
              return (
                <button
                  key={target.key}
                  type="button"
                  disabled={Boolean(busyTargetKey || busyAction)}
                  onClick={() => void shareToTarget(target)}
                  className="flex flex-col items-center gap-1 shrink-0 w-16 group disabled:opacity-60"
                >
                  <div className="relative">
                    <img
                      src={target.avatar}
                      alt={target.label}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-[#A78BFA]/45 group-hover:ring-[#245BDB] transition-all"
                    />
                    {isBusy && (
                      <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-medium truncate w-full text-center">
                    {target.label.split(' ')[0]}
                  </span>
                  <span className="text-[9px] text-zinc-400 truncate w-full text-center -mt-0.5">
                    {target.subLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* App Actions Grid */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={shareToSocial}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <HeartHandshake className="w-4 h-4 text-pink-500" />
            <span>Xã hội</span>
          </button>
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={shareToCommunity}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <Users className="w-4 h-4 text-indigo-500" />
            <span>Cộng đồng</span>
          </button>
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={saveToNotes}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <FileText className="w-4 h-4 text-amber-500" />
            <span>Ghi chú</span>
          </button>
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={saveToOffice}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>Văn phòng</span>
          </button>
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={sendViaMail}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <Mail className="w-4 h-4 text-blue-500" />
            <span>Thư</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeShareSheet();
              openApp('translate', { translateText: textBody });
            }}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <Languages className="w-4 h-4 text-cyan-500" />
            <span>Dịch</span>
          </button>
          <button
            type="button"
            disabled={Boolean(busyTargetKey || busyAction)}
            onClick={createCalendarFromShare}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <Calendar className="w-4 h-4 text-rose-500" />
            <span>Lịch</span>
          </button>
          {sharePayload.mediaUrl && (
            <>
              <button
                type="button"
                disabled={Boolean(busyTargetKey || busyAction)}
                onClick={setAsWallpaper}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
              >
                <Wallpaper className="w-4 h-4 text-purple-500" />
                <span>Hình nền</span>
              </button>
              <button
                type="button"
                disabled={Boolean(busyTargetKey || busyAction)}
                onClick={() =>
                  runAppAction('native_share', async () => {
                    const filename = sharePayload.extra?.refCode
                      ? `PhoneBank_${String(sharePayload.extra.refCode)}.png`
                      : 'PhoneOS_Share.png';
                    const outcome = await sharePngViaNativeSystem(
                      sharePayload.mediaUrl!,
                      filename,
                      sharePayload.title,
                      sharePayload.text || sharePayload.title
                    );
                    if (outcome === 'shared') {
                      closeShareSheet();
                      showToast('Đã chia sẻ', 'Đã mở bảng chia sẻ hệ thống Android/Thiết bị.', 'success');
                    } else if (outcome === 'unsupported') {
                      downloadDataUrlAsPng(sharePayload.mediaUrl!, filename);
                      showToast(
                        'Đã tải ảnh PNG',
                        'Trình duyệt không hỗ trợ Web Share tệp PNG; đã tự động tải xuống để gửi qua Messenger/Zalo.',
                        'info'
                      );
                    }
                  })
                }
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
              >
                <Share2 className="w-4 h-4 text-[#245BDB]" />
                <span className="truncate max-w-full">Chia sẻ ngoài</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const filename = sharePayload.extra?.refCode
                    ? `PhoneBank_${String(sharePayload.extra.refCode)}.png`
                    : 'PhoneOS_Image.png';
                  downloadDataUrlAsPng(sharePayload.mediaUrl!, filename);
                  showToast('Đã tải xuống', `Đã lưu ảnh ${filename}`, 'success');
                }}
                className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
              >
                <Download className="w-4 h-4 text-emerald-500" />
                <span>Tải PNG</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(textBody);
              } catch {
                // ignore
              }
              addClipboardEntry(textBody);
              closeShareSheet();
              showToast('Đã sao chép', 'Đã lưu vào Bộ nhớ tạm & Khay bàn phím', 'success');
            }}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <Copy className="w-4 h-4 text-zinc-500" />
            <span>Sao chép</span>
          </button>
          <button
            type="button"
            onClick={() => {
              closeShareSheet();
              openApp('messages');
            }}
            className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex flex-col items-center gap-1.5 text-[11px]"
          >
            <MessageCircle className="w-4 h-4 text-violet-500" />
            <span>Tin nhắn</span>
          </button>
        </div>
      </div>
    </div>
  );
}
