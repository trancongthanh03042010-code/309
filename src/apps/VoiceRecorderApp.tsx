import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, FileText, Share2 } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

export function VoiceRecorderApp() {
  const { data, refreshData, setMicActive, openShareSheet, showToast } = useOS();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  if (!data) return null;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setMicActive(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          await osApi.createRecording({
            title: `GhiAm_${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
            duration_sec: seconds,
            data_url: reader.result as string,
            mime_type: 'audio/webm',
          });
          await refreshData();
          showToast('Đã lưu', 'Đã lưu bản ghi âm giọng nói');
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setMicActive(true);
      setRecording(true);
    } catch (err) {
      showToast('Cần Micro', err instanceof Error ? err.message : 'Quyền micro bị từ chối', 'error');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const handleTranscribe = async (id: string, dataUrl: string, mime: string) => {
    setTranscribingId(id);
    try {
      const res = await osApi.transcribe(dataUrl, mime);
      await osApi.updateRecording(id, { transcript: res.transcript });
      await refreshData();
      showToast('Đã chép lời', 'Đã chuyển âm thanh thành văn bản');
    } catch (err) {
      showToast('Lỗi chép lời', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setTranscribingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="font-display text-lg font-bold">Ghi âm</h1>
      </div>

      {/* Recorder Pad */}
      <div className="p-5 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex flex-col items-center space-y-3">
        <p className="text-3xl font-mono-num font-bold">
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
        </p>
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-transform active:scale-90 ${
            recording ? 'bg-zinc-900 dark:bg-white dark:text-black' : 'bg-rose-500'
          }`}
        >
          {recording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-7 h-7" />}
        </button>
        <p className="text-[11px] text-zinc-500">
          {recording ? 'Đang ghi âm từ micro...' : 'Chạm để ghi âm bằng micro thiết bị'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2.5">
        {data.recordings.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-10">Chưa có bản ghi âm nào.</p>
        ) : (
          data.recordings.map((rec) => (
            <div key={rec.id} className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold">{rec.title}</p>
                  <p className="text-[10px] text-zinc-500 font-mono-num">
                    {rec.duration_sec} giây · {new Date(rec.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTranscribe(rec.id, rec.data_url, rec.mime_type)}
                    disabled={transcribingId === rec.id}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-500 text-[10px] font-semibold flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    <span>{transcribingId === rec.id ? '...' : 'Chép lời AI'}</span>
                  </button>
                  <button
                    onClick={() => openShareSheet({ title: rec.title, text: rec.transcript || rec.title })}
                    className="p-1.5 text-zinc-400"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      await osApi.deleteRecording(rec.id);
                      refreshData();
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <audio src={rec.data_url} controls className="w-full h-8" />
              {rec.transcript && (
                <p className="text-[11px] p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">
                  {rec.transcript}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
