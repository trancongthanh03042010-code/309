import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Droplets,
  Footprints,
  Moon,
  Scale,
  Plus,
  Trash2,
  Play,
  Square,
  Flame,
  Info,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

type HealthTab = 'today' | 'workout' | 'history';

const WORKOUT_LABELS: Record<'Walking' | 'Running' | 'Cycling', string> = {
  Walking: 'Đi bộ',
  Running: 'Chạy bộ',
  Cycling: 'Đạp xe',
};

const LOG_TYPE_LABELS: Record<string, string> = {
  steps: 'Bước chân',
  water: 'Nước uống',
  sleep: 'Giấc ngủ',
  weight: 'Cân nặng',
  workout: 'Tập luyện',
};

export function HealthFitnessApp() {
  const { data, refreshData, showToast, requestConfirm } = useOS();
  const [tab, setTab] = useState<HealthTab>('today');

  // Workout timer state
  const [workoutType, setWorkoutType] = useState<'Walking' | 'Running' | 'Cycling'>('Walking');
  const [workoutRunning, setWorkoutRunning] = useState(false);
  const [workoutSec, setWorkoutSec] = useState(0);

  // Quick manual inputs
  const [stepsInput, setStepsInput] = useState('1200');
  const [sleepInput, setSleepInput] = useState('7.5');
  const [weightInput, setWeightInput] = useState('64.0');

  // Optional DeviceMotion step counter (only active when user explicitly enables it and browser supports it)
  const [motionTracking, setMotionTracking] = useState(false);
  const [sessionMotionSteps, setSessionMotionSteps] = useState(0);
  const lastPeakRef = useRef<number>(0);

  useEffect(() => {
    if (!workoutRunning) return;
    const id = setInterval(() => setWorkoutSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [workoutRunning]);

  useEffect(() => {
    if (!motionTracking) return;
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      showToast('Không có cảm biến chuyển động', 'Trình duyệt này không hỗ trợ sự kiện gia tốc kế.', 'error');
      setMotionTracking(false);
      return;
    }
    const onMotion = (ev: DeviceMotionEvent) => {
      const acc = ev.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      const now = Date.now();
      if (mag > 13.5 && now - lastPeakRef.current > 350) {
        lastPeakRef.current = now;
        setSessionMotionSteps((prev) => prev + 1);
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [motionTracking, showToast]);

  const logs = data?.healthLogs || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const todayLogs = logs.filter((l) => l.logged_at.startsWith(todayStr));
    const steps = todayLogs.filter((l) => l.log_type === 'steps').reduce((s, l) => s + l.value_num, 0);
    const water = todayLogs.filter((l) => l.log_type === 'water').reduce((s, l) => s + l.value_num, 0);
    const sleep = logs.find((l) => l.log_type === 'sleep')?.value_num ?? 0;
    const weight = logs.find((l) => l.log_type === 'weight')?.value_num ?? 0;
    const workoutMins = todayLogs
      .filter((l) => l.log_type === 'workout')
      .reduce((s, l) => s + l.value_num, 0);
    return { steps, water, sleep, weight, workoutMins };
  }, [logs, todayStr]);

  const stepGoal = 8000;
  const waterGoal = 2000;
  const stepPct = Math.min(100, Math.round((summary.steps / stepGoal) * 100));
  const waterPct = Math.min(100, Math.round((summary.water / waterGoal) * 100));

  const logEntry = async (
    log_type: 'steps' | 'water' | 'sleep' | 'weight' | 'workout',
    value_num: number,
    unit: string,
    label: string
  ) => {
    await osApi.createHealthLog({ log_type, value_num, unit, label });
    await refreshData();
  };

  const handleFinishWorkout = async () => {
    setWorkoutRunning(false);
    const mins = Math.max(1, Math.round(workoutSec / 60));
    await logEntry('workout', mins, 'phút', `Buổi ${WORKOUT_LABELS[workoutType].toLowerCase()}`);
    setWorkoutSec(0);
    showToast('Đã lưu buổi tập', `Đã ghi nhận ${mins} phút ${WORKOUT_LABELS[workoutType].toLowerCase()}.`, 'success');
  };

  const handleSaveMotionSteps = async () => {
    if (sessionMotionSteps <= 0) return;
    await logEntry('steps', sessionMotionSteps, 'bước', 'Đi bộ (cảm biến chuyển động)');
    setSessionMotionSteps(0);
    setMotionTracking(false);
    showToast('Đã lưu bước chân', 'Đã ghi nhận số bước từ cảm biến chuyển động.', 'success');
  };

  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold font-display">Sức khỏe & Thể chất</h1>
            <p className="text-[11px] text-zinc-500">Nhật ký thủ công & đếm bước DeviceMotion tùy chọn</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
            Đồng bộ SQLite
          </span>
        </div>
        <div className="flex gap-1.5 mt-3">
          {(
            [
              { id: 'today', label: 'Hôm nay' },
              { id: 'workout', label: 'Luyện tập' },
              { id: 'history', label: 'Lịch sử' },
            ] as { id: HealthTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-[#A78BFA] text-white'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
        {tab === 'today' && (
          <>
            {/* Type B Non-medical Disclaimer & Quick Reminder */}
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2">
              <div className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                <span className="font-semibold">[Mô phỏng sức khỏe]</span> Chỉ theo dõi lối sống cá nhân, không thay thế tư vấn y tế chuyên môn.
              </div>
              <button
                onClick={async () => {
                  await osApi.createReminder({
                    title: 'Uống 250ml nước',
                    notes: 'Tạo từ Sức khỏe & Thể chất',
                    due_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
                    priority: 'medium',
                  });
                  await refreshData();
                  showToast('Đã đặt nhắc nhở', 'Nhắc uống nước sau 2 giờ', 'success');
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-500 text-white text-[10px] font-semibold"
              >
                Nhắc uống nước
              </button>
            </div>

            {/* Activity Rings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-zinc-200 dark:text-zinc-800"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      fill="none"
                      stroke="#A78BFA"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference - (stepPct / 100) * circumference}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Footprints className="w-4 h-4 text-[#A78BFA]" />
                    <span className="text-xs font-bold font-mono-num mt-0.5">{summary.steps}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold mt-1">Bước chân hôm nay</p>
                <p className="text-[10px] text-zinc-500">Mục tiêu {stepGoal.toLocaleString('vi-VN')}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-zinc-200 dark:text-zinc-800"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference - (waterPct / 100) * circumference}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Droplets className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold font-mono-num mt-0.5">{summary.water}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold mt-1">Lượng nước (ml)</p>
                <p className="text-[10px] text-zinc-500">Mục tiêu {waterGoal} ml</p>
              </div>
            </div>

            {/* Quick Hydration & Steps */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Ghi nhanh</h2>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await logEntry('water', 250, 'ml', 'Ly nước');
                    showToast('Nước uống', 'Đã thêm +250 ml nước.', 'success');
                  }}
                  className="flex-1 py-2 rounded-xl bg-sky-500/10 text-sky-500 text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> +250 ml Nước
                </button>
                <button
                  onClick={async () => {
                    await logEntry('water', 500, 'ml', 'Chai nước');
                    showToast('Nước uống', 'Đã thêm +500 ml chai nước.', 'success');
                  }}
                  className="flex-1 py-2 rounded-xl bg-sky-500/10 text-sky-500 text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> +500 ml Chai
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  value={stepsInput}
                  onChange={(e) => setStepsInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-mono-num outline-none"
                  placeholder="Số bước"
                />
                <button
                  onClick={async () => {
                    const n = parseInt(stepsInput, 10);
                    if (!n || n <= 0) return;
                    await logEntry('steps', n, 'bước', 'Đi bộ nhập tay');
                    showToast('Đã ghi bước chân', `Đã thêm +${n} bước.`, 'success');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold"
                >
                  Thêm bước
                </button>
              </div>
            </div>

            {/* Sleep & Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" /> Giấc ngủ
                  </span>
                  <span className="text-xs font-mono-num font-bold">{summary.sleep} giờ</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    value={sleepInput}
                    onChange={(e) => setSleepInput(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-xs font-mono-num"
                  />
                  <button
                    onClick={async () => {
                      const n = parseFloat(sleepInput);
                      if (!n || n <= 0) return;
                      await logEntry('sleep', n, 'giờ', 'Ngủ ban đêm');
                      showToast('Đã ghi giấc ngủ', `Đã lưu ${n} giờ ngủ.`, 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-[11px] font-semibold"
                  >
                    Ghi
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-pink-400" /> Cân nặng
                  </span>
                  <span className="text-xs font-mono-num font-bold">{summary.weight || '—'} kg</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-xs font-mono-num"
                  />
                  <button
                    onClick={async () => {
                      const n = parseFloat(weightInput);
                      if (!n || n <= 0) return;
                      await logEntry('weight', n, 'kg', 'Cân nặng cơ thể');
                      showToast('Đã ghi cân nặng', `Đã lưu ${n} kg.`, 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-pink-500 text-white text-[11px] font-semibold"
                  >
                    Ghi
                  </button>
                </div>
              </div>
            </div>

            {/* Optional Hardware Motion Sensor */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" /> Đếm bước gia tốc trực tiếp
                </span>
                <span className="text-xs font-mono-num font-bold">{sessionMotionSteps} bước</span>
              </div>
              <p className="text-[10px] text-zinc-500 flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Sử dụng sự kiện DeviceMotion thực tế khi trình duyệt di động hỗ trợ; tuyệt đối không tự tạo dữ liệu bước giả.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setMotionTracking((v) => !v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                    motionTracking ? 'bg-rose-500 text-white' : 'bg-emerald-500/15 text-emerald-500'
                  }`}
                >
                  {motionTracking ? 'Tạm dừng cảm biến' : 'Bật cảm biến chuyển động'}
                </button>
                {sessionMotionSteps > 0 && (
                  <button
                    onClick={handleSaveMotionSteps}
                    className="px-3 py-2 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold"
                  >
                    Lưu bước
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'workout' && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex gap-2">
              {(['Walking', 'Running', 'Cycling'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => !workoutRunning && setWorkoutType(w)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                    workoutType === w ? 'bg-[#A78BFA] text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {WORKOUT_LABELS[w]}
                </button>
              ))}
            </div>
            <div className="py-6 text-center space-y-1">
              <Flame className="w-7 h-7 text-amber-500 mx-auto" />
              <div className="text-4xl font-bold font-mono-num">
                {String(Math.floor(workoutSec / 60)).padStart(2, '0')}:
                {String(workoutSec % 60).padStart(2, '0')}
              </div>
              <p className="text-xs text-zinc-500">
                {WORKOUT_LABELS[workoutType]} · Vận động hôm nay: {summary.workoutMins} phút
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setWorkoutRunning((r) => !r)}
                className="flex-1 py-3 rounded-2xl bg-[#A78BFA] text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {workoutRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {workoutRunning ? 'Tạm dừng' : 'Bắt đầu tập'}
              </button>
              {workoutSec > 0 && (
                <button
                  onClick={handleFinishWorkout}
                  className="px-4 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-bold"
                >
                  Lưu buổi tập
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            {logs.length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-8">Chưa có dữ liệu sức khỏe nào.</p>
            )}
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-semibold">
                    {LOG_TYPE_LABELS[log.log_type] || log.log_type}: {log.value_num} {log.unit}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {log.label} · {new Date(log.logged_at).toLocaleString('vi-VN')}
                  </p>
                </div>
                <button
                  onClick={() =>
                    requestConfirm({
                      title: 'Xóa bản ghi?',
                      message: `Xóa mục ${LOG_TYPE_LABELS[log.log_type] || log.log_type} này?`,
                      destructive: true,
                      onConfirm: async () => {
                        await osApi.deleteHealthLog(log.id);
                        refreshData();
                      },
                    })
                  }
                  className="p-1.5 text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
