import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  Download,
  Headphones,
  Heart,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Rss,
  Search,
  Timer,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { PodcastEpisode } from '../types/os';

export function PodcastApp() {
  const { data, refreshData, showToast, setPipState, playSoundEffect } = useOS();
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null);
  const [playingEpId, setPlayingEpId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [progressSec, setProgressSec] = useState(0);
  const [rssUrl, setRssUrl] = useState('');
  const [rssBusy, setRssBusy] = useState(false);
  const [sleepMin, setSleepMin] = useState<0 | 15 | 30 | 60>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const podcasts = data?.podcasts || [];
  const episodes = data?.podcastEpisodes || [];

  const categories = ['Tất cả', ...Array.from(new Set(podcasts.map((p) => p.category)))];
  const filteredPodcasts = podcasts.filter((p) => {
    const matchCat = category === 'Tất cả' || p.category === category;
    const matchSearch = !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()) || p.host.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const activeEp = episodes.find((e) => e.id === playingEpId) || null;
  const activeChannel = activeEp ? podcasts.find((p) => p.id === activeEp.podcast_id) : null;

  // Ambient Web Audio + Progress Tick
  useEffect(() => {
    if (!isPlaying || !activeEp) {
      try {
        oscRef.current?.stop();
        oscRef.current?.disconnect();
      } catch {
        // ignore
      }
      oscRef.current = null;
      return;
    }

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 174;
      gain.gain.value = 0.015 * (((data?.profile?.vol_media ?? data?.profile?.volume ?? 75) / 100));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscRef.current = osc;
    } catch {
      // ignore
    }

    const id = setInterval(() => {
      setProgressSec((prev) => {
        const next = Math.min(activeEp.duration_sec, prev + speed);
        if (Math.floor(next) % 10 === 0) {
          osApi.updatePodcastEpisode(activeEp.id, { progress_sec: Math.round(next) }).catch(() => {});
        }
        if (next >= activeEp.duration_sec) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(id);
      try {
        oscRef.current?.stop();
        oscRef.current?.disconnect();
      } catch {
        // ignore
      }
      oscRef.current = null;
    };
  }, [isPlaying, activeEp, speed, data?.profile?.volume, data?.profile?.vol_media]);

  useEffect(() => {
    if (activeEp) {
      setPipState({
        kind: 'podcast',
        title: activeEp.title,
        subtitle: activeChannel?.title || 'Podcast',
        isPlaying,
        progressSec: Math.round(progressSec),
        durationSec: activeEp.duration_sec,
        appId: 'podcast',
      });
    }
  }, [activeEp, activeChannel, isPlaying, progressSec, setPipState]);

  useEffect(() => {
    if (!sleepMin || !isPlaying) return;
    const t = setTimeout(() => {
      setIsPlaying(false);
      setSleepMin(0);
      showToast('Hẹn giờ ngủ Podcast', 'Đã tự động tạm dừng phát theo lịch hẹn giờ.');
    }, sleepMin * 60_000);
    return () => clearTimeout(t);
  }, [sleepMin, isPlaying, showToast]);

  const handleSubscribeRss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rssUrl.trim() || rssBusy) return;
    setRssBusy(true);
    try {
      await osApi.subscribePodcastRss(rssUrl.trim());
      setRssUrl('');
      await refreshData();
      showToast('Đăng ký RSS thành công', 'Đã thêm kênh Podcast và các tập mới vào thư viện!', 'success');
    } catch (err) {
      showToast('Lỗi RSS', err instanceof Error ? err.message : 'Không thể đọc nguồn RSS', 'error');
    } finally {
      setRssBusy(false);
    }
  };

  const startEpisode = (ep: PodcastEpisode) => {
    playSoundEffect('tap');
    setPlayingEpId(ep.id);
    setProgressSec(ep.progress_sec || 0);
    setIsPlaying(true);
  };

  const toggleFollow = async (id: string, current: number) => {
    await osApi.updatePodcast(id, !current);
    await refreshData();
    showToast('Podcast', !current ? 'Đã theo dõi kênh podcast' : 'Đã bỏ theo dõi');
  };

  const toggleEpFlag = async (ep: PodcastEpisode, field: 'is_downloaded' | 'is_favorite') => {
    const nextVal = ep[field] ? 0 : 1;
    await osApi.updatePodcastEpisode(ep.id, { [field]: nextVal });
    await refreshData();
    if (field === 'is_downloaded') {
      showToast('Tải ngoại tuyến', nextVal ? 'Đã lưu tập vào bộ nhớ ngoại tuyến mô phỏng' : 'Đã xóa bản tải');
    }
  };

  const seekDelta = async (delta: number) => {
    if (!activeEp) return;
    const next = Math.max(0, Math.min(activeEp.duration_sec, progressSec + delta));
    setProgressSec(next);
    await osApi.updatePodcastEpisode(activeEp.id, { progress_sec: Math.round(next) });
  };

  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const shownEpisodes = selectedPodcastId
    ? episodes.filter((e) => e.podcast_id === selectedPodcastId)
    : episodes;

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-violet-500" />
            <h1 className="font-display font-bold text-base">Podcast Studio</h1>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 font-semibold">
            Âm thanh Ambient + PiP
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kênh hoặc host..."
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>

        <form onSubmit={handleSubscribeRss} className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Rss className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <input
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="Thêm kênh từ RSS URL (https://...)..."
              className="flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={rssBusy}
            className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            {rssBusy ? 'Đang đọc...' : 'Thêm RSS'}
          </button>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pb-0.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setSelectedPodcastId(null);
              }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shrink-0 ${
                category === cat ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-4">
        {/* Channels */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Kênh Podcast</h2>
            {selectedPodcastId && (
              <button onClick={() => setSelectedPodcastId(null)} className="text-[11px] text-violet-500 font-semibold">
                Xem tất cả tập
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {filteredPodcasts.map((pod) => (
              <div
                key={pod.id}
                onClick={() => setSelectedPodcastId(pod.id === selectedPodcastId ? null : pod.id)}
                className={`p-2.5 rounded-2xl border cursor-pointer transition-all ${
                  selectedPodcastId === pod.id
                    ? 'bg-violet-500/10 border-violet-500'
                    : 'bg-white dark:bg-[#191922] border-zinc-200/80 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <img src={pod.cover_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{pod.title}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{pod.host}</p>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1.5 line-clamp-2">{pod.description}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFollow(pod.id, pod.is_followed);
                  }}
                  className={`mt-2 w-full py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1 ${
                    pod.is_followed
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'bg-zinc-100 dark:bg-zinc-800'
                  }`}
                >
                  {pod.is_followed ? <><Check className="w-3 h-3" /> Đang theo dõi</> : <><Plus className="w-3 h-3" /> Theo dõi</>}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Episodes */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Danh sách tập ({shownEpisodes.length})
          </h2>
          {shownEpisodes.map((ep) => {
            const ch = podcasts.find((p) => p.id === ep.podcast_id);
            const active = ep.id === playingEpId;
            return (
              <div
                key={ep.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200/80 dark:border-zinc-800 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-violet-500 font-semibold">{ch?.title}</p>
                    <h3 className="text-xs font-bold mt-0.5">{ep.title}</h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{ep.description}</p>
                  </div>
                  <button
                    onClick={() => (active ? setIsPlaying(!isPlaying) : startEpisode(ep))}
                    className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 shadow"
                  >
                    {active && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                  <span>
                    Đã nghe: {fmt(active ? progressSec : ep.progress_sec)} / {fmt(ep.duration_sec)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEpFlag(ep, 'is_favorite')}
                      className={`p-1.5 rounded-lg ${ep.is_favorite ? 'text-rose-500 bg-rose-500/10' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                      title="Yêu thích"
                    >
                      <Heart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleEpFlag(ep, 'is_downloaded')}
                      className={`px-2 py-1 rounded-lg flex items-center gap-1 font-semibold ${
                        ep.is_downloaded ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}
                    >
                      {ep.is_downloaded ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                      {ep.is_downloaded ? 'Offline' : 'Tải'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini Player */}
      {activeEp && (
        <div className="shrink-0 p-3 bg-zinc-900 text-white border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{activeEp.title}</p>
              <p className="text-[10px] text-zinc-400 truncate">
                {activeChannel?.host} · Âm thanh nền tổng hợp + Bộ đếm tiến độ thật
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSleepMin((m) => (m === 0 ? 15 : m === 15 ? 30 : m === 30 ? 60 : 0))}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 ${
                  sleepMin > 0 ? 'bg-amber-500/25 text-amber-300' : 'bg-white/10 text-zinc-300'
                }`}
                title="Hẹn giờ ngủ"
              >
                <Timer className="w-3 h-3" />
                <span>{sleepMin > 0 ? `${sleepMin}p` : 'Ngủ'}</span>
              </button>
              <button
                onClick={() => setSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 1.5 : 1))}
                className="px-2 py-1 rounded-lg bg-white/10 text-[11px] font-bold"
              >
                {speed}x
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono-num w-9">{fmt(progressSec)}</span>
            <input
              type="range"
              min={0}
              max={activeEp.duration_sec}
              value={progressSec}
              onChange={(e) => setProgressSec(Number(e.target.value))}
              className="flex-1 accent-violet-400"
            />
            <span className="text-[10px] font-mono-num w-9 text-right">{fmt(activeEp.duration_sec)}</span>
          </div>
          <div className="flex items-center justify-center gap-5">
            <button onClick={() => seekDelta(-15)} className="p-1.5 rounded-full hover:bg-white/10 text-xs flex items-center gap-0.5">
              <RotateCcw className="w-4 h-4" /> 15s
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button onClick={() => seekDelta(15)} className="p-1.5 rounded-full hover:bg-white/10 text-xs flex items-center gap-0.5">
              15s <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
