import React, { useEffect, useRef, useState } from 'react';
import {
  Wifi,
  WifiOff,
  Plane,
  Battery,
  BatteryCharging,
  BellOff,
  VolumeX,
  PhoneCall,
  Pause,
  Play,
  SkipForward,
  Timer,
  Mic,
  Sparkles,
  Signal,
  Shield,
  Focus,
  CircleDot,
  CloudOff,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { useDraggablePopup } from './useDraggablePopup';

export function StatusBarAndIsland({ lightText = false }: { lightText?: boolean }) {
  const {
    data,
    setControlCenterOpen,
    setNotificationCenterOpen,
    activeCall,
    timerSecondsLeft,
    timerRunning,
    pauseTimer,
    musicPlaying,
    currentTrack,
    toggleMusic,
    nextTrack,
    activeYouTube,
    toggleYouTubePlay,
    stopYouTubeVideo,
    cameraActive,
    micActive,
    aiBusyLabel,
    openApp,
    isOnline,
    screenRecording,
    formatTime,
    getNow,
  } = useOS();

  const [now, setNow] = useState(getNow());
  const [islandExpanded, setIslandExpanded] = useState(false);
  const statusTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const islandDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    resetKey: islandExpanded,
  });

  useEffect(() => {
    setNow(getNow());
    const id = setInterval(() => setNow(getNow()), 10000);
    return () => clearInterval(id);
  }, [getNow]);

  const profile = data?.profile;
  const unreadCount = data?.notifications.filter((n) => !n.is_read).length ?? 0;

  const hasIslandActivity =
    Boolean(activeCall) ||
    timerSecondsLeft > 0 ||
    musicPlaying ||
    Boolean(activeYouTube?.isPlaying) ||
    micActive ||
    Boolean(aiBusyLabel) ||
    screenRecording;

  const timeStr = formatTime(now);
  const textTone = lightText ? 'text-white' : 'text-zinc-900 dark:text-zinc-100';

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="relative z-40 shrink-0 select-none pt-safe"
      onTouchStart={(e) => {
        if (profile?.gestures_enabled === 0) return;
        const t = e.touches[0];
        if (t) statusTouchStartRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        if (profile?.gestures_enabled === 0 || !statusTouchStartRef.current) return;
        const t = e.changedTouches[0];
        const start = statusTouchStartRef.current;
        statusTouchStartRef.current = null;
        if (!t) return;
        const dy = t.clientY - start.y;
        const dx = t.clientX - start.x;
        if (dy > 34 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          setNotificationCenterOpen(true);
        }
      }}
    >
      <div className={`flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5 text-[12px] font-medium ${textTone}`}>
        {/* Left: Time + Focus/DND + Notification trigger */}
        <button
          onClick={() => setNotificationCenterOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity"
          title="Mở Trung tâm Thông báo"
        >
          <span className="font-mono-num font-semibold tracking-tight">{timeStr}</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#A78BFA] text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
          {profile?.focus_mode && profile.focus_mode !== 'off' && (
            <Focus className="w-3 h-3 text-indigo-400 shrink-0" />
          )}
          {Boolean(profile?.dnd) && <BellOff className="w-3 h-3 text-purple-400 shrink-0" />}
          {(Boolean(profile?.silent_mode) || profile?.sound_profile === 'silent') && (
            <VolumeX className="w-3 h-3 text-zinc-400 shrink-0" />
          )}
          {!isOnline && <CloudOff className="w-3 h-3 text-rose-400 shrink-0" />}
        </button>

        {/* Center: Dynamic Island */}
        <button
          onClick={() => setIslandExpanded((e) => !e)}
          className={`relative shrink-0 flex items-center justify-center gap-2 rounded-full bg-black text-white transition-all duration-200 border border-white/10 shadow-lg ${
            hasIslandActivity ? 'px-3 py-1 min-w-[126px] max-w-[175px]' : 'w-24 h-[25px]'
          }`}
        >
          {!hasIslandActivity && (
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 ring-1 ring-white/10" />
          )}
          {screenRecording && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-semibold whitespace-nowrap">
              <CircleDot className="w-3 h-3 animate-pulse shrink-0" />
              <span>Đang quay MH</span>
            </div>
          )}
          {!screenRecording && activeCall && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium whitespace-nowrap">
              <PhoneCall className="w-3 h-3 shrink-0" />
              <span className="max-w-[80px] truncate">{activeCall.name}</span>
            </div>
          )}
          {!screenRecording && !activeCall && aiBusyLabel && (
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 whitespace-nowrap">
              <Sparkles className="w-3 h-3 animate-spin shrink-0" />
              <span className="max-w-[90px] truncate">{aiBusyLabel}</span>
            </div>
          )}
          {!screenRecording && !activeCall && !aiBusyLabel && micActive && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-400 whitespace-nowrap">
              <Mic className="w-3 h-3 shrink-0" />
              <span>Đang ghi âm</span>
            </div>
          )}
          {!screenRecording && !activeCall && !aiBusyLabel && !micActive && timerSecondsLeft > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-mono-num whitespace-nowrap">
              <Timer className="w-3 h-3 shrink-0" />
              <span>{formatTimer(timerSecondsLeft)}</span>
            </div>
          )}
          {!screenRecording && !activeCall && !aiBusyLabel && !micActive && timerSecondsLeft === 0 && musicPlaying && currentTrack && (
            <div className="flex items-center gap-1.5 text-[11px] text-pink-300 whitespace-nowrap">
              <img src={currentTrack.cover} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
              <span className="max-w-[88px] truncate">{currentTrack.title}</span>
            </div>
          )}
          {!screenRecording && !activeCall && !aiBusyLabel && !micActive && timerSecondsLeft === 0 && !musicPlaying && activeYouTube?.isPlaying && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-300 whitespace-nowrap">
              <img
                src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
                alt=""
                className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
              />
              <span className="max-w-[88px] truncate">{activeYouTube.title}</span>
            </div>
          )}
        </button>

        {/* Right: Hardware Indicators + Control Center trigger */}
        <button
          onClick={() => setControlCenterOpen(true)}
          className="flex-1 min-w-0 flex items-center justify-end gap-1 hover:opacity-80 transition-opacity"
          title="Mở Trung tâm Điều khiển"
        >
          {(cameraActive || micActive) && (
            <span
              className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400' : 'bg-amber-400'}`}
              title={cameraActive ? 'Máy ảnh đang bật' : 'Micro đang bật'}
            />
          )}
          {Boolean(profile?.vpn_on) && <Shield className="w-3 h-3 text-sky-400 shrink-0" />}
          {profile?.airplane_mode ? (
            <Plane className="w-3.5 h-3.5" />
          ) : (
            <>
              <Signal className="w-3.5 h-3.5" />
              {profile?.wifi_on ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 opacity-50" />}
            </>
          )}
          <div className="flex items-center gap-0.5 font-mono-num text-[11px]">
            {profile?.show_battery_pct !== 0 && <span>{profile?.battery_level ?? 86}%</span>}
            {profile?.charging || profile?.battery_saver ? (
              <BatteryCharging className={`w-4 h-4 ${profile?.charging ? 'text-emerald-400' : 'text-amber-400'}`} />
            ) : (
              <Battery className={`w-4 h-4 ${(profile?.battery_level ?? 86) <= 20 ? 'text-rose-400' : ''}`} />
            )}
          </div>
        </button>
      </div>

      {/* Expanded Dynamic Island Drawer */}
      {islandExpanded && (
        <div
          ref={islandDrag.popupRef}
          style={{ ...islandDrag.popupStyle, ...islandDrag.handleProps.style }}
          onPointerDown={islandDrag.handleProps.onPointerDown}
          onDoubleClick={islandDrag.handleProps.onDoubleClick}
          title="Kéo để di chuyển thẻ Dynamic Island"
          className="mx-4 mt-1 p-3.5 rounded-3xl bg-zinc-950/95 text-white border border-white/10 shadow-2xl backdrop-blur-xl cursor-grab active:cursor-grabbing select-none"
        >
          {activeCall ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={activeCall.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                  alt={activeCall.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{activeCall.name}</p>
                  <p className="text-xs text-emerald-400">
                    {activeCall.status === 'connected' ? 'Đang trong cuộc gọi' : 'Cuộc gọi đến'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIslandExpanded(false);
                  openApp('phone');
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold"
              >
                Mở Điện thoại
              </button>
            </div>
          ) : timerSecondsLeft > 0 ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">Đếm ngược</p>
                <p className="text-xl font-bold font-mono-num text-amber-300">{formatTimer(timerSecondsLeft)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={pauseTimer}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                >
                  {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setIslandExpanded(false);
                    openApp('clock');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-semibold"
                >
                  Đồng hồ
                </button>
              </div>
            </div>
          ) : activeYouTube ? (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setIslandExpanded(false);
                  openApp('youtube');
                }}
                className="flex items-center gap-2.5 min-w-0 text-left"
              >
                <img
                  src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{activeYouTube.title}</p>
                  <p className="text-xs text-rose-400 truncate">YouTube · {activeYouTube.channelTitle}</p>
                </div>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={toggleYouTubePlay} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                  {activeYouTube.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    stopYouTubeVideo();
                    setIslandExpanded(false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 text-[11px] font-semibold"
                >
                  Dừng
                </button>
              </div>
            </div>
          ) : currentTrack ? (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setIslandExpanded(false);
                  openApp('music');
                }}
                className="flex items-center gap-2.5 min-w-0 text-left"
              >
                <img src={currentTrack.cover} alt="" className="w-10 h-10 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{currentTrack.title}</p>
                  <p className="text-xs text-zinc-400 truncate">{currentTrack.artist}</p>
                </div>
              </button>
              <div className="flex items-center gap-1.5">
                <button onClick={toggleMusic} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                  {musicPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={nextTrack} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>PHONE OS Dynamic Island · Hệ thống sẵn sàng</span>
              <button onClick={() => setIslandExpanded(false)} className="text-white underline">
                Đóng
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
