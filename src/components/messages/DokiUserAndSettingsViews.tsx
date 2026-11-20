import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Lock,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Unlock,
  User,
  Volume2,
  Wrench,
} from 'lucide-react';
import type {
  AiProviderConfig,
  Character,
  DokiProfileOverview,
  DokiUserSettings,
  OSNotification,
  RelationshipEventRecord,
  UserProfile,
} from '../../types/os';
import { CHAT_WALLPAPERS, formatRelativeTime, handleCharImgError } from './utils';
import { osApi } from '../../services/api';

/* =========================================================================
 * 1. DokiChat Notification Center View (Section XV)
 * ========================================================================= */
interface DokiNotificationsViewProps {
  notifications: OSNotification[];
  characters: Character[];
  onBack: () => void;
  onOpenConversation: (convId: string) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function DokiNotificationsView({
  notifications,
  characters,
  onBack,
  onOpenConversation,
  onRefreshData,
  onShowToast,
}: DokiNotificationsViewProps) {
  const [checking, setChecking] = useState(false);

  const dokiNotifs = notifications.filter((n) => n.app_id === 'messages' || n.group_key === 'messages');

  const markRead = async (n: OSNotification) => {
    if (!n.is_read) {
      if (n.action_payload) {
        await osApi.messagesV3.markConversationRead(n.action_payload);
      } else {
        await osApi.markAllNotificationsRead();
      }
      await onRefreshData();
    }
    if (n.action_payload) {
      onOpenConversation(n.action_payload);
    }
  };

  const runProactiveCheck = async () => {
    setChecking(true);
    try {
      const res = await osApi.messagesV3.triggerProactive({ force: false });
      await onRefreshData();
      if (res.skipped) {
        onShowToast('Thông báo chủ động', res.reason || 'Chưa có nhân vật nào nhắn tin lúc này');
      } else {
        onShowToast(res.character?.name || 'YumeChat', 'Có tin nhắn chủ động mới!', 'success');
      }
    } catch (err) {
      onShowToast('Lỗi thông báo', err instanceof Error ? err.message : 'Lỗi AI', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <header className="px-3.5 py-2.5 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center hover:bg-violet-500/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-sm font-bold">Thông báo YumeChat</h3>
            <p className="text-[11px] text-zinc-500">{dokiNotifs.filter((x) => !x.is_read).length} chưa đọc</p>
          </div>
        </div>
        <button
          disabled={checking}
          onClick={runProactiveCheck}
          className="min-h-[38px] px-3 rounded-xl bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{checking ? 'Đang kiểm...' : 'Kiểm tra AI chủ động'}</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2.5">
        {dokiNotifs.length === 0 ? (
          <div className="py-16 text-center space-y-2 text-xs text-zinc-500">
            <Bell className="w-9 h-9 mx-auto text-violet-400 opacity-60" />
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">Chưa có thông báo YumeChat nào</p>
            <p>Khi nhân vật AI nhắn tin chủ động hoặc có dấu mốc quan hệ, thông báo sẽ hiện ở đây.</p>
          </div>
        ) : (
          dokiNotifs.map((n) => {
            const matchedChar = characters.find((c) => c.name === n.title);
            return (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className={`w-full doki-glass rounded-2xl p-3 flex items-start gap-3 text-left transition-colors ${
                  n.is_read ? 'opacity-70' : 'border-violet-400/60'
                }`}
              >
                <img
                  src={n.avatar || matchedChar?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                  alt={n.title}
                  loading="lazy"
                  onError={(e) => handleCharImgError(e, n.title)}
                  className="w-11 h-11 rounded-2xl object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate">{n.title}</span>
                    <span className="text-[10px] font-mono-num text-zinc-400 shrink-0">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-0.5">{n.body}</p>
                </div>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-pink-500 mt-1.5 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * 2. DokiChat User Profile View (Section XVII)
 * ========================================================================= */
interface DokiUserProfileViewProps {
  profile?: UserProfile;
  characters: Character[];
  relationshipEvents: RelationshipEventRecord[];
  onOpenSettings: () => void;
  onOpenMemories: () => void;
  onOpenCharacterProfile: (c: Character) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function DokiUserProfileView({
  profile,
  characters,
  relationshipEvents,
  onOpenSettings,
  onOpenMemories,
  onOpenCharacterProfile,
  onRefreshData,
  onShowToast,
}: DokiUserProfileViewProps) {
  const [overview, setOverview] = useState<DokiProfileOverview | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [bioInput, setBioInput] = useState(profile?.bio || '');

  useEffect(() => {
    osApi.messagesV3.getProfileOverview().then(setOverview).catch(() => {});
  }, []);

  const favoriteChars = characters.filter((c) => c.is_favorite === 1 && !c.is_blocked);
  const customChars = characters.filter((c) => c.is_custom === 1);

  const handleSaveProfile = async () => {
    await osApi.updateProfile({ name: nameInput.trim() || profile?.name, bio: bioInput.trim() });
    await onRefreshData();
    setEditing(false);
    onShowToast('Đã cập nhật hồ sơ', 'Thông tin của bạn sẽ được AI dùng khi trò chuyện.', 'success');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <header className="px-4 py-3 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-bold">Hồ sơ YumeChat</h3>
        </div>
        <button
          onClick={onOpenSettings}
          className="min-h-[38px] px-3 rounded-xl bg-violet-600 text-white text-xs font-semibold"
        >
          Cài đặt & AI
        </button>
      </header>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-4 text-xs">
        {/* User Identity Card */}
        <div className="doki-glass rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={profile?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
              alt={profile?.name || 'Người dùng'}
              loading="lazy"
              onError={(e) => handleCharImgError(e, profile?.name || 'U')}
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-violet-400/50"
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-display text-base font-bold truncate">{profile?.name || 'Người dùng'}</h4>
              <p className="text-[11px] text-zinc-500 truncate">@{profile?.username || 'user'} · {profile?.email}</p>
              {profile?.bio && <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">{profile.bio}</p>}
            </div>
            <button
              onClick={() => {
                setNameInput(profile?.name || '');
                setBioInput(profile?.bio || '');
                setEditing((v) => !v);
              }}
              className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold"
            >
              {editing ? 'Đóng' : 'Sửa'}
            </button>
          </div>

          {editing && (
            <div className="space-y-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Tên hiển thị"
                className="w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-zinc-900/80 outline-none"
              />
              <textarea
                rows={2}
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                placeholder="Giới thiệu bản thân..."
                className="w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-zinc-900/80 outline-none resize-none"
              />
              <button onClick={handleSaveProfile} className="w-full py-2 rounded-xl bg-violet-600 text-white font-semibold flex items-center justify-center gap-1">
                <Check className="w-4 h-4" />
                <span>Lưu hồ sơ</span>
              </button>
            </div>
          )}
        </div>

        {/* Real Statistics Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="doki-glass rounded-2xl p-3">
            <span className="text-base font-bold font-mono-num text-violet-600 block">
              {overview?.stats.sentCount ?? 0}
            </span>
            <span className="text-[10px] text-zinc-500">Tin đã gửi</span>
          </div>
          <div className="doki-glass rounded-2xl p-3">
            <span className="text-base font-bold font-mono-num text-pink-600 block">
              {overview?.stats.memCount ?? 0}
            </span>
            <span className="text-[10px] text-zinc-500">Ký ức AI</span>
          </div>
          <div className="doki-glass rounded-2xl p-3">
            <span className="text-base font-bold font-mono-num text-emerald-600 block">
              {overview?.stats.callCount ?? 0}
            </span>
            <span className="text-[10px] text-zinc-500">Cuộc gọi AI</span>
          </div>
        </div>

        {/* Shortcut to Kỷ niệm & Nhật ký */}
        <button
          onClick={onOpenMemories}
          className="w-full doki-glass rounded-2xl p-3.5 flex items-center justify-between font-semibold"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span>Mở Nhật ký Kỷ niệm & Cột mốc quan hệ</span>
          </span>
          <span className="text-violet-600">Xem</span>
        </button>

        {/* Favorite Characters */}
        <div className="space-y-2">
          <h4 className="font-bold flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-pink-500 fill-current" />
            <span>Nhân vật yêu thích ({favoriteChars.length})</span>
          </h4>
          {favoriteChars.length === 0 ? (
            <p className="text-zinc-500 doki-glass rounded-2xl p-3">Chưa có nhân vật yêu thích nào.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto os-scroll-hidden">
              {favoriteChars.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenCharacterProfile(c)}
                  className="w-28 shrink-0 doki-glass rounded-2xl p-2 text-center space-y-1"
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    loading="lazy"
                    onError={(e) => handleCharImgError(e, c.name)}
                    className="w-12 h-12 rounded-xl object-cover mx-auto"
                  />
                  <p className="font-semibold truncate">{c.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Custom Created Characters */}
        <div className="space-y-2">
          <h4 className="font-bold">Nhân vật bạn đã tạo ({customChars.length})</h4>
          {customChars.length === 0 ? (
            <p className="text-zinc-500 doki-glass rounded-2xl p-3">Bạn chưa tự tạo nhân vật nào.</p>
          ) : (
            <div className="space-y-1.5">
              {customChars.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenCharacterProfile(c)}
                  className="w-full doki-glass rounded-2xl p-2.5 flex items-center gap-2.5 text-left"
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    loading="lazy"
                    onError={(e) => handleCharImgError(e, c.name)}
                    className="w-10 h-10 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{c.name}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{c.tagline}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Relationship Events */}
        {(relationshipEvents.length > 0 || (overview?.recentRelEvents?.length || 0) > 0) && (
          <div className="doki-glass rounded-3xl p-3.5 space-y-2">
            <h4 className="font-bold">Hoạt động quan hệ gần đây</h4>
            {(overview?.recentRelEvents || relationshipEvents).slice(0, 6).map((ev) => {
              const ch = characters.find((c) => c.id === ev.character_id);
              return (
                <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b last:border-0 border-zinc-200/40 dark:border-zinc-800">
                  <span className="truncate">
                    <strong>{ch?.name || ev.character_id}:</strong> {ev.description}
                  </span>
                  <span className="text-zinc-400 font-mono-num shrink-0">{formatRelativeTime(ev.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * 3. DokiChat Settings & Non-Secret AI Config View (Section XVIII + XIX)
 * ========================================================================= */
interface DokiSettingsViewProps {
  dokiSettings?: DokiUserSettings | null;
  aiConfig?: AiProviderConfig | null;
  onBack: () => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function DokiSettingsView({
  dokiSettings,
  aiConfig,
  onBack,
  onRefreshData,
  onShowToast,
}: DokiSettingsViewProps) {
  const [settings, setSettings] = useState<Partial<DokiUserSettings>>(() => dokiSettings || {});
  const [aiForm, setAiForm] = useState({
    model_id: aiConfig?.model_id || 'gemini-4-hydrogen',
    fallback_model_id: aiConfig?.fallback_model_id || 'gemini-3.1-flash-lite',
    thinking_level: aiConfig?.thinking_level || 'LOW',
    streaming_enabled: aiConfig?.streaming_enabled ?? 1,
    max_tokens: aiConfig?.max_tokens || 1200,
    timeout_ms: aiConfig?.timeout_ms || 15000,
  });
  const [deviceCheckStatus, setDeviceCheckStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Admin lock state held strictly in memory (never localStorage)
  const [adminToken, setAdminToken] = useState('');
  const [aiUnlocked, setAiUnlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    if (dokiSettings) {
      setSettings(dokiSettings);
    }
  }, [dokiSettings]);

  useEffect(() => {
    if (aiConfig) {
      setAiForm({
        model_id: aiConfig.model_id || 'gemini-4-hydrogen',
        fallback_model_id: aiConfig.fallback_model_id || 'gemini-3.1-flash-lite',
        thinking_level: aiConfig.thinking_level || 'LOW',
        streaming_enabled: aiConfig.streaming_enabled ?? 1,
        max_tokens: aiConfig.max_tokens || 1200,
        timeout_ms: aiConfig.timeout_ms || 15000,
      });
    }
  }, [aiConfig]);

  useEffect(() => {
    return () => {
      setAdminToken('');
      setTokenInput('');
    };
  }, []);

  const handleVerifyAdmin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) {
      setVerifyError('Vui lòng nhập mã xác thực quản trị.');
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await osApi.messagesV3.verifyAiAdmin(candidate);
      if (res && (res.canEdit || res.verified || res.ok || res.isLocked === false)) {
        setAdminToken(candidate);
        setAiUnlocked(true);
        setUnlockOpen(false);
        setTokenInput('');
        setAiForm({
          model_id: res.model_id || aiForm.model_id,
          fallback_model_id: res.fallback_model_id || aiForm.fallback_model_id,
          thinking_level: res.thinking_level || aiForm.thinking_level,
          streaming_enabled: res.streaming_enabled ?? aiForm.streaming_enabled,
          max_tokens: res.max_tokens || aiForm.max_tokens,
          timeout_ms: res.timeout_ms || aiForm.timeout_ms,
        });
        onShowToast('Đã mở khóa cấu hình AI', 'Bạn có quyền quản trị trong phiên hiện tại.', 'success');
      } else {
        setVerifyError('Không đủ quyền quản trị để mở khóa.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Xác thực quản trị thất bại.');
    } finally {
      setVerifying(false);
    }
  };

  const handleLockAiConfig = () => {
    setAdminToken('');
    setAiUnlocked(false);
    setTokenInput('');
    setVerifyError(null);
    setUnlockOpen(false);
    onShowToast('Đã khóa cấu hình AI', 'Khu vực cài đặt AI đã được bảo vệ trở lại.');
  };

  const handleSaveAiConfig = async () => {
    if (!aiUnlocked || !adminToken) {
      onShowToast('Bị từ chối', 'Khu vực cấu hình AI đang được bảo vệ.', 'error');
      return;
    }
    setSavingAi(true);
    try {
      await osApi.messagesV3.updateAiConfig(aiForm, adminToken);
      await onRefreshData();
      onShowToast('Đã lưu cấu hình AI', 'Thông số mô hình trên máy chủ đã được cập nhật.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình AI';
      onShowToast('Lỗi lưu cấu hình AI', msg, 'error');
      if (msg.toLowerCase().includes('bảo vệ') || msg.includes('403')) {
        handleLockAiConfig();
      }
    } finally {
      setSavingAi(false);
    }
  };

  const saveAllSettings = async (patch?: Partial<DokiUserSettings>) => {
    setSaving(true);
    try {
      const next = { ...settings, ...(patch || {}) };
      setSettings(next);
      await osApi.messagesV3.updateDokiSettings(next);
      if (aiUnlocked && adminToken) {
        await osApi.messagesV3.updateAiConfig(aiForm, adminToken);
      }
      await onRefreshData();
      onShowToast(
        'Đã lưu cài đặt YumeChat',
        aiUnlocked ? 'Giao diện & cấu hình AI đã đồng bộ.' : 'Cấu hình cá nhân đã được lưu.',
        'success'
      );
    } catch (err) {
      onShowToast('Lỗi lưu cài đặt', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkHardwarePermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceCheckStatus('Trình duyệt không hỗ trợ kiểm tra Micro/Camera.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((t) => t.stop());
      setDeviceCheckStatus('Micro đã sẵn sàng cho Gọi thoại AI & Ghi âm.');
    } catch {
      setDeviceCheckStatus('Chưa cấp quyền Micro. Vui lòng cho phép trong cài đặt trình duyệt.');
    }
  };

  const handleClearCache = async (target: 'search_history' | 'inactive_memories' | 'proactive_logs') => {
    await osApi.messagesV3.clearData(target);
    await onRefreshData();
    onShowToast('Đã dọn dẹp dữ liệu', 'Bộ nhớ đệm đã được làm sạch.', 'success');
  };

  const selectCls =
    'w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 outline-none';

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <header className="px-3.5 py-2.5 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center hover:bg-violet-500/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-sm font-bold">Cài đặt YumeChat 3.0</h3>
            <p className="text-[11px] text-zinc-500">Giao diện, AI Server & Thông báo</p>
          </div>
        </div>
        <button
          disabled={saving}
          onClick={() => saveAllSettings()}
          className="min-h-[40px] px-3.5 rounded-xl bg-violet-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-4 text-xs">
        {/* Section A: Appearance */}
        <section className="doki-glass rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
            <Sliders className="w-4 h-4" />
            <span>Giao diện & Bong bóng chat</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Chế độ sáng/tối</label>
              <select
                value={settings.theme_mode || 'auto'}
                onChange={(e) => setSettings((p) => ({ ...p, theme_mode: e.target.value as 'auto' | 'light' | 'dark' }))}
                className={selectCls}
              >
                <option value="auto" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Theo Phone OS</option>
                <option value="light" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Luôn sáng (Pearl)</option>
                <option value="dark" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Luôn tối (Midnight)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Kiểu bong bóng</label>
              <select
                value={settings.bubble_style || 'glass'}
                onChange={(e) => setSettings((p) => ({ ...p, bubble_style: e.target.value as 'glass' | 'pastel' | 'minimal' }))}
                className={selectCls}
              >
                <option value="glass" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Liquid Glass</option>
                <option value="pastel" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Soft Pastel</option>
                <option value="minimal" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Tối giản</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Hình nền mặc định YumeChat</label>
            <select
              value={settings.wallpaper || ''}
              onChange={(e) => setSettings((p) => ({ ...p, wallpaper: e.target.value }))}
              className={selectCls}
            >
              {CHAT_WALLPAPERS.map((w) => (
                <option key={w.id} value={w.value} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Section B: Server AI Configuration (Admin-Locked & Strict Zero-Secret) */}
        <section className="doki-glass rounded-3xl p-4 space-y-3 border border-violet-200/60 dark:border-violet-800/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
              <Cpu className="w-4 h-4" />
              <span>Cấu hình mô hình AI (Server)</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 ${
                aiConfig?.apiKeyConfigured
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{aiConfig?.apiKeyConfigured ? 'AI Server đang hoạt động' : 'Chưa cấu hình API Server'}</span>
            </span>
          </div>

          {!aiUnlocked ? (
            <div className="rounded-2xl bg-zinc-100/90 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-600/15 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">Khu vực cấu hình AI được bảo vệ</p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Thông số hệ thống và khóa kết nối được kiểm soát phía máy chủ để đảm bảo an toàn. Chức năng trò chuyện và gọi AI vẫn hoạt động bình thường.
                  </p>
                </div>
              </div>

              {/* Safe Non-Secret Read-Only Summary */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="p-2 rounded-xl bg-white/80 dark:bg-zinc-950/60">
                  <span className="text-[10px] text-zinc-500 block">Mô hình đang chạy</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                    {aiForm.model_id}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white/80 dark:bg-zinc-950/60">
                  <span className="text-[10px] text-zinc-500 block">Suy luận · Luồng SSE</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                    {aiForm.thinking_level} · {aiForm.streaming_enabled !== 0 ? 'Bật' : 'Tắt'}
                  </span>
                </div>
              </div>

              {!unlockOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setUnlockOpen(true);
                    setVerifyError(null);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-violet-300/60 dark:border-violet-700/60 text-violet-700 dark:text-violet-300 font-semibold flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Mở khóa cấu hình quản trị</span>
                </button>
              ) : (
                <form onSubmit={handleVerifyAdmin} className="space-y-2 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 block">
                    Mã xác thực quản trị viên (AI_ADMIN_SECRET)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 flex items-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        autoComplete="off"
                        placeholder="Nhập mã quản trị từ server..."
                        className="flex-1 min-h-[40px] bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        title={showToken ? 'Ẩn mã' : 'Hiện mã'}
                      >
                        {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {verifyError && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{verifyError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUnlockOpen(false);
                        setTokenInput('');
                        setVerifyError(null);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={verifying}
                      className="min-h-[38px] px-3.5 rounded-xl bg-violet-600 text-white font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>{verifying ? 'Đang kiểm tra...' : 'Xác thực'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/50">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Đã mở khóa quyền quản trị AI (phiên hiện tại)</span>
                </span>
                <button
                  type="button"
                  onClick={handleLockAiConfig}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" />
                  <span>Khóa lại</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Model chính</label>
                  <select
                    value={aiForm.model_id}
                    onChange={(e) => setAiForm((p) => ({ ...p, model_id: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="gemini-4-hydrogen" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                      Gemini 4 Hydrogen (Cân bằng)
                    </option>
                    <option value="gemini-3.1-flash-lite" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                      Gemini 3.1 Flash Lite (Siêu nhanh)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Model dự phòng</label>
                  <select
                    value={aiForm.fallback_model_id}
                    onChange={(e) => setAiForm((p) => ({ ...p, fallback_model_id: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="gemini-3.1-flash-lite" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                      Gemini 3.1 Flash Lite
                    </option>
                    <option value="gemini-4-hydrogen" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                      Gemini 4 Hydrogen
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Chế độ suy luận</label>
                  <select
                    value={aiForm.thinking_level}
                    onChange={(e) => setAiForm((p) => ({ ...p, thinking_level: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="LOW" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">LOW (Phản hồi nhanh)</option>
                    <option value="MEDIUM" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">MEDIUM (Suy luận sâu)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Độ dài tối đa (tokens)</label>
                  <input
                    type="number"
                    min={256}
                    max={4096}
                    step={100}
                    value={aiForm.max_tokens}
                    onChange={(e) => setAiForm((p) => ({ ...p, max_tokens: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between pt-1">
                <span>Phản hồi luồng trực tiếp (SSE Streaming)</span>
                <input
                  type="checkbox"
                  checked={aiForm.streaming_enabled !== 0}
                  onChange={(e) => setAiForm((p) => ({ ...p, streaming_enabled: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 accent-violet-600"
                />
              </label>

              <button
                type="button"
                disabled={savingAi}
                onClick={handleSaveAiConfig}
                className="w-full min-h-[42px] py-2 rounded-xl bg-violet-600 text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{savingAi ? 'Đang cập nhật AI...' : 'Lưu cấu hình AI'}</span>
              </button>
            </div>
          )}
        </section>

        {/* Section C: Default AI Response Style & Voice */}
        <section className="doki-glass rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
            <Volume2 className="w-4 h-4" />
            <span>Mặc định hội thoại & Tương tác chủ động</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Độ dài trả lời mặc định</label>
              <select
                value={settings.default_response_length || 'medium'}
                onChange={(e) => setSettings((p) => ({ ...p, default_response_length: e.target.value as 'short' | 'medium' | 'long' }))}
                className={selectCls}
              >
                <option value="short" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Ngắn gọn</option>
                <option value="medium" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Vừa phải</option>
                <option value="long" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Dài, chi tiết</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Ngôn ngữ phản hồi</label>
              <select
                value={settings.default_language || 'vi'}
                onChange={(e) => setSettings((p) => ({ ...p, default_language: e.target.value }))}
                className={selectCls}
              >
                <option value="vi" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Tiếng Việt</option>
                <option value="en" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">English</option>
                <option value="ja" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">日本語 (Romaji/JP)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between pt-1">
            <span>Nhắn tin chủ động từ AI</span>
            <input
              type="checkbox"
              checked={settings.proactive_enabled !== 0}
              onChange={(e) => setSettings((p) => ({ ...p, proactive_enabled: e.target.checked ? 1 : 0 }))}
              className="w-4 h-4 accent-violet-600"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Giờ yên tĩnh từ</label>
              <input
                type="time"
                value={settings.quiet_start || '23:00'}
                onChange={(e) => setSettings((p) => ({ ...p, quiet_start: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Đến</label>
              <input
                type="time"
                value={settings.quiet_end || '07:00'}
                onChange={(e) => setSettings((p) => ({ ...p, quiet_end: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Section D: Permissions, Cache & Data */}
        <section className="doki-glass rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
            <ShieldCheck className="w-4 h-4" />
            <span>Thiết bị & Dữ liệu</span>
          </div>

          <button
            onClick={checkHardwarePermissions}
            className="w-full py-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/80 font-semibold flex items-center justify-center gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5 text-violet-500" />
            <span>Kiểm tra quyền Micro / Ghi âm</span>
          </button>
          {deviceCheckStatus && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{deviceCheckStatus}</p>}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleClearCache('search_history')}
              className="py-2 rounded-xl bg-white/70 dark:bg-zinc-900/70 font-medium flex items-center justify-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-500" />
              <span>Xóa lịch sử tìm</span>
            </button>
            <button
              onClick={() => handleClearCache('inactive_memories')}
              className="py-2 rounded-xl bg-white/70 dark:bg-zinc-900/70 font-medium flex items-center justify-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Dọn ký ức tắt</span>
            </button>
          </div>
          <a
            href="/api/messages-v3/profile-overview"
            download="yumechat_profile_stats.json"
            className="w-full py-2.5 rounded-xl bg-violet-600/12 text-violet-700 dark:text-violet-300 font-semibold flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải dữ liệu tổng quan tài khoản (JSON)</span>
          </a>
        </section>
      </div>
    </div>
  );
}
