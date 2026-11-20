import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FastForward,
  Gauge,
  GripHorizontal,
  GripVertical,
  Headphones,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Rewind,
  SkipForward,
  Tv,
  X,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import { useDraggablePopup } from './useDraggablePopup';

interface SlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function PersistentYouTubePlayer() {
  const {
    data,
    bootComplete,
    isLocked,
    activeApp,
    floatingApp,
    activeYouTube,
    toggleYouTubePlay,
    setYouTubePlayingState,
    toggleYouTubeBackgroundMode,
    setYouTubeFullscreen,
    seekYouTubeTo,
    setYouTubePlaybackRate,
    setYouTubeProgress,
    playNextYouTubeVideo,
    stopYouTubeVideo,
    openApp,
  } = useOS();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [slotRect, setSlotRect] = useState<SlotRect | null>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const lastInternalSyncRef = useRef<number>(0);
  const lastSavedProgressAtRef = useRef<number>(0);
  const lastSeekSeqRef = useRef<number>(0);
  const hudTimerRef = useRef<number | null>(null);

  const isInYouTubeApp = !isLocked && (activeApp === 'youtube' || floatingApp === 'youtube');
  const isFullscreen = Boolean(bootComplete && activeYouTube && isInYouTubeApp && activeYouTube.isFullscreen);

  const isMiniPipMode = Boolean(
    bootComplete && activeYouTube && !isLocked && !isInYouTubeApp && !activeYouTube.backgroundMode
  );
  const isBgAudioMode = Boolean(
    bootComplete && activeYouTube && !isLocked && !isInYouTubeApp && activeYouTube.backgroundMode
  );

  const videoPipDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    disabled: !isMiniPipMode,
    resetKey: `${activeYouTube?.videoId ?? ''}-${isMiniPipMode ? 'pip' : 'other'}`,
  });

  const audioPillDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    disabled: !isBgAudioMode,
    resetKey: `${activeYouTube?.videoId ?? ''}-${isBgAudioMode ? 'bg' : 'other'}`,
  });

  const sendCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // ignore cross-origin postMessage errors
    }
  }, []);

  const persistProgress = useCallback(
    (force = false) => {
      if (!activeYouTube) return;
      const now = Date.now();
      if (!force && now - lastSavedProgressAtRef.current < 4800) return;
      if (activeYouTube.progressSec < 2) return;
      lastSavedProgressAtRef.current = now;
      osApi
        .saveYoutubeProgress({
          video_id: activeYouTube.videoId,
          title: activeYouTube.title,
          channel_title: activeYouTube.channelTitle,
          thumbnail_url: activeYouTube.thumbnail,
          duration_label: activeYouTube.durationLabel,
          progress_sec: Math.floor(activeYouTube.progressSec),
          duration_sec: Math.floor(activeYouTube.durationSec || 0),
        })
        .catch(() => {});
    },
    [activeYouTube]
  );

  // Measure [data-yt-slot="true"] relative to [data-phone-frame="true"]
  useLayoutEffect(() => {
    if (!bootComplete || !activeYouTube || !isInYouTubeApp || isFullscreen) {
      setSlotRect(null);
      return;
    }

    let rafId = 0;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    const measure = () => {
      const frame = document.querySelector('[data-phone-frame="true"]') as HTMLElement | null;
      const slot = document.querySelector('[data-yt-slot="true"]') as HTMLElement | null;
      if (!frame || !slot) {
        setSlotRect(null);
        return;
      }
      const fRect = frame.getBoundingClientRect();
      const sRect = slot.getBoundingClientRect();
      if (sRect.width > 0 && sRect.height > 0) {
        const next: SlotRect = {
          top: Math.round(sRect.top - fRect.top),
          left: Math.round(sRect.left - fRect.left),
          width: Math.round(sRect.width),
          height: Math.round(sRect.height),
        };
        setSlotRect((prev) =>
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
            ? prev
            : next
        );
      }
    };

    const attachObservers = () => {
      measure();
      const frame = document.querySelector('[data-phone-frame="true"]');
      const slot = document.querySelector('[data-yt-slot="true"]');
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(measure);
        if (frame) ro.observe(frame);
        if (slot) ro.observe(slot);
      }
      if (frame && typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(() => {
          const found = document.querySelector('[data-yt-slot="true"]');
          if (found) {
            measure();
            ro?.observe(found);
          } else {
            setSlotRect(null);
          }
        });
        mo.observe(frame, { childList: true, subtree: true });
      }
    };

    rafId = requestAnimationFrame(attachObservers);
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [bootComplete, activeYouTube?.videoId, isInYouTubeApp, isFullscreen]);

  // Listen to YouTube IFrame infoDelivery (state, currentTime, duration)
  useEffect(() => {
    if (!activeYouTube) return;
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com')) return;
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.event === 'infoDelivery' && payload?.info) {
          const info = payload.info as {
            playerState?: number;
            currentTime?: number;
            duration?: number;
          };
          if (typeof info.playerState === 'number') {
            if (info.playerState === 1) {
              lastInternalSyncRef.current = Date.now();
              setYouTubePlayingState(true);
            } else if (info.playerState === 2) {
              lastInternalSyncRef.current = Date.now();
              setYouTubePlayingState(false);
              persistProgress(true);
            } else if (info.playerState === 0) {
              lastInternalSyncRef.current = Date.now();
              setYouTubePlayingState(false);
              persistProgress(true);
              if (activeYouTube.queue.length > 1) {
                playNextYouTubeVideo();
              }
            }
          }
          if (typeof info.currentTime === 'number' || typeof info.duration === 'number') {
            setYouTubeProgress(
              typeof info.currentTime === 'number' ? info.currentTime : activeYouTube.progressSec,
              typeof info.duration === 'number' ? info.duration : activeYouTube.durationSec
            );
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    activeYouTube?.videoId,
    activeYouTube?.queue.length,
    activeYouTube?.progressSec,
    activeYouTube?.durationSec,
    setYouTubePlayingState,
    setYouTubeProgress,
    playNextYouTubeVideo,
    persistProgress,
  ]);

  // Periodic progress save while playing
  useEffect(() => {
    if (!activeYouTube?.isPlaying) return;
    const id = window.setInterval(() => {
      persistProgress(false);
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeYouTube?.isPlaying, persistProgress]);

  // Send play/pause commands when OS state changes externally
  useEffect(() => {
    if (!activeYouTube || Date.now() - lastInternalSyncRef.current < 250) return;
    sendCommand(activeYouTube.isPlaying ? 'playVideo' : 'pauseVideo');
  }, [activeYouTube?.isPlaying, activeYouTube?.videoId, sendCommand]);

  // Handle seek requests
  useEffect(() => {
    if (!activeYouTube?.seekRequest) return;
    if (activeYouTube.seekRequest.seq === lastSeekSeqRef.current) return;
    lastSeekSeqRef.current = activeYouTube.seekRequest.seq;
    sendCommand('seekTo', [activeYouTube.seekRequest.sec, true]);
  }, [activeYouTube?.seekRequest, sendCommand]);

  // Handle playback rate changes
  useEffect(() => {
    if (!activeYouTube) return;
    sendCommand('setPlaybackRate', [activeYouTube.playbackRate || 1]);
  }, [activeYouTube?.playbackRate, activeYouTube?.videoId, sendCommand]);

  // Sync media volume
  useEffect(() => {
    if (!activeYouTube) return;
    const vol = data?.profile?.vol_media ?? data?.profile?.volume ?? 75;
    sendCommand('setVolume', [vol]);
  }, [data?.profile?.vol_media, data?.profile?.volume, activeYouTube?.videoId, sendCommand]);

  // Auto-hide fullscreen HUD
  const bumpHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      setHudVisible(false);
      setRateMenuOpen(false);
    }, 3200);
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      bumpHud();
    } else {
      setHudVisible(true);
      setRateMenuOpen(false);
    }
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    };
  }, [isFullscreen, bumpHud]);

  if (!bootComplete || !activeYouTube) return null;

  const isAudioOnlyHidden =
    isLocked || (!isInYouTubeApp && activeYouTube.backgroundMode) || (isInYouTubeApp && !slotRect && !isFullscreen);
  const isMiniPipVideo = !isLocked && !isInYouTubeApp && !activeYouTube.backgroundMode;
  const isDockedInApp = isInYouTubeApp && !isFullscreen && Boolean(slotRect);

  const originParam = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
  const startParam = activeYouTube.progressSec > 4 ? `&start=${Math.floor(activeYouTube.progressSec)}` : '';
  const embedSrc = `https://www.youtube.com/embed/${activeYouTube.videoId}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&modestbranding=1&controls=${
    isFullscreen ? '0' : '1'
  }${startParam}${originParam}`;

  const wrapperStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        backgroundColor: '#000',
      }
    : isDockedInApp && slotRect
      ? {
          position: 'absolute',
          top: slotRect.top,
          left: slotRect.left,
          width: slotRect.width,
          height: slotRect.height,
          zIndex: floatingApp === 'youtube' ? 36 : 20,
        }
      : isMiniPipVideo
        ? {
            position: 'absolute',
            bottom: 52,
            right: 12,
            width: 228,
            zIndex: 32,
            ...videoPipDrag.popupStyle,
          }
        : {
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 0,
          };

  const duration = Math.max(activeYouTube.durationSec || 0, activeYouTube.progressSec || 0);

  return (
    <>
      <div
        ref={isMiniPipVideo ? videoPipDrag.popupRef : undefined}
        style={wrapperStyle}
        className={
          isMiniPipVideo
            ? 'rounded-2xl overflow-hidden bg-zinc-950/95 border border-white/15 shadow-2xl backdrop-blur-xl flex flex-col'
            : isFullscreen
              ? 'flex flex-col bg-black select-none'
              : ''
        }
      >
        {isMiniPipVideo && (
          <div
            {...videoPipDrag.handleProps}
            title="Kéo để di chuyển cửa sổ video (nhấp đúp để đặt lại)"
            className="px-2 py-1.5 bg-zinc-900/95 text-white flex items-center justify-between gap-1.5 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
          >
            <GripHorizontal className="w-3 h-3 text-white/45 shrink-0" />
            <span className="text-[10px] font-semibold truncate flex-1">{activeYouTube.title}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleYouTubePlay}
                className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25"
                title={activeYouTube.isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
              >
                {activeYouTube.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>
              <button
                onClick={toggleYouTubeBackgroundMode}
                className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/25"
                title="Thu gọn phát nền"
              >
                <Headphones className="w-3 h-3 text-rose-300" />
              </button>
              <button
                onClick={() => openApp('youtube')}
                className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/25"
                title="Mở lại YouTube"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  persistProgress(true);
                  stopYouTubeVideo();
                }}
                className="w-6 h-6 rounded-full hover:bg-rose-500/30 text-zinc-300 flex items-center justify-center"
                title="Đóng trình phát"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <div
          className={`relative ${isMiniPipVideo ? 'aspect-video w-full bg-black' : 'w-full h-full bg-black'} ${
            videoPipDrag.isDragging ? 'pointer-events-none' : ''
          }`}
        >
          <iframe
            ref={iframeRef}
            key={activeYouTube.videoId}
            src={embedSrc}
            title={activeYouTube.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => {
              const win = iframeRef.current?.contentWindow;
              if (!win) return;
              try {
                win.postMessage(JSON.stringify({ event: 'listening', id: activeYouTube.videoId }), '*');
                const vol = data?.profile?.vol_media ?? data?.profile?.volume ?? 75;
                win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [vol] }), '*');
                if (activeYouTube.playbackRate && activeYouTube.playbackRate !== 1) {
                  win.postMessage(
                    JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [activeYouTube.playbackRate] }),
                    '*'
                  );
                }
              } catch {
                // ignore
              }
            }}
            className="w-full h-full border-0"
          />

          {/* Quick Fullscreen trigger in Docked Watch View */}
          {isDockedInApp && (
            <button
              onClick={() => setYouTubeFullscreen(true)}
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center border border-white/15 transition-colors"
              title="Toàn màn hình trong điện thoại"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen Tap Layer & Auto-Hiding Custom Controls */}
          {isFullscreen && (
            <div
              onClick={() => {
                if (hudVisible) {
                  setHudVisible(false);
                  setRateMenuOpen(false);
                } else {
                  bumpHud();
                }
              }}
              className="absolute inset-0 z-20 flex flex-col justify-between"
            >
              {/* Top Bar */}
              <div
                onClick={(e) => e.stopPropagation()}
                className={`p-3 pt-safe bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-center justify-between gap-2 text-white transition-opacity duration-200 ${
                  hudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{activeYouTube.title}</p>
                  <p className="text-[11px] text-white/70 truncate">{activeYouTube.channelTitle}</p>
                </div>
                <div className="relative flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      bumpHud();
                      setRateMenuOpen((v) => !v);
                    }}
                    className="min-h-[36px] px-2.5 rounded-xl bg-white/15 text-xs font-semibold flex items-center gap-1"
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span>{activeYouTube.playbackRate}x</span>
                  </button>
                  {rateMenuOpen && (
                    <div className="absolute right-0 top-10 rounded-xl bg-zinc-900/95 border border-white/15 p-1 flex gap-1 shadow-2xl">
                      {RATES.map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setYouTubePlaybackRate(r);
                            setRateMenuOpen(false);
                            bumpHud();
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${
                            activeYouTube.playbackRate === r ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {r}x
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setYouTubeFullscreen(false)}
                    className="min-h-[36px] min-w-[36px] rounded-xl bg-white/15 flex items-center justify-center"
                    title="Thoát toàn màn hình"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Center Transport Controls */}
              <div
                onClick={(e) => e.stopPropagation()}
                className={`flex items-center justify-center gap-6 text-white transition-opacity duration-200 ${
                  hudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  onClick={() => {
                    bumpHud();
                    seekYouTubeTo(Math.max(0, activeYouTube.progressSec - 10));
                  }}
                  className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center active:scale-95"
                  title="Tua lùi 10 giây"
                >
                  <Rewind className="w-4 h-4" />
                  <span className="text-[9px] font-mono-num -mt-0.5">-10s</span>
                </button>
                <button
                  onClick={() => {
                    bumpHud();
                    toggleYouTubePlay();
                  }}
                  className="w-14 h-14 rounded-full bg-rose-600/95 text-white shadow-xl flex items-center justify-center active:scale-95"
                  title={activeYouTube.isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                  {activeYouTube.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </button>
                <button
                  onClick={() => {
                    bumpHud();
                    seekYouTubeTo(activeYouTube.progressSec + 10);
                  }}
                  className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center active:scale-95"
                  title="Tua tới 10 giây"
                >
                  <FastForward className="w-4 h-4" />
                  <span className="text-[9px] font-mono-num -mt-0.5">+10s</span>
                </button>
              </div>

              {/* Bottom Scrub & Next Bar */}
              <div
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className={`p-3 pb-safe bg-gradient-to-t from-black/90 via-black/55 to-transparent text-white space-y-2 transition-opacity duration-200 ${
                  hudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-2.5 touch-none">
                  <span className="text-[11px] font-mono-num tabular-nums w-11 text-right">
                    {formatSec(activeYouTube.progressSec)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(duration))}
                    value={Math.min(Math.floor(activeYouTube.progressSec), Math.max(1, Math.floor(duration)))}
                    onChange={(e) => {
                      bumpHud();
                      seekYouTubeTo(Number(e.target.value));
                    }}
                    className="flex-1 accent-rose-500 h-1.5 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono-num tabular-nums w-11">
                    {duration > 0 ? formatSec(duration) : activeYouTube.durationLabel || '--:--'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      toggleYouTubeBackgroundMode();
                    }}
                    className="min-h-[36px] px-3 rounded-xl bg-white/12 text-[11px] font-medium flex items-center gap-1.5"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Phát nền</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {activeYouTube.queue.length > 1 && (
                      <button
                        onClick={() => {
                          bumpHud();
                          playNextYouTubeVideo();
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-white/15 text-[11px] font-semibold flex items-center gap-1.5"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>Tiếp theo</span>
                      </button>
                    )}
                    <button
                      onClick={() => setYouTubeFullscreen(false)}
                      className="min-h-[36px] px-3 rounded-xl bg-white/15 text-[11px] font-semibold flex items-center gap-1.5"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>Thu nhỏ</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact Background Audio Pill when minimized outside YouTube */}
      {!isLocked && !isInYouTubeApp && activeYouTube.backgroundMode && isAudioOnlyHidden && (
        <div
          ref={audioPillDrag.popupRef}
          style={{ ...audioPillDrag.popupStyle, ...audioPillDrag.handleProps.style }}
          onPointerDown={audioPillDrag.handleProps.onPointerDown}
          onDoubleClick={audioPillDrag.handleProps.onDoubleClick}
          title="Kéo để di chuyển thanh phát nền"
          className="absolute bottom-14 right-3 z-32 w-[252px] rounded-2xl bg-zinc-900/92 text-white border border-white/15 shadow-2xl backdrop-blur-xl p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
        >
          <GripVertical className="w-3.5 h-3.5 text-white/35 shrink-0 -ml-0.5" />
          <img
            src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
            alt=""
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-xl object-cover shrink-0 pointer-events-none"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold truncate">{activeYouTube.title}</p>
            <p className="text-[9px] text-rose-300 truncate">Phát nền YouTube · {activeYouTube.channelTitle}</p>
          </div>
          <button
            onClick={toggleYouTubePlay}
            className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0"
            title={activeYouTube.isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            {activeYouTube.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <button
            onClick={toggleYouTubeBackgroundMode}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0"
            title="Hiện video nổi PiP"
          >
            <Tv className="w-3 h-3" />
          </button>
          <button
            onClick={() => openApp('youtube')}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0"
            title="Mở YouTube"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              persistProgress(true);
              stopYouTubeVideo();
            }}
            className="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0"
            title="Tắt phát nền"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  );
}
