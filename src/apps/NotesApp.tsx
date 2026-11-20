import React, { useEffect, useState } from 'react';
import { Plus, Search, Pin, Lock, Trash2, ArrowLeft, Share2, RotateCcw, BellRing, Copy } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { NoteItem } from '../types/os';

export function NotesApp() {
  const { data, appParams, refreshData, openShareSheet, showToast, requestConfirm, addClipboardEntry } = useOS();
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('All');
  const [activeNote, setActiveNote] = useState<NoteItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (appParams.noteId && data) {
      const found = data.notes.find((n) => n.id === appParams.noteId);
      if (found) {
        setActiveNote(found);
        const savedDraft = localStorage.getItem(`phoneos_draft_note_${found.id}`);
        if (savedDraft) {
          try {
            const parsed = JSON.parse(savedDraft) as { title?: string; content?: string };
            setTitle(parsed.title ?? found.title);
            setContent(parsed.content ?? found.content);
            return;
          } catch {
            // fallback
          }
        }
        setTitle(found.title);
        setContent(found.content);
      }
    }
  }, [appParams.noteId, data]);

  useEffect(() => {
    if (!activeNote) return;
    try {
      localStorage.setItem(`phoneos_draft_note_${activeNote.id}`, JSON.stringify({ title, content }));
    } catch {
      // ignore
    }
  }, [activeNote, title, content]);

  if (!data) return null;

  const list = data.notes.filter((n) => {
    if (folder === 'Trash') return n.is_deleted === 1;
    if (n.is_deleted === 1) return false;
    if (folder !== 'All' && n.folder !== folder) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const FOLDERS = [
    { id: 'All', label: 'Tất cả' },
    { id: 'Cá nhân', label: 'Cá nhân' },
    { id: 'Công việc', label: 'Công việc' },
    { id: 'Trash', label: 'Thùng rác' },
  ];

  const handleSave = async () => {
    if (!activeNote) return;
    await osApi.updateNote(activeNote.id, { title: title || 'Không có tiêu đề', content });
    localStorage.removeItem(`phoneos_draft_note_${activeNote.id}`);
    await refreshData();
    showToast('Đã lưu', 'Đã cập nhật ghi chú');
  };

  const handleNew = async () => {
    const created = (await osApi.createNote({
      title: 'Ghi chú mới',
      content: '',
      folder: folder === 'All' || folder === 'Trash' ? 'Cá nhân' : folder,
    })) as NoteItem;
    await refreshData();
    setActiveNote(created);
    setTitle(created.title);
    setContent(created.content);
  };

  if (activeNote) {
    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button
            onClick={async () => {
              await handleSave();
              setActiveNote(null);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-500"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ghi chú</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                await osApi.updateNote(activeNote.id, { is_pinned: activeNote.is_pinned ? 0 : 1 });
                setActiveNote({ ...activeNote, is_pinned: activeNote.is_pinned ? 0 : 1 });
                refreshData();
              }}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Pin className={`w-4 h-4 ${activeNote.is_pinned ? 'text-amber-500' : 'text-zinc-400'}`} />
            </button>
            <button
              onClick={() => openShareSheet({ title, text: `${title}\n\n${content}` })}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button onClick={handleSave} className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold">
              Lưu
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề ghi chú..."
            className="text-lg font-display font-bold bg-transparent outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
            <button
              onClick={() => setContent((c) => `${c}\n- [ ] `)}
              className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800"
            >
              + Ô đánh dấu
            </button>
            <button
              onClick={() => setContent((c) => `${c}\n• `)}
              className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800"
            >
              + Gạch đầu dòng
            </button>
            <button
              onClick={async () => {
                await osApi.createReminder({
                  title: title || 'Nhắc việc từ Ghi chú',
                  notes: content.slice(0, 140),
                  due_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                  priority: 'medium',
                });
                await refreshData();
                showToast('Đã tạo nhắc việc', 'Đã thêm vào ứng dụng Nhắc nhở (+1 giờ)', 'success');
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium"
            >
              <BellRing className="w-3 h-3" /> Tạo nhắc việc
            </button>
            <button
              onClick={() => {
                const full = `${title}\n\n${content}`.trim();
                addClipboardEntry(full);
                navigator.clipboard?.writeText(full).catch(() => {});
                showToast('Đã sao chép', 'Đã lưu vào bộ nhớ tạm OS', 'success');
              }}
              className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> Sao chép
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Bắt đầu viết..."
            className="flex-1 bg-transparent text-xs leading-relaxed outline-none resize-none os-scroll"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">Ghi chú</h1>
          <button onClick={handleNew} className="p-2 rounded-xl bg-amber-500 text-white">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm ghi chú..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                folder === f.id ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {list.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-14">Chưa có ghi chú nào.</p>
        ) : (
          list.map((n) => (
            <div
              key={n.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2"
            >
              <button
                onClick={() => {
                  setActiveNote(n);
                  setTitle(n.title);
                  setContent(n.content);
                }}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5">
                  {n.is_pinned === 1 && <Pin className="w-3 h-3 text-amber-500 shrink-0" />}
                  {n.is_locked === 1 && <Lock className="w-3 h-3 text-zinc-400 shrink-0" />}
                  <p className="text-sm font-semibold truncate">{n.title}</p>
                </div>
                <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">{n.content || 'Ghi chú trống'}</p>
              </button>
              <div className="flex items-center gap-1">
                {n.is_deleted === 1 && (
                  <button
                    onClick={async () => {
                      await osApi.updateNote(n.id, { is_deleted: 0 });
                      refreshData();
                    }}
                    className="p-1.5 text-emerald-500"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (n.is_deleted) {
                      requestConfirm({
                        title: 'Xóa vĩnh viễn?',
                        message: 'Xóa vĩnh viễn ghi chú này?',
                        destructive: true,
                        onConfirm: async () => {
                          await osApi.deleteNote(n.id);
                          refreshData();
                        },
                      });
                    } else {
                      osApi.updateNote(n.id, { is_deleted: 1 }).then(refreshData);
                    }
                  }}
                  className="p-1.5 text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
