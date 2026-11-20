import React, { useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, Plus, Settings2, UserMinus, UserPlus, Users, Volume2, VolumeX, X } from 'lucide-react';
import type { Character, ChatMessage, Conversation, ConversationMember } from '../../types/os';
import { formatRelativeTime, getMessagePreviewText, handleCharImgError, safeJson } from './utils';
import { osApi } from '../../services/api';

interface GroupsTabViewProps {
  conversations: Conversation[];
  messages: ChatMessage[];
  characters: Character[];
  conversationMembers: ConversationMember[];
  createModalOpen: boolean;
  onSetCreateModalOpen: (open: boolean) => void;
  onOpenConversation: (convId: string) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRegisterOverlayBack?: (closer: (() => boolean) | null) => void;
}

export function GroupsTabView({
  conversations,
  messages,
  characters,
  conversationMembers,
  createModalOpen,
  onSetCreateModalOpen,
  onOpenConversation,
  onRefreshData,
  onShowToast,
  onRegisterOverlayBack,
}: GroupsTabViewProps) {
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useState<'mention_only' | 'turn_based' | 'open_discussion'>('turn_based');
  const [maxTurns, setMaxTurns] = useState(2);
  const [creating, setCreating] = useState(false);

  const [manageConv, setManageConv] = useState<Conversation | null>(null);
  const [addMemberId, setAddMemberId] = useState('');

  useEffect(() => {
    if (!onRegisterOverlayBack) return;
    onRegisterOverlayBack(() => {
      if (manageConv) {
        setManageConv(null);
        return true;
      }
      if (createModalOpen) {
        onSetCreateModalOpen(false);
        return true;
      }
      return false;
    });
    return () => onRegisterOverlayBack(null);
  }, [manageConv, createModalOpen, onSetCreateModalOpen, onRegisterOverlayBack]);

  const groupConvs = useMemo(
    () =>
      conversations
        .filter((c) => c.is_group === 1 && !c.archived)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    [conversations]
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

  const handleCreateGroup = async () => {
    if (!groupTitle.trim()) {
      onShowToast('Thiếu tên nhóm', 'Hãy nhập tên cho nhóm trò chuyện.', 'error');
      return;
    }
    if (selectedIds.length < 1) {
      onShowToast('Chưa chọn nhân vật', 'Hãy chọn ít nhất 1 nhân vật AI vào nhóm.', 'error');
      return;
    }
    setCreating(true);
    try {
      const firstChar = characters.find((c) => c.id === selectedIds[0]);
      const created = (await osApi.createConversation({
        title: groupTitle.trim(),
        is_group: 1,
        avatar: firstChar?.avatar || '',
        members: selectedIds,
        group_mode: groupMode,
        max_ai_turns: maxTurns,
      })) as Conversation;
      await onRefreshData();
      setGroupTitle('');
      setSelectedIds([]);
      onSetCreateModalOpen(false);
      onShowToast('Đã tạo nhóm mới', created.title, 'success');
      onOpenConversation(created.id);
    } finally {
      setCreating(false);
    }
  };

  const getGroupMemberRows = (conv: Conversation) => {
    const rows = conversationMembers.filter((m) => m.conversation_id === conv.id && m.member_type === 'character' && m.is_active);
    if (rows.length > 0) return rows;
    return safeJson<string[]>(conv.members_json, []).map((id) => ({
      id: `cm_${conv.id}_${id}`,
      conversation_id: conv.id,
      member_type: 'character' as const,
      member_id: id,
      role: 'member' as const,
      joined_at: conv.updated_at,
      muted: 0,
      is_active: 1,
    }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <div className="px-3.5 py-2.5 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Nhóm trò chuyện AI</h3>
          <p className="text-[11px] text-zinc-500">Nhiều nhân vật AI tương tác cùng bạn</p>
        </div>
        <button
          onClick={() => onSetCreateModalOpen(true)}
          className="px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tạo nhóm</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2.5">
        {groupConvs.length === 0 ? (
          <div className="py-14 text-center space-y-3">
            <Users className="w-9 h-9 mx-auto text-violet-400 opacity-75" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Chưa có nhóm AI nào</p>
            <p className="text-xs text-zinc-500">
              Tạo phòng chat chung để Yuki, Akira, Sakura... cùng trò chuyện và tranh luận tự nhiên.
            </p>
            <button
              onClick={() => onSetCreateModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
            >
              Tạo nhóm đầu tiên
            </button>
          </div>
        ) : (
          groupConvs.map((g) => {
            const members = getGroupMemberRows(g);
            const memberChars = members
              .map((m) => ({ row: m, char: characters.find((c) => c.id === m.member_id) }))
              .filter((x) => Boolean(x.char));
            const last = lastMessageMap[g.id];
            const modeLabel =
              g.group_mode === 'mention_only'
                ? 'Chỉ @gọi tên'
                : g.group_mode === 'open_discussion'
                  ? 'Thảo luận mở'
                  : 'Luân phiên';

            return (
              <div
                key={g.id}
                className="p-3 rounded-2xl doki-glass space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenConversation(g.id)}
                    className="flex items-center gap-3 min-w-0 text-left flex-1"
                  >
                    <div className="flex -space-x-2 shrink-0">
                      {memberChars.slice(0, 3).map(({ char }) => (
                        <img
                          key={char!.id}
                          src={char!.avatar}
                          alt={char!.name}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, char!.name)}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900"
                        />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {g.title}
                      </h4>
                      <p className="text-[11px] text-zinc-500">
                        {memberChars.length + 1} thành viên · Chế độ: {modeLabel}
                      </p>
                    </div>
                  </button>
                  <span className="text-[11px] font-mono-num text-zinc-400 shrink-0">
                    {formatRelativeTime(last?.created_at || g.updated_at)}
                  </span>
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-1">
                  {getMessagePreviewText(last)}
                </p>

                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => setManageConv(g)}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Thành viên & Lượt AI</span>
                  </button>
                  <button
                    onClick={() => onOpenConversation(g.id)}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-semibold flex items-center gap-1"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Vào nhóm</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Group Modal */}
      {createModalOpen && (
        <div
          onClick={() => onSetCreateModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[88vh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h4 className="text-sm font-bold">Tạo nhóm nhiều nhân vật AI</h4>
              <button onClick={() => onSetCreateModalOpen(false)} className="p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Tên nhóm *</label>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Ví dụ: Quán Cà Phê Cuối Tuần"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Chế độ lượt nói AI</label>
                  <select
                    value={groupMode}
                    onChange={(e) => setGroupMode(e.target.value as 'mention_only' | 'turn_based' | 'open_discussion')}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="turn_based" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Luân phiên tự nhiên</option>
                    <option value="open_discussion" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Thảo luận mở sôi nổi</option>
                    <option value="mention_only" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chỉ khi @nhắc tên</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Số AI tối đa/lượt</label>
                  <select
                    value={maxTurns}
                    onChange={(e) => setMaxTurns(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value={1} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">1 nhân vật</option>
                    <option value={2} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">2 nhân vật</option>
                    <option value={3} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">3 nhân vật</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1.5">
                  Chọn thành viên AI ({selectedIds.length} đã chọn)
                </label>
                <div className="space-y-1.5">
                  {characters
                    .filter((c) => !c.is_blocked)
                    .map((c) => {
                      const picked = selectedIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() =>
                            setSelectedIds((prev) =>
                              picked ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                            )
                          }
                          className={`w-full p-2.5 rounded-2xl border flex items-center gap-2.5 text-left ${
                            picked
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                              : 'border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          <img
                            src={c.avatar}
                            alt={c.name}
                            loading="lazy"
                            onError={(e) => handleCharImgError(e, c.name)}
                            className="w-9 h-9 rounded-xl object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{c.name}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{c.tagline}</p>
                          </div>
                          {picked && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => onSetCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                disabled={creating}
                onClick={handleCreateGroup}
                className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
              >
                {creating ? 'Đang tạo...' : 'Tạo nhóm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Group Members & Turn Mode Modal */}
      {manageConv && (
        <div
          onClick={() => setManageConv(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h4 className="text-sm font-bold truncate">Quản lý nhóm: {manageConv.title}</h4>
              <button onClick={() => setManageConv(null)} className="p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Chế độ phản hồi AI</label>
                  <select
                    value={manageConv.group_mode || 'turn_based'}
                    onChange={async (e) => {
                      const updated = await osApi.messagesV3.updateConversationConfig(manageConv.id, {
                        group_mode: e.target.value,
                      });
                      setManageConv(updated);
                      await onRefreshData();
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="turn_based" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Luân phiên tự nhiên</option>
                    <option value="open_discussion" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Thảo luận mở</option>
                    <option value="mention_only" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chỉ trả lời khi @nhắc</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1">Số AI/lượt tối đa</label>
                  <select
                    value={manageConv.max_ai_turns || 2}
                    onChange={async (e) => {
                      const updated = await osApi.messagesV3.updateConversationConfig(manageConv.id, {
                        max_ai_turns: Number(e.target.value),
                      });
                      setManageConv(updated);
                      await onRefreshData();
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value={1} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">1 AI</option>
                    <option value={2} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">2 AI</option>
                    <option value={3} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">3 AI</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-zinc-500">Thành viên trong nhóm</p>
                {getGroupMemberRows(manageConv).map((member) => {
                  const char = characters.find((c) => c.id === member.member_id);
                  if (!char) return null;
                  return (
                    <div
                      key={member.member_id}
                      className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={char.avatar}
                          alt={char.name}
                          loading="lazy"
                          onError={(e) => handleCharImgError(e, char.name)}
                          className="w-9 h-9 rounded-xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{char.name}</p>
                          <p className="text-[10px] text-zinc-500">
                            {member.role === 'admin' ? 'Quản trị' : 'Thành viên'}
                            {member.muted ? ' · Đang tắt tiếng' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            await osApi.messagesV3.updateMember(manageConv.id, char.id, {
                              muted: member.muted ? 0 : 1,
                            });
                            await onRefreshData();
                          }}
                          className="p-2 rounded-xl bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300"
                          title={member.muted ? 'Bỏ tắt tiếng' : 'Tắt tiếng tạm thời'}
                        >
                          {member.muted ? <VolumeX className="w-3.5 h-3.5 text-amber-500" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={async () => {
                            await osApi.messagesV3.removeMember(manageConv.id, char.id);
                            await onRefreshData();
                            onShowToast('Đã xóa thành viên', `${char.name} đã rời nhóm`);
                          }}
                          className="p-2 rounded-xl bg-white dark:bg-zinc-900 text-rose-500"
                          title="Mời ra khỏi nhóm"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add new AI member */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <select
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                >
                  <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Chọn nhân vật để thêm...</option>
                  {characters
                    .filter(
                      (c) =>
                        !c.is_blocked &&
                        !getGroupMemberRows(manageConv).some((m) => m.member_id === c.id)
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!addMemberId}
                  onClick={async () => {
                    if (!addMemberId) return;
                    await osApi.messagesV3.addMember(manageConv.id, addMemberId);
                    setAddMemberId('');
                    await onRefreshData();
                    onShowToast('Đã thêm thành viên', 'Nhân vật đã tham gia nhóm.', 'success');
                  }}
                  className="px-3 py-2 rounded-xl bg-violet-600 disabled:opacity-50 text-white font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
