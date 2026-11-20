import React, { useMemo, useState } from 'react';
import { Plus, MapPin, Trash2, X, Calendar as CalIcon } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

export function CalendarApp() {
  const { data, refreshData, openApp, showToast, requestConfirm } = useOS();
  const [view, setView] = useState<'month' | 'agenda'>('agenda');
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [timeStr, setTimeStr] = useState('14:00');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#A78BFA');

  const monthDays = useMemo(() => {
    const base = new Date(selectedDay + 'T00:00:00');
    const year = base.getFullYear();
    const month = base.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const m = String(month + 1).padStart(2, '0');
      return `${year}-${m}-${d}`;
    });
  }, [selectedDay]);

  if (!data) return null;

  const visibleEvents =
    view === 'month'
      ? data.events.filter((e) => e.start_iso.startsWith(selectedDay))
      : data.events;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await osApi.createEvent({
      title,
      start_iso: `${dateStr}T${timeStr}:00`,
      end_iso: `${dateStr}T${timeStr}:00`,
      location,
      color,
    });
    setAdding(false);
    setTitle('');
    setLocation('');
    await refreshData();
    showToast('Đã thêm sự kiện', 'Đã lưu vào Lịch');
  };

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-bold">Lịch</h1>
          <p className="text-[11px] text-zinc-500">{new Date(selectedDay).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl text-[11px]">
            <button
              onClick={() => setView('agenda')}
              className={`px-2.5 py-1 rounded-lg ${view === 'agenda' ? 'bg-white dark:bg-[#1A1A22] font-semibold' : 'text-zinc-500'}`}
            >
              Lịch trình
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-2.5 py-1 rounded-lg ${view === 'month' ? 'bg-white dark:bg-[#1A1A22] font-semibold' : 'text-zinc-500'}`}
            >
              Tháng
            </button>
          </div>
          <button onClick={() => setAdding(true)} className="p-2 rounded-xl bg-rose-500 text-white">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === 'month' && (
        <div className="p-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-7 gap-1 text-center text-xs">
          {monthDays.map((iso) => {
            const hasEvent = data.events.some((e) => e.start_iso.startsWith(iso));
            const active = iso === selectedDay;
            return (
              <button
                key={iso}
                onClick={() => setSelectedDay(iso)}
                className={`py-1.5 rounded-xl flex flex-col items-center font-mono-num ${
                  active ? 'bg-rose-500 text-white font-bold' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>{Number(iso.slice(-2))}</span>
                {hasEvent && <span className={`w-1 h-1 rounded-full mt-0.5 ${active ? 'bg-white' : 'bg-rose-500'}`} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2.5">
        {visibleEvents.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 py-14">
            <CalIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Chưa có sự kiện nào được lên lịch.</p>
          </div>
        ) : (
          visibleEvents.map((ev) => (
            <div
              key={ev.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: ev.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{ev.title}</p>
                  <p className="text-[11px] text-zinc-500 font-mono-num mt-0.5">
                    {ev.start_iso.slice(0, 10)} {ev.all_day ? '· Cả ngày' : `· ${ev.start_iso.slice(11, 16)}`}
                  </p>
                  {ev.location && (
                    <button
                      onClick={() => openApp('maps', { mapQuery: ev.location })}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-teal-500 hover:underline"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{ev.location}</span>
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  requestConfirm({
                    title: 'Xóa sự kiện?',
                    message: `Xóa "${ev.title}" khỏi Lịch?`,
                    destructive: true,
                    onConfirm: async () => {
                      await osApi.deleteEvent(ev.id);
                      refreshData();
                    },
                  })
                }
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
              <h3 className="text-sm font-bold">Sự kiện mới</h3>
              <button type="button" onClick={() => setAdding(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên sự kiện"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
              <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Địa điểm (mở trong Bản đồ)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <div className="flex items-center gap-2">
              {['#A78BFA', '#F472B6', '#10B981', '#F59E0B', '#3B82F6'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-zinc-400' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-rose-500 text-white font-semibold">
              Lưu sự kiện
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
