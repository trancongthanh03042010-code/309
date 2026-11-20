import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Character, Conversation } from '../../types/os';
import { CHARACTER_AVATARS, CHARACTER_GENRES, handleCharImgError, safeJson } from './utils';
import { osApi } from '../../services/api';

type MyCharTab = 'chatted' | 'favorite' | 'custom' | 'blocked';

interface CharacterFormState {
  id?: string;
  name: string;
  age: number;
  gender: 'female' | 'male' | 'unknown';
  style: 'anime' | 'realistic';
  tagline: string;
  role_title: string;
  pronouns: string;
  avatar: string;
  cover_image: string;
  genres: string[];
  personality: string;
  traitsText: string;
  values: string;
  flaws: string;
  boundariesText: string;
  bio: string;
  likes: string;
  dislikes: string;
  scenario: string;
  greeting: string;
  speaking_style: string;
  system_prompt: string;
  memory_prompt: string;
  emotional_behavior: string;
  cadence: 'short' | 'balanced' | 'detailed';
  emojiRate: 'none' | 'low' | 'high';
  voice_name: string;
  voice_style: string;
  proactive_msg_enabled: number;
  dailyCap: number;
  privacy: 'public' | 'private';
  content_boundary: 'standard' | 'strict' | 'platonic';
  content_notice: string;
  sampleUser: string;
  sampleAi: string;
  applyScope: 'existing' | 'new_only';
}

function buildInitialForm(char?: Character | null): CharacterFormState {
  if (!char) {
    return {
      name: '',
      age: 20,
      gender: 'female',
      style: 'anime',
      tagline: '',
      role_title: 'Bạn đồng hành AI',
      pronouns: 'Mình - Bạn',
      avatar: CHARACTER_AVATARS[0].url,
      cover_image: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      genres: ['Anime', 'Slice of Life'],
      personality: 'Thân thiện, tinh tế và biết lắng nghe',
      traitsText: 'Chân thành, Nhẹ nhàng, Hóm hỉnh',
      values: 'Sự đồng cảm và trung thực',
      flaws: 'Đôi khi hay suy nghĩ nhiều',
      boundariesText: 'Tôn trọng không gian riêng tư',
      bio: '',
      likes: 'Âm nhạc, cà phê, trò chuyện đêm',
      dislikes: 'Sự giả tạo, ồn ào quá mức',
      scenario: 'Đang ngồi quán cà phê quen thuộc và nhắn tin với bạn',
      greeting: 'Chào bạn! Hôm nay của bạn thế nào rồi?',
      speaking_style: 'Tự nhiên, ấm áp như nhắn tin đời thường',
      system_prompt: '',
      memory_prompt: '',
      emotional_behavior: '',
      cadence: 'balanced',
      emojiRate: 'low',
      voice_name: 'Kore',
      voice_style: 'Warm conversational',
      proactive_msg_enabled: 1,
      dailyCap: 2,
      privacy: 'public',
      content_boundary: 'standard',
      content_notice: '',
      sampleUser: 'Hôm nay mình hơi căng thẳng một chút.',
      sampleAi: 'Kể mình nghe xem chuyện gì làm bạn mệt nào, mình đang nghe đây.',
      applyScope: 'existing',
    };
  }
  const pObj = safeJson<{ traits?: string[]; values?: string; flaws?: string; boundaries?: string[] }>(char.personality_json, {});
  const sObj = safeJson<{ cadence?: 'short' | 'balanced' | 'detailed'; emojiRate?: 'none' | 'low' | 'high' }>(char.speech_style_json, {});
  const proObj = safeJson<{ dailyCap?: number }>(char.proactive_settings_json, {});
  const samples = safeJson<Array<{ user: string; ai: string }>>(char.sample_dialogues_json, []);
  return {
    id: char.id,
    name: char.name,
    age: char.age || 20,
    gender: (char.gender as 'female' | 'male' | 'unknown') || 'unknown',
    style: (char.style as 'anime' | 'realistic') || 'anime',
    tagline: char.tagline || '',
    role_title: char.role_title || 'Bạn đồng hành AI',
    pronouns: char.pronouns || 'Mình - Bạn',
    avatar: char.avatar || CHARACTER_AVATARS[0].url,
    cover_image: char.cover_image || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
    genres: safeJson<string[]>(char.genres_json, ['Anime']),
    personality: char.personality || '',
    traitsText: (pObj.traits || []).join(', '),
    values: pObj.values || '',
    flaws: pObj.flaws || '',
    boundariesText: (pObj.boundaries || []).join(', '),
    bio: char.bio || '',
    likes: char.likes || '',
    dislikes: char.dislikes || '',
    scenario: char.scenario || '',
    greeting: char.greeting || '',
    speaking_style: char.speaking_style || '',
    system_prompt: char.system_prompt || '',
    memory_prompt: char.memory_prompt || '',
    emotional_behavior: char.emotional_behavior || '',
    cadence: sObj.cadence || 'balanced',
    emojiRate: sObj.emojiRate || 'low',
    voice_name: char.voice_name || 'Kore',
    voice_style: char.voice_style || 'Warm',
    proactive_msg_enabled: char.proactive_msg_enabled === 0 ? 0 : 1,
    dailyCap: proObj.dailyCap || 2,
    privacy: char.privacy || 'public',
    content_boundary: char.content_boundary || 'standard',
    content_notice: char.content_notice || '',
    sampleUser: samples[0]?.user || '',
    sampleAi: samples[0]?.ai || '',
    applyScope: 'existing',
  };
}

interface MyCharactersViewProps {
  characters: Character[];
  conversations: Conversation[];
  initialEditCharacter: Character | null;
  onClearInitialEdit: () => void;
  onStartChat: (char: Character) => void;
  onOpenProfile?: (char: Character) => void;
  onRefreshData: () => Promise<void>;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: { title: string; message: string; destructive?: boolean; onConfirm: () => Promise<void> }) => void;
  onRegisterOverlayBack?: (closer: (() => boolean) | null) => void;
}

export function MyCharactersView({
  characters,
  conversations,
  initialEditCharacter,
  onClearInitialEdit,
  onStartChat,
  onOpenProfile,
  onRefreshData,
  onShowToast,
  onRequestConfirm,
  onRegisterOverlayBack,
}: MyCharactersViewProps) {
  const [tab, setTab] = useState<MyCharTab>('chatted');
  const [creatorOpen, setCreatorOpen] = useState(Boolean(initialEditCharacter));
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<CharacterFormState>(() => buildInitialForm(initialEditCharacter));
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  useEffect(() => {
    if (!onRegisterOverlayBack) return;
    onRegisterOverlayBack(() => {
      if (importOpen) {
        setImportOpen(false);
        return true;
      }
      if (creatorOpen) {
        setCreatorOpen(false);
        return true;
      }
      return false;
    });
    return () => onRegisterOverlayBack(null);
  }, [importOpen, creatorOpen, onRegisterOverlayBack]);

  // Live Preview Reply before saving
  const [previewPrompt, setPreviewPrompt] = useState('Chào cậu, hôm nay tâm trạng cậu thế nào?');
  const [previewReply, setPreviewReply] = useState<{ reply: string; emotionTag: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  React.useEffect(() => {
    if (initialEditCharacter) {
      setForm(buildInitialForm(initialEditCharacter));
      setStep(1);
      setPreviewReply(null);
      setCreatorOpen(true);
      onClearInitialEdit();
    }
  }, [initialEditCharacter, onClearInitialEdit]);

  const chattedCharIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conversations) {
      if (c.character_id) ids.add(c.character_id);
    }
    return ids;
  }, [conversations]);

  const filteredList = useMemo(() => {
    return characters.filter((c) => {
      if (tab === 'blocked') return Boolean(c.is_blocked || c.is_hidden);
      if (c.is_blocked || c.is_hidden) return false;
      if (tab === 'chatted') return chattedCharIds.has(c.id);
      if (tab === 'favorite') return Boolean(c.is_favorite);
      if (tab === 'custom') return Boolean(c.is_custom);
      return true;
    });
  }, [characters, tab, chattedCharIds]);

  const openCreateModal = () => {
    setForm(buildInitialForm(null));
    setStep(1);
    setPreviewReply(null);
    setCreatorOpen(true);
  };

  const openEditModal = (c: Character) => {
    setForm(buildInitialForm(c));
    setStep(1);
    setPreviewReply(null);
    setCreatorOpen(true);
  };

  const handleUploadImage = (field: 'avatar' | 'cover_image', file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, [field]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTestPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await osApi.messagesV3.previewCharacterReply(
        {
          name: form.name.trim() || 'Nhân vật mới',
          age: form.age,
          personality: form.personality,
          bio: form.bio,
          pronouns: form.pronouns,
          speaking_style: form.speaking_style,
          scenario: form.scenario,
          system_prompt: form.system_prompt,
          emotional_behavior: form.emotional_behavior,
        },
        previewPrompt
      );
      setPreviewReply({ reply: res.reply, emotionTag: res.emotionTag });
    } catch (err) {
      onShowToast('Không thể xem trước', err instanceof Error ? err.message : 'Lỗi AI', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveCharacter = async () => {
    if (!form.name.trim()) {
      onShowToast('Thiếu tên nhân vật', 'Vui lòng nhập tên nhân vật trước khi lưu.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        age: Number(form.age || 20),
        gender: form.gender,
        style: form.style,
        tagline: form.tagline.trim() || `${form.role_title} · Tự tạo`,
        role_title: form.role_title.trim(),
        pronouns: form.pronouns.trim(),
        avatar: form.avatar,
        cover_image: form.cover_image,
        genres_json: JSON.stringify(form.genres),
        personality: form.personality.trim(),
        personality_json: JSON.stringify({
          traits: form.traitsText.split(',').map((s) => s.trim()).filter(Boolean),
          values: form.values.trim(),
          flaws: form.flaws.trim(),
          boundaries: form.boundariesText.split(',').map((s) => s.trim()).filter(Boolean),
        }),
        bio: form.bio.trim() || form.personality.trim(),
        likes: form.likes.trim(),
        dislikes: form.dislikes.trim(),
        scenario: form.scenario.trim(),
        greeting: form.greeting.trim() || `Xin chào, mình là ${form.name.trim()}!`,
        speaking_style: form.speaking_style.trim(),
        system_prompt: form.system_prompt.trim(),
        memory_prompt: form.memory_prompt.trim(),
        emotional_behavior: form.emotional_behavior.trim(),
        speech_style_json: JSON.stringify({
          cadence: form.cadence,
          emojiRate: form.emojiRate,
          tone: form.speaking_style.trim(),
          responseLanguage: 'vi',
        }),
        voice_name: form.voice_name,
        voice_style: form.voice_style,
        proactive_msg_enabled: form.proactive_msg_enabled,
        proactive_settings_json: JSON.stringify({
          enabled: Boolean(form.proactive_msg_enabled),
          dailyCap: form.dailyCap,
          cooldownMin: 180,
        }),
        privacy: form.privacy,
        content_boundary: form.content_boundary,
        content_notice: form.content_notice.trim(),
        sample_dialogues_json: JSON.stringify(
          form.sampleUser && form.sampleAi ? [{ user: form.sampleUser, ai: form.sampleAi }] : []
        ),
        applyScope: form.applyScope,
      };

      if (form.id) {
        const res = await osApi.messagesV3.updateCharacterV3(form.id, payload);
        await onRefreshData();
        setCreatorOpen(false);
        onShowToast(
          res.clonedForNewChat ? 'Đã tạo phiên bản cho chat mới' : 'Đã cập nhật nhân vật',
          res.clonedForNewChat
            ? 'Cuộc trò chuyện cũ giữ nguyên tính cách trước đó.'
            : `Đã lưu thay đổi cho ${res.character.name}.`,
          'success'
        );
      } else {
        const created = await osApi.messagesV3.createCharacterV3(payload);
        await onRefreshData();
        setCreatorOpen(false);
        onShowToast('Đã tạo nhân vật mới', `${created.name} đã sẵn sàng trò chuyện!`, 'success');
        setTab('custom');
      }
    } catch (err) {
      onShowToast('Lưu nhân vật thất bại', err instanceof Error ? err.message : 'Lỗi không xác định', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportJson = async () => {
    if (!importJsonText.trim()) return;
    try {
      const imported = await osApi.messagesV3.importCharacterJson(importJsonText);
      await onRefreshData();
      setImportOpen(false);
      setImportJsonText('');
      setTab('custom');
      onShowToast('Nhập JSON thành công', `Đã thêm nhân vật "${imported.name}".`, 'success');
    } catch (err) {
      onShowToast('Lỗi nhập JSON', err instanceof Error ? err.message : 'JSON không hợp lệ', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden doki-soft-surface doki-animate-in">
      <div className="px-3.5 pt-2.5 pb-2.5 space-y-2.5 doki-glass border-b border-violet-200/40 dark:border-violet-900/30 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Nhân vật AI</h3>
            <p className="text-[11px] text-zinc-500">Quản lý, nhân bản & sáng tạo nhân vật riêng</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setImportOpen(true)}
              className="min-h-[38px] px-2.5 rounded-xl bg-white/80 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Nhập</span>
            </button>
            <button
              onClick={openCreateModal}
              className="min-h-[38px] px-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-xs font-semibold flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo mới</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {(
            [
              ['chatted', 'Đã trò chuyện'],
              ['favorite', 'Yêu thích'],
              ['custom', 'Tự tạo'],
              ['blocked', 'Đã ẩn / Chặn'],
            ] as Array<[MyCharTab, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 ${
                tab === k
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-white/75 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2.5">
        {filteredList.length === 0 ? (
          <div className="py-14 text-center space-y-2.5">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {tab === 'custom'
                ? 'Bạn chưa tự tạo nhân vật AI nào'
                : tab === 'blocked'
                  ? 'Không có nhân vật nào bị ẩn hoặc chặn'
                  : 'Danh sách trống'}
            </p>
            {tab === 'custom' && (
              <button onClick={openCreateModal} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">
                Tạo nhân vật AI đầu tiên
              </button>
            )}
          </div>
        ) : (
          filteredList.map((c) => (
            <div key={c.id} className="doki-glass rounded-3xl p-3 space-y-2.5">
              <div
                onClick={() => onOpenProfile?.(c)}
                className="flex items-center gap-3 cursor-pointer"
              >
                <img
                  src={c.avatar}
                  alt={c.name}
                  loading="lazy"
                  onError={(e) => handleCharImgError(e, c.name)}
                  className="w-13 h-13 rounded-2xl object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{c.name}</h4>
                    {c.is_custom === 1 && (
                      <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 shrink-0">
                        Tự tạo · {c.privacy === 'private' ? 'Riêng tư' : 'Công khai'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{c.tagline}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Cấp {c.relationship_level} · {c.mood}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-200/40 dark:border-zinc-800">
                {tab === 'blocked' ? (
                  <button
                    onClick={async () => {
                      await osApi.messagesV3.updateCharacterV3(c.id, { is_hidden: 0, is_blocked: 0 });
                      await onRefreshData();
                      onShowToast(c.name, 'Đã khôi phục nhân vật', 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Khôi phục</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onStartChat(c)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-[11px] font-semibold flex items-center gap-1"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Nhắn tin</span>
                  </button>
                )}

                <button
                  onClick={() => openEditModal(c)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-zinc-800 text-[11px] font-medium flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Sửa</span>
                </button>

                <button
                  onClick={async () => {
                    const copy = await osApi.messagesV3.duplicateCharacter(c.id);
                    await onRefreshData();
                    setTab('custom');
                    onShowToast('Đã nhân bản', `Tạo bản sao "${copy.name}"`, 'success');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-zinc-800 text-[11px] font-medium flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Nhân bản</span>
                </button>

                <a
                  href={osApi.messagesV3.exportCharacterUrl(c.id)}
                  download
                  className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-zinc-800 text-[11px] font-medium flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </a>

                <button
                  onClick={async () => {
                    await osApi.updateCharacter(c.id, { is_favorite: c.is_favorite ? 0 : 1 });
                    await onRefreshData();
                  }}
                  className={`p-1.5 rounded-xl bg-white/80 dark:bg-zinc-800 ${
                    c.is_favorite ? 'text-pink-500' : 'text-zinc-400'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${c.is_favorite ? 'fill-current' : ''}`} />
                </button>

                {c.is_custom === 1 && (
                  <button
                    onClick={() =>
                      onRequestConfirm({
                        title: `Xóa nhân vật ${c.name}?`,
                        message: 'Nhân vật tự tạo và ký ức liên quan sẽ bị xóa vĩnh viễn.',
                        destructive: true,
                        onConfirm: async () => {
                          await osApi.messagesV3.deleteCustomCharacter(c.id);
                          await onRefreshData();
                          onShowToast('Đã xóa nhân vật', c.name);
                        },
                      })
                    }
                    className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Multi-step Creator Modal */}
      {creatorOpen && (
        <div
          onClick={() => setCreatorOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {form.id ? `Chỉnh sửa: ${form.name}` : 'Tạo nhân vật AI mới'}
                </h4>
                <p className="text-[11px] text-zinc-500">Bước {step} / 3</p>
              </div>
              <button onClick={() => setCreatorOpen(false)} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 px-4 pt-2.5">
              {[
                [1, '1. Hồ sơ'],
                [2, '2. Tính cách'],
                [3, '3. Prompt & Thử nghiệm'],
              ].map(([idx, label]) => (
                <button
                  key={idx}
                  onClick={() => setStep(idx as 1 | 2 | 3)}
                  className={`py-2 rounded-xl text-[11px] font-semibold ${
                    step === idx
                      ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3 text-xs">
              {step === 1 && (
                <>
                  <div className="flex items-start gap-3">
                    <img
                      src={form.avatar}
                      alt={form.name || 'Avatar'}
                      loading="lazy"
                      onError={(e) => handleCharImgError(e, form.name || 'AI')}
                      className="w-16 h-16 rounded-2xl object-cover shrink-0"
                    />
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <p className="font-semibold">Ảnh đại diện ({CHARACTER_AVATARS.length} mẫu)</p>
                      <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto os-scroll pr-1">
                        {CHARACTER_AVATARS.map((av) => (
                          <button
                            key={av.url}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, avatar: av.url }))}
                            title={av.label}
                            className={`w-8 h-8 rounded-lg overflow-hidden border-2 shrink-0 ${
                              form.avatar === av.url ? 'border-violet-600 ring-2 ring-violet-400/40' : 'border-transparent'
                            }`}
                          >
                            <img
                              src={av.url}
                              alt={av.label}
                              loading="lazy"
                              onError={(e) => handleCharImgError(e, av.label)}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                        <label className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 cursor-pointer font-medium">
                          Tải ảnh
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImage('avatar', e.target.files?.[0])} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[11px] text-zinc-500 block mb-1">Tên nhân vật *</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Ví dụ: Hikari Aoi"
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Tuổi</label>
                      <input
                        type="number"
                        value={form.age}
                        onChange={(e) => setForm((p) => ({ ...p, age: Number(e.target.value) }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Giới tính</label>
                      <select
                        value={form.gender}
                        onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value as 'female' | 'male' | 'unknown' }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="female" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Nữ</option>
                        <option value="male" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Nam</option>
                        <option value="unknown" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Không xác định</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Phong cách hình ảnh</label>
                      <select
                        value={form.style}
                        onChange={(e) => setForm((p) => ({ ...p, style: e.target.value as 'anime' | 'realistic' }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="anime" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Anime</option>
                        <option value="realistic" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Realistic</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Vai trò</label>
                      <input
                        value={form.role_title}
                        onChange={(e) => setForm((p) => ({ ...p, role_title: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Cách xưng hô</label>
                      <input
                        value={form.pronouns}
                        onChange={(e) => setForm((p) => ({ ...p, pronouns: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Mô tả ngắn (Tagline)</label>
                    <input
                      value={form.tagline}
                      onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Chủ đề (14 thể loại)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CHARACTER_GENRES.map((g) => {
                        const active = form.genres.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                genres: active ? p.genres.filter((x) => x !== g) : [...p.genres, g],
                              }))
                            }
                            className={`px-2 py-1 rounded-lg border text-[11px] ${
                              active ? 'bg-violet-600 text-white border-violet-600' : 'border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Tiểu sử nhân vật</label>
                    <textarea
                      rows={3}
                      value={form.bio}
                      onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Tính cách cốt lõi</label>
                    <textarea
                      rows={2}
                      value={form.personality}
                      onChange={(e) => setForm((p) => ({ ...p, personality: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Nét tính cách (dấu phẩy)</label>
                    <input
                      value={form.traitsText}
                      onChange={(e) => setForm((p) => ({ ...p, traitsText: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Sở thích</label>
                      <input
                        value={form.likes}
                        onChange={(e) => setForm((p) => ({ ...p, likes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Không thích</label>
                      <input
                        value={form.dislikes}
                        onChange={(e) => setForm((p) => ({ ...p, dislikes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Bối cảnh mở đầu</label>
                    <textarea
                      rows={2}
                      value={form.scenario}
                      onChange={(e) => setForm((p) => ({ ...p, scenario: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Lời chào mở đầu</label>
                    <textarea
                      rows={2}
                      value={form.greeting}
                      onChange={(e) => setForm((p) => ({ ...p, greeting: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
                    />
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 space-y-2">
                    <p className="text-[11px] font-semibold">Hội thoại mẫu</p>
                    <input
                      value={form.sampleUser}
                      onChange={(e) => setForm((p) => ({ ...p, sampleUser: e.target.value }))}
                      placeholder="Bạn nói..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 outline-none"
                    />
                    <input
                      value={form.sampleAi}
                      onChange={(e) => setForm((p) => ({ ...p, sampleAi: e.target.value }))}
                      placeholder="Nhân vật đáp..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 outline-none"
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">Phong cách nhắn tin</label>
                    <input
                      value={form.speaking_style}
                      onChange={(e) => setForm((p) => ({ ...p, speaking_style: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-500 block mb-1">System Prompt nâng cao (Chỉ dẫn cốt lõi)</label>
                    <textarea
                      rows={2}
                      value={form.system_prompt}
                      onChange={(e) => setForm((p) => ({ ...p, system_prompt: e.target.value }))}
                      placeholder="Chỉ dẫn đặc biệt về vai trò, luật nhập vai hoặc cách suy nghĩ của AI..."
                      className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Memory Prompt (Ưu tiên nhớ)</label>
                      <input
                        value={form.memory_prompt}
                        onChange={(e) => setForm((p) => ({ ...p, memory_prompt: e.target.value }))}
                        placeholder="Ví dụ: Luôn nhớ sở thích âm nhạc..."
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Hành vi cảm xúc</label>
                      <input
                        value={form.emotional_behavior}
                        onChange={(e) => setForm((p) => ({ ...p, emotional_behavior: e.target.value }))}
                        placeholder="Ví dụ: Hay ngại khi được khen"
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Giọng đọc TTS</label>
                      <select
                        value={form.voice_name}
                        onChange={(e) => setForm((p) => ({ ...p, voice_name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="Kore" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Kore (Nữ ấm áp)</option>
                        <option value="Zephyr" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Zephyr (Nữ tươi sáng)</option>
                        <option value="Aoede" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Aoede (Nữ nhẹ nhàng)</option>
                        <option value="Fenrir" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Fenrir (Nam trầm)</option>
                        <option value="Puck" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Puck (Nam năng động)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 block mb-1">Quyền riêng tư</label>
                      <select
                        value={form.privacy}
                        onChange={(e) => setForm((p) => ({ ...p, privacy: e.target.value as 'public' | 'private' }))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
                      >
                        <option value="public" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Công khai trong máy</option>
                        <option value="private" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Riêng tư</option>
                      </select>
                    </div>
                  </div>

                  {/* Live Preview Before Saving */}
                  <div className="p-3 rounded-2xl bg-violet-50/90 dark:bg-violet-950/35 border border-violet-200/70 dark:border-violet-800/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Xem trước phản hồi (Live AI Test)</span>
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={previewPrompt}
                        onChange={(e) => setPreviewPrompt(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 outline-none"
                        placeholder="Nhập câu thử nghiệm..."
                      />
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={handleTestPreview}
                        className="px-3 py-1.5 rounded-xl bg-violet-600 text-white font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />
                        <span>{previewLoading ? '...' : 'Thử'}</span>
                      </button>
                    </div>
                    {previewReply && (
                      <div className="p-2.5 rounded-xl bg-white/90 dark:bg-zinc-900/90 space-y-1">
                        <span className="text-[10px] font-semibold text-pink-600">Cảm xúc: {previewReply.emotionTag}</span>
                        <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed">{previewReply.reply}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
              {step > 1 ? (
                <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold">
                  Quay lại
                </button>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Nhân vật AI ảo</span>
                </div>
              )}

              {step < 3 ? (
                <button onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">
                  Tiếp tục
                </button>
              ) : (
                <button
                  disabled={saving}
                  onClick={handleSaveCharacter}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : form.id ? 'Lưu thay đổi' : 'Tạo nhân vật'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div onClick={() => setImportOpen(false)} className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">Nhập nhân vật từ JSON</h4>
              <button onClick={() => setImportOpen(false)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs text-center cursor-pointer font-medium">
              Chọn tệp .json từ thiết bị
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then(setImportJsonText);
                }}
              />
            </label>
            <textarea
              rows={5}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='Dán JSON cấu hình nhân vật...'
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-mono outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setImportOpen(false)} className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold">
                Hủy
              </button>
              <button onClick={handleImportJson} className="px-3.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold">
                Nhập nhân vật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
