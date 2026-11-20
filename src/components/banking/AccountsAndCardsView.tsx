import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  Layers,
  Link2Off,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { emitBankingSyncEvent, osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingBudgetItem,
  BankingCardItem,
  BankingInvestmentItem,
  BankingOverviewPayload,
  BankingSavingsGoal,
  BankingTransactionDemo,
  CardBankBrand,
  CardBillItem,
  CardCashbackLogItem,
  CardInterestLogItem,
  CardPartnerOffer,
  CardPointsLedgerItem,
  CardRevealResult,
  CardRewardCatalogItem,
  CardTierId,
  CardUserVoucher,
} from '../../types/os';
import { getThemePalette, type HikariThemePalette } from './HikariBrand';
import {
  AVATAR_PRESETS,
  EXPENSE_CATEGORIES,
  formatTimeAgoOrDate,
  formatVnd,
  INVESTMENT_CATALOG,
  maskAccountNumber,
} from './utils';
import { BankCardVisual } from './cards/BankCardVisual';
import { IssueCardModal } from './cards/IssueCardModal';
import { CardDetailSheet } from './cards/CardDetailSheet';
import { CardBenefitsHub } from './cards/CardBenefitsHub';

interface AccountsAndCardsViewProps {
  initialSection?: 'accounts' | 'cards' | 'investments' | 'expenses';
  initialCardMode?: 'cards' | 'benefits';
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  aiAccounts?: BankingAccountDemo[];
  cards: BankingCardItem[];
  cardBills?: CardBillItem[];
  cardBanks?: CardBankBrand[];
  cardPartners?: CardPartnerOffer[];
  cardRewardCatalog?: CardRewardCatalogItem[];
  cardVouchers?: CardUserVoucher[];
  cardPointsLedger?: CardPointsLedgerItem[];
  cardCashbackLogs?: CardCashbackLogItem[];
  cardInterestLogs?: CardInterestLogItem[];
  totalAssets?: number;
  investments: BankingInvestmentItem[];
  budgets: BankingBudgetItem[];
  savingsGoals: BankingSavingsGoal[];
  transactions: BankingTransactionDemo[];
  hideBalance?: boolean;
  theme?: HikariThemePalette;
  onUpdated: (payload: BankingOverviewPayload) => void;
  onTransferToTarget?: (target: { accountNumber: string; bankCode: string; name: string; characterId?: string }) => void;
  onOpenAiLoanModal?: (charId: string) => void;
  onOpenTxDetail?: (tx: BankingTransactionDemo) => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function AccountsAndCardsView({
  initialSection = 'accounts',
  initialCardMode = 'cards',
  account,
  accounts,
  cards,
  cardBills = [],
  cardBanks = [],
  cardPartners = [],
  cardRewardCatalog = [],
  cardVouchers = [],
  cardPointsLedger = [],
  cardCashbackLogs = [],
  cardInterestLogs = [],
  totalAssets = 0,
  investments,
  budgets,
  savingsGoals,
  transactions,
  hideBalance = false,
  theme = getThemePalette('coral'),
  onUpdated,
  onOpenTxDetail,
  onRequestConfirm,
  onShowToast,
}: AccountsAndCardsViewProps) {
  const [section, setSection] = useState<'accounts' | 'cards' | 'investments' | 'expenses'>(initialSection);

  // Account creation & editing
  const [createAccOpen, setCreateAccOpen] = useState(false);
  const [newAccNickname, setNewAccNickname] = useState('');
  const [newAccRole, setNewAccRole] = useState<'sub' | 'receive_only'>('sub');
  const [newAccDeposit, setNewAccDeposit] = useState('500000');
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editAccAvatar, setEditAccAvatar] = useState(AVATAR_PRESETS[0]);
  const [selectedStatementAccId, setSelectedStatementAccId] = useState<string | null>(null);
  const [accBusyId, setAccBusyId] = useState<string | null>(null);

  // Cards Ecosystem
  const [cardViewMode, setCardViewMode] = useState<'cards' | 'benefits'>(initialCardMode);
  const [selectedCardId, setSelectedCardId] = useState<string>(
    () => cards.find((c) => Number(c.is_primary) === 1)?.id || cards[0]?.id || ''
  );
  const [issueCardOpen, setIssueCardOpen] = useState(false);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);

  const activeCard = useMemo(
    () =>
      cards.find((c) => c.id === selectedCardId) ||
      cards.find((c) => Number(c.is_primary) === 1) ||
      cards[0] ||
      null,
    [cards, selectedCardId]
  );

  const detailCard = useMemo(
    () => (detailCardId ? cards.find((c) => c.id === detailCardId) || null : null),
    [cards, detailCardId]
  );

  // Investments
  const [tradeAssetCode, setTradeAssetCode] = useState('PBFUND');
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState('500000');
  const [tradeBusy, setTradeBusy] = useState(false);

  // Budgets & Goals
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('10000000');
  const [goalDeadline, setGoalDeadline] = useState('2027-06-30');
  const [editingBudgetCat, setEditingBudgetCat] = useState<string | null>(null);
  const [budgetLimitVal, setBudgetLimitVal] = useState('');

  // Expense Analytics
  const nowMonth = new Date().toISOString().slice(0, 7);
  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);

  const userAccountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);

  const { thisMonthSpend, prevMonthSpend, catSpend } = useMemo(() => {
    let cur = 0;
    let prev = 0;
    const byCat: Record<string, number> = {};
    for (const tx of transactions) {
      if (!userAccountIds.has(tx.account_id) || tx.tx_type !== 'expense' || tx.bill_template === 'failed') continue;
      if (tx.created_at.startsWith(nowMonth)) {
        cur += tx.amount;
        const c = tx.category || 'Khác';
        byCat[c] = (byCat[c] || 0) + tx.amount;
      } else if (tx.created_at.startsWith(prevMonth)) {
        prev += tx.amount;
      }
    }
    return { thisMonthSpend: cur, prevMonthSpend: prev, catSpend: byCat };
  }, [transactions, userAccountIds, nowMonth, prevMonth]);

  const handleCreateAccount = async () => {
    if (accBusyId) return;
    setAccBusyId('create');
    try {
      const res = await osApi.banking.createAccount({
        nickname: newAccNickname.trim() || (newAccRole === 'receive_only' ? 'TK Chỉ Nhận Tiền' : 'Ví Chi Tiêu Phụ'),
        account_role: newAccRole,
        initial_deposit: Number(newAccDeposit || 0),
      });
      onUpdated(res);
      setCreateAccOpen(false);
      setNewAccNickname('');
      onShowToast('Mở tài khoản thành công', 'Tài khoản mới đã sẵn sàng sử dụng', 'success');
    } catch (err) {
      onShowToast('Không thể mở tài khoản', err instanceof Error ? err.message : 'Lỗi kiểm tra', 'error');
    } finally {
      setAccBusyId(null);
    }
  };

  const handleSetPrimaryAccount = (acc: BankingAccountDemo) => {
    if (acc.account_role === 'receive_only' || acc.status === 'locked') {
      onShowToast('Không thể đặt làm chính', 'Tài khoản chỉ nhận tiền hoặc đang khóa không thể làm tài khoản chính.', 'error');
      return;
    }
    const exec = async () => {
      setAccBusyId(acc.id);
      try {
        const res = await osApi.banking.setPrimaryAccount(acc.id);
        onUpdated(res);
        onShowToast('Đã đổi tài khoản chính', `${acc.nickname || acc.account_type} đã trở thành tài khoản thanh toán mặc định.`, 'success');
      } catch (err) {
        onShowToast('Không thể đổi tài khoản chính', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
      } finally {
        setAccBusyId(null);
      }
    };
    if (onRequestConfirm) {
      onRequestConfirm({
        title: 'Đặt làm tài khoản chính',
        message: `Đặt "${acc.nickname || acc.account_type}" (${maskAccountNumber(acc.account_number)}) làm tài khoản thanh toán mặc định? Tài khoản chính cũ sẽ tự chuyển về tài khoản phụ.`,
        onConfirm: exec,
      });
    } else {
      void exec();
    }
  };

  const handleIssueCard = async (payload: {
    bank_id: string;
    card_tier: CardTierId;
    card_category: 'debit' | 'credit';
    card_nickname: string;
    account_id: string;
    design_theme: string;
    pin?: string;
  }) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.issueCard(payload);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      const newest = res.issuedCard || (res.cards || []).find((c) => !cards.some((old) => old.id === c.id)) || res.cards?.[0];
      if (newest) setSelectedCardId(newest.id);
      setIssueCardOpen(false);
      onShowToast('Phát hành thẻ thành công', 'Thẻ mới đã được mã hóa an toàn và sẵn sàng sử dụng.', 'success');
    } catch (err) {
      onShowToast('Không thể phát hành thẻ', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleSetPrimaryCard = async (cardId: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.setPrimaryCard(cardId);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã đổi thẻ chính', 'Thẻ đã trở thành thẻ thanh toán mặc định.', 'success');
    } catch (err) {
      onShowToast('Không thể đổi thẻ chính', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleUpdateCard = async (
    cardId: string,
    patch: {
      card_nickname?: string;
      status?: 'active' | 'locked';
      online_payment_enabled?: number;
      contactless_enabled?: number;
      intl_payment_enabled?: number;
      design_theme?: string;
      per_tx_limit?: number;
      daily_limit?: number;
      monthly_limit?: number;
      transfer_limit?: number;
      withdraw_limit?: number;
      online_limit?: number;
      pin?: string;
    }
  ): Promise<boolean> => {
    if (cardBusy) return false;
    setCardBusy(true);
    try {
      const res = await osApi.banking.updateCard(cardId, patch);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã cập nhật thẻ', 'Thông số thẻ đã được đồng bộ.', 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi hệ thống';
      onShowToast('Không thể cập nhật thẻ', msg, 'error');
      if (patch.pin !== undefined) throw err;
      return false;
    } finally {
      setCardBusy(false);
    }
  };

  const handleRevealCard = async (cardId: string, pin: string): Promise<CardRevealResult> => {
    setCardBusy(true);
    try {
      return await osApi.banking.revealCard(cardId, pin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể giải mã số thẻ';
      onShowToast('Xác thực PIN thất bại', msg, 'error');
      throw err;
    } finally {
      setCardBusy(false);
    }
  };

  const handleChangeCardPin = async (cardId: string, currentPin: string, newPin: string): Promise<boolean> => {
    if (cardBusy) return false;
    setCardBusy(true);
    try {
      const res = await osApi.banking.changeCardPin(cardId, currentPin, newPin);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã đổi PIN thẻ', 'Mã PIN bảo mật thẻ mới đã có hiệu lực ngay.', 'success');
      return true;
    } catch (err) {
      onShowToast('Không thể đổi PIN thẻ', err instanceof Error ? err.message : 'Mã PIN hiện tại không đúng', 'error');
      return false;
    } finally {
      setCardBusy(false);
    }
  };

  const handleCancelCard = async (cardId: string, pin: string): Promise<boolean> => {
    if (cardBusy) return false;
    setCardBusy(true);
    try {
      const res = await osApi.banking.cancelCard(cardId, pin);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      const fallback = (res.cards || []).find((c) => c.id !== cardId && c.status !== 'cancelled');
      if (fallback && selectedCardId === cardId) setSelectedCardId(fallback.id);
      onShowToast('Đã hủy thẻ vĩnh viễn', 'Thẻ đã ngừng hoạt động và không thể dùng thanh toán.', 'info');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể hủy thẻ';
      onShowToast('Không thể hủy thẻ', msg, 'error');
      throw err;
    } finally {
      setCardBusy(false);
    }
  };

  const handleReissueCard = async (cardId: string, pin: string): Promise<boolean> => {
    if (cardBusy) return false;
    setCardBusy(true);
    try {
      const res = await osApi.banking.reissueCard(cardId, pin);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      if (res.issuedCard?.id) {
        setSelectedCardId(res.issuedCard.id);
        setDetailCardId(res.issuedCard.id);
      }
      onShowToast('Cấp lại thẻ thành công', 'Thẻ mới đã được phát hành với số thẻ & CVV mới.', 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể cấp lại thẻ';
      onShowToast('Không thể cấp lại thẻ', msg, 'error');
      throw err;
    } finally {
      setCardBusy(false);
    }
  };

  const handleLinkCard = async (cardId: string, accountId: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.linkCard(cardId, accountId);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã liên kết tài khoản', 'Số dư khả dụng của thẻ đã đồng bộ theo tài khoản.', 'success');
    } catch (err) {
      onShowToast('Không thể liên kết thẻ', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleUnlinkCard = async (cardId: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.unlinkCard(cardId);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã ngưng liên kết thẻ', 'Thẻ sẽ không thể thực hiện thanh toán cho đến khi liên kết lại.', 'info');
    } catch (err) {
      onShowToast('Không thể ngưng liên kết', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleClaimInterest = async (cardId: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.claimCardInterest(cardId);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đã nhận lãi suất thẻ', `Cộng +${formatVnd(res.interestAmount || 0)} vào tài khoản liên kết.`, 'success');
    } catch (err) {
      onShowToast('Chưa thể nhận lãi', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleUpgradeCard = async (cardId: string, targetTier?: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.upgradeCard(cardId, targetTier);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Nâng hạng thẻ thành công', 'Quyền lợi hoàn tiền, lãi suất và hạn mức mới đã kích hoạt!', 'success');
    } catch (err) {
      onShowToast('Chưa đủ điều kiện nâng hạng', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handlePayWithCard = async (
    cardId: string,
    payload: {
      merchant: string;
      amount: number;
      category?: string;
      billId?: string;
      partnerId?: string;
      voucherId?: string;
      channelType?: 'online' | 'pos' | 'intl';
    }
  ) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.payCard(cardId, payload);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      const cb = res.cashbackEarned || 0;
      const pts = res.pointsEarned || 0;
      onShowToast(
        'Thanh toán thẻ thành công',
        `${payload.merchant} · Hoàn +${formatVnd(cb)} · +${pts} điểm thưởng`,
        'success'
      );
    } catch (err) {
      onShowToast('Thanh toán thẻ bị từ chối', err instanceof Error ? err.message : 'Thất bại', 'error');
      osApi.banking.getOverview().then((fresh) => {
        onUpdated(fresh);
        emitBankingSyncEvent('banking');
      }).catch(() => {});
    } finally {
      setCardBusy(false);
    }
  };

  const handleRedeemReward = async (cardId: string, catalogId: string) => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const res = await osApi.banking.redeemCardReward(cardId, catalogId);
      onUpdated(res);
      emitBankingSyncEvent('banking');
      onShowToast('Đổi điểm thưởng thành công', 'Quà hoặc tiền thưởng đã được ghi nhận vào thẻ/tài khoản.', 'success');
    } catch (err) {
      onShowToast('Không thể đổi điểm', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setCardBusy(false);
    }
  };

  return (
    <div className="p-3.5 space-y-3.5 pb-6">
      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'cards', label: 'Thẻ Hikari', icon: CreditCard },
            { id: 'accounts', label: 'Tài khoản', icon: Layers },
            { id: 'investments', label: 'Đầu tư', icon: TrendingUp },
            { id: 'expenses', label: 'Chi tiêu', icon: Target },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = section === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                active
                  ? 'bg-[#E14B5A] text-white shadow-sm'
                  : `${theme.cardBg} border ${theme.textSecondary}`
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: MULTI-ACCOUNT MANAGEMENT */}
      {section === 'accounts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Danh sách tài khoản Hikari ({accounts.length})
            </h3>
            <button
              type="button"
              onClick={() => setCreateAccOpen((o) => !o)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Mở tài khoản mới</span>
            </button>
          </div>

          {createAccOpen && (
            <div className={`rounded-2xl p-3.5 border border-[#E14B5A]/40 space-y-2.5 ${theme.cardBg}`}>
              <p className={`text-xs font-extrabold ${theme.textPrimary}`}>
                Mở tài khoản phụ / Tài khoản chỉ nhận tiền
              </p>
              <input
                value={newAccNickname}
                onChange={(e) => setNewAccNickname(e.target.value)}
                placeholder="Tên gợi nhớ (vd: Quỹ Du lịch, TK Thu hộ)"
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${theme.inputClass}`}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newAccRole}
                  onChange={(e) => setNewAccRole(e.target.value as 'sub' | 'receive_only')}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                >
                  <option value="sub" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Tài khoản phụ thanh toán
                  </option>
                  <option value="receive_only" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Tài khoản chỉ nhận tiền
                  </option>
                </select>
                <input
                  type="number"
                  value={newAccDeposit}
                  onChange={(e) => setNewAccDeposit(e.target.value)}
                  placeholder="Vốn khởi tạo (VNĐ)"
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold tabular-nums outline-none ${theme.inputClass}`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateAccOpen(false)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold ${theme.chipInactive}`}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={accBusyId === 'create'}
                  onClick={() => void handleCreateAccount()}
                  className="px-4 py-2 rounded-xl bg-[#E14B5A] text-white text-xs font-bold disabled:opacity-60"
                >
                  {accBusyId === 'create' ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </div>
          )}

          {accounts.map((acc) => {
            const isEditing = editingAccId === acc.id;
            const isPrimary = Number(acc.is_primary) === 1;
            const isReceiveOnly = acc.account_role === 'receive_only';
            const isLocked = acc.status === 'locked';
            const accTxs = transactions.filter((t) => t.account_id === acc.id).slice(0, 5);
            return (
              <div key={acc.id} className={`rounded-2xl p-3.5 border space-y-2.5 ${theme.cardBg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={acc.avatar || AVATAR_PRESETS[0]}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-extrabold truncate ${theme.textPrimary}`}>
                          {acc.nickname || acc.account_type}
                        </p>
                        {isPrimary ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${theme.badgePrimary}`}>
                            Tài khoản chính
                          </span>
                        ) : isReceiveOnly ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${theme.badgeSuccess}`}>
                            Chỉ nhận tiền
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${theme.badgeNeutral}`}>
                            Tài khoản phụ
                          </span>
                        )}
                        {isLocked && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${theme.badgeDanger}`}>
                            Đang khóa
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] font-mono ${theme.textSecondary}`}>{acc.account_number}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black tabular-nums ${theme.accentClass}`}>
                      {formatVnd(acc.balance, hideBalance)}
                    </p>
                    <p className={`text-[10px] tabular-nums ${theme.textSecondary}`}>
                      Hạn mức {formatVnd(acc.daily_limit || 100000000, hideBalance)}
                    </p>
                  </div>
                </div>

                {isEditing && (
                  <div className={`p-2.5 rounded-xl border space-y-2 ${theme.subCardBg}`}>
                    <input
                      value={editAccName}
                      onChange={(e) => setEditAccName(e.target.value)}
                      placeholder="Tên tài khoản mới"
                      className={`w-full px-2.5 py-2 rounded-lg border text-xs outline-none ${theme.inputClass}`}
                    />
                    <div className="flex items-center gap-2">
                      {AVATAR_PRESETS.map((av) => (
                        <button
                          key={av}
                          type="button"
                          onClick={() => setEditAccAvatar(av)}
                          className={`rounded-full p-0.5 ${editAccAvatar === av ? 'ring-2 ring-[#E14B5A]' : ''}`}
                        >
                          <img src={av} alt="" className="w-8 h-8 rounded-full object-cover" />
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAccId(null)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${theme.chipInactive}`}
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={accBusyId === acc.id}
                        onClick={async () => {
                          setAccBusyId(acc.id);
                          try {
                            const res = await osApi.banking.updateAccount(acc.id, {
                              nickname: editAccName.trim() || acc.nickname,
                              avatar: editAccAvatar,
                            });
                            onUpdated(res);
                            setEditingAccId(null);
                            onShowToast('Đã cập nhật tài khoản', editAccName.trim() || 'Đã lưu thay đổi', 'success');
                          } catch (err) {
                            onShowToast('Lỗi cập nhật', err instanceof Error ? err.message : 'Thất bại', 'error');
                          } finally {
                            setAccBusyId(null);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#E14B5A] text-white text-xs font-bold disabled:opacity-60"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}

                <div className={`flex flex-wrap gap-1.5 pt-2 border-t ${theme.border}`}>
                  {!isPrimary && !isReceiveOnly && !isLocked && (
                    <button
                      type="button"
                      disabled={accBusyId === acc.id}
                      onClick={() => handleSetPrimaryAccount(acc)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${theme.badgePrimary}`}
                    >
                      <Star className="w-3 h-3" />
                      <span>Đặt làm tài khoản chính</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccId(acc.id);
                      setEditAccName(acc.nickname || acc.account_type || '');
                      setEditAccAvatar(acc.avatar || AVATAR_PRESETS[0]);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${theme.chipInactive}`}
                  >
                    Đổi tên / Avatar
                  </button>
                  <button
                    type="button"
                    disabled={accBusyId === acc.id}
                    onClick={async () => {
                      setAccBusyId(acc.id);
                      try {
                        const res = await osApi.banking.updateAccount(acc.id, { is_hidden: acc.is_hidden ? 0 : 1 });
                        onUpdated(res);
                      } catch (err) {
                        onShowToast('Lỗi', err instanceof Error ? err.message : 'Không thể cập nhật', 'error');
                      } finally {
                        setAccBusyId(null);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${theme.chipInactive}`}
                  >
                    {acc.is_hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>{acc.is_hidden ? 'Hiện ở Home' : 'Ẩn ở Home'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStatementAccId((cur) => (cur === acc.id ? null : acc.id))}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${theme.chipInactive}`}
                  >
                    Sao kê riêng ({accTxs.length})
                  </button>
                  {!isPrimary && acc.id !== 'bank_1' && (
                    <button
                      type="button"
                      disabled={accBusyId === acc.id}
                      onClick={async () => {
                        setAccBusyId(acc.id);
                        try {
                          const res = await osApi.banking.closeAccount(acc.id);
                          onUpdated(res);
                          onShowToast('Đã đóng tài khoản phụ', 'Số dư đã chuyển về tài khoản chính', 'info');
                        } catch (err) {
                          onShowToast('Lỗi', err instanceof Error ? err.message : 'Không thể đóng', 'error');
                        } finally {
                          setAccBusyId(null);
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${theme.badgeDanger}`}
                    >
                      Đóng TK
                    </button>
                  )}
                </div>

                {selectedStatementAccId === acc.id && (
                  <div className={`pt-2 border-t space-y-1.5 ${theme.border}`}>
                    {accTxs.length === 0 ? (
                      <p className={`text-[11px] ${theme.textSecondary}`}>Chưa có phát sinh trên tài khoản này</p>
                    ) : (
                      accTxs.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onOpenTxDetail?.(t)}
                          className="w-full flex justify-between text-[11px] text-left py-0.5 hover:opacity-80"
                        >
                          <span className={`truncate ${theme.textSecondary}`}>{t.counterparty}</span>
                          <span
                            className={`font-bold tabular-nums shrink-0 ${
                              t.tx_type === 'income' ? 'text-emerald-500' : theme.textPrimary
                            }`}
                          >
                            {t.tx_type === 'income' ? '+' : '-'}
                            {formatVnd(t.amount, hideBalance)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 3: ADVANCED MULTI-BANK CARD ECOSYSTEM */}
      {section === 'cards' && (
        <div className="space-y-3.5">
          {/* Header + Issue Card */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
                Hệ sinh thái Thẻ ({cards.length})
              </h3>
              <p className={`text-[10.5px] ${theme.textSecondary}`}>
                {cardBanks.length || 5} ngân hàng Anime · Hoàn tiền, Lãi suất & Đổi điểm thực
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssueCardOpen(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Phát hành thẻ</span>
            </button>
          </div>

          {/* Sub-mode Toggle */}
          <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${theme.cardBg}`}>
            <button
              type="button"
              onClick={() => setCardViewMode('cards')}
              className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                cardViewMode === 'cards' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Thẻ của tôi</span>
            </button>
            <button
              type="button"
              onClick={() => setCardViewMode('benefits')}
              className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                cardViewMode === 'benefits' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Ưu đãi, Quẹt thẻ & Điểm</span>
            </button>
          </div>

          {cardViewMode === 'cards' ? (
            cards.length === 0 ? (
              <div className={`rounded-2xl border p-6 text-center space-y-2 ${theme.cardBg}`}>
                <CreditCard className="w-8 h-8 text-[#E14B5A] mx-auto" />
                <p className="text-xs font-extrabold">Chưa có thẻ ngân hàng nào</p>
                <p className={`text-[11px] ${theme.textSecondary}`}>
                  Phát hành thẻ mới từ Hikari, Sakura, Akuma, Tsuki hoặc Aoi để hưởng hoàn tiền & lãi suất.
                </p>
              </div>
            ) : (
              <>
                {/* Horizontal Card Carousel */}
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory os-scroll">
                  {cards.map((c) => (
                    <div key={c.id} className="w-[86%] sm:w-[320px] shrink-0 snap-center">
                      <BankCardVisual
                        card={c}
                        compact
                        isSelected={activeCard?.id === c.id}
                        onClick={() => setSelectedCardId(c.id)}
                      />
                    </div>
                  ))}
                </div>

                {/* Compact Card Selector Strip */}
                {cards.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {cards.map((c) => {
                      const active = activeCard?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCardId(c.id)}
                          className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-bold whitespace-nowrap shrink-0 tabular-nums transition-colors ${
                            active ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : theme.cardBg
                          }`}
                        >
                          {c.bank_short_code || 'HK'} •••• {c.last4} · {c.tier_label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Active Card Workspace */}
                {activeCard && (() => {
                  const linkedAcc = accounts.find((a) => a.id === activeCard.account_id) || null;
                  const isUnlinked = activeCard.linked_status === 'unlinked' || !activeCard.account_id;
                  const linkedBalance = Number(
                    activeCard.linked_balance ?? linkedAcc?.available_balance ?? linkedAcc?.balance ?? 0
                  );
                  const activeCardTxs = transactions
                    .filter((t) => t.source_card_id === activeCard.id || t.source_card_last4 === activeCard.last4)
                    .slice(0, 4);
                  const interestPrev = activeCard.interest_preview;
                  const upgradeInfo = activeCard.upgrade_status;

                  return (
                    <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.cardBg}`}>
                      {/* Linked Account Live Row */}
                      <div className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${theme.subCardBg}`}>
                        <div className="min-w-0">
                          <p className={`text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-1 ${theme.textSecondary}`}>
                            {isUnlinked && <Link2Off className="w-3 h-3 text-rose-500" />}
                            <span>
                              {activeCard.bank_name || 'Hikari Bank'} · {activeCard.tier_label || 'Standard'}
                            </span>
                          </p>
                          <p className={`text-xs font-extrabold truncate mt-0.5 ${isUnlinked ? 'text-rose-500' : theme.textPrimary}`}>
                            {isUnlinked || !linkedAcc
                              ? 'Thẻ đang ngưng liên kết tài khoản'
                              : `${linkedAcc.nickname || linkedAcc.account_type} · ${maskAccountNumber(linkedAcc.account_number)}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[10px] ${theme.textSecondary}`}>Khả dụng</p>
                          <p className={`text-sm font-black tabular-nums ${theme.accentClass}`}>
                            {isUnlinked ? '—' : formatVnd(linkedBalance, hideBalance)}
                          </p>
                        </div>
                      </div>

                      {/* 4 Core Card Metrics */}
                      <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                        <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
                          <span className={`text-[10.5px] ${theme.textSecondary}`}>Hoàn tiền Cashback</span>
                          <p className="text-sm font-black text-emerald-500">{Number(activeCard.cashback_rate || 0)}%</p>
                          <p className={`text-[10px] truncate ${theme.textSecondary}`}>
                            Đã nhận {formatVnd(Number(activeCard.cashback_used_month || 0), hideBalance)} / {formatVnd(Number(activeCard.cashback_cap_month || 0), hideBalance)}
                          </p>
                        </div>
                        <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
                          <span className={`text-[10.5px] ${theme.textSecondary}`}>Lãi suất số dư</span>
                          <p className="text-sm font-black text-sky-500">{Number(activeCard.interest_rate || 0)}%/năm</p>
                          <p className={`text-[10px] truncate ${theme.textSecondary}`}>
                            {interestPrev
                              ? interestPrev.alreadyClaimedToday
                                ? 'Đã nhận lãi hôm nay'
                                : interestPrev.estimatedInterest > 0
                                ? `Sẵn sàng +${formatVnd(interestPrev.estimatedInterest)}`
                                : 'Chưa phát sinh lãi'
                              : `Hạn mức ${formatVnd(Number(activeCard.interest_balance_cap || 0))}`}
                          </p>
                        </div>
                        <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
                          <span className={`text-[10.5px] ${theme.textSecondary}`}>Điểm thưởng tích lũy</span>
                          <p className="text-sm font-black text-amber-500">
                            {Number(activeCard.reward_points || 0).toLocaleString('de-DE')} điểm
                          </p>
                          <p className={`text-[10px] ${theme.textSecondary}`}>
                            +{Number(activeCard.reward_point_rate || 0)} điểm / 100kđ
                          </p>
                        </div>
                        <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
                          <span className={`text-[10.5px] ${theme.textSecondary}`}>Chi tiêu hôm nay</span>
                          <p className={`text-sm font-black ${theme.textPrimary}`}>
                            {formatVnd(Number(activeCard.spent_today || 0), hideBalance)}
                          </p>
                          <p className={`text-[10px] truncate ${theme.textSecondary}`}>
                            HM {formatVnd(Number(activeCard.daily_limit || 0), hideBalance)}/ngày
                          </p>
                        </div>
                      </div>

                      {/* Quick Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailCardId(activeCard.id)}
                          className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${theme.subCardBg}`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#E14B5A]" />
                          <span>Chi tiết & Hạn mức</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardViewMode('benefits')}
                          className="min-h-[44px] px-3 rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Quẹt thẻ & Đổi quà</span>
                        </button>
                      </div>

                      {/* Inline Interest Claim & Upgrade Highlight */}
                      <div className="flex flex-wrap gap-2">
                        {interestPrev && interestPrev.estimatedInterest > 0 && !interestPrev.alreadyClaimedToday && (
                          <button
                            type="button"
                            disabled={cardBusy}
                            onClick={() => void handleClaimInterest(activeCard.id)}
                            className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 tabular-nums"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Nhận lãi +{formatVnd(interestPrev.estimatedInterest)}</span>
                          </button>
                        )}
                        {upgradeInfo?.hasNextTier && (
                          <button
                            type="button"
                            onClick={() => setDetailCardId(activeCard.id)}
                            className={`flex-1 min-h-[40px] px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 ${
                              upgradeInfo.eligible ? theme.badgeSuccess : theme.subCardBg
                            }`}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>
                              {upgradeInfo.eligible
                                ? `Đủ điều kiện lên ${upgradeInfo.nextTierLabel}`
                                : `Lộ trình lên ${upgradeInfo.nextTierLabel}`}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Benefits Preview */}
                      {Array.isArray(activeCard.benefits) && activeCard.benefits.length > 0 && (
                        <div className={`pt-2 border-t space-y-1 text-[11px] ${theme.border}`}>
                          <p className={`font-bold flex items-center gap-1 ${theme.textSecondary}`}>
                            <Sparkles className="w-3 h-3 text-[#E14B5A]" />
                            <span>Quyền lợi nổi bật ({activeCard.tier_label})</span>
                          </p>
                          <p className={`truncate ${theme.textPrimary}`}>{activeCard.benefits.slice(0, 2).join(' · ')}</p>
                        </div>
                      )}

                      {/* Recent Card Transactions */}
                      {activeCardTxs.length > 0 && (
                        <div className={`pt-2 border-t space-y-1.5 ${theme.border}`}>
                          <p className={`text-[11px] font-bold ${theme.textSecondary}`}>
                            Giao dịch thẻ •••• {activeCard.last4} gần đây
                          </p>
                          {activeCardTxs.map((t) => {
                            const declined =
                              t.status === 'Thất bại' || t.tx_status_code === 'DECLINED' || t.bill_template === 'failed';
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => onOpenTxDetail?.(t)}
                                className="w-full flex items-center justify-between gap-2 text-[11px] py-1 text-left hover:opacity-80"
                              >
                                <span className={`truncate ${theme.textSecondary}`}>
                                  {declined ? '[Từ chối] ' : ''}
                                  {t.counterparty} · {formatTimeAgoOrDate(t.created_at)}
                                </span>
                                <span
                                  className={`font-bold tabular-nums shrink-0 ${
                                    declined ? 'text-amber-600' : 'text-rose-500'
                                  }`}
                                >
                                  {declined ? '0đ' : `-${formatVnd(t.total_debit ?? t.amount, hideBalance)}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )
          ) : (
            <CardBenefitsHub
              cards={cards}
              selectedCardId={activeCard?.id || ''}
              onSelectCardId={setSelectedCardId}
              cardBills={cardBills}
              partners={cardPartners}
              rewardCatalog={cardRewardCatalog}
              vouchers={cardVouchers}
              pointsLedger={cardPointsLedger}
              cashbackLogs={cardCashbackLogs}
              interestLogs={cardInterestLogs}
              theme={theme}
              hideBalance={hideBalance}
              busy={cardBusy}
              onPayWithCard={handlePayWithCard}
              onRedeemReward={handleRedeemReward}
              onClaimInterest={handleClaimInterest}
            />
          )}

          <IssueCardModal
            open={issueCardOpen}
            banks={cardBanks}
            accounts={accounts}
            existingCards={cards}
            totalAssets={totalAssets}
            theme={theme}
            busy={cardBusy}
            onClose={() => setIssueCardOpen(false)}
            onIssue={handleIssueCard}
          />

          <CardDetailSheet
            card={detailCard}
            accounts={accounts}
            transactions={transactions}
            theme={theme}
            hideBalance={hideBalance}
            busy={cardBusy}
            onClose={() => setDetailCardId(null)}
            onSetPrimary={handleSetPrimaryCard}
            onUpdateCard={handleUpdateCard}
            onRevealCard={handleRevealCard}
            onChangePin={handleChangeCardPin}
            onCancelCard={handleCancelCard}
            onReissueCard={handleReissueCard}
            onLinkCard={handleLinkCard}
            onUnlinkCard={handleUnlinkCard}
            onClaimInterest={handleClaimInterest}
            onUpgradeCard={handleUpgradeCard}
            onOpenBenefitsHub={(id) => {
              setSelectedCardId(id);
              setCardViewMode('benefits');
            }}
            onSelectTransaction={(tx) => onOpenTxDetail?.(tx)}
          />
        </div>
      )}

      {/* SECTION 4: INVESTMENTS */}
      {section === 'investments' && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-3.5 border space-y-2.5 ${theme.cardBg}`}>
            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Danh mục đang nắm giữ ({investments.length})
            </h3>
            {investments.length === 0 ? (
              <p className={`text-xs ${theme.textSecondary}`}>
                Chưa có tài sản đầu tư. Chọn sản phẩm bên dưới để bắt đầu!
              </p>
            ) : (
              investments.map((inv) => {
                const curValue = Math.round(inv.units * inv.current_price);
                const pnl = curValue - inv.invested_amount;
                return (
                  <div key={inv.id} className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${theme.subCardBg}`}>
                    <div>
                      <p className={`text-xs font-extrabold ${theme.textPrimary}`}>
                        {inv.asset_code} · {inv.asset_name}
                      </p>
                      <p className={`text-[11px] tabular-nums ${theme.textSecondary}`}>
                        {inv.units} đơn vị · Giá TB {formatVnd(inv.avg_buy_price, hideBalance)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black tabular-nums ${theme.textPrimary}`}>{formatVnd(curValue, hideBalance)}</p>
                      <p className={`text-[10px] font-bold tabular-nums ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pnl >= 0 ? '+' : ''}
                        {formatVnd(pnl, hideBalance)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className={`rounded-2xl p-3.5 border space-y-3 ${theme.cardBg}`}>
            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Đặt lệnh Mua / Bán tài sản
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {INVESTMENT_CATALOG.map((item) => (
                <button
                  key={item.asset_code}
                  type="button"
                  onClick={() => setTradeAssetCode(item.asset_code)}
                  className={`p-2.5 rounded-xl border text-left ${
                    tradeAssetCode === item.asset_code ? 'border-[#E14B5A] bg-[#E14B5A]/10' : theme.subCardBg
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-extrabold ${theme.textPrimary}`}>{item.asset_code}</span>
                    <span className="text-[10px] font-bold text-emerald-500">{item.changePct}</span>
                  </div>
                  <p className={`text-[10px] truncate mt-0.5 ${theme.textSecondary}`}>{item.asset_name}</p>
                  <p className={`text-xs font-bold tabular-nums mt-1 ${theme.textPrimary}`}>
                    {formatVnd(item.current_price)}
                  </p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTradeSide('buy')}
                className={`py-2 rounded-xl border text-xs font-extrabold ${
                  tradeSide === 'buy' ? 'bg-emerald-600 text-white border-transparent' : theme.chipInactive
                }`}
              >
                Lệnh Mua (Buy)
              </button>
              <button
                type="button"
                onClick={() => setTradeSide('sell')}
                className={`py-2 rounded-xl border text-xs font-extrabold ${
                  tradeSide === 'sell' ? 'bg-rose-600 text-white border-transparent' : theme.chipInactive
                }`}
              >
                Lệnh Bán (Sell)
              </button>
            </div>

            <input
              type="number"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="Số tiền giao dịch (tối thiểu 100.000đ)"
              className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold tabular-nums outline-none ${theme.inputClass}`}
            />
            <button
              type="button"
              disabled={tradeBusy}
              onClick={async () => {
                if (tradeBusy) return;
                setTradeBusy(true);
                try {
                  const res = await osApi.banking.tradeInvestment({
                    asset_code: tradeAssetCode,
                    side: tradeSide,
                    amount: Number(tradeAmount),
                  });
                  onUpdated(res);
                  onShowToast(
                    'Khớp lệnh thành công',
                    `${tradeSide === 'buy' ? 'Mua' : 'Bán'} ${tradeAssetCode} trị giá ${formatVnd(Number(tradeAmount))}`,
                    'success'
                  );
                } catch (err) {
                  onShowToast('Lỗi đặt lệnh', err instanceof Error ? err.message : 'Thất bại', 'error');
                } finally {
                  setTradeBusy(false);
                }
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#E14B5A] text-white text-xs font-extrabold disabled:opacity-60"
            >
              {tradeBusy
                ? 'Đang xử lý...'
                : `Xác nhận đặt lệnh ${tradeSide === 'buy' ? 'MUA' : 'BÁN'} ${tradeAssetCode}`}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: EXPENSE MANAGEMENT & GOALS (10 CATEGORIES) */}
      {section === 'expenses' && (
        <div className="space-y-3">
          {/* Month over Month Comparison */}
          <div className={`rounded-2xl p-3.5 border grid grid-cols-2 gap-2.5 ${theme.cardBg}`}>
            <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
              <p className={`text-[11px] ${theme.textSecondary}`}>Chi tiêu tháng này</p>
              <p className="text-sm font-black text-rose-500 tabular-nums mt-0.5">
                {formatVnd(thisMonthSpend, hideBalance)}
              </p>
            </div>
            <div className={`rounded-xl border p-2.5 ${theme.subCardBg}`}>
              <p className={`text-[11px] ${theme.textSecondary}`}>Chi tiêu tháng trước</p>
              <p className={`text-sm font-black tabular-nums mt-0.5 ${theme.textPrimary}`}>
                {formatVnd(prevMonthSpend, hideBalance)}
              </p>
            </div>
          </div>

          {/* 10 Expense Categories & Budgets */}
          <div className={`rounded-2xl p-3.5 border space-y-2.5 ${theme.cardBg}`}>
            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Ngân sách 10 danh mục chi tiêu
            </h3>
            {EXPENSE_CATEGORIES.map((cat) => {
              const b = budgets.find((x) => x.category === cat.name);
              const limit = b?.monthly_limit || 2000000;
              const spent = catSpend[cat.name] || 0;
              const pct = Math.min(100, Math.round((spent / Math.max(1, limit)) * 100));
              const isAlert = pct >= (b?.alert_threshold || 80);

              return (
                <div key={cat.name} className={`space-y-1 py-1 border-b last:border-0 ${theme.border}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold flex items-center gap-1.5 ${theme.textPrimary}`}>
                      <span>{cat.name}</span>
                      {isAlert && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`tabular-nums text-[11px] font-semibold ${theme.textSecondary}`}>
                        {formatVnd(spent, hideBalance)} / {formatVnd(limit, hideBalance)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBudgetCat(cat.name);
                          setBudgetLimitVal(String(limit));
                        }}
                        className={`text-[10px] font-bold ${theme.accentClass}`}
                      >
                        Sửa
                      </button>
                    </div>
                  </div>
                  <div className={`h-2 rounded overflow-hidden ${theme.progressTrackBg}`}>
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${pct}%`, backgroundColor: isAlert ? '#EF4444' : cat.color }}
                    />
                  </div>
                  {editingBudgetCat === cat.name && (
                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="number"
                        value={budgetLimitVal}
                        onChange={(e) => setBudgetLimitVal(e.target.value)}
                        className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs tabular-nums outline-none ${theme.inputClass}`}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await osApi.banking.upsertBudget({
                            category: cat.name,
                            monthly_limit: Number(budgetLimitVal),
                          });
                          onUpdated(res);
                          setEditingBudgetCat(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#E14B5A] text-white text-xs font-bold"
                      >
                        Lưu
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Savings Goals */}
          <div className={`rounded-2xl p-3.5 border space-y-2.5 ${theme.cardBg}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
                Mục tiêu tiết kiệm ({savingsGoals.length})
              </h3>
              <button
                type="button"
                onClick={() => setNewGoalOpen((o) => !o)}
                className="px-2.5 py-1.5 rounded-lg bg-[#E14B5A] text-white text-[11px] font-bold"
              >
                + Mục tiêu
              </button>
            </div>

            {newGoalOpen && (
              <div className={`p-2.5 rounded-xl border space-y-2 ${theme.subCardBg}`}>
                <input
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Tên mục tiêu (vd: Mua laptop mới)"
                  className={`w-full px-2.5 py-2 rounded-lg border text-xs outline-none ${theme.inputClass}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Số tiền đích"
                    className={`px-2.5 py-2 rounded-lg border text-xs tabular-nums outline-none ${theme.inputClass}`}
                  />
                  <input
                    type="date"
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className={`px-2.5 py-2 rounded-lg border text-xs outline-none ${theme.inputClass}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await osApi.banking.createGoal({
                        title: goalTitle,
                        target_amount: Number(goalTarget),
                        deadline: goalDeadline,
                      });
                      onUpdated(res);
                      setNewGoalOpen(false);
                      setGoalTitle('');
                    } catch (err) {
                      onShowToast('Lỗi', err instanceof Error ? err.message : 'Không hợp lệ', 'error');
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-[#E14B5A] text-white text-xs font-bold"
                >
                  Tạo mục tiêu
                </button>
              </div>
            )}

            {savingsGoals.map((g) => {
              const pct = Math.min(100, Math.round((g.current_amount / Math.max(1, g.target_amount)) * 100));
              return (
                <div key={g.id} className={`p-2.5 rounded-xl border space-y-1.5 ${theme.subCardBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-bold truncate flex items-center gap-1 ${theme.textPrimary}`}>
                      {pct >= 100 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      <span className="truncate">{g.title}</span>
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await osApi.banking.deleteGoal(g.id);
                        onUpdated(res);
                      }}
                      className={`${theme.textSecondary} hover:text-rose-500`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className={`flex justify-between text-[11px] tabular-nums ${theme.textSecondary}`}>
                    <span>
                      {formatVnd(g.current_amount, hideBalance)} / {formatVnd(g.target_amount, hideBalance)}
                    </span>
                    <span>
                      {pct}% · Hạn {g.deadline}
                    </span>
                  </div>
                  <div className={`h-2 rounded overflow-hidden ${theme.progressTrackBg}`}>
                    <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await osApi.banking.contributeGoal(g.id, 500000);
                        onUpdated(res);
                        onShowToast('Đã góp quỹ', '+500.000đ vào mục tiêu', 'success');
                      } catch (err) {
                        onShowToast('Lỗi', err instanceof Error ? err.message : 'Không đủ số dư', 'error');
                      }
                    }}
                    className={`w-full py-1.5 rounded-lg border text-[11px] font-bold ${theme.badgeSuccess}`}
                  >
                    + Góp nhanh 500.000đ vào mục tiêu
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
