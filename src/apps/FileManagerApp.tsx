import React, { useState } from 'react';
import {
  Folder,
  FileText,
  Upload,
  Search,
  Star,
  Trash2,
  Download,
  Share2,
  X,
  Plus,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { FileItem } from '../types/os';

const FOLDERS = [
  { id: 'All', label: 'Tất cả' },
  { id: 'Tài liệu', label: 'Tài liệu' },
  { id: 'Tải xuống', label: 'Tải xuống' },
  { id: 'Hình ảnh', label: 'Hình ảnh' },
  { id: 'Âm thanh', label: 'Âm thanh' },
  { id: 'Trash', label: 'Thùng rác' },
];

export function FileManagerApp() {
  const { data, refreshData, openShareSheet, showToast, requestConfirm } = useOS();
  const [folder, setFolder] = useState('All');
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [creatingText, setCreatingText] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');

  if (!data) return null;

  const list = data.files.filter((f) => {
    if (folder === 'Trash') return f.folder === 'Trash';
    if (f.folder === 'Trash') return false;
    if (folder !== 'All' && f.folder !== folder) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const isText = file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json');
      await osApi.createFile({
        name: file.name,
        folder: file.type.startsWith('image/')
          ? 'Hình ảnh'
          : file.type.startsWith('audio/')
          ? 'Âm thanh'
          : 'Tải xuống',
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        content_text: isText ? String(reader.result) : '',
        data_url: isText ? '' : String(reader.result),
      });
      await refreshData();
      showToast('Đã tải lên', `Đã lưu ${file.name} vào Tệp`);
    };
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadToDisk = (file: FileItem) => {
    const href = file.data_url || `data:text/plain;charset=utf-8,${encodeURIComponent(file.content_text)}`;
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    a.click();
  };

  const folderLabel = FOLDERS.find((f) => f.id === folder)?.label || folder;

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">Tệp</h1>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setCreatingText(true)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800" title="Tạo tệp văn bản mới">
              <Plus className="w-4 h-4" />
            </button>
            <label className="p-2 rounded-xl bg-cyan-500 text-white cursor-pointer" title="Tải tệp lên">
              <Upload className="w-4 h-4" />
              <input type="file" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm tệp..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                folder === f.id ? 'bg-cyan-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {list.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-14">Không có tệp nào trong {folderLabel}.</p>
        ) : (
          list.map((f) => (
            <div
              key={f.id}
              className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2"
            >
              <button onClick={() => setPreviewFile(f)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shrink-0">
                  {f.mime_type.includes('folder') ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{f.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono-num">
                    {f.folder} · {(f.size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    await osApi.updateFile(f.id, { is_favorite: f.is_favorite ? 0 : 1 });
                    refreshData();
                  }}
                  className="p-1.5"
                >
                  <Star className={`w-3.5 h-3.5 ${f.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'}`} />
                </button>
                <button
                  onClick={() =>
                    requestConfirm({
                      title: 'Xóa tệp?',
                      message: `Xóa ${f.name}?`,
                      destructive: true,
                      onConfirm: async () => {
                        await osApi.deleteFile(f.id);
                        refreshData();
                      },
                    })
                  }
                  className="p-1.5 text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {previewFile && (
        <div className="absolute inset-0 z-40 bg-black/65 flex items-end p-3">
          <div className="w-full max-h-[80%] rounded-3xl bg-white dark:bg-[#1A1A22] p-4 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold truncate">{previewFile.name}</h3>
              <button onClick={() => setPreviewFile(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto os-scroll rounded-xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs">
              {previewFile.data_url && previewFile.mime_type.startsWith('image/') ? (
                <img src={previewFile.data_url} alt="" className="max-h-60 mx-auto rounded-lg" />
              ) : previewFile.data_url && previewFile.mime_type.startsWith('audio/') ? (
                <audio src={previewFile.data_url} controls className="w-full" />
              ) : previewFile.data_url && previewFile.mime_type.startsWith('video/') ? (
                <video src={previewFile.data_url} controls className="w-full max-h-60 rounded-lg" />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[11px]">
                  {previewFile.content_text || 'Tệp nhị phân sẵn sàng tải xuống.'}
                </pre>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadToDisk(previewFile)}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải xuống</span>
              </button>
              <button
                onClick={() =>
                  openShareSheet({
                    title: previewFile.name,
                    text: previewFile.content_text || previewFile.name,
                    mediaUrl: previewFile.data_url || undefined,
                  })
                }
                className="flex-1 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center justify-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Chia sẻ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingText && (
        <div className="absolute inset-0 z-40 bg-black/65 flex items-end p-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              await osApi.createFile({
                name: newName.endsWith('.txt') ? newName : `${newName}.txt`,
                folder: 'Tài liệu',
                mime_type: 'text/plain',
                size_bytes: newBody.length,
                content_text: newBody,
              });
              setCreatingText(false);
              setNewName('');
              setNewBody('');
              refreshData();
            }}
            className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Tài liệu văn bản mới</h3>
              <button type="button" onClick={() => setCreatingText(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên tệp (vd: ghi_chu.txt)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
            />
            <textarea
              rows={4}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Nội dung..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-cyan-500 text-white font-semibold">
              Lưu tệp
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
