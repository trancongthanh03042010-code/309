import React, { useEffect, useState } from 'react';
import {
  Inbox,
  Send,
  Star,
  Trash2,
  Plus,
  ArrowLeft,
  Paperclip,
  Download,
  Sparkles,
  CheckSquare,
  X,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { EmailItem } from '../types/os';

export function MailApp() {
  const { data, refreshData, showToast, openApp } = useOS();
  const [folder, setFolder] = useState<'inbox' | 'sent' | 'starred' | 'trash'>('inbox');
  const [selected, setSelected] = useState<EmailItem | null>(null);
  const [composing, setComposing] = useState(false);
  const [toEmail, setToEmail] = useState(() => localStorage.getItem('phoneos_draft_mail_to') || '');
  const [subject, setSubject] = useState(() => localStorage.getItem('phoneos_draft_mail_sub') || '');
  const [body, setBody] = useState(() => localStorage.getItem('phoneos_draft_mail_body') || '');
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('phoneos_draft_mail_to', toEmail);
    localStorage.setItem('phoneos_draft_mail_sub', subject);
    localStorage.setItem('phoneos_draft_mail_body', body);
  }, [toEmail, subject, body]);

  if (!data) return null;

  const list = data.emails.filter((e) => {
    if (folder === 'starred') return e.is_starred === 1 && e.folder !== 'trash';
    return e.folder === folder;
  });

  const handleOpenMail = async (mail: EmailItem) => {
    setSelected(mail);
    setSummary(null);
    if (!mail.is_read) {
      await osApi.updateEmail(mail.id, { is_read: 1 });
      refreshData();
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toEmail.trim() || !subject.trim()) return;
    await osApi.createEmail({ folder: 'sent', to_email: toEmail, subject, body });
    setComposing(false);
    setToEmail('');
    setSubject('');
    setBody('');
    localStorage.removeItem('phoneos_draft_mail_to');
    localStorage.removeItem('phoneos_draft_mail_sub');
    localStorage.removeItem('phoneos_draft_mail_body');
    await refreshData();
    showToast('Đã gửi', 'Đã gửi qua hộp thư nội bộ PHONE OS');
  };

  const handleDownloadAttachment = async (mail: EmailItem) => {
    if (!mail.attachment_name) return;
    await osApi.createFile({
      name: mail.attachment_name,
      folder: 'Tải xuống',
      mime_type: 'text/plain',
      size_bytes: mail.attachment_content.length,
      content_text: mail.attachment_content,
    });
    await refreshData();
    showToast('Đã lưu vào Tệp', `${mail.attachment_name} đã được lưu vào thư mục Tải xuống`);
  };

  const handleCreateReminderFromMail = async (mail: EmailItem) => {
    await osApi.createReminder({
      title: `Theo dõi: ${mail.subject}`,
      notes: `Từ ${mail.from_name}`,
      due_date: new Date().toISOString().slice(0, 10),
      priority: 'high',
      list_name: 'Công việc',
    });
    await refreshData();
    showToast('Đã tạo lời nhắc', 'Đã thêm việc cần làm vào Lời nhắc');
  };

  if (selected) {
    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                const res = await osApi.assistant(`Tóm tắt email này bằng tiếng Việt thành 2 gạch đầu dòng ngắn: Tiêu đề: ${selected.subject}\nNội dung: ${selected.body}`);
                setSummary(res.answer);
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-500 text-[11px] font-semibold flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI Tóm tắt</span>
            </button>
            <button
              onClick={() => handleCreateReminderFromMail(selected)}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Tạo lời nhắc"
            >
              <CheckSquare className="w-4 h-4 text-amber-500" />
            </button>
            <button
              onClick={async () => {
                await osApi.updateEmail(selected.id, { folder: 'trash' });
                setSelected(null);
                refreshData();
              }}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-rose-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          <div>
            <h2 className="font-display text-base font-bold">{selected.subject}</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Từ: {selected.from_name} ({selected.from_email})
            </p>
            <p className="text-[11px] text-zinc-400">Đến: {selected.to_email}</p>
          </div>

          {summary && (
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
              <p className="font-semibold text-indigo-500 mb-1">Tóm tắt AI</p>
              <p className="whitespace-pre-wrap">{summary}</p>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs leading-relaxed whitespace-pre-wrap">
            {selected.body}
          </div>

          {selected.attachment_name && (
            <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Paperclip className="w-4 h-4 text-blue-500" />
                <span className="font-medium">{selected.attachment_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadAttachment(selected)}
                  className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Lưu vào Tệp</span>
                </button>
                <button onClick={() => openApp('files')} className="text-xs text-blue-500 underline">
                  Mở Tệp
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold">Thư điện tử</h1>
            <p className="text-[10px] text-zinc-500">Hộp thư nội bộ hệ sinh thái (Mô phỏng)</p>
          </div>
          <button
            onClick={() => setComposing(true)}
            className="p-2 rounded-xl bg-blue-500 text-white"
            title="Soạn thư"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl text-[11px] font-medium">
          {[
            { id: 'inbox' as const, label: 'Hộp thư', icon: Inbox },
            { id: 'starred' as const, label: 'Gắn sao', icon: Star },
            { id: 'sent' as const, label: 'Đã gửi', icon: Send },
            { id: 'trash' as const, label: 'Thùng rác', icon: Trash2 },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1 ${
                folder === f.id ? 'bg-white dark:bg-[#1A1A22] shadow-sm text-blue-500' : 'text-zinc-500'
              }`}
            >
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {list.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-14">Không có thư nào trong mục này.</p>
        ) : (
          list.map((m) => (
            <button
              key={m.id}
              onClick={() => handleOpenMail(m)}
              className="w-full p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-left space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs truncate ${!m.is_read ? 'font-bold' : 'font-medium'}`}>
                  {m.from_name}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono-num shrink-0">
                  {new Date(m.created_at).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <p className="text-xs font-semibold truncate">{m.subject}</p>
              <p className="text-[11px] text-zinc-500 truncate">{m.body}</p>
            </button>
          ))
        )}
      </div>

      {composing && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end p-3">
          <form onSubmit={handleSendMail} className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Thư mới</h3>
              <button type="button" onClick={() => setComposing(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="Đến (vd: yuki@animesphere.os)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Nội dung thư..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-500 text-white font-semibold">
              Gửi thư
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
