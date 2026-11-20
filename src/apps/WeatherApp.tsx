import React, { useEffect, useState } from 'react';
import { CloudSun, Droplets, Wind, Sun, Search, Navigation, Loader2 } from 'lucide-react';
import { osApi } from '../services/api';
import { useOS } from '../context/OSContext';

interface ForecastData {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation_probability: number;
    weather_code: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    uv_index_max: number[];
    precipitation_probability_max: number[];
  };
}

const CITY_DISPLAY: Record<string, string> = {
  'Ho Chi Minh City': 'TP. Hồ Chí Minh',
  Tokyo: 'Tokyo',
  Seoul: 'Seoul',
};

export function WeatherApp() {
  const { showToast } = useOS();
  const [cities, setCities] = useState(['Ho Chi Minh City', 'Tokyo', 'Seoul']);
  const [activeCity, setActiveCity] = useState('Ho Chi Minh City');
  const [searchInput, setSearchInput] = useState('');
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wx, setWx] = useState<{ locationName: string; source: string; forecast: ForecastData } | null>(null);

  const loadWeather = async (params: { city?: string; lat?: number; lon?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await osApi.weather(params);
      setWx({ locationName: res.locationName, source: res.source, forecast: res.forecast as ForecastData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu thời tiết');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather({ city: activeCity });
  }, [activeCity]);

  const toUnit = (c: number) => (unit === 'C' ? Math.round(c) : Math.round((c * 9) / 5 + 32));

  const current = wx?.forecast.current;
  const daily = wx?.forecast.daily;
  const hourly = wx?.forecast.hourly;

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-sky-600 via-indigo-700 to-slate-900 text-white overflow-hidden">
      <div className="p-3 flex items-center gap-2 border-b border-white/15">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!searchInput.trim()) return;
            const c = searchInput.trim();
            if (!cities.includes(c)) setCities((prev) => [c, ...prev]);
            setActiveCity(c);
            setSearchInput('');
          }}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15"
        >
          <Search className="w-3.5 h-3.5 text-white/75" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Thêm thành phố..."
            className="bg-transparent text-xs outline-none flex-1 placeholder:text-white/60"
          />
        </form>
        <button
          onClick={() => {
            navigator.geolocation?.getCurrentPosition(
              (pos) => loadWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
              (err) => showToast('Vị trí', err.message, 'error')
            );
          }}
          className="p-2 rounded-xl bg-white/15"
          title="Dùng vị trí GPS"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          onClick={() => setUnit((u) => (u === 'C' ? 'F' : 'C'))}
          className="px-2.5 py-1.5 rounded-xl bg-white/15 text-xs font-bold"
        >
          °{unit}
        </button>
      </div>

      <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto os-scroll-hidden">
        {cities.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCity(c)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${
              activeCity === c ? 'bg-white text-indigo-900 font-semibold' : 'bg-white/15 text-white/85'
            }`}
          >
            {CITY_DISPLAY[c] || c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
        {loading ? (
          <div className="h-52 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-500/20 text-xs text-center">{error}</div>
        ) : current ? (
          <>
            <div className="text-center py-2">
              <p className="text-sm font-medium text-white/80">{CITY_DISPLAY[wx?.locationName || ''] || wx?.locationName}</p>
              <p className="text-6xl font-display font-bold font-mono-num my-1">
                {toUnit(current.temperature_2m)}°
              </p>
              <p className="text-xs text-white/80">
                Cảm giác như {toUnit(current.apparent_temperature)}° · Cao:{daily ? toUnit(daily.temperature_2m_max[0]) : '--'}° Thấp:
                {daily ? toUnit(daily.temperature_2m_min[0]) : '--'}°
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md">
                <p className="text-white/65 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> Độ ẩm</p>
                <p className="text-base font-mono-num font-bold mt-1">{current.relative_humidity_2m}%</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md">
                <p className="text-white/65 flex items-center gap-1"><Wind className="w-3.5 h-3.5" /> Gió</p>
                <p className="text-base font-mono-num font-bold mt-1">{current.wind_speed_10m} km/h</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md">
                <p className="text-white/65 flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> UV Tối đa</p>
                <p className="text-base font-mono-num font-bold mt-1">{daily ? daily.uv_index_max[0] : '--'}</p>
              </div>
            </div>

            {hourly && (
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md space-y-2">
                <p className="text-[11px] font-semibold text-white/70">Dự báo theo giờ</p>
                <div className="flex gap-3 overflow-x-auto os-scroll-hidden pb-1">
                  {hourly.time.slice(0, 12).map((t, i) => (
                    <div key={t} className="flex flex-col items-center gap-1 shrink-0 text-xs font-mono-num">
                      <span className="text-[10px] text-white/65">{t.slice(11, 16)}</span>
                      <CloudSun className="w-4 h-4 text-amber-300" />
                      <span className="font-semibold">{toUnit(hourly.temperature_2m[i])}°</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {daily && (
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md space-y-2">
                <p className="text-[11px] font-semibold text-white/70">Dự báo 7 ngày</p>
                {daily.time.map((day, i) => (
                  <div key={day} className="flex items-center justify-between text-xs py-1 border-b border-white/10 last:border-0">
                    <span className="w-24">{new Date(day).toLocaleDateString('vi-VN', { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
                    <span className="text-sky-200 font-mono-num">{daily.precipitation_probability_max[i]}% mưa</span>
                    <span className="font-mono-num font-semibold">
                      {toUnit(daily.temperature_2m_min[i])}° / {toUnit(daily.temperature_2m_max[i])}°
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-center text-white/50">Dữ liệu trực tiếp qua {wx?.source}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
