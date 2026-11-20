import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Captions,
  Check,
  Crown,
  FastForward,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  Settings,
  SkipForward,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type { YouTubeEpisodeItem, YouTubeMovieAccessResult, YouTubeMovieItem } from '../../types/os';

interface YouTubeMoviePlayerProps {
  movie: YouTubeMovieItem;
  episode: YouTubeEpisodeItem;
  access: YouTubeMovieAccessResult;
  initialTimeSec?: number;
  onClose: () => void;
  onSelectEpisode: (episodeNumber: number) => void;
  onRequestUpgrade: () => void;
  onToast: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ALL_QUALITIES = ['360p', '480p', '720p', '1080p', '1440p', '4K'] as const;
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function YouTubeMoviePlayer({
  movie,
  episode,
  access,
  initialTimeSec = 0,
  onClose,
  onSelectEpisode,
  onRequestUpgrade,
  onToast,
}: YouTubeMoviePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const durationSec = Math.max(60, episode.durationSec || movie.durationSec || 180);
  const [currentTime, setCurrentTime] = useState(
    initialTimeSec > 2 && initialTimeSec < durationSec - 4 ? initialTimeSec : 0
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [quality, setQuality] = useState<string>(access.maxQuality || '720p');
  const [subtitleLang, setSubtitleLang] = useState<'vi' | 'en' | 'off'>('vi');
  const [audioTrack, setAudioTrack] = useState<'original' | 'vi_dub'>('original');
  const [volume, setVolume] = useState<number>(75);
  const [muted, setMuted] = useState(false);

  const [theaterMode, setTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touchLocked, setTouchLocked] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsTab, setSettingsTab] = useState<'none' | 'quality' | 'speed' | 'subtitle' | 'audio' | 'episodes'>('none');
  const [nextEpCountdown, setNextEpCountdown] = useState<number | null>(null);

  const maxQualityIndex = useMemo(() => {
    const idx = ALL_QUALITIES.indexOf(access.maxQuality as (typeof ALL_QUALITIES)[number]);
    return idx >= 0 ? idx : 2;
  }, [access.maxQuality]);

  const nextEpisode = useMemo(
    () => movie.episodes.find((e) => e.episodeNumber === episode.episodeNumber + 1) || null,
    [movie.episodes, episode.episodeNumber]
  );

  // Sync selected quality with plan cap
  useEffect(() => {
    const curIdx = ALL_QUALITIES.indexOf(quality as (typeof ALL_QUALITIES)[number]);
    if (curIdx > maxQualityIndex) {
      setQuality(access.maxQuality);
    }
  }, [access.maxQuality, maxQualityIndex, quality]);

  // Preload movie backdrop artwork into image ref for canvas cinema stream
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = movie.backdropUrl || movie.posterUrl;
    img.onload = () => {
      imgRef.current = img;
    };
  }, [movie.backdropUrl, movie.posterUrl]);

  // Ambient WebAudio cinema drone while playing (safe user-gesture resumed)
  useEffect(() => {
    if (!isPlaying || muted || volume <= 0) {
      if (gainRef.current && audioCtxRef.current) {
        gainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.08);
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = audioTrack === 'vi_dub' ? 146.83 : 110;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioCtxRef.current = ctx;
        oscRef.current = osc;
        gainRef.current = gain;
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
      if (oscRef.current) {
        oscRef.current.frequency.setTargetAtTime(audioTrack === 'vi_dub' ? 146.83 : 110, audioCtxRef.current.currentTime, 0.1);
      }
      if (gainRef.current) {
        gainRef.current.gain.setTargetAtTime((volume / 100) * 0.015, audioCtxRef.current.currentTime, 0.1);
      }
    } catch {
      // ignore audio autoplay restriction
    }
  }, [isPlaying, muted, volume, audioTrack]);

  useEffect(() => {
    return () => {
      try {
        oscRef.current?.stop();
        void audioCtxRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  // Playback clock tick & auto-next countdown
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.25 * playbackSpeed;
        if (next >= durationSec) {
          setIsPlaying(false);
          if (nextEpisode) {
            setNextEpCountdown(5);
          }
          return durationSec;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, durationSec, nextEpisode]);

  useEffect(() => {
    if (nextEpCountdown === null) return;
    if (nextEpCountdown <= 0 && nextEpisode) {
      setNextEpCountdown(null);
      onSelectEpisode(nextEpisode.episodeNumber);
      return;
    }
    const timer = window.setTimeout(() => {
      setNextEpCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [nextEpCountdown, nextEpisode, onSelectEpisode]);

  // Persist watch progress to SQLite periodically & on unmount
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  useEffect(() => {
    const saveTimer = window.setInterval(() => {
      void osApi.saveYoutubeMovieProgress(movie.id, {
        episodeNumber: episode.episodeNumber,
        progressSec: currentTimeRef.current,
        durationSec,
      });
    }, 4000);
    return () => {
      window.clearInterval(saveTimer);
      void osApi.saveYoutubeMovieProgress(movie.id, {
        episodeNumber: episode.episodeNumber,
        progressSec: currentTimeRef.current,
        durationSec,
      });
    };
  }, [movie.id, episode.episodeNumber, durationSec]);

  // Canvas 60fps cinema renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const qualityScale =
      quality === '360p' ? 0.55 : quality === '480p' ? 0.72 : quality === '720p' ? 0.9 : 1;
    canvas.width = Math.round(960 * qualityScale);
    canvas.height = Math.round(540 * qualityScale);

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#07070A';
    ctx.fillRect(0, 0, w, h);

    if (imgRef.current) {
      const zoom = 1 + 0.08 * Math.sin(currentTime * 0.14);
      const panX = Math.cos(currentTime * 0.18) * 18 * qualityScale;
      const panY = Math.sin(currentTime * 0.12) * 10 * qualityScale;
      const dw = w * zoom;
      const dh = h * zoom;
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.drawImage(imgRef.current, (w - dw) / 2 + panX, (h - dh) / 2 + panY, dw, dh);
      ctx.restore();
    }

    // Subtle cinema vignette + color accent glow
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.12, w * 0.5, h * 0.5, w * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle scene pulse watermark (Cinema frame)
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `600 ${Math.round(13 * qualityScale)}px sans-serif`;
    ctx.fillText(
      `${movie.title} · ${episode.title} · ${quality}${access.adFree ? ' · Không QC' : ''}`,
      Math.round(20 * qualityScale),
      Math.round(28 * qualityScale)
    );
  }, [currentTime, quality, movie.title, episode.title, access.adFree]);

  const activeSubtitle = useMemo(() => {
    if (subtitleLang === 'off') return '';
    const cues = episode.subtitles || [];
    const loopSec = cues.length > 0 ? currentTime % 54 : currentTime;
    const found = cues.find((c) => loopSec >= c.startSec && loopSec < c.endSec);
    if (!found) return '';
    return subtitleLang === 'en' ? found.en : found.vi;
  }, [subtitleLang, episode.subtitles, currentTime]);

  const handleTogglePip = useCallback(async () => {
    try {
      const canvas = canvasRef.current as (HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }) | null;
      const vid = pipVideoRef.current;
      if (!canvas || !vid || !canvas.captureStream || !document.pictureInPictureEnabled) {
        onToast('Hình trong hình (PiP)', 'Trình duyệt hiện tại không hỗ trợ Picture-in-Picture.', 'info');
        return;
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (!vid.srcObject) {
        vid.srcObject = canvas.captureStream(24);
      }
      await vid.play().catch(() => {});
      await vid.requestPictureInPicture();
    } catch {
      onToast('Hình trong hình (PiP)', 'Không thể kích hoạt PiP trên thiết bị này.', 'info');
    }
  }, [onToast]);

  const handleToggleFullscreen = useCallback(() => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (next && containerRef.current?.requestFullscreen) {
      void containerRef.current.requestFullscreen().catch(() => {});
    } else if (!next && document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [isFullscreen]);

  const seekBy = (delta: number) => {
    if (touchLocked) return;
    setNextEpCountdown(null);
    setCurrentTime((prev) => Math.max(0, Math.min(durationSec, prev + delta)));
  };

  return (
    <div
      ref={containerRef}
      className={`${
        isFullscreen ? 'fixed inset-0 z-[70]' : 'flex-1 flex flex-col'
      } bg-black text-white select-none overflow-hidden`}
    >
      {/* Safe top guard bar — prevented from closing when Touch Lock is ON */}
      {!theaterMode && !isFullscreen && (
        <div className="shrink-0 h-12 px-3 bg-zinc-950 border-b border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={touchLocked}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -ml-1 rounded-xl flex items-center justify-center text-zinc-200 hover:bg-white/10 disabled:opacity-30"
            title={touchLocked ? 'Đang khóa cảm ứng' : 'Quay lại'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate">{movie.title}</p>
            <p className="text-[10.5px] text-zinc-400 truncate">
              {episode.title} · {quality} · {playbackSpeed}x
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTouchLocked((v) => !v);
              setSettingsTab('none');
            }}
            className={`min-h-[38px] px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
              touchLocked ? 'bg-amber-500 text-zinc-950' : 'bg-white/10 text-zinc-200'
            }`}
          >
            {touchLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{touchLocked ? 'Đã khóa chạm' : 'Khóa chạm'}</span>
          </button>
        </div>
      )}

      {/* Cinema Canvas Viewport with Safe Touch Padding */}
      <div
        className={`relative bg-black flex items-center justify-center overflow-hidden ${
          isFullscreen || theaterMode ? 'flex-1' : 'aspect-video w-full'
        }`}
      >
        <canvas
          ref={canvasRef}
          onClick={() => {
            if (touchLocked) return;
            setControlsVisible((v) => !v);
            setSettingsTab('none');
          }}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Hidden video element exclusively for PiP MediaStream */}
        <video ref={pipVideoRef} muted playsInline className="hidden" />

        {/* Live Subtitle Overlay */}
        {activeSubtitle && (
          <div className="absolute bottom-14 left-4 right-4 z-10 flex justify-center pointer-events-none">
            <div className="px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-xs text-white text-xs sm:text-sm font-semibold text-center max-w-lg shadow">
              {activeSubtitle}
            </div>
          </div>
        )}

        {/* Touch Lock Overlay Guard */}
        {touchLocked && (
          <div className="absolute inset-0 z-30 pointer-events-auto flex items-end justify-center pb-5">
            <button
              type="button"
              onClick={() => setTouchLocked(false)}
              className="min-h-[44px] px-4 rounded-full bg-amber-500/95 text-zinc-950 text-xs font-extrabold flex items-center gap-2 shadow-2xl border border-amber-300"
            >
              <Unlock className="w-4 h-4" />
              <span>Nhấn để mở khóa thao tác chạm</span>
            </button>
          </div>
        )}

        {/* Auto-play Next Episode Overlay */}
        {nextEpCountdown !== null && nextEpisode && !touchLocked && (
          <div className="absolute inset-0 z-25 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-3">
            <p className="text-xs text-zinc-400">Tự động phát tập tiếp theo sau {nextEpCountdown}s</p>
            <h4 className="text-sm font-bold text-white">{nextEpisode.title}</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNextEpCountdown(null)}
                className="min-h-[42px] px-4 rounded-xl bg-white/10 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setNextEpCountdown(null);
                  onSelectEpisode(nextEpisode.episodeNumber);
                }}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <SkipForward className="w-4 h-4" />
                <span>Xem ngay</span>
              </button>
            </div>
          </div>
        )}

        {/* Transport Overlay Controls (hidden when Touch Lock is ON) */}
        {!touchLocked && controlsVisible && (
          <div className="absolute inset-0 z-20 p-3 sm:p-4 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/15 to-black/65 pointer-events-none">
            {/* Top Bar inside Viewport */}
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              {(theaterMode || isFullscreen) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isFullscreen) handleToggleFullscreen();
                    else setTheaterMode(false);
                  }}
                  className="min-h-[44px] min-w-[44px] rounded-full bg-black/50 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <span className="text-[11px] font-bold text-zinc-200 px-2 py-1 rounded bg-black/45">
                  {quality} · {access.adFree ? 'Không quảng cáo' : 'Chuẩn'}
                </span>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTouchLocked(true)}
                  className="min-h-[40px] min-w-[40px] rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center"
                  title="Khóa thao tác chạm"
                >
                  <Lock className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSubtitleLang((l) => (l === 'vi' ? 'en' : l === 'en' ? 'off' : 'vi'))}
                  className={`min-h-[40px] px-2.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                    subtitleLang !== 'off' ? 'bg-rose-600 text-white' : 'bg-black/50 text-zinc-300'
                  }`}
                  title="Phụ đề"
                >
                  <Captions className="w-4 h-4" />
                  <span>{subtitleLang === 'off' ? 'Tắt' : subtitleLang.toUpperCase()}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleTogglePip()}
                  className="min-h-[40px] min-w-[40px] rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center"
                  title="Hình trong hình (PiP)"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab((t) => (t === 'none' ? 'quality' : 'none'))}
                  className="min-h-[40px] min-w-[40px] rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center"
                  title="Cài đặt phát"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Center Transport */}
            <div className="flex items-center justify-center gap-5 pointer-events-auto">
              <button
                type="button"
                onClick={() => seekBy(-10)}
                className="min-h-[46px] min-w-[46px] rounded-full bg-black/55 backdrop-blur-xs flex items-center justify-center hover:bg-black/75"
              >
                <Rewind className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="min-h-[56px] min-w-[56px] rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-white" />}
              </button>
              <button
                type="button"
                onClick={() => seekBy(10)}
                className="min-h-[46px] min-w-[46px] rounded-full bg-black/55 backdrop-blur-xs flex items-center justify-center hover:bg-black/75"
              >
                <FastForward className="w-5 h-5" />
              </button>
            </div>

            {/* Bottom Scrub & Screen Controls */}
            <div className="space-y-1.5 pointer-events-auto">
              <div className="flex items-center gap-2 touch-none">
                <span className="text-[11px] font-mono tabular-nums text-zinc-200 w-10 text-right">
                  {formatSec(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={durationSec}
                  value={Math.floor(currentTime)}
                  onChange={(e) => {
                    setNextEpCountdown(null);
                    setCurrentTime(Number(e.target.value));
                  }}
                  className="flex-1 accent-rose-500 h-2 cursor-pointer"
                />
                <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10">
                  {formatSec(durationSec)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="min-h-[38px] min-w-[38px] rounded-lg bg-white/10 flex items-center justify-center"
                  >
                    {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      setMuted(v === 0);
                    }}
                    className="w-20 accent-white h-1.5 cursor-pointer"
                  />
                  {nextEpisode && (
                    <button
                      type="button"
                      onClick={() => onSelectEpisode(nextEpisode.episodeNumber)}
                      className="min-h-[38px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      <span>Tập sau</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTheaterMode((v) => !v)}
                    className={`min-h-[38px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${
                      theaterMode ? 'bg-rose-600 text-white' : 'bg-white/10 text-zinc-200'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Rạp phim</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="min-h-[38px] min-w-[38px] rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                    title="Toàn màn hình"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Player Settings & Episode Panel */}
      {!isFullscreen && !theaterMode && (
        <div className="flex-1 overflow-y-auto os-scroll bg-zinc-950 p-3.5 space-y-4">
          {/* Quick Selector Pills Bar */}
          <div className="flex items-center gap-2 overflow-x-auto os-scroll-hidden pb-1">
            <button
              type="button"
              onClick={() => setSettingsTab((t) => (t === 'quality' ? 'none' : 'quality'))}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold shrink-0 border ${
                settingsTab === 'quality' ? 'border-rose-500 bg-rose-500/15 text-rose-300' : 'border-white/10 bg-zinc-900 text-zinc-200'
              }`}
            >
              Chất lượng: {quality}
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab((t) => (t === 'speed' ? 'none' : 'speed'))}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold shrink-0 border ${
                settingsTab === 'speed' ? 'border-rose-500 bg-rose-500/15 text-rose-300' : 'border-white/10 bg-zinc-900 text-zinc-200'
              }`}
            >
              Tốc độ: {playbackSpeed}x
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab((t) => (t === 'subtitle' ? 'none' : 'subtitle'))}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold shrink-0 border ${
                settingsTab === 'subtitle' ? 'border-rose-500 bg-rose-500/15 text-rose-300' : 'border-white/10 bg-zinc-900 text-zinc-200'
              }`}
            >
              Phụ đề: {subtitleLang === 'off' ? 'Tắt' : subtitleLang === 'vi' ? 'Tiếng Việt' : 'English'}
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab((t) => (t === 'audio' ? 'none' : 'audio'))}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold shrink-0 border ${
                settingsTab === 'audio' ? 'border-rose-500 bg-rose-500/15 text-rose-300' : 'border-white/10 bg-zinc-900 text-zinc-200'
              }`}
            >
              Âm thanh: {audioTrack === 'original' ? 'Nguyên bản' : 'Lồng tiếng Việt'}
            </button>
          </div>

          {/* Sub-menu Panels */}
          {settingsTab === 'quality' && (
            <div className="rounded-2xl bg-zinc-900 border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">Chọn độ phân giải phát</span>
                <span className="text-[11px] text-zinc-400">Giới hạn gói hiện tại: {access.maxQuality}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ALL_QUALITIES.map((q, idx) => {
                  const sourceAllows = access.availableQualities.includes(q);
                  const planAllows = idx <= maxQualityIndex;
                  const unlocked = sourceAllows && planAllows;
                  const active = quality === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        if (!sourceAllows) return;
                        if (!planAllows) {
                          onRequestUpgrade();
                          return;
                        }
                        setQuality(q);
                        setSettingsTab('none');
                      }}
                      disabled={!sourceAllows}
                      className={`min-h-[42px] px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border ${
                        !sourceAllows
                          ? 'opacity-35 border-white/5 bg-zinc-950 text-zinc-500'
                          : active
                          ? 'border-rose-500 bg-rose-600 text-white'
                          : planAllows
                          ? 'border-white/10 bg-zinc-950 text-zinc-200'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      <span>{q}</span>
                      {!planAllows && sourceAllows && <Crown className="w-3 h-3" />}
                      {active && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {settingsTab === 'speed' && (
            <div className="rounded-2xl bg-zinc-900 border border-white/10 p-3 space-y-2">
              <p className="text-xs font-bold text-white">Tốc độ phát</p>
              <div className="flex flex-wrap gap-2">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => {
                      setPlaybackSpeed(sp);
                      setSettingsTab('none');
                    }}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-bold ${
                      playbackSpeed === sp ? 'bg-rose-600 text-white' : 'bg-zinc-950 text-zinc-300 border border-white/10'
                    }`}
                  >
                    {sp === 1 ? 'Chuẩn (1x)' : `${sp}x`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {settingsTab === 'subtitle' && (
            <div className="rounded-2xl bg-zinc-900 border border-white/10 p-3 space-y-2">
              <p className="text-xs font-bold text-white">Ngôn ngữ phụ đề</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['vi', 'Tiếng Việt'],
                    ['en', 'English'],
                    ['off', 'Tắt phụ đề'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSubtitleLang(id);
                      setSettingsTab('none');
                    }}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-bold ${
                      subtitleLang === id ? 'bg-rose-600 text-white' : 'bg-zinc-950 text-zinc-300 border border-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {settingsTab === 'audio' && (
            <div className="rounded-2xl bg-zinc-900 border border-white/10 p-3 space-y-2">
              <p className="text-xs font-bold text-white">Kênh âm thanh (Audio Track)</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAudioTrack('original');
                    setSettingsTab('none');
                  }}
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-bold ${
                    audioTrack === 'original' ? 'bg-rose-600 text-white' : 'bg-zinc-950 text-zinc-300 border border-white/10'
                  }`}
                >
                  Nguyên bản + Phụ đề
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAudioTrack('vi_dub');
                    setSettingsTab('none');
                  }}
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-bold ${
                    audioTrack === 'vi_dub' ? 'bg-rose-600 text-white' : 'bg-zinc-950 text-zinc-300 border border-white/10'
                  }`}
                >
                  Lồng tiếng Việt Stereo
                </button>
              </div>
            </div>
          )}

          {/* Episode List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-400">Danh sách tập ({movie.episodes.length})</h4>
            <div className="space-y-2">
              {movie.episodes.map((ep) => {
                const active = ep.episodeNumber === episode.episodeNumber;
                return (
                  <button
                    key={ep.episodeNumber}
                    type="button"
                    disabled={touchLocked}
                    onClick={() => onSelectEpisode(ep.episodeNumber)}
                    className={`w-full min-h-[56px] p-3 rounded-2xl border text-left flex items-center justify-between gap-3 ${
                      active
                        ? 'border-rose-500 bg-rose-500/15'
                        : 'border-white/10 bg-zinc-900/70 hover:border-white/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{ep.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">{ep.synopsis}</p>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 shrink-0">{ep.durationLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
