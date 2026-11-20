import React from 'react';
import {
  Wifi,
  Bluetooth,
  Plane,
  Radio,
  Flashlight,
  Moon,
  Sun,
  BatteryCharging,
  BellOff,
  Camera,
  Settings,
  Smartphone,
  Share2,
  X,
  Volume2,
  SunMedium,
  Shield,
  Nfc,
  Focus,
  Lock,
  CircleDot,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music2,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';

export function ControlCenter({
  onCaptureScreen,
  onToggleScreenRecord,
}: {
  onCaptureScreen?: () => void;
  onToggleScreenRecord?: () => void;
}) {
  const {
    data,
    controlCenterOpen,
    setControlCenterOpen,
    updateProfile,
    flashlightOn,
    setFlashlightOn,
    tabletMode,
    setTabletMode,
    openApp,
    lockPhone,
    screenRecording,
    showToast,
    currentTrack,
    musicPlaying,
    toggleMusic,
    nextTrack,
    prevTrack,
    activeYouTube,
    toggleYouTubePlay,
    stopYouTubeVideo,
  } = useOS();

  if (!controlCenterOpen || !data) return null;
  const p = data.profile;

  const toggle = async (field: string, currentVal: number | undefined, label: string, simNote?: string) => {
    const next = currentVal ? 0 : 1;
    await updateProfile({ [field]: next });
    if (simNote) {
      showToast(label, `${next ? 'Đã bật' : 'Đã tắt'} (${simNote})`);
    }
  };

  const cycleSoundProfile = async () => {
    const cur = p.sound_profile || 'normal';
    const next = cur === 'normal' ? 'vibrate' : cur === 'vibrate' ? 'silent' : 'normal';
    await updateProfile({ sound_profile: next, silent_mode: next === 'silent' ? 1 : 0 });
    showToast('Chế độ âm thanh', next === 'normal' ? 'Chuông & Rung' : next === 'vibrate' ? 'Chỉ rung' : 'Im lặng');
  };

  return (
    <div
      onClick={() => setControlCenterOpen(false)}
      className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xl p-4 flex flex-col justify-between text-white overflow-y-auto os-scroll"
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-3.5 mt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold tracking-wide text-white/80">Trung tâm Điều khiển 4.0</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => lockPhone()}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
              title="Khóa màn hình ngay"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setControlCenterOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connectivity Grid (8 tiles) */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => toggle('wifi_on', p.wifi_on, 'Wi-Fi', 'Mô phỏng mạng')}
            onContextMenu={(e) => {
              e.preventDefault();
              openApp('settings', { tab: 'network' });
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.wifi_on ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span className="text-[10px] font-medium truncate max-w-full">{p.wifi_on ? p.selected_wifi || 'Wi-Fi' : 'Wi-Fi'}</span>
          </button>

          <button
            onClick={() => toggle('bluetooth_on', p.bluetooth_on, 'Bluetooth', 'Mô phỏng nội bộ')}
            onContextMenu={(e) => {
              e.preventDefault();
              openApp('settings', { tab: 'network' });
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.bluetooth_on ? 'bg-blue-500 text-white border-blue-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            <span className="text-[10px] font-medium">Bluetooth</span>
          </button>

          <button
            onClick={() => toggle('airplane_mode', p.airplane_mode, 'Chế độ Máy bay', 'Chế độ mô phỏng')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.airplane_mode ? 'bg-amber-500 text-black border-amber-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Plane className="w-4 h-4" />
            <span className="text-[10px] font-medium">Máy bay</span>
          </button>

          <button
            onClick={() => toggle('mobile_data_on', p.mobile_data_on, 'Dữ liệu 5G', 'Mô phỏng 5G')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.mobile_data_on && !p.airplane_mode ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span className="text-[10px] font-medium">5G</span>
          </button>

          <button
            onClick={() => toggle('vpn_on', p.vpn_on, 'VPN', 'Mô phỏng đường hầm bảo mật')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.vpn_on ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span className="text-[10px] font-medium">VPN</span>
          </button>

          <button
            onClick={() => toggle('nfc_on', p.nfc_on, 'NFC', 'Mô phỏng chạm NFC')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border transition-colors ${
              p.nfc_on ? 'bg-cyan-500 text-white border-cyan-400' : 'bg-white/10 text-white/70 border-white/10'
            }`}
          >
            <Nfc className="w-4 h-4" />
            <span className="text-[10px] font-medium">NFC</span>
          </button>

          <button
            onClick={() => toggle('hotspot_on', p.hotspot_on, 'Phát Wi-Fi', 'Mô phỏng nội bộ')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              p.hotspot_on ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-white/10 text-white/75 border-white/10'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span className="text-[10px]">Phát sóng</span>
          </button>

          <button
            onClick={cycleSoundProfile}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              p.sound_profile === 'silent'
                ? 'bg-rose-500 text-white border-rose-400'
                : p.sound_profile === 'vibrate'
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            {p.sound_profile === 'silent' ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="text-[10px]">
              {p.sound_profile === 'silent' ? 'Im lặng' : p.sound_profile === 'vibrate' ? 'Chỉ rung' : 'Chuông'}
            </span>
          </button>
        </div>

        {/* Sliders */}
        <div className="p-3 rounded-3xl bg-white/10 border border-white/10 space-y-2.5">
          <div className="flex items-center gap-3">
            <SunMedium className="w-4 h-4 text-amber-300 shrink-0" />
            <input
              type="range"
              min={30}
              max={100}
              value={p.brightness}
              onChange={(e) => updateProfile({ brightness: Number(e.target.value) })}
              className="flex-1 accent-[#A78BFA]"
              aria-label="Độ sáng"
            />
            <span className="text-xs font-mono-num w-9 text-right">{p.brightness}%</span>
          </div>
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-purple-300 shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              value={p.volume}
              onChange={(e) => updateProfile({ volume: Number(e.target.value), vol_media: Number(e.target.value) })}
              className="flex-1 accent-[#F472B6]"
              aria-label="Âm lượng"
            />
            <span className="text-xs font-mono-num w-9 text-right">{p.volume}%</span>
          </div>
        </div>

        {/* Synced Media Controller */}
        {activeYouTube ? (
          <div className="p-3 rounded-3xl bg-white/10 border border-white/10 flex items-center gap-3">
            <button
              onClick={() => openApp('youtube')}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <img
                src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
                alt=""
                className="w-10 h-10 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{activeYouTube.title}</p>
                <p className="text-[10px] text-rose-300 truncate">Phát nền YouTube · {activeYouTube.channelTitle}</p>
              </div>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={toggleYouTubePlay} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center">
                {activeYouTube.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button onClick={stopYouTubeVideo} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20" title="Dừng YouTube">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : currentTrack ? (
          <div className="p-3 rounded-3xl bg-white/10 border border-white/10 flex items-center gap-3">
            <button
              onClick={() => openApp('musichub')}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <img src={currentTrack.cover} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{currentTrack.title}</p>
                <p className="text-[10px] text-white/60 truncate flex items-center gap-1">
                  <Music2 className="w-3 h-3 text-pink-300" /> {currentTrack.artist}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={prevTrack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={toggleMusic} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center">
                {musicPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button onClick={nextTrack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* System Controls */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              const next = !flashlightOn;
              setFlashlightOn(next);
              showToast('Đèn pin', next ? 'Đã bật đèn pin màn hình mô phỏng' : 'Đã tắt đèn pin');
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              flashlightOn ? 'bg-white text-black border-white' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <Flashlight className="w-4 h-4" />
            <span className="text-[10px]">Đèn pin</span>
          </button>

          <button
            onClick={() => updateProfile({ theme: p.theme === 'dark' ? 'light' : 'dark' })}
            className="p-2.5 rounded-2xl bg-white/10 border border-white/10 flex flex-col items-center gap-1 hover:bg-white/15"
          >
            {p.theme === 'dark' ? <Moon className="w-4 h-4 text-purple-300" /> : <Sun className="w-4 h-4 text-amber-300" />}
            <span className="text-[10px]">{p.theme === 'dark' ? 'Tối' : 'Sáng'}</span>
          </button>

          <button
            onClick={() => toggle('dnd', p.dnd, 'Không làm phiền')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              p.dnd ? 'bg-[#A78BFA] text-white border-purple-300' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <BellOff className="w-4 h-4" />
            <span className="text-[10px]">DND</span>
          </button>

          <button
            onClick={() => {
              const nextFocus = p.focus_mode && p.focus_mode !== 'off' ? 'off' : 'work';
              updateProfile({ focus_mode: nextFocus });
              showToast('Chế độ Tập trung', nextFocus === 'off' ? 'Đã tắt Tập trung' : 'Đã bật Tập trung: Làm việc');
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              p.focus_mode && p.focus_mode !== 'off' ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <Focus className="w-4 h-4" />
            <span className="text-[10px]">Tập trung</span>
          </button>

          <button
            onClick={() => toggle('battery_saver', p.battery_saver, 'Tiết kiệm pin')}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              p.battery_saver ? 'bg-amber-400 text-black border-amber-300' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <BatteryCharging className="w-4 h-4" />
            <span className="text-[10px]">Tiết kiệm</span>
          </button>

          <button
            onClick={() => {
              setControlCenterOpen(false);
              onCaptureScreen?.();
            }}
            className="p-2.5 rounded-2xl bg-white/10 border border-white/10 flex flex-col items-center gap-1 hover:bg-white/15"
          >
            <Camera className="w-4 h-4" />
            <span className="text-[10px]">Chụp MH</span>
          </button>

          <button
            onClick={() => {
              setControlCenterOpen(false);
              onToggleScreenRecord?.();
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              screenRecording ? 'bg-rose-500 text-white border-rose-400' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <CircleDot className="w-4 h-4" />
            <span className="text-[10px]">{screenRecording ? 'Dừng quay' : 'Quay MH'}</span>
          </button>

          <button
            onClick={() => {
              setTabletMode(!tabletMode);
              showToast('Bố cục', !tabletMode ? 'Máy tính bảng mở rộng' : 'Điện thoại Android');
            }}
            className={`p-2.5 rounded-2xl flex flex-col items-center gap-1 border ${
              tabletMode ? 'bg-pink-500 text-white border-pink-400' : 'bg-white/10 text-white/80 border-white/10'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span className="text-[10px]">Tablet</span>
          </button>
        </div>

        <button
          onClick={() => openApp('settings')}
          className="w-full py-2.5 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-xs font-medium hover:bg-white/15"
        >
          <Settings className="w-4 h-4" /> Mở Cài đặt Hệ thống đầy đủ
        </button>
      </div>

      <p className="text-[10px] text-center text-white/50 pt-2">
        Giữ/Chuột phải Wi-Fi & Bluetooth để mở nhanh Cài đặt mạng · Các nút kết nối hoạt động ở chế độ mô phỏng.
      </p>
    </div>
  );
}

