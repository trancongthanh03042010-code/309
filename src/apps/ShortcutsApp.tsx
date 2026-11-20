import React, { useState } from 'react';
import { Play, Plus, Trash2, Zap, X } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

const TRIGGERS = [
  { id: 'photo_captured', label: 'Khi chụp ảnh mới trong Máy ảnh' },
  { id: 'reminder_completed', label: 'Khi đánh dấu hoàn thành một Lời nhắc' },
  { id: 'bedtime_toggle', label: 'Kích hoạt thủ công / Giờ đi ngủ' },
];

const ACTIONS = [
  { id: 'notify', label: 'Hiển thị thông báo hệ thống' },
  { id: 'set_dnd', label: 'Bật chế độ Không làm phiền' },
  { id: 'log_calendar', label: 'Ghi sự kiện vào Lịch' },
];

const TRIGGER_SHORT: Record<string, string> = {
  photo_captured: 'Chụp ảnh',
  reminder_completed: 'Xong lời nhắc',
  bedtime_toggle: 'Giờ đi ngủ',
};

const ACTION_SHORT: Record<string, string> = {
  notify: 'Thông báo',
  set_dnd: 'Không làm phiền',
  log_calendar: 'Ghi Lịch',
};

export function ShortcutsApp() {
  const { data, refreshData, triggerShortcutEvent, showToast, requestConfirm } = useOS();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('photo_captured');
  const [actionType, setActionType] = useState('notify');
  const [noteText, setNoteText] = useState('Tự động hóa đã chạy thành công!');

  const shortcuts = data?.shortcuts || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await osApi.createShortcut({
      name: name.trim(),
      trigger_event: triggerEvent,
      action_type: actionType,
      action_payload: { title: name.trim(), body: noteText.trim() },
      enabled: 1,
    });
    setName('');
    setShowAdd(false);
    await refreshData();
    showToast('Phím tắt', 'Đã tạo quy tắc tự động hóa.', 'success');
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold font-display">Phím tắt</h1>
          <p className="text-[11px] text-zinc-500">Tự động hóa sự kiện OS & Tác vụ liên ứng dụng</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Quy tắc mới
        </button>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3">
        {shortcuts.map((sc) => (
          <div
            key={sc.id}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#A78BFA]/15 text-[#A78BFA] flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">{sc.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    Khi: {TRIGGER_SHORT[sc.trigger_event] || sc.trigger_event} → {ACTION_SHORT[sc.action_type] || sc.action_type}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sc.enabled === 1}
                  onChange={async (e) => {
                    await osApi.updateShortcut(sc.id, { enabled: e.target.checked ? 1 : 0 });
                    refreshData();
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:bg-[#A78BFA] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-500">
              <span>
                Đã chạy: <strong className="font-mono-num">{sc.run_count}</strong>
                {sc.last_run ? ` · Lần cuối: ${new Date(sc.last_run).toLocaleTimeString('vi-VN')}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => triggerShortcutEvent(sc.trigger_event, `Chạy thủ công: ${sc.name}`)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 font-semibold flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Chạy thử
                </button>
                <button
                  onClick={() =>
                    requestConfirm({
                      title: 'Xóa Phím tắt?',
                      message: `Xóa "${sc.name}"?`,
                      destructive: true,
                      onConfirm: async () => {
                        await osApi.deleteShortcut(sc.id);
                        refreshData();
                      },
                    })
                  }
                  className="p-1 text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-end p-3">
          <form onSubmit={handleAdd} className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Tạo quy tắc tự động hóa</h3>
              <button type="button" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên phím tắt"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-500">Khi sự kiện xảy ra</label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs"
              >
                {TRIGGERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-500">Thực hiện hành động</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs"
              >
                {ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            {actionType === 'notify' && (
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Nội dung thông báo"
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
              />
            )}
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold">
              Lưu phím tắt
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
