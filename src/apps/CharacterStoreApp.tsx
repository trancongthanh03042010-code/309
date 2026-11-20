import React, { useEffect, useState } from 'react';
import {
  Search,
  Heart,
  MessageCircle,
  Phone,
  Plus,
  ArrowLeft,
  Brain,
  Trash2,
  X,
  Calendar,
  Sparkles,
  Shield,
  Video,
  Ban,
  Download,
  Bot,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { Character } from '../types/os';

export function CharacterStoreApp() {
  const { data, appParams, refreshData, openApp, startCall, showToast } = useOS();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'popular'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(appParams.characterId || null);
  const [creating, setCreating] = useState(false);
  const [newMem, setNewMem] = useState('');
  const [newMemType, setNewMemType] = useState<'long_term' | 'short_term' | 'relationship' | 'preference'>('long_term');

  // Create form
  const [cName, setCName] = useState('');
  const [cTagline, setCTagline] = useState('');
  const [cPersonality, setCPersonality] = useState('');
  const [cBio, setCBio] = useState('');
  const [cGreeting, setCGreeting] = useState('');
  const [cVoice, setCVoice] = useState('Kore');

  useEffect(() => {
    if (appParams.characterId) setSelectedId(appParams.characterId);
  }, [appParams.characterId]);

  if (!data) return null;

  const list = data.characters
    .filter((c) => {
      if (filter === 'favorites' && !c.is_favorite) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.tagline.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (filter === 'popular' ? b.interactions_count - a.interactions_count : 0));

  const selected = data.characters.find((c) => c.id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim() || !cPersonality.trim()) return;
    const created = (await osApi.createCharacter({
      name: cName,
      tagline: cTagline || 'Bạn đồng hành Anime AI',
      personality: cPersonality,
      bio: cBio || cPersonality,
      greeting: cGreeting || `Xin chào! Mình là ${cName}. Rất vui được gặp bạn!`,
      voice_name: cVoice,
    })) as Character;
    setCreating(false);
    setCName('');
    setCTagline('');
    setCPersonality('');
    setCBio('');
    setCGreeting('');
    await refreshData();
    setSelectedId(created.id);
    showToast('Đã tạo nhân vật', `${created.name} đã được thêm vào PHONE OS`);
  };

  if (selected) {
    const memories = data.memories.filter((m) => m.character_id === selected.id);
    const schedule = JSON.parse(selected.schedule_json || '[]') as Array<{ time: string; activity: string }>;
    const rel = data.aiRelationships.find((r) => r.character_id === selected.id);
    const charEvents = data.aiEvents.filter((ev) => ev.character_id === selected.id);

    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-xs font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span>Nhân vật</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                await osApi.updateCharacterFull(selected.id, { is_blocked: selected.is_blocked ? 0 : 1 });
                await refreshData();
                showToast('Trạng thái liên hệ AI', selected.is_blocked ? 'Đã bỏ chặn nhân vật' : 'Đã chặn nhân vật');
              }}
              className={`p-2 rounded-xl ${selected.is_blocked ? 'bg-rose-500/20 text-rose-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400'}`}
              title={selected.is_blocked ? 'Bỏ chặn' : 'Chặn nhân vật'}
            >
              <Ban className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await osApi.updateCharacter(selected.id, { is_favorite: selected.is_favorite ? 0 : 1 });
                refreshData();
              }}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Heart className={`w-4 h-4 ${selected.is_favorite ? 'fill-pink-500 text-pink-500' : 'text-zinc-400'}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          <div className="flex flex-col items-center text-center">
            <img src={selected.avatar} alt={selected.name} className="w-28 h-28 rounded-3xl object-cover shadow-xl ring-2 ring-[#A78BFA]/50" />
            <h2 className="font-display text-xl font-bold mt-3">{selected.name}</h2>
            <p className="text-xs text-zinc-500">{selected.role_title || selected.tagline} · {selected.age} tuổi</p>
            <p className="text-[11px] text-[#A78BFA] mt-1">
              {selected.activity_status || 'Đang hoạt động'} · {selected.mood}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center justify-center gap-1">
              <Bot className="w-3 h-3 text-violet-400" />
              Nhân vật AI ảo · Không phải người thật
            </p>

            <div className="grid grid-cols-3 gap-2 mt-4 w-full">
              <button
                onClick={async () => {
                  const conv = (await osApi.createConversation({
                    title: selected.name,
                    is_group: 0,
                    avatar: selected.avatar,
                    character_id: selected.id,
                    members: [selected.id],
                  })) as { id: string };
                  await refreshData();
                  openApp('messages', { conversationId: conv.id });
                }}
                className="py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center justify-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Nhắn tin</span>
              </button>
              <button
                onClick={() =>
                  startCall({
                    name: selected.name,
                    phone: '+81 90-AI-VOICE',
                    avatar: selected.avatar,
                    isAi: true,
                    characterId: selected.id,
                  })
                }
                className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Gọi thoại</span>
              </button>
              <button
                onClick={() =>
                  startCall({
                    name: selected.name,
                    phone: '+81 90-AI-VIDEO',
                    avatar: selected.avatar,
                    isAi: true,
                    isVideo: true,
                    characterId: selected.id,
                  })
                }
                className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video AI</span>
              </button>
            </div>
          </div>

          {/* 7-Metric Relationship Dashboard */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold">Quan hệ: {rel?.stage || `Cấp ${selected.relationship_level}`}</span>
              <button
                onClick={async () => {
                  await osApi.updateRelationship(selected.id, { resetBoundary: true });
                  await refreshData();
                  showToast('Đặt lại ranh giới', 'Mối quan hệ đã quay về trạng thái Bạn bè thoải mái');
                }}
                className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold"
              >
                Đặt lại ranh giới
              </button>
            </div>
            {rel ? (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { label: 'Tình cảm', val: rel.affection, color: 'bg-pink-500' },
                  { label: 'Tin tưởng', val: rel.trust, color: 'bg-emerald-500' },
                  { label: 'Thân quen', val: rel.familiarity, color: 'bg-violet-500' },
                  { label: 'Tôn trọng', val: rel.respect, color: 'bg-sky-500' },
                  { label: 'Ghen tuông', val: rel.jealousy, color: 'bg-amber-500' },
                  { label: 'Xung đột', val: rel.conflict, color: 'bg-rose-500' },
                ].map((m) => (
                  <div key={m.label} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">{m.label}</span>
                      <span className="font-mono-num font-bold">{m.val}/100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div className={`h-full ${m.color}`} style={{ width: `${m.val}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Story & Event Engine */}
          {charEvents.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
              <p className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-fuchsia-500" />
                <span>Cốt truyện & Sự kiện tương tác ({charEvents.length})</span>
              </p>
              {charEvents.map((ev) => {
                const choices = JSON.parse(ev.choices_json || '[]') as Array<{ id: string; label: string }>;
                return (
                  <div key={ev.id} className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-fuchsia-600 dark:text-fuchsia-300">{ev.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 font-semibold">
                        {ev.status === 'available' ? 'Đang mở' : ev.status === 'completed' ? 'Đã chọn' : 'Đã bỏ qua'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300">{ev.summary}</p>
                    {ev.status === 'available' ? (
                      <div className="space-y-1.5 pt-1">
                        {choices.map((ch) => (
                          <button
                            key={ch.id}
                            onClick={async () => {
                              await osApi.chooseAiEvent(ev.id, ch.id);
                              await refreshData();
                              showToast('Cập nhật cốt truyện', 'Lựa chọn của bạn đã tác động tới ký ức & quan hệ!', 'success');
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 hover:border-fuchsia-400 border border-transparent text-[11px] font-medium"
                          >
                            → {ch.label}
                          </button>
                        ))}
                        <button
                          onClick={async () => {
                            await osApi.skipAiEvent(ev.id);
                            await refreshData();
                          }}
                          className="text-[10px] text-zinc-500 underline"
                        >
                          Bỏ qua sự kiện này
                        </button>
                      </div>
                    ) : ev.chosen_option ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        Bạn đã chọn: {ev.chosen_option}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Profile Info & Boundary Controls */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
            <p><span className="font-semibold">Tiểu sử:</span> {selected.bio}</p>
            <p><span className="font-semibold">Tính cách:</span> {selected.personality}</p>
            <p><span className="font-semibold">Xưng hô & Phong cách:</span> {selected.pronouns || 'Mình - Bạn'} · {selected.speaking_style || selected.voice_style}</p>
            <p><span className="font-semibold">Sở thích:</span> {selected.likes}</p>
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <span className="font-semibold flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-emerald-500" /> Ranh giới nội dung</span>
              <select
                value={selected.content_boundary || 'standard'}
                onChange={async (e) => {
                  await osApi.updateCharacterFull(selected.id, { content_boundary: e.target.value });
                  await refreshData();
                }}
                className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
              >
                <option value="standard">Tiêu chuẩn</option>
                <option value="strict">Nghiêm túc / An toàn cao</option>
                <option value="platonic">Thuần túy Bạn bè</option>
              </select>
            </div>
          </div>

          {/* 4 Proactive AI Controls per Character (OS 4.0) */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
            <p className="font-bold">Chủ động tương tác (Cho từng nhân vật)</p>
            {[
              { key: 'proactive_msg_enabled' as const, label: 'Tự nhắn tin hỏi thăm' },
              { key: 'proactive_call_enabled' as const, label: 'Gọi thoại / Video mô phỏng' },
              { key: 'proactive_photo_enabled' as const, label: 'Gửi ảnh khoảnh khắc AI' },
              { key: 'proactive_notif_enabled' as const, label: 'Tạo thông báo nhắc nhở' },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between py-0.5">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={selected[item.key] !== 0}
                  onChange={async (e) => {
                    await osApi.updateCharacterFull(selected.id, { [item.key]: e.target.checked ? 1 : 0 });
                    await refreshData();
                    showToast('AI Chủ động', `Đã cập nhật "${item.label}" cho ${selected.name}`);
                  }}
                />
              </label>
            ))}
          </div>

          {/* Daily Life Schedule */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
            <p className="font-semibold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-pink-500" />
              <span>Lịch sinh hoạt hàng ngày</span>
            </p>
            {schedule.map((s, idx) => (
              <div key={idx} className="flex justify-between text-[11px] py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <span className="font-mono-num text-[#A78BFA]">{s.time}</span>
                <span>{s.activity}</span>
              </div>
            ))}
          </div>

          {/* AI Memory Manager */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-semibold flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-[#A78BFA]" />
                <span>Bộ nhớ AI ({memories.length})</span>
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/os4/characters/${selected.id}/export-memories`}
                  className="text-[11px] text-emerald-500 font-bold flex items-center gap-0.5"
                >
                  <Download className="w-3 h-3" /> Xuất JSON
                </a>
                <button
                  onClick={async () => {
                    const res = await osApi.summarizeCharacter(selected.id);
                    await refreshData();
                    showToast('Tóm tắt hội thoại', res.summary, 'success');
                  }}
                  className="text-[11px] text-[#A78BFA] font-bold"
                >
                  + Tóm tắt chat
                </button>
              </div>
            </div>
            <div className="flex gap-1.5">
              <select
                value={newMemType}
                onChange={(e) => setNewMemType(e.target.value as typeof newMemType)}
                className="px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none text-[11px]"
              >
                <option value="long_term">Dài hạn</option>
                <option value="short_term">Ngắn hạn</option>
                <option value="relationship">Quan hệ</option>
                <option value="preference">Sở thích</option>
              </select>
              <input
                value={newMem}
                onChange={(e) => setNewMem(e.target.value)}
                placeholder="Thêm ký ức mới..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
              />
              <button
                onClick={async () => {
                  if (!newMem.trim()) return;
                  await osApi.addCharacterMemory(selected.id, { content: newMem.trim(), memory_type: newMemType });
                  setNewMem('');
                  refreshData();
                }}
                className="px-3 py-1.5 rounded-xl bg-[#A78BFA] text-white font-semibold"
              >
                Thêm
              </button>
            </div>
            {memories.map((m) => (
              <div key={m.id} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-[#A78BFA] block">{m.memory_type}</span>
                  <span>{m.content}</span>
                </div>
                <button
                  onClick={async () => {
                    await osApi.deleteCharacterMemory(m.id);
                    refreshData();
                  }}
                  className="text-zinc-400 hover:text-rose-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold">Cửa hàng Nhân vật</h1>
            <p className="text-[11px] text-zinc-500">Hệ sinh thái Anime AI (Gemini)</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-xl bg-fuchsia-600 text-white text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo mới</span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhân vật anime..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>

        <div className="flex gap-1.5 text-[11px]">
          {([
            { id: 'all', label: 'Tất cả' },
            { id: 'popular', label: 'Phổ biến' },
            { id: 'favorites', label: 'Yêu thích' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-lg font-medium ${
                filter === f.id ? 'bg-fuchsia-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 content-start">
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left hover:border-fuchsia-400 transition-colors"
          >
            <img src={c.avatar} alt={c.name} className="w-full aspect-[4/3] object-cover object-top" />
            <div className="p-2.5 space-y-1">
              <p className="text-xs font-bold truncate">{c.name}</p>
              <p className="text-[10px] text-zinc-500 line-clamp-2">{c.tagline}</p>
              <div className="flex items-center justify-between pt-1 text-[10px] text-[#A78BFA] font-mono-num">
                <span>Cấp {c.relationship_level}</span>
                <span>{c.interactions_count} lượt chat</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {creating && (
        <div className="absolute inset-0 z-40 bg-black/65 flex items-end p-3">
          <form onSubmit={handleCreate} className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Tạo nhân vật AI</h3>
              <button type="button" onClick={() => setCreating(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input required value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Tên nhân vật" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
            <input value={cTagline} onChange={(e) => setCTagline(e.target.value)} placeholder="Mô tả ngắn" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
            <textarea required rows={2} value={cPersonality} onChange={(e) => setCPersonality(e.target.value)} placeholder="Tính cách & phong cách nói chuyện" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none" />
            <input value={cGreeting} onChange={(e) => setCGreeting(e.target.value)} placeholder="Lời chào đầu tiên" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
            <select value={cVoice} onChange={(e) => setCVoice(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none">
              {['Kore', 'Zephyr', 'Puck', 'Fenrir', 'Charon'].map((v) => (
                <option key={v} value={v}>Giọng đọc AI: {v}</option>
              ))}
            </select>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold">
              Tạo & Thêm vào OS
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
