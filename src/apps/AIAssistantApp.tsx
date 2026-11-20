import React, { useState } from 'react';
import { Bot, Send, CheckCircle2, Sparkles } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { AppId } from '../types/os';

interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
  action?: {
    type: string;
    requiresConfirmation: boolean;
    label: string;
    payload: Record<string, string>;
    executed?: boolean;
  };
}

export function AIAssistantApp() {
  const { openApp, refreshData, showToast } = useOS();
  const [turns, setTurns] = useState<AssistantTurn[]>([
    {
      role: 'assistant',
      text: 'Xin chào! Mình là Trợ lý PHONE OS. Bạn có thể nhờ mình tạo ghi chú, thêm lịch hẹn, đặt nhắc việc, tóm tắt email mới hoặc mở ứng dụng bất kỳ.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (promptText?: string) => {
    const q = (promptText ?? input).trim();
    if (!q) return;
    if (!promptText) setInput('');
    setTurns((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await osApi.assistant(q);
      if (res.proposedAction && res.proposedAction.type === 'open_app' && !res.proposedAction.requiresConfirmation) {
        const target = res.proposedAction.payload.appId as AppId;
        if (target) openApp(target);
      }
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer,
          action:
            res.proposedAction && res.proposedAction.type !== 'none'
              ? { ...res.proposedAction, executed: false }
              : undefined,
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Lỗi trợ lý AI' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const executeProposed = async (idx: number) => {
    const turn = turns[idx];
    if (!turn?.action || turn.action.executed) return;
    const { type, payload } = turn.action;
    if (type === 'create_note') {
      await osApi.createNote({ title: payload.title || 'Ghi chú AI', content: payload.content || '' });
      showToast('Trợ lý AI', 'Đã tạo ghi chú');
    } else if (type === 'create_reminder') {
      await osApi.createReminder({
        title: payload.title || 'Lời nhắc AI',
        due_date: payload.due_date || new Date().toISOString().slice(0, 10),
        due_time: payload.due_time || '09:00',
      });
      showToast('Trợ lý AI', 'Đã đặt lời nhắc');
    } else if (type === 'create_event') {
      const today = new Date().toISOString().slice(0, 10);
      await osApi.createEvent({
        title: payload.title || 'Sự kiện mới',
        start_iso: payload.start_iso || `${today}T15:00:00`,
        end_iso: payload.end_iso || `${today}T16:00:00`,
        location: payload.location || '',
      });
      showToast('Trợ lý AI', 'Đã thêm sự kiện vào Lịch');
    } else if (type === 'open_app' && payload.appId) {
      openApp(payload.appId as AppId);
    }
    await refreshData();
    setTurns((prev) =>
      prev.map((t, i) => (i === idx && t.action ? { ...t, action: { ...t.action, executed: true } } : t))
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <Bot className="w-5 h-5 text-indigo-500" />
        <div>
          <h1 className="font-display text-base font-bold">Trợ lý PHONE OS</h1>
          <p className="text-[10px] text-zinc-500">Điều phối hệ thống Gemini có xác nhận</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                t.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.action && (
                <div className="mt-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  {t.action.executed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã xong: {t.action.label}</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => executeProposed(i)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600"
                    >
                      Xác nhận: {t.action.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-500">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span>Đang suy nghĩ...</span>
          </div>
        )}
      </div>

      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto os-scroll-hidden">
        {['Tóm tắt email mới nhất', 'Tạo ghi chú ý tưởng cuối tuần', 'Nhắc mình uống nước lúc 15:00'].map((q) => (
          <button
            key={q}
            onClick={() => handleSend(q)}
            className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[11px] whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="p-3 bg-white dark:bg-[#1A1A22] border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Hỏi Trợ lý PHONE OS..."
          className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading}
          className="p-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
