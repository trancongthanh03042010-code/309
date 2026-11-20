import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  CreditCard,
  Fingerprint,
  GripHorizontal,
  Home,
  KeyRound,
  Landmark,
  Lock,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { useDraggablePopup } from '../components/os/useDraggablePopup';
import { BANKING_SYNC_EVENT, osApi, TELECOM_SYNC_EVENT } from '../services/api';
import type { BankingAccountDemo, BankingOverviewPayload, BankingTransactionDemo } from '../types/os';
import { AccountsAndCardsView } from '../components/banking/AccountsAndCardsView';
import { BankingHomeView, type HomeNavTarget } from '../components/banking/BankingHomeView';
import { BillPreviewModal } from '../components/banking/BillArchiveAndPreviewModal';
import {
  getThemePalette,
  HikariAssistantModal,
  HikariLogo,
  HikariStarIcon,
} from '../components/banking/HikariBrand';
import {
  BankingNotificationsView,
  ProfileSecurityView,
} from '../components/banking/ProfileSecurityAndNotifView';
import { ReceiveAndCharRequestView } from '../components/banking/ReceiveAndCharRequestView';
import { SavingsAndLoansView } from '../components/banking/SavingsAndLoansView';
import { TransactionDetailModal } from '../components/banking/TransactionDetailModal';
import { TransactionsAndBillsView } from '../components/banking/TransactionsAndBillsView';
import {
  createInitialTransferDraft,
  TransferFlowView,
  type TransferDraftState,
} from '../components/banking/TransferFlowView';
import { resolveDefaultPaymentSource } from '../components/banking/PaymentSourceSelector';
import { HIKARI_AVATAR_TELLER } from '../components/banking/utils';

type MainTab = 'home' | 'transfer' | 'transactions' | 'finance' | 'profile';
type TransferMode = 'send' | 'receive';

const QR_TEST_PRESETS = [
  {
    id: 'qr_yuki',
    label: 'Yuki Shirakawa · Hikari Sim-QR',
    sub: 'HIKARI_OS|8800-2026-7712|Yuki|250000|Moi Yuki uong tra sua',
    payload: 'HIKARI_OS|8800-2026-7712|Yuki|250000|Moi Yuki uong tra sua',
  },
  {
    id: 'qr_sakura',
    label: 'Sakura · Hikari Sim-QR',
    sub: 'HIKARI_OS|8800-2026-1111|Sakura|500000|Chuyen tien mua hoa Sakura',
    payload: 'HIKARI_OS|8800-2026-1111|Sakura|500000|Chuyen tien mua hoa Sakura',
  },
  {
    id: 'qr_highlands',
    label: 'Highlands Coffee POS · Demo QR',
    sub: 'Techcombank · 1903881122001 · 125.000đ',
    direct: {
      accountNumber: '1903881122001',
      bankCode: 'TCB',
      name: 'HIGHLANDS COFFEE VIETNAM',
      amount: 125000,
      note: 'Thanh toan cafe Highlands POS',
    },
  },
];

export function BankingApp() {
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

  const [overview, setOverview] = useState<BankingOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [transferMode, setTransferMode] = useState<TransferMode>('send');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [hideBalance, setHideBalance] = useState(false);

  // Lifted transfer draft so edits persist across tabs
  const [transferDraft, setTransferDraft] = useState<TransferDraftState>(() =>
    createInitialTransferDraft('bank_1')
  );

  // Onboarding state
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  const qrModalDrag = useDraggablePopup({
    clampMode: 'header',
    padding: 8,
    handleHeight: 48,
    minVisibleX: 140,
  });

  // Sub-sections & deep-link routing state
  const [txSubTab, setTxSubTab] = useState<'history' | 'archive' | 'bills' | 'topup'>('history');
  const [financeMode, setFinanceMode] = useState<'accounts_cards' | 'savings_loans'>('accounts_cards');
  const [accountsSection, setAccountsSection] = useState<'accounts' | 'cards' | 'investments' | 'expenses'>('cards');
  const [accountsCardMode, setAccountsCardMode] = useState<'cards' | 'benefits'>('cards');
  const [savLoansTab, setSavLoansTab] = useState<'savings' | 'loans'>('savings');
  const [aiCharLoanId, setAiCharLoanId] = useState<string | null>(null);
  const [profileSection, setProfileSection] = useState<'profile' | 'security' | 'qr' | 'support'>('profile');
  const [subNonce, setSubNonce] = useState(0);

  const [transferPreset, setTransferPreset] = useState<{
    accountNumber?: string;
    bankCode?: string;
    name?: string;
    amount?: number;
    note?: string;
    characterId?: string;
  } | null>(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Two-stage Transaction Detail -> PNG Receipt modal pipeline
  const [detailTx, setDetailTx] = useState<BankingTransactionDemo | null>(null);
  const [previewBillTx, setPreviewBillTx] = useState<BankingTransactionDemo | null>(null);

  // QR Scanner Modal
  const [qrScanModalOpen, setQrScanModalOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrValidating, setQrValidating] = useState(false);

  // App Lock Gate state
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const [unlockMode, setUnlockMode] = useState<'pin' | 'password'>('pin');
  const [unlockSecret, setUnlockSecret] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const inactivityTimerRef = useRef<number | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await osApi.banking.getOverview();
      setOverview(res);
      setHideBalance(Boolean(res.preferences?.privacy_hide_balance));
      setOnboardingName(res.account?.holder_name || 'Minh Anh');
      const defSource = resolveDefaultPaymentSource(res.accounts || [], res.cards || []);
      setTransferDraft((prev) => {
        if (prev.step !== 1 || prev.accountNumber) return prev;
        return {
          ...prev,
          sourceId: defSource.accountId,
          sourceCardId: defSource.cardId,
        };
      });
      if (res.security && !res.security.app_lock_enabled && !res.security.is_logged_out) {
        setSessionUnlocked(true);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ Hikari Bank.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const onTelecomSync = (evt: Event) => {
      const detail = (evt as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'banking') {
        void loadOverview();
      }
    };
    const onBankingSync = (evt: Event) => {
      const detail = (evt as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'banking') {
        void loadOverview();
      }
    };
    window.addEventListener(TELECOM_SYNC_EVENT, onTelecomSync);
    window.addEventListener(BANKING_SYNC_EVENT, onBankingSync);
    return () => {
      window.removeEventListener(TELECOM_SYNC_EVENT, onTelecomSync);
      window.removeEventListener(BANKING_SYNC_EVENT, onBankingSync);
    };
  }, [loadOverview]);

  useEffect(() => {
    return registerBackHandler(() => {
      if (assistantOpen) {
        setAssistantOpen(false);
        return true;
      }
      if (previewBillTx) {
        setPreviewBillTx(null);
        return true;
      }
      if (detailTx) {
        setDetailTx(null);
        return true;
      }
      if (qrScanModalOpen) {
        setQrScanModalOpen(false);
        return true;
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        return true;
      }
      return false;
    });
  }, [
    registerBackHandler,
    assistantOpen,
    previewBillTx,
    detailTx,
    qrScanModalOpen,
    notificationsOpen,
  ]);

  const theme = useMemo(
    () => getThemePalette(overview?.preferences?.theme_id),
    [overview?.preferences?.theme_id]
  );

  // Inactivity Auto-Lock
  useEffect(() => {
    const lockEnabled = overview?.security?.app_lock_enabled === 1;
    const idleSec = Number(overview?.preferences?.inactivity_lock_sec ?? 0);
    if (!lockEnabled || !sessionUnlocked || idleSec <= 0) {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      return;
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = window.setTimeout(() => {
        setSessionUnlocked(false);
      }, idleSec * 1000);
    };

    resetTimer();
    window.addEventListener('pointerdown', resetTimer, { passive: true });
    window.addEventListener('keydown', resetTimer);
    return () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [overview?.security?.app_lock_enabled, overview?.preferences?.inactivity_lock_sec, sessionUnlocked]);

  // Honor OS deep-links: tab, txId, bankingAction, prefillCharId
  useEffect(() => {
    if (!appParams) return;
    const t = appParams.tab;
    const action = appParams.bankingAction;
    const targetCharId = appParams.prefillCharId || appParams.characterId;

    if (targetCharId && overview?.aiAccounts?.length) {
      const charAcc = overview.aiAccounts.find(
        (a) => a.character_id === targetCharId || a.id === targetCharId
      );
      if (action === 'char_request' || t === 'char_request') {
        setTransferMode('receive');
        setActiveTab('transfer');
      } else if (action === 'transfer' || t === 'transfer') {
        if (charAcc) {
          setTransferPreset({
            accountNumber: charAcc.account_number,
            bankCode: 'HIKARI',
            name: charAcc.holder_name,
            characterId: charAcc.character_id,
          });
        }
        setTransferMode('send');
        setActiveTab('transfer');
      }
    }

    if (t === 'transfer') {
      setTransferMode('send');
      setActiveTab('transfer');
    } else if (t === 'receive' || t === 'char_request') {
      setTransferMode('receive');
      setActiveTab('transfer');
    } else if (t === 'bills') {
      setActiveTab('transactions');
      setTxSubTab('bills');
      setSubNonce((n) => n + 1);
    } else if (t === 'topup') {
      setActiveTab('transactions');
      setTxSubTab('topup');
      setSubNonce((n) => n + 1);
    } else if (t === 'history') {
      setActiveTab('transactions');
      setTxSubTab('history');
      setSubNonce((n) => n + 1);
    } else if (t === 'archive') {
      setActiveTab('transactions');
      setTxSubTab('archive');
      setSubNonce((n) => n + 1);
    } else if (t === 'cards') {
      setActiveTab('finance');
      setFinanceMode('accounts_cards');
      setAccountsSection('cards');
      setSubNonce((n) => n + 1);
    } else if (t === 'savings') {
      setActiveTab('finance');
      setFinanceMode('savings_loans');
      setSavLoansTab('savings');
      setSubNonce((n) => n + 1);
    } else if (t === 'loans') {
      setActiveTab('finance');
      setFinanceMode('savings_loans');
      setSavLoansTab('loans');
      setSubNonce((n) => n + 1);
    } else if (t === 'security') {
      setActiveTab('profile');
      setProfileSection('security');
      setSubNonce((n) => n + 1);
    } else if (t === 'support') {
      setActiveTab('profile');
      setProfileSection('support');
      setSubNonce((n) => n + 1);
    }
  }, [appParams, overview?.aiAccounts]);

  useEffect(() => {
    const targetId = appParams?.txId;
    if (!targetId) return;
    if (overview?.transactions?.length) {
      const matched = overview.transactions.find((t) => t.id === targetId || t.ref_code === targetId);
      if (matched) {
        setDetailTx(matched);
        return;
      }
    }
    if (overview) {
      osApi.banking
        .verifyTx(targetId)
        .then((res) => {
          if (res?.transaction) setDetailTx(res.transaction);
        })
        .catch(() => {});
    }
  }, [appParams?.txId, overview]);

  const handleOverviewUpdate = useCallback(
    (payload: BankingOverviewPayload) => {
      setOverview(payload);
      if (detailTx) {
        const refreshedDetail = payload.transactions.find((t) => t.id === detailTx.id);
        if (refreshedDetail) setDetailTx(refreshedDetail);
      }
      if (previewBillTx) {
        const refreshedBill = payload.transactions.find((t) => t.id === previewBillTx.id);
        if (refreshedBill) setPreviewBillTx(refreshedBill);
      }
      void refreshData();
    },
    [detailTx, previewBillTx, refreshData]
  );

  const activeAccount = useMemo(() => {
    if (!overview) return null;
    if (selectedAccountId) {
      const found = overview.accounts.find((a) => a.id === selectedAccountId);
      if (found) return found;
    }
    return overview.account || overview.accounts[0] || null;
  }, [overview, selectedAccountId]);

  const unreadNotifCount = useMemo(
    () => (overview?.notifications || []).filter((n) => !n.is_read).length,
    [overview?.notifications]
  );

  const handleToggleHideBalance = async () => {
    const next = !hideBalance;
    setHideBalance(next);
    try {
      const res = await osApi.banking.updatePreferences({ privacy_hide_balance: next ? 1 : 0 });
      setOverview(res);
    } catch {
      // keep optimistic local state
    }
  };

  const handleDismissBanner = async () => {
    try {
      const res = await osApi.banking.updatePreferences({ hikari_banner_dismissed: 1 });
      setOverview(res);
    } catch {
      // ignore
    }
  };

  const handleResetUi = async () => {
    try {
      const res = await osApi.banking.resetUi();
      setOverview(res);
      setHideBalance(Boolean(res.preferences?.privacy_hide_balance));
      showToast('Đã đặt lại giao diện', 'Khôi phục chủ đề Hikari Coral mặc định.', 'success');
    } catch (err) {
      showToast('Lỗi đặt lại giao diện', err instanceof Error ? err.message : 'Thất bại', 'error');
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingBusy(true);
    try {
      const res = await osApi.banking.completeOnboarding({
        holder_name: onboardingName.trim() || undefined,
      });
      setOverview(res);
      showToast('Chào mừng đến Hikari Bank', 'Tài khoản mô phỏng đã sẵn sàng!', 'success');
    } catch (err) {
      showToast('Không thể hoàn tất', err instanceof Error ? err.message : 'Thử lại sau', 'error');
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleQuickCharTransfer = useCallback((ai: BankingAccountDemo) => {
    setTransferPreset({
      accountNumber: ai.account_number,
      bankCode: 'HIKARI',
      name: ai.holder_name,
      characterId: ai.character_id,
    });
    setTransferMode('send');
    setActiveTab('transfer');
  }, []);

  const handleHomeNavigate = useCallback((target: HomeNavTarget) => {
    switch (target) {
      case 'transfer':
        setTransferPreset(null);
        setTransferMode('send');
        setActiveTab('transfer');
        break;
      case 'receive':
        setTransferMode('receive');
        setActiveTab('transfer');
        break;
      case 'qr':
        setQrScanModalOpen(true);
        break;
      case 'bills':
        setActiveTab('transactions');
        setTxSubTab('bills');
        setSubNonce((n) => n + 1);
        break;
      case 'topup':
        setActiveTab('transactions');
        setTxSubTab('topup');
        setSubNonce((n) => n + 1);
        break;
      case 'history':
        setActiveTab('transactions');
        setTxSubTab('history');
        setSubNonce((n) => n + 1);
        break;
      case 'archive':
        setActiveTab('transactions');
        setTxSubTab('archive');
        setSubNonce((n) => n + 1);
        break;
      case 'accounts':
        setActiveTab('finance');
        setFinanceMode('accounts_cards');
        setAccountsSection('accounts');
        setSubNonce((n) => n + 1);
        break;
      case 'cards':
        setActiveTab('finance');
        setFinanceMode('accounts_cards');
        setAccountsSection('cards');
        setAccountsCardMode('cards');
        setSubNonce((n) => n + 1);
        break;
      case 'card_benefits':
        setActiveTab('finance');
        setFinanceMode('accounts_cards');
        setAccountsSection('cards');
        setAccountsCardMode('benefits');
        setSubNonce((n) => n + 1);
        break;
      case 'investments':
        setActiveTab('finance');
        setFinanceMode('accounts_cards');
        setAccountsSection('investments');
        setSubNonce((n) => n + 1);
        break;
      case 'expenses':
        setActiveTab('finance');
        setFinanceMode('accounts_cards');
        setAccountsSection('expenses');
        setSubNonce((n) => n + 1);
        break;
      case 'savings':
        setActiveTab('finance');
        setFinanceMode('savings_loans');
        setSavLoansTab('savings');
        setSubNonce((n) => n + 1);
        break;
      case 'loans':
        setActiveTab('finance');
        setFinanceMode('savings_loans');
        setSavLoansTab('loans');
        setSubNonce((n) => n + 1);
        break;
      case 'notifications':
        setNotificationsOpen(true);
        break;
      case 'settings':
        setActiveTab('profile');
        setProfileSection('profile');
        setSubNonce((n) => n + 1);
        break;
      case 'support':
        setActiveTab('profile');
        setProfileSection('support');
        setSubNonce((n) => n + 1);
        break;
    }
  }, []);

  const handleValidateQrPayload = async (rawPayload: string) => {
    const clean = rawPayload.trim();
    if (!clean) return;
    setQrValidating(true);
    try {
      const res = await osApi.banking.validateQr(clean);
      setQrScanModalOpen(false);
      setQrInput('');
      setTransferPreset({
        accountNumber: res.accountNumber,
        bankCode: res.bankCode || 'HIKARI',
        name: res.recipientName,
        amount: res.amount || undefined,
        note: res.note || undefined,
      });
      setTransferMode('send');
      setActiveTab('transfer');
      showToast('Quét Sim-QR thành công', `Đã nhận diện tài khoản ${res.recipientName}.`, 'success');
    } catch (err) {
      showToast('Mã QR chưa hợp lệ', err instanceof Error ? err.message : 'Không đọc được mã QR.', 'error');
    } finally {
      setQrValidating(false);
    }
  };

  const handleUnlock = async (method: 'pin' | 'password' | 'biometric') => {
    if (method !== 'biometric' && !unlockSecret.trim()) {
      showToast('Thiếu thông tin', method === 'pin' ? 'Nhập mã PIN 6 số.' : 'Nhập mật khẩu đăng nhập.', 'error');
      return;
    }
    setUnlockBusy(true);
    try {
      const res = await osApi.banking.unlockApp(unlockSecret.trim(), method);
      setOverview(res);
      setSessionUnlocked(true);
      setUnlockSecret('');
      showToast('Mở khóa thành công', 'Chào mừng trở lại Hikari Bank (ひかり銀行).', 'success');
    } catch (err) {
      showToast('Xác thực thất bại', err instanceof Error ? err.message : 'Sai mã xác thực', 'error');
    } finally {
      setUnlockBusy(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className={`h-full p-4 space-y-4 animate-pulse ${theme.pageBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-400/30" />
            <div className="space-y-1.5">
              <div className="w-28 h-3 rounded bg-rose-400/25" />
              <div className="w-40 h-4 rounded bg-rose-400/25" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-400/25" />
            <div className="w-9 h-9 rounded-xl bg-rose-400/25" />
          </div>
        </div>
        <div className="h-44 rounded-3xl bg-[#E14B5A]/20" />
        <div className={`h-28 rounded-2xl border ${theme.cardBg}`} />
        <div className={`h-44 rounded-2xl border ${theme.cardBg}`} />
      </div>
    );
  }

  if (loadError || !overview?.account) {
    return (
      <div className={`h-full p-6 flex flex-col items-center justify-center text-center space-y-3 ${theme.pageBg}`}>
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${theme.badgeDanger}`}>
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className={`text-sm font-bold ${theme.textPrimary}`}>Không thể tải dữ liệu Hikari Bank</h2>
        <p className={`text-xs max-w-xs ${theme.textSecondary}`}>
          {loadError || 'Không tìm thấy tài khoản ngân hàng mô phỏng.'}
        </p>
        <button
          type="button"
          onClick={() => void loadOverview()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    );
  }

  // App Lock Gate
  const isLocked =
    overview.security?.is_logged_out === 1 || (overview.security?.app_lock_enabled === 1 && !sessionUnlocked);

  if (isLocked) {
    return (
      <div className={`h-full bg-gradient-to-br ${theme.heroGradient} text-white p-6 flex flex-col justify-between`}>
        <div className="pt-6 text-center space-y-2.5">
          <div className="flex justify-center">
            <HikariLogo variant="white" size={56} />
          </div>
          <h2 className="text-lg font-extrabold tracking-tight flex items-center justify-center gap-1.5">
            <span>HIKARI BANK</span>
            <span className="text-xs font-semibold opacity-85">ひかり銀行</span>
          </h2>
          <p className="text-xs text-rose-100/90">
            Xin chào, <strong>{overview.account.holder_name}</strong>. Vui lòng xác thực để tiếp tục.
          </p>
        </div>

        <div className="bg-black/25 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/25">
            <button
              type="button"
              onClick={() => {
                setUnlockMode('pin');
                setUnlockSecret('');
              }}
              className={`min-h-[40px] py-2 rounded-lg text-xs font-bold ${
                unlockMode === 'pin' ? 'bg-[#E14B5A] text-white' : 'text-white/75'
              }`}
            >
              Mã PIN (6 số)
            </button>
            <button
              type="button"
              onClick={() => {
                setUnlockMode('password');
                setUnlockSecret('');
              }}
              className={`min-h-[40px] py-2 rounded-lg text-xs font-bold ${
                unlockMode === 'password' ? 'bg-[#E14B5A] text-white' : 'text-white/75'
              }`}
            >
              Mật khẩu
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              inputMode={unlockMode === 'pin' ? 'numeric' : 'text'}
              maxLength={unlockMode === 'pin' ? 6 : 32}
              value={unlockSecret}
              onChange={(e) =>
                setUnlockSecret(
                  unlockMode === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value
                )
              }
              placeholder={unlockMode === 'pin' ? 'Nhập mã PIN (mặc định 123456)' : 'Nhập mật khẩu'}
              className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/15 text-sm font-bold text-center tracking-widest outline-none placeholder:tracking-normal placeholder:font-normal placeholder:text-white/45"
            />

            <button
              type="button"
              disabled={unlockBusy}
              onClick={() => void handleUnlock(unlockMode)}
              className="w-full min-h-[46px] rounded-xl bg-white text-slate-900 text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>{unlockBusy ? 'Đang xác thực...' : 'Mở khóa Hikari Bank'}</span>
            </button>

            {overview.security?.biometric_enabled === 1 && (
              <button
                type="button"
                disabled={unlockBusy}
                onClick={() => void handleUnlock('biometric')}
                className="w-full min-h-[44px] rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Fingerprint className="w-4 h-4 text-amber-200" />
                <span>Mở khóa nhanh bằng Sinh trắc học</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-center text-white/70 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-200" />
          Bảo vệ bởi Hikari Security Shield · MÔ PHỎNG PHONE OS
        </p>
      </div>
    );
  }

  // First-time Welcome Onboarding Screen
  if (overview.preferences && !overview.preferences.onboarding_completed) {
    return (
      <div className={`h-full overflow-y-auto os-scroll flex flex-col justify-between p-5 ${theme.pageBg}`}>
        <div className={`rounded-3xl bg-gradient-to-br ${theme.heroGradient} text-white p-5 shadow-xl space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HikariLogo variant="white" size={44} />
              <div>
                <p className="text-[11px] uppercase tracking-widest text-rose-100 font-bold">ひかり銀行 · Phone OS</p>
                <h1 className="text-lg font-extrabold tracking-tight">HIKARI BANK 3.0</h1>
              </div>
            </div>
            <HikariStarIcon className="w-5 h-5 text-amber-200" />
          </div>

          <div className="flex items-center gap-3.5 bg-black/20 rounded-2xl p-3 border border-white/15">
            <img
              src={HIKARI_AVATAR_TELLER}
              alt="Hikari-chan"
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/40 shrink-0"
            />
            <div className="text-xs leading-relaxed">
              <p className="font-extrabold text-amber-200">Xin chào, mình là Hikari-chan!</p>
              <p className="text-rose-50/90 mt-0.5">
                “Your Life, Your Journey.” Mình sẽ đồng hành cùng bạn quản lý tài khoản, biên lai PNG sắc nét và giao dịch hai chiều với các nhân vật CHAR.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleCompleteOnboarding} className={`rounded-3xl border p-5 space-y-4 shadow-sm my-4 ${theme.cardBg}`}>
          <div>
            <h2 className="text-sm font-extrabold">Thiết lập hồ sơ khởi đầu</h2>
            <p className={`text-xs mt-1 ${theme.textSecondary}`}>
              Mọi số dư, thẻ ngân hàng và giao dịch đều là dữ liệu mô phỏng trong game Phone OS, không kết nối ngân hàng ngoài đời thực.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-bold block ${theme.textSecondary}`}>Tên hiển thị chủ tài khoản</label>
            <input
              type="text"
              value={onboardingName}
              onChange={(e) => setOnboardingName(e.target.value)}
              placeholder="Nhập tên của bạn"
              className={`w-full min-h-[44px] px-3.5 rounded-xl border text-sm font-bold outline-none focus:border-[#E14B5A] ${theme.subCardBg}`}
            />
          </div>

          <div className={`rounded-2xl border p-3 text-xs space-y-1 ${theme.subCardBg}`}>
            <p className="font-bold">Mã khách hàng: <span className="font-mono text-[#E14B5A]">{overview.preferences.customer_code}</span></p>
            <p className={theme.textSecondary}>Số tài khoản chính: <span className="font-mono">{overview.account.account_number}</span></p>
          </div>

          <button
            type="submit"
            disabled={onboardingBusy}
            className="w-full min-h-[48px] rounded-2xl bg-[#E14B5A] hover:opacity-95 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            <span>{onboardingBusy ? 'Đang khởi tạo...' : 'Bắt đầu sử dụng Hikari Bank'}</span>
          </button>
        </form>

        <p className={`text-[11px] text-center ${theme.textSecondary}`}>
          HIKARI BANK · Ứng dụng tài chính mô phỏng thuộc Phone OS
        </p>
      </div>
    );
  }

  if (notificationsOpen) {
    return (
      <BankingNotificationsView
        notifications={overview.notifications}
        transactions={overview.transactions}
        theme={theme}
        onBack={() => setNotificationsOpen(false)}
        onOverviewUpdate={handleOverviewUpdate}
        onOpenTxBill={(tx) => setDetailTx(tx)}
      />
    );
  }

  const navItems: Array<{
    id: MainTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'transfer', label: 'Chuyển tiền', icon: Send },
    { id: 'transactions', label: 'Lịch sử', icon: ArrowLeftRight },
    { id: 'finance', label: 'Thẻ', icon: CreditCard },
    { id: 'profile', label: 'Cá nhân', icon: User },
  ];

  return (
    <div className={`h-full flex flex-col relative overflow-hidden ${theme.pageBg}`}>
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'home' && (
          <div className="flex-1 overflow-y-auto os-scroll">
            <BankingHomeView
              account={activeAccount}
              accounts={overview.accounts}
              aiAccounts={overview.aiAccounts}
              primaryCard={
                overview.cards?.find((c) => Number(c.is_primary) === 1) || overview.cards?.[0] || null
              }
              transactions={overview.transactions}
              computedStats={overview.computedStats}
              unreadNotifCount={unreadNotifCount}
              hideBalance={hideBalance}
              customerCode={overview.preferences?.customer_code}
              dashboardWallpaper={overview.preferences?.dashboard_wallpaper}
              bannerDismissed={Boolean(overview.preferences?.hikari_banner_dismissed)}
              theme={theme}
              onToggleHideBalance={() => void handleToggleHideBalance()}
              onDismissBanner={() => void handleDismissBanner()}
              onOpenAssistant={() => setAssistantOpen(true)}
              onSelectAccount={(accId) => setSelectedAccountId(accId)}
              onQuickCharTransfer={handleQuickCharTransfer}
              onNavigate={handleHomeNavigate}
              onOpenBill={(tx) => setDetailTx(tx)}
              onShowToast={showToast}
            />
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-3.5 pt-2.5 pb-1 shrink-0">
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-2xl border ${theme.cardBg}`}>
                <button
                  type="button"
                  onClick={() => setTransferMode('send')}
                  className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    transferMode === 'send' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Chuyển tiền</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode('receive')}
                  className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    transferMode === 'receive' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Nhận & Nạp/Rút</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto os-scroll">
              {transferMode === 'send' ? (
                <TransferFlowView
                  account={activeAccount}
                  accounts={overview.accounts}
                  cards={overview.cards}
                  aiAccounts={overview.aiAccounts}
                  beneficiaries={overview.beneficiaries}
                  security={overview.security}
                  hideBalance={hideBalance}
                  theme={theme}
                  draft={transferDraft}
                  onDraftChange={setTransferDraft}
                  initialRecipient={transferPreset}
                  onUpdated={handleOverviewUpdate}
                  onOpenQr={() => setQrScanModalOpen(true)}
                  onShare={openShareSheet}
                  onOpenReceipt={(tx) => setDetailTx(tx)}
                  onOpenHistory={() => {
                    setActiveTab('transactions');
                    setTxSubTab('history');
                    setSubNonce((n) => n + 1);
                  }}
                  onSavedToPhotos={() => void refreshData()}
                  onShowToast={showToast}
                />
              ) : (
                <ReceiveAndCharRequestView
                  initialSubTab="receive"
                  account={activeAccount}
                  aiAccounts={overview.aiAccounts}
                  relationships={data?.aiRelationships || []}
                  charRequests={overview.charRequests || overview.paymentRequests}
                  transactions={overview.transactions}
                  theme={theme}
                  onOverviewUpdate={handleOverviewUpdate}
                  onSelectTransaction={(tx) => setDetailTx(tx)}
                  onShare={openShareSheet}
                  onShowToast={showToast}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="flex-1 min-h-0">
            <TransactionsAndBillsView
              key={`tx-${txSubTab}-${subNonce}`}
              initialSubTab={txSubTab}
              account={activeAccount}
              accounts={overview.accounts}
              cards={overview.cards}
              aiAccounts={overview.aiAccounts}
              transactions={overview.transactions}
              bills={overview.bills}
              aiBills={overview.aiBills}
              contacts={data?.contacts || []}
              telecomCarriers={overview.telecomCarriers || data?.telecomCarriers || []}
              telecomSims={overview.telecomSims || data?.telecomSims || []}
              hideBalance={hideBalance}
              theme={theme}
              onOverviewUpdate={handleOverviewUpdate}
              onSelectTransaction={(tx) => setDetailTx(tx)}
              onShare={openShareSheet}
              onOpenTelecomApp={() => openApp('telecom')}
              onShowToast={showToast}
              onRequestConfirm={requestConfirm}
            />
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-3.5 pt-2.5 shrink-0">
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-2xl border ${theme.cardBg}`}>
                <button
                  type="button"
                  onClick={() => setFinanceMode('accounts_cards')}
                  className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    financeMode === 'accounts_cards' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Thẻ, TK & CHAR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceMode('savings_loans')}
                  className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    financeMode === 'savings_loans' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Tiết kiệm & Vay vốn</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {financeMode === 'accounts_cards' ? (
                <div className="h-full overflow-y-auto os-scroll">
                  <AccountsAndCardsView
                    key={`acc-${accountsSection}-${accountsCardMode}-${subNonce}`}
                    initialSection={accountsSection}
                    initialCardMode={accountsCardMode}
                    account={activeAccount}
                    accounts={overview.accounts}
                    aiAccounts={overview.aiAccounts}
                    cards={overview.cards}
                    cardBills={overview.cardBills || []}
                    cardBanks={overview.cardBanks || []}
                    cardPartners={overview.cardPartners || []}
                    cardRewardCatalog={overview.cardRewardCatalog || []}
                    cardVouchers={overview.cardVouchers || []}
                    cardPointsLedger={overview.cardPointsLedger || []}
                    cardCashbackLogs={overview.cardCashbackLogs || []}
                    cardInterestLogs={overview.cardInterestLogs || []}
                    totalAssets={overview.computedStats.totalAssets}
                    investments={overview.investments}
                    budgets={overview.budgets}
                    savingsGoals={overview.savingsGoals}
                    transactions={overview.transactions}
                    hideBalance={hideBalance}
                    theme={theme}
                    onUpdated={handleOverviewUpdate}
                    onTransferToTarget={(target) => {
                      setTransferPreset(target);
                      setTransferMode('send');
                      setActiveTab('transfer');
                    }}
                    onOpenAiLoanModal={(charId) => {
                      setAiCharLoanId(charId);
                      setFinanceMode('savings_loans');
                      setSavLoansTab('loans');
                      setSubNonce((n) => n + 1);
                    }}
                    onOpenTxDetail={(tx) => setDetailTx(tx)}
                    onShowToast={showToast}
                    onRequestConfirm={requestConfirm}
                  />
                </div>
              ) : (
                <SavingsAndLoansView
                  key={`sl-${savLoansTab}-${aiCharLoanId || ''}-${subNonce}`}
                  initialSubTab={savLoansTab}
                  initialAiCharLoanId={aiCharLoanId}
                  account={activeAccount}
                  aiAccounts={overview.aiAccounts}
                  savings={overview.savings}
                  loans={overview.loans}
                  hideBalance={hideBalance}
                  theme={theme}
                  onOverviewUpdate={handleOverviewUpdate}
                  onOpenReceiptTx={(tx) => setDetailTx(tx)}
                  onShowToast={showToast}
                  onRequestConfirm={requestConfirm}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="flex-1 min-h-0">
            <ProfileSecurityView
              key={`prof-${profileSection}-${subNonce}`}
              initialSection={profileSection}
              account={activeAccount}
              accounts={overview.accounts}
              aiAccounts={overview.aiAccounts}
              security={overview.security}
              preferences={overview.preferences}
              computedStats={overview.computedStats}
              paymentRequests={overview.paymentRequests}
              supportTickets={overview.supportTickets}
              transactions={overview.transactions}
              userAvatar={data?.profile?.avatar || ''}
              theme={theme}
              onOverviewUpdate={handleOverviewUpdate}
              onOpenNotifications={() => setNotificationsOpen(true)}
              onOpenAssistant={() => setAssistantOpen(true)}
              onResetUi={handleResetUi}
              onOpenTxBill={(tx) => setDetailTx(tx)}
              onShare={openShareSheet}
              onShowToast={showToast}
              onRequestConfirm={requestConfirm}
              onLockedSession={() => setSessionUnlocked(false)}
            />
          </div>
        )}
      </main>

      {/* Fixed 5-Tab Bottom Navigation */}
      <nav
        aria-label="Điều hướng Hikari Bank"
        className={`shrink-0 mx-3 mb-2.5 mt-1 rounded-2xl backdrop-blur-md border shadow-lg px-1.5 py-1 ${theme.navBg}`}
      >
        <div className="grid grid-cols-5 gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[46px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? theme.accentBgSoft : theme.textSecondary
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* QR Scan & Validate Modal */}
      {qrScanModalOpen && (
        <div
          onClick={() => {
            if (!qrModalDrag.wasJustDragged()) setQrScanModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div
            ref={qrModalDrag.popupRef}
            style={qrModalDrag.popupStyle}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-3xl p-5 pt-3 space-y-4 max-h-[88vh] overflow-y-auto os-scroll border shadow-2xl ${theme.cardBg} ${theme.textPrimary}`}
          >
            <div
              {...qrModalDrag.handleProps}
              title="Kéo để di chuyển"
              className="cursor-grab active:cursor-grabbing select-none space-y-2"
            >
              <div className={`w-10 h-1 rounded-full mx-auto ${theme.progressTrackBg}`} />
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <QrCode className="w-4 h-4 text-[#E14B5A]" />
                  <span>Quét mã Sim-QR · Hikari Bank</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setQrScanModalOpen(false)}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${theme.subCardBg}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className={`rounded-2xl bg-gradient-to-br ${theme.heroGradient} text-white p-4 text-center space-y-1.5`}>
              <QrCode className="w-10 h-10 text-amber-200 mx-auto" />
              <p className="text-xs font-bold">Máy quét QR Mô Phỏng · Hikari Bank (ひかり銀行)</p>
              <p className="text-[11px] text-rose-100/85">
                Dán chuỗi Sim-QR (VD: HIKARI_OS|STK|TÊN|SỐ TIỀN|NỘI DUNG) hoặc chọn nhanh mẫu bên dưới.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleValidateQrPayload(qrInput);
              }}
              className="flex gap-2"
            >
              <input
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Dán mã HIKARI_OS|... hoặc số tài khoản"
                className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-mono outline-none ${theme.subCardBg}`}
              />
              <button
                type="submit"
                disabled={qrValidating || !qrInput.trim()}
                className="px-3.5 py-2.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold disabled:opacity-50"
              >
                {qrValidating ? '...' : 'Xác thực'}
              </button>
            </form>

            <div className="space-y-1.5">
              <p className={`text-[11px] font-bold ${theme.textSecondary}`}>Mã Sim-QR mẫu sẵn sàng quét</p>
              <div className={`divide-y rounded-2xl border px-3 ${theme.border}`}>
                {QR_TEST_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (p.payload) {
                        void handleValidateQrPayload(p.payload);
                      } else if (p.direct) {
                        setQrScanModalOpen(false);
                        setTransferPreset(p.direct);
                        setTransferMode('send');
                        setActiveTab('transfer');
                      }
                    }}
                    className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{p.label}</p>
                      <p className={`text-[10px] font-mono truncate ${theme.textSecondary}`}>{p.sub}</p>
                    </div>
                    <QrCode className="w-4 h-4 text-[#E14B5A] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 1: Transaction Detail Modal */}
      <TransactionDetailModal
        tx={detailTx}
        account={activeAccount}
        aiAccounts={overview.aiAccounts}
        theme={theme}
        onClose={() => setDetailTx(null)}
        onOpenBillPreview={(tx) => {
          setDetailTx(null);
          setPreviewBillTx(tx);
        }}
        onOpenChat={(conversationId, characterId) => {
          setDetailTx(null);
          openApp('messages', { conversationId, characterId });
        }}
        onShowToast={showToast}
      />

      {/* Stage 2: High-DPI PNG Bill Preview & Share Modal (Success TX only) */}
      <BillPreviewModal
        tx={previewBillTx}
        account={activeAccount}
        theme={theme}
        onClose={() => setPreviewBillTx(null)}
        onShare={openShareSheet}
        onToast={showToast}
        onSavedToPhotos={() => void refreshData()}
        onOpenHistory={() => {
          setPreviewBillTx(null);
          setActiveTab('transactions');
          setTxSubTab('history');
          setSubNonce((n) => n + 1);
        }}
      />

      {/* Hikari-chan Read-only Assistant Modal */}
      <HikariAssistantModal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        overview={overview}
        onUpdated={handleOverviewUpdate}
        theme={theme}
      />
    </div>
  );
}
