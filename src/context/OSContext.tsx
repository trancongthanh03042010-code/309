import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { osApi } from '../services/api';
import type {
  ActiveCallState,
  AppId,
  Character,
  CharacterMemory,
  ChatMessage,
  OSBootstrapData,
  SharePayload,
} from '../types/os';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface AppLaunchParams {
  conversationId?: string;
  characterId?: string;
  autoReplyMsgId?: string;
  contactId?: string;
  mapQuery?: string;
  translateText?: string;
  url?: string;
  noteId?: string;
  tab?: string;
  postId?: string;
  txId?: string;
  bankingAction?: 'transfer' | 'receive' | 'char_request';
  prefillCharId?: string;
  profileId?: string;
  chatUserId?: string;
  videoId?: string;
  videoTitle?: string;
  videoChannel?: string;
  videoThumb?: string;
  carrierId?: string;
  simId?: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  cover: string;
  type: 'synth' | 'audio';
  audioUrl?: string;
  freqs?: number[];
}

export const BUILTIN_TRACKS: MusicTrack[] = [
  {
    id: 'trk_rain_shibuya',
    title: 'Mưa Trên Kính Shibuya',
    artist: 'Yuki Shirakawa',
    durationSec: 180,
    cover: '/src/assets/images/char_yuki_1794880089308.jpg',
    type: 'synth',
    freqs: [220, 277.18, 329.63, 415.3],
  },
  {
    id: 'trk_sakura_breeze',
    title: 'Gió Hoàng Hôn Sakura',
    artist: 'Sakura & Yuki',
    durationSec: 165,
    cover: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
    type: 'synth',
    freqs: [261.63, 329.63, 392.0, 493.88],
  },
  {
    id: 'trk_midnight_loop',
    title: 'Vòng Cầu Nửa Đêm',
    artist: 'Akira Kurosawa',
    durationSec: 210,
    cover: '/src/assets/images/char_akira_1794880089961.jpg',
    type: 'synth',
    freqs: [196.0, 246.94, 293.66, 369.99],
  },
];

export interface ClipboardEntry {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
}

export interface OfflineQueuedMessage {
  id: string;
  client_temp_id?: string;
  conversation_id: string;
  content: string;
  msg_type: string;
  attachment_json: string;
  reply_to_id: string;
  createdAt: string;
}

export interface PipState {
  kind: 'music' | 'podcast' | 'call';
  title: string;
  subtitle: string;
  cover?: string;
  isPlaying: boolean;
  progressSec: number;
  durationSec: number;
  appId: AppId;
}

export interface YouTubeQueuedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnail: string;
  durationLabel?: string;
}

export interface YouTubePlayerState {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnail: string;
  durationLabel?: string;
  isPlaying: boolean;
  backgroundMode: boolean;
  isFullscreen: boolean;
  progressSec: number;
  durationSec: number;
  playbackRate: number;
  seekRequest?: { sec: number; seq: number } | null;
  queue: YouTubeQueuedVideo[];
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface OSContextValue {
  data: OSBootstrapData | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  bootComplete: boolean;
  skipBoot: () => void;
  isLocked: boolean;
  lockPhone: () => void;
  unlockPhone: () => void;
  activeApp: AppId | null;
  splitApp: AppId | null;
  setSplitApp: (appId: AppId | null) => void;
  floatingApp: AppId | null;
  setFloatingApp: (appId: AppId | null) => void;
  appParams: AppLaunchParams;
  recentApps: AppId[];
  homePage: number;
  setHomePage: (page: number | ((prev: number) => number)) => void;
  registerBackHandler: (handler: () => boolean) => () => void;
  handleSystemBack: () => boolean;
  hasBackLayer: boolean;
  openApp: (appId: AppId, params?: AppLaunchParams) => void;
  closeCurrentApp: () => void;
  closeRecentApp: (appId: AppId) => void;
  closeAllRecents: () => void;

  // Overlays
  controlCenterOpen: boolean;
  setControlCenterOpen: (v: boolean) => void;
  notificationCenterOpen: boolean;
  setNotificationCenterOpen: (v: boolean) => void;
  recentAppsOpen: boolean;
  setRecentAppsOpen: (v: boolean) => void;
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (v: boolean) => void;
  sharePayload: SharePayload | null;
  openShareSheet: (payload: SharePayload) => void;
  closeShareSheet: () => void;
  flashlightOn: boolean;
  setFlashlightOn: (v: boolean) => void;
  tabletMode: boolean;
  setTabletMode: (v: boolean) => void;

  // Hardware / Live indicators / OS 3.0 State
  cameraActive: boolean;
  setCameraActive: (v: boolean) => void;
  micActive: boolean;
  setMicActive: (v: boolean) => void;
  aiBusyLabel: string | null;
  setAiBusyLabel: (v: string | null) => void;
  isOnline: boolean;
  batterySource: 'real' | 'simulated';
  screenRecording: boolean;
  setScreenRecording: (v: boolean) => void;

  // Sound & Haptics
  playSoundEffect: (kind: 'tap' | 'notif' | 'msg' | 'shutter' | 'error' | 'key') => void;
  triggerHaptic: (pattern?: 'touch' | 'msg' | 'call') => void;

  // Unified Time & Date
  getNow: () => Date;
  formatTime: (d?: Date) => string;

  // Timer synced with Dynamic Island
  timerSecondsLeft: number;
  timerRunning: boolean;
  startTimer: (seconds: number) => void;
  pauseTimer: () => void;
  resetTimer: () => void;

  // Music Player synced with Dynamic Island & MediaSession
  tracks: MusicTrack[];
  addCustomTrack: (t: MusicTrack) => void;
  currentTrack: MusicTrack | null;
  musicPlaying: boolean;
  musicProgress: number;
  musicShuffle: boolean;
  musicRepeat: 'off' | 'all' | 'one';
  toggleMusicShuffle: () => void;
  cycleMusicRepeat: () => void;
  playTrack: (track: MusicTrack) => void;
  toggleMusic: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekMusic: (sec: number) => void;

  // PiP Overlay & Persistent Background YouTube Player
  pipState: PipState | null;
  setPipState: (pip: PipState | null) => void;
  activeYouTube: YouTubePlayerState | null;
  playYouTubeVideo: (video: {
    videoId: string;
    title: string;
    channelTitle: string;
    channelId?: string;
    thumbnail: string;
    durationLabel?: string;
    startSec?: number;
    queue?: YouTubeQueuedVideo[];
  }) => void;
  toggleYouTubePlay: () => void;
  setYouTubePlayingState: (playing: boolean) => void;
  toggleYouTubeBackgroundMode: () => void;
  setYouTubeFullscreen: (fullscreen: boolean) => void;
  seekYouTubeTo: (sec: number) => void;
  setYouTubePlaybackRate: (rate: number) => void;
  setYouTubeProgress: (progressSec: number, durationSec?: number) => void;
  setYouTubeQueue: (queue: YouTubeQueuedVideo[]) => void;
  playNextYouTubeVideo: () => void;
  stopYouTubeVideo: () => void;

  // Clipboard & Virtual Keyboard
  clipboardHistory: ClipboardEntry[];
  addClipboardEntry: (text: string, isSecret?: boolean) => void;
  togglePinClipboard: (id: string) => void;
  deleteClipboardEntry: (id: string) => void;
  clearClipboard: () => void;
  virtualKeyboardOpen: boolean;
  setVirtualKeyboardOpen: (v: boolean) => void;
  insertKbText: (txt: string) => void;
  backspaceKbText: () => void;

  // Offline Queue
  offlineQueue: OfflineQueuedMessage[];
  queueOfflineMessage: (msg: Omit<OfflineQueuedMessage, 'id' | 'createdAt'>) => void;

  // Calls & TTS
  activeCall: ActiveCallState | null;
  startCall: (opts: { name: string; phone: string; avatar?: string; isAi?: boolean; isVideo?: boolean; characterId?: string }) => void;
  triggerIncomingCall: (opts: { name: string; phone: string; avatar?: string; isAi?: boolean; isVideo?: boolean; characterId?: string }) => void;
  answerCall: () => void;
  endCall: () => void;
  toggleCallMute: () => void;
  toggleCallSpeaker: () => void;
  toggleCallHold: () => void;
  toggleCallCamera: () => void;
  playTtsAudio: (base64Wav: string) => Promise<void>;

  // Feedback, Errors, Automation & PWA
  toasts: ToastItem[];
  showToast: (
    title: string,
    message: string,
    type?: 'info' | 'success' | 'error',
    action?: { label: string; onClick: () => void }
  ) => void;
  confirmState: ConfirmDialogState | null;
  requestConfirm: (state: ConfirmDialogState) => void;
  closeConfirm: () => void;
  updateProfile: (patch: Record<string, unknown>) => Promise<void>;
  triggerShortcutEvent: (eventName: string, detail?: string) => Promise<void>;
  logSystemError: (appId: string, errorCode: string, message: string, detail?: string) => Promise<void>;
  weatherSummary: { temp: number; label: string; city: string } | null;
  canInstallPwa: boolean;
  isPwaInstalled: boolean;
  promptPwaInstall: () => Promise<void>;

  // Instant Chat State Updaters (Optimistic UI)
  upsertLocalMessage: (msg: ChatMessage) => void;
  replaceLocalMessage: (tempId: string, savedMsg: ChatMessage) => void;
  removeLocalMessage: (msgId: string) => void;
  markConversationRead: (convId: string) => void;
  applyAiReplyState: (res: {
    aiMessage: ChatMessage | null;
    aiMessages?: ChatMessage[];
    updatedCharacter: Character | null;
    newMemoryRecord?: CharacterMemory | null;
  }) => void;
}

const OSContext = createContext<OSContextValue | null>(null);

export function OSProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<OSBootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bootComplete, setBootComplete] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [splitApp, setSplitApp] = useState<AppId | null>(null);
  const [floatingApp, setFloatingApp] = useState<AppId | null>(null);
  const [appParams, setAppParams] = useState<AppLaunchParams>({});
  const [recentApps, setRecentApps] = useState<AppId[]>([]);
  const [homePage, setHomePageState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('phoneos_home_page_v1'));
      if (Number.isInteger(saved) && saved >= 0 && saved <= 3) return saved;
    } catch {
      // ignore storage errors
    }
    return 0;
  });
  const [backHandlerVersion, setBackHandlerVersion] = useState(0);
  const backHandlersRef = useRef<Array<{ id: number; handler: () => boolean }>>([]);
  const backHandlerSeqRef = useRef(0);

  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [recentAppsOpen, setRecentAppsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [aiBusyLabel, setAiBusyLabel] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [batterySource, setBatterySource] = useState<'real' | 'simulated'>('simulated');
  const [screenRecording, setScreenRecording] = useState(false);

  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  const [tracks, setTracks] = useState<MusicTrack[]>(BUILTIN_TRACKS);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(BUILTIN_TRACKS[0]);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [musicRepeat, setMusicRepeat] = useState<'off' | 'all' | 'one'>('all');
  const [pipState, setPipState] = useState<PipState | null>(null);
  const [activeYouTube, setActiveYouTube] = useState<YouTubePlayerState | null>(null);

  const [clipboardHistory, setClipboardHistory] = useState<ClipboardEntry[]>(() => {
    try {
      const saved = localStorage.getItem('phoneos_clipboard_v3');
      return saved ? (JSON.parse(saved) as ClipboardEntry[]) : [];
    } catch {
      return [];
    }
  });
  const [virtualKeyboardOpen, setVirtualKeyboardOpen] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedMessage[]>(() => {
    try {
      const saved = localStorage.getItem('phoneos_offline_queue_v3');
      return saved ? (JSON.parse(saved) as OfflineQueuedMessage[]) : [];
    } catch {
      return [];
    }
  });

  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [weatherSummary, setWeatherSummary] = useState<{ temp: number; label: string; city: string } | null>(null);

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthOscRef = useRef<OscillatorNode[]>([]);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastFocusedInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const showToast = useCallback(
    (
      title: string,
      message: string,
      type: 'info' | 'success' | 'error' = 'info',
      action?: { label: string; onClick: () => void }
    ) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, type, action }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, action ? 5500 : 3800);
    },
    []
  );

  const refreshData = useCallback(async () => {
    try {
      const boot = await osApi.bootstrap();
      setData(boot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải PHONE OS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Persist clipboard & offline queue locally
  useEffect(() => {
    try {
      localStorage.setItem('phoneos_clipboard_v3', JSON.stringify(clipboardHistory.slice(0, 20)));
    } catch {
      // ignore
    }
  }, [clipboardHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('phoneos_offline_queue_v3', JSON.stringify(offlineQueue));
    } catch {
      // ignore
    }
  }, [offlineQueue]);

  useEffect(() => {
    try {
      localStorage.setItem('phoneos_home_page_v1', String(homePage));
    } catch {
      // ignore
    }
  }, [homePage]);

  const setHomePage = useCallback((next: number | ((prev: number) => number)) => {
    setHomePageState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(3, Math.trunc(raw)));
    });
  }, []);

  const registerBackHandler = useCallback((handler: () => boolean) => {
    const id = ++backHandlerSeqRef.current;
    backHandlersRef.current = [...backHandlersRef.current, { id, handler }];
    setBackHandlerVersion((v) => v + 1);
    return () => {
      backHandlersRef.current = backHandlersRef.current.filter((item) => item.id !== id);
      setBackHandlerVersion((v) => v + 1);
    };
  }, []);

  // Track last focused text input for Virtual Keyboard
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (target.type !== 'password' && target.type !== 'range' && target.type !== 'checkbox' && target.type !== 'file') {
          lastFocusedInputRef.current = target;
        }
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // PWA Install Listeners
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptPwaInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsPwaInstalled(true);
      setInstallPrompt(null);
      showToast('PHONE OS PWA', 'Đã cài đặt PHONE OS lên thiết bị của bạn!', 'success');
    }
  }, [installPrompt, showToast]);

  // Apply Dark/Light theme, font scale, accessibility & motion classes
  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    const root = document.documentElement;
    if (p.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.classList.toggle('os-reduce-motion', Boolean(p.reduce_motion) || p.anim_level === 'reduced');
    root.classList.toggle('os-no-motion', p.anim_level === 'none');
    root.classList.toggle('os-high-contrast', Boolean(p.high_contrast));
    root.classList.toggle('os-bold-text', p.font_weight === 'bold');

    const basePx = p.font_size === 'small' ? 14.5 : p.font_size === 'large' ? 17.5 : 16;
    const zoomFactor = p.ui_zoom === 'compact' ? 0.94 : p.ui_zoom === 'large' ? 1.07 : 1;
    root.style.fontSize = `${(basePx * zoomFactor).toFixed(1)}px`;
  }, [
    data?.profile?.theme,
    data?.profile?.font_size,
    data?.profile?.ui_zoom,
    data?.profile?.reduce_motion,
    data?.profile?.anim_level,
    data?.profile?.high_contrast,
    data?.profile?.font_weight,
  ]);

  // Auto-complete boot animation cleanly
  useEffect(() => {
    if (!loading && data && !bootComplete) {
      const timer = setTimeout(() => {
        setBootComplete(true);
      }, 1300);
      return () => clearTimeout(timer);
    }
  }, [loading, data, bootComplete]);

  // Real Battery API check + periodic simulation drain/charge
  useEffect(() => {
    let cleanupReal: (() => void) | undefined;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (ev: string, fn: () => void) => void;
        removeEventListener: (ev: string, fn: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((bat) => {
          setBatterySource('real');
          const syncBat = () => {
            const pct = Math.round(bat.level * 100);
            const chg = bat.charging ? 1 : 0;
            setData((prev) =>
              prev ? { ...prev, profile: { ...prev.profile, battery_level: pct, charging: chg } } : prev
            );
          };
          syncBat();
          bat.addEventListener('levelchange', syncBat);
          bat.addEventListener('chargingchange', syncBat);
          cleanupReal = () => {
            bat.removeEventListener('levelchange', syncBat);
            bat.removeEventListener('chargingchange', syncBat);
          };
        })
        .catch(() => setBatterySource('simulated'));
    }
    return () => {
      if (cleanupReal) cleanupReal();
    };
  }, []);

  // Online / Offline listeners + auto-flush queued messages
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      showToast('Đã khôi phục kết nối mạng', 'Đang đồng bộ hàng đợi tin nhắn...', 'success');
    };
    const goOffline = () => {
      setIsOnline(false);
      showToast('Mất kết nối mạng', 'Tin nhắn mới sẽ được lưu vào hàng đợi ngoại tuyến.', 'info');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [showToast]);

  // Auto-lock inactivity monitor
  useEffect(() => {
    const touch = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const id = setInterval(() => {
      const limitSec = data?.profile?.auto_lock_sec ?? 120;
      if (!isLocked && limitSec > 0 && Date.now() - lastActivityRef.current > limitSec * 1000) {
        setIsLocked(true);
        setControlCenterOpen(false);
        setNotificationCenterOpen(false);
      }
    }, 10000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      clearInterval(id);
    };
  }, [isLocked, data?.profile?.auto_lock_sec]);

  // Scheduled background job poll (every 30s)
  useEffect(() => {
    const id = setInterval(() => {
      osApi
        .runDueJobs()
        .then((r) => {
          if (r.executed > 0) refreshData();
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [refreshData]);

  // Fetch initial weather summary
  useEffect(() => {
    osApi
      .weather({ city: 'Ho Chi Minh City' })
      .then((res) => {
        const current = (res.forecast as { current?: { temperature_2m?: number; weather_code?: number } }).current;
        if (current?.temperature_2m !== undefined) {
          const code = current.weather_code ?? 0;
          const label = code >= 61 ? 'Có mưa' : code >= 2 ? 'Nhiều mây' : 'Quang đãng';
          setWeatherSummary({ temp: Math.round(current.temperature_2m), label, city: res.locationName.split(',')[0] });
        }
      })
      .catch(() => {});
  }, []);

  // Sound & Haptic Engine honoring Silent/DND/Profile
  const playSoundEffect = useCallback(
    (kind: 'tap' | 'notif' | 'msg' | 'shutter' | 'error' | 'key') => {
      const p = data?.profile;
      if (!p) return;
      if (p.silent_mode || p.sound_profile === 'silent' || p.sound_profile === 'vibrate') return;
      if (p.dnd || (p.focus_mode && p.focus_mode !== 'off')) {
        if (kind === 'notif' || kind === 'msg') return;
      }
      if (kind === 'tap' && p.sys_sounds === 0) return;
      if (kind === 'key' && p.kb_sounds === 0) return;
      if (kind === 'shutter' && p.cam_shutter === 0) return;

      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const vol = (p.volume ?? 75) / 100;
        gain.gain.value = 0.04 * vol;
        osc.type = kind === 'error' ? 'sawtooth' : 'sine';
        osc.frequency.value =
          kind === 'key' ? 620 : kind === 'tap' ? 520 : kind === 'shutter' ? 980 : kind === 'error' ? 240 : 780;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (kind === 'notif' ? 0.12 : 0.045));
      } catch {
        // ignore audio policy
      }
    },
    [data?.profile]
  );

  const triggerHaptic = useCallback(
    (pattern: 'touch' | 'msg' | 'call' = 'touch') => {
      const p = data?.profile;
      if (!p || typeof navigator.vibrate !== 'function') return;
      if (pattern === 'touch' && p.haptic_touch === 0) return;
      if (pattern === 'msg' && p.haptic_msg === 0) return;
      if (pattern === 'call' && p.haptic_call === 0) return;
      const mult = p.vibrate_intensity === 'strong' ? 2 : p.vibrate_intensity === 'light' ? 0.6 : 1;
      try {
        if (pattern === 'call') {
          navigator.vibrate([Math.round(120 * mult), 80, Math.round(120 * mult)]);
        } else if (p.vibrate_pattern === 'double') {
          navigator.vibrate([Math.round(18 * mult), 40, Math.round(18 * mult)]);
        } else {
          navigator.vibrate(Math.round(15 * mult));
        }
      } catch {
        // ignore
      }
    },
    [data?.profile]
  );

  const getNow = useCallback(() => {
    const offsetMin = data?.profile?.game_time_offset_min ?? 0;
    return new Date(Date.now() + offsetMin * 60_000);
  }, [data?.profile?.game_time_offset_min]);

  const formatTime = useCallback(
    (d?: Date) => {
      const target = d || getNow();
      const use24 = data?.profile?.clock_24h !== 0;
      const tz = data?.profile?.timezone || 'Asia/Ho_Chi_Minh';
      try {
        return new Intl.DateTimeFormat('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: !use24,
          timeZone: tz,
        }).format(target);
      } catch {
        return target.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: !use24 });
      }
    },
    [data?.profile?.clock_24h, data?.profile?.timezone, getNow]
  );

  // Timer tick
  useEffect(() => {
    if (!timerRunning || timerSecondsLeft <= 0) return;
    const id = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          playSoundEffect('notif');
          showToast('Hết giờ hẹn giờ', 'Bộ đếm ngược của bạn đã hoàn tất!', 'success');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerSecondsLeft, showToast, playSoundEffect]);

  // Music synthesis / playback engine
  const stopAudioEngine = useCallback(() => {
    synthOscRef.current.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    });
    synthOscRef.current = [];
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
    }
  }, []);

  const nextTrack = useCallback(() => {
    if (!currentTrack || tracks.length === 0) return;
    if (musicRepeat === 'one') {
      setMusicProgress(0);
      if (htmlAudioRef.current) htmlAudioRef.current.currentTime = 0;
      return;
    }
    if (musicShuffle && tracks.length > 1) {
      const candidates = tracks.filter((t) => t.id !== currentTrack.id);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      setCurrentTrack(next);
      setMusicProgress(0);
      return;
    }
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    const next = tracks[(idx + 1) % tracks.length];
    setCurrentTrack(next);
    setMusicProgress(0);
  }, [currentTrack, tracks, musicRepeat, musicShuffle]);

  const prevTrack = useCallback(() => {
    if (!currentTrack || tracks.length === 0) return;
    if (musicProgress > 4) {
      setMusicProgress(0);
      if (htmlAudioRef.current) htmlAudioRef.current.currentTime = 0;
      return;
    }
    const idx = tracks.findIndex((t) => t.id === currentTrack.id);
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    setCurrentTrack(prev);
    setMusicProgress(0);
  }, [currentTrack, tracks, musicProgress]);

  const seekMusic = useCallback((sec: number) => {
    setMusicProgress(sec);
    if (htmlAudioRef.current && Number.isFinite(htmlAudioRef.current.duration)) {
      htmlAudioRef.current.currentTime = Math.min(sec, htmlAudioRef.current.duration);
    }
  }, []);

  useEffect(() => {
    if (!musicPlaying || !currentTrack) {
      stopAudioEngine();
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'paused';
        } catch {
          // ignore
        }
      }
      return;
    }

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: 'PHONE OS 4.0',
          artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: '256x256', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('play', () => setMusicPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => setMusicPlaying(false));
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      } catch {
        // ignore unsupported mediaSession actions
      }
    }

    if (currentTrack.type === 'audio' && currentTrack.audioUrl) {
      if (!htmlAudioRef.current) {
        htmlAudioRef.current = new Audio();
      }
      if (htmlAudioRef.current.src !== currentTrack.audioUrl) {
        htmlAudioRef.current.src = currentTrack.audioUrl;
      }
      htmlAudioRef.current.volume = (data?.profile.vol_media ?? data?.profile.volume ?? 75) / 100;
      htmlAudioRef.current.play().catch(() => {});
    } else if (currentTrack.type === 'synth' && currentTrack.freqs) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const master = ctx.createGain();
        master.gain.value = 0.025 * ((data?.profile.vol_media ?? data?.profile.volume ?? 75) / 100);
        master.connect(ctx.destination);
        const oscs = currentTrack.freqs.map((f) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          o.connect(master);
          o.start();
          return o;
        });
        synthOscRef.current = oscs;
      } catch {
        // ignore audio context block
      }
    }

    const progId = setInterval(() => {
      setMusicProgress((p) => {
        const dur = currentTrack.durationSec || 180;
        if (p + 1 >= dur) {
          setTimeout(() => nextTrack(), 0);
          return 0;
        }
        return p + 1;
      });
    }, 1000);

    return () => {
      clearInterval(progId);
      stopAudioEngine();
    };
  }, [musicPlaying, currentTrack, data?.profile.volume, data?.profile.vol_media, stopAudioEngine, nextTrack, prevTrack]);

  // Sync MediaSession for persistent background YouTube playback when music isn't playing
  useEffect(() => {
    if (musicPlaying || !activeYouTube) return;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: activeYouTube.title,
          artist: activeYouTube.channelTitle || 'YouTube',
          album: 'YouTube · PHONE OS 4.0',
          artwork: activeYouTube.thumbnail ? [{ src: activeYouTube.thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.playbackState = activeYouTube.isPlaying ? 'playing' : 'paused';
        navigator.mediaSession.setActionHandler('play', () =>
          setActiveYouTube((prev) => (prev ? { ...prev, isPlaying: true } : null))
        );
        navigator.mediaSession.setActionHandler('pause', () =>
          setActiveYouTube((prev) => (prev ? { ...prev, isPlaying: false } : null))
        );
      } catch {
        // ignore unsupported mediaSession
      }
    }
  }, [musicPlaying, activeYouTube]);

  const playYouTubeVideo = useCallback(
    (video: {
      videoId: string;
      title: string;
      channelTitle: string;
      channelId?: string;
      thumbnail: string;
      durationLabel?: string;
      startSec?: number;
      queue?: YouTubeQueuedVideo[];
    }) => {
      setMusicPlaying(false);
      setPipState(null);
      setActiveYouTube((prev) => ({
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        channelId: video.channelId,
        thumbnail: video.thumbnail,
        durationLabel: video.durationLabel,
        isPlaying: true,
        backgroundMode: false,
        isFullscreen: false,
        progressSec: video.startSec && video.startSec > 0 ? video.startSec : 0,
        durationSec: 0,
        playbackRate: prev?.playbackRate || 1,
        seekRequest: video.startSec && video.startSec > 3 ? { sec: video.startSec, seq: Date.now() } : null,
        queue: video.queue ?? prev?.queue ?? [],
      }));
    },
    []
  );

  const toggleYouTubePlay = useCallback(() => {
    setActiveYouTube((prev) => {
      if (!prev) return null;
      if (!prev.isPlaying) setMusicPlaying(false);
      return { ...prev, isPlaying: !prev.isPlaying };
    });
  }, []);

  const setYouTubePlayingState = useCallback((playing: boolean) => {
    setActiveYouTube((prev) => (prev && prev.isPlaying !== playing ? { ...prev, isPlaying: playing } : prev));
  }, []);

  const toggleYouTubeBackgroundMode = useCallback(() => {
    setActiveYouTube((prev) => (prev ? { ...prev, backgroundMode: !prev.backgroundMode, isFullscreen: false } : null));
  }, []);

  const setYouTubeFullscreen = useCallback((fullscreen: boolean) => {
    setActiveYouTube((prev) => (prev ? { ...prev, isFullscreen: fullscreen } : null));
  }, []);

  const seekYouTubeTo = useCallback((sec: number) => {
    setActiveYouTube((prev) => {
      if (!prev) return null;
      const clamped = Math.max(0, prev.durationSec > 0 ? Math.min(sec, prev.durationSec) : sec);
      return {
        ...prev,
        progressSec: clamped,
        seekRequest: { sec: clamped, seq: (prev.seekRequest?.seq || 0) + 1 },
      };
    });
  }, []);

  const setYouTubePlaybackRate = useCallback((rate: number) => {
    setActiveYouTube((prev) => (prev ? { ...prev, playbackRate: rate } : null));
  }, []);

  const setYouTubeProgress = useCallback((progressSec: number, durationSec?: number) => {
    setActiveYouTube((prev) => {
      if (!prev) return null;
      const nextDur = durationSec && durationSec > 0 ? durationSec : prev.durationSec;
      if (Math.abs(prev.progressSec - progressSec) < 0.4 && nextDur === prev.durationSec) return prev;
      return { ...prev, progressSec, durationSec: nextDur };
    });
  }, []);

  const setYouTubeQueue = useCallback((queue: YouTubeQueuedVideo[]) => {
    setActiveYouTube((prev) => (prev ? { ...prev, queue } : null));
  }, []);

  const playNextYouTubeVideo = useCallback(() => {
    setActiveYouTube((prev) => {
      if (!prev || prev.queue.length === 0) return prev;
      const idx = prev.queue.findIndex((q) => q.videoId === prev.videoId);
      const next = prev.queue[(idx + 1) % prev.queue.length];
      if (!next) return prev;
      return {
        ...prev,
        videoId: next.videoId,
        title: next.title,
        channelTitle: next.channelTitle,
        channelId: next.channelId,
        thumbnail: next.thumbnail,
        durationLabel: next.durationLabel,
        isPlaying: true,
        progressSec: 0,
        durationSec: 0,
        seekRequest: null,
      };
    });
  }, []);

  const stopYouTubeVideo = useCallback(() => {
    setActiveYouTube(null);
  }, []);

  const updateProfile = useCallback(async (patch: Record<string, unknown>) => {
    const updated = await osApi.updateProfile(patch);
    setData((prev) => (prev ? { ...prev, profile: updated as OSBootstrapData['profile'] } : prev));
  }, []);

  const logSystemError = useCallback(
    async (appId: string, errorCode: string, message: string, detail = '') => {
      try {
        await osApi.logSystemError({ app_id: appId, error_code: errorCode, message, detail });
        refreshData();
      } catch {
        // avoid infinite error loop
      }
    },
    [refreshData]
  );

  const triggerShortcutEvent = useCallback(
    async (eventName: string, detail?: string) => {
      if (!data) return;
      const matched = data.shortcuts.filter((s) => s.enabled && s.trigger_event === eventName);
      for (const sc of matched) {
        await osApi.updateShortcut(sc.id, {
          last_run: new Date().toISOString(),
          run_count: sc.run_count + 1,
        });
        if (sc.action_type === 'notify') {
          const payload = JSON.parse(sc.action_payload || '{}') as { title?: string; body?: string };
          showToast(payload.title || sc.name, detail || payload.body || 'Đã chạy phím tắt');
        } else if (sc.action_type === 'set_dnd') {
          await updateProfile({ dnd: 1 });
          showToast('Phím tắt: Không làm phiền', 'Đã tự động bật chế độ Không làm phiền.');
        } else if (sc.action_type === 'log_calendar') {
          const today = new Date().toISOString().slice(0, 10);
          await osApi.createEvent({
            title: `Hoàn thành: ${detail || 'Công việc'}`,
            start_iso: `${today}T18:00:00`,
            end_iso: `${today}T18:30:00`,
            color: '#10B981',
            notes: 'Tự động ghi lại bởi Phím tắt',
          });
          showToast('Đồng bộ Phím tắt', 'Đã ghi việc hoàn thành vào Lịch.');
        }
      }
      if (matched.length > 0) {
        refreshData();
      }
    },
    [data, showToast, updateProfile, refreshData]
  );

  const openApp = useCallback(
    (appId: AppId, params: AppLaunchParams = {}) => {
      triggerHaptic('touch');
      playSoundEffect('tap');
      setControlCenterOpen(false);
      setNotificationCenterOpen(false);
      setRecentAppsOpen(false);
      setGlobalSearchOpen(false);
      setActiveApp(appId);
      setAppParams(params);
      setRecentApps((prev) => [appId, ...prev.filter((id) => id !== appId)].slice(0, 10));
      osApi
        .updateApp(appId, {
          usage_count: (data?.apps.find((a) => a.app_id === appId)?.usage_count || 0) + 1,
          last_opened_at: new Date().toISOString(),
        })
        .catch(() => {});
    },
    [data?.apps, playSoundEffect, triggerHaptic]
  );

  const closeCurrentApp = useCallback(() => {
    setActiveApp(null);
    setSplitApp(null);
    setAppParams({});
  }, []);

  const handleSystemBack = useCallback((): boolean => {
    if (confirmState) {
      setConfirmState(null);
      return true;
    }
    if (sharePayload) {
      setSharePayload(null);
      return true;
    }
    if (globalSearchOpen) {
      setGlobalSearchOpen(false);
      return true;
    }
    if (notificationCenterOpen) {
      setNotificationCenterOpen(false);
      return true;
    }
    if (controlCenterOpen) {
      setControlCenterOpen(false);
      return true;
    }
    if (recentAppsOpen) {
      setRecentAppsOpen(false);
      return true;
    }
    if (virtualKeyboardOpen) {
      setVirtualKeyboardOpen(false);
      return true;
    }
    if (flashlightOn) {
      setFlashlightOn(false);
      return true;
    }
    const stack = [...backHandlersRef.current];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      try {
        if (stack[i].handler()) return true;
      } catch {
        // continue down stack
      }
    }
    if (floatingApp) {
      setFloatingApp(null);
      return true;
    }
    if (activeApp) {
      closeCurrentApp();
      return true;
    }
    return false;
  }, [
    confirmState,
    sharePayload,
    globalSearchOpen,
    notificationCenterOpen,
    controlCenterOpen,
    recentAppsOpen,
    virtualKeyboardOpen,
    flashlightOn,
    floatingApp,
    activeApp,
    closeCurrentApp,
  ]);

  const hasBackLayer = Boolean(
    confirmState ||
      sharePayload ||
      globalSearchOpen ||
      notificationCenterOpen ||
      controlCenterOpen ||
      recentAppsOpen ||
      virtualKeyboardOpen ||
      flashlightOn ||
      floatingApp ||
      activeApp ||
      backHandlerVersion > 0 && backHandlersRef.current.length > 0
  );

  const closeRecentApp = useCallback((appId: AppId) => {
    setRecentApps((prev) => prev.filter((id) => id !== appId));
    setActiveApp((curr) => (curr === appId ? null : curr));
    setSplitApp((curr) => (curr === appId ? null : curr));
    setFloatingApp((curr) => (curr === appId ? null : curr));
  }, []);

  const closeAllRecents = useCallback(() => {
    setRecentApps([]);
    setActiveApp(null);
    setSplitApp(null);
    setFloatingApp(null);
    setRecentAppsOpen(false);
  }, []);

  // Clipboard helpers (skips secrets)
  const addClipboardEntry = useCallback((text: string, isSecret = false) => {
    if (!text.trim() || isSecret) return;
    setClipboardHistory((prev) => {
      const filtered = prev.filter((item) => item.text !== text);
      return [{ id: `cb_${Date.now()}`, text, pinned: false, createdAt: new Date().toISOString() }, ...filtered].slice(0, 20);
    });
  }, []);

  const togglePinClipboard = useCallback((id: string) => {
    setClipboardHistory((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }, []);

  const deleteClipboardEntry = useCallback((id: string) => {
    setClipboardHistory((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboardHistory((prev) => prev.filter((c) => c.pinned));
  }, []);

  // Virtual Keyboard insertion into active input/textarea
  const insertKbText = useCallback(
    (txt: string) => {
      playSoundEffect('key');
      triggerHaptic('touch');
      const el = lastFocusedInputRef.current;
      if (!el || !document.contains(el)) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + txt + el.value.slice(end);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      try {
        el.setSelectionRange(start + txt.length, start + txt.length);
      } catch {
        // ignore
      }
    },
    [playSoundEffect, triggerHaptic]
  );

  const backspaceKbText = useCallback(() => {
    playSoundEffect('key');
    const el = lastFocusedInputRef.current;
    if (!el || !document.contains(el)) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start === 0 && end === 0) return;
    const delStart = start === end ? start - 1 : start;
    const next = el.value.slice(0, delStart) + el.value.slice(end);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    try {
      el.setSelectionRange(delStart, delStart);
    } catch {
      // ignore
    }
  }, [playSoundEffect]);

  const queueOfflineMessage = useCallback((msg: Omit<OfflineQueuedMessage, 'id' | 'createdAt'>) => {
    const tempId = msg.client_temp_id || `oq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setOfflineQueue((prev) => [
      ...prev,
      { ...msg, id: tempId, client_temp_id: tempId, createdAt: new Date().toISOString() },
    ]);
  }, []);

  const startCall = useCallback(
    (opts: { name: string; phone: string; avatar?: string; isAi?: boolean; isVideo?: boolean; characterId?: string }) => {
      triggerHaptic('call');
      setActiveCall({
        id: `call_${Date.now()}`,
        name: opts.name,
        phone: opts.phone,
        avatar: opts.avatar || '',
        isAi: Boolean(opts.isAi),
        isVideo: Boolean(opts.isVideo),
        characterId: opts.characterId,
        status: 'connected',
        startedAt: Date.now(),
        muted: false,
        speaker: true,
        onHold: false,
        cameraOff: false,
      });
    },
    [triggerHaptic]
  );

  const triggerIncomingCall = useCallback(
    (opts: { name: string; phone: string; avatar?: string; isAi?: boolean; isVideo?: boolean; characterId?: string }) => {
      triggerHaptic('call');
      setActiveCall({
        id: `call_${Date.now()}`,
        name: opts.name,
        phone: opts.phone,
        avatar: opts.avatar || '',
        isAi: Boolean(opts.isAi),
        isVideo: Boolean(opts.isVideo),
        characterId: opts.characterId,
        status: 'incoming',
        startedAt: Date.now(),
        muted: false,
        speaker: false,
        onHold: false,
        cameraOff: false,
      });
    },
    [triggerHaptic]
  );

  const answerCall = useCallback(() => {
    setActiveCall((prev) => (prev ? { ...prev, status: 'connected', startedAt: Date.now() } : null));
  }, []);

  const endCall = useCallback(async () => {
    if (!activeCall) return;
    const dur = activeCall.status === 'connected' ? Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)) : 0;
    const direction = activeCall.status === 'incoming' ? 'rejected' : 'outgoing';
    setActiveCall(null);
    await osApi.logCall({
      name: activeCall.name,
      phone: activeCall.phone,
      avatar: activeCall.avatar,
      direction,
      is_ai: activeCall.isAi ? 1 : 0,
      character_id: activeCall.characterId || '',
      duration_sec: dur,
    });
    refreshData();
  }, [activeCall, refreshData]);

  const playTtsAudio = useCallback(
    async (base64Wav: string) => {
      const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
      audio.volume = (data?.profile.vol_media ?? data?.profile.volume ?? 75) / 100;
      await audio.play();
    },
    [data?.profile.volume, data?.profile.vol_media]
  );

  const upsertLocalMessage = useCallback((msg: ChatMessage) => {
    setData((prev) => {
      if (!prev) return prev;
      const exists = prev.messages.some((m) => m.id === msg.id);
      const nextMessages = exists ? prev.messages.map((m) => (m.id === msg.id ? msg : m)) : [...prev.messages, msg];
      const nextConvs = prev.conversations.map((c) =>
        c.id === msg.conversation_id
          ? { ...c, updated_at: msg.created_at, last_message_id: msg.id, unread_count: 0 }
          : c
      );
      return { ...prev, messages: nextMessages, conversations: nextConvs };
    });
  }, []);

  const replaceLocalMessage = useCallback((tempId: string, savedMsg: ChatMessage) => {
    setData((prev) => {
      if (!prev) return prev;
      const found = prev.messages.some((m) => m.id === tempId);
      const nextMessages = found
        ? prev.messages.map((m) => (m.id === tempId ? savedMsg : m))
        : prev.messages.some((m) => m.id === savedMsg.id)
          ? prev.messages.map((m) => (m.id === savedMsg.id ? savedMsg : m))
          : [...prev.messages, savedMsg];
      const nextConvs = prev.conversations.map((c) =>
        c.id === savedMsg.conversation_id
          ? { ...c, updated_at: savedMsg.created_at, last_message_id: savedMsg.id, unread_count: 0 }
          : c
      );
      return { ...prev, messages: nextMessages, conversations: nextConvs };
    });
  }, []);

  const removeLocalMessage = useCallback((msgId: string) => {
    setData((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== msgId) } : prev));
  }, []);

  const markConversationRead = useCallback((convId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)),
        notifications: prev.notifications.map((n) =>
          n.action_route === 'messages' && n.action_payload === convId ? { ...n, is_read: 1 } : n
        ),
      };
    });
    osApi.messagesV3.markConversationRead(convId).catch(() => {});
  }, []);

  const applyAiReplyState = useCallback(
    (res: {
      aiMessage: ChatMessage | null;
      aiMessages?: ChatMessage[];
      updatedCharacter: Character | null;
      newMemoryRecord?: CharacterMemory | null;
    }) => {
      const incoming = res.aiMessages && res.aiMessages.length > 0 ? res.aiMessages : res.aiMessage ? [res.aiMessage] : [];
      setData((prev) => {
        if (!prev) return prev;
        const nextMessages = [...prev.messages];
        let nextConvs = prev.conversations;
        for (const aiMsg of incoming) {
          if (!nextMessages.some((m) => m.id === aiMsg.id)) {
            nextMessages.push(aiMsg);
          }
          nextConvs = nextConvs.map((c) =>
            c.id === aiMsg.conversation_id
              ? { ...c, updated_at: aiMsg.created_at, last_message_id: aiMsg.id }
              : c
          );
        }
        const nextChars = res.updatedCharacter
          ? prev.characters.map((ch) => (ch.id === res.updatedCharacter!.id ? res.updatedCharacter! : ch))
          : prev.characters;
        const nextMems =
          res.newMemoryRecord && !prev.memories.some((m) => m.id === res.newMemoryRecord!.id)
            ? [res.newMemoryRecord, ...prev.memories]
            : prev.memories;
        return {
          ...prev,
          messages: nextMessages,
          conversations: nextConvs,
          characters: nextChars,
          memories: nextMems,
        };
      });
      if (incoming.length > 0) {
        playSoundEffect('msg');
        triggerHaptic('msg');
      }
    },
    [playSoundEffect, triggerHaptic]
  );

  // Auto-flush offline queue when back online
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;
    let cancelled = false;
    const flush = async () => {
      const queue = [...offlineQueue];
      const remaining: OfflineQueuedMessage[] = [];
      for (const qm of queue) {
        if (cancelled) {
          remaining.push(qm);
          continue;
        }
        try {
          const res = await osApi.sendMessage({
            conversation_id: qm.conversation_id,
            content: qm.content,
            msg_type: qm.msg_type,
            attachment_json: qm.attachment_json,
            reply_to_id: qm.reply_to_id,
            client_temp_id: qm.client_temp_id || qm.id,
            trigger_ai: true,
          });
          replaceLocalMessage(qm.id, res.userMessage);
          applyAiReplyState(res);
        } catch {
          remaining.push(qm);
        }
      }
      if (!cancelled) {
        setOfflineQueue(remaining);
      }
    };
    flush();
    return () => {
      cancelled = true;
    };
  }, [isOnline, offlineQueue, replaceLocalMessage, applyAiReplyState]);

  const value = useMemo<OSContextValue>(
    () => ({
      data,
      loading,
      error,
      refreshData,
      bootComplete,
      skipBoot: () => setBootComplete(true),
      isLocked,
      lockPhone: () => {
        setControlCenterOpen(false);
        setNotificationCenterOpen(false);
        setRecentAppsOpen(false);
        setVirtualKeyboardOpen(false);
        setIsLocked(true);
      },
      unlockPhone: () => {
        lastActivityRef.current = Date.now();
        setIsLocked(false);
      },
      activeApp,
      splitApp,
      setSplitApp,
      floatingApp,
      setFloatingApp,
      appParams,
      recentApps,
      homePage,
      setHomePage,
      registerBackHandler,
      handleSystemBack,
      hasBackLayer,
      openApp,
      closeCurrentApp,
      closeRecentApp,
      closeAllRecents,
      controlCenterOpen,
      setControlCenterOpen,
      notificationCenterOpen,
      setNotificationCenterOpen,
      recentAppsOpen,
      setRecentAppsOpen,
      globalSearchOpen,
      setGlobalSearchOpen,
      sharePayload,
      openShareSheet: (p) => setSharePayload(p),
      closeShareSheet: () => setSharePayload(null),
      flashlightOn,
      setFlashlightOn,
      tabletMode,
      setTabletMode,
      cameraActive,
      setCameraActive,
      micActive,
      setMicActive,
      aiBusyLabel,
      setAiBusyLabel,
      isOnline,
      batterySource,
      screenRecording,
      setScreenRecording,
      playSoundEffect,
      triggerHaptic,
      getNow,
      formatTime,
      timerSecondsLeft,
      timerRunning,
      startTimer: (sec) => {
        setTimerSecondsLeft(sec);
        setTimerRunning(true);
      },
      pauseTimer: () => setTimerRunning((r) => !r),
      resetTimer: () => {
        setTimerRunning(false);
        setTimerSecondsLeft(0);
      },
      tracks,
      addCustomTrack: (t) => setTracks((prev) => [t, ...prev]),
      currentTrack,
      musicPlaying,
      musicProgress,
      musicShuffle,
      musicRepeat,
      toggleMusicShuffle: () => setMusicShuffle((s) => !s),
      cycleMusicRepeat: () => setMusicRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
      playTrack: (t) => {
        setActiveYouTube((prev) => (prev ? { ...prev, isPlaying: false } : null));
        setCurrentTrack(t);
        setMusicProgress(0);
        setMusicPlaying(true);
      },
      toggleMusic: () => {
        setMusicPlaying((p) => {
          if (!p) setActiveYouTube((prev) => (prev ? { ...prev, isPlaying: false } : null));
          return !p;
        });
      },
      nextTrack,
      prevTrack,
      seekMusic,
      pipState,
      setPipState,
      activeYouTube,
      playYouTubeVideo,
      toggleYouTubePlay,
      setYouTubePlayingState,
      toggleYouTubeBackgroundMode,
      setYouTubeFullscreen,
      seekYouTubeTo,
      setYouTubePlaybackRate,
      setYouTubeProgress,
      setYouTubeQueue,
      playNextYouTubeVideo,
      stopYouTubeVideo,
      clipboardHistory,
      addClipboardEntry,
      togglePinClipboard,
      deleteClipboardEntry,
      clearClipboard,
      virtualKeyboardOpen,
      setVirtualKeyboardOpen,
      insertKbText,
      backspaceKbText,
      offlineQueue,
      queueOfflineMessage,
      activeCall,
      startCall,
      triggerIncomingCall,
      answerCall,
      endCall,
      toggleCallMute: () => setActiveCall((c) => (c ? { ...c, muted: !c.muted } : null)),
      toggleCallSpeaker: () => setActiveCall((c) => (c ? { ...c, speaker: !c.speaker } : null)),
      toggleCallHold: () => setActiveCall((c) => (c ? { ...c, onHold: !c.onHold } : null)),
      toggleCallCamera: () => setActiveCall((c) => (c ? { ...c, cameraOff: !c.cameraOff } : null)),
      playTtsAudio,
      toasts,
      showToast,
      confirmState,
      requestConfirm: (s) => setConfirmState(s),
      closeConfirm: () => setConfirmState(null),
      updateProfile,
      triggerShortcutEvent,
      logSystemError,
      weatherSummary,
      canInstallPwa: Boolean(installPrompt),
      isPwaInstalled,
      promptPwaInstall,
      upsertLocalMessage,
      replaceLocalMessage,
      removeLocalMessage,
      markConversationRead,
      applyAiReplyState,
    }),
    [
      data, loading, error, refreshData, bootComplete, isLocked, activeApp, splitApp, floatingApp, appParams, recentApps,
      homePage, setHomePage, registerBackHandler, handleSystemBack, hasBackLayer,
      openApp, closeCurrentApp, closeRecentApp, closeAllRecents, controlCenterOpen,
      notificationCenterOpen, recentAppsOpen, globalSearchOpen, sharePayload, flashlightOn,
      tabletMode, cameraActive, micActive, aiBusyLabel, isOnline, batterySource, screenRecording,
      playSoundEffect, triggerHaptic, getNow, formatTime, timerSecondsLeft, timerRunning, tracks,
      currentTrack, musicPlaying, musicProgress, musicShuffle, musicRepeat, nextTrack, prevTrack, seekMusic,
      pipState, activeYouTube, playYouTubeVideo, toggleYouTubePlay, setYouTubePlayingState, toggleYouTubeBackgroundMode,
      setYouTubeFullscreen, seekYouTubeTo, setYouTubePlaybackRate, setYouTubeProgress, setYouTubeQueue, playNextYouTubeVideo, stopYouTubeVideo,
      clipboardHistory, addClipboardEntry,
      togglePinClipboard, deleteClipboardEntry, clearClipboard, virtualKeyboardOpen, insertKbText,
      backspaceKbText, offlineQueue, queueOfflineMessage, activeCall, startCall, triggerIncomingCall,
      answerCall, endCall, playTtsAudio, toasts, showToast, confirmState, updateProfile,
      triggerShortcutEvent, logSystemError, weatherSummary, installPrompt, isPwaInstalled,
      promptPwaInstall, upsertLocalMessage, replaceLocalMessage, removeLocalMessage, markConversationRead, applyAiReplyState,
    ]
  );

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}

export function useOS(): OSContextValue {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error('useOS must be used within OSProvider');
  return ctx;
}

