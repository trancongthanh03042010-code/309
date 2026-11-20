import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, ExternalLink, Newspaper, RefreshCw, Search, Share2 } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

interface NewsArticle {
  id: number;
  title: string;
  url?: string;
  by?: string;
  score?: number;
  time?: number;
}

export function NewsApp() {
  const { openApp, openShareSheet, showToast } = useOS();
  const [category, setCategory] = useState<'top' | 'new' | 'saved'>('top');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [sourceName, setSourceName] = useState('Hacker News Public API');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<NewsArticle[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('phone_os_saved_news') || '[]') as NewsArticle[];
    } catch {
      return [];
    }
  });

  const fetchFeed = async (cat: 'top' | 'new') => {
    setLoading(true);
    try {
      const res = await osApi.news(cat);
      setArticles(res.articles);
      setSourceName(res.source);
    } catch (err) {
      showToast('Tin tức', err instanceof Error ? err.message : 'Không thể tải bảng tin', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (category === 'top' || category === 'new') {
      fetchFeed(category);
    }
  }, [category]);

  const toggleSave = (item: NewsArticle) => {
    const exists = saved.some((s) => s.id === item.id);
    const next = exists ? saved.filter((s) => s.id !== item.id) : [item, ...saved];
    setSaved(next);
    localStorage.setItem('phone_os_saved_news', JSON.stringify(next));
    showToast('Tin tức', exists ? 'Đã bỏ khỏi mục Đã lưu.' : 'Đã lưu bài viết.');
  };

  const displayList = useMemo(() => {
    const base = category === 'saved' ? saved : articles;
    if (!query.trim()) return base;
    return base.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()));
  }, [category, saved, articles, query]);

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold font-display">Tin tức</h1>
            <p className="text-[11px] text-zinc-500">Bảng tin trực tiếp · {sourceName}</p>
          </div>
          <button
            onClick={() => category !== 'saved' && fetchFeed(category)}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex gap-1.5">
          {(
            [
              { id: 'top', label: 'Tin nổi bật' },
              { id: 'new', label: 'Tin mới' },
              { id: 'saved', label: `Đã lưu (${saved.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setCategory(t.id)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold ${
                category === t.id ? 'bg-[#A78BFA] text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc tiêu đề bài viết..."
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-2.5">
        {displayList.length === 0 && !loading && (
          <div className="text-center py-10 space-y-2">
            <Newspaper className="w-7 h-7 text-zinc-400 mx-auto" />
            <p className="text-xs text-zinc-500">Không tìm thấy bài viết nào.</p>
          </div>
        )}

        {displayList.map((item) => {
          const isSaved = saved.some((s) => s.id === item.id);
          return (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2"
            >
              <h3 className="text-xs font-bold leading-snug">{item.title}</h3>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>
                  bởi {item.by || 'cộng tác viên'} · {item.score ?? 0} điểm
                </span>
                <span>{item.time ? new Date(item.time * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {item.url && (
                  <button
                    onClick={() => openApp('browser', { url: item.url })}
                    className="px-2.5 py-1 rounded-lg bg-[#A78BFA]/15 text-[#A78BFA] text-[11px] font-semibold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Đọc trên Trình duyệt
                  </button>
                )}
                <button
                  onClick={() => toggleSave(item)}
                  className={`p-1.5 rounded-lg ${isSaved ? 'bg-amber-500/15 text-amber-500' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openShareSheet({ title: item.title, text: item.title, url: item.url })}
                  className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-500"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
