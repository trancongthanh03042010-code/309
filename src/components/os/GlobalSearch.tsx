import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  MessageCircle,
  FileText,
  Calendar,
  User,
  Folder,
  Image,
  Podcast,
  ShoppingBag,
  UtensilsCrossed,
  FileSpreadsheet,
  Users,
  Cpu,
  PlaySquare,
  Clapperboard,
  Disc3,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { AppIconTile } from '../../services/appIcons';

export function GlobalSearch() {
  const { data, globalSearchOpen, setGlobalSearchOpen, openApp } = useOS();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!data || !query.trim()) return null;
    const q = query.toLowerCase();
    return {
      apps: data.apps.filter((a) => a.installed && !a.hidden && a.name.toLowerCase().includes(q)).slice(0, 8),
      characters: data.characters.filter((c) => c.name.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q)).slice(0, 4),
      contacts: data.contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 4),
      messages: data.messages.filter((m) => m.content.toLowerCase().includes(q)).slice(0, 4),
      notes: data.notes.filter((n) => !n.is_deleted && (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))).slice(0, 4),
      events: data.events.filter((e) => e.title.toLowerCase().includes(q)).slice(0, 4),
      media: data.media.filter((m) => !m.is_deleted && m.title.toLowerCase().includes(q)).slice(0, 4),
      files: data.files.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 4),
      podcasts: data.podcasts.filter((p) => p.title.toLowerCase().includes(q) || p.host.toLowerCase().includes(q)).slice(0, 3),
      products: data.shoppingProducts.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, 3),
      restaurants: data.foodRestaurants.filter((r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q)).slice(0, 3),
      office: data.officeDocs.filter((d) => d.title.toLowerCase().includes(q)).slice(0, 3),
      community: data.communityPosts.filter((p) => !p.is_hidden && (p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))).slice(0, 3),
      smartDevices: data.smartDevices.filter((d) => d.name.toLowerCase().includes(q) || d.room.toLowerCase().includes(q)).slice(0, 3),
      youtube: (data.youtubeLibrary || []).filter((y) => y.title.toLowerCase().includes(q) || y.channel_title.toLowerCase().includes(q)).slice(0, 3),
      movies: (data.movieWatchlist || []).filter((m) => m.title.toLowerCase().includes(q)).slice(0, 3),
      playlists: (data.musicPlaylists || []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 3),
    };
  }, [data, query]);

  if (!globalSearchOpen || !data) return null;

  return (
    <div
      onClick={() => setGlobalSearchOpen(false)}
      className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl p-4 flex flex-col text-white"
    >
      <div onClick={(e) => e.stopPropagation()} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/15 border border-white/20">
          <Search className="w-4 h-4 text-white/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm ứng dụng, AI, tin nhắn, podcast, sản phẩm, tài liệu..."
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/50"
          />
          <button onClick={() => setGlobalSearchOpen(false)} className="p-1 text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll mt-4 space-y-4">
          {!query.trim() ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-white/60">Ứng dụng gợi ý</p>
              <div className="grid grid-cols-4 gap-3">
                {data.apps.filter((a) => a.installed && !a.hidden).slice(0, 12).map((app) => (
                  <button
                    key={app.app_id}
                    onClick={() => openApp(app.app_id)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <AppIconTile appId={app.app_id} size="sm" />
                    <span className="text-[11px] truncate w-full text-center">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {results && results.apps.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/50 mb-2">Ứng dụng</p>
                  <div className="grid grid-cols-4 gap-2">
                    {results.apps.map((a) => (
                      <button
                        key={a.app_id}
                        onClick={() => openApp(a.app_id)}
                        className="p-2 rounded-2xl bg-white/10 flex flex-col items-center gap-1 hover:bg-white/15"
                      >
                        <AppIconTile appId={a.app_id} size="sm" />
                        <span className="text-[10px] truncate w-full text-center">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results && results.characters.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Nhân vật AI</p>
                  {results.characters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openApp('characters', { characterId: c.id })}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-3 text-left hover:bg-white/15"
                    >
                      <img src={c.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-white/60 truncate">{c.tagline}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results && results.messages.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Tin nhắn</p>
                  {results.messages.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openApp('messages', { conversationId: m.conversation_id })}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <MessageCircle className="w-4 h-4 text-purple-300 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{m.sender_name}</p>
                        <p className="text-[11px] text-white/70 truncate">{m.content}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results && results.podcasts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Podcast</p>
                  {results.podcasts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openApp('podcast')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Podcast className="w-4 h-4 text-violet-300 shrink-0" />
                      <span className="text-xs truncate">{p.title} · {p.host}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.products.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Mua sắm</p>
                  {results.products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openApp('shopping')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <ShoppingBag className="w-4 h-4 text-orange-300 shrink-0" />
                      <span className="text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.restaurants.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Đặt đồ ăn</p>
                  {results.restaurants.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => openApp('food')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <UtensilsCrossed className="w-4 h-4 text-rose-300 shrink-0" />
                      <span className="text-xs truncate">{r.name} · {r.cuisine}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.office.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Tài liệu Văn phòng</p>
                  {results.office.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openApp('office')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-300 shrink-0" />
                      <span className="text-xs truncate">{d.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.community.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Cộng đồng</p>
                  {results.community.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openApp('community')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Users className="w-4 h-4 text-indigo-300 shrink-0" />
                      <span className="text-xs truncate">{p.title || p.content}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.smartDevices.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Nhà thông minh</p>
                  {results.smartDevices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openApp('smarthome')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Cpu className="w-4 h-4 text-teal-300 shrink-0" />
                      <span className="text-xs truncate">{d.name} · {d.room}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.notes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Ghi chú</p>
                  {results.notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openApp('notes', { noteId: n.id })}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <FileText className="w-4 h-4 text-amber-300 shrink-0" />
                      <span className="text-xs truncate">{n.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.events.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Lịch</p>
                  {results.events.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => openApp('calendar')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Calendar className="w-4 h-4 text-rose-300 shrink-0" />
                      <span className="text-xs truncate">{ev.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.contacts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Danh bạ</p>
                  {results.contacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openApp('contacts', { contactId: c.id })}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <User className="w-4 h-4 text-sky-300 shrink-0" />
                      <span className="text-xs truncate">{c.name} · {c.phone}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.media.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Ảnh</p>
                  {results.media.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openApp('photos')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Image className="w-4 h-4 text-pink-300 shrink-0" />
                      <span className="text-xs truncate">{m.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.files.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Tệp</p>
                  {results.files.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openApp('files')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Folder className="w-4 h-4 text-cyan-300 shrink-0" />
                      <span className="text-xs truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results && results.youtube.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">YouTube đã lưu</p>
                  {results.youtube.map((y) => (
                    <button
                      key={y.id}
                      onClick={() => openApp('youtube')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <PlaySquare className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-xs truncate">{y.title} · {y.channel_title}</span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.movies.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Trung tâm Phim</p>
                  {results.movies.map((m) => (
                    <button
                      key={m.movie_id}
                      onClick={() => openApp('movies')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Clapperboard className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs truncate">
                        {m.title} {m.user_rating ? `· ${m.user_rating}★` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results && results.playlists.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/50">Music Hub Playlist</p>
                  {results.playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => openApp('musichub')}
                      className="w-full p-2.5 rounded-2xl bg-white/10 flex items-center gap-2.5 text-left hover:bg-white/15"
                    >
                      <Disc3 className="w-4 h-4 text-fuchsia-400 shrink-0" />
                      <span className="text-xs truncate">{pl.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
