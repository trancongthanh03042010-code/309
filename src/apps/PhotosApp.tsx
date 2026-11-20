import React, { useMemo, useState } from 'react';
import {
  Heart,
  Trash2,
  RotateCcw,
  Share2,
  Sliders,
  Search,
  ArrowLeft,
  Wallpaper,
  Upload,
  Lock,
  Maximize2,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { MediaAsset } from '../types/os';

type Tab = 'photos' | 'albums' | 'favorites' | 'videos' | 'trash';

export function PhotosApp() {
  const { data, refreshData, openShareSheet, updateProfile, showToast, requestConfirm, openApp } = useOS();
  const [tab, setTab] = useState<Tab>('photos');
  const [search, setSearch] = useState('');
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [categoryChip, setCategoryChip] = useState<'all' | 'screenshots' | 'ai'>('all');
  const [viewerItem, setViewerItem] = useState<MediaAsset | null>(null);
  const [editingItem, setEditingItem] = useState<MediaAsset | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);

  const items = useMemo(() => {
    if (!data) return [];
    return data.media.filter((m) => {
      if (tab === 'trash') return m.is_deleted === 1;
      if (m.is_deleted === 1) return false;
      if (tab === 'favorites' && !m.is_favorite) return false;
      if (tab === 'videos' && m.type !== 'video') return false;
      if (albumFilter && m.album !== albumFilter) return false;
      if (categoryChip === 'screenshots' && !m.album.toLowerCase().includes('chụp') && !m.title.toLowerCase().includes('screenshot')) {
        return false;
      }
      if (categoryChip === 'ai' && !m.album.toLowerCase().includes('ai') && !m.title.toLowerCase().includes('ai')) {
        return false;
      }
      if (search && !m.title.toLowerCase().includes(search.toLowerCase()) && !m.album.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data, tab, search, albumFilter, categoryChip]);

  const albums = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, MediaAsset[]>();
    for (const m of data.media.filter((x) => !x.is_deleted)) {
      const list = map.get(m.album) || [];
      list.push(m);
      map.set(m.album, list);
    }
    return Array.from(map.entries());
  }, [data]);

  if (!data) return null;

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      await osApi.createMedia({
        type: file.type.startsWith('video') ? 'video' : 'photo',
        title: file.name,
        data_url: reader.result as string,
        album: 'Tải xuống',
      });
      await refreshData();
      showToast('Đã nhập', `Đã thêm ${file.name} vào Ảnh`);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEditedCopy = async () => {
    if (!editingItem) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', 0.9);
      await osApi.createMedia({
        type: 'photo',
        title: `${editingItem.title} (Đã sửa)`,
        data_url: url,
        album: editingItem.album,
      });
      setEditingItem(null);
      setViewerItem(null);
      await refreshData();
      showToast('Đã lưu bản sao', 'Ảnh đã chỉnh sửa được lưu vào thư viện');
    };
    img.src = editingItem.data_url;
  };

  if (editingItem) {
    return (
      <div className="flex-1 flex flex-col bg-black text-white overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <button onClick={() => setEditingItem(null)} className="text-xs text-zinc-400">Hủy</button>
          <span className="text-xs font-semibold">Chỉnh sửa ảnh</span>
          <button onClick={handleSaveEditedCopy} className="text-xs font-semibold text-pink-400">Lưu bản sao</button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <img
            src={editingItem.data_url}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
            style={{ filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)` }}
          />
        </div>
        <div className="p-4 bg-zinc-900 space-y-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="w-20 text-zinc-400">Độ sáng</span>
            <input type="range" min={50} max={150} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="flex-1 accent-pink-500" />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-zinc-400">Tương phản</span>
            <input type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="flex-1 accent-pink-500" />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-zinc-400">Bão hòa</span>
            <input type="range" min={0} max={200} value={saturate} onChange={(e) => setSaturate(Number(e.target.value))} className="flex-1 accent-pink-500" />
          </div>
        </div>
      </div>
    );
  }

  if (viewerItem) {
    return (
      <div className="flex-1 flex flex-col bg-black text-white overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <button onClick={() => setViewerItem(null)} className="flex items-center gap-1 text-xs">
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại</span>
          </button>
          <span className="text-xs font-medium truncate max-w-[160px]">{viewerItem.title}</span>
          <button
            onClick={async () => {
              await osApi.updateMedia(viewerItem.id, { is_favorite: viewerItem.is_favorite ? 0 : 1 });
              setViewerItem({ ...viewerItem, is_favorite: viewerItem.is_favorite ? 0 : 1 });
              refreshData();
            }}
          >
            <Heart className={`w-4 h-4 ${viewerItem.is_favorite ? 'fill-pink-500 text-pink-500' : ''}`} />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
          {viewerItem.type === 'video' ? (
            <video src={viewerItem.data_url} controls className="max-h-full max-w-full rounded-xl" />
          ) : (
            <img src={viewerItem.data_url} alt={viewerItem.title} className="max-h-full max-w-full object-contain rounded-xl" />
          )}
        </div>

        <div className="p-3 bg-zinc-900 border-t border-white/10 flex items-center justify-around text-[11px]">
          <button
            onClick={() =>
              openShareSheet({
                title: viewerItem.title,
                text: viewerItem.title,
                mediaUrl: viewerItem.data_url,
                mediaType: viewerItem.type,
              })
            }
            className="flex flex-col items-center gap-1"
          >
            <Share2 className="w-4 h-4 text-sky-400" />
            <span>Chia sẻ</span>
          </button>
          {viewerItem.type === 'photo' && (
            <>
              <button
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturate(100);
                  setEditingItem(viewerItem);
                }}
                className="flex flex-col items-center gap-1"
              >
                <Sliders className="w-4 h-4 text-pink-400" />
                <span>Sửa</span>
              </button>
              <button
                onClick={async () => {
                  await updateProfile({ wallpaper: viewerItem.data_url });
                  showToast('Đã đặt hình nền chính', 'Đã áp dụng cho Màn hình chính', 'success');
                }}
                className="flex flex-col items-center gap-1"
              >
                <Wallpaper className="w-4 h-4 text-purple-400" />
                <span>Màn chính</span>
              </button>
              <button
                onClick={async () => {
                  await updateProfile({ lock_wallpaper: viewerItem.data_url });
                  showToast('Đã đặt nền khóa', 'Đã áp dụng cho Màn hình khóa', 'success');
                }}
                className="flex flex-col items-center gap-1"
              >
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Màn khóa</span>
              </button>
              <button
                onClick={async () => {
                  const order = ['center', 'top', 'bottom'] as const;
                  const cur = (data.profile.wallpaper_pos || 'center') as (typeof order)[number];
                  const next = order[(order.indexOf(cur) + 1) % order.length];
                  await updateProfile({ wallpaper_pos: next });
                  showToast('Căn chỉnh hình nền', `Vị trí khung: ${next}`, 'info');
                }}
                className="flex flex-col items-center gap-1"
              >
                <Maximize2 className="w-4 h-4 text-emerald-400" />
                <span>Khung ({data.profile.wallpaper_pos || 'center'})</span>
              </button>
            </>
          )}
          <button
            onClick={async () => {
              if (viewerItem.is_deleted) {
                requestConfirm({
                  title: 'Xóa vĩnh viễn?',
                  message: 'Thao tác này không thể hoàn tác.',
                  destructive: true,
                  onConfirm: async () => {
                    await osApi.deleteMedia(viewerItem.id);
                    setViewerItem(null);
                    refreshData();
                  },
                });
              } else {
                await osApi.updateMedia(viewerItem.id, { is_deleted: 1, deleted_at: new Date().toISOString() });
                setViewerItem(null);
                refreshData();
                showToast('Đã chuyển vào Thùng rác', 'Xem lại trong mục Đã xóa gần đây');
              }
            }}
            className="flex flex-col items-center gap-1 text-rose-400"
          >
            <Trash2 className="w-4 h-4" />
            <span>{viewerItem.is_deleted ? 'Xóa hẳn' : 'Xóa'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold">{albumFilter ? albumFilter : 'Ảnh'}</h1>
            {albumFilter && (
              <button onClick={() => setAlbumFilter(null)} className="text-[11px] text-pink-500">
                ← Tất cả Album
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <label className="p-2 rounded-xl bg-pink-500/15 text-pink-500 cursor-pointer" title="Nhập Ảnh/Video">
              <Upload className="w-4 h-4" />
              <input type="file" accept="image/*,video/*" onChange={handleUploadPhoto} className="hidden" />
            </label>
            <button onClick={() => openApp('camera')} className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-xs font-semibold">
              Máy ảnh
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm ảnh, album..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {[
            { id: 'all' as const, label: 'Tất cả' },
            { id: 'screenshots' as const, label: 'Ảnh chụp màn hình' },
            { id: 'ai' as const, label: 'Ảnh AI' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryChip(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                categoryChip === c.id ? 'bg-pink-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3">
        {tab === 'albums' && !albumFilter ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {albums.map(([name, list]) => (
              <button
                key={name}
                onClick={() => setAlbumFilter(name)}
                className="rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 overflow-hidden text-left"
              >
                <img src={list[0]?.data_url} alt="" className="w-full aspect-[4/3] object-cover" />
                <div className="p-2.5">
                  <p className="text-xs font-semibold truncate">{name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono-num">{list.length} mục</p>
                </div>
              </button>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 py-14">Không có nội dung nào trong mục này.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {items.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 group">
                <button onClick={() => setViewerItem(m)} className="w-full h-full">
                  {m.type === 'video' ? (
                    <video src={m.data_url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={m.data_url} alt={m.title} className="w-full h-full object-cover" />
                  )}
                </button>
                {m.is_deleted === 1 && (
                  <button
                    onClick={async () => {
                      await osApi.updateMedia(m.id, { is_deleted: 0 });
                      refreshData();
                      showToast('Đã khôi phục', `Đã khôi phục ${m.title}`);
                    }}
                    className="absolute bottom-1 right-1 p-1.5 rounded-full bg-black/70 text-white"
                    title="Khôi phục"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1A1A22] py-2 text-[10px] font-medium shrink-0">
        {([
          { id: 'photos', label: 'Ảnh' },
          { id: 'albums', label: 'Album' },
          { id: 'favorites', label: 'Yêu thích' },
          { id: 'videos', label: 'Video' },
          { id: 'trash', label: 'Đã xóa' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setAlbumFilter(null);
              setTab(t.id);
            }}
            className={`${tab === t.id ? 'text-pink-500 font-semibold' : 'text-zinc-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
