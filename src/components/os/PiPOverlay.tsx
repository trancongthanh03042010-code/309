import React from 'react';
import { GripVertical, Maximize2, Pause, Play, Podcast, Music2, Video, X } from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { useDraggablePopup } from './useDraggablePopup';

export function PiPOverlay() {
  const {
    pipState,
    setPipState,
    openApp,
    activeApp,
    floatingApp,
    musicPlaying,
    currentTrack,
    toggleMusic,
    activeYouTube,
  } = useOS();

  const youtubeVisibleInPip = Boolean(activeYouTube && activeApp !== 'youtube' && floatingApp !== 'youtube');

  // Auto-show compact music PiP if music is playing outside music app and no explicit PiP or YouTube PiP is active
  const showAutoMusic = !pipState && !youtubeVisibleInPip && musicPlaying && currentTrack && activeApp !== 'music';

  const drag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    resetKey: Boolean(pipState || showAutoMusic),
  });

  if (!pipState && !showAutoMusic) return null;

  const title = pipState ? pipState.title : currentTrack!.title;
  const subtitle = pipState ? pipState.subtitle : currentTrack!.artist;
  const isPlaying = pipState ? pipState.isPlaying : musicPlaying;
  const targetApp = pipState ? pipState.appId : 'music';

  return (
    <div
      ref={drag.popupRef}
      style={{ ...drag.popupStyle, ...drag.handleProps.style }}
      onPointerDown={drag.handleProps.onPointerDown}
      onDoubleClick={drag.handleProps.onDoubleClick}
      title="Kéo để di chuyển cửa sổ thu nhỏ"
      className="absolute bottom-14 right-3 z-30 w-[245px] rounded-2xl bg-zinc-900/92 text-white border border-white/15 shadow-2xl backdrop-blur-xl p-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
    >
      <GripVertical className="w-3.5 h-3.5 text-white/35 shrink-0 -ml-0.5" />
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 pointer-events-none">
        {pipState?.kind === 'podcast' ? (
          <Podcast className="w-4 h-4" />
        ) : pipState?.kind === 'call' ? (
          <Video className="w-4 h-4" />
        ) : (
          <Music2 className="w-4 h-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate">{title}</p>
        <p className="text-[10px] text-white/60 truncate">{subtitle}</p>
      </div>
      <button
        onClick={() => {
          if (pipState) {
            setPipState({ ...pipState, isPlaying: !pipState.isPlaying });
          } else {
            toggleMusic();
          }
        }}
        className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => openApp(targetApp)}
        className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0"
        title="Mở rộng"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
      {pipState && (
        <button
          onClick={() => setPipState(null)}
          className="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
