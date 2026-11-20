import React, { useEffect, useState } from 'react';
import { AlarmClock, Globe, Timer, Watch, Plus, Trash2, Play, Pause, RotateCcw, Flag } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

type Tab = 'alarm' | 'world' | 'stopwatch' | 'timer';

const TAB_LABELS: Record<Tab, string> = {
  alarm: 'Báo thức',
  world: 'Giờ thế giới',
  stopwatch: 'Bấm giờ',
  timer: 'Hẹn giờ',
};

export function ClockApp() {
  const { data, refreshData, timerSecondsLeft, timerRunning, startTimer, pauseTimer, resetTimer } = useOS();
  const [tab, setTab] = useState<Tab>('alarm');
  const [now, setNow] = useState(new Date());

  // Alarm form
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [alarmLabel, setAlarmLabel] = useState('Thức dậy');

  // World clock add
  const [cityChoice, setCityChoice] = useState('Asia/Seoul|Seoul');

  // Stopwatch
  const [swRunning, setSwRunning] = useState(false);
  const [swMs, setSwMs] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);

  // Timer input
  const [timerMins, setTimerMins] = useState(5);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!swRunning) return;
    const start = Date.now() - swMs;
    const id = setInterval(() => setSwMs(Date.now() - start), 50);
    return () => clearInterval(id);
  }, [swRunning]);

  if (!data) return null;

  const formatSw = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="font-display text-lg font-bold">{TAB_LABELS[tab]}</h1>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4">
        {tab === 'alarm' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs">
              <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} className="px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 font-mono-num" />
              <input value={alarmLabel} onChange={(e) => setAlarmLabel(e.target.value)} placeholder="Nhãn báo thức" className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none" />
              <button
                onClick={async () => {
                  await osApi.createAlarm({ time_str: alarmTime, label: alarmLabel });
                  refreshData();
                }}
                className="p-2 rounded-xl bg-amber-500 text-white"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {data.alarms.map((a) => (
              <div key={a.id} className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-mono-num font-bold">{a.time_str}</p>
                  <p className="text-xs text-zinc-500">{a.label} · {a.repeat_days}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={a.enabled === 1}
                    onChange={async (e) => {
                      await osApi.updateAlarm(a.id, { enabled: e.target.checked ? 1 : 0 });
                      refreshData();
                    }}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <button
                    onClick={async () => {
                      await osApi.deleteAlarm(a.id);
                      refreshData();
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'world' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={cityChoice}
                onChange={(e) => setCityChoice(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs"
              >
                <option value="Asia/Seoul|Seoul">Seoul</option>
                <option value="Asia/Singapore|Singapore">Singapore</option>
                <option value="Europe/Paris|Paris">Paris</option>
                <option value="America/Los_Angeles|Los Angeles">Los Angeles</option>
                <option value="Australia/Sydney|Sydney">Sydney</option>
              </select>
              <button
                onClick={async () => {
                  const [tz, city] = cityChoice.split('|');
                  await osApi.createWorldClock({ city, timezone: tz });
                  refreshData();
                }}
                className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold"
              >
                Thêm
              </button>
            </div>

            {data.worldClocks.map((wc) => {
              const cityTime = new Intl.DateTimeFormat('vi-VN', {
                timeZone: wc.timezone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(now);
              return (
                <div key={wc.id} className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{wc.city}</p>
                    <p className="text-[11px] text-zinc-500">{wc.timezone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-mono-num font-bold">{cityTime}</span>
                    <button
                      onClick={async () => {
                        await osApi.deleteWorldClock(wc.id);
                        refreshData();
                      }}
                      className="text-zinc-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'stopwatch' && (
          <div className="flex flex-col items-center space-y-5 pt-4">
            <div className="text-4xl font-mono-num font-bold tracking-tight">{formatSw(swMs)}</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSwRunning((r) => !r)}
                className="px-5 py-2.5 rounded-full bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {swRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{swRunning ? 'Tạm dừng' : 'Bắt đầu'}</span>
              </button>
              <button
                onClick={() => setLaps((l) => [swMs, ...l])}
                disabled={!swRunning}
                className="px-4 py-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Vòng</span>
              </button>
              <button
                onClick={() => {
                  setSwRunning(false);
                  setSwMs(0);
                  setLaps([]);
                }}
                className="p-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="w-full space-y-1.5">
              {laps.map((lap, i) => (
                <div key={i} className="flex justify-between px-3 py-2 rounded-xl bg-white dark:bg-[#1A1A22] text-xs font-mono-num">
                  <span>Vòng {laps.length - i}</span>
                  <span>{formatSw(lap)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'timer' && (
          <div className="flex flex-col items-center space-y-5 pt-4">
            <div className="text-5xl font-mono-num font-bold text-amber-500">
              {timerSecondsLeft > 0 ? formatTimer(timerSecondsLeft) : `${String(timerMins).padStart(2, '0')}:00`}
            </div>
            {timerSecondsLeft === 0 && (
              <div className="flex items-center gap-2">
                {[1, 3, 5, 10, 25].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTimerMins(m)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono-num font-semibold ${
                      timerMins === m ? 'bg-amber-500 text-white' : 'bg-white dark:bg-[#1A1A22]'
                    }`}
                  >
                    {m}p
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              {timerSecondsLeft === 0 ? (
                <button
                  onClick={() => startTimer(timerMins * 60)}
                  className="px-6 py-2.5 rounded-full bg-amber-500 text-white text-xs font-semibold"
                >
                  Bắt đầu hẹn giờ
                </button>
              ) : (
                <>
                  <button onClick={pauseTimer} className="px-5 py-2.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
                    {timerRunning ? 'Tạm dừng' : 'Tiếp tục'}
                  </button>
                  <button onClick={resetTimer} className="px-5 py-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                    Đặt lại
                  </button>
                </>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 text-center">
              Đồng hồ đếm ngược đồng bộ trực tiếp lên Dynamic Island trên toàn hệ thống.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1A1A22] py-2 shrink-0">
        {[
          { id: 'alarm' as Tab, label: 'Báo thức', icon: AlarmClock },
          { id: 'world' as Tab, label: 'Thế giới', icon: Globe },
          { id: 'stopwatch' as Tab, label: 'Bấm giờ', icon: Watch },
          { id: 'timer' as Tab, label: 'Hẹn giờ', icon: Timer },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 text-[10px] font-medium ${
                tab === t.id ? 'text-amber-500' : 'text-zinc-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
