import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Download,
  Flashlight,
  GripHorizontal,
  Keyboard,
  LayoutGrid,
  Lock,
  Maximize2,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import type { AppId } from '../../types/os';

// OS Shell Overlays & Screens
import { BootScreen } from './BootScreen';
import { StatusBarAndIsland } from './StatusBarAndIsland';
import { LockScreen } from './LockScreen';
import { HomeScreen } from './HomeScreen';
import { ControlCenter } from './ControlCenter';
import { NotificationCenter } from './NotificationCenter';
import { RecentApps } from './RecentApps';
import { GlobalSearch } from './GlobalSearch';
import { ShareSheet } from './ShareSheet';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { AppErrorBoundary } from './AppErrorBoundary';
import { PiPOverlay } from './PiPOverlay';
import { PersistentYouTubePlayer } from './PersistentYouTubePlayer';
import { VirtualKeyboard } from './VirtualKeyboard';
import { useDraggablePopup } from './useDraggablePopup';
import { OSStateView } from '../ui/OSDesignSystem';

// Lazy-loaded 43 Apps (32 Core + 8 OS 3.0 + 3 OS 4.0)
const PhoneApp = lazy(() => import('../../apps/PhoneApp').then((m) => ({ default: m.PhoneApp })));
const MessagesApp = lazy(() => import('../../apps/MessagesApp').then((m) => ({ default: m.MessagesApp })));
const ContactsApp = lazy(() => import('../../apps/ContactsApp').then((m) => ({ default: m.ContactsApp })));
const CameraApp = lazy(() => import('../../apps/CameraApp').then((m) => ({ default: m.CameraApp })));
const PhotosApp = lazy(() => import('../../apps/PhotosApp').then((m) => ({ default: m.PhotosApp })));
const BrowserApp = lazy(() => import('../../apps/BrowserApp').then((m) => ({ default: m.BrowserApp })));
const MapsApp = lazy(() => import('../../apps/MapsApp').then((m) => ({ default: m.MapsApp })));
const MailApp = lazy(() => import('../../apps/MailApp').then((m) => ({ default: m.MailApp })));
const CalendarApp = lazy(() => import('../../apps/CalendarApp').then((m) => ({ default: m.CalendarApp })));
const RemindersApp = lazy(() => import('../../apps/RemindersApp').then((m) => ({ default: m.RemindersApp })));
const NotesApp = lazy(() => import('../../apps/NotesApp').then((m) => ({ default: m.NotesApp })));
const FileManagerApp = lazy(() => import('../../apps/FileManagerApp').then((m) => ({ default: m.FileManagerApp })));
const ClockApp = lazy(() => import('../../apps/ClockApp').then((m) => ({ default: m.ClockApp })));
const CalculatorApp = lazy(() => import('../../apps/CalculatorApp').then((m) => ({ default: m.CalculatorApp })));
const WeatherApp = lazy(() => import('../../apps/WeatherApp').then((m) => ({ default: m.WeatherApp })));
const MusicApp = lazy(() => import('../../apps/MusicApp').then((m) => ({ default: m.MusicApp })));
const VideoPlayerApp = lazy(() => import('../../apps/VideoPlayerApp').then((m) => ({ default: m.VideoPlayerApp })));
const VoiceRecorderApp = lazy(() => import('../../apps/VoiceRecorderApp').then((m) => ({ default: m.VoiceRecorderApp })));
const ScannerApp = lazy(() => import('../../apps/ScannerApp').then((m) => ({ default: m.ScannerApp })));
const CharacterStoreApp = lazy(() => import('../../apps/CharacterStoreApp').then((m) => ({ default: m.CharacterStoreApp })));
const AnimeSocialApp = lazy(() => import('../../apps/AnimeSocialApp').then((m) => ({ default: m.AnimeSocialApp })));
const AIAssistantApp = lazy(() => import('../../apps/AIAssistantApp').then((m) => ({ default: m.AIAssistantApp })));
const AppStoreApp = lazy(() => import('../../apps/AppStoreApp').then((m) => ({ default: m.AppStoreApp })));
const SettingsApp = lazy(() => import('../../apps/SettingsApp').then((m) => ({ default: m.SettingsApp })));
const HealthFitnessApp = lazy(() => import('../../apps/HealthFitnessApp').then((m) => ({ default: m.HealthFitnessApp })));
const WalletApp = lazy(() => import('../../apps/WalletApp').then((m) => ({ default: m.WalletApp })));
const PasswordManagerApp = lazy(() => import('../../apps/PasswordManagerApp').then((m) => ({ default: m.PasswordManagerApp })));
const TranslateApp = lazy(() => import('../../apps/TranslateApp').then((m) => ({ default: m.TranslateApp })));
const NewsApp = lazy(() => import('../../apps/NewsApp').then((m) => ({ default: m.NewsApp })));
const BooksApp = lazy(() => import('../../apps/BooksApp').then((m) => ({ default: m.BooksApp })));
const ShortcutsApp = lazy(() => import('../../apps/ShortcutsApp').then((m) => ({ default: m.ShortcutsApp })));
const GameCenterApp = lazy(() => import('../../apps/GameCenterApp').then((m) => ({ default: m.GameCenterApp })));
const PodcastApp = lazy(() => import('../../apps/PodcastApp').then((m) => ({ default: m.PodcastApp })));
const ShoppingApp = lazy(() => import('../../apps/ShoppingApp').then((m) => ({ default: m.ShoppingApp })));
const FoodDeliveryApp = lazy(() => import('../../apps/FoodDeliveryApp').then((m) => ({ default: m.FoodDeliveryApp })));
const BankingApp = lazy(() => import('../../apps/BankingApp').then((m) => ({ default: m.BankingApp })));
const RideApp = lazy(() => import('../../apps/RideApp').then((m) => ({ default: m.RideApp })));
const OfficeApp = lazy(() => import('../../apps/OfficeApp').then((m) => ({ default: m.OfficeApp })));
const CommunityApp = lazy(() => import('../../apps/CommunityApp').then((m) => ({ default: m.CommunityApp })));
const SmartHomeApp = lazy(() => import('../../apps/SmartHomeApp').then((m) => ({ default: m.SmartHomeApp })));
const YouTubeApp = lazy(() => import('../../apps/YouTubeApp').then((m) => ({ default: m.YouTubeApp })));
const MoviesHubApp = lazy(() => import('../../apps/MoviesHubApp').then((m) => ({ default: m.MoviesHubApp })));
const MusicHubApp = lazy(() => import('../../apps/MusicHubApp').then((m) => ({ default: m.MusicHubApp })));
const AnimeTelecomApp = lazy(() => import('../../apps/AnimeTelecomApp').then((m) => ({ default: m.AnimeTelecomApp })));

function renderActiveApp(appId: AppId) {
  switch (appId) {
    case 'phone': return <PhoneApp />;
    case 'messages': return <MessagesApp />;
    case 'contacts': return <ContactsApp />;
    case 'camera': return <CameraApp />;
    case 'photos': return <PhotosApp />;
    case 'browser': return <BrowserApp />;
    case 'maps': return <MapsApp />;
    case 'mail': return <MailApp />;
    case 'calendar': return <CalendarApp />;
    case 'reminders': return <RemindersApp />;
    case 'notes': return <NotesApp />;
    case 'files': return <FileManagerApp />;
    case 'clock': return <ClockApp />;
    case 'calculator': return <CalculatorApp />;
    case 'weather': return <WeatherApp />;
    case 'music': return <MusicApp />;
    case 'video': return <VideoPlayerApp />;
    case 'recorder': return <VoiceRecorderApp />;
    case 'scanner': return <ScannerApp />;
    case 'characters': return <CharacterStoreApp />;
    case 'social': return <AnimeSocialApp />;
    case 'assistant': return <AIAssistantApp />;
    case 'appstore': return <AppStoreApp />;
    case 'settings': return <SettingsApp />;
    case 'health': return <HealthFitnessApp />;
    case 'wallet': return <WalletApp />;
    case 'passwords': return <PasswordManagerApp />;
    case 'translate': return <TranslateApp />;
    case 'news': return <NewsApp />;
    case 'books': return <BooksApp />;
    case 'shortcuts': return <ShortcutsApp />;
    case 'games': return <GameCenterApp />;
    case 'podcast': return <PodcastApp />;
    case 'shopping': return <ShoppingApp />;
    case 'food': return <FoodDeliveryApp />;
    case 'banking': return <BankingApp />;
    case 'ride': return <RideApp />;
    case 'office': return <OfficeApp />;
    case 'community': return <CommunityApp />;
    case 'smarthome': return <SmartHomeApp />;
    case 'youtube': return <YouTubeApp />;
    case 'movies': return <MoviesHubApp />;
    case 'musichub': return <MusicHubApp />;
    case 'telecom': return <AnimeTelecomApp />;
  }
}

export function OSShell() {
  const {
    data,
    loading,
    error,
    refreshData,
    bootComplete,
    isLocked,
    lockPhone,
    unlockPhone,
    activeApp,
    splitApp,
    setSplitApp,
    floatingApp,
    setFloatingApp,
    openApp,
    closeCurrentApp,
    setControlCenterOpen,
    setNotificationCenterOpen,
    setRecentAppsOpen,
    setGlobalSearchOpen,
    flashlightOn,
    setFlashlightOn,
    tabletMode,
    setTabletMode,
    toasts,
    showToast,
    confirmState,
    closeConfirm,
    updateProfile,
    logSystemError,
    screenRecording,
    setScreenRecording,
    playSoundEffect,
    virtualKeyboardOpen,
    setVirtualKeyboardOpen,
    handleSystemBack,
    hasBackLayer,
  } = useOS();

  const [tickBusy, setTickBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotFlash, setShotFlash] = useState(false);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const recorderRef = useRef<{ stop: () => void } | null>(null);
  const homeBarTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const backGuardArmedRef = useRef(false);

  useEffect(() => {
    if (!bootComplete || isLocked) return;
    if (hasBackLayer && !backGuardArmedRef.current) {
      try {
        window.history.pushState({ phoneosBackGuard: true }, '');
        backGuardArmedRef.current = true;
      } catch {
        // ignore sandboxed history restrictions
      }
    }
  }, [bootComplete, isLocked, hasBackLayer]);

  useEffect(() => {
    const onPopState = () => {
      backGuardArmedRef.current = false;
      if (!bootComplete || isLocked) return;
      const handled = handleSystemBack();
      if (handled) {
        try {
          window.history.pushState({ phoneosBackGuard: true }, '');
          backGuardArmedRef.current = true;
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [bootComplete, isLocked, handleSystemBack]);

  const floatingDrag = useDraggablePopup({
    clampMode: 'header',
    boundsSelector: '',
    handleHeight: 38,
    minVisibleX: 110,
    resetKey: `${floatingApp ?? ''}-${tabletMode ? 't' : 'p'}`,
  });

  const screenshotDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    resetKey: lastScreenshot,
  });

  const confirmDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 12,
    resetKey: confirmState ? `${confirmState.title}:${confirmState.message}` : '',
  });

  const exportRecoveryDiagnostics = async () => {
    try {
      const diag = await osApi.getDiagnostics();
      const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phoneos-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore if backend offline
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-dvh w-screen bg-[#0D0D12] text-white flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#A78BFA] to-[#F472B6] animate-pulse" />
        <p className="text-sm font-display font-semibold tracking-wide">Đang khởi động PHONE OS 4.0...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh w-screen bg-[#0D0D12] text-white flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-14 h-14 rounded-3xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <p className="text-base font-bold text-rose-400">Trung tâm Khôi phục PHONE OS 4.0</p>
          <p className="text-xs text-zinc-400 max-w-sm mt-1">
            {error || 'Dữ liệu khởi động hệ thống bị gián đoạn hoặc máy chủ chưa phản hồi.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={refreshData}
            className="min-h-[44px] px-4 rounded-xl bg-[#A78BFA] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" /> Thử khởi động lại
          </button>
          <button
            onClick={exportRecoveryDiagnostics}
            className="min-h-[44px] px-4 rounded-xl bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Tải nhật ký chẩn đoán
          </button>
        </div>
      </div>
    );
  }

  const profile = data.profile;
  const brightnessFilter = 0.45 + ((profile.brightness ?? 85) / 100) * 0.55;

  const handleLifeTick = async () => {
    setTickBusy(true);
    try {
      await osApi.lifeTick(true);
      await refreshData();
      showToast('Thế giới AI đã cập nhật', 'Một nhân vật vừa chia sẻ khoảnh khắc hoặc nhắn tin mới!', 'success');
    } catch (err) {
      showToast('Lỗi mô phỏng AI', err instanceof Error ? err.message : 'Mô phỏng thất bại', 'error');
    } finally {
      setTickBusy(false);
    }
  };

  const handleCaptureScreen = async () => {
    playSoundEffect('shutter');
    setShotFlash(true);
    setTimeout(() => setShotFlash(false), 220);

    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 720, 1280);
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(1, '#311042');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 720, 1280);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText('PHONE OS 4.0 · Ảnh chụp màn hình', 48, 120);
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#d4d4d8';
      const appTitle = activeApp ? data.apps.find((a) => a.app_id === activeApp)?.name || activeApp : 'Màn hình chính';
      ctx.fillText(`Đang mở: ${appTitle}`, 48, 185);
      ctx.fillText(`Thời gian: ${new Date().toLocaleString('vi-VN')}`, 48, 235);
      ctx.fillText(`Pin: ${profile.battery_level}% · Chế độ: ${profile.theme === 'dark' ? 'Tối' : 'Sáng'}`, 48, 285);
    }
    const dataUrl = canvas.toDataURL('image/png');
    setLastScreenshot(dataUrl);
    await osApi.createMedia({
      type: 'photo',
      title: `Screenshot_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}`,
      data_url: dataUrl,
      album: 'Ảnh chụp màn hình',
      category: 'screenshot',
      caption: 'Chụp từ Trung tâm Điều khiển PHONE OS 4.0',
    });
    await refreshData();
    showToast('Đã chụp màn hình', 'Ảnh đã được lưu vào Thư viện Ảnh.', 'success');
  };

  const handleToggleScreenRecord = async () => {
    if (screenRecording) {
      recorderRef.current?.stop();
      setScreenRecording(false);
      showToast('Đã dừng quay màn hình', 'Bản ghi đã hoàn tất.');
      return;
    }

    setCountdown(3);
    let left = 3;
    const timer = setInterval(async () => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
      } else {
        clearInterval(timer);
        setCountdown(null);

        if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
          try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const mr = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];
            mr.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            mr.onstop = async () => {
              stream.getTracks().forEach((t) => t.stop());
              setScreenRecording(false);
              if (chunks.length > 0) {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const reader = new FileReader();
                reader.onloadend = async () => {
                  const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                  if (dataUrl) {
                    await osApi.createMedia({
                      type: 'video',
                      title: `ScreenRecord_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}`,
                      data_url: dataUrl,
                      album: 'Quay màn hình',
                      category: 'recording',
                    });
                    await refreshData();
                    showToast('Đã lưu video quay màn hình', 'Video đã nằm trong Ảnh.', 'success');
                  }
                };
                reader.readAsDataURL(blob);
              }
            };
            mr.start();
            recorderRef.current = { stop: () => mr.stop() };
            setScreenRecording(true);
            showToast('Đang quay màn hình', 'Nhấn chấm đỏ trên thanh điều khiển để dừng.');
            return;
          } catch {
            // Fall back cleanly if browser iframe blocks getDisplayMedia
          }
        }

        setScreenRecording(true);
        const started = Date.now();
        recorderRef.current = {
          stop: async () => {
            const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
            await osApi.createNote({
              title: `Bản ghi màn hình (${sec}s)`,
              content: `Phiên quay màn hình mô phỏng lúc ${new Date().toLocaleString('vi-VN')} (trình duyệt iframe không cấp getDisplayMedia).`,
              folder: 'Hệ thống',
            });
            await refreshData();
            showToast('Đã lưu nhật ký quay màn hình', `Thời lượng ${sec}s (Chế độ mô phỏng).`);
          },
        };
        showToast('Quay màn hình (Mô phỏng)', 'Trình duyệt chặn quay trực tiếp; đang ghi phiên mô phỏng.');
      }
    }, 1000);
  };

  return (
    <div className="min-h-dvh w-full bg-[#0A0A0F] md:bg-gradient-to-br md:from-[#0C0C14] md:via-[#141222] md:to-[#0A0A10] flex items-center justify-center md:p-4 lg:p-6 overflow-hidden">
      {/* Desktop Companion Controls */}
      <div className="hidden lg:flex flex-col gap-3 mr-5 w-52 shrink-0 text-zinc-200 select-none">
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#A78BFA] to-[#F472B6] flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <div>
              <h2 className="text-xs font-bold font-display tracking-wide">PHONE OS 4.0</h2>
              <p className="text-[10px] text-zinc-400">{data.apps.length} Ứng dụng · AI Sống</p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-1.5 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 pb-1">
            Phần cứng & Hệ thống
          </p>
          <button
            onClick={() => (isLocked ? unlockPhone() : lockPhone())}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#A78BFA]" />
              {isLocked ? 'Mở khóa màn hình' : 'Khóa màn hình'}
            </span>
          </button>
          <button
            onClick={() => setTabletMode(!tabletMode)}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2">
              {tabletMode ? (
                <Smartphone className="w-3.5 h-3.5 text-pink-400" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-pink-400" />
              )}
              {tabletMode ? 'Khung Điện thoại' : 'Chế độ Máy tính bảng'}
            </span>
          </button>
          <button
            onClick={() => updateProfile({ theme: profile.theme === 'dark' ? 'light' : 'dark' })}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2">
              {profile.theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
              )}
              {profile.theme === 'dark' ? 'Giao diện Sáng' : 'Giao diện Tối'}
            </span>
          </button>
          <button
            onClick={() => setControlCenterOpen(true)}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            Trung tâm Điều khiển
          </button>
          <button
            onClick={() => setNotificationCenterOpen(true)}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-emerald-400" />
            Thông báo
          </button>
          <button
            onClick={() => setGlobalSearchOpen(true)}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-zinc-300" />
            Tìm kiếm nhanh
          </button>
          <button
            onClick={() => setVirtualKeyboardOpen(!virtualKeyboardOpen)}
            className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-violet-300" />
            {virtualKeyboardOpen ? 'Ẩn Bàn phím ảo' : 'Mở Bàn phím ảo'}
          </button>
        </div>

        <button
          onClick={handleLifeTick}
          disabled={tickBusy}
          className="p-3.5 rounded-3xl bg-gradient-to-r from-[#A78BFA]/20 to-[#F472B6]/20 border border-[#A78BFA]/30 hover:border-[#A78BFA]/60 text-left space-y-1 transition-all disabled:opacity-50"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#E9D5FF]">
            <Sparkles className="w-3.5 h-3.5 text-[#F472B6]" />
            {tickBusy ? 'Đang mô phỏng...' : 'Kích hoạt Thế giới AI'}
          </div>
          <p className="text-[10px] text-zinc-400 leading-snug">
            Để Yuki, Akira, Sakura & Rin tự động đăng bài, gửi sự kiện hoặc nhắn tin cho bạn.
          </p>
        </button>
      </div>

      {/* Smartphone / Tablet OS Frame */}
      <div
        data-phone-frame="true"
        className={`relative flex flex-col overflow-hidden bg-black transition-all duration-300 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ${
          tabletMode
            ? 'w-full h-dvh md:w-[min(880px,92vw)] lg:w-[min(880px,calc(100vw-276px))] md:h-[min(660px,88dvh)] md:rounded-[32px] md:border-[8px] md:border-zinc-800/90'
            : 'w-full h-dvh md:h-[min(856px,92dvh)] md:w-[min(404px,calc(min(856px,92dvh)*0.472))] md:rounded-[44px] md:border-[8px] md:border-zinc-800/90'
        }`}
        style={{ filter: `brightness(${brightnessFilter})` }}
      >
        {/* Wallpaper Background */}
        <div
          className="absolute inset-0 bg-cover transition-all duration-500"
          style={{
            backgroundImage: `url(${profile.wallpaper || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'})`,
            backgroundPosition: profile.wallpaper_pos || 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/15" />

        {/* Screenshot Flash */}
        {shotFlash && <div className="absolute inset-0 z-50 bg-white pointer-events-none" />}

        {/* Screen Record 3s Countdown */}
        {countdown !== null && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-rose-500 text-white font-display text-3xl font-bold flex items-center justify-center animate-ping-once">
              {countdown}
            </div>
          </div>
        )}

        {/* Screen-based Flashlight Overlay */}
        {flashlightOn && (
          <div className="absolute inset-0 z-50 bg-white/95 text-zinc-900 flex flex-col items-center justify-center p-6 text-center gap-4">
            <Flashlight className="w-12 h-12 text-amber-500" />
            <div>
              <h3 className="text-base font-bold">Đèn pin màn hình đang bật</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Trình duyệt web không thể cấp nguồn trực tiếp cho đèn LED phần cứng phía sau; chế độ chiếu sáng màn hình đang được sử dụng thay thế.
              </p>
            </div>
            <button
              onClick={() => setFlashlightOn(false)}
              className="px-5 py-2.5 rounded-2xl bg-zinc-900 text-white text-xs font-bold"
            >
              Tắt Đèn pin
            </button>
          </div>
        )}

        {/* Boot Sequence */}
        {!bootComplete && <BootScreen />}

        {/* Lock Screen */}
        {bootComplete && isLocked && <LockScreen />}

        {/* Unlocked Operating System */}
        {bootComplete && !isLocked && (
          <div className="relative flex-1 flex flex-col overflow-hidden">
            <StatusBarAndIsland lightText={!activeApp} />

            {/* Active App, Split-Screen Dual Pane, or Home Screen */}
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeApp ? (
                <div
                  className={`flex-1 flex min-h-0 w-full bg-[var(--os-bg)] overflow-hidden ${
                    splitApp ? (tabletMode ? 'flex-row' : 'flex-col') : 'flex-col'
                  }`}
                >
                  <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
                    <AppErrorBoundary
                      appId={activeApp}
                      onErrorLog={(id, code, msg, detail) => logSystemError(id, code, msg, detail)}
                      onCloseApp={closeCurrentApp}
                    >
                      <Suspense fallback={<OSStateView mode="loading" title="Đang mở ứng dụng..." />}>
                        {renderActiveApp(activeApp)}
                      </Suspense>
                    </AppErrorBoundary>
                  </div>

                  {splitApp && (
                    <>
                      <div className="shrink-0 bg-zinc-900 text-white px-3 py-1 flex items-center justify-between text-[10px] border-y border-white/10">
                        <span>Chia đôi: {data.apps.find((a) => a.app_id === splitApp)?.name || splitApp}</span>
                        <button
                          onClick={() => setSplitApp(null)}
                          className="text-rose-300 font-semibold flex items-center gap-0.5"
                        >
                          <X className="w-3 h-3" /> Đóng nửa dưới
                        </button>
                      </div>
                      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden border-t border-zinc-200 dark:border-zinc-800">
                        <AppErrorBoundary
                          appId={splitApp}
                          onErrorLog={(id, code, msg, detail) => logSystemError(id, code, msg, detail)}
                          onCloseApp={() => setSplitApp(null)}
                        >
                          <Suspense fallback={<OSStateView mode="loading" title="Đang mở ứng dụng chia đôi..." />}>
                            {renderActiveApp(splitApp)}
                          </Suspense>
                        </AppErrorBoundary>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <HomeScreen />
              )}

              {/* Floating App Window Overlay (OS 4.0) */}
              {floatingApp && (
                <div
                  ref={floatingDrag.popupRef}
                  style={floatingDrag.popupStyle}
                  className={`absolute top-6 left-3 z-35 rounded-3xl bg-[var(--os-surface)] border border-violet-400/50 shadow-2xl flex flex-col overflow-hidden ${
                    tabletMode
                      ? 'w-[380px] max-w-[calc(100%-24px)] h-[62%]'
                      : 'w-[calc(100%-24px)] max-w-[356px] h-[56%]'
                  }`}
                >
                  <div
                    {...floatingDrag.handleProps}
                    title="Kéo để di chuyển cửa sổ nổi (nhấp đúp để đặt lại)"
                    className="px-3 py-2 bg-zinc-900 text-white flex items-center justify-between gap-2 text-[11px] shrink-0 cursor-grab active:cursor-grabbing select-none"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="font-semibold truncate">
                        Cửa sổ nổi · {data.apps.find((a) => a.app_id === floatingApp)?.name || floatingApp}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          const target = floatingApp;
                          setFloatingApp(null);
                          openApp(target);
                        }}
                        className="p-1 rounded-lg hover:bg-white/15"
                        title="Phóng to toàn màn hình"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setFloatingApp(null)}
                        className="p-1 rounded-lg hover:bg-rose-500/30 text-rose-300"
                        title="Đóng cửa sổ nổi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <AppErrorBoundary
                      appId={floatingApp}
                      onErrorLog={(id, code, msg, detail) => logSystemError(id, code, msg, detail)}
                      onCloseApp={() => setFloatingApp(null)}
                    >
                      <Suspense fallback={<OSStateView mode="loading" title="Đang nạp cửa sổ nổi..." />}>
                        {renderActiveApp(floatingApp)}
                      </Suspense>
                    </AppErrorBoundary>
                  </div>
                </div>
              )}
            </div>

            {/* Virtual Keyboard & Clipboard Drawer */}
            <VirtualKeyboard />

            {/* Bottom System Navigation & Home Gesture Bar */}
            <div
              onTouchStart={(e) => {
                if (profile.gestures_enabled === 0) return;
                const t = e.touches[0];
                if (t) homeBarTouchStartRef.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={(e) => {
                if (profile.gestures_enabled === 0 || !homeBarTouchStartRef.current) return;
                const t = e.changedTouches[0];
                const start = homeBarTouchStartRef.current;
                homeBarTouchStartRef.current = null;
                if (!t) return;
                const dy = start.y - t.clientY;
                const dx = Math.abs(t.clientX - start.x);
                if (dy > 26 && dy > dx * 1.1) {
                  if (activeApp) {
                    closeCurrentApp();
                  } else {
                    setRecentAppsOpen(true);
                  }
                }
              }}
              className={`shrink-0 h-9 pb-safe px-5 flex items-center justify-between select-none touch-none ${
                activeApp
                  ? 'bg-white/90 dark:bg-[#101014]/95 border-t border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                  : 'bg-black/25 backdrop-blur-md text-white/90'
              }`}
            >
              <button
                onClick={() => setRecentAppsOpen(true)}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title="Ứng dụng gần đây"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (activeApp) {
                    closeCurrentApp();
                  } else {
                    setGlobalSearchOpen(true);
                  }
                }}
                className="flex-1 mx-6 h-full flex items-center justify-center group"
                title={activeApp ? 'Về Màn hình chính' : 'Tìm kiếm nhanh'}
              >
                <span
                  className={`h-1 w-24 rounded-full transition-all group-hover:w-28 ${
                    activeApp ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-white/80'
                  }`}
                />
              </button>

              <div className="flex items-center gap-1">
                {activeApp && (
                  <button
                    onClick={() => setVirtualKeyboardOpen(!virtualKeyboardOpen)}
                    className={`p-1.5 rounded-lg transition-colors ${virtualKeyboardOpen ? 'text-violet-500' : 'hover:bg-black/10 dark:hover:bg-white/10'}`}
                    title="Bàn phím ảo & Khay nhớ tạm"
                  >
                    <Keyboard className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (activeApp) {
                      setGlobalSearchOpen(true);
                    } else {
                      lockPhone();
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  title={activeApp ? 'Tìm kiếm' : 'Khóa màn hình'}
                >
                  {activeApp ? <Search className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Picture-in-Picture & Background YouTube Floating Player */}
        {bootComplete && !isLocked && <PiPOverlay />}
        <PersistentYouTubePlayer />

        {/* Screenshot Preview Pill */}
        {lastScreenshot && (
          <div
            ref={screenshotDrag.popupRef}
            style={{ ...screenshotDrag.popupStyle, ...screenshotDrag.handleProps.style }}
            onPointerDown={screenshotDrag.handleProps.onPointerDown}
            onDoubleClick={screenshotDrag.handleProps.onDoubleClick}
            title="Kéo để di chuyển"
            className="absolute bottom-14 left-3 z-40 p-1.5 rounded-2xl bg-zinc-900/95 border border-white/15 shadow-2xl flex items-center gap-2 text-white cursor-grab active:cursor-grabbing select-none"
          >
            <img src={lastScreenshot} alt="Screenshot" className="w-10 h-14 rounded-xl object-cover pointer-events-none" />
            <div className="pr-1">
              <p className="text-[10px] font-bold">Đã chụp màn hình</p>
              <button
                onClick={() => setLastScreenshot(null)}
                className="text-[10px] text-violet-300 underline"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* System Overlays */}
        <ControlCenter onCaptureScreen={handleCaptureScreen} onToggleScreenRecord={handleToggleScreenRecord} />
        <NotificationCenter />
        <RecentApps />
        <GlobalSearch />
        <ShareSheet />
        <IncomingCallOverlay />

        {/* Toast Stack */}
        {toasts.length > 0 && (
          <div className="absolute top-11 left-3 right-3 z-[80] flex flex-col gap-1.5 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="pointer-events-auto px-3.5 py-2.5 rounded-2xl bg-zinc-900/95 text-white border border-white/10 shadow-xl backdrop-blur-md flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[11px] font-bold ${
                      t.type === 'error'
                        ? 'text-rose-400'
                        : t.type === 'success'
                          ? 'text-emerald-400'
                          : 'text-[#A78BFA]'
                    }`}
                  >
                    {t.title}
                  </p>
                  <p className="text-[11px] text-zinc-200 truncate">{t.message}</p>
                </div>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => t.action?.onClick()}
                    className="px-2.5 py-1.5 rounded-xl bg-[#245BDB] hover:bg-blue-600 text-white text-[11px] font-bold shrink-0"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Global Confirmation Modal */}
        {confirmState && (
          <div className="absolute inset-0 z-[80] bg-black/65 backdrop-blur-sm flex items-center justify-center p-5">
            <div
              ref={confirmDrag.popupRef}
              style={confirmDrag.popupStyle}
              className="w-full max-w-xs rounded-3xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl text-zinc-900 dark:text-zinc-100"
            >
              <div
                {...confirmDrag.handleProps}
                title="Kéo để di chuyển hộp thoại"
                className="flex items-start justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <GripHorizontal className="w-4 h-4 text-zinc-400 shrink-0" />
                  <h3 className="text-sm font-bold truncate">{confirmState.title}</h3>
                </div>
                <button onClick={closeConfirm} className="text-zinc-400 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{confirmState.message}</p>
              <div className="flex gap-2">
                <button
                  onClick={closeConfirm}
                  className="flex-1 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    await confirmState.onConfirm();
                    closeConfirm();
                  }}
                  className={`flex-1 py-2 rounded-xl text-white text-xs font-bold ${
                    confirmState.destructive ? 'bg-rose-500' : 'bg-[#A78BFA]'
                  }`}
                >
                  {confirmState.confirmLabel || 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
