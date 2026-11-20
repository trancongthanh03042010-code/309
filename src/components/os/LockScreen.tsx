import React, { useEffect, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronUp,
  CloudSun,
  Delete,
  Flashlight,
  KeyRound,
  Lock,
  Moon,
  Music2,
  Pause,
  Play,
  SkipForward,
  UserCheck,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import { StatusBarAndIsland } from './StatusBarAndIsland';

export function LockScreen() {
  const {
    data,
    unlockPhone,
    openApp,
    flashlightOn,
    setFlashlightOn,
    weatherSummary,
    showToast,
    updateProfile,
    refreshData,
    formatTime,
    getNow,
    currentTrack,
    musicPlaying,
    toggleMusic,
    nextTrack,
    activeYouTube,
    toggleYouTubePlay,
    stopYouTubeVideo,
  } = useOS();

  const [now, setNow] = useState(getNow());
  const [aodMode, setAodMode] = useState(false);
  const [aodDimmed, setAodDimmed] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [patternEntry, setPatternEntry] = useState<number[]>([]);
  const [passwordEntry, setPasswordEntry] = useState('');
  const [showAuthPad, setShowAuthPad] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryNewPin, setRecoveryNewPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [lockoutLeft, setLockoutLeft] = useState(0);

  useEffect(() => {
    setNow(getNow());
    const id = setInterval(() => setNow(getNow()), 1000);
    return () => clearInterval(id);
  }, [getNow]);

  useEffect(() => {
    if (lockoutLeft <= 0) return;
    const id = setInterval(() => setLockoutLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockoutLeft]);

  const profile = data?.profile;
  const unlockMode = profile?.unlock_mode || 'swipe';
  const hasSecret = Boolean(profile?.has_lock_secret);
  const pinLength = profile?.pin_length || 4;
  const unreadNotifications = data?.notifications.filter((n) => !n.is_read).slice(0, 3) || [];

  useEffect(() => {
    if (!aodMode) {
      setAodDimmed(false);
      return;
    }
    const sec = profile?.aod_timeout_sec ?? 30;
    if (sec <= 0) return;
    const t = setTimeout(() => setAodDimmed(true), sec * 1000);
    return () => clearTimeout(t);
  }, [aodMode, profile?.aod_timeout_sec]);

  const timeStr = formatTime(now);
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

  const clockFontClass =
    profile?.lock_clock_font === 'mono'
      ? 'font-mono-num'
      : profile?.lock_clock_font === 'serif'
        ? 'font-serif'
        : 'font-display';

  const clockSizeClass =
    profile?.lock_clock_style === 'minimal'
      ? 'text-5xl font-semibold'
      : profile?.lock_clock_style === 'editorial'
        ? 'text-6xl sm:text-7xl font-extrabold tracking-tighter'
        : 'text-6xl sm:text-7xl font-bold tracking-tight';

  const verifyWithServer = async (secret: string, clearFn: () => void) => {
    if (lockoutLeft > 0 || verifying) return;
    setVerifying(true);
    try {
      const res = await osApi.verifyLock(secret);
      if (res.ok) {
        clearFn();
        setShowAuthPad(false);
        setAuthError('');
        unlockPhone();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mã mở khóa không đúng';
      setAuthError(msg);
      setTimeout(() => clearFn(), 350);
      const nextFails = (profile?.failed_unlock_count || 0) + 1;
      if (nextFails >= 5) {
        setLockoutLeft(15);
        setAuthError('Sai quá 5 lần. Vui lòng chờ 15 giây.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleUnlockAttempt = () => {
    if (unlockMode === 'swipe' || !hasSecret) {
      unlockPhone();
      return;
    }
    setShowAuthPad(true);
  };

  const handlePinDigit = (digit: string) => {
    if (lockoutLeft > 0) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    setAuthError('');
    if (next.length >= pinLength) {
      verifyWithServer(next, () => setPinEntry(''));
    }
  };

  const handlePatternTap = (node: number) => {
    if (lockoutLeft > 0 || patternEntry.includes(node)) return;
    setPatternEntry((prev) => [...prev, node]);
    setAuthError('');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordEntry) return;
    verifyWithServer(passwordEntry, () => setPasswordEntry(''));
  };

  const enterGuestMode = async () => {
    await updateProfile({ guest_mode: 1 });
    setShowAuthPad(false);
    unlockPhone();
    showToast('Chế độ Khách', 'Đang sử dụng PHONE OS ở chế độ Khách hạn chế dữ liệu riêng tư.', 'info');
  };

  const handleRecoverPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryCodeInput.trim() || !recoveryNewPin.trim()) return;
    try {
      await osApi.recoverLockPin(recoveryCodeInput.trim(), 'pin', recoveryNewPin.trim());
      await refreshData();
      setShowRecovery(false);
      setRecoveryCodeInput('');
      setRecoveryNewPin('');
      setShowAuthPad(false);
      unlockPhone();
      showToast('Khôi phục khóa thành công', 'Mã khóa mới đã được cập nhật và băm SHA-256.', 'success');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Mã khôi phục không đúng');
    }
  };

  if (aodMode) {
    return (
      <div
        onClick={() => {
          setAodMode(false);
          setAodDimmed(false);
        }}
        className={`absolute inset-0 z-30 bg-black text-white flex flex-col items-center justify-center cursor-pointer select-none px-6 transition-opacity duration-700 ${
          aodDimmed ? 'opacity-35' : 'opacity-100'
        }`}
      >
        <p className="text-6xl font-mono-num font-light tracking-tight text-white/85">{timeStr}</p>
        <p className="text-sm text-zinc-400 mt-2 capitalize">{dateStr}</p>
        {weatherSummary && (
          <div className="flex items-center gap-1.5 text-xs text-purple-300 mt-3">
            <CloudSun className="w-4 h-4" />
            <span>{weatherSummary.temp}°C · {weatherSummary.city}</span>
          </div>
        )}
        {unreadNotifications.length > 0 && (
          <div className="flex items-center gap-2 mt-4 text-xs text-zinc-300">
            <Bell className="w-3.5 h-3.5 text-violet-400" />
            <span>{unreadNotifications.length} thông báo chưa đọc</span>
          </div>
        )}
        {musicPlaying && currentTrack && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-5 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3"
          >
            <Music2 className="w-4 h-4 text-pink-400" />
            <span className="text-xs truncate max-w-[140px]">{currentTrack.title}</span>
            <button onClick={toggleMusic} className="p-1 rounded-full bg-white/10">
              <Pause className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <p className="text-[10px] text-zinc-500 mt-12 text-center leading-relaxed">
          AOD Web · Tự tối sau {profile?.aod_timeout_sec ?? 30}s · Chạm để đánh thức
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between overflow-hidden select-none text-white">
      {/* Wallpaper Backdrop */}
      <img
        src={profile?.lock_wallpaper || profile?.wallpaper || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'}
        alt="Lock Wallpaper"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: profile?.wallpaper_pos || '50% 50%' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/65" />

      <div className="relative z-10">
        <StatusBarAndIsland lightText />
      </div>

      {/* Main Clock & Notifications or Auth Pad */}
      {!showAuthPad ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-5 pt-6 pb-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-white/85 mb-2">
              <Lock className="w-3.5 h-3.5" />
              <span className="capitalize">{dateStr}</span>
              {weatherSummary && (
                <>
                  <span>·</span>
                  <span>{weatherSummary.temp}°C {weatherSummary.label}</span>
                </>
              )}
            </div>
            <div
              className={`${clockFontClass} ${clockSizeClass} drop-shadow-md`}
              style={{ color: profile?.lock_clock_color || '#FFFFFF' }}
            >
              {timeStr}
            </div>
            {Boolean(profile?.guest_mode) && (
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-amber-500/80 text-[10px] font-bold text-black">
                Chế độ Khách
              </span>
            )}
          </div>

          {/* Lock Screen Media Widget & Notifications */}
          <div className="w-full space-y-2 my-auto pt-4">
            {activeYouTube && (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/15">
                <img
                  src={activeYouTube.thumbnail || `https://i.ytimg.com/vi/${activeYouTube.videoId}/hqdefault.jpg`}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{activeYouTube.title}</p>
                  <p className="text-[10px] text-rose-300 truncate">Phát nền YouTube · {activeYouTube.channelTitle}</p>
                </div>
                <button
                  onClick={toggleYouTubePlay}
                  className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0"
                >
                  {activeYouTube.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button
                  onClick={stopYouTubeVideo}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs shrink-0"
                  title="Tắt"
                >
                  ×
                </button>
              </div>
            )}

            {currentTrack && !activeYouTube && (musicPlaying || unreadNotifications.length === 0) && (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/15">
                <img src={currentTrack.cover} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{currentTrack.title}</p>
                  <p className="text-[10px] text-white/65 truncate">{currentTrack.artist}</p>
                </div>
                <button
                  onClick={toggleMusic}
                  className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center"
                >
                  {musicPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button onClick={nextTrack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            )}

            {unreadNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (unlockMode === 'swipe' || !hasSecret) {
                    unlockPhone();
                    if (n.action_route) {
                      openApp(n.action_route as 'messages', { conversationId: n.action_payload });
                    }
                  } else {
                    setShowAuthPad(true);
                  }
                }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/15 cursor-pointer hover:bg-black/55 transition-colors"
              >
                {n.avatar ? (
                  <img src={n.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#A78BFA]/30 flex items-center justify-center shrink-0">
                    <CloudSun className="w-4 h-4 text-purple-200" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{n.title}</p>
                    <span className="text-[10px] text-white/60 shrink-0">{n.group_key}</span>
                  </div>
                  <p className="text-xs text-white/80 truncate">
                    {profile?.hide_sensitive_lock ? 'Nội dung thông báo đã được ẩn' : n.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Lock Controls */}
          <div className="w-full flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-between px-3">
              <button
                onClick={() => {
                  const next = !flashlightOn;
                  setFlashlightOn(next);
                  showToast('Đèn pin', next ? 'Đã bật đèn pin màn hình mô phỏng' : 'Đã tắt đèn pin');
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                  flashlightOn ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/15'
                }`}
                title="Đèn pin"
              >
                <Flashlight className="w-5 h-5" />
              </button>

              {Boolean(profile?.aod_enabled) && (
                <button
                  onClick={() => setAodMode(true)}
                  className="px-3 py-1.5 rounded-full bg-black/40 border border-white/15 text-[11px] text-white/80 flex items-center gap-1.5"
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>AOD</span>
                </button>
              )}

              <button
                onClick={() => {
                  if (unlockMode === 'swipe' || !hasSecret) {
                    unlockPhone();
                    openApp('camera');
                  } else {
                    setShowAuthPad(true);
                  }
                }}
                className="w-12 h-12 rounded-full bg-black/40 text-white border border-white/15 backdrop-blur-md flex items-center justify-center hover:bg-black/60"
                title="Mở nhanh Máy ảnh"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleUnlockAttempt}
              className="group flex flex-col items-center gap-1.5 py-2 px-8 rounded-full hover:bg-white/10 transition-colors"
            >
              <ChevronUp className="w-4 h-4 text-white/75 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-medium tracking-wide text-white/90">
                {unlockMode === 'swipe' || !hasSecret
                  ? 'Chạm hoặc vuốt lên để mở khóa'
                  : unlockMode === 'pattern'
                    ? 'Nhập mẫu hình mở khóa'
                    : 'Nhập mã PIN / Mật khẩu'}
              </span>
              <span className="w-28 h-1 rounded-full bg-white/80 mt-1" />
            </button>
          </div>
        </div>
      ) : (
        /* PIN, Pattern, or Password Pad */
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 bg-black/60 backdrop-blur-2xl">
          <Lock className="w-6 h-6 text-purple-300 mb-2" />
          <h2 className="text-base font-semibold mb-1">
            {unlockMode === 'password'
              ? 'Nhập mật khẩu mở khóa'
              : unlockMode === 'pattern'
                ? 'Chạm các điểm theo thứ tự mẫu hình'
                : `Nhập mã PIN (${pinLength} số)`}
          </h2>
          {authError && <p className="text-xs text-rose-400 mb-2 text-center">{authError}</p>}
          {lockoutLeft > 0 && (
            <p className="text-xs font-mono-num text-amber-300 mb-2">Khóa tạm thời: {lockoutLeft}s</p>
          )}

          {unlockMode === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="w-full max-w-[260px] space-y-3 mt-3">
              <input
                type="password"
                value={passwordEntry}
                onChange={(e) => setPasswordEntry(e.target.value)}
                placeholder="Mật khẩu..."
                disabled={lockoutLeft > 0}
                autoFocus
                className="w-full px-4 py-3 rounded-2xl bg-white/15 border border-white/20 text-white text-center outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAuthPad(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-xs font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={lockoutLeft > 0 || verifying}
                  className="flex-1 py-2.5 rounded-xl bg-[#A78BFA] text-xs font-semibold disabled:opacity-50"
                >
                  Mở khóa
                </button>
              </div>
            </form>
          ) : unlockMode === 'pattern' ? (
            <div className="w-full max-w-[230px] mt-3 space-y-4">
              <div className="grid grid-cols-3 gap-5 p-4 rounded-3xl bg-white/10 border border-white/15">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((node) => {
                  const idx = patternEntry.indexOf(node);
                  return (
                    <button
                      key={node}
                      onClick={() => handlePatternTap(node)}
                      className={`w-11 h-11 mx-auto rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                        idx >= 0 ? 'bg-[#A78BFA] border-white text-white scale-110' : 'border-white/40 bg-white/5 text-white/50'
                      }`}
                    >
                      {idx >= 0 ? idx + 1 : '•'}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPatternEntry([])}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-xs"
                >
                  Vẽ lại
                </button>
                <button
                  onClick={() => verifyWithServer(patternEntry.join('-'), () => setPatternEntry([]))}
                  disabled={patternEntry.length < 3 || lockoutLeft > 0}
                  className="flex-1 py-2.5 rounded-xl bg-[#A78BFA] text-xs font-semibold disabled:opacity-50"
                >
                  Xác nhận
                </button>
              </div>
              <button onClick={() => setShowAuthPad(false)} className="w-full text-xs text-white/70">
                Quay lại
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[240px] mt-4">
              <div className="flex items-center justify-center gap-3 mb-5">
                {Array.from({ length: pinLength }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full border border-white/60 transition-colors ${
                      idx < pinEntry.length ? 'bg-white' : 'bg-transparent'
                    }`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => handlePinDigit(d)}
                    disabled={lockoutLeft > 0}
                    className="w-14 h-14 mx-auto rounded-full bg-white/15 hover:bg-white/25 text-xl font-semibold font-mono-num transition-colors flex items-center justify-center"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setShowAuthPad(false)}
                  className="w-14 h-14 mx-auto rounded-full text-xs text-white/80 hover:bg-white/10 flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  onClick={() => handlePinDigit('0')}
                  disabled={lockoutLeft > 0}
                  className="w-14 h-14 mx-auto rounded-full bg-white/15 hover:bg-white/25 text-xl font-semibold font-mono-num flex items-center justify-center"
                >
                  0
                </button>
                <button
                  onClick={() => setPinEntry((p) => p.slice(0, -1))}
                  className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-white/80 hover:bg-white/10"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col items-center gap-2 w-full max-w-[260px]">
            {showRecovery ? (
              <form onSubmit={handleRecoverPin} className="w-full p-3 rounded-2xl bg-white/10 border border-white/15 space-y-2 text-xs">
                <p className="font-semibold text-center">Khôi phục bằng Mã khôi phục</p>
                <input
                  value={recoveryCodeInput}
                  onChange={(e) => setRecoveryCodeInput(e.target.value)}
                  placeholder="Nhập mã khôi phục đã đặt..."
                  className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/15 text-white outline-none"
                />
                <input
                  type="password"
                  value={recoveryNewPin}
                  onChange={(e) => setRecoveryNewPin(e.target.value)}
                  placeholder="Mã PIN / mật khẩu mới..."
                  className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/15 text-white outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRecovery(false)}
                    className="flex-1 py-2 rounded-xl bg-white/10"
                  >
                    Đóng
                  </button>
                  <button type="submit" className="flex-1 py-2 rounded-xl bg-emerald-500 text-white font-semibold">
                    Đặt lại
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => {
                  if (!profile?.has_recovery_code) {
                    showToast('Chưa đặt mã khôi phục', 'Hãy mở Cài đặt → Bảo mật hoặc dùng Chế độ Khách.', 'info');
                  } else {
                    setShowRecovery(true);
                  }
                }}
                className="text-[11px] text-purple-200 hover:underline flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" />
                <span>Quên mã mở khóa?</span>
              </button>
            )}

            <button
              onClick={enterGuestMode}
              className="px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] text-white/80 flex items-center gap-1.5 hover:bg-white/20"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>Chuyển sang Chế độ Khách</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

