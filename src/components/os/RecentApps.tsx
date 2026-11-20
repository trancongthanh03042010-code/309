import React from 'react';
import { Columns2, Layers, PictureInPicture2, X } from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { AppIconTile } from '../../services/appIcons';

export function RecentApps() {
  const {
    data,
    recentApps,
    recentAppsOpen,
    setRecentAppsOpen,
    activeApp,
    splitApp,
    setSplitApp,
    floatingApp,
    setFloatingApp,
    openApp,
    closeRecentApp,
    closeAllRecents,
    showToast,
  } = useOS();

  if (!recentAppsOpen || !data) return null;

  const handleOpenSplit = (appId: typeof recentApps[number]) => {
    if (!activeApp) {
      openApp(appId);
      return;
    }
    if (activeApp === appId) {
      showToast('Chia đôi màn hình', 'Hãy chọn một ứng dụng khác với ứng dụng đang mở.');
      return;
    }
    setSplitApp(appId);
    setRecentAppsOpen(false);
    showToast('Đã bật Chia đôi màn hình', `Đang chạy song song ${appId}`);
  };

  return (
    <div
      onClick={() => setRecentAppsOpen(false)}
      className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl p-4 flex flex-col justify-between text-white"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#A78BFA]" />
          <span className="text-sm font-semibold">Ứng dụng gần đây ({recentApps.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {splitApp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSplitApp(null);
              }}
              className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-semibold"
            >
              Tắt chia đôi
            </button>
          )}
          <button
            onClick={() => setRecentAppsOpen(false)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex items-center gap-3 overflow-x-auto os-scroll-hidden py-6 px-2"
      >
        {recentApps.length === 0 ? (
          <div className="w-full text-center text-xs text-white/50">
            Chưa có ứng dụng nào đang chạy gần đây.
          </div>
        ) : (
          recentApps.map((appId) => {
            const appMeta = data.apps.find((a) => a.app_id === appId);
            return (
              <div
                key={appId}
                className="w-52 sm:w-56 h-[min(380px,64dvh)] shrink-0 rounded-3xl bg-zinc-900 border border-white/15 flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-800/80 border-b border-white/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <AppIconTile appId={appId} size="sm" />
                    <span className="text-xs font-semibold truncate">{appMeta?.name || appId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setFloatingApp(floatingApp === appId ? null : appId);
                        setRecentAppsOpen(false);
                        showToast('Cửa sổ nổi', `Đang mở ${appMeta?.name || appId} ở chế độ cửa sổ nổi.`);
                      }}
                      className="p-1.5 rounded-full hover:bg-white/10 text-sky-300 hover:text-white"
                      title="Mở cửa sổ nổi"
                    >
                      <PictureInPicture2 className="w-3.5 h-3.5" />
                    </button>
                    {activeApp && activeApp !== appId && (
                      <button
                        onClick={() => handleOpenSplit(appId)}
                        className="p-1.5 rounded-full hover:bg-white/10 text-violet-300 hover:text-white"
                        title="Chia đôi màn hình"
                      >
                        <Columns2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => closeRecentApp(appId)}
                      className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
                      title="Đóng ứng dụng"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => openApp(appId)}
                  className="flex-1 flex flex-col items-center justify-center p-4 text-center hover:bg-white/5 transition-colors"
                >
                  <AppIconTile appId={appId} size="lg" />
                  <p className="text-sm font-semibold mt-4">{appMeta?.name || appId}</p>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{appMeta?.description}</p>
                  <span className="mt-4 px-3 py-1 rounded-full bg-white/10 text-[11px]">
                    Chạm để mở lại
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {recentApps.length > 0 && (
        <button
          onClick={closeAllRecents}
          className="mx-auto px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold"
        >
          Đóng tất cả
        </button>
      )}
    </div>
  );
}
