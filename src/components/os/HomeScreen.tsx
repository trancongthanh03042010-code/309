import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  CloudSun,
  CalendarDays,
  Footprints,
  Sparkles,
  Pin,
  EyeOff,
  Trash2,
  Grid2x2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Music2,
  FileText,
  Folder,
  GripHorizontal,
  BatteryCharging,
  RotateCcw,
  Maximize2,
  X,
  Landmark,
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { AppIconTile } from '../../services/appIcons';
import { osApi } from '../../services/api';
import { useDraggablePopup } from './useDraggablePopup';
import type { AppId, HomeWidget, InstalledApp } from '../../types/os';

export function HomeScreen() {
  const {
    data,
    openApp,
    setGlobalSearchOpen,
    weatherSummary,
    refreshData,
    showToast,
    requestConfirm,
    tabletMode,
    musicPlaying,
    currentTrack,
    toggleMusic,
    homePage,
    setHomePage,
    registerBackHandler,
  } = useOS();

  const page = homePage;
  const setPage = setHomePage;
  const [libraryFilter, setLibraryFilter] = useState('');
  const [librarySort, setLibrarySort] = useState<'category' | 'az' | 'recent'>('category');
  const [showHiddenInLib, setShowHiddenInLib] = useState(true);
  const [quickActionApp, setQuickActionApp] = useState<InstalledApp | null>(null);
  const [widgetEditorOpen, setWidgetEditorOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [undoLayout, setUndoLayout] = useState<{ label: string; appId: AppId; patch: Partial<InstalledApp> } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const swipeRef = useRef<{
    active: boolean;
    engaged: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTime: number;
  }>({ active: false, engaged: false, pointerId: null, startX: 0, startY: 0, startTime: 0 });
  const suppressClickUntilRef = useRef(0);

  const folderDrag = useDraggablePopup({
    clampMode: 'strict',
    padding: 10,
    resetKey: openFolder,
  });

  const quickActionDrag = useDraggablePopup({
    clampMode: 'header',
    padding: 10,
    handleHeight: 56,
    minVisibleX: 140,
    resetKey: quickActionApp?.app_id ?? '',
  });

  const profile = data?.profile;
  const iconScale = profile?.icon_size || 'medium';
  const cols = tabletMode ? 6 : profile?.home_columns === 5 ? 5 : 4;
  const showLabels = profile?.icon_labels !== 0;

  const installedApps = useMemo(
    () => (data?.apps || []).filter((a) => a.installed === 1 && a.hidden === 0),
    [data?.apps]
  );

  const allInstalledCount = useMemo(
    () => (data?.apps || []).filter((a) => a.installed === 1).length,
    [data?.apps]
  );

  const dockApps = useMemo(
    () => installedApps.filter((a) => a.pinned_dock === 1).sort((a, b) => a.dock_order - b.dock_order).slice(0, 5),
    [installedApps]
  );

  const gridApps = useMemo(() => installedApps.filter((a) => a.pinned_dock === 0), [installedApps]);

  // Extract folders on Page 0..2
  const foldersMap = useMemo(() => {
    const map = new Map<string, InstalledApp[]>();
    for (const a of gridApps) {
      if (a.folder_name && a.folder_name.trim()) {
        const list = map.get(a.folder_name) || [];
        list.push(a);
        map.set(a.folder_name, list);
      }
    }
    return map;
  }, [gridApps]);

  const unfolderedApps = useMemo(() => gridApps.filter((a) => !a.folder_name?.trim()), [gridApps]);
  const page0Apps = unfolderedApps.filter((a) => a.page_index === 0).slice(0, 12);
  const page1Apps = unfolderedApps.filter((a) => a.page_index === 1).slice(0, 16);
  const page2Apps = unfolderedApps.filter(
    (a) => a.page_index >= 2 || (!page0Apps.includes(a) && !page1Apps.includes(a))
  );

  const appPages = useMemo(() => {
    const pages: InstalledApp[][] = [page0Apps];
    if (page1Apps.length > 0) pages.push(page1Apps);
    if (page2Apps.length > 0) pages.push(page2Apps);
    return pages;
  }, [page0Apps, page1Apps, page2Apps]);

  const libraryPageIndex = appPages.length;
  const totalPages = appPages.length + 1;

  useEffect(() => {
    if (page > libraryPageIndex) {
      setPage(libraryPageIndex);
    }
  }, [page, libraryPageIndex, setPage]);

  useEffect(() => {
    return registerBackHandler(() => {
      if (quickActionApp) {
        setQuickActionApp(null);
        return true;
      }
      if (openFolder) {
        setOpenFolder(null);
        return true;
      }
      if (widgetEditorOpen) {
        setWidgetEditorOpen(false);
        return true;
      }
      if (page === libraryPageIndex) {
        setPage(0);
        return true;
      }
      if (page > 0) {
        setPage(0);
        return true;
      }
      return false;
    });
  }, [registerBackHandler, quickActionApp, openFolder, widgetEditorOpen, page, libraryPageIndex, setPage]);

  const getBadge = (appId: AppId): number => {
    if (!data) return 0;
    if (appId === 'messages') return data.conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    if (appId === 'mail') return data.emails.filter((e) => e.folder === 'inbox' && !e.is_read).length;
    if (appId === 'reminders') return data.reminders.filter((r) => !r.is_completed).length;
    if (appId === 'phone') return data.calls.filter((c) => c.direction === 'missed').length;
    if (appId === 'community') return 0;
    return 0;
  };

  const todaySteps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (data?.healthLogs || [])
      .filter((l) => l.log_type === 'steps' && l.logged_at.startsWith(today))
      .reduce((sum, l) => sum + l.value_num, 0);
  }, [data?.healthLogs]);

  const nextEvent = data?.events[0];
  const featuredChar = data?.characters[0];
  const widgets = data?.homeWidgets || [];

  const primaryBankAccount = useMemo(() => {
    const accounts = data?.bankingAccounts || [];
    return (
      accounts.find((a) => (a.owner_type || 'user') === 'user' && a.is_primary) ||
      accounts.find((a) => (a.owner_type || 'user') === 'user') ||
      accounts[0]
    );
  }, [data?.bankingAccounts]);

  const latestBankTx = useMemo(() => {
    const txs = data?.bankingTransactions || [];
    if (!primaryBankAccount) return txs[0];
    return txs.find((t) => t.account_id === primaryBankAccount.id) || txs[0];
  }, [data?.bankingTransactions, primaryBankAccount]);

  const categories = useMemo(() => {
    const map = new Map<string, InstalledApp[]>();
    const all = (data?.apps || []).filter((a) => a.installed === 1 && (showHiddenInLib || a.hidden === 0));
    const filtered = all.filter((app) =>
      !libraryFilter || app.name.toLowerCase().includes(libraryFilter.toLowerCase())
    );
    if (librarySort === 'az') {
      return [['Tất cả (A-Z)', [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'vi'))]] as Array<[string, InstalledApp[]]>;
    }
    if (librarySort === 'recent') {
      return [
        [
          'Mở gần đây & Thường dùng',
          [...filtered].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)),
        ],
      ] as Array<[string, InstalledApp[]]>;
    }
    for (const app of filtered) {
      const list = map.get(app.category) || [];
      list.push(app);
      map.set(app.category, list);
    }
    return Array.from(map.entries());
  }, [data?.apps, libraryFilter, librarySort, showHiddenInLib]);

  const handleToggleDock = async (app: InstalledApp) => {
    if (!app.pinned_dock && dockApps.length >= 5) {
      showToast('Dock tối đa 5 ứng dụng', 'Hãy bỏ ghim bớt 1 ứng dụng khỏi Dock trước.', 'error');
      return;
    }
    const prevVal = app.pinned_dock;
    await osApi.updateApp(app.app_id, { pinned_dock: app.pinned_dock ? 0 : 1 });
    setUndoLayout({ label: `${app.pinned_dock ? 'Bỏ ghim' : 'Ghim'} ${app.name}`, appId: app.app_id, patch: { pinned_dock: prevVal } });
    setQuickActionApp(null);
    await refreshData();
    showToast('Bố cục màn hình chính', `${app.name} đã ${app.pinned_dock ? 'bỏ ghim khỏi' : 'được ghim vào'} thanh Dock.`);
  };

  const handleMoveToFolder = async (app: InstalledApp, folderName: string) => {
    const prevFolder = app.folder_name;
    await osApi.updateApp(app.app_id, { folder_name: folderName.trim() });
    setUndoLayout({ label: `Chuyển thư mục ${app.name}`, appId: app.app_id, patch: { folder_name: prevFolder } });
    setQuickActionApp(null);
    setFolderInput('');
    await refreshData();
    showToast('Thư mục', folderName.trim() ? `Đã đưa ${app.name} vào thư mục "${folderName.trim()}"` : `Đã bỏ ${app.name} khỏi thư mục`);
  };

  const handleHideApp = async (app: InstalledApp) => {
    const nextHidden = app.hidden ? 0 : 1;
    await osApi.updateApp(app.app_id, { hidden: nextHidden });
    setUndoLayout({ label: `${nextHidden ? 'Ẩn' : 'Hiện'} ${app.name}`, appId: app.app_id, patch: { hidden: app.hidden } });
    setQuickActionApp(null);
    await refreshData();
    showToast(nextHidden ? 'Đã ẩn' : 'Đã hiện lại', `${app.name} ${nextHidden ? 'đã được chuyển vào Thư viện ứng dụng.' : 'đã hiện trên Màn hình chính.'}`);
  };

  const handleMovePage = async (app: InstalledApp, targetPage: number) => {
    const prevPage = app.page_index;
    await osApi.updateApp(app.app_id, { page_index: targetPage, pinned_dock: 0 });
    setUndoLayout({ label: `Chuyển trang ${app.name}`, appId: app.app_id, patch: { page_index: prevPage, pinned_dock: app.pinned_dock } });
    setQuickActionApp(null);
    await refreshData();
    setPage(targetPage);
    showToast('Di chuyển trang', `Đã chuyển ${app.name} sang Trang ${targetPage + 1}.`);
  };

  const handleUninstallApp = (app: InstalledApp) => {
    setQuickActionApp(null);
    if (['settings', 'appstore', 'phone', 'messages'].includes(app.app_id)) {
      showToast('Ứng dụng hệ thống', `${app.name} là ứng dụng cốt lõi của PHONE OS và không thể gỡ bỏ.`, 'error');
      return;
    }
    requestConfirm({
      title: `Gỡ cài đặt ${app.name}?`,
      message: `Bạn có thể cài đặt lại ${app.name} bất cứ lúc nào từ Kho Ứng dụng PHONE OS.`,
      confirmLabel: 'Gỡ bỏ',
      destructive: true,
      onConfirm: async () => {
        await osApi.updateApp(app.app_id, { installed: 0 });
        await refreshData();
        showToast('Đã gỡ cài đặt', `Đã gỡ ${app.name}.`);
      },
    });
  };

  const addWidget = async (widget_type: HomeWidget['widget_type'], title: string) => {
    await osApi.createWidget({ widget_type, title, size: '2x2', page_index: 0 });
    await refreshData();
    setWidgetEditorOpen(false);
    showToast('Đã thêm Widget', `${title} đã hiển thị trên Màn hình chính.`);
  };

  const renderWidgetCard = (w: HomeWidget) => {
    const spanClass = w.size === '4x2' ? 'col-span-2' : '';
    if (w.widget_type === 'weather_calendar') {
      return (
        <div key={w.id} className={`relative group ${spanClass}`}>
          <button
            onClick={() => openApp('weather')}
            className="w-full h-full p-3 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/15 text-left hover:bg-black/45 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-white/75 truncate">
                {weatherSummary?.city || 'TP. Hồ Chí Minh'}
              </span>
              <CloudSun className="w-4 h-4 text-sky-300 shrink-0" />
            </div>
            <p className="text-2xl font-bold font-mono-num mt-1">
              {weatherSummary ? `${weatherSummary.temp}°` : '--°'}
            </p>
            <p className="text-[11px] text-white/70 truncate">{weatherSummary?.label || 'Chạm để xem dự báo'}</p>
            {nextEvent && (
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 text-[10px] text-purple-200 truncate">
                <CalendarDays className="w-3 h-3 shrink-0" />
                <span className="truncate">{nextEvent.title}</span>
              </div>
            )}
          </button>
          {widgetEditorOpen && (
            <WidgetControls w={w} onRefresh={refreshData} />
          )}
        </div>
      );
    }
    if (w.widget_type === 'ai_companion') {
      return (
        <div key={w.id} className={`relative group flex flex-col gap-2 ${spanClass}`}>
          {featuredChar && (
            <button
              onClick={() => openApp('messages', { conversationId: 'conv_yuki' })}
              className="flex-1 p-2.5 rounded-2xl bg-black/35 backdrop-blur-xl border border-white/15 flex items-center gap-2.5 text-left hover:bg-black/45"
            >
              <img
                src={featuredChar.avatar}
                alt={featuredChar.name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-[#A78BFA]/70 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{featuredChar.name.split(' ')[0]}</p>
                <p className="text-[10px] text-purple-200 truncate">{featuredChar.activity_status || featuredChar.mood}</p>
              </div>
            </button>
          )}
          <button
            onClick={() => openApp('health')}
            className="p-2.5 rounded-2xl bg-black/35 backdrop-blur-xl border border-white/15 flex items-center justify-between text-left hover:bg-black/45"
          >
            <div className="flex items-center gap-1.5">
              <Footprints className="w-4 h-4 text-rose-400" />
              <span className="text-[11px] text-white/80">Bước chân</span>
            </div>
            <span className="text-xs font-bold font-mono-num">{todaySteps.toLocaleString()}</span>
          </button>
          {widgetEditorOpen && <WidgetControls w={w} onRefresh={refreshData} />}
        </div>
      );
    }
    if (w.widget_type === 'music_podcast') {
      return (
        <div key={w.id} className={`relative p-3 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/15 ${spanClass}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold flex items-center gap-1 text-pink-300">
              <Music2 className="w-3.5 h-3.5" /> Nhạc & Podcast
            </span>
            <button onClick={toggleMusic} className="text-[10px] px-2 py-0.5 rounded-full bg-white/15">
              {musicPlaying ? 'Tạm dừng' : 'Phát'}
            </button>
          </div>
          <button onClick={() => openApp('music')} className="text-left w-full">
            <p className="text-xs font-bold truncate">{currentTrack?.title || 'Chưa chọn bài'}</p>
            <p className="text-[10px] text-white/60 truncate">{currentTrack?.artist}</p>
          </button>
          {widgetEditorOpen && <WidgetControls w={w} onRefresh={refreshData} />}
        </div>
      );
    }
    if (w.widget_type === 'health_battery') {
      return (
        <div key={w.id} className={`relative p-3 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/15 ${spanClass}`}>
          <button onClick={() => openApp('settings', { tab: 'battery' })} className="w-full text-left space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                <BatteryCharging className="w-3.5 h-3.5" /> Pin thiết bị
              </span>
              <span className="font-mono-num font-bold">{profile?.battery_level ?? 86}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-emerald-400" style={{ width: `${profile?.battery_level ?? 86}%` }} />
            </div>
            <p className="text-[10px] text-white/65">Bước hôm nay: {todaySteps.toLocaleString()}</p>
          </button>
          {widgetEditorOpen && <WidgetControls w={w} onRefresh={refreshData} />}
        </div>
      );
    }
    if (w.widget_type === 'banking_summary') {
      const bal = Math.round(Number(primaryBankAccount?.available_balance ?? primaryBankAccount?.balance ?? 0));
      const maskedAcc = primaryBankAccount?.account_number
        ? `•••• ${primaryBankAccount.account_number.slice(-4)}`
        : 'HK-USER';
      return (
        <div key={w.id} className={`relative p-3 rounded-3xl bg-gradient-to-br from-[#231219]/90 via-[#1D1524]/85 to-black/75 backdrop-blur-xl border border-rose-300/25 ${spanClass}`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-bold flex items-center gap-1.5 text-rose-300 truncate">
              <Landmark className="w-3.5 h-3.5 text-[#E14B5A] shrink-0" />
              <span className="truncate">Hikari Bank</span>
            </span>
            <span className="text-[10px] font-mono-num text-white/60 shrink-0">{maskedAcc}</span>
          </div>
          <button
            type="button"
            onClick={() => openApp('banking')}
            className="w-full text-left space-y-1"
          >
            <p className="text-base font-extrabold font-mono-num tabular-nums text-white truncate">
              {bal.toLocaleString('vi-VN')} <span className="text-[10px] font-semibold text-rose-200">VNĐ</span>
            </p>
            <p className="text-[10px] text-white/70 truncate">
              {latestBankTx
                ? `${latestBankTx.tx_type === 'income' ? '+' : '-'}${Math.round(Number(latestBankTx.amount || 0)).toLocaleString('vi-VN')}đ · ${latestBankTx.counterparty}`
                : 'Chạm để mở ví & biên lai'}
            </p>
          </button>
          <div className="flex items-center gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => openApp('banking', { tab: 'transfer', bankingAction: 'transfer' })}
              className="flex-1 min-h-[30px] py-1 px-2 rounded-xl bg-[#E14B5A]/90 hover:bg-[#E14B5A] text-[10px] font-bold text-white whitespace-nowrap"
            >
              Chuyển tiền
            </button>
            <button
              type="button"
              onClick={() => openApp('banking', { tab: 'receive', bankingAction: 'receive' })}
              className="flex-1 min-h-[30px] py-1 px-2 rounded-xl bg-white/12 hover:bg-white/20 text-[10px] font-semibold text-white whitespace-nowrap"
            >
              Nhận tiền
            </button>
          </div>
          {widgetEditorOpen && <WidgetControls w={w} onRefresh={refreshData} />}
        </div>
      );
    }
    return (
      <div key={w.id} className={`relative p-3 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/15 ${spanClass}`}>
        <button onClick={() => openApp('reminders')} className="w-full text-left space-y-1">
          <p className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Ghi chú & Nhắc việc
          </p>
          <p className="text-xs font-bold truncate">{data?.reminders.find((r) => !r.is_completed)?.title || 'Không còn việc tồn đọng'}</p>
          <p className="text-[10px] text-white/65">{data?.notes.filter((n) => !n.is_deleted).length || 0} ghi chú đã lưu</p>
        </button>
        {widgetEditorOpen && <WidgetControls w={w} onRefresh={refreshData} />}
      </div>
    );
  };

  const safeOpenApp = (appId: AppId) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    openApp(appId);
  };

  const canStartSwipeFromTarget = (target: EventTarget | null) => {
    if (openFolder || quickActionApp) return false;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, [data-no-swipe="true"]')) return false;
    let cur: HTMLElement | null = target;
    while (cur && cur !== document.body) {
      const style = window.getComputedStyle(cur);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        cur.scrollWidth > cur.clientWidth + 4
      ) {
        return false;
      }
      cur = cur.parentElement;
    }
    return true;
  };

  const handleSwipeStart = (clientX: number, clientY: number, pointerId: number | null, target: EventTarget | null) => {
    if (!canStartSwipeFromTarget(target)) return;
    swipeRef.current = {
      active: true,
      engaged: false,
      pointerId,
      startX: clientX,
      startY: clientY,
      startTime: Date.now(),
    };
  };

  const handleSwipeMove = (clientX: number, clientY: number, pointerId: number | null) => {
    const s = swipeRef.current;
    if (!s.active) return;
    if (s.pointerId !== null && pointerId !== null && s.pointerId !== pointerId) return;
    const dx = clientX - s.startX;
    const dy = clientY - s.startY;
    if (!s.engaged) {
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
        s.active = false;
        setDragOffsetX(0);
        setIsSwiping(false);
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        s.engaged = true;
        setIsSwiping(true);
      }
    }
    if (s.engaged) {
      const atLeftEdge = page === 0 && dx > 0;
      const atRightEdge = page >= libraryPageIndex && dx < 0;
      const damped = atLeftEdge || atRightEdge ? dx * 0.28 : dx * 0.85;
      setDragOffsetX(Math.max(-140, Math.min(140, damped)));
    }
  };

  const handleSwipeEnd = (clientX: number, pointerId: number | null) => {
    const s = swipeRef.current;
    if (!s.active) return;
    if (s.pointerId !== null && pointerId !== null && s.pointerId !== pointerId) return;
    const dx = clientX - s.startX;
    const dt = Math.max(1, Date.now() - s.startTime);
    const velocity = Math.abs(dx) / dt;
    const wasEngaged = s.engaged;
    swipeRef.current = { active: false, engaged: false, pointerId: null, startX: 0, startY: 0, startTime: 0 };
    setDragOffsetX(0);
    setIsSwiping(false);

    if (wasEngaged) {
      suppressClickUntilRef.current = Date.now() + 220;
      if (Math.abs(dx) >= 48 || (velocity >= 0.42 && Math.abs(dx) >= 24)) {
        if (dx < 0 && page < libraryPageIndex) {
          setPage((p) => Math.min(libraryPageIndex, p + 1));
        } else if (dx > 0 && page > 0) {
          setPage((p) => Math.max(0, p - 1));
        }
      }
    }
  };

  const clampedPage = Math.min(page, libraryPageIndex);
  const currentPageApps = clampedPage < appPages.length ? appPages[clampedPage] : [];
  const gridColClass =
    cols === 6 ? 'grid-cols-6 gap-x-3 gap-y-3' : cols === 5 ? 'grid-cols-5 gap-x-1.5 gap-y-2.5' : 'grid-cols-4 gap-x-2 gap-y-2.5';

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col justify-between overflow-hidden px-4 pt-1.5 pb-2 select-none text-white touch-pan-y"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        handleSwipeStart(e.clientX, e.clientY, e.pointerId, e.target);
      }}
      onPointerMove={(e) => handleSwipeMove(e.clientX, e.clientY, e.pointerId)}
      onPointerUp={(e) => handleSwipeEnd(e.clientX, e.pointerId)}
      onPointerCancel={() => {
        swipeRef.current.active = false;
        setDragOffsetX(0);
        setIsSwiping(false);
      }}
      onClickCapture={(e) => {
        if (Date.now() < suppressClickUntilRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        className={`flex-1 min-h-0 flex flex-col overflow-hidden ${
          isSwiping ? '' : 'transition-transform duration-300 ease-out'
        }`}
        style={{ transform: dragOffsetX !== 0 ? `translateX(${dragOffsetX}px)` : undefined }}
      >
      {clampedPage < libraryPageIndex ? (
        <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto os-scroll-hidden">
          {/* Widgets on Page 0 */}
          {clampedPage === 0 && (
            <div className="space-y-2 mb-2.5 shrink-0">
              <div className={`grid grid-cols-2 gap-2.5 ${tabletMode ? 'max-w-2xl mx-auto w-full gap-3' : ''}`}>
                {widgets.map((w) => renderWidgetCard(w))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setWidgetEditorOpen((v) => !v)}
                  className="px-2.5 py-1 rounded-full bg-black/35 border border-white/15 text-[10px] text-white/80 flex items-center gap-1 hover:bg-black/50"
                >
                  <Plus className="w-3 h-3" /> {widgetEditorOpen ? 'Xong Widget' : 'Tùy chỉnh Widget'}
                </button>
              </div>
            </div>
          )}

          {/* Folders on Page 0 */}
          {clampedPage === 0 && foldersMap.size > 0 && (
            <div className={`grid ${gridColClass} mb-2`}>
              {Array.from(foldersMap.entries()).map(([fname, fapps]) => (
                <button
                  key={fname}
                  onClick={() => setOpenFolder(fname)}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                >
                  <div className="w-[52px] h-[52px] rounded-[16px] bg-black/40 backdrop-blur-xl border border-white/20 p-1.5 grid grid-cols-2 gap-0.5">
                    {fapps.slice(0, 4).map((fa) => (
                      <div key={fa.app_id} className="w-full h-full rounded bg-white/15 flex items-center justify-center">
                        <Folder className="w-3 h-3 text-purple-200" />
                      </div>
                    ))}
                  </div>
                  {showLabels && <span className="text-[11px] font-medium truncate w-full text-center">{fname}</span>}
                </button>
              ))}
            </div>
          )}

          {/* App Icon Grid */}
          <div className={`grid ${gridColClass} ${tabletMode ? 'max-w-3xl mx-auto w-full' : ''} py-1`}>
            {currentPageApps.map((app) => (
              <button
                key={app.app_id}
                onClick={() => safeOpenApp(app.app_id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setQuickActionApp(app);
                }}
                className="group flex flex-col items-center gap-1 active:scale-95 transition-transform"
                title="Chạm để mở · Chuột phải để mở Tác vụ nhanh"
              >
                <AppIconTile appId={app.app_id} iconScale={iconScale} badge={getBadge(app.app_id)} />
                {showLabels && (
                  <span className="text-[11px] font-medium text-white drop-shadow-sm truncate w-full text-center px-0.5">
                    {app.name}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-2 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="p-1.5 rounded-full bg-black/25 text-white/75 disabled:opacity-30"
                aria-label="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setGlobalSearchOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/15 text-[11px] text-white/90 hover:bg-black/50"
              >
                <Search className="w-3 h-3" />
                <span>Tìm kiếm</span>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(libraryPageIndex, p + 1))}
                disabled={clampedPage >= libraryPageIndex}
                className="p-1.5 rounded-full bg-black/25 text-white/75 disabled:opacity-30"
                aria-label="Trang sau"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5" data-no-swipe="true">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  onClick={() => setPage(idx)}
                  className={`h-2 rounded-full transition-all ${clampedPage === idx ? 'w-5 bg-white' : 'w-2 bg-white/40 hover:bg-white/65'}`}
                  aria-label={idx === libraryPageIndex ? 'Thư viện ứng dụng' : `Trang ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* App Library View */
        <div className="flex-1 flex flex-col overflow-hidden pb-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/15">
              <Search className="w-4 h-4 text-white/60" />
              <input
                value={libraryFilter}
                onChange={(e) => setLibraryFilter(e.target.value)}
                placeholder={`Tìm trong Thư viện (${allInstalledCount} ứng dụng)...`}
                className="bg-transparent text-xs text-white placeholder:text-white/50 outline-none flex-1"
              />
            </div>
            <button
              onClick={() => setPage(0)}
              className="px-3 py-2 rounded-2xl bg-black/45 border border-white/15 text-xs font-medium flex items-center gap-1"
            >
              <Grid2x2 className="w-3.5 h-3.5" />
              <span>Trang chính</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5 text-[11px]">
            <div className="flex items-center gap-1">
              {([
                { id: 'category', label: 'Danh mục' },
                { id: 'az', label: 'Tên A-Z' },
                { id: 'recent', label: 'Dùng nhiều' },
              ] as const).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLibrarySort(s.id)}
                  className={`px-2.5 py-1 rounded-xl font-medium ${
                    librarySort === s.id ? 'bg-white text-black' : 'bg-black/35 text-white/75 border border-white/15'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowHiddenInLib((v) => !v)}
              className={`px-2.5 py-1 rounded-xl border text-[10px] font-medium ${
                showHiddenInLib ? 'bg-violet-500/30 border-violet-300/40 text-white' : 'bg-black/35 border-white/15 text-white/60'
              }`}
            >
              {showHiddenInLib ? 'Đang hiện app ẩn' : 'Đang lọc app ẩn'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto os-scroll space-y-3 pr-1">
            {categories.map(([cat, list]) => (
              <div key={cat} className="p-3 rounded-3xl bg-black/35 backdrop-blur-xl border border-white/12">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <h3 className="text-xs font-semibold text-white/90">{cat}</h3>
                  <span className="text-[10px] text-white/50">{list.length} ứng dụng</span>
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {list.map((app) => (
                    <button
                      key={app.app_id}
                      onClick={() => openApp(app.app_id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setQuickActionApp(app);
                      }}
                      className={`flex flex-col items-center gap-1 ${app.hidden ? 'opacity-65' : ''}`}
                    >
                      <AppIconTile appId={app.app_id} size="sm" badge={getBadge(app.app_id)} />
                      <span className="text-[10px] text-white/85 truncate w-full text-center">
                        {app.name}{app.hidden ? ' (Ẩn)' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-2 shrink-0" data-no-swipe="true">
            {Array.from({ length: totalPages }, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                className={`h-2 rounded-full transition-all ${clampedPage === idx ? 'w-5 bg-white' : 'w-2 bg-white/40 hover:bg-white/65'}`}
                aria-label={idx === libraryPageIndex ? 'Thư viện ứng dụng' : `Trang ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Undo Layout Toast Bar */}
      {undoLayout && (
        <div className="mt-1.5 px-3 py-1.5 rounded-2xl bg-zinc-900/90 border border-white/15 flex items-center justify-between text-[11px] shrink-0">
          <span className="truncate text-white/80">Đã đổi: {undoLayout.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                await osApi.updateApp(undoLayout.appId, undoLayout.patch as Record<string, unknown>);
                setUndoLayout(null);
                await refreshData();
                showToast('Đã hoàn tác', 'Khôi phục vị trí ứng dụng vừa chỉnh.');
              }}
              className="text-amber-300 font-semibold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Hoàn tác
            </button>
            <button onClick={() => setUndoLayout(null)} className="text-white/50">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Persistent Dock (up to 5 slots) */}
      <div
        className={`mt-2 p-2.5 rounded-[26px] bg-black/35 backdrop-blur-2xl border border-white/15 grid gap-2 shrink-0 ${
          dockApps.length >= 5 ? 'grid-cols-5' : 'grid-cols-4'
        } ${tabletMode ? 'max-w-md mx-auto w-full' : ''}`}
      >
        {dockApps.map((app) => (
          <button
            key={app.app_id}
            onClick={() => openApp(app.app_id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setQuickActionApp(app);
            }}
            className="flex flex-col items-center justify-center active:scale-90 transition-transform"
            title={app.name}
          >
            <AppIconTile appId={app.app_id} iconScale={iconScale} badge={getBadge(app.app_id)} />
          </button>
        ))}
      </div>

      {/* Add Widget Picker Sheet */}
      {widgetEditorOpen && (
        <div className="mt-2 p-3 rounded-2xl bg-zinc-900/95 border border-white/15 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Thêm Widget nhanh</span>
            <button
              onClick={async () => {
                await osApi.resetHomeLayout();
                await refreshData();
                setWidgetEditorOpen(false);
                showToast('Đã khôi phục bố cục', 'Màn hình chính đã trở về bố cục mặc định.');
              }}
              className="text-[11px] text-amber-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Khôi phục mặc định
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => addWidget('banking_summary', 'Hikari Bank')}
              className="px-2.5 py-1.5 rounded-xl bg-[#E14B5A]/30 border border-rose-300/30 text-[11px] font-semibold shrink-0"
            >
              + Hikari Bank
            </button>
            <button
              onClick={() => addWidget('music_podcast', 'Nhạc & Podcast')}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-[11px] shrink-0"
            >
              + Nhạc & Podcast
            </button>
            <button
              onClick={() => addWidget('health_battery', 'Pin & Sức khỏe')}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-[11px] shrink-0"
            >
              + Pin & Sức khỏe
            </button>
            <button
              onClick={() => addWidget('notes_reminders', 'Ghi chú & Nhắc việc')}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-[11px] shrink-0"
            >
              + Ghi chú & Nhắc việc
            </button>
          </div>
        </div>
      )}

      {/* Open Folder Modal */}
      {openFolder && (
        <div
          onClick={() => {
            if (!folderDrag.wasJustDragged()) setOpenFolder(null);
          }}
          className="absolute inset-0 z-50 bg-black/65 backdrop-blur-xl flex items-center justify-center p-5"
        >
          <div
            ref={folderDrag.popupRef}
            style={folderDrag.popupStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl bg-zinc-900/95 border border-white/15 p-5 space-y-4 shadow-2xl"
          >
            <div
              {...folderDrag.handleProps}
              title="Kéo để di chuyển thư mục"
              className="flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <GripHorizontal className="w-4 h-4 text-zinc-400 shrink-0" />
                <h3 className="text-sm font-bold truncate">{openFolder}</h3>
              </div>
              <button onClick={() => setOpenFolder(null)} className="p-1 rounded-full bg-white/10 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(foldersMap.get(openFolder) || []).map((app) => (
                <button
                  key={app.app_id}
                  onClick={() => {
                    setOpenFolder(null);
                    openApp(app.app_id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setOpenFolder(null);
                    setQuickActionApp(app);
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <AppIconTile appId={app.app_id} size="md" badge={getBadge(app.app_id)} />
                  <span className="text-[11px] truncate w-full text-center">{app.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* App Quick Actions Modal */}
      {quickActionApp && (
        <div
          onClick={() => {
            if (!quickActionDrag.wasJustDragged()) setQuickActionApp(null);
          }}
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end p-4"
        >
          <div
            ref={quickActionDrag.popupRef}
            style={quickActionDrag.popupStyle}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-3xl bg-zinc-900 text-white border border-white/10 p-4 pt-2.5 space-y-2 shadow-2xl"
          >
            <div
              {...quickActionDrag.handleProps}
              title="Kéo để di chuyển"
              className="cursor-grab active:cursor-grabbing select-none space-y-2 pb-2 border-b border-white/10"
            >
              <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto" />
              <div className="flex items-center gap-3">
                <AppIconTile appId={quickActionApp.app_id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{quickActionApp.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    v{quickActionApp.version} · {quickActionApp.category} · Loại {quickActionApp.reality_type}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const target = quickActionApp.app_id;
                setQuickActionApp(null);
                openApp(target);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-xs font-medium text-left"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Mở {quickActionApp.name}</span>
            </button>
            <button
              onClick={() => handleToggleDock(quickActionApp)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-xs font-medium text-left"
            >
              <Pin className="w-4 h-4 text-sky-400" />
              <span>{quickActionApp.pinned_dock ? 'Bỏ ghim khỏi Dock' : 'Ghim vào Dock'}</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1">
              <input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Tên thư mục (vd: Tiện ích)..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 text-xs outline-none"
              />
              <button
                onClick={() => handleMoveToFolder(quickActionApp, folderInput)}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-[11px] font-semibold"
              >
                {quickActionApp.folder_name ? 'Đổi/Bỏ TM' : 'Vào TM'}
              </button>
            </div>
            <div className="flex items-center justify-between px-3 py-1 text-[11px]">
              <span className="text-zinc-400">Chuyển trang:</span>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((pg) => (
                  <button
                    key={pg}
                    onClick={() => handleMovePage(quickActionApp, pg)}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${
                      quickActionApp.page_index === pg ? 'bg-violet-600 text-white' : 'bg-white/10 text-zinc-300'
                    }`}
                  >
                    Trang {pg + 1}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleHideApp(quickActionApp)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-xs font-medium text-left"
            >
              <EyeOff className="w-4 h-4 text-amber-400" />
              <span>{quickActionApp.hidden ? 'Hiện lại lên Màn hình chính' : 'Ẩn khỏi màn hình chính'}</span>
            </button>
            <button
              onClick={() => handleUninstallApp(quickActionApp)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/20 text-xs font-medium text-rose-400 text-left"
            >
              <Trash2 className="w-4 h-4" />
              <span>Gỡ ứng dụng</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetControls({ w, onRefresh }: { w: HomeWidget; onRefresh: () => Promise<void> }) {
  return (
    <div className="absolute -top-1.5 -right-1.5 flex items-center gap-1 z-20">
      <button
        onClick={async (e) => {
          e.stopPropagation();
          await osApi.updateWidget(w.id, { size: w.size === '2x2' ? '4x2' : '2x2' });
          await onRefresh();
        }}
        className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center shadow"
        title="Đổi kích thước 2x2 / 4x2"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          await osApi.deleteWidget(w.id);
          await onRefresh();
        }}
        className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"
        title="Xóa Widget"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

