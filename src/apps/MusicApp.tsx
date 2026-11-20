import React from 'react';
import {
  Disc3,
  Music2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react';
import { useOS } from '../context/OSContext';

export function MusicApp() {
  const {
    tracks,
    addCustomTrack,
    currentTrack,
    musicPlaying,
    musicProgress,
    musicShuffle,
    musicRepeat,
    toggleMusicShuffle,
    cycleMusicRepeat,
    playTrack,
    toggleMusic,
    nextTrack,
    prevTrack,
    seekMusic,
    openApp,
    showToast,
  } = useOS();

  const handleUploadAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const track = {
      id: `trk_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Tệp âm thanh cục bộ',
      durationSec: 200,
      cover: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      type: 'audio' as const,
      audioUrl: url,
    };
    addCustomTrack(track);
    playTrack(track);
    showToast('Đã thêm bài hát', `Đang phát ${track.title}`);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-[#1E142E] to-[#101014] text-white overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-pink-400" />
          <h1 className="font-display text-lg font-bold">Âm nhạc</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openApp('musichub')}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 text-xs font-semibold flex items-center gap-1 hover:bg-white/15"
          >
            <Disc3 className="w-3.5 h-3.5 text-fuchsia-300" />
            <span>Music Hub</span>
          </button>
          <label className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập</span>
            <input type="file" accept="audio/*" onChange={handleUploadAudio} className="hidden" />
          </label>
        </div>
      </div>

      {/* Now Playing Card */}
      {currentTrack && (
        <div className="p-4 flex flex-col items-center text-center border-b border-white/10 shrink-0">
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl object-cover shadow-2xl ring-2 ring-white/15"
          />
          <h2 className="font-display text-base font-bold mt-2.5">{currentTrack.title}</h2>
          <p className="text-xs text-zinc-400">{currentTrack.artist}</p>

          <div className="w-full mt-3 space-y-1">
            <input
              type="range"
              min={0}
              max={currentTrack.durationSec || 180}
              value={musicProgress}
              onChange={(e) => seekMusic(Number(e.target.value))}
              className="w-full accent-pink-400"
              aria-label="Tua nhạc"
            />
            <div className="flex justify-between text-[10px] font-mono-num text-zinc-400">
              <span>{fmt(musicProgress)}</span>
              <span>{fmt(currentTrack.durationSec)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2.5">
            <button
              onClick={toggleMusicShuffle}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                musicShuffle ? 'bg-pink-500/25 text-pink-300' : 'bg-white/5 text-zinc-400'
              }`}
              title="Trộn bài"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={prevTrack}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              title="Bài trước"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={toggleMusic}
              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg"
            >
              {musicPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={nextTrack}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              title="Bài tiếp"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              onClick={cycleMusicRepeat}
              className={`w-9 h-9 rounded-full flex items-center justify-center gap-0.5 text-[10px] font-bold ${
                musicRepeat !== 'off' ? 'bg-pink-500/25 text-pink-300' : 'bg-white/5 text-zinc-400'
              }`}
              title="Lặp lại"
            >
              <Repeat className="w-4 h-4" />
              {musicRepeat === 'one' && <span>1</span>}
            </button>
          </div>
        </div>
      )}

      {/* Track List */}
      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        <p className="text-[11px] text-zinc-400 px-1">Thư viện & Nhạc nền Synth tích hợp (đồng bộ MediaSession)</p>
        {tracks.map((t) => {
          const active = currentTrack?.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => playTrack(t)}
              className={`w-full p-2.5 rounded-2xl flex items-center gap-3 text-left transition-colors ${
                active ? 'bg-pink-500/20 border border-pink-400/40' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <img src={t.cover} alt="" className="w-10 h-10 rounded-xl object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{t.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">{t.artist}</p>
              </div>
              <span className="text-[10px] font-mono-num text-zinc-400">{fmt(t.durationSec)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
