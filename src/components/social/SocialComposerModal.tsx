import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Film,
  Image as ImageIcon,
  Link2,
  MapPin,
  Music,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { socialApi } from '../../services/socialApi';
import type { SocialGroupItem, SocialPostItem, SocialPostMediaItem } from '../../types/social';
import { SOCIAL_STICKERS } from './SocialUI';

interface SocialComposerModalProps {
  initialTab?: 'post' | 'story' | 'video';
  editingPost?: SocialPostItem | null;
  repostSource?: SocialPostItem | null;
  defaultGroupId?: string;
  groups: SocialGroupItem[];
  onClose: () => void;
  onSuccess: (createdKind: 'post' | 'story' | 'video', message: string) => void;
}

const AUDIO_OPTIONS = [
  'Âm thanh gốc · VibeSphere',
  'Mưa Trên Kính Shibuya · Yuki Shirakawa',
  'Gió Hoàng Hôn Sakura · Acoustic',
  'Vòng Cầu Nửa Đêm · Lo-Fi Beat',
];

export function SocialComposerModal({
  initialTab = 'post',
  editingPost = null,
  repostSource = null,
  defaultGroupId = '',
  groups,
  onClose,
  onSuccess,
}: SocialComposerModalProps) {
  const { data } = useOS();
  const [mode, setMode] = useState<'post' | 'story' | 'video'>(editingPost || repostSource ? 'post' : initialTab);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Post state
  const [content, setContent] = useState(editingPost?.content || '');
  const [mediaItems, setMediaItems] = useState<SocialPostMediaItem[]>(editingPost?.media_items || []);
  const [coverUrl, setCoverUrl] = useState(editingPost?.cover_url || '');
  const [locationName, setLocationName] = useState(editingPost?.location_name || '');
  const [linkUrl, setLinkUrl] = useState(editingPost?.link_url || '');
  const [linkTitle, setLinkTitle] = useState(editingPost?.link_title || '');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'followers' | 'private'>(editingPost?.privacy || 'public');
  const [commentPolicy, setCommentPolicy] = useState<'everyone' | 'friends' | 'off'>(editingPost?.comment_policy || 'everyone');
  const [groupId, setGroupId] = useState(editingPost?.group_id || defaultGroupId || '');
  const [scheduledAt, setScheduledAt] = useState(editingPost?.scheduled_at || '');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(editingPost?.location_name || editingPost?.link_url || editingPost?.scheduled_at));

  // Story state
  const [storyMedia, setStoryMedia] = useState('/src/assets/images/social_saigon_cafe_1794918924529.jpg');
  const [storyMediaType, setStoryMediaType] = useState<'image' | 'video'>('image');
  const [storyCaption, setStoryCaption] = useState('');
  const [storyOverlayText, setStoryOverlayText] = useState('');
  const [storyOverlayColor, setStoryOverlayColor] = useState('#FFFFFF');
  const [storySticker, setStorySticker] = useState('');
  const [storyAudio, setStoryAudio] = useState(AUDIO_OPTIONS[1]);
  const [storyPrivacy, setStoryPrivacy] = useState('public');

  // Video / Reel state
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [videoFileUrl, setVideoFileUrl] = useState('');
  const [videoCoverUrl, setVideoCoverUrl] = useState('/src/assets/images/social_neon_street_1794918924716.jpg');
  const [videoDuration, setVideoDuration] = useState(18);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(18);
  const [videoAudio, setVideoAudio] = useState(AUDIO_OPTIONS[0]);
  const [videoCategory, setVideoCategory] = useState('lifestyle');
  const [videoTags, setVideoTags] = useState('#VibeSphere #VideoNgan');
  const [videoPrivacy, setVideoPrivacy] = useState('public');
  const [videoAllowComments, setVideoAllowComments] = useState(true);

  const galleryPhotos = (data?.media || []).filter((m) => !m.is_deleted && m.type === 'photo').slice(0, 10);
  const presetImages = [
    '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    '/src/assets/images/social_studio_setup_1794918925398.jpg',
    '/src/assets/images/social_neon_street_1794918924716.jpg',
    '/src/assets/images/social_music_live_1794918926157.jpg',
    '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
    ...galleryPhotos.map((g) => g.data_url),
  ];

  const handleFileUpload = (file: File, target: 'post' | 'story' | 'video') => {
    if (file.size > 16 * 1024 * 1024) {
      setErrorMsg('Tệp vượt quá 16MB. Vui lòng chọn tệp nhẹ hơn.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const isVideo = file.type.startsWith('video/');
      if (target === 'post') {
        setMediaItems((prev) => [...prev, { url: dataUrl, type: isVideo ? 'video' : 'image' }]);
        if (!coverUrl && !isVideo) setCoverUrl(dataUrl);
      } else if (target === 'story') {
        setStoryMedia(dataUrl);
        setStoryMediaType(isVideo ? 'video' : 'image');
      } else if (target === 'video') {
        if (isVideo) {
          setVideoFileUrl(dataUrl);
        } else {
          setVideoCoverUrl(dataUrl);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const moveMedia = (idx: number, dir: -1 | 1) => {
    setMediaItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const submitPost = async (asDraft = false) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      if (editingPost) {
        await socialApi.updatePost(editingPost.id, {
          content,
          privacy,
          comment_policy: commentPolicy,
          location_name: locationName,
          status: asDraft ? 'draft' : 'published',
        });
        onSuccess('post', 'Đã cập nhật bài viết!');
      } else {
        await socialApi.createPost({
          content,
          media_items: mediaItems,
          cover_url: coverUrl || mediaItems[0]?.url || '',
          location_name: locationName,
          link_url: linkUrl,
          link_title: linkTitle,
          shared_post_id: repostSource?.id || '',
          group_id: groupId,
          privacy,
          comment_policy: commentPolicy,
          is_draft: asDraft,
          scheduled_at: !asDraft && scheduledAt ? new Date(scheduledAt).toISOString() : '',
        });
        onSuccess(
          'post',
          asDraft ? 'Đã lưu bản nháp bài viết.' : scheduledAt ? 'Đã hẹn giờ đăng bài thành công!' : 'Đã đăng bài viết mới!'
        );
      }
    } catch (err) {
      // Preserve user's entered text & media on failure!
      setErrorMsg(err instanceof Error ? err.message : 'Tải lên thất bại. Nội dung của bạn vẫn được giữ nguyên.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitStory = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const overlays: Array<{ id: string; text: string; color?: string; yPct?: number }> = [];
      if (storyOverlayText.trim()) {
        overlays.push({ id: 'ov_txt', text: storyOverlayText.trim(), color: storyOverlayColor, yPct: 45 });
      }
      if (storySticker) {
        overlays.push({ id: 'ov_stk', text: storySticker, yPct: 26 });
      }
      await socialApi.createStory({
        media_url: storyMedia,
        media_type: storyMediaType,
        caption: storyCaption.trim(),
        overlays,
        audio_title: storyAudio,
        privacy: storyPrivacy,
      });
      onSuccess('story', 'Đã đăng Tin 24h mới!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Đăng Story thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitVideo = async () => {
    if (submitting) return;
    if (!videoTitle.trim()) {
      setErrorMsg('Vui lòng nhập tiêu đề video ngắn.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await socialApi.createVideo({
        title: videoTitle.trim(),
        description: videoDesc.trim(),
        video_url: videoFileUrl,
        cover_url: videoCoverUrl,
        duration_sec: Math.max(3, trimEnd - trimStart || videoDuration),
        trim_start_sec: trimStart,
        trim_end_sec: trimEnd,
        audio_title: videoAudio,
        category: videoCategory,
        hashtags: videoTags
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => (t.startsWith('#') ? t : `#${t}`)),
        privacy: videoPrivacy,
        allow_comments: videoAllowComments,
      });
      onSuccess('video', 'Đã xuất bản Video ngắn mới!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Đăng Video thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const joinedGroups = groups.filter((g) => g.my_status === 'approved');

  return (
    <div className="absolute inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center">
      <div className="w-full h-[92%] sm:h-auto sm:max-h-[90%] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#14161D] border-t sm:border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Top Bar */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold">
            {editingPost ? 'Chỉnh sửa bài viết' : repostSource ? 'Chia sẻ lại bài viết' : 'Tạo nội dung mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500"
            aria-label="Đóng trình soạn thảo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector (unless editing/reposting) */}
        {!editingPost && !repostSource && (
          <div className="px-4 pt-2.5 grid grid-cols-3 gap-1.5 shrink-0">
            {[
              { id: 'post', label: 'Bài viết', icon: ImageIcon },
              { id: 'story', label: 'Tin 24h', icon: Sparkles },
              { id: 'video', label: 'Video ngắn', icon: Film },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMode(tab.id as 'post' | 'story' | 'video');
                    setErrorMsg('');
                  }}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 font-medium">
              {errorMsg}
            </div>
          )}

          {mode === 'post' && (
            <>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Bạn đang nghĩ gì? Dùng #hashtag hoặc @username để gắn thẻ..."
                className="w-full p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none text-[13px] leading-relaxed"
              />

              {repostSource && (
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-1">
                  <p className="font-bold">{repostSource.author_name}</p>
                  <p className="text-zinc-500 line-clamp-3">{repostSource.content}</p>
                </div>
              )}

              {/* Quick Tags / Mentions */}
              <div className="flex items-center gap-2 overflow-x-auto os-scroll-hidden">
                {['#VibeSphere', '#SaiGon', '#CuocSong', '@yuki.sound', '@sakura.35mm'].map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setContent((c) => (c ? `${c} ${tok}` : `${tok} `))}
                    className="min-h-[36px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-indigo-500 font-medium shrink-0"
                  >
                    {tok}
                  </button>
                ))}
              </div>

              {/* Media Upload + Order + Cover */}
              {!editingPost && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                      Ảnh / Video ({mediaItems.length})
                    </span>
                    <label className="min-h-[36px] px-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" /> Tải từ máy
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f, 'post');
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {/* Quick Picker from Phone OS Gallery */}
                  <div className="flex gap-2 overflow-x-auto os-scroll-hidden pb-1">
                    {presetImages.slice(0, 8).map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setMediaItems((prev) =>
                            prev.some((m) => m.url === url) ? prev : [...prev, { url, type: 'image' }]
                          );
                          if (!coverUrl) setCoverUrl(url);
                        }}
                        className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-800"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-md bg-black/60 text-white flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>

                  {mediaItems.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {mediaItems.map((m, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-black">
                          {m.type === 'video' ? (
                            <video src={m.url} className="w-full h-28 object-cover" />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-28 object-cover" />
                          )}
                          <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => moveMedia(idx, -1)}
                                disabled={idx === 0}
                                className="p-1 rounded-lg bg-black/65 text-white disabled:opacity-30"
                                title="Đẩy lên trước"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveMedia(idx, 1)}
                                disabled={idx === mediaItems.length - 1}
                                className="p-1 rounded-lg bg-black/65 text-white disabled:opacity-30"
                                title="Đẩy ra sau"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCoverUrl(m.url)}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                                coverUrl === m.url ? 'bg-indigo-600 text-white' : 'bg-black/65 text-white'
                              }`}
                            >
                              {coverUrl === m.url ? 'Ảnh bìa' : 'Đặt bìa'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setMediaItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded-lg bg-rose-600 text-white"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Privacy & Comment Policy */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Đối tượng xem</label>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as 'public' | 'friends' | 'followers' | 'private')}
                    className="w-full min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="public">Công khai</option>
                    <option value="friends">Bạn bè</option>
                    <option value="followers">Người theo dõi</option>
                    <option value="private">Chỉ mình tôi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Quyền bình luận</label>
                  <select
                    value={commentPolicy}
                    onChange={(e) => setCommentPolicy(e.target.value as 'everyone' | 'friends' | 'off')}
                    className="w-full min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="everyone">Mọi người</option>
                    <option value="friends">Chỉ bạn bè</option>
                    <option value="off">Tắt bình luận</option>
                  </select>
                </div>
              </div>

              {joinedGroups.length > 0 && !editingPost && (
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Đăng vào Nhóm (tùy chọn)</label>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="">Trang cá nhân & Bảng tin chung</option>
                    {joinedGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Nhóm: {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-indigo-500 font-semibold"
              >
                {showAdvanced ? '▾ Ẩn tùy chọn địa điểm, liên kết & hẹn giờ' : '▸ Thêm địa điểm, liên kết hoặc hẹn giờ đăng'}
              </button>

              {showAdvanced && (
                <div className="space-y-2 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                    <input
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="Thêm địa điểm (vd: Quận 1, TP. HCM)"
                      className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-zinc-900 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="URL liên kết đính kèm (tùy chọn)"
                      className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-zinc-900 outline-none"
                    />
                  </div>
                  {linkUrl && (
                    <input
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      placeholder="Tiêu đề hiển thị cho liên kết"
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-zinc-900 outline-none"
                    />
                  )}
                  {!editingPost && (
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-zinc-900 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'story' && (
            <div className="space-y-3">
              <div className="relative h-64 rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                {storyMediaType === 'video' ? (
                  <video src={storyMedia} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={storyMedia} alt="" className="w-full h-full object-cover" />
                )}
                {storySticker && (
                  <span className="absolute top-6 left-1/2 -translate-x-1/2 text-4xl drop-shadow">{storySticker}</span>
                )}
                {storyOverlayText && (
                  <span
                    style={{ color: storyOverlayColor }}
                    className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-base font-bold drop-shadow-lg bg-black/35 px-3 py-1.5 rounded-xl"
                  >
                    {storyOverlayText}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="min-h-[40px] px-3 rounded-xl bg-indigo-500/10 text-indigo-500 font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Chọn ảnh/video từ máy
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, 'story');
                    }}
                  />
                </label>
                <select
                  value={storyPrivacy}
                  onChange={(e) => setStoryPrivacy(e.target.value)}
                  className="min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                >
                  <option value="public">Công khai (24h)</option>
                  <option value="friends">Bạn bè (24h)</option>
                </select>
              </div>

              <div className="flex gap-2 overflow-x-auto os-scroll-hidden">
                {presetImages.slice(0, 6).map((u, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setStoryMedia(u);
                      setStoryMediaType('image');
                    }}
                    className={`w-12 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${
                      storyMedia === u ? 'border-indigo-500' : 'border-transparent'
                    }`}
                  >
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <input
                value={storyOverlayText}
                onChange={(e) => setStoryOverlayText(e.target.value)}
                placeholder="Chữ nổi trên ảnh Story..."
                className="w-full min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Màu chữ:</span>
                {['#FFFFFF', '#F472B6', '#FBBF24', '#38BDF8', '#A78BFA'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setStoryOverlayColor(col)}
                    style={{ backgroundColor: col }}
                    className={`w-7 h-7 rounded-full border-2 ${storyOverlayColor === col ? 'border-indigo-600 scale-110' : 'border-zinc-300'}`}
                  />
                ))}
              </div>

              <div>
                <p className="text-zinc-500 mb-1">Nhãn dán nhanh:</p>
                <div className="flex gap-1.5 overflow-x-auto os-scroll-hidden">
                  <button
                    type="button"
                    onClick={() => setStorySticker('')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-xs"
                  >
                    Không
                  </button>
                  {SOCIAL_STICKERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStorySticker(s)}
                      className={`px-2.5 py-1 rounded-lg text-base ${storySticker === s ? 'bg-indigo-500/20' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-pink-500 shrink-0" />
                <select
                  value={storyAudio}
                  onChange={(e) => setStoryAudio(e.target.value)}
                  className="flex-1 min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                >
                  {AUDIO_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <input
                value={storyCaption}
                onChange={(e) => setStoryCaption(e.target.value)}
                placeholder="Chú thích Story (hiện ở thanh dưới)..."
                className="w-full min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
              />
            </div>
          )}

          {mode === 'video' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="min-h-[44px] px-3 rounded-xl bg-indigo-500/10 text-indigo-500 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-4 h-4" /> {videoFileUrl ? 'Đã chọn video ✓' : 'Tải video MP4/WebM'}
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, 'video');
                    }}
                  />
                </label>
                <label className="min-h-[44px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <ImageIcon className="w-4 h-4" /> Đổi ảnh bìa
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, 'video');
                    }}
                  />
                </label>
              </div>

              <div className="flex gap-2 overflow-x-auto os-scroll-hidden">
                {presetImages.slice(0, 5).map((u, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setVideoCoverUrl(u)}
                    className={`w-12 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${
                      videoCoverUrl === u ? 'border-indigo-500' : 'border-transparent'
                    }`}
                  >
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <input
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Tiêu đề video ngắn..."
                className="w-full min-h-[42px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none font-semibold"
              />
              <textarea
                rows={2}
                value={videoDesc}
                onChange={(e) => setVideoDesc(e.target.value)}
                placeholder="Mô tả ngắn nội dung video..."
                className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none"
              />

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span>Cắt đoạn video: {trimStart}s – {trimEnd}s</span>
                  <span className="font-mono-num">Thời lượng: {Math.max(3, trimEnd - trimStart)}s</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(5, videoDuration - 3)}
                    value={trimStart}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTrimStart(v);
                      if (trimEnd <= v + 2) setTrimEnd(Math.min(60, v + 5));
                    }}
                    className="flex-1"
                  />
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={trimEnd}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTrimEnd(Math.max(trimStart + 3, v));
                      setVideoDuration(Math.max(videoDuration, v));
                    }}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={videoCategory}
                  onChange={(e) => setVideoCategory(e.target.value)}
                  className="min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                >
                  <option value="lifestyle">Phong cách sống</option>
                  <option value="nhiepanh">Nhiếp ảnh</option>
                  <option value="amnhac">Âm nhạc</option>
                  <option value="congnghe">Công nghệ</option>
                  <option value="caphe">Cà phê & Ẩm thực</option>
                </select>
                <select
                  value={videoPrivacy}
                  onChange={(e) => setVideoPrivacy(e.target.value)}
                  className="min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                >
                  <option value="public">Công khai</option>
                  <option value="friends">Bạn bè</option>
                  <option value="private">Riêng tư</option>
                </select>
              </div>

              <select
                value={videoAudio}
                onChange={(e) => setVideoAudio(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
              >
                {AUDIO_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    Nhạc nền: {a}
                  </option>
                ))}
              </select>

              <input
                value={videoTags}
                onChange={(e) => setVideoTags(e.target.value)}
                placeholder="#Hashtag cách nhau bởi dấu cách"
                className="w-full min-h-[40px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
              />

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={videoAllowComments}
                  onChange={(e) => setVideoAllowComments(e.target.checked)}
                />
                <span>Cho phép người xem bình luận</span>
              </label>
            </div>
          )}
        </div>

        {/* Sticky Footer Actions */}
        <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
          {mode === 'post' && (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitPost(true)}
                className="min-h-[44px] px-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 font-semibold flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Lưu nháp
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitPost(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 text-white font-bold text-xs disabled:opacity-50"
              >
                {submitting ? 'Đang xử lý...' : editingPost ? 'Lưu thay đổi' : scheduledAt ? 'Hẹn giờ đăng' : 'Đăng bài viết'}
              </button>
            </>
          )}
          {mode === 'story' && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitStory()}
              className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-rose-500 text-white font-bold text-xs disabled:opacity-50"
            >
              {submitting ? 'Đang đăng Tin...' : 'Chia sẻ lên Tin 24h'}
            </button>
          )}
          {mode === 'video' && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitVideo()}
              className="flex-1 min-h-[44px] rounded-xl bg-rose-600 text-white font-bold text-xs disabled:opacity-50"
            >
              {submitting ? 'Đang xuất bản...' : 'Đăng Video ngắn'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
