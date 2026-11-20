import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Copy, Languages, Loader2, Share2, Volume2 } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

const LANGS = [
  { value: 'Auto', label: 'Tự động nhận diện' },
  { value: 'Vietnamese', label: 'Tiếng Việt' },
  { value: 'English', label: 'Tiếng Anh' },
  { value: 'Japanese', label: 'Tiếng Nhật' },
  { value: 'Korean', label: 'Tiếng Hàn' },
  { value: 'Chinese', label: 'Tiếng Trung' },
  { value: 'French', label: 'Tiếng Pháp' },
  { value: 'German', label: 'Tiếng Đức' },
  { value: 'Spanish', label: 'Tiếng Tây Ban Nha' },
];

const getLangLabel = (val: string) => LANGS.find((l) => l.value === val)?.label || val;

export function TranslateApp() {
  const { data, appParams, refreshData, showToast, openShareSheet, setAiBusyLabel } = useOS();
  const [sourceLang, setSourceLang] = useState('Auto');
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appParams.translateText) {
      setSourceText(appParams.translateText);
    }
  }, [appParams.translateText]);

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setBusy(true);
    setAiBusyLabel('Đang dịch...');
    try {
      const res = (await osApi.translate(sourceText.trim(), sourceLang, targetLang)) as {
        translated_text?: string;
        translatedText?: string;
      };
      setTranslatedText(res.translated_text || res.translatedText || '');
      await refreshData();
    } catch (err) {
      showToast('Lỗi dịch thuật', err instanceof Error ? err.message : 'Dịch thất bại', 'error');
    } finally {
      setBusy(false);
      setAiBusyLabel(null);
    }
  };

  const handleSpeak = (text: string, langName: string) => {
    if (!text) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const langMap: Record<string, string> = {
        Japanese: 'ja-JP',
        Vietnamese: 'vi-VN',
        Korean: 'ko-KR',
        Spanish: 'es-ES',
        French: 'fr-FR',
        German: 'de-DE',
        Chinese: 'zh-CN',
        English: 'en-US',
      };
      utter.lang = langMap[langName] || 'en-US';
      window.speechSynthesis.speak(utter);
    } else {
      showToast('Đọc văn bản', 'Trình duyệt không hỗ trợ đọc văn bản.', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold font-display">Dịch thuật</h1>
          <p className="text-[11px] text-zinc-500">Dịch AI Gemini & Lịch sử</p>
        </div>
        <Languages className="w-5 h-5 text-[#A78BFA]" />
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs font-semibold"
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (sourceLang === 'Auto') return;
              const s = sourceLang;
              setSourceLang(targetLang);
              setTargetLang(s);
              if (translatedText) {
                setSourceText(translatedText);
                setTranslatedText(sourceText);
              }
            }}
            className="p-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800"
          >
            <ArrowLeftRight className="w-4 h-4 text-[#A78BFA]" />
          </button>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs font-semibold"
          >
            {LANGS.filter((l) => l.value !== 'Auto').map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
          <textarea
            rows={4}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Nhập văn bản cần dịch..."
            className="w-full bg-transparent text-xs outline-none resize-none"
          />
          <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => handleSpeak(sourceText, sourceLang)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-[#A78BFA]"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleTranslate}
              disabled={busy || !sourceText.trim()}
              className="px-4 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Dịch ngay
            </button>
          </div>
        </div>

        {translatedText && (
          <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#A78BFA]">{getLangLabel(targetLang)}</p>
            <p className="text-sm font-medium leading-relaxed">{translatedText}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleSpeak(translatedText, targetLang)}
                className="p-1.5 rounded-lg bg-white/60 dark:bg-zinc-900/60"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(translatedText);
                  showToast('Đã sao chép', 'Đã chép bản dịch vào bộ nhớ tạm.', 'success');
                }}
                className="p-1.5 rounded-lg bg-white/60 dark:bg-zinc-900/60"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openShareSheet({ title: `Bản dịch (${getLangLabel(targetLang)})`, text: translatedText })}
                className="p-1.5 rounded-lg bg-white/60 dark:bg-zinc-900/60"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Lịch sử dịch gần đây</h2>
          {(data?.translations || []).slice(0, 10).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSourceText(t.source_text);
                setTranslatedText(t.translated_text);
                setSourceLang(t.source_lang);
                setTargetLang(t.target_lang);
              }}
              className="w-full text-left p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-0.5"
            >
              <p className="text-[10px] text-zinc-400">
                {getLangLabel(t.source_lang)} → {getLangLabel(t.target_lang)}
              </p>
              <p className="text-xs font-semibold truncate">{t.source_text}</p>
              <p className="text-xs text-[#A78BFA] truncate">{t.translated_text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
