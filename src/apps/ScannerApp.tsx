import React, { useState } from 'react';
import { ScanText, Upload, RotateCw, Sparkles, FileText, Share2 } from 'lucide-react';
import { osApi } from '../services/api';
import { useOS } from '../context/OSContext';

export function ScannerApp() {
  const { refreshData, openShareSheet, showToast, openApp } = useOS();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [bwMode, setBwMode] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageUrl(reader.result as string);
      setOcrText('');
    };
    reader.readAsDataURL(file);
  };

  const handleRunOcr = async () => {
    if (!imageUrl) return;
    setLoading(true);
    try {
      const res = await osApi.ocr(imageUrl);
      setOcrText(res.text);
      showToast('Hoàn tất OCR', 'Đã trích xuất văn bản từ tài liệu');
    } catch (err) {
      showToast('Lỗi OCR', err instanceof Error ? err.message : 'Trích xuất thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToNotes = async () => {
    if (!ocrText.trim()) return;
    await osApi.createNote({
      title: `Tài liệu đã quét (${new Date().toLocaleDateString('vi-VN')})`,
      content: ocrText,
      folder: 'Công việc',
    });
    await refreshData();
    showToast('Đã lưu vào Ghi chú', 'Đã lưu nội dung tài liệu vừa quét');
    openApp('notes');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanText className="w-4 h-4 text-emerald-500" />
          <h1 className="font-display text-lg font-bold">Máy quét & OCR</h1>
        </div>
        <label className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          <span>Tải trang</span>
          <input type="file" accept="image/*" onChange={handleUploadDoc} className="hidden" />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3">
        {!imageUrl ? (
          <div className="h-56 rounded-3xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-center p-6 text-xs text-zinc-500">
            <ScanText className="w-10 h-10 mb-2 text-emerald-500 opacity-70" />
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">Tải lên ảnh tài liệu hoặc hóa đơn</p>
            <p className="mt-1">Tăng độ nét, xoay trang và trích xuất văn bản bằng Gemini Vision OCR.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-black/90 p-3 flex items-center justify-center overflow-hidden">
              <img
                src={imageUrl}
                alt="Tài liệu đã quét"
                className="max-h-56 object-contain transition-transform"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  filter: bwMode ? 'grayscale(1) contrast(1.4) brightness(1.08)' : 'none',
                }}
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-1"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Xoay</span>
              </button>
              <button
                onClick={() => setBwMode((b) => !b)}
                className={`px-3 py-2 rounded-xl border ${
                  bwMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-[#1A1A22] border-zinc-200 dark:border-zinc-800'
                }`}
              >
                Quét Đen/Trắng
              </button>
              <button
                onClick={handleRunOcr}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-[#A78BFA] text-white font-semibold flex items-center justify-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{loading ? 'Đang đọc...' : 'Trích xuất chữ (OCR)'}</span>
              </button>
            </div>
          </>
        )}

        {ocrText && (
          <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
            <textarea
              rows={6}
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              className="w-full bg-transparent text-xs outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveToNotes}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Lưu vào Ghi chú</span>
              </button>
              <button
                onClick={() => openShareSheet({ title: 'Văn bản đã quét', text: ocrText })}
                className="px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Chia sẻ</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
