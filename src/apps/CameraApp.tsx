import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Video,
  RefreshCw,
  Grid3x3,
  Timer,
  Image,
  AlertCircle,
  Square,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

type CamMode = 'Photo' | 'Video' | 'Portrait' | 'Night';

export function CameraApp() {
  const { setCameraActive, openApp, refreshData, showToast, triggerShortcutEvent } = useOS();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mode, setMode] = useState<CamMode>('Photo');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [gridOn, setGridOn] = useState(true);
  const [timerSec, setTimerSec] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [filterCss, setFilterCss] = useState('none');
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [lastThumb, setLastThumb] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function startStream() {
      setCamError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError('API camera của thiết bị không khả dụng trên trình duyệt này.');
        return;
      }
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: mode === 'Video',
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setCameraActive(false);
        setCamError(
          err instanceof Error
            ? `Chưa có quyền truy cập hoặc phần cứng camera không khả dụng: ${err.message}`
            : 'Truy cập camera bị từ chối.'
        );
      }
    }
    startStream();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setCameraActive(false);
    };
  }, [facing, mode, setCameraActive]);

  useEffect(() => {
    if (!recording) {
      setRecordSec(0);
      return;
    }
    const id = setInterval(() => setRecordSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const capturePhotoNow = async () => {
    const vid = videoRef.current;
    if (!vid || !vid.videoWidth) {
      showToast('Máy ảnh', 'Cần luồng camera trực tiếp để chụp ảnh.', 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = mode === 'Night' ? 'brightness(1.25) contrast(1.1)' : filterCss;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setLastThumb(dataUrl);

    await osApi.createMedia({
      type: 'photo',
      title: `Anh_${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
      data_url: dataUrl,
      album: 'Máy ảnh',
    });
    await refreshData();
    await triggerShortcutEvent('photo_captured', 'Đã lưu ảnh mới vào Thư viện Ảnh');
    showToast('Đã chụp', 'Đã lưu vào Ảnh');
  };

  const handleShutter = () => {
    if (mode === 'Video') {
      if (recording) {
        recorderRef.current?.stop();
        setRecording(false);
      } else if (streamRef.current) {
        chunksRef.current = [];
        const rec = new MediaRecorder(streamRef.current);
        rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
        rec.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            await osApi.createMedia({
              type: 'video',
              title: `Video_${new Date().toLocaleTimeString('vi-VN')}`,
              data_url: dataUrl,
              album: 'Máy ảnh',
            });
            await refreshData();
            showToast('Đã lưu video', 'Đã thêm video vừa quay vào Ảnh');
          };
          reader.readAsDataURL(blob);
        };
        recorderRef.current = rec;
        rec.start();
        setRecording(true);
      }
      return;
    }

    if (timerSec > 0) {
      setCountdown(timerSec);
      const id = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(id);
            capturePhotoNow();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } else {
      capturePhotoNow();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-black text-white overflow-hidden select-none">
      {/* Top Camera Toolbar */}
      <div className="px-4 py-2.5 flex items-center justify-between bg-black/80 text-xs">
        <button onClick={() => setGridOn((g) => !g)} className={gridOn ? 'text-amber-400' : 'text-zinc-400'}>
          <Grid3x3 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setTimerSec((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10"
        >
          <Timer className="w-3.5 h-3.5" />
          <span>{timerSec === 0 ? 'Tắt' : `${timerSec} giây`}</span>
        </button>
        <select
          value={filterCss}
          onChange={(e) => setFilterCss(e.target.value)}
          className="bg-white/10 rounded-full px-2.5 py-1 text-xs outline-none"
        >
          <option value="none" className="text-black">Tự nhiên</option>
          <option value="grayscale(1)" className="text-black">Đơn sắc</option>
          <option value="sepia(0.6) contrast(1.05)" className="text-black">Phim ấm</option>
          <option value="saturate(1.35)" className="text-black">Rực rỡ</option>
        </select>
      </div>

      {/* Live Viewfinder */}
      <div className="relative flex-1 bg-zinc-950 flex items-center justify-center overflow-hidden">
        {camError ? (
          <div className="p-6 text-center space-y-3 max-w-xs">
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold">Cần Camera thật</p>
            <p className="text-xs text-zinc-400">{camError}</p>
            <button
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              className="px-4 py-2 rounded-xl bg-white/10 text-xs"
            >
              Thử lại Camera
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ filter: mode === 'Night' ? 'brightness(1.25)' : filterCss }}
          />
        )}

        {gridOn && !camError && (
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/15" />
            ))}
          </div>
        )}

        {countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-6xl font-bold font-mono-num">
            {countdown}
          </div>
        )}

        {recording && (
          <div className="absolute top-3 px-3 py-1 rounded-full bg-rose-600 text-xs font-mono-num font-bold">
            REC {String(Math.floor(recordSec / 60)).padStart(2, '0')}:{String(recordSec % 60).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Mode Switcher & Shutter */}
      <div className="bg-black px-4 py-3 space-y-3">
        <div className="flex items-center justify-center gap-4 text-xs">
          {([
            { id: 'Photo', label: 'Ảnh' },
            { id: 'Video', label: 'Video' },
            { id: 'Portrait', label: 'Chân dung' },
            { id: 'Night', label: 'Ban đêm' },
          ] as { id: CamMode; label: string }[]).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`font-semibold transition-colors ${mode === m.id ? 'text-amber-400' : 'text-zinc-400'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4">
          <button
            onClick={() => openApp('photos')}
            className="w-11 h-11 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center border border-white/20"
          >
            {lastThumb ? <img src={lastThumb} alt="" className="w-full h-full object-cover" /> : <Image className="w-5 h-5" />}
          </button>

          <button
            onClick={handleShutter}
            className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 ${
              mode === 'Video' ? 'bg-rose-500' : 'bg-white/20'
            }`}
          >
            {mode === 'Video' ? (
              recording ? <Square className="w-6 h-6 fill-white" /> : <Video className="w-6 h-6" />
            ) : (
              <Camera className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center"
            title="Đổi Camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
