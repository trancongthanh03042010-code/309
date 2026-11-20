import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  FileImage,
  History,
  Receipt,
  Repeat,
  Search,
  Smartphone,
  Sparkles,
  UserCheck,
  Wifi,
} from 'lucide-react';
import { emitTelecomSyncEvent, osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingAiBill,
  BankingBillDemo,
  BankingCardItem,
  BankingOverviewPayload,
  BankingTransactionDemo,
  Contact,
  SharePayload,
  TelecomCarrier,
  TelecomUserSim,
} from '../../types/os';
import { CarrierLogo, formatPhoneDisplay, TOPUP_DENOMINATIONS } from '../telecom/CarrierBrand';
import { BillArchiveView } from './BillArchiveAndPreviewModal';
import type { HikariThemePalette } from './HikariBrand';
import { PaymentSourceSelector, resolveDefaultPaymentSource } from './PaymentSourceSelector';
import {
  BILL_CATEGORIES,
  EXPENSE_CATEGORIES,
  formatShortDate,
  formatTimeAgoOrDate,
  formatVnd,
  inferBillTemplate,
  isCardExpired,
  isSuccessBillableTx,
} from './utils';

type TxFilterKey =
  | 'all'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'bill'
  | 'savings'
  | 'topup'
  | 'refund'
  | 'ai';

type DateRangeKey = 'all' | 'today' | '7d' | '30d' | 'custom';
type StatusFilterKey = 'all' | 'success' | 'pending' | 'failed';

const TX_FILTER_CHIPS: Array<{ key: TxFilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'income', label: 'Tiền vào' },
  { key: 'expense', label: 'Tiền ra' },
  { key: 'transfer', label: 'Chuyển khoản' },
  { key: 'bill', label: 'Thanh toán' },
  { key: 'savings', label: 'Tiết kiệm' },
  { key: 'topup', label: 'Nạp ĐT' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'ai', label: 'Giao dịch CHAR' },
];

interface TransactionsAndBillsViewProps {
  initialSubTab?: 'history' | 'archive' | 'bills' | 'topup';
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  cards: BankingCardItem[];
  aiAccounts: BankingAccountDemo[];
  transactions: BankingTransactionDemo[];
  bills: BankingBillDemo[];
  aiBills: BankingAiBill[];
  contacts: Contact[];
  telecomCarriers?: TelecomCarrier[];
  telecomSims?: TelecomUserSim[];
  hideBalance?: boolean;
  theme: HikariThemePalette;
  onOverviewUpdate: (payload: BankingOverviewPayload) => void;
  onSelectTransaction: (tx: BankingTransactionDemo) => void;
  onShare: (payload: SharePayload) => void;
  onOpenTelecomApp?: () => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function TransactionsAndBillsView({
  initialSubTab = 'history',
  account,
  accounts,
  cards,
  aiAccounts,
  transactions,
  bills,
  aiBills,
  contacts,
  telecomCarriers = [],
  telecomSims = [],
  hideBalance = false,
  theme,
  onOverviewUpdate,
  onSelectTransaction,
  onShare,
  onOpenTelecomApp,
  onShowToast: showToast,
  onRequestConfirm,
}: TransactionsAndBillsViewProps) {
  const [subTab, setSubTab] = useState<'history' | 'archive' | 'bills' | 'topup'>(initialSubTab);

  // Payment source (card / account)
  const defaultSource = useMemo(() => resolveDefaultPaymentSource(accounts, cards), [accounts, cards]);
  const [paySource, setPaySource] = useState<{ accountId: string; cardId?: string }>(() => defaultSource);

  useEffect(() => {
    setPaySource((cur) => {
      const cardObj = cur.cardId ? cards.find((c) => c.id === cur.cardId) : undefined;
      const cardBad =
        cardObj &&
        (cardObj.status === 'locked' ||
          isCardExpired(cardObj.expiry) ||
          cardObj.linked_status === 'unlinked' ||
          !cardObj.account_id);
      const accObj = accounts.find((a) => a.id === (cardObj?.account_id || cur.accountId));
      const accBad = !accObj || accObj.account_role === 'receive_only' || accObj.status === 'locked';
      if (cardBad || accBad) return defaultSource;
      return cur;
    });
  }, [accounts, cards, defaultSource]);

  const payCard = useMemo(
    () => (paySource.cardId ? cards.find((c) => c.id === paySource.cardId) || null : null),
    [cards, paySource.cardId]
  );
  const payAccount = useMemo(() => {
    if (payCard?.account_id) {
      const linked = accounts.find((a) => a.id === payCard.account_id);
      if (linked) return linked;
    }
    return accounts.find((a) => a.id === paySource.accountId) || account || accounts[0] || null;
  }, [accounts, payCard, paySource.accountId, account]);
  const payAvailable = Number(payAccount?.available_balance ?? payAccount?.balance ?? 0);
  const computeCardFeePreview = (amt: number) => {
    if (!payCard || amt <= 0) return 0;
    return Math.round(amt * (Number(payCard.tx_fee_pct || 0) / 100)) + Math.round(Number(payCard.fixed_tx_fee || 0));
  };
  const paySourceInvalid =
    !payAccount ||
    payAccount.account_role === 'receive_only' ||
    payAccount.status === 'locked' ||
    (payCard
      ? payCard.status === 'locked' ||
        isCardExpired(payCard.expiry) ||
        payCard.linked_status === 'unlinked' ||
        !payCard.account_id
      : false);

  // History state
  const [txFilter, setTxFilter] = useState<TxFilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [txQuery, setTxQuery] = useState('');

  // Bills state
  const [billCat, setBillCat] = useState(BILL_CATEGORIES[0]);
  const [customerCode, setCustomerCode] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    provider: string;
    bill_type: string;
    amount: number;
    customer_code: string;
    due_date: string;
  } | null>(null);
  const [billBusy, setBillBusy] = useState(false);

  // Anime Telecom Topup state (synced with Anime Telecom SIMs)
  const activeOwnedSims = useMemo(() => telecomSims.filter((s) => s.status !== 'cancelled'), [telecomSims]);
  const defaultOwnedSim = useMemo(
    () =>
      activeOwnedSims.find((s) => s.status === 'active' && Number(s.is_primary) === 1) ||
      activeOwnedSims.find((s) => s.status === 'active') ||
      activeOwnedSims[0] ||
      null,
    [activeOwnedSims]
  );
  const [selectedSimId, setSelectedSimId] = useState<string>(() => defaultOwnedSim?.id || '');
  const [carrier, setCarrier] = useState<string>(() => defaultOwnedSim?.carrier_id || telecomCarriers[0]?.id || 'hoshi');
  const [phoneNumber, setPhoneNumber] = useState<string>(() => defaultOwnedSim?.phone_number || '');
  const [topupAmount, setTopupAmount] = useState<number>(100000);
  const [topupBusy, setTopupBusy] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (defaultOwnedSim && !activeOwnedSims.some((s) => s.id === selectedSimId)) {
      setSelectedSimId(defaultOwnedSim.id);
      setCarrier(defaultOwnedSim.carrier_id);
      setPhoneNumber(defaultOwnedSim.phone_number);
    }
  }, [defaultOwnedSim, activeOwnedSims, selectedSimId]);

  const selectedOwnedSim = useMemo(
    () => activeOwnedSims.find((s) => s.id === selectedSimId) || null,
    [activeOwnedSims, selectedSimId]
  );
  const matchedCarrierObj = useMemo(
    () => telecomCarriers.find((c) => c.id === (selectedOwnedSim?.carrier_id || carrier)) || null,
    [telecomCarriers, selectedOwnedSim, carrier]
  );

  const filteredTransactions = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    return transactions.filter((tx) => {
      const tmpl = inferBillTemplate(tx);
      if (txFilter === 'income' && tx.tx_type !== 'income') return false;
      if (txFilter === 'expense' && tx.tx_type !== 'expense') return false;
      if (txFilter === 'transfer' && tmpl !== 'transfer' && tmpl !== 'receive') return false;
      if (txFilter === 'bill' && tmpl !== 'bill' && tmpl !== 'shopping' && tmpl !== 'loan_pay') return false;
      if (txFilter === 'savings' && tmpl !== 'savings_open' && tmpl !== 'savings_settle') return false;
      if (txFilter === 'topup' && tmpl !== 'topup') return false;
      if (txFilter === 'refund' && tmpl !== 'refund') return false;
      if (txFilter === 'ai' && !tx.is_ai_tx && tmpl !== 'ai_tx') return false;

      const stLow = String(tx.status || '').toLowerCase();
      const isFailed = stLow.includes('thất bại') || stLow.includes('lỗi') || tx.bill_template === 'failed';
      const isPending = !isFailed && (stLow.includes('đang xử lý') || stLow.includes('pending'));
      if (statusFilter === 'success' && (isFailed || isPending)) return false;
      if (statusFilter === 'pending' && !isPending) return false;
      if (statusFilter === 'failed' && !isFailed) return false;

      if (dateRange === 'today' && !tx.created_at.startsWith(todayStr)) return false;
      if (dateRange === '7d' && new Date(tx.created_at).getTime() < now - 7 * 86400_000) return false;
      if (dateRange === '30d' && new Date(tx.created_at).getTime() < now - 30 * 86400_000) return false;
      if (dateRange === 'custom') {
        const d = tx.created_at.slice(0, 10);
        if (customFrom && d < customFrom) return false;
        if (customTo && d > customTo) return false;
      }

      if (q) {
        const hay = `${tx.counterparty} ${tx.account_number || ''} ${tx.ref_code || ''} ${tx.note} ${tx.created_at} ${tx.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, txFilter, statusFilter, dateRange, customFrom, customTo, txQuery]);

  const filteredSummary = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of filteredTransactions) {
      if (!isSuccessBillableTx(t)) continue;
      if (t.tx_type === 'income') inc += Number(t.amount || 0);
      else exp += Number(t.amount || 0);
    }
    return { inc, exp };
  }, [filteredTransactions]);

  const unpaidBills = useMemo(() => bills.filter((b) => !b.is_paid), [bills]);
  const paidBills = useMemo(() => bills.filter((b) => Boolean(b.is_paid)), [bills]);

  const handleLookupBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerCode.trim()) {
      showToast('Thiếu mã khách hàng', 'Vui lòng nhập mã khách hàng để tra cứu hóa đơn.', 'error');
      return;
    }
    setBillBusy(true);
    try {
      const res = await osApi.banking.lookupBill(billCat, customerCode.trim());
      setLookupResult(res.bill);
    } catch (err) {
      showToast('Không tra cứu được', err instanceof Error ? err.message : 'Lỗi tra cứu hóa đơn', 'error');
    } finally {
      setBillBusy(false);
    }
  };

  const handleSaveLookedUpBill = async () => {
    if (!lookupResult) return;
    setBillBusy(true);
    try {
      const res = await osApi.banking.createBill({
        provider: lookupResult.provider,
        bill_type: lookupResult.bill_type,
        amount: lookupResult.amount,
        due_date: lookupResult.due_date,
        customer_code: lookupResult.customer_code,
      });
      onOverviewUpdate(res);
      setLookupResult(null);
      setCustomerCode('');
      showToast('Đã lưu hóa đơn', `Đã thêm hóa đơn ${lookupResult.provider} vào danh sách cần thanh toán.`, 'success');
    } catch (err) {
      showToast('Lỗi thêm hóa đơn', err instanceof Error ? err.message : 'Không thể lưu', 'error');
    } finally {
      setBillBusy(false);
    }
  };

  const handlePayBill = (bill: BankingBillDemo) => {
    if (billBusy) return;
    if (!bill.amount || Number(bill.amount) <= 0) {
      showToast('Hóa đơn 0đ', 'Hóa đơn 0đ không cần thanh toán.', 'error');
      return;
    }
    if (paySourceInvalid) {
      showToast('Nguồn thanh toán không hợp lệ', 'Vui lòng chọn thẻ hoặc tài khoản đang hoạt động.', 'error');
      return;
    }
    const fee = computeCardFeePreview(bill.amount);
    const totalNeeded = bill.amount + fee;
    if (totalNeeded > payAvailable) {
      showToast(
        'Số dư không đủ',
        'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
        'error'
      );
      return;
    }
    const sourceLabel = payCard
      ? `${payCard.card_nickname || payCard.card_name} (•••• ${payCard.last4})`
      : payAccount?.nickname || payAccount?.account_type || 'Tài khoản Hikari';
    const idempotencyKey = `hkbill_${bill.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    onRequestConfirm({
      title: 'Thanh toán hóa đơn',
      message: `Thanh toán ${formatVnd(bill.amount)}${fee > 0 ? ` + phí ${formatVnd(fee)}` : ''} cho ${bill.provider} (${bill.bill_type}) từ ${sourceLabel}?`,
      onConfirm: async () => {
        if (billBusy) return;
        setBillBusy(true);
        try {
          const res = await osApi.banking.payBill(bill.id, {
            sourceAccountId: payAccount?.id,
            sourceCardId: payCard?.id,
            idempotencyKey,
          });
          onOverviewUpdate(res);
          showToast('Thanh toán thành công', `Đã thanh toán ${bill.provider}.`, 'success');
          if (res.transaction) onSelectTransaction(res.transaction);
        } catch (err) {
          showToast('Thanh toán thất bại', err instanceof Error ? err.message : 'Số dư không đủ', 'error');
        } finally {
          setBillBusy(false);
        }
      },
    });
  };

  const handleToggleBillRecurring = async (bill: BankingBillDemo) => {
    try {
      const next = bill.recurring_enabled ? 0 : 1;
      const res = await osApi.banking.updateBill(bill.id, { recurring_enabled: next });
      onOverviewUpdate(res);
      showToast('Cập nhật tự động trả', next ? 'Đã bật thanh toán định kỳ hàng tháng.' : 'Đã tắt thanh toán định kỳ.', 'info');
    } catch (err) {
      showToast('Lỗi cập nhật', err instanceof Error ? err.message : 'Thất bại', 'error');
    }
  };

  const handlePayAiBill = async (aiBill: BankingAiBill, payer: 'ai' | 'user') => {
    if (billBusy) return;
    if (!aiBill.amount || Number(aiBill.amount) <= 0) {
      showToast('Hóa đơn 0đ', 'Hóa đơn 0đ không cần thanh toán.', 'error');
      return;
    }
    setBillBusy(true);
    try {
      const res = await osApi.banking.payAiBill(aiBill.id, payer);
      onOverviewUpdate(res);
      showToast(
        'Đã thanh toán hóa đơn CHAR',
        payer === 'user'
          ? `Bạn đã thanh toán hộ ${formatVnd(aiBill.amount)} cho "${aiBill.title}".`
          : `Đã trích tài khoản CHAR thanh toán "${aiBill.title}".`,
        'success'
      );
    } catch (err) {
      showToast('Không thể thanh toán', err instanceof Error ? err.message : 'Số dư không đủ', 'error');
    } finally {
      setBillBusy(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topupBusy) return;
    if (selectedOwnedSim && selectedOwnedSim.status !== 'active') {
      showToast('SIM đang tạm khóa', 'SIM này đang bị khóa trong Anime Telecom, không thể nạp tiền.', 'error');
      return;
    }
    const cleaned = (selectedOwnedSim ? selectedOwnedSim.phone_number : phoneNumber).replace(/\D/g, '');
    if (cleaned.length < 9 || cleaned.length > 11) {
      showToast('Số điện thoại chưa hợp lệ', 'Vui lòng chọn SIM hoặc nhập số thuê bao hợp lệ.', 'error');
      return;
    }
    if (paySourceInvalid) {
      showToast('Nguồn thanh toán không hợp lệ', 'Vui lòng chọn thẻ hoặc tài khoản đang hoạt động.', 'error');
      return;
    }
    const topupFee = computeCardFeePreview(topupAmount);
    if (topupAmount + topupFee > payAvailable) {
      showToast(
        'Số dư không đủ',
        'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
        'error'
      );
      return;
    }
    setTopupBusy(true);
    try {
      const idempotencyKey = `hktop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const carrierIdToSend = selectedOwnedSim?.carrier_id || carrier;
      const res = await osApi.banking.topupPhone({
        simId: selectedOwnedSim?.id,
        carrierId: carrierIdToSend,
        carrier: matchedCarrierObj?.name || carrierIdToSend,
        phone: cleaned,
        amount: topupAmount,
        sourceAccountId: payAccount?.id,
        sourceCardId: payCard?.id,
        idempotencyKey,
      });
      onOverviewUpdate(res);
      emitTelecomSyncEvent('banking');
      showToast(
        'Nạp tiền thành công',
        `Đã nạp ${formatVnd(topupAmount)} (${matchedCarrierObj?.name || carrierIdToSend}) cho số ${formatPhoneDisplay(cleaned)} và đồng bộ Anime Telecom.`,
        'success'
      );
      if (res.transaction) onSelectTransaction(res.transaction);
    } catch (err) {
      showToast('Nạp tiền thất bại', err instanceof Error ? err.message : 'Số dư không đủ', 'error');
    } finally {
      setTopupBusy(false);
    }
  };

  const handleCategoryChange = async (txId: string, cat: string) => {
    try {
      const res = await osApi.banking.updateTxCategory(txId, cat);
      onOverviewUpdate(res);
      showToast('Đã phân loại', `Danh mục chi tiêu chuyển thành "${cat}".`, 'success');
    } catch (err) {
      showToast('Lỗi cập nhật', err instanceof Error ? err.message : 'Thất bại', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-navigation bar */}
      <div className="px-3.5 pt-3 pb-2 shrink-0">
        <div className={`grid grid-cols-4 gap-1 p-1 rounded-2xl border ${theme.cardBg}`}>
          {[
            { id: 'history' as const, label: 'Lịch sử', icon: History },
            { id: 'archive' as const, label: 'Biên lai PNG', icon: FileImage },
            { id: 'bills' as const, label: `Hóa đơn (${unpaidBills.length})`, icon: Receipt },
            { id: 'topup' as const, label: 'Nạp ĐT', icon: Smartphone },
          ].map((item) => {
            const Icon = item.icon;
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={`min-h-[42px] px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                  active ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll px-3.5 pb-6 space-y-3.5">
        {subTab === 'history' && (
          <>
            {/* Search, Type, Status & Date Range Filters */}
            <div className={`rounded-2xl p-3 border space-y-2.5 ${theme.cardBg}`}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${theme.inputClass}`}>
                <Search className="w-4 h-4 opacity-50 shrink-0" />
                <input
                  value={txQuery}
                  onChange={(e) => setTxQuery(e.target.value)}
                  placeholder="Tìm tên, STK, mã GD (HK...), nội dung, số tiền..."
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {TX_FILTER_CHIPS.map((chip) => {
                  const active = txFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setTxFilter(chip.key)}
                      className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold shrink-0 whitespace-nowrap transition-colors border ${
                        active ? 'bg-[#E14B5A] text-white border-transparent' : theme.chipInactive
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Date Range & Status Filter Row */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold outline-none ${theme.inputClass}`}
                >
                  <option value="all" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Thời gian: Tất cả
                  </option>
                  <option value="today" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Hôm nay
                  </option>
                  <option value="7d" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    7 ngày gần đây
                  </option>
                  <option value="30d" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    30 ngày gần đây
                  </option>
                  <option value="custom" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Tùy chọn ngày...
                  </option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilterKey)}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold outline-none ${theme.inputClass}`}
                >
                  <option value="all" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Trạng thái: Tất cả
                  </option>
                  <option value="success" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Thành công
                  </option>
                  <option value="pending" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Đang xử lý
                  </option>
                  <option value="failed" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Thất bại
                  </option>
                </select>
              </div>

              {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none ${theme.inputClass}`}
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none ${theme.inputClass}`}
                  />
                </div>
              )}

              <div className={`grid grid-cols-2 gap-2 pt-1.5 border-t text-[11px] ${theme.border}`}>
                <div>
                  <span className={theme.textSecondary}>Tiền vào: </span>
                  <strong className="text-emerald-500 tabular-nums">+{formatVnd(filteredSummary.inc, hideBalance)}</strong>
                </div>
                <div className="text-right">
                  <span className={theme.textSecondary}>Tiền ra: </span>
                  <strong className="text-rose-500 tabular-nums">-{formatVnd(filteredSummary.exp, hideBalance)}</strong>
                </div>
              </div>
            </div>

            {/* Transaction Rows */}
            <div className="space-y-2">
              {filteredTransactions.length === 0 ? (
                <div className={`rounded-2xl p-8 text-center border ${theme.cardBg}`}>
                  <History className="w-8 h-8 opacity-40 mx-auto mb-2" />
                  <p className={`text-xs font-semibold ${theme.textSecondary}`}>Không có giao dịch khớp bộ lọc</p>
                </div>
              ) : (
                filteredTransactions.map((tx) => {
                  const isIncome = tx.tx_type === 'income';
                  const isFailed = String(tx.status || '').includes('Thất bại') || tx.bill_template === 'failed';
                  const isPending = !isFailed && String(tx.status || '').includes('Đang xử lý');
                  return (
                    <div key={tx.id} className={`rounded-2xl p-3 border space-y-2 ${theme.cardBg}`}>
                      <button
                        type="button"
                        onClick={() => onSelectTransaction(tx)}
                        className="w-full flex items-center justify-between gap-2.5 text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isFailed
                                ? 'bg-rose-500/15 text-rose-500'
                                : tx.is_ai_tx
                                ? 'bg-[#E14B5A]/15 text-[#E14B5A]'
                                : isIncome
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : theme.subCardBg
                            }`}
                          >
                            {tx.is_ai_tx ? (
                              <Bot className="w-5 h-5" />
                            ) : isIncome ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{tx.counterparty}</p>
                            <p className={`text-[11px] truncate ${theme.textSecondary}`}>{tx.note || tx.channel}</p>
                            <p className={`text-[10px] tabular-nums mt-0.5 ${theme.textSecondary}`}>
                              {tx.status || 'Thành công'} · {formatTimeAgoOrDate(tx.created_at)} · {tx.ref_code || tx.id}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-xs font-extrabold tabular-nums ${
                              isFailed
                                ? 'text-rose-500'
                                : isPending
                                ? 'text-amber-500'
                                : isIncome
                                ? 'text-emerald-500'
                                : theme.textPrimary
                            }`}
                          >
                            {isFailed ? '' : isIncome ? '+' : '-'}
                            {formatVnd(tx.amount, hideBalance)}
                          </p>
                          <span className={`text-[10px] font-semibold ${theme.accentClass}`}>Chi tiết →</span>
                        </div>
                      </button>

                      {tx.tx_type === 'expense' && (
                        <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-[11px] ${theme.border}`}>
                          <span className={theme.textSecondary}>Phân loại chi tiêu:</span>
                          <select
                            value={tx.category || 'Khác'}
                            onChange={(e) => void handleCategoryChange(tx.id, e.target.value)}
                            style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold outline-none ${theme.inputClass}`}
                          >
                            {EXPENSE_CATEGORIES.map((c) => (
                              <option
                                key={c.name}
                                value={c.name}
                                style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                              >
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {subTab === 'archive' && (
          <BillArchiveView
            transactions={transactions}
            account={account}
            theme={theme}
            onSelectBillTx={onSelectTransaction}
            onShare={onShare}
          />
        )}

        {subTab === 'bills' && (
          <div className="space-y-3.5">
            <form onSubmit={handleLookupBill} className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}>
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#E14B5A]" />
                <span>Tra cứu & Thanh toán Hóa đơn (10 dịch vụ)</span>
              </h3>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {BILL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setBillCat(cat);
                      setLookupResult(null);
                    }}
                    className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold shrink-0 whitespace-nowrap ${
                      billCat === cat ? 'bg-[#E14B5A] text-white' : `${theme.subCardBg} ${theme.textSecondary}`
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  placeholder={`Nhập mã KH ${billCat} (VD: HK20268811)`}
                  className={`flex-1 min-h-[42px] px-3 rounded-xl border text-xs font-mono outline-none ${theme.inputClass}`}
                />
                <button
                  type="submit"
                  disabled={billBusy}
                  className="min-h-[42px] px-3.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold shrink-0"
                >
                  {billBusy ? '...' : 'Tra cứu'}
                </button>
              </div>

              {lookupResult && (
                <div className={`rounded-xl border p-3 space-y-2 ${theme.subCardBg}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">{lookupResult.provider}</span>
                    <span className="font-extrabold text-[#E14B5A] tabular-nums">{formatVnd(lookupResult.amount)}</span>
                  </div>
                  <p className={`text-[11px] ${theme.textSecondary}`}>
                    Mã KH: <span className="font-mono font-semibold">{lookupResult.customer_code}</span> · Hạn:{' '}
                    {formatShortDate(lookupResult.due_date)}
                  </p>
                  <button
                    type="button"
                    disabled={billBusy}
                    onClick={() => void handleSaveLookedUpBill()}
                    className="w-full min-h-[40px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                  >
                    Lưu vào danh sách hóa đơn
                  </button>
                </div>
              )}
            </form>

            <PaymentSourceSelector
              accounts={accounts}
              cards={cards}
              selectedAccountId={payAccount?.id || paySource.accountId}
              selectedCardId={payCard?.id}
              requiredAmount={unpaidBills[0]?.amount || 0}
              hideBalance={hideBalance}
              theme={theme}
              label="Nguồn thanh toán hóa đơn"
              onSelect={setPaySource}
            />

            {/* Unpaid User Bills */}
            <div className="space-y-2">
              <h4 className={`text-xs font-bold uppercase tracking-wider px-1 ${theme.textSecondary}`}>
                Hóa đơn chờ thanh toán ({unpaidBills.length})
              </h4>
              {unpaidBills.length === 0 ? (
                <div className={`rounded-2xl border p-5 text-center text-xs ${theme.cardBg} ${theme.textSecondary}`}>
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1" />
                  Tất cả hóa đơn cá nhân đã được thanh toán.
                </div>
              ) : (
                unpaidBills.map((b) => {
                  const billInsufficient = b.amount > payAvailable;
                  return (
                    <div key={b.id} className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.cardBg}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-[11px] font-bold ${theme.accentClass}`}>{b.bill_type}</p>
                          <h5 className="text-xs font-bold mt-0.5">{b.provider}</h5>
                          <p className={`text-[11px] ${theme.textSecondary}`}>
                            {b.customer_code ? `Mã KH: ${b.customer_code} · ` : ''}Hạn: {formatShortDate(b.due_date)}
                          </p>
                        </div>
                        <span className="text-sm font-extrabold text-rose-500 tabular-nums">{formatVnd(b.amount)}</span>
                      </div>
                      {billInsufficient && (
                        <p className="text-[11px] font-semibold text-rose-500">
                          Số dư nguồn đang chọn không đủ ({formatVnd(payAvailable, hideBalance)}). Hãy đổi thẻ/tài khoản ở trên.
                        </p>
                      )}
                      <div className={`flex items-center justify-between pt-2 border-t ${theme.border}`}>
                        <button
                          type="button"
                          onClick={() => void handleToggleBillRecurring(b)}
                          className={`text-[11px] font-semibold flex items-center gap-1 ${theme.textSecondary}`}
                        >
                          <Repeat className={`w-3.5 h-3.5 ${b.recurring_enabled ? 'text-[#E14B5A]' : 'opacity-40'}`} />
                          <span>{b.recurring_enabled ? 'Tự động trả: BẬT' : 'Tự động trả: TẮT'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={billBusy || paySourceInvalid || billInsufficient || Number(b.amount || 0) <= 0}
                          onClick={() => handlePayBill(b)}
                          className="min-h-[38px] px-3.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold disabled:opacity-50"
                        >
                          {Number(b.amount || 0) <= 0 ? 'Hóa đơn 0đ' : 'Thanh toán ngay'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* AI Character Recurring Bills */}
            {aiBills.length > 0 && (
              <div className="space-y-2">
                <h4 className={`text-xs font-bold uppercase tracking-wider px-1 flex items-center gap-1.5 ${theme.textSecondary}`}>
                  <Sparkles className="w-3.5 h-3.5 text-[#E14B5A]" />
                  <span>Hóa đơn định kỳ của CHAR ({aiBills.length})</span>
                </h4>
                {aiBills.map((ab) => {
                  const aiAcc = aiAccounts.find((a) => a.character_id === ab.character_id);
                  return (
                    <div key={ab.id} className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {aiAcc?.avatar ? (
                            <img src={aiAcc.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[#E14B5A]/15 text-[#E14B5A] flex items-center justify-center shrink-0">
                              <Bot className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{ab.title}</p>
                            <p className={`text-[11px] truncate ${theme.textSecondary}`}>
                              {aiAcc?.character_name || aiAcc?.holder_name || ab.character_id} · {ab.bill_type}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-extrabold tabular-nums">{formatVnd(ab.amount)}</p>
                          <span className={`text-[10px] font-bold ${ab.is_paid ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {ab.is_paid ? 'Đã thanh toán' : `Hạn ${formatShortDate(ab.due_date)}`}
                          </span>
                        </div>
                      </div>

                      {!ab.is_paid && Number(ab.amount || 0) > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            disabled={billBusy}
                            onClick={() => void handlePayAiBill(ab, 'ai')}
                            className={`min-h-[38px] rounded-xl border text-[11px] font-bold ${theme.subCardBg}`}
                          >
                            Trích ví CHAR trả
                          </button>
                          <button
                            type="button"
                            disabled={billBusy}
                            onClick={() => void handlePayAiBill(ab, 'user')}
                            className="min-h-[38px] rounded-xl bg-[#E14B5A] text-white text-[11px] font-bold"
                          >
                            Trả hộ từ ví bạn
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {paidBills.length > 0 && (
              <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
                <p className={`text-xs font-bold ${theme.textSecondary}`}>Hóa đơn đã thanh toán ({paidBills.length})</p>
                {paidBills.slice(0, 6).map((b) => (
                  <div key={b.id} className={`flex items-center justify-between text-xs py-1 border-b last:border-0 ${theme.border}`}>
                    <span className="truncate font-medium">{b.provider}</span>
                    <span className="font-bold text-emerald-500 tabular-nums">{formatVnd(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === 'topup' && (
          <form onSubmit={handleTopup} className="space-y-3.5">
            <div className={`rounded-2xl border p-4 space-y-3.5 ${theme.cardBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-[#E14B5A]" />
                    <span>Nạp tiền SIM Anime Telecom</span>
                  </h3>
                  <p className={`text-[11px] ${theme.textSecondary}`}>
                    Đồng bộ 2 chiều với Anime Telecom · 0đ phí
                  </p>
                </div>
                {onOpenTelecomApp && (
                  <button
                    type="button"
                    onClick={onOpenTelecomApp}
                    className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold shrink-0 ${theme.subCardBg} ${theme.accentClass}`}
                  >
                    Mở Anime Telecom →
                  </button>
                )}
              </div>

              {/* Owned SIMs Selector (synced with Anime Telecom) */}
              {activeOwnedSims.length > 0 && (
                <div className="space-y-1.5">
                  <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>
                    Chọn SIM của bạn ({activeOwnedSims.length})
                  </label>
                  <div className="space-y-1.5">
                    {activeOwnedSims.map((sim) => {
                      const c = telecomCarriers.find((x) => x.id === sim.carrier_id);
                      const active = selectedSimId === sim.id;
                      const locked = sim.status !== 'active';
                      return (
                        <button
                          key={sim.id}
                          type="button"
                          onClick={() => {
                            setSelectedSimId(sim.id);
                            setCarrier(sim.carrier_id);
                            setPhoneNumber(sim.phone_number);
                          }}
                          className={`w-full min-h-[54px] rounded-xl border p-2.5 flex items-center justify-between gap-2 text-left transition-colors ${
                            active ? 'border-[#E14B5A] bg-[#E14B5A]/10' : theme.subCardBg
                          } ${locked ? 'opacity-55' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CarrierLogo variant={c?.logo_variant || sim.carrier_id} size={32} className="shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold tabular-nums truncate">
                                {formatPhoneDisplay(sim.phone_number)}
                                <span className={`ml-1.5 text-[10px] font-bold ${theme.accentClass}`}>
                                  {Number(sim.is_primary) === 1 ? '· SIM CHÍNH' : '· SIM PHỤ'}
                                </span>
                              </p>
                              <p className={`text-[11px] truncate tabular-nums ${theme.textSecondary}`}>
                                {c?.name || sim.carrier_id} · Số dư SIM: {formatVnd(sim.sim_balance)}
                                {locked ? ' (Đang tạm khóa)' : ''}
                              </p>
                            </div>
                          </div>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#E14B5A] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fictional Anime Carriers Strip */}
              <div className="space-y-1.5">
                <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>
                  Nhà mạng Anime ({telecomCarriers.length})
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {telecomCarriers.map((c) => {
                    const active = (selectedOwnedSim?.carrier_id || carrier) === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCarrier(c.id);
                          const matchSim = activeOwnedSims.find((s) => s.carrier_id === c.id && s.status === 'active');
                          if (matchSim) {
                            setSelectedSimId(matchSim.id);
                            setPhoneNumber(matchSim.phone_number);
                          } else {
                            setSelectedSimId('');
                          }
                        }}
                        className={`min-h-[42px] px-2.5 rounded-xl border text-[11px] font-bold shrink-0 flex items-center gap-1.5 transition-colors ${
                          active ? 'bg-[#E14B5A] text-white border-transparent' : `${theme.subCardBg} ${theme.textPrimary}`
                        }`}
                      >
                        <CarrierLogo variant={c.logo_variant} size={20} />
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Phone input */}
              <div className="space-y-1.5">
                <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>Số thuê bao nhận tiền</label>
                <input
                  value={phoneNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPhoneNumber(v);
                    const clean = v.replace(/\D/g, '');
                    const matched = activeOwnedSims.find((s) => s.phone_number === clean);
                    if (matched) {
                      setSelectedSimId(matched.id);
                      setCarrier(matched.carrier_id);
                    } else {
                      setSelectedSimId('');
                    }
                  }}
                  placeholder="089x xxx xxx"
                  className={`w-full min-h-[42px] px-3.5 rounded-xl border text-sm font-bold tabular-nums outline-none ${theme.inputClass}`}
                />
                {contacts.filter((c) => c.phone).length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
                    {contacts
                      .filter((c) => c.phone)
                      .slice(0, 6)
                      .map((ct) => (
                        <button
                          key={ct.id}
                          type="button"
                          onClick={() => {
                            setPhoneNumber(ct.phone);
                            setSelectedSimId('');
                          }}
                          className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-semibold shrink-0 flex items-center gap-1 ${theme.subCardBg}`}
                        >
                          <UserCheck className="w-3 h-3 text-[#E14B5A]" />
                          <span>{ct.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Topup Denominations */}
              <div className="space-y-1.5">
                <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>Mệnh giá nạp</label>
                <div className="grid grid-cols-3 gap-2">
                  {TOPUP_DENOMINATIONS.map((amt) => {
                    const active = topupAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopupAmount(amt)}
                        className={`min-h-[44px] rounded-xl text-xs font-extrabold tabular-nums border transition-colors ${
                          active ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : `${theme.subCardBg} ${theme.textPrimary}`
                        }`}
                      >
                        {formatVnd(amt)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <PaymentSourceSelector
                accounts={accounts}
                cards={cards}
                selectedAccountId={payAccount?.id || paySource.accountId}
                selectedCardId={payCard?.id}
                requiredAmount={topupAmount + computeCardFeePreview(topupAmount)}
                hideBalance={hideBalance}
                theme={theme}
                label="Nguồn thanh toán Hikari Bank"
                onSelect={setPaySource}
              />

              {/* Sync Preview Summary */}
              {selectedOwnedSim && (
                <div className={`rounded-2xl border p-3 text-xs space-y-1.5 ${theme.subCardBg}`}>
                  <div className="flex justify-between">
                    <span className={theme.textSecondary}>Số dư SIM hiện tại</span>
                    <span className="font-bold tabular-nums">{formatVnd(selectedOwnedSim.sim_balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={theme.textSecondary}>Số dư SIM sau nạp</span>
                    <span className="font-extrabold text-emerald-500 tabular-nums">
                      {formatVnd(Number(selectedOwnedSim.sim_balance || 0) + topupAmount)}
                    </span>
                  </div>
                  {payCard && (
                    <div className="flex justify-between">
                      <span className={theme.textSecondary}>Phí thẻ / Hoàn tiền</span>
                      <span className="font-bold tabular-nums">
                        {computeCardFeePreview(topupAmount) === 0 ? '0đ' : formatVnd(computeCardFeePreview(topupAmount))}
                        {Number(payCard.cashback_rate || 0) > 0
                          ? ` · Hoàn +${formatVnd(Math.round(topupAmount * (Number(payCard.cashback_rate) / 100)))}`
                          : ''}
                      </span>
                    </div>
                  )}
                  <div className={`flex justify-between pt-1 border-t ${theme.border}`}>
                    <span className={theme.textSecondary}>Trừ từ {payAccount?.nickname || 'Hikari Bank'}</span>
                    <span className="font-extrabold text-rose-500 tabular-nums">
                      -{formatVnd(topupAmount + computeCardFeePreview(topupAmount))}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  topupBusy ||
                  paySourceInvalid ||
                  topupAmount + computeCardFeePreview(topupAmount) > payAvailable ||
                  (selectedOwnedSim !== null && selectedOwnedSim.status !== 'active')
                }
                className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Smartphone className="w-4 h-4" />
                <span>
                  {topupBusy
                    ? 'Đang nạp tiền...'
                    : `Nạp ${formatVnd(topupAmount)} · ${matchedCarrierObj?.name || carrier}`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
