import React, { useState } from 'react';
import { Clipboard, Delete, Globe, Keyboard, Mic, Pin, Smile, Trash2, X } from 'lucide-react';
import { useOS } from '../../context/OSContext';

const ROWS_ALPHA = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const ROWS_NUM = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', 'đ', '_', '&', '-', '+', '(', ')', '/'],
  ['*', '"', "'", ':', ';', '!', '?', ',', '.'],
];

const EMOJIS = ['😊', '😂', '❤️', '🌸', '🔥', '✨', '👍', '🥳', '😭', '🙏', '🎵', '☕', '📸', '🚀', '🍜', '🌙'];
const VI_QUICK = ['ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư', 'á', 'à', 'ạ', 'ả', 'ã', 'é', 'ế', 'ề', 'ệ', 'ó', 'ố', 'ộ', 'ú', 'ứ'];

export function VirtualKeyboard() {
  const {
    data,
    virtualKeyboardOpen,
    setVirtualKeyboardOpen,
    insertKbText,
    backspaceKbText,
    clipboardHistory,
    togglePinClipboard,
    deleteClipboardEntry,
    clearClipboard,
    showToast,
  } = useOS();

  const [tab, setTab] = useState<'alpha' | 'num' | 'emoji' | 'clip'>('alpha');
  const [shift, setShift] = useState(false);
  const [viBar, setViBar] = useState(true);
  const [listening, setListening] = useState(false);

  if (!virtualKeyboardOpen) return null;

  const kbTheme = data?.profile?.kb_theme || 'auto';
  const kbHeight = data?.profile?.kb_height || 'medium';

  const themeClass =
    kbTheme === 'lavender'
      ? 'bg-violet-950/95 text-violet-50 border-violet-500/30'
      : kbTheme === 'dark'
        ? 'bg-zinc-900/95 text-white border-zinc-700'
        : kbTheme === 'light'
          ? 'bg-zinc-100/95 text-zinc-900 border-zinc-300'
          : 'bg-zinc-100/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-800';

  const keyHeight = kbHeight === 'compact' ? 'h-8' : kbHeight === 'tall' ? 'h-11' : 'h-9.5';

  const startVoiceInput = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      showToast('Nhập giọng nói', 'Trình duyệt hiện tại không hỗ trợ Web Speech STT. Vui lòng dùng nút Mic ghi âm AI.', 'info');
      return;
    }

    try {
      const rec = new SpeechRec() as {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      rec.lang = 'vi-VN';
      rec.interimResults = false;
      setListening(true);
      rec.onresult = (ev) => {
        const text = ev.results?.[0]?.[0]?.transcript;
        if (text) insertKbText(`${text} `);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <div className={`shrink-0 border-t backdrop-blur-xl px-1.5 pt-1.5 pb-2 z-40 select-none ${themeClass}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 pb-1.5 gap-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('alpha')}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${tab === 'alpha' ? 'bg-violet-500 text-white' : 'opacity-70 hover:bg-black/10 dark:hover:bg-white/10'}`}
          >
            <Keyboard className="w-3.5 h-3.5" /> ABC
          </button>
          <button
            onClick={() => setTab('emoji')}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${tab === 'emoji' ? 'bg-violet-500 text-white' : 'opacity-70 hover:bg-black/10 dark:hover:bg-white/10'}`}
          >
            <Smile className="w-3.5 h-3.5" /> Emoji
          </button>
          <button
            onClick={() => setTab('clip')}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${tab === 'clip' ? 'bg-violet-500 text-white' : 'opacity-70 hover:bg-black/10 dark:hover:bg-white/10'}`}
          >
            <Clipboard className="w-3.5 h-3.5" /> Khay ({clipboardHistory.length})
          </button>
          <button
            onClick={() => setViBar((v) => !v)}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${viBar ? 'bg-emerald-500/20 text-emerald-500' : 'opacity-65'}`}
          >
            <Globe className="w-3 h-3" /> VI
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startVoiceInput}
            className={`p-1.5 rounded-lg ${listening ? 'bg-rose-500 text-white animate-pulse' : 'opacity-75 hover:bg-black/10 dark:hover:bg-white/10'}`}
            title="Nhập bằng giọng nói (STT)"
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVirtualKeyboardOpen(false)}
            className="p-1.5 rounded-lg opacity-70 hover:bg-black/10 dark:hover:bg-white/10"
            title="Ẩn bàn phím"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Vietnamese Quick Diacritics Strip */}
      {viBar && tab === 'alpha' && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1.5 px-0.5 no-scrollbar">
          {VI_QUICK.map((ch) => (
            <button
              key={ch}
              onClick={() => insertKbText(shift ? ch.toUpperCase() : ch)}
              className="px-2 py-1 rounded-lg bg-black/10 dark:bg-white/10 text-xs font-medium shrink-0 active:scale-95"
            >
              {shift ? ch.toUpperCase() : ch}
            </button>
          ))}
        </div>
      )}

      {tab === 'emoji' && (
        <div className="grid grid-cols-8 gap-1.5 p-1 max-h-36 overflow-y-auto">
          {EMOJIS.map((em) => (
            <button
              key={em}
              onClick={() => insertKbText(em)}
              className="h-9 rounded-xl bg-black/5 dark:bg-white/10 text-lg flex items-center justify-center active:scale-90"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {tab === 'clip' && (
        <div className="max-h-40 overflow-y-auto space-y-1.5 px-1">
          <div className="flex items-center justify-between text-[11px] opacity-70">
            <span>Lịch sử sao chép gần đây (tự bỏ qua mật khẩu)</span>
            {clipboardHistory.some((c) => !c.pinned) && (
              <button onClick={clearClipboard} className="text-rose-500 font-semibold flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Xóa bớt
              </button>
            )}
          </div>
          {clipboardHistory.length === 0 ? (
            <p className="text-xs opacity-50 text-center py-4">Chưa có mục nào trong bộ nhớ tạm.</p>
          ) : (
            clipboardHistory.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 p-2 rounded-xl bg-black/5 dark:bg-white/10">
                <button
                  onClick={() => insertKbText(item.text)}
                  className="flex-1 text-left text-xs line-clamp-2"
                >
                  {item.text}
                </button>
                <button
                  onClick={() => togglePinClipboard(item.id)}
                  className={`p-1 rounded-lg ${item.pinned ? 'text-amber-500' : 'opacity-45'}`}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteClipboardEntry(item.id)}
                  className="p-1 rounded-lg text-rose-500/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {(tab === 'alpha' || tab === 'num') && (
        <div className="space-y-1">
          {(tab === 'alpha' ? ROWS_ALPHA : ROWS_NUM).map((row, idx) => (
            <div key={idx} className="flex items-center justify-center gap-1">
              {idx === 2 && tab === 'alpha' && (
                <button
                  onClick={() => setShift((s) => !s)}
                  className={`px-2.5 ${keyHeight} rounded-lg text-xs font-bold ${shift ? 'bg-violet-500 text-white' : 'bg-black/15 dark:bg-white/15'}`}
                >
                  ⇧
                </button>
              )}
              {row.map((k) => {
                const label = tab === 'alpha' && shift ? k.toUpperCase() : k;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      insertKbText(label);
                      if (shift) setShift(false);
                    }}
                    className={`flex-1 min-w-[26px] ${keyHeight} rounded-lg bg-white/80 dark:bg-zinc-800 shadow-sm text-sm font-medium active:scale-95 flex items-center justify-center`}
                  >
                    {label}
                  </button>
                );
              })}
              {idx === 2 && (
                <button
                  onClick={backspaceKbText}
                  className={`px-2.5 ${keyHeight} rounded-lg bg-black/15 dark:bg-white/15 flex items-center justify-center active:scale-95`}
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1 pt-0.5">
            <button
              onClick={() => setTab((t) => (t === 'alpha' ? 'num' : 'alpha'))}
              className="px-3 h-9 rounded-lg bg-black/15 dark:bg-white/15 text-xs font-semibold"
            >
              {tab === 'alpha' ? '?123' : 'ABC'}
            </button>
            <button
              onClick={() => insertKbText(',')}
              className="w-8 h-9 rounded-lg bg-white/80 dark:bg-zinc-800 text-sm font-medium"
            >
              ,
            </button>
            <button
              onClick={() => insertKbText(' ')}
              className="flex-1 h-9 rounded-lg bg-white/80 dark:bg-zinc-800 text-xs font-medium opacity-80"
            >
              Tiếng Việt (PHONE OS)
            </button>
            <button
              onClick={() => insertKbText('.')}
              className="w-8 h-9 rounded-lg bg-white/80 dark:bg-zinc-800 text-sm font-medium"
            >
              .
            </button>
            <button
              onClick={() => insertKbText('\n')}
              className="px-3 h-9 rounded-lg bg-violet-600 text-white text-xs font-semibold"
            >
              ↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
