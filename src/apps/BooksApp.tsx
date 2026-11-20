import React, { useRef, useState } from 'react';
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Plus, ArrowLeft, Type } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { BookItem } from '../types/os';

export function BooksApp() {
  const { data, refreshData, showToast } = useOS();
  const [activeBook, setActiveBook] = useState<BookItem | null>(null);
  const [readerTheme, setReaderTheme] = useState<'paper' | 'sepia' | 'night'>('paper');
  const [fontSize, setFontSize] = useState(14);
  const fileRef = useRef<HTMLInputElement>(null);

  const books = data?.books || [];

  const handleImportTxt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += 140) {
      chunks.push(words.slice(i, i + 140).join(' '));
    }
    await osApi.createBook({
      title: file.name.replace(/\.[^.]+$/, ''),
      author: data?.profile.name || 'Đã nhập',
      cover_color: '#F472B6',
      pages_json: chunks.length > 0 ? chunks : ['Tệp trống.'],
    });
    await refreshData();
    showToast('Sách', `Đã nhập "${file.name}".`, 'success');
  };

  if (activeBook) {
    const latest = books.find((b) => b.id === activeBook.id) || activeBook;
    const pages: string[] = JSON.parse(latest.pages_json || '[]');
    const bookmarks: number[] = JSON.parse(latest.bookmarks_json || '[]');
    const pageIdx = Math.min(Math.max(0, latest.current_page || 0), Math.max(0, pages.length - 1));
    const isBookmarked = bookmarks.includes(pageIdx);

    const themeClasses =
      readerTheme === 'sepia'
        ? 'bg-[#F5ECD7] text-[#3B2F1E]'
        : readerTheme === 'night'
          ? 'bg-[#121218] text-zinc-200'
          : 'bg-white text-zinc-900';

    const savePage = async (nextPage: number, nextBookmarks?: number[]) => {
      await osApi.updateBook(latest.id, {
        current_page: nextPage,
        ...(nextBookmarks ? { bookmarks_json: nextBookmarks } : {}),
      });
      await refreshData();
    };

    return (
      <div className={`h-full flex flex-col ${themeClasses} transition-colors`}>
        <div className="px-4 py-2.5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <button onClick={() => setActiveBook(null)} className="flex items-center gap-1 text-xs font-semibold">
            <ArrowLeft className="w-4 h-4" /> Thư viện
          </button>
          <span className="text-xs font-bold truncate max-w-[140px]">{latest.title}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = isBookmarked ? bookmarks.filter((p) => p !== pageIdx) : [...bookmarks, pageIdx];
                savePage(pageIdx, next);
                showToast('Đánh dấu trang', isBookmarked ? 'Đã bỏ đánh dấu trang.' : `Đã đánh dấu trang ${pageIdx + 1}.`);
              }}
              className={`p-1.5 rounded-lg ${isBookmarked ? 'text-[#A78BFA]' : 'opacity-60'}`}
            >
              <Bookmark className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 opacity-60" />
            <button onClick={() => setFontSize((s) => Math.max(12, s - 1))} className="px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
              A-
            </button>
            <button onClick={() => setFontSize((s) => Math.min(22, s + 1))} className="px-2 py-0.5 rounded bg-black/5 dark:bg-white/10">
              A+
            </button>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                { id: 'paper', label: 'Giấy' },
                { id: 'sepia', label: 'Nâu cổ điển' },
                { id: 'night', label: 'Ban đêm' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setReaderTheme(t.id)}
                className={`px-2 py-0.5 rounded ${readerTheme === t.id ? 'bg-[#A78BFA] text-white' : 'bg-black/5 dark:bg-white/10'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-5 leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
          <p className="whitespace-pre-wrap">{pages[pageIdx] || 'Trang này chưa có nội dung.'}</p>
        </div>

        <div className="px-4 py-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs">
          <button
            disabled={pageIdx <= 0}
            onClick={() => savePage(pageIdx - 1)}
            className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Trước
          </button>
          <span className="font-mono-num">
            Trang {pageIdx + 1} / {pages.length}
          </span>
          <button
            disabled={pageIdx >= pages.length - 1}
            onClick={() => savePage(pageIdx + 1)}
            className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 disabled:opacity-30 flex items-center gap-1"
          >
            Tiếp <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold font-display">Sách</h1>
          <p className="text-[11px] text-zinc-500">Thư viện đọc sách & Nhập tệp TXT</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Nhập TXT
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md" onChange={handleImportTxt} className="hidden" />
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
        {books.map((book) => {
          const pages: string[] = JSON.parse(book.pages_json || '[]');
          return (
            <button
              key={book.id}
              onClick={() => setActiveBook(book)}
              className="text-left rounded-2xl overflow-hidden bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col"
            >
              <div
                className="aspect-[4/3] p-3 flex flex-col justify-between text-white"
                style={{ backgroundColor: book.cover_color || '#A78BFA' }}
              >
                <BookOpen className="w-5 h-5 opacity-80" />
                <p className="text-xs font-bold leading-tight line-clamp-2">{book.title}</p>
              </div>
              <div className="p-2.5 space-y-0.5">
                <p className="text-[11px] font-medium truncate">{book.author}</p>
                <p className="text-[10px] text-zinc-500 font-mono-num">
                  Trang {(book.current_page || 0) + 1} / {pages.length}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
