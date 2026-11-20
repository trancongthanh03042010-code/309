import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Star,
  Phone,
  MessageCircle,
  Edit3,
  Trash2,
  Download,
  Share2,
  ArrowLeft,
  X,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { Contact } from '../types/os';

export function ContactsApp() {
  const { data, appParams, refreshData, startCall, openApp, openShareSheet, showToast, requestConfirm } = useOS();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(appParams.contactId || null);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const groups = useMemo(() => {
    const set = new Set(['All']);
    data?.contacts.forEach((c) => set.add(c.group_name || 'Chung'));
    return Array.from(set);
  }, [data?.contacts]);

  if (!data) return null;

  const filtered = data.contacts.filter((c) => {
    const matchGroup = groupFilter === 'All' || c.group_name === groupFilter;
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    return matchGroup && matchSearch;
  });

  const selected = data.contacts.find((c) => c.id === selectedId) || null;

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name || !editing?.phone) return;
    if (editing.id) {
      await osApi.updateContact(editing.id, editing);
      showToast('Đã cập nhật', 'Đã lưu liên hệ');
    } else {
      const created = (await osApi.createContact(editing)) as Contact;
      setSelectedId(created.id);
      showToast('Đã thêm', 'Đã thêm liên hệ mới');
    }
    setEditing(null);
    await refreshData();
  };

  const handleExportAll = () => {
    const blob = new Blob([JSON.stringify(data.contacts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phone_os_contacts.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất dữ liệu', 'Đã xuất danh bạ ra tệp JSON');
  };

  if (selected) {
    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-xs font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span>Danh bạ</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                await osApi.updateContact(selected.id, { is_favorite: selected.is_favorite ? 0 : 1 });
                refreshData();
              }}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Star className={`w-4 h-4 ${selected.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'}`} />
            </button>
            <button
              onClick={() => setEditing(selected)}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() =>
                openShareSheet({
                  title: `Liên hệ: ${selected.name}`,
                  text: `${selected.name} · ${selected.phone} · ${selected.email}`,
                  mediaType: 'contact',
                })
              }
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          <div className="flex flex-col items-center text-center">
            <img
              src={selected.avatar || '/src/assets/images/char_akira_1794880089961.jpg'}
              alt={selected.name}
              className="w-24 h-24 rounded-full object-cover ring-4 ring-amber-400/30"
            />
            <h2 className="font-display text-xl font-bold mt-3">{selected.name}</h2>
            <p className="text-xs text-zinc-500">
              {selected.role || selected.group_name} {selected.company ? `· ${selected.company}` : ''}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() =>
                  startCall({
                    name: selected.name,
                    phone: selected.phone,
                    avatar: selected.avatar,
                    isAi: Boolean(selected.is_ai),
                    characterId: selected.character_id,
                  })
                }
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Gọi điện</span>
              </button>
              <button
                onClick={() => openApp('messages', { characterId: selected.character_id })}
                className="px-4 py-2 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Nhắn tin</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            {[
              ['Số điện thoại', selected.phone],
              ['Email', selected.email || '—'],
              ['Sinh nhật', selected.birthday || '—'],
              ['Địa chỉ', selected.address || '—'],
              ['Công ty', selected.company || '—'],
              ['Ghi chú', selected.notes || '—'],
            ].map(([label, val]) => (
              <div key={label} className="p-3 flex justify-between gap-4">
                <span className="text-zinc-500">{label}</span>
                <span className="text-right font-medium">{val}</span>
              </div>
            ))}
          </div>

          {!selected.is_ai && (
            <button
              onClick={() =>
                requestConfirm({
                  title: `Xóa ${selected.name}?`,
                  message: 'Liên hệ này sẽ bị xóa vĩnh viễn.',
                  destructive: true,
                  onConfirm: async () => {
                    await osApi.deleteContact(selected.id);
                    setSelectedId(null);
                    refreshData();
                  },
                })
              }
              className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa liên hệ</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">Danh bạ</h1>
          <div className="flex items-center gap-1.5">
            <button onClick={handleExportAll} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800" title="Xuất JSON">
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setEditing({ name: '', phone: '', email: '', group_name: 'Chung' })}
              className="p-2 rounded-xl bg-amber-500 text-white"
              title="Thêm liên hệ"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, số điện thoại, email..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pb-1">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                groupFilter === g ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {g === 'All' ? 'Tất cả' : g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="w-full p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-left"
          >
            <img
              src={c.avatar || '/src/assets/images/char_rin_1794880090553.jpg'}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              <p className="text-[11px] text-zinc-500 font-mono-num truncate">{c.phone}</p>
            </div>
            {c.is_ai === 1 && <span className="text-[10px] font-semibold text-[#A78BFA]">AI</span>}
          </button>
        ))}
      </div>

      {editing && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end p-3">
          <form
            onSubmit={handleSaveContact}
            className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{editing.id ? 'Sửa liên hệ' : 'Liên hệ mới'}</h3>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Họ và tên"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <input
              required
              value={editing.phone || ''}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              placeholder="Số điện thoại"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <input
              value={editing.email || ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              placeholder="Email"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <input
              value={editing.company || ''}
              onChange={(e) => setEditing({ ...editing, company: e.target.value })}
              placeholder="Công ty / Nhóm"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold">
              Lưu liên hệ
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
