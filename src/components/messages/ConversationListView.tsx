import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BellOff,
  Check,
  Clock,
  Filter,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Character, ChatMessage, ChatSearchHistoryItem, Conversation } from '../../types/os';
import { formatRelativeTime, getMessagePreviewText, handleCharImgError, normalizeVi } from './utils';
import { osApi } from '../../services/api';

type ConvFilter = 'all' | 'unread' | 'pinned' | 'group' | 'favorite' | 'archived';

interface ConversationListViewProps {
  conversations: Conversation[];
  messages: ChatMessage[];
  characters: Character[];
  searchHistory: ChatSearchHistoryItem[];
  drafts: Record<string, string>;
  typingConvIds: Record<string, boolean>;
  onSelectConversation: (convId: string) => void;
  onJumpToMessage: (convId: string, msgId: string) => void;
  onCreateGroup: () => void;
  onOpenGroups?: () => void;
  onOpenMemories?: () => void;
  onOpenDiscover: () => void;
  onUpdateConversation: (convId: string, patch: Record<string, unknown>) => Promise<void>;
  onDeleteConversation: (conv: Conversation) => void;
  onRefreshData: () => Promise<void>;
}

export function ConversationListView({
  conversations,
  messages,
  characters,
  searchHistory,
  drafts,
  typingConvIds,
  onSelectConversation,
  onJumpToMessage,
  onCreateGroup,
  onOpenGroups,
  onOpenMemories,
  onOpenDiscover,
  onUpdateConversation,
  onDeleteConversation,
  onRefreshData,
}: ConversationListViewProps) {
  const [filter, setFilter] = useState<ConvFilter>('all');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [senderFilter, setSenderFilter] = useState('');
  const [msgTypeFilter, setMsgTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchingServer, setSearchingServer] = useState(false);
  const [serverResults, setServerResults] = useState<{
    messages: ChatMessage[];
    conversations: Conversation[];
    characters: Character[];
  } | null>(null);
  const [menuConvId, setMenuConvId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuConvId) return;
    const onDocClick = () => setMenuConvId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuConvId]);

  const lastMessageMap = useMemo(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of messages) {
      if (m.deleted_at) continue;
      const cur = map[m.conversation_id];
      if (!cur || m.created_at >= cur.created_at) {
        map[m.conversation_id] = m;
      }
    }
    return map;
  }, [messages]);

  const filteredConversations = useMemo(() => {
    const normQ = normalizeVi(query);
    return conversations
      .filter((c) => {
        if (filter === 'archived') {
          if (!c.archived) return false;
        } else if (c.archived) {
          return false;
        }
        if (filter === 'unread' && !(c.unread_count > 0)) return false;
        if (filter === 'pinned' && !c.pinned) return false;
        if (filter === 'group' && !c.is_group) return false;
        if (filter === 'favorite') {
          const ch = characters.find((x) => x.id === c.character_id);
          if (!ch?.is_favorite) return false;
        }
        if (normQ) {
          const last = lastMessageMap[c.id];
          return (
            normalizeVi(c.title).includes(normQ) ||
            (last && normalizeVi(last.content).includes(normQ))
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
  }, [conversations, filter, query, characters, lastMessageMap]);

  const runDeepSearch = async (term?: string) => {
    const qVal = (term ?? query).trim();
    if (!qVal && !senderFilter && !msgTypeFilter && !dateFrom && !dateTo) {
      setServerResults(null);
      return;
    }
    setSearchingServer(true);
    try {
      const res = await osApi.messagesV3.searchMessages({
        q: qVal,
        senderType: senderFilter,
        msgType: msgTypeFilter,
        dateFrom,
        dateTo,
      });
      setServerResults(res);
      if (qVal) {
        await osApi.messagesV3.addSearchHistory(qVal, 'all').catch(() => {});
        onRefreshData().catch(() => {});
      }
    } finally {
      setSearchingServer(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setServerResults(null);
    setSenderFilter('');
    setMsgTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const convTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of conversations) map[c.id] = c.title;
    return map;
  }, [conversations]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      {/* Search Bar & Quick Actions */}
      <div className="px-3.5 pt-2.5 pb-2 space-y-2 doki-glass border-b border-violet-200/40 dark:border-violet-900/30">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800/90 border border-transparent focus-within:border-violet-400">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              value={query}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) setServerResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runDeepSearch();
              }}
              placeholder="Tìm cuộc trò chuyện, nội dung tin nhắn..."
              className="flex-1 bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
            {(query || serverResults) && (
              <button
                onClick={clearSearch}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              showAdvancedFilters
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
            title="Bộ lọc tìm kiếm nâng cao"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={onCreateGroup}
            className="w-10 h-10 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shrink-0"
            title="Tạo nhóm AI mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Advanced Cross-Chat Filters */}
        {showAdvancedFilters && (
          <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={senderFilter}
                onChange={(e) => setSenderFilter(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none"
              >
                <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tất cả người gửi</option>
                <option value="user" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chỉ mình tôi</option>
                <option value="character" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chỉ nhân vật AI</option>
              </select>
              <select
                value={msgTypeFilter}
                onChange={(e) => setMsgTypeFilter(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none"
              >
                <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Mọi loại tin nhắn</option>
                <option value="text" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Văn bản</option>
                <option value="image" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Hình ảnh</option>
                <option value="voice" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tin nhắn thoại</option>
                <option value="sticker" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Sticker</option>
                <option value="file" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tệp đính kèm</option>
                <option value="location" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Vị trí</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={clearSearch}
                className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-700 font-medium"
              >
                Đặt lại
              </button>
              <button
                onClick={() => runDeepSearch()}
                className="px-3 py-1.5 rounded-xl bg-violet-600 text-white font-semibold"
              >
                {searchingServer ? 'Đang tìm...' : 'Tìm toàn bộ tin nhắn'}
              </button>
            </div>
          </div>
        )}

        {/* Recent Search History */}
        {searchFocused && !query && searchHistory.length > 0 && !serverResults && (
          <div className="pt-1 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Tìm kiếm gần đây</span>
              <button
                onClick={async () => {
                  await osApi.messagesV3.deleteSearchHistory('all');
                  onRefreshData();
                }}
                className="text-rose-500 hover:underline"
              >
                Xóa lịch sử
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {searchHistory.slice(0, 8).map((sh) => (
                <button
                  key={sh.id}
                  onClick={() => {
                    setQuery(sh.query);
                    runDeepSearch(sh.query);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300"
                >
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>{sh.query}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Segment Filter Tabs */}
        {!serverResults && (
          <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pt-0.5">
            {(
              [
                ['all', 'Tất cả'],
                ['unread', 'Chưa đọc'],
                ['pinned', 'Đã ghim'],
                ['group', 'Nhóm'],
                ['favorite', 'Yêu thích'],
                ['archived', 'Lưu trữ'],
              ] as Array<[ConvFilter, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-colors ${
                  filter === k
                    ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm'
                    : 'bg-zinc-100/90 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
            {onOpenGroups && (
              <button
                onClick={onOpenGroups}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 bg-violet-100/80 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 flex items-center gap-1"
              >
                <Users className="w-3 h-3" />
                <span>Phòng nhóm</span>
              </button>
            )}
            {onOpenMemories && (
              <button
                onClick={onOpenMemories}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 bg-pink-100/80 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Kỷ niệm</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Results Mode */}
      {serverResults ? (
        <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-500">
              Kết quả tìm kiếm ({serverResults.messages.length} tin nhắn)
            </p>
            <button
              onClick={() => setServerResults(null)}
              className="text-xs text-violet-600 font-semibold"
            >
              Đóng kết quả
            </button>
          </div>
          {serverResults.messages.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Không tìm thấy tin nhắn nào khớp bộ lọc của bạn.
            </div>
          ) : (
            <div className="space-y-2">
              {serverResults.messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onJumpToMessage(m.conversation_id, m.id)}
                  className="w-full text-left p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 hover:border-violet-400 transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
                    <span className="font-semibold text-violet-600 dark:text-violet-400 truncate">
                      {convTitleById[m.conversation_id] || 'Hội thoại'} · {m.sender_name}
                    </span>
                    <span className="font-mono-num shrink-0">{formatRelativeTime(m.created_at)}</span>
                  </div>
                  <p className="text-xs text-zinc-800 dark:text-zinc-200 line-clamp-2">
                    {getMessagePreviewText(m)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Conversation Rows */
        <div className="flex-1 overflow-y-auto os-scroll divide-y divide-zinc-200/50 dark:divide-zinc-800/70">
          {query.trim() && (
            <button
              onClick={() => runDeepSearch()}
              className="w-full px-4 py-2.5 bg-violet-50/80 dark:bg-violet-950/30 text-left text-xs text-violet-700 dark:text-violet-300 flex items-center justify-between"
            >
              <span>Tìm "{query.trim()}" trong toàn bộ lịch sử tin nhắn</span>
              <Search className="w-3.5 h-3.5" />
            </button>
          )}

          {filteredConversations.length === 0 ? (
            <div className="px-6 py-16 text-center space-y-3">
              <Sparkles className="w-9 h-9 mx-auto text-violet-400 opacity-75" />
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {filter === 'archived'
                  ? 'Chưa có cuộc trò chuyện nào được lưu trữ'
                  : 'Chưa có cuộc trò chuyện nào khớp bộ lọc'}
              </p>
              <p className="text-xs text-zinc-500">
                Khám phá các nhân vật AI mới hoặc tạo nhóm trò chuyện nhiều nhân vật.
              </p>
              <button
                onClick={onOpenDiscover}
                className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
              >
                Khám phá nhân vật AI
              </button>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const lastMsg = lastMessageMap[c.id];
              const draft = drafts[c.id];
              const isTyping = Boolean(typingConvIds[c.id]);
              const char = characters.find((ch) => ch.id === c.character_id);
              const isMenuOpen = menuConvId === c.id;

              return (
                <div
                  key={c.id}
                  className="relative flex items-center gap-3 px-3.5 py-3 bg-white/75 dark:bg-zinc-900/65 hover:bg-violet-50/60 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <button
                    onClick={() => onSelectConversation(c.id)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left"
                  >
                    <div className="relative shrink-0">
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt={c.title}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, c.title)}
                          className="w-12 h-12 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 flex items-center justify-center">
                          <Users className="w-5 h-5" />
                        </div>
                      )}
                      {c.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center shadow">
                          {c.unread_count > 99 ? '99+' : c.unread_count}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {c.title}
                          </span>
                          {c.pinned === 1 && <Pin className="w-3 h-3 text-violet-500 shrink-0" />}
                          {c.muted === 1 && <BellOff className="w-3 h-3 text-zinc-400 shrink-0" />}
                        </div>
                        <span className="text-[11px] font-mono-num text-zinc-400 shrink-0">
                          {formatRelativeTime(lastMsg?.created_at || c.updated_at)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-xs truncate text-zinc-500 dark:text-zinc-400">
                          {isTyping ? (
                            <span className="text-violet-600 dark:text-violet-400 font-medium">
                              Đang nhập phản hồi...
                            </span>
                          ) : draft ? (
                            <span>
                              <span className="text-rose-500 font-semibold">Bản nháp: </span>
                              {draft}
                            </span>
                          ) : (
                            getMessagePreviewText(lastMsg)
                          )}
                        </p>
                        {char && (
                          <span className="text-[10px] text-zinc-400 shrink-0">
                            {char.mood?.split('·')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuConvId(isMenuOpen ? null : c.id);
                    }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                    title="Tùy chọn"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-4 top-12 z-30 w-48 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-xl py-1.5 text-xs"
                    >
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          onUpdateConversation(c.id, { pinned: c.pinned ? 0 : 1 });
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <Pin className="w-3.5 h-3.5" />
                        <span>{c.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          onUpdateConversation(c.id, { muted: c.muted ? 0 : 1 });
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <BellOff className="w-3.5 h-3.5" />
                        <span>{c.muted ? 'Bật thông báo' : 'Tắt thông báo'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          onUpdateConversation(c.id, { unread_count: c.unread_count > 0 ? 0 : 1 });
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{c.unread_count > 0 ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          onUpdateConversation(c.id, { archived: c.archived ? 0 : 1 });
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>{c.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          onDeleteConversation(c);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa cuộc trò chuyện</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
