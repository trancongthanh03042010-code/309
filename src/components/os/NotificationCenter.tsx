import React, { useMemo, useState } from 'react';
import { AlarmClock, Bell, CheckCheck, Search, Send, Trash2, X } from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import type { AppId, OSNotification } from '../../types/os';

export function NotificationCenter() {
  const {
    data,
    notificationCenterOpen,
    setNotificationCenterOpen,
    refreshData,
    openApp,
    showToast,
  } = useOS();

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [filterText, setFilterText] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const grouped = useMemo(() => {
    if (!data) return {};
    const list = data.notifications.filter((n) => {
      if (onlyUnread && n.is_read) return false;
      if (filterText.trim()) {
        const q = filterText.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.group_key.toLowerCase().includes(q);
      }
      return true;
    });
    return list.reduce<Record<string, OSNotification[]>>((acc, n) => {
      const k = n.group_key || 'Hệ thống';
      if (!acc[k]) acc[k] = [];
      acc[k].push(n);
      return acc;
    }, {});
  }, [data, filterText, onlyUnread]);

  if (!notificationCenterOpen || !data) return null;

  const handleOpenNotification = async (n: OSNotification) => {
    setNotificationCenterOpen(false);
    if (n.action_route) {
      const payload = String(n.action_payload || '');
      const isBankingTx =
        n.action_route === 'banking' &&
        (payload.startsWith('tx') || payload.startsWith('HK') || payload.startsWith('PB'));
      openApp(n.action_route as AppId, {
        conversationId: n.action_route === 'messages' ? payload : undefined,
        postId: n.action_route === 'social' ? payload : undefined,
        txId: isBankingTx ? payload : undefined,
        tab:
          n.action_route === 'banking'
            ? isBankingTx || payload.startsWith('payreq_') || payload.startsWith('req_') || payload.startsWith('char_request')
              ? 'history'
              : 'notifications'
            : undefined,
      });
    }
    if (n.action_route === 'messages' && n.action_payload) {
      await osApi.messagesV3.markConversationRead(n.action_payload).catch(() => {});
    }
    await osApi.markAllNotificationsRead();
    refreshData();
  };

  const handleQuickReply = async (n: OSNotification) => {
    if (!replyText.trim() || !n.action_payload) return;
    const text = replyText.trim();
    setReplyText('');
    setReplyingId(null);
    showToast('Đã gửi', `Đã trả lời ${n.title}`);
    await osApi.sendMessage({
      conversation_id: n.action_payload,
      content: text,
      msg_type: 'text',
    });
    await refreshData();
  };

  return (
    <div
      onClick={() => setNotificationCenterOpen(false)}
      className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xl p-4 flex flex-col text-white"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-semibold">Thông báo</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await osApi.markAllNotificationsRead();
                refreshData();
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-xs"
              title="Đánh dấu đã đọc tất cả"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => {
                await osApi.deleteNotification('all');
                refreshData();
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-rose-500/30 text-xs"
              title="Xóa tất cả"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setNotificationCenterOpen(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2.5">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10">
            <Search className="w-3.5 h-3.5 text-white/60" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Lọc thông báo..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-white/50"
            />
          </div>
          <button
            onClick={() => setOnlyUnread((u) => !u)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold ${
              onlyUnread ? 'bg-[#A78BFA] text-white' : 'bg-white/10 text-white/75'
            }`}
          >
            Chưa đọc
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll py-3 space-y-4">
          {Object.keys(grouped).length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-white/50 text-xs">
              <Bell className="w-8 h-8 mb-2 opacity-40" />
              <p>Không có thông báo mới</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="space-y-2">
                <p className="text-[11px] font-semibold text-white/60 px-1">{group}</p>
                {list.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-2xl bg-white/10 border border-white/10 space-y-2"
                  >
                    <div className="flex items-start gap-2.5">
                      {n.avatar && (
                        <img src={n.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      )}
                      <button
                        onClick={() => handleOpenNotification(n)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">{n.title}</span>
                          <span className="text-[10px] text-white/50 font-mono-num shrink-0">
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-white/80 line-clamp-2 mt-0.5">{n.body}</p>
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.deleteNotification(n.id);
                          refreshData();
                        }}
                        className="p-1 text-white/40 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {n.action_route === 'messages' && n.action_payload ? (
                        <div className="flex-1">
                          {replyingId === n.id ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleQuickReply(n)}
                                placeholder="Trả lời nhanh..."
                                autoFocus
                                className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs outline-none"
                              />
                              <button
                                onClick={() => handleQuickReply(n)}
                                className="p-2 rounded-xl bg-[#A78BFA] text-white"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setReplyingId(n.id)}
                              className="text-[11px] text-purple-300 hover:text-purple-200 font-medium"
                            >
                              Trả lời nhanh
                            </button>
                          )}
                        </div>
                      ) : n.action_route === 'banking' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenNotification(n)}
                          className="text-[11px] text-rose-300 hover:text-rose-200 font-bold"
                        >
                          {n.action_payload?.startsWith('tx') ||
                          n.action_payload?.startsWith('HK') ||
                          n.action_payload?.startsWith('PB')
                            ? 'Xem trong Hikari Bank →'
                            : 'Mở Hikari Bank →'}
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={async () => {
                          await osApi.createReminder({
                            title: `Báo lại: ${n.title}`,
                            notes: n.body,
                            due_at: new Date(Date.now() + 15 * 60_000).toISOString(),
                            priority: 'medium',
                          });
                          await osApi.deleteNotification(n.id);
                          await refreshData();
                          showToast('Đã báo lại (+15 phút)', 'Đã lưu vào ứng dụng Nhắc nhở.', 'success');
                        }}
                        className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1 shrink-0"
                        title="Báo lại sau 15 phút"
                      >
                        <AlarmClock className="w-3 h-3" />
                        <span>Báo lại 15p</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
