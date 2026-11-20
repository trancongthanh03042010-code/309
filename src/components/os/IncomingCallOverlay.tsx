import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Pause,
  Send,
  MessageSquare,
  Sparkles,
  Video,
  VideoOff,
  Radio,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { osApi } from '../../services/api';
import { useDraggablePopup } from './useDraggablePopup';

const CALL_VOICES = ['Kore', 'Zephyr', 'Aoede', 'Fenrir', 'Puck'];

export function IncomingCallOverlay() {
  const {
    data,
    activeCall,
    answerCall,
    endCall,
    toggleCallMute,
    toggleCallSpeaker,
    toggleCallHold,
    toggleCallCamera,
    openApp,
    showToast,
  } = useOS();

  const [elapsed, setElapsed] = useState(0);
  const [voiceInput, setVoiceInput] = useState('');
  const [aiTranscript, setAiTranscript] = useState<Array<{ who: string; text: string }>>([]);
  const [emotionTag, setEmotionTag] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [voiceName, setVoiceName] = useState('Kore');
  const [recordingMic, setRecordingMic] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const selfViewDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 8,
    resetKey: `${activeCall?.id ?? ''}-${activeCall?.isVideo ? 'v' : 'a'}-${activeCall?.cameraOff ? 'off' : 'on'}`,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef<Array<{ who: string; text: string }>>([]);
  const elapsedRef = useRef(0);

  const char = activeCall?.characterId
    ? data?.characters.find((c) => c.id === activeCall.characterId)
    : undefined;

  const conv = activeCall?.characterId
    ? data?.conversations.find((c) => c.character_id === activeCall.characterId && !c.is_group)
    : undefined;

  useEffect(() => {
    if (char?.voice_name) {
      setVoiceName(char.voice_name);
    }
  }, [char?.voice_name]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') {
      setElapsed(0);
      elapsedRef.current = 0;
      setAiTranscript([]);
      transcriptRef.current = [];
      setEmotionTag('');
      return;
    }
    const id = setInterval(() => {
      const next = Math.floor((Date.now() - activeCall.startedAt) / 1000);
      setElapsed(next);
      elapsedRef.current = next;
    }, 1000);
    return () => clearInterval(id);
  }, [activeCall]);

  // Real user webcam preview during Video Call when camera is ON
  useEffect(() => {
    const stopCam = () => {
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (!activeCall || !activeCall.isVideo || activeCall.status !== 'connected' || activeCall.cameraOff) {
      stopCam();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Trình duyệt không hỗ trợ Camera trực tiếp.');
      return;
    }

    let cancelled = false;
    setCameraError('');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        camStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Chưa được cấp quyền Camera (đang dùng khung hình thay thế).');
        }
      });

    return () => {
      cancelled = true;
      stopCam();
    };
  }, [activeCall]);

  // Cleanup audio on unmount or call close
  useEffect(() => {
    if (!activeCall && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
  }, [activeCall]);

  if (!activeCall) return null;

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const playBase64WithSpeed = (base64Wav: string) => {
    if (!base64Wav) return;
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
      audio.playbackRate = playbackSpeed;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      audioPlayerRef.current = audio;
      setSpeaking(true);
      audio.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  };

  const handleCallTurn = async (payload: { text?: string; audioDataUrl?: string; mimeType?: string }) => {
    if (!activeCall.characterId) return;
    if (payload.text) {
      setVoiceInput('');
      const next = [...transcriptRef.current, { who: 'Bạn', text: payload.text }];
      transcriptRef.current = next;
      setAiTranscript(next);
    }
    setSpeaking(true);
    try {
      const res = await osApi.messagesV3.callTurn({
        character_id: activeCall.characterId,
        conversation_id: conv?.id,
        text: payload.text,
        audioDataUrl: payload.audioDataUrl,
        mimeType: payload.mimeType,
        voiceName,
        withAudio: activeCall.speaker,
      });

      const updatedLines = [...transcriptRef.current];
      if (!payload.text && res.transcript) {
        updatedLines.push({ who: 'Bạn', text: res.transcript });
      }
      if (res.reply) {
        updatedLines.push({ who: activeCall.name, text: res.reply });
      }
      transcriptRef.current = updatedLines;
      setAiTranscript(updatedLines);
      if (res.emotionTag) setEmotionTag(res.emotionTag);

      if (res.audioBase64 && activeCall.speaker) {
        playBase64WithSpeed(res.audioBase64);
      } else {
        setSpeaking(false);
      }
    } catch (err) {
      setSpeaking(false);
      showToast('Cuộc gọi AI', err instanceof Error ? err.message : 'Lỗi kết nối giọng nói AI', 'error');
    }
  };

  const toggleVoiceCapture = async () => {
    if (recordingMic) {
      mediaRecorderRef.current?.stop();
      setRecordingMic(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      // Fallback to SpeechRecognition if MediaRecorder unavailable
      const SpeechRec =
        (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
      if (!SpeechRec) {
        showToast('Micro', 'Trình duyệt không hỗ trợ ghi âm. Hãy nhập lời thoại bên dưới.');
        return;
      }
      try {
        const rec = new SpeechRec() as {
          lang: string;
          onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
          start: () => void;
        };
        rec.lang = 'vi-VN';
        rec.onresult = (e) => {
          const transcript = e.results[0]?.[0]?.transcript;
          if (transcript) void handleCallTurn({ text: transcript });
        };
        rec.start();
      } catch {
        showToast('Micro', 'Không thể khởi động nhận dạng giọng nói.');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            void handleCallTurn({ audioDataUrl: reader.result, mimeType });
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecordingMic(true);
    } catch {
      showToast('Chưa có quyền Micro', 'Hãy cấp quyền Micro để trò chuyện bằng giọng nói.', 'error');
    }
  };

  const handleEndCallWithSession = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (activeCall.status === 'connected' && activeCall.isAi && activeCall.characterId) {
      void osApi.messagesV3
        .saveCallSession({
          character_id: activeCall.characterId,
          call_type: activeCall.isVideo ? 'video' : 'voice',
          duration_sec: elapsedRef.current,
          transcript: transcriptRef.current,
          emotion_summary: emotionTag || char?.mood || 'Tự nhiên',
        })
        .catch(() => {});
    }
    endCall();
  };

  const isVideoMode = Boolean(activeCall.isVideo);

  return (
    <div className="absolute inset-0 z-50 bg-gradient-to-b from-[#1a1330] via-[#100e1c] to-[#08070f] text-white flex flex-col justify-between p-4 overflow-hidden">
      {/* Animated AI Avatar Visual Backdrop in Video Mode */}
      {isVideoMode && (
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={char?.cover_image || activeCall.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
            alt=""
            className={`w-full h-full object-cover opacity-40 transition-transform duration-700 ${
              speaking ? 'scale-105 brightness-110' : 'scale-100'
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/40 to-black/90" />
        </div>
      )}

      {/* Real User Camera Self-View PiP in Video Mode */}
      {isVideoMode && activeCall.status === 'connected' && !activeCall.cameraOff && (
        <div
          ref={selfViewDrag.popupRef}
          style={{ ...selfViewDrag.popupStyle, ...selfViewDrag.handleProps.style }}
          onPointerDown={selfViewDrag.handleProps.onPointerDown}
          onDoubleClick={selfViewDrag.handleProps.onDoubleClick}
          title="Kéo để di chuyển khung camera"
          className="absolute top-4 right-4 z-20 w-24 h-32 rounded-2xl overflow-hidden border border-white/25 bg-black/70 shadow-2xl cursor-grab active:cursor-grabbing select-none"
        >
          {cameraError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center text-[9px] text-zinc-300">
              <Video className="w-4 h-4 mb-1 text-violet-300" />
              <span>{cameraError}</span>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1] pointer-events-none" />
          )}
        </div>
      )}

      {/* Caller Header */}
      <div className="relative z-10 flex flex-col items-center text-center pt-3">
        {isVideoMode && (
          <span className="mb-2 px-2.5 py-0.5 rounded-full bg-violet-500/30 border border-violet-400/40 text-[10px] font-semibold text-violet-200">
            Avatar AI trực quan (không phải video người thật)
          </span>
        )}
        <div className="relative">
          <img
            src={activeCall.avatar || '/src/assets/images/char_yuki_1794880089308.jpg'}
            alt={activeCall.name}
            className={`${isVideoMode ? 'w-20 h-20' : 'w-24 h-24'} rounded-full object-cover ring-4 transition-all ${
              speaking ? 'ring-emerald-400 scale-105' : 'ring-violet-400/45'
            } shadow-2xl`}
          />
          {activeCall.isAi && (
            <span className="absolute -bottom-1 right-0 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 text-[10px] font-bold">
              {isVideoMode ? 'Avatar AI' : 'Thoại AI'}
            </span>
          )}
        </div>
        <h2 className="font-display text-xl font-bold mt-2.5">{activeCall.name}</h2>
        <p className="text-xs text-zinc-300 mt-0.5">
          {emotionTag ? `Cảm xúc: ${emotionTag}` : char?.activity_status || activeCall.phone}
        </p>
        <p className="text-sm font-mono-num text-emerald-400 mt-1">
          {activeCall.status === 'incoming'
            ? isVideoMode
              ? 'Cuộc gọi Video AI đến...'
              : 'Cuộc gọi thoại AI đến...'
            : activeCall.onHold
              ? 'Đang giữ cuộc gọi'
              : formatDuration(elapsed)}
        </p>
      </div>

      {/* Live Voice Call Transcript & Voice Tuning */}
      {activeCall.status === 'connected' && activeCall.isAi && (
        <div className="relative z-10 flex-1 my-3 rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 p-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-200 pb-2 border-b border-white/10">
            <span className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="bg-black/35 rounded-lg px-2 py-0.5 text-[10px] outline-none border border-white/10"
              >
                {CALL_VOICES.map((v) => (
                  <option key={v} value={v}>
                    Giọng {v}
                  </option>
                ))}
              </select>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {speaking && <span className="text-emerald-300 text-[10px] animate-pulse">Đang nói...</span>}
              <button
                onClick={() => {
                  const next: 1 | 1.25 | 1.5 = playbackSpeed === 1 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : 1;
                  setPlaybackSpeed(next);
                  if (audioPlayerRef.current) audioPlayerRef.current.playbackRate = next;
                }}
                className="px-2 py-0.5 rounded-lg bg-white/15 font-mono-num text-[10px]"
              >
                {playbackSpeed}x
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto os-scroll py-2 space-y-2 text-xs">
            {aiTranscript.length === 0 ? (
              <p className="text-center text-zinc-300 mt-5 px-2 leading-relaxed">
                Nhấn nút Micro để nói trực tiếp bằng giọng thật, hoặc nhập lời thoại bên dưới để {activeCall.name} đáp lại bằng giọng AI.
              </p>
            ) : (
              aiTranscript.map((line, i) => (
                <div key={i} className={line.who === 'Bạn' ? 'text-right' : 'text-left'}>
                  <span className="text-[10px] text-zinc-400 block">{line.who}</span>
                  <span
                    className={`inline-block px-3 py-1.5 rounded-2xl mt-0.5 max-w-[88%] text-left ${
                      line.who === 'Bạn' ? 'bg-violet-600 text-white' : 'bg-white/15 text-zinc-100'
                    }`}
                  >
                    {line.text}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-1.5 pt-2">
            <button
              onClick={toggleVoiceCapture}
              className={`p-2 rounded-xl flex items-center gap-1 text-[11px] font-semibold ${
                recordingMic
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35'
              }`}
              title={recordingMic ? 'Dừng & Gửi giọng nói' : 'Ghi âm nói chuyện'}
            >
              {recordingMic ? <Radio className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {recordingMic && <span>Gửi</span>}
            </button>
            <input
              value={voiceInput}
              onChange={(e) => setVoiceInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && voiceInput.trim() && void handleCallTurn({ text: voiceInput })}
              placeholder="Hoặc nhập lời muốn nói..."
              className="flex-1 px-3 py-2 rounded-xl bg-black/45 border border-white/15 text-xs outline-none"
            />
            <button
              disabled={!voiceInput.trim()}
              onClick={() => voiceInput.trim() && void handleCallTurn({ text: voiceInput })}
              className="p-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Call Action Controls */}
      {activeCall.status === 'incoming' ? (
        <div className="relative z-10 space-y-6 pb-4">
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => {
                handleEndCallWithSession();
                if (conv) openApp('messages', { conversationId: conv.id });
              }}
              className="flex flex-col items-center gap-1.5 text-xs text-zinc-300"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span>Nhắn tin</span>
            </button>
          </div>
          <div className="flex items-center justify-around">
            <button
              onClick={handleEndCallWithSession}
              className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-lg"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button
              onClick={answerCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg"
            >
              {isVideoMode ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 space-y-3 pb-2">
          <div className={`grid ${isVideoMode ? 'grid-cols-4' : 'grid-cols-3'} gap-2.5 max-w-[300px] mx-auto`}>
            <button
              onClick={toggleCallMute}
              className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] ${
                activeCall.muted ? 'bg-white text-black' : 'bg-white/10 text-white'
              }`}
            >
              {activeCall.muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              <span>Tắt mic</span>
            </button>
            <button
              onClick={toggleCallSpeaker}
              className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] ${
                activeCall.speaker ? 'bg-white text-black' : 'bg-white/10 text-white'
              }`}
            >
              <Volume2 className="w-5 h-5" />
              <span>Loa AI</span>
            </button>
            <button
              onClick={toggleCallHold}
              className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] ${
                activeCall.onHold ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'
              }`}
            >
              <Pause className="w-5 h-5" />
              <span>Giữ</span>
            </button>
            {isVideoMode && (
              <button
                onClick={toggleCallCamera}
                className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] ${
                  activeCall.cameraOff ? 'bg-rose-500 text-white' : 'bg-white/10 text-white'
                }`}
              >
                {activeCall.cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                <span>Cam</span>
              </button>
            )}
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleEndCallWithSession}
              className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-xl"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
