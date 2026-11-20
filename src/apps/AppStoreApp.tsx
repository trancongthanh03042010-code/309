import React, { useState } from 'react';
import { Search, Download, Check, ArrowLeft, ShieldCheck, CreditCard, CheckCircle2 } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { AppIconTile } from '../services/appIcons';
import { osApi } from '../services/api';
import type { InstalledApp } from '../types/os';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

export function AppStoreApp() {
  const { data, refreshData, openApp, showToast } = useOS();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [realityFilter, setRealityFilter] = useState<'ALL' | 'A' | 'B' | 'C' | 'D'>('ALL');
  const [selected, setSelected] = useState<InstalledApp | null>(null);
  const [unlockedProIds, setUnlockedProIds] = useState<string[]>([]);
  const [cardCheckoutApp, setCardCheckoutApp] = useState<InstalledApp | null>(null);

  if (!data) return null;

  const categories = ['All', ...Array.from(new Set(data.apps.map((a) => a.category)))];
  const filtered = data.apps.filter((a) => {
    const matchCat = cat === 'All' || a.category === cat;
    const matchReality = realityFilter === 'ALL' || a.reality_type === realityFilter;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchReality && matchSearch;
  });

  const handleToggleInstall = async (app: InstalledApp) => {
    const next = app.installed ? 0 : 1;
    if (!next && ['settings', 'appstore', 'phone', 'messages'].includes(app.app_id)) {
      showToast('Ứng dụng hệ thống', 'Các ứng dụng cốt lõi của PHONE OS luôn được giữ cài đặt.', 'error');
      return;
    }
    await osApi.updateApp(app.app_id, { installed: next, hidden: 0 });
    await refreshData();
    setSelected({ ...app, installed: next });
    showToast(next ? 'Đã cài đặt' : 'Đã gỡ', `${app.name} ${next ? 'đã được thêm vào Màn hình chính' : 'đã được gỡ cài đặt'}`);
  };

  if (selected) {
    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs font-medium text-blue-500">
            <ArrowLeft className="w-4 h-4" />
            <span>Cửa hàng</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          <div className="flex items-center gap-4">
            <AppIconTile appId={selected.app_id} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold truncate">{selected.name}</h2>
              <p className="text-xs text-zinc-500">{selected.author} · {selected.category}</p>
              <div className="flex gap-2 mt-2.5">
                {selected.installed ? (
                  <>
                    <button
                      onClick={() => openApp(selected.app_id)}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                    >
                      Mở
                    </button>
                    <button
                      onClick={() => handleToggleInstall(selected)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold"
                    >
                      Gỡ bỏ
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleToggleInstall(selected)}
                    className="px-5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Cài đặt</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs">
            <div>
              <p className="text-zinc-500 text-[10px]">Phiên bản</p>
              <p className="font-mono-num font-bold mt-0.5">{selected.version}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px]">Dung lượng</p>
              <p className="font-mono-num font-bold mt-0.5">{selected.size_mb} MB</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px]">Phân loại</p>
              <p className="font-mono-num font-bold mt-0.5 text-blue-500">Loại {selected.reality_type}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
            <h3 className="font-semibold">Giới thiệu ứng dụng PHONE OS</h3>
            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{selected.description}</p>
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 text-[11px] text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Tương thích gốc với hệ sinh thái PHONE OS 4.0 (ứng dụng web/PWA nội bộ, không cài APK ngoài).</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
            <h3 className="font-semibold">Gói Pro & Ủng hộ Nhà phát triển</h3>
            {unlockedProIds.includes(selected.app_id) ? (
              <div className="min-h-[40px] px-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Đã mở khóa gói Pro cho {selected.name} bằng Thẻ Hikari</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCardCheckoutApp(selected)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>Mở khóa gói Pro / Ủng hộ (49.000đ) qua thẻ ngân hàng</span>
              </button>
            )}
          </div>
        </div>

        <UniversalCardCheckoutModal
          open={Boolean(cardCheckoutApp)}
          title={`Mở khóa gói Pro · ${cardCheckoutApp?.name || ''}`}
          merchant={`App Store · ${cardCheckoutApp?.name || ''}`}
          category="Mua sắm"
          amount={49000}
          channelType="online"
          appSource="Kho Ứng dụng"
          onClose={() => setCardCheckoutApp(null)}
          onSuccess={(res) => {
            if (cardCheckoutApp) {
              setUnlockedProIds((prev) =>
                prev.includes(cardCheckoutApp.app_id) ? prev : [...prev, cardCheckoutApp.app_id]
              );
            }
            showToast(
              'Mở khóa gói Pro thành công',
              `Đã thanh toán 49.000đ · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
              'success'
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold">Kho Ứng dụng 4.0</h1>
          <span className="text-[11px] text-zinc-500 font-mono-num">{data.apps.length} ứng dụng</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm ứng dụng trong hệ sinh thái PHONE OS..."
            className="bg-transparent text-xs outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden pb-0.5">
          {(['ALL', 'A', 'B', 'C', 'D'] as const).map((rf) => (
            <button
              key={rf}
              onClick={() => setRealityFilter(rf)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold shrink-0 ${
                realityFilter === rf ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {rf === 'ALL' ? 'Mọi loại' : `Loại ${rf}`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto os-scroll-hidden pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                cat === c ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              {c === 'All' ? 'Tất cả' : c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {filtered.map((app) => (
          <div
            key={app.app_id}
            className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3"
          >
            <button onClick={() => setSelected(app)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <AppIconTile appId={app.app_id} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{app.name}</p>
                <p className="text-[10px] text-zinc-500 truncate">{app.description}</p>
              </div>
            </button>
            <button
              onClick={() => (app.installed ? openApp(app.app_id) : handleToggleInstall(app))}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 flex items-center gap-1 ${
                app.installed
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-blue-500'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {app.installed ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Mở</span>
                </>
              ) : (
                <span>Nhận</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
