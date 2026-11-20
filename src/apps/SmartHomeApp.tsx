import React, { useState } from 'react';
import {
  Camera,
  Cpu,
  Fan,
  Lightbulb,
  Play,
  Plug,
  Power,
  ShieldAlert,
  Thermometer,
  Tv,
  Wind,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { SmartDevice } from '../types/os';

export function SmartHomeApp() {
  const { data, refreshData, showToast } = useOS();
  const [room, setRoom] = useState('Tất cả');
  const [camPreview, setCamPreview] = useState(false);

  const devices = data?.smartDevices || [];
  const scenes = data?.smartScenes || [];
  const logs = data?.smartLogs || [];

  const rooms = ['Tất cả', ...Array.from(new Set(devices.map((d) => d.room)))];
  const visibleDevices = room === 'Tất cả' ? devices : devices.filter((d) => d.room === room);

  const toggleDevice = async (dev: SmartDevice) => {
    await osApi.updateSmartDevice(dev.id, { is_on: dev.is_on ? 0 : 1 });
    await refreshData();
  };

  const changeValue = async (dev: SmartDevice, val: number) => {
    await osApi.updateSmartDevice(dev.id, { value_num: val });
    await refreshData();
  };

  const runScene = async (id: string, name: string) => {
    await osApi.runSmartScene(id);
    await refreshData();
    showToast('Nhà thông minh', `Đã kích hoạt kịch bản "${name}" (Mô phỏng)`, 'success');
  };

  const deviceIcon = (type: string) => {
    if (type === 'light') return <Lightbulb className="w-4 h-4 text-amber-400" />;
    if (type === 'ac') return <Thermometer className="w-4 h-4 text-sky-400" />;
    if (type === 'tv') return <Tv className="w-4 h-4 text-violet-400" />;
    if (type === 'fan') return <Fan className="w-4 h-4 text-emerald-400" />;
    if (type === 'curtain') return <Wind className="w-4 h-4 text-indigo-400" />;
    if (type === 'camera') return <Camera className="w-4 h-4 text-rose-400" />;
    return <Plug className="w-4 h-4 text-teal-400" />;
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-teal-500" />
            <h1 className="font-display font-bold text-base">Nhà thông minh</h1>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-300 font-semibold flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> IoT Mô phỏng
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pb-0.5">
          {rooms.map((r) => (
            <button
              key={r}
              onClick={() => setRoom(r)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                room === r ? 'bg-teal-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-4">
        {/* Automated Scenes */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase text-zinc-500">Kịch bản tự động</h2>
          <div className="grid grid-cols-2 gap-2">
            {scenes.map((scn) => (
              <div
                key={scn.id}
                className="p-2.5 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{scn.name}</p>
                  <p className="text-[10px] text-zinc-500">{scn.schedule_time}</p>
                </div>
                <button
                  onClick={() => runScene(scn.id, scn.name)}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-600 text-white text-[10px] font-bold flex items-center gap-1 shrink-0"
                >
                  <Play className="w-3 h-3" /> Chạy
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Simulated Hallway Camera Feed */}
        <div className="rounded-2xl bg-zinc-900 text-white border border-white/10 overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between text-xs border-b border-white/10">
            <span className="font-bold flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-rose-400" /> Camera Hành lang (Mô phỏng)
            </span>
            <button
              onClick={() => setCamPreview((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-semibold"
            >
              {camPreview ? 'Đóng khung' : 'Xem mô phỏng'}
            </button>
          </div>
          {camPreview && (
            <div className="relative h-36 bg-black flex items-center justify-center">
              <img
                src="/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg"
                alt="Camera mô phỏng"
                className="w-full h-full object-cover opacity-50"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-[10px] font-bold mb-1">
                  SIMULATED CAM · 1080P
                </span>
                <p className="text-[11px] text-white/80">
                  Khung hình minh họa hành lang căn hộ PHONE OS (không kết nối camera vật lý bên ngoài).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Devices Grid */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase text-zinc-500">Thiết bị ({visibleDevices.length})</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {visibleDevices.map((dev) => (
              <div
                key={dev.id}
                className={`p-3 rounded-2xl border space-y-2 ${
                  dev.is_on
                    ? 'bg-teal-500/10 border-teal-500/40'
                    : 'bg-white dark:bg-[#191922] border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    {deviceIcon(dev.device_type)}
                  </div>
                  <button
                    onClick={() => toggleDevice(dev)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      dev.is_on ? 'bg-teal-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <p className="text-xs font-bold truncate">{dev.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {dev.room} · {dev.is_on ? `${dev.value_num}${dev.unit}` : 'Đang tắt'}
                  </p>
                </div>
                {(dev.device_type === 'light' || dev.device_type === 'ac' || dev.device_type === 'curtain' || dev.device_type === 'fan') && (
                  <input
                    type="range"
                    min={dev.device_type === 'ac' ? 16 : dev.device_type === 'fan' ? 1 : 0}
                    max={dev.device_type === 'ac' ? 30 : dev.device_type === 'fan' ? 5 : 100}
                    value={dev.value_num}
                    onChange={(e) => changeValue(dev, Number(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Smart Home Logs */}
        <div className="space-y-1.5">
          <h2 className="text-xs font-bold uppercase text-zinc-500">Nhật ký gần đây</h2>
          {logs.slice(0, 8).map((l) => (
            <div key={l.id} className="px-3 py-2 rounded-xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 text-[11px] flex justify-between gap-2">
              <span className="font-semibold truncate">{l.device_name}</span>
              <span className="text-zinc-500 shrink-0">{l.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
