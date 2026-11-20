import React, { useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Heart,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type {
  AiProviderConfig,
  Character,
  ChatMessage,
  Conversation,
  OSNotification,
  UserProfile,
} from '../../types/os';
import {
  DISCOVERY_TOPICS,
  formatRelativeTime,
  getEmotionStyle,
  getMessagePreviewText,
  handleCharImgError,
  safeJson,
} from './utils';
import { osApi } from '../../services/api';

interface DokiHomeViewProps {
  profile?: UserProfile;
  characters: Character[];
  conversations: Conversation[];
  messages: ChatMessage[];
  notifications: OSNotification[];
  aiProviderConfig?: AiProviderConfig | null;
  totalUnread: number;
  onStartChat: (char: Character) => void;
  onOpenConversation: (convId: string) => void;
  onOpenCharacterProfile: (char: Character) => void;
  onSelectTopic: (topicId: string) => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenUserProfile: () => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function DokiHomeView({
  profile,
  characters,
  conversations,
  messages,
  notifications,
  aiProviderConfig,
  totalUnread,
  onStartChat,
  onOpenConversation,
  onOpenCharacterProfile,
  onSelectTopic,
  onOpenSearch,
  onOpenNotifications,
  onOpenSettings,
  onOpenUserProfile,
  onRefreshData,
  onShowToast,
}: DokiHomeViewProps) {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [proactiveLoading, setProactiveLoading] = useState(false);

  const visibleChars = useMemo(
    () => characters.filter((c) => !c.is_hidden && !c.is_blocked),
    [characters]
  );

  const featuredChars = useMemo(() => {
    const f = visibleChars.filter((c) => c.is_featured === 1);
    return f.length > 0 ? f : visibleChars.slice(0, 4);
  }, [visibleChars]);

  const activeBanner = featuredChars[bannerIdx % Math.max(1, featuredChars.length)] || visibleChars[0];

  const recommendedChars = useMemo(
    () =>
      [...visibleChars].sort(
        (a, b) => (b.is_favorite || 0) - (a.is_favorite || 0) || (b.interactions_count || 0) - (a.interactions_count || 0)
      ),
    [visibleChars]
  );

  const lastMessageMap = useMemo(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of messages) {
      if (m.deleted_at) continue;
      const cur = map[m.conversation_id];
      if (!cur || m.created_at >= cur.created_at) map[m.conversation_id] = m;
    }
    return map;
  }, [messages]);

  const recentConversations = useMemo(
    () =>
      conversations
        .filter((c) => !c.archived)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        .slice(0, 5),
    [conversations]
  );

  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.is_read && n.app_id === 'messages').length,
    [notifications]
  );

  const handleToggleFavorite = async (e: React.MouseEvent, char: Character) => {
    e.stopPropagation();
    const next = char.is_favorite ? 0 : 1;
    await osApi.updateCharacter(char.id, { is_favorite: next });
    await onRefreshData();
    onShowToast(char.name, next ? 'Đã thêm vào Yêu thích' : 'Đã bỏ Yêu thích', 'success');
  };

  const handleCheckProactive = async () => {
    setProactiveLoading(true);
    try {
      const res = await osApi.messagesV3.triggerProactive({ force: false });
      if (res.skipped) {
        onShowToast('Chưa có tin nhắn chủ động mới', res.reason || 'Nhân vật đang nghỉ ngơi');
      } else {
        await onRefreshData();
        onShowToast(
          res.character?.name || 'YumeChat',
          'Vừa gửi cho bạn một tin nhắn chủ động!',
          'success'
        );
      }
    } catch (err) {
      onShowToast('Lỗi kiểm tra tin chủ động', err instanceof Error ? err.message : 'Lỗi AI', 'error');
    } finally {
      setProactiveLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      {/* 1. Premium Glass Header */}
      <header className="px-4 pt-3 pb-3 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onOpenUserProfile}
              className="relative shrink-0 rounded-2xl overflow-hidden ring-2 ring-violet-400/50"
              title="Hồ sơ của bạn"
            >
              <img
                src={profile?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                alt={profile?.name || 'User'}
                loading="lazy"
                onError={(e) => handleCharImgError(e, profile?.name || 'U')}
                className="w-10 h-10 object-cover"
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-sm font-extrabold bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent">
                  YumeChat
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300">
                  {aiProviderConfig?.apiKeyConfigured ? 'AI Sẵn sàng' : 'Chưa có AI Key'}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                {getTimeGreeting()}, <strong className="font-semibold">{profile?.name || 'Bạn'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenNotifications}
              className="relative min-h-[44px] min-w-[44px] rounded-2xl bg-white/75 dark:bg-zinc-900/75 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-950/40"
              title="Trung tâm thông báo YumeChat"
            >
              <Bell className="w-4 h-4" />
              {(unreadNotifsCount > 0 || totalUnread > 0) && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadNotifsCount + totalUnread > 99 ? '99+' : unreadNotifsCount + totalUnread}
                </span>
              )}
            </button>
            <button
              onClick={onOpenSettings}
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/75 dark:bg-zinc-900/75 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-950/40"
              title="Cài đặt YumeChat & AI"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Search Launcher + Proactive Check */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSearch}
            className="flex-1 min-h-[44px] px-3.5 rounded-2xl bg-white/80 dark:bg-zinc-900/70 border border-violet-200/50 dark:border-violet-800/40 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 text-left"
          >
            <Search className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="truncate">Tìm nhân vật AI, thể loại, hoặc tin nhắn...</span>
          </button>
          <button
            disabled={proactiveLoading}
            onClick={handleCheckProactive}
            className="min-h-[44px] px-3 rounded-2xl bg-violet-600/12 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[11px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-50"
            title="Kiểm tra tin nhắn chủ động từ nhân vật"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{proactiveLoading ? 'Đang gọi...' : 'Gọi AI'}</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Home Content */}
      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-5">
        {/* 2. Featured Character Spotlight Banner */}
        {activeBanner && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                Nhân vật nổi bật
              </h3>
              {featuredChars.length > 1 && (
                <div className="flex items-center gap-1">
                  {featuredChars.map((fc, i) => (
                    <button
                      key={fc.id}
                      onClick={() => setBannerIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === bannerIdx % featuredChars.length
                          ? 'w-5 bg-violet-600'
                          : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      aria-label={`Xem ${fc.name}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="relative rounded-3xl overflow-hidden shadow-lg bg-zinc-900 text-white">
              <img
                src={activeBanner.cover_image || activeBanner.avatar}
                alt={activeBanner.name}
                loading="lazy"
                onError={(e) => handleCharImgError(e, activeBanner.name)}
                className="w-full h-48 object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#110d1f] via-[#110d1f]/45 to-transparent p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-black/45 backdrop-blur-md text-[10px] font-semibold text-pink-200 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-400" />
                    <span>Trực tuyến · {activeBanner.interactions_count} lượt trò chuyện</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white/15 backdrop-blur-md text-[10px] font-medium">
                    {activeBanner.mood?.split('·')[0] || 'Vui vẻ'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <img
                      src={activeBanner.avatar}
                      alt={activeBanner.name}
                      loading="lazy"
                      onError={(e) => handleCharImgError(e, activeBanner.name)}
                      className="w-12 h-12 rounded-2xl object-cover ring-2 ring-white/70 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-bold truncate">{activeBanner.name}</h2>
                      <p className="text-xs text-zinc-200 line-clamp-1">{activeBanner.tagline}</p>
                      <p className="text-[11px] text-violet-200/90 line-clamp-1">{activeBanner.personality}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => onStartChat(activeBanner)}
                      className="min-h-[44px] py-2 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Bắt đầu trò chuyện</span>
                    </button>
                    <button
                      onClick={() => onOpenCharacterProfile(activeBanner)}
                      className="min-h-[44px] py-2 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white text-xs font-semibold"
                    >
                      Xem hồ sơ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. Recommended Horizontal Carousel ("Nhân vật dành cho bạn") */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Nhân vật dành cho bạn</h3>
            <button
              onClick={() => onSelectTopic('')}
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-0.5"
            >
              <span>Xem tất cả</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-2.5 overflow-x-auto os-scroll-hidden pb-1">
            {recommendedChars.map((c) => {
              const genres = safeJson<string[]>(c.genres_json, []);
              const emo = getEmotionStyle(c.mood);
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenCharacterProfile(c)}
                  className="w-48 shrink-0 doki-glass rounded-3xl p-3 flex flex-col justify-between gap-2.5 cursor-pointer hover:border-violet-400/60 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <img
                        src={c.avatar}
                        alt={c.name}
                        loading="lazy"
                        onError={(e) => handleCharImgError(e, c.name)}
                        className="w-12 h-12 rounded-2xl object-cover"
                      />
                      <button
                        onClick={(e) => handleToggleFavorite(e, c)}
                        className={`p-1.5 rounded-xl ${c.is_favorite ? 'text-pink-500' : 'text-zinc-400'}`}
                        title="Yêu thích"
                      >
                        <Heart className={`w-4 h-4 ${c.is_favorite ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{c.name}</h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        {c.tagline}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${emo.bg} ${emo.color}`}>
                        {c.mood?.split('·')[0] || 'Bình tĩnh'}
                      </span>
                      {genres[0] && (
                        <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-300">
                          {genres[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-zinc-200/50 dark:border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-mono-num">{c.interactions_count} lượt</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartChat(c);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-semibold"
                    >
                      Chat ngay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. Tiếp tục trò chuyện */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Tiếp tục trò chuyện</h3>
            <span className="text-[11px] text-zinc-500">{recentConversations.length} cuộc hội thoại</span>
          </div>
          {recentConversations.length === 0 ? (
            <div className="doki-glass rounded-3xl p-4 text-center text-xs text-zinc-500">
              Bạn chưa có đoạn chat nào. Chọn một nhân vật phía trên để bắt đầu!
            </div>
          ) : (
            <div className="space-y-2">
              {recentConversations.map((conv) => {
                const last = lastMessageMap[conv.id];
                const ch = characters.find((c) => c.id === conv.character_id);
                return (
                  <div
                    key={conv.id}
                    onClick={() => onOpenConversation(conv.id)}
                    className="doki-glass rounded-3xl p-3 flex items-center gap-3 cursor-pointer hover:border-violet-400/50 transition-colors"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={conv.avatar || ch?.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
                        alt={conv.title}
                        loading="lazy"
                        onError={(e) => handleCharImgError(e, conv.title)}
                        className="w-12 h-12 rounded-2xl object-cover"
                      />
                      {conv.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unread_count > 99 ? '99+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{conv.title}</h4>
                        <span className="text-[10px] font-mono-num text-zinc-400 shrink-0">
                          {formatRelativeTime(last?.created_at || conv.updated_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {getMessagePreviewText(last)}
                      </p>
                      <p className="text-[10px] text-violet-600 dark:text-violet-300 mt-0.5 truncate">
                        {ch ? ch.mood?.split('·')[0] : 'Nhóm AI'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenConversation(conv.id);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-violet-600/12 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[11px] font-semibold shrink-0"
                    >
                      Tiếp tục
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 5. 14 Chủ đề khám phá */}
        <section className="space-y-2.5 pb-2">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Chủ đề khám phá (14)</h3>
            <span className="text-[11px] text-zinc-500">Chạm để lọc nhân vật</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DISCOVERY_TOPICS.map((topic) => (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic.id)}
                className={`min-h-[56px] p-3 rounded-2xl bg-gradient-to-br ${topic.gradient} border border-violet-200/40 dark:border-violet-900/30 text-left hover:scale-[1.01] transition-transform`}
              >
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{topic.label}</p>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-300 truncate mt-0.5">{topic.subtitle}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
