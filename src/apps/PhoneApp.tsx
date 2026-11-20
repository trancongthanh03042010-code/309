import React, { useState } from 'react';
import {
  Star,
  Clock,
  Users,
  Grid,
  Voicemail,
  Phone,
  MessageCircle,
  Trash2,
  Delete,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  UserPlus,
  Video,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

type Tab = 'favorites' | 'recents' | 'contacts' | 'keypad' | 'voicemail';

export function PhoneApp() {
  const { data, startCall, triggerIncomingCall, openApp, refreshData, showToast, requestConfirm } = useOS();
  const [tab, setTab] = useState<Tab>('recents');
  const [dialed, setDialed] = useState('');
  const [search, setSearch] = useState('');

  if (!data) return null;

  const favorites = data.contacts.filter((c) => c.is_favorite && !c.is_blocked);
  const filteredRecents = data.calls.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );
  const voicemails = data.calls.filter((c) => c.voicemail_text);

  const handleDialCall = () => {
    if (!dialed.trim()) return;
    const match = data.contacts.find((c) => c.phone.replace(/\s+/g, '') === dialed.replace(/\s+/g, ''));
    startCall({
      name: match?.name || dialed,
      phone: dialed,
      avatar: match?.avatar,
      isAi: Boolean(match?.is_ai),
      characterId: match?.character_id,
    });
  };

  const handleClearCalls = () => {
    requestConfirm({
      title: 'Xóa lịch sử cuộc gọi?',
      message: 'Toàn bộ lịch sử cuộc gọi gần đây sẽ bị xóa vĩnh viễn.',
      confirmLabel: 'Xóa tất cả',
      destructive: true,
      onConfirm: async () => {
        await osApi.deleteCall('all');
        await refreshData();
        showToast('Đã xóa', 'Đã xóa lịch sử cuộc gọi');
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1A1A22] flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-bold">Điện thoại</h1>
          <p className="text-[11px] text-zinc-500">Cuộc gọi thoại AI & Tổng đài nội bộ</p>
        </div>
        <button
          onClick={() => {
            const yuki = data.characters[0];
            if (yuki) {
              triggerIncomingCall({
                name: yuki.name,
                phone: '+81 90-1024-8801',
                avatar: yuki.avatar,
                isAi: true,
                characterId: yuki.id,
              });
            }
          }}
          className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25"
        >
          Thử cuộc gọi AI
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto os-scroll p-3">
        {tab === 'favorites' && (
          <div className="space-y-2">
            {favorites.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-12">Chưa có liên hệ yêu thích.</p>
            ) : (
              favorites.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={c.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'} alt="" className="w-11 h-11 rounded-full object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{c.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openApp('messages', { characterId: c.character_id })}
                      className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {Boolean(c.is_ai) && (
                      <button
                        onClick={() =>
                          startCall({
                            name: c.name,
                            phone: c.phone,
                            avatar: c.avatar,
                            isAi: true,
                            characterId: c.character_id,
                            isVideo: true,
                          })
                        }
                        title="Video Call AI"
                        className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-colors"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        startCall({
                          name: c.name,
                          phone: c.phone,
                          avatar: c.avatar,
                          isAi: Boolean(c.is_ai),
                          characterId: c.character_id,
                        })
                      }
                      className="p-2.5 rounded-xl bg-emerald-500 text-white"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'recents' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm lịch sử cuộc gọi..."
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs outline-none"
              />
              {data.calls.length > 0 && (
                <button
                  onClick={handleClearCalls}
                  className="p-2 rounded-xl bg-rose-500/10 text-rose-500"
                  title="Xóa lịch sử"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {filteredRecents.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-12">Chưa có cuộc gọi gần đây.</p>
            ) : (
              filteredRecents.map((call) => (
                <div
                  key={call.id}
                  className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={call.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${call.direction === 'missed' ? 'text-rose-500' : ''}`}>
                        {call.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        {call.direction === 'incoming' && <PhoneIncoming className="w-3 h-3 text-emerald-500" />}
                        {call.direction === 'outgoing' && <PhoneOutgoing className="w-3 h-3 text-sky-500" />}
                        {call.direction === 'missed' && <PhoneMissed className="w-3 h-3 text-rose-500" />}
                        <span>{call.is_ai ? 'Giọng AI' : 'Cuộc gọi'}</span>
                        <span>·</span>
                        <span className="font-mono-num">{call.duration_sec} giây</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {Boolean(call.is_ai) && (
                      <button
                        onClick={() =>
                          startCall({
                            name: call.name,
                            phone: call.phone,
                            avatar: call.avatar,
                            isAi: true,
                            characterId: call.character_id,
                            isVideo: true,
                          })
                        }
                        title="Video Call AI"
                        className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-colors"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        startCall({
                          name: call.name,
                          phone: call.phone,
                          avatar: call.avatar,
                          isAi: Boolean(call.is_ai),
                          characterId: call.character_id,
                        })
                      }
                      className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'contacts' && (
          <div className="space-y-2">
            <button
              onClick={() => openApp('contacts')}
              className="w-full py-2 rounded-xl bg-[#A78BFA]/15 text-[#A78BFA] text-xs font-semibold"
            >
              Mở ứng dụng Danh bạ
            </button>
            {data.contacts.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={c.avatar || '/src/assets/images/char_akira_1794880089961.jpg'} alt="" className="w-9 h-9 rounded-full object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono-num">{c.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {Boolean(c.is_ai) && (
                    <button
                      onClick={() =>
                        startCall({
                          name: c.name,
                          phone: c.phone,
                          avatar: c.avatar,
                          isAi: true,
                          characterId: c.character_id,
                          isVideo: true,
                        })
                      }
                      title="Video Call AI"
                      className="p-2 rounded-xl bg-indigo-500/15 text-indigo-500"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      startCall({
                        name: c.name,
                        phone: c.phone,
                        avatar: c.avatar,
                        isAi: Boolean(c.is_ai),
                        characterId: c.character_id,
                      })
                    }
                    className="p-2 rounded-xl bg-emerald-500 text-white"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'keypad' && (
          <div className="h-full flex flex-col items-center justify-between py-2">
            <div className="w-full text-center py-2 min-h-[52px]">
              <p className="text-2xl font-mono-num font-bold tracking-wider truncate px-4">
                {dialed || 'Nhập số điện thoại'}
              </p>
              {dialed && (
                <button
                  onClick={async () => {
                    await osApi.createContact({ name: `Số ${dialed}`, phone: dialed });
                    await refreshData();
                    showToast('Đã lưu', 'Đã thêm số vào Danh bạ');
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-[#A78BFA]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Thêm vào Danh bạ</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 w-full max-w-[240px] my-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                <button
                  key={k}
                  onClick={() => setDialed((d) => d + k)}
                  className="w-14 h-14 mx-auto rounded-full bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xl font-mono-num font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-transform flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 mt-2">
              <div className="w-12" />
              <button
                onClick={handleDialCall}
                className="w-15 h-15 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg"
              >
                <Phone className="w-6 h-6" />
              </button>
              <button
                onClick={() => setDialed((d) => d.slice(0, -1))}
                className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {tab === 'voicemail' && (
          <div className="space-y-2.5">
            {voicemails.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-12">Chưa có thư thoại nào.</p>
            ) : (
              voicemails.map((v) => (
                <div
                  key={v.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{v.name}</span>
                    <span className="text-[11px] text-zinc-500 font-mono-num">
                      {new Date(v.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{v.voicemail_text}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        startCall({
                          name: v.name,
                          phone: v.phone,
                          avatar: v.avatar,
                          isAi: Boolean(v.is_ai),
                          characterId: v.character_id,
                        })
                      }
                      className="text-xs font-semibold text-emerald-500"
                    >
                      Gọi lại
                    </button>
                    {Boolean(v.is_ai) && (
                      <button
                        onClick={() =>
                          startCall({
                            name: v.name,
                            phone: v.phone,
                            avatar: v.avatar,
                            isAi: true,
                            characterId: v.character_id,
                            isVideo: true,
                          })
                        }
                        className="text-xs font-semibold text-indigo-500"
                      >
                        Video Call AI
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div className="grid grid-cols-5 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1A1A22] py-1.5 shrink-0">
        {[
          { id: 'favorites' as Tab, label: 'Yêu thích', icon: Star },
          { id: 'recents' as Tab, label: 'Gần đây', icon: Clock },
          { id: 'contacts' as Tab, label: 'Danh bạ', icon: Users },
          { id: 'keypad' as Tab, label: 'Bàn phím', icon: Grid },
          { id: 'voicemail' as Tab, label: 'Thư thoại', icon: Voicemail },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
                active ? 'text-emerald-500' : 'text-zinc-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
