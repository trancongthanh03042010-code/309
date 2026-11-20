import React, { useState } from 'react';
import { Plus, CheckCircle2, Circle, Trash2, Search, X } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

const LISTS = [
  { id: 'All', label: 'Tất cả' },
  { id: 'Cá nhân', label: 'Cá nhân' },
  { id: 'Công việc', label: 'Công việc' },
  { id: 'Mua sắm', label: 'Mua sắm' },
  { id: 'Học tập', label: 'Học tập' },
  { id: 'Sự kiện', label: 'Sự kiện' },
];

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
};

export function RemindersApp() {
  const { data, refreshData, triggerShortcutEvent, showToast } = useOS();
  const [listFilter, setListFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [listName, setListName] = useState('Cá nhân');

  if (!data) return null;

  const filtered = data.reminders.filter((r) => {
    const matchList = listFilter === 'All' || r.list_name === listFilter;
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
    return matchList && matchSearch;
  });

  const handleToggle = async (id: string, current: number, itemTitle: string) => {
    const next = current ? 0 : 1;
    await osApi.updateReminder(id, { is_completed: next });
    await refreshData();
    if (next === 1) {
      await triggerShortcutEvent('reminder_completed', itemTitle);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await osApi.createReminder({ title, due_date: dueDate, priority, list_name: listName });
    setAdding(false);
    setTitle('');
    await refreshData();
    showToast('Đã thêm lời nhắc', 'Đã lưu vào Lời nhắc');
  };

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">Lời nhắc</h1>
          <button onClick={() => setAdding(true)} className="p-2 rounded-xl bg-orange-500 text-white">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm việc cần làm..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {LISTS.map((l) => (
            <button
              key={l.id}
              onClick={() => setListFilter(l.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                listFilter === l.id ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-14">Không có lời nhắc nào trong danh sách này.</p>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2"
            >
              <button
                onClick={() => handleToggle(r.id, r.is_completed, r.title)}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
              >
                {r.is_completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-zinc-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${r.is_completed ? 'line-through text-zinc-400' : ''}`}>
                    {r.title}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {r.list_name} · {PRIORITY_LABELS[r.priority] || r.priority} · {r.due_date || 'Không có hạn'}
                  </p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await osApi.deleteReminder(r.id);
                  refreshData();
                }}
                className="p-1.5 text-zinc-400 hover:text-rose-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {adding && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end p-3">
          <form onSubmit={handleAdd} className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Lời nhắc mới</h3>
              <button type="button" onClick={() => setAdding(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bạn cần ghi nhớ điều gì?"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-2 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
              <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')} className="px-2 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none">
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
              </select>
              <select value={listName} onChange={(e) => setListName(e.target.value)} className="px-2 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none">
                {LISTS.filter((l) => l.id !== 'All').map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-semibold">
              Thêm lời nhắc
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
