import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Home,
  Package,
  RefreshCw,
  ShoppingBag,
  Smartphone,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { BANKING_SYNC_EVENT, osApi, TELECOM_SYNC_EVENT } from '../services/api';
import type {
  TelecomCarrier,
  TelecomCatalogSim,
  TelecomOverviewPayload,
  TelecomPackage,
  TelecomTransaction,
  TelecomUserSim,
} from '../types/os';
import { CarrierDetailModal } from '../components/telecom/CarrierBrand';
import {
  TelecomBillModal,
  TelecomHistoryDrawer,
  TelecomNotificationsDrawer,
  TelecomProfileSettingsModal,
} from '../components/telecom/TelecomHistoryAndBillModal';
import { TelecomHomeView } from '../components/telecom/TelecomHomeView';
import { TelecomMySimsView } from '../components/telecom/TelecomMySimsView';
import { TelecomPackagesView } from '../components/telecom/TelecomPackagesView';
import { TelecomStoreView } from '../components/telecom/TelecomStoreView';
import { TelecomTopupModal } from '../components/telecom/TelecomTopupModal';

type TelecomTab = 'home' | 'store' | 'mysims' | 'packages';

export function AnimeTelecomApp() {
  const {
    data,
    refreshData,
    showToast,
    requestConfirm,
    openShareSheet,
    openApp,
    appParams,
    registerBackHandler,
  } = useOS();

  const [overview, setOverview] = useState<TelecomOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TelecomTab>('home');
  const [storeCarrierId, setStoreCarrierId] = useState<string>('all');
  const [pkgCarrierId, setPkgCarrierId] = useState<string>('all');
  const [pkgSimId, setPkgSimId] = useState<string | undefined>(undefined);

  // Modals & Drawers
  const [selectedCarrierModal, setSelectedCarrierModal] = useState<TelecomCarrier | null>(null);
  const [selectedCatalogSim, setSelectedCatalogSim] = useState<TelecomCatalogSim | null>(null);
  const [selectedUserSim, setSelectedUserSim] = useState<TelecomUserSim | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<TelecomPackage | null>(null);

  const [topupModalState, setTopupModalState] = useState<{ open: boolean; simId?: string; amount?: number }>({
    open: false,
  });
  const [historyState, setHistoryState] = useState<{ open: boolean; simId?: string }>({ open: false });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [billTx, setBillTx] = useState<TelecomTransaction | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await osApi.telecom.getOverview();
      setOverview(res);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Anime Telecom.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Two-way sync: whenever Hikari Bank updates SIM/balance/cards, refresh Anime Telecom immediately
  useEffect(() => {
    const onSync = () => {
      void loadOverview();
    };
    window.addEventListener(TELECOM_SYNC_EVENT, onSync);
    window.addEventListener(BANKING_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener(TELECOM_SYNC_EVENT, onSync);
      window.removeEventListener(BANKING_SYNC_EVENT, onSync);
    };
  }, [loadOverview]);

  // Support OS deep links
  useEffect(() => {
    if (!appParams) return;
    if (appParams.tab === 'store' || appParams.tab === 'mysims' || appParams.tab === 'packages' || appParams.tab === 'home') {
      setActiveTab(appParams.tab as TelecomTab);
    }
    if (appParams.carrierId) {
      setStoreCarrierId(String(appParams.carrierId));
      setPkgCarrierId(String(appParams.carrierId));
    }
    if (appParams.simId) {
      setPkgSimId(String(appParams.simId));
    }
  }, [appParams]);

  // Android Back Button stack
  useEffect(() => {
    return registerBackHandler(() => {
      if (billTx) {
        setBillTx(null);
        return true;
      }
      if (topupModalState.open) {
        setTopupModalState({ open: false });
        return true;
      }
      if (selectedCatalogSim) {
        setSelectedCatalogSim(null);
        return true;
      }
      if (selectedUserSim) {
        setSelectedUserSim(null);
        return true;
      }
      if (selectedPackage) {
        setSelectedPackage(null);
        return true;
      }
      if (selectedCarrierModal) {
        setSelectedCarrierModal(null);
        return true;
      }
      if (historyState.open) {
        setHistoryState({ open: false });
        return true;
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        return true;
      }
      if (profileOpen) {
        setProfileOpen(false);
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    });
  }, [
    registerBackHandler,
    billTx,
    topupModalState.open,
    selectedCatalogSim,
    selectedUserSim,
    selectedPackage,
    selectedCarrierModal,
    historyState.open,
    notificationsOpen,
    profileOpen,
    activeTab,
  ]);

  const handleOverviewSync = useCallback(
    (next: TelecomOverviewPayload, openTx?: TelecomTransaction) => {
      setOverview(next);
      if (openTx) setBillTx(openTx);
      void refreshData();
    },
    [refreshData]
  );

  const unreadNotifCount = useMemo(
    () => (overview?.notifications || []).filter((n) => !n.is_read).length,
    [overview?.notifications]
  );

  const userName = overview?.bankAccounts?.[0]?.holder_name || data?.profile?.name || 'Minh Anh';
  const userAvatar = data?.profile?.avatar || '';

  if (loading && !overview) {
    return (
      <div className="h-full p-4 space-y-4 animate-pulse bg-slate-50 dark:bg-[#0D0D14]">
        <div className="flex items-center justify-between">
          <div className="h-10 w-44 rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="h-10 w-24 rounded-2xl bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="h-44 rounded-3xl bg-indigo-500/20" />
        <div className="h-24 rounded-2xl bg-slate-200 dark:bg-white/10" />
        <div className="h-40 rounded-2xl bg-slate-200 dark:bg-white/10" />
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div className="h-full p-6 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 dark:bg-[#0D0D14] text-slate-900 dark:text-slate-100">
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <h2 className="text-sm font-black">Không thể kết nối Anime Telecom</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{loadError || 'Lỗi hệ thống'}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadOverview();
          }}
          className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    );
  }

  const navItems: Array<{ id: TelecomTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'store', label: 'Chọn SIM', icon: ShoppingBag },
    { id: 'mysims', label: 'SIM của tôi', icon: Smartphone },
    { id: 'packages', label: 'Gói cước', icon: Package },
  ];

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-slate-50 dark:bg-[#0D0D14] text-slate-900 dark:text-slate-100">
      <main className="flex-1 min-h-0 overflow-y-auto os-scroll">
        {activeTab === 'home' && (
          <TelecomHomeView
            userName={userName}
            userAvatar={userAvatar}
            primarySim={overview.primarySim}
            userSims={overview.userSims}
            carriers={overview.carriers}
            catalog={overview.catalog}
            packages={overview.packages}
            transactions={overview.transactions}
            unreadNotifCount={unreadNotifCount}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenProfileSettings={() => setProfileOpen(true)}
            onOpenTopup={(simId) => setTopupModalState({ open: true, simId })}
            onNavigateTab={(tab, opts) => {
              if (opts?.carrierId) {
                setStoreCarrierId(opts.carrierId);
                setPkgCarrierId(opts.carrierId);
              }
              if (opts?.simId) setPkgSimId(opts.simId);
              setActiveTab(tab);
            }}
            onOpenCarrierModal={(c) => setSelectedCarrierModal(c)}
            onSelectSimDetail={(sim) => setSelectedUserSim(sim)}
            onSelectCatalogSim={(sim) => setSelectedCatalogSim(sim)}
            onSelectPackage={(pkg) => setSelectedPackage(pkg)}
            onOpenHistory={(simId) => setHistoryState({ open: true, simId })}
            onOpenBill={(tx) => setBillTx(tx)}
          />
        )}

        {activeTab === 'store' && (
          <TelecomStoreView
            carriers={overview.carriers}
            catalog={overview.catalog}
            accounts={overview.bankAccounts}
            cards={overview.bankCards}
            initialCarrierId={storeCarrierId}
            selectedCatalogSim={selectedCatalogSim}
            onSelectCatalogSim={setSelectedCatalogSim}
            onPurchaseSuccess={handleOverviewSync}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'mysims' && (
          <TelecomMySimsView
            carriers={overview.carriers}
            userSims={overview.userSims}
            selectedSim={selectedUserSim}
            onSelectSim={setSelectedUserSim}
            onOverviewUpdate={(res) => handleOverviewSync(res)}
            onOpenTopup={(simId) => setTopupModalState({ open: true, simId })}
            onOpenBuyPackages={(simId, cid) => {
              setPkgSimId(simId);
              setPkgCarrierId(cid);
              setActiveTab('packages');
            }}
            onOpenSimHistory={(simId) => setHistoryState({ open: true, simId })}
            onOpenStore={() => setActiveTab('store')}
            onShowToast={showToast}
            onRequestConfirm={requestConfirm}
          />
        )}

        {activeTab === 'packages' && (
          <TelecomPackagesView
            carriers={overview.carriers}
            packages={overview.packages}
            userSims={overview.userSims}
            initialCarrierId={pkgCarrierId}
            initialSimId={pkgSimId}
            selectedPackage={selectedPackage}
            onSelectPackage={setSelectedPackage}
            onOverviewUpdate={handleOverviewSync}
            onQuickTopupSim={(simId, amt) => setTopupModalState({ open: true, simId, amount: amt })}
            onOpenStoreForCarrier={(cid) => {
              setStoreCarrierId(cid);
              setActiveTab('store');
            }}
            onShowToast={showToast}
            onRequestConfirm={requestConfirm}
          />
        )}
      </main>

      {/* Fixed 4-Tab Bottom Navigation */}
      <nav
        aria-label="Điều hướng Anime Telecom"
        className="shrink-0 mx-3 mb-2.5 mt-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#161621]/95 backdrop-blur-md shadow-lg px-1.5 py-1"
      >
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[46px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'bg-indigo-600/12 text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="text-[10px] font-bold leading-tight whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Drawers */}
      <CarrierDetailModal
        carrier={selectedCarrierModal}
        simCount={
          selectedCarrierModal
            ? overview.catalog.filter((s) => s.carrier_id === selectedCarrierModal.id && s.status === 'available').length
            : 0
        }
        packageCount={
          selectedCarrierModal
            ? overview.packages.filter((p) => p.carrier_id === selectedCarrierModal.id).length
            : 0
        }
        onClose={() => setSelectedCarrierModal(null)}
        onBrowseSims={(cid) => {
          setStoreCarrierId(cid);
          setActiveTab('store');
        }}
        onBrowsePackages={(cid) => {
          setPkgCarrierId(cid);
          setActiveTab('packages');
        }}
      />

      <TelecomTopupModal
        open={topupModalState.open}
        initialSimId={topupModalState.simId}
        initialAmount={topupModalState.amount}
        carriers={overview.carriers}
        userSims={overview.userSims}
        accounts={overview.bankAccounts}
        cards={overview.bankCards}
        onClose={() => setTopupModalState({ open: false })}
        onSuccess={handleOverviewSync}
        onShowToast={showToast}
      />

      <TelecomHistoryDrawer
        open={historyState.open}
        initialSimId={historyState.simId}
        transactions={overview.transactions}
        carriers={overview.carriers}
        userSims={overview.userSims}
        onClose={() => setHistoryState({ open: false })}
        onOpenBill={(tx) => {
          setHistoryState({ open: false });
          setBillTx(tx);
        }}
      />

      <TelecomNotificationsDrawer
        open={notificationsOpen}
        notifications={overview.notifications}
        onClose={() => setNotificationsOpen(false)}
        onMarkAllRead={async () => {
          try {
            const res = await osApi.telecom.markNotificationsRead();
            setOverview(res);
          } catch {
            // ignore
          }
        }}
      />

      <TelecomProfileSettingsModal
        open={profileOpen}
        userName={userName}
        userAvatar={userAvatar}
        bankAccounts={overview.bankAccounts}
        userSims={overview.userSims}
        onClose={() => setProfileOpen(false)}
        onSyncNow={async () => {
          await loadOverview();
          await refreshData();
          showToast('Đã đồng bộ', 'Dữ liệu Anime Telecom & Hikari Bank đã cập nhật mới nhất.', 'success');
        }}
        onOpenBankingApp={() => openApp('banking', { tab: 'topup' })}
        onOpenHistory={() => setHistoryState({ open: true })}
      />

      <TelecomBillModal
        tx={billTx}
        carriers={overview.carriers}
        userName={userName}
        onClose={() => setBillTx(null)}
        onShare={openShareSheet}
        onShowToast={showToast}
      />
    </div>
  );
}
