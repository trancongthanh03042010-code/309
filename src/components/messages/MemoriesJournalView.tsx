import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  Brain,
  Check,
  Edit3,
  ExternalLink,
  FileText,
  Heart,
  Pin,
  Power,
  Trash2,
} from 'lucide-react';
import type {
  AiRelationshipRecord,
  Character,
  CharacterMemory,
  ChatMessage,
  ChatSummaryRecord,
  Conversation,
  RelationshipEventRecord,
} from '../../types/os';
import { formatRelativeTime, handleCharImgError, RELATIONSHIP_MILESTONES, safeJson } from './utils';
import { osApi } from '../../services/api';

type JournalSection = 'memories' | 'saved' | 'milestones' | 'summaries';
type MemoryStatusFilter = 'all' | 'pinned' | 'active' | 'inactive';

interface MemoriesJournalViewProps {
  characters: Character[];
  memories: CharacterMemory[];
  messages: ChatMessage[];
  conversations: Conversation[];
  relationships: AiRelationshipRecord[];
  relationshipEvents?: RelationshipEventRecord[];
  chatSummaries: ChatSummaryRecord[];
  onJumpToMessage: (convId: string, msgId: string) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function MemoriesJournalView({
  characters,
  memories,
  messages,
  conversations,
  relationships,
  relationshipEvents = [],
  chatSummaries,
  onJumpToMessage,
  onRefreshData,
  onShowToast,
}: MemoriesJournalViewProps) {
  const [section, setSection] = useState<JournalSection>('memories');
  const [charFilter, setCharFilter] = useState<string>('all');
  const [memFilter, setMemFilter] = useState<MemoryStatusFilter>('all');
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const charById = useMemo(() => {
    const map: Record<string, Character> = {};
    for (const c of characters) map[c.id] = c;
    return map;
  }, [characters]);

  const msgById = useMemo(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  const convById = useMemo(() => {
    const map: Record<string, Conversation> = {};
    for (const c of conversations) map[c.id] = c;
    return map;
  }, [conversations]);

  const filteredMemories = useMemo(
    () =>
      memories
        .filter((m) => (charFilter === 'all' ? true : m.character_id === charFilter))
        .filter((m) => {
          if (memFilter === 'pinned') return m.is_pinned === 1;
          if (memFilter === 'active') return m.is_active !== 0;
          if (memFilter === 'inactive') return m.is_active === 0;
          return true;
        })
        .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0)),
    [memories, charFilter, memFilter]
  );

  const savedMessages = useMemo(
    () =>
      messages
        .filter((m) => m.is_saved === 1 && !m.deleted_at)
        .filter((m) => {
          if (charFilter === 'all') return true;
          const conv = convById[m.conversation_id];
          return conv?.character_id === charFilter || m.sender_id === charFilter;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages, charFilter, convById]
  );

  const filteredRelationships = useMemo(
    () =>
      relationships.filter((r) => (charFilter === 'all' ? true : r.character_id === charFilter)),
    [relationships, charFilter]
  );

  const filteredSummaries = useMemo(
    () =>
      chatSummaries.filter((s) => {
        if (charFilter === 'all') return true;
        return convById[s.conversation_id]?.character_id === charFilter;
      }),
    [chatSummaries, charFilter, convById]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <div className="px-3.5 pt-2.5 pb-2.5 space-y-2 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Kỷ niệm & Nhật ký</h3>
            <p className="text-[11px] text-zinc-500">Ký ức tách biệt từng nhân vật, tin đã lưu & cột mốc</p>
          </div>
          <select
            value={charFilter}
            onChange={(e) => setCharFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-[11px] font-medium outline-none max-w-[140px]"
          >
            <option value="all" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Tất cả nhân vật</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {(
            [
              ['memories', `Ký ức AI (${filteredMemories.length})`],
              ['saved', `Tin đã lưu (${savedMessages.length})`],
              ['milestones', 'Dấu mốc'],
              ['summaries', `Tóm tắt (${filteredSummaries.length})`],
            ] as Array<[JournalSection, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 ${
                section === k
                  ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === 'memories' && (
          <div className="flex items-center gap-1 overflow-x-auto os-scroll-hidden pt-0.5">
            {(
              [
                ['all', 'Tất cả'],
                ['pinned', 'Đã ghim'],
                ['active', 'Đang kích hoạt'],
                ['inactive', 'Đã tắt'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMemFilter(k)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 ${
                  memFilter === k
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2.5">
        {section === 'memories' &&
          (filteredMemories.length === 0 ? (
            <div className="py-14 text-center space-y-2 text-xs text-zinc-500">
              <Brain className="w-8 h-8 mx-auto opacity-45" />
              <p>Chưa có ký ức AI nào khớp bộ lọc.</p>
              <p>Nhấn giữ tin nhắn trong lúc chat và chọn “Ghi nhớ”.</p>
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const ch = charById[mem.character_id];
              const sourceMsg = mem.source_message_id ? msgById[mem.source_message_id] : undefined;
              const isActive = mem.is_active !== 0;
              const isPinned = mem.is_pinned === 1;

              return (
                <div
                  key={mem.id}
                  className={`p-3 rounded-2xl doki-glass space-y-2 ${
                    isPinned ? 'ring-1 ring-violet-400/60' : ''
                  } ${!isActive ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      {ch && (
                        <img
                          src={ch.avatar}
                          alt={ch.name}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, ch.name)}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      )}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {ch?.name || 'Nhân vật AI'} · {mem.source_kind === 'user_requested' ? 'Bạn đánh dấu' : mem.source_kind === 'manual' ? 'Tự thêm' : 'AI suy luận'}
                      </span>
                    </div>
                    <span className="font-mono-num text-zinc-400 shrink-0">
                      {formatRelativeTime(mem.updated_at || mem.created_at)}
                    </span>
                  </div>

                  {editingMemId === mem.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs outline-none"
                      />
                      <button
                        onClick={async () => {
                          await osApi.messagesV3.updateMemoryV3(mem.id, { content: editText });
                          setEditingMemId(null);
                          await onRefreshData();
                          onShowToast('Đã cập nhật ký ức', 'Thay đổi sẽ áp dụng cho lượt chat tiếp theo.', 'success');
                        }}
                        className="p-2 rounded-xl bg-violet-600 text-white"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                      {isPinned && <Pin className="w-3 h-3 inline mr-1 text-violet-600" />}
                      {mem.content}
                    </p>
                  )}

                  {mem.emotional_context && (
                    <p className="text-[10px] text-pink-600 dark:text-pink-300">
                      Bối cảnh cảm xúc: {mem.emotional_context}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                    <span className="text-zinc-400">
                      {isActive ? 'Đang dùng' : 'Đã tạm tắt'} · Ưu tiên {mem.importance}/10
                    </span>
                    <div className="flex items-center gap-1">
                      {sourceMsg && (
                        <button
                          onClick={() => onJumpToMessage(sourceMsg.conversation_id, sourceMsg.id)}
                          className="px-2 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Tin gốc</span>
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          await osApi.messagesV3.updateMemoryV3(mem.id, { is_pinned: isPinned ? 0 : 1 });
                          await onRefreshData();
                        }}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
                        title={isPinned ? 'Bỏ ghim' : 'Ghim ký ức'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'text-violet-600 fill-current' : 'text-zinc-400'}`} />
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.messagesV3.updateMemoryV3(mem.id, { is_active: isActive ? 0 : 1 });
                          await onRefreshData();
                        }}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
                        title={isActive ? 'Tạm tắt ký ức này' : 'Kích hoạt lại ký ức'}
                      >
                        <Power className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-500' : 'text-zinc-400'}`} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMemId(mem.id);
                          setEditText(mem.content);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
                        title="Sửa"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.deleteCharacterMemory(mem.id);
                          await onRefreshData();
                          onShowToast('Đã xóa ký ức', 'AI sẽ không sử dụng thông tin này nữa.');
                        }}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-500"
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ))}

        {section === 'saved' &&
          (savedMessages.length === 0 ? (
            <div className="py-14 text-center space-y-2 text-xs text-zinc-500">
              <Bookmark className="w-8 h-8 mx-auto opacity-45" />
              <p>Chưa có tin nhắn kỷ niệm nào được lưu.</p>
            </div>
          ) : (
            savedMessages.map((m) => (
              <div key={m.id} className="p-3 rounded-2xl doki-glass space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="font-semibold text-violet-600 dark:text-violet-400">
                    {convById[m.conversation_id]?.title || 'Hội thoại'} · {m.sender_name}
                  </span>
                  <span className="font-mono-num">{formatRelativeTime(m.created_at)}</span>
                </div>
                <p className="text-xs text-zinc-800 dark:text-zinc-200">{m.content}</p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={async () => {
                      await osApi.messagesV3.toggleSaveMessage(m.id, false);
                      await onRefreshData();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500"
                  >
                    Bỏ lưu
                  </button>
                  <button
                    onClick={() => onJumpToMessage(m.conversation_id, m.id)}
                    className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-semibold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Đi tới tin nhắn</span>
                  </button>
                </div>
              </div>
            ))
          ))}

        {section === 'milestones' && (
          <div className="space-y-3">
            {filteredRelationships.map((rel) => {
              const ch = charById[rel.character_id];
              const history = safeJson<Array<{ time: string; delta: string; reason: string }>>(rel.history_json, []);
              const charEvs = relationshipEvents.filter((e) => e.character_id === rel.character_id);
              const level = ch?.relationship_level || 1;

              return (
                <div key={rel.character_id} className="p-3.5 rounded-2xl doki-glass space-y-2.5">
                  <div className="flex items-center gap-3">
                    {ch && (
                      <img
                        src={ch.avatar}
                        alt={ch.name}
                        loading="lazy"
                        onError={(e) => handleCharImgError(e, ch.name)}
                        className="w-11 h-11 rounded-2xl object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {ch?.name || rel.character_id}
                        </h4>
                        <span className="text-xs font-semibold text-rose-500 flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 fill-current" />
                          <span>{rel.stage}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Tình cảm {rel.affection}% · Tin tưởng {rel.trust}% · Thân quen {rel.familiarity}% · Tôn trọng {rel.respect ?? 65}%
                      </p>
                    </div>
                  </div>

                  {/* Level Milestones Track */}
                  <div className="grid grid-cols-5 gap-1 pt-1">
                    {RELATIONSHIP_MILESTONES.map((ms) => {
                      const unlocked = level >= ms.level;
                      return (
                        <div
                          key={ms.level}
                          className={`p-1.5 rounded-xl text-center text-[9px] border ${
                            unlocked
                              ? 'border-pink-400/50 bg-pink-500/10 text-pink-700 dark:text-pink-300 font-semibold'
                              : 'border-zinc-200/40 dark:border-zinc-800/50 text-zinc-400'
                          }`}
                          title={ms.reward}
                        >
                          Lv.{ms.level}
                        </div>
                      );
                    })}
                  </div>

                  {charEvs.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                      {charEvs.slice(0, 4).map((ev) => (
                        <div key={ev.id} className="flex items-start justify-between gap-2 text-zinc-600 dark:text-zinc-300">
                          <span>{ev.description}</span>
                          <span className="text-violet-500 shrink-0 font-mono-num">
                            {formatRelativeTime(ev.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {history.length > 0 && charEvs.length === 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                      {history.slice(0, 4).map((h, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 text-zinc-600 dark:text-zinc-300">
                          <span>{h.reason}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 shrink-0 font-mono-num">
                            {h.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {section === 'summaries' &&
          (filteredSummaries.length === 0 ? (
            <div className="py-14 text-center space-y-2 text-xs text-zinc-500">
              <FileText className="w-8 h-8 mx-auto opacity-45" />
              <p>Chưa có bản tóm tắt hội thoại nào.</p>
            </div>
          ) : (
            filteredSummaries.map((s) => (
              <div key={s.id} className="p-3 rounded-2xl doki-glass space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="font-semibold text-violet-600 dark:text-violet-400">
                    {convById[s.conversation_id]?.title || 'Hội thoại'} · Phiên bản v{s.version}
                  </span>
                  <span className="font-mono-num">{formatRelativeTime(s.created_at)}</span>
                </div>
                <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {s.summary}
                </p>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
