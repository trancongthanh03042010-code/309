import React, { useRef, useState } from 'react';
import { Captions, Film, Maximize2, PictureInPicture2, Repeat, Upload } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

function srtToVtt(srt: string): string {
  const clean = srt.replace(/\r+/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${clean}`;
}

export function VideoPlayerApp() {
  const { data, refreshData, showToast } = useOS();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('');
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleName, setSubtitleName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!data) return null;

  const videos = data.media.filter((m) => m.type === 'video' && !m.is_deleted);

  const handleUploadVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      await osApi.createMedia({
        type: 'video',
        title: file.name,
        data_url: reader.result as string,
        album: 'Video',
      });
      setActiveUrl(reader.result as string);
      setActiveTitle(file.name);
      await refreshData();
      showToast('Đã nhập', `${file.name} đã sẵn sàng phát`);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const vttContent = file.name.toLowerCase().endsWith('.srt') ? srtToVtt(raw) : raw;
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
      setSubtitleUrl(URL.createObjectURL(blob));
      setSubtitleName(file.name);
      showToast('Đã nạp phụ đề', file.name, 'success');
    };
    reader.readAsText(file);
  };

  const toggleBrowserPiP = async () => {
    const vid = videoRef.current;
    if (!vid) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof vid.requestPictureInPicture === 'function') {
        await vid.requestPictureInPicture();
      } else {
        showToast('PiP', 'Trình duyệt hiện tại chưa hỗ trợ PiP cho video này.', 'info');
      }
    } catch {
      showToast('PiP không khả dụng', 'Không thể mở Picture-in-Picture trong khung này.', 'info');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#101014] text-white overflow-hidden">
      <div className="px-4 py-3 bg-[#1A1A22] border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-purple-400" />
          <h1 className="font-display text-lg font-bold">Trình phát Video</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-semibold flex items-center gap-1 cursor-pointer">
            <Captions className="w-3.5 h-3.5 text-amber-300" />
            <span>Phụ đề</span>
            <input type="file" accept=".vtt,.srt,text/vtt" onChange={handleUploadSubtitle} className="hidden" />
          </label>
          <label className="px-3 py-1.5 rounded-xl bg-purple-600 text-xs font-semibold flex items-center gap-1 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập video</span>
            <input type="file" accept="video/*" onChange={handleUploadVideo} className="hidden" />
          </label>
        </div>
      </div>

      <div className="p-3 bg-black shrink-0">
        {activeUrl ? (
          <div className="space-y-2">
            <video
              ref={videoRef}
              src={activeUrl}
              controls
              loop={loop}
              className="w-full aspect-video max-h-64 rounded-xl bg-black object-contain"
              onLoadedMetadata={() => {
                if (videoRef.current) videoRef.current.playbackRate = speed;
              }}
            >
              {subtitleUrl && <track kind="subtitles" src={subtitleUrl} srcLang="vi" label={subtitleName} default />}
            </video>
            <div className="flex items-center justify-between text-xs px-1 gap-2">
              <span className="truncate font-medium">
                {activeTitle} {subtitleName ? `· ${subtitleName}` : ''}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {[0.5, 1, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setSpeed(r);
                      if (videoRef.current) videoRef.current.playbackRate = r;
                    }}
                    className={`px-2 py-0.5 rounded ${speed === r ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                  >
                    {r}x
                  </button>
                ))}
                <button
                  onClick={() => setLoop((l) => !l)}
                  className={`p-1 rounded ${loop ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}
                  title="Lặp lại video"
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggleBrowserPiP}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Cửa sổ PiP"
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => videoRef.current?.requestFullscreen?.()}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Toàn màn hình"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video max-h-56 rounded-xl bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 text-xs">
            <Film className="w-8 h-8 mb-2 opacity-40" />
            <p>Chọn hoặc nhập một video để phát (.mp4/.webm + phụ đề .vtt/.srt)</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        <p className="text-[11px] text-zinc-400">Video đã lưu & đã quay</p>
        {videos.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">
            Chưa có video nào. Hãy quay bằng Máy ảnh hoặc nhập tệp ở trên.
          </p>
        ) : (
          videos.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setActiveUrl(v.data_url);
                setActiveTitle(v.title);
              }}
              className="w-full p-3 rounded-2xl bg-[#1A1A22] border border-zinc-800 flex items-center justify-between text-left"
            >
              <span className="text-xs font-semibold truncate">{v.title}</span>
              <span className="text-[10px] text-zinc-400">{new Date(v.created_at).toLocaleDateString('vi-VN')}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
