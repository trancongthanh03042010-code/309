import React, { useEffect, useState } from 'react';
import { Search, Navigation, Share2, MapPin, Loader2 } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

const CATEGORIES = [
  { query: 'Coffee', label: 'Cà phê' },
  { query: 'Restaurant', label: 'Nhà hàng' },
  { query: 'Hospital', label: 'Bệnh viện' },
  { query: 'ATM', label: 'Cây ATM' },
  { query: 'Park', label: 'Công viên' },
  { query: 'Station', label: 'Nhà ga' },
];

export function MapsApp() {
  const { appParams, openShareSheet, showToast } = useOS();
  const [query, setQuery] = useState(appParams.mapQuery || '');
  const [coords, setCoords] = useState<{ lat: number; lon: number; label: string }>({
    lat: 35.6595,
    lon: 139.7004,
    label: 'Shibuya, Tokyo',
  });
  const [results, setResults] = useState<Array<{ place_id: number; display_name: string; lat: string; lon: string }>>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async (qText: string) => {
    if (!qText.trim()) return;
    setSearching(true);
    try {
      const res = await osApi.mapsSearch(qText);
      setResults(res.results);
      if (res.results[0]) {
        setCoords({
          lat: Number(res.results[0].lat),
          lon: Number(res.results[0].lon),
          label: res.results[0].display_name.split(',')[0],
        });
      } else {
        showToast('Bản đồ', 'Không tìm thấy địa điểm phù hợp.');
      }
    } catch (err) {
      showToast('Lỗi Bản đồ', err instanceof Error ? err.message : 'Tìm kiếm thất bại', 'error');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (appParams.mapQuery) {
      runSearch(appParams.mapQuery);
    }
  }, [appParams.mapQuery]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast('Vị trí', 'Trình duyệt không hỗ trợ định vị GPS', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: 'Vị trí hiện tại',
        });
        showToast('Đã cập nhật vị trí', 'Đã căn giữa bản đồ vào vị trí GPS của bạn');
      },
      (err) => {
        showToast('Quyền vị trí', err.message, 'error');
      }
    );
  };

  const bbox = `${coords.lon - 0.015},${coords.lat - 0.012},${coords.lon + 0.015},${coords.lat + 0.012}`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lon}`;

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Search Header */}
      <div className="p-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <Search className="w-4 h-4 text-teal-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm địa điểm qua OpenStreetMap..."
              className="bg-transparent text-xs outline-none flex-1"
            />
            {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
          </div>
          <button
            type="button"
            onClick={handleLocateMe}
            className="p-2.5 rounded-xl bg-teal-500 text-white"
            title="Vị trí hiện tại"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.query}
              onClick={() => {
                const q = `${cat.query} near ${coords.label}`;
                setQuery(q);
                runSearch(q);
              }}
              className="px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium whitespace-nowrap hover:bg-teal-500/15"
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* OpenStreetMap Live Viewport */}
      <div className="relative flex-1 bg-zinc-200 dark:bg-zinc-900">
        <iframe title="OpenStreetMap" src={osmEmbedUrl} className="w-full h-full border-0" />
        <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl bg-white/95 dark:bg-[#1A1A22]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                <span>{coords.label}</span>
              </p>
              <p className="text-[10px] font-mono-num text-zinc-500">
                {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} · OpenStreetMap
              </p>
            </div>
            <button
              onClick={() =>
                openShareSheet({
                  title: `Vị trí: ${coords.label}`,
                  text: `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}`,
                  url: `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}`,
                })
              }
              className="px-3 py-1.5 rounded-xl bg-teal-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Chia sẻ</span>
            </button>
          </div>

          {results.length > 1 && (
            <div className="max-h-24 overflow-y-auto os-scroll space-y-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
              {results.slice(0, 4).map((r) => (
                <button
                  key={r.place_id}
                  onClick={() =>
                    setCoords({
                      lat: Number(r.lat),
                      lon: Number(r.lon),
                      label: r.display_name.split(',')[0],
                    })
                  }
                  className="w-full text-left text-[11px] truncate py-1 hover:text-teal-500"
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
