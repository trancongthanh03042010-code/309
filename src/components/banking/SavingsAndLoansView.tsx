import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Landmark,
  Percent,
  PiggyBank,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingLoanItem,
  BankingOverviewPayload,
  BankingSavingsBook,
  BankingTransactionDemo,
} from '../../types/os';
import { getThemePalette, type HikariThemePalette } from './HikariBrand';
import { formatShortDate, formatVnd, SAVINGS_PACKAGES } from './utils';

interface SavingsAndLoansViewProps {
  initialSubTab?: 'savings' | 'loans';
  initialAiCharLoanId?: string | null;
  account: BankingAccountDemo | null;
  aiAccounts: BankingAccountDemo[];
  savings: BankingSavingsBook[];
  loans: BankingLoanItem[];
  theme?: HikariThemePalette;
  hideBalance?: boolean;
  onOverviewUpdate: (payload: BankingOverviewPayload) => void;
  onOpenReceiptTx: (tx: BankingTransactionDemo) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function SavingsAndLoansView({
  initialSubTab = 'savings',
  initialAiCharLoanId = null,
  account,
  aiAccounts,
  savings,
  loans,
  theme = getThemePalette('coral'),
  hideBalance = false,
  onOverviewUpdate,
  onOpenReceiptTx,
  onShowToast: showToast,
  onRequestConfirm,
}: SavingsAndLoansViewProps) {
  const [subTab, setSubTab] = useState<'savings' | 'loans'>(initialSubTab);

  // Savings state
  const [showOpenSavings, setShowOpenSavings] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState('6m');
  const [savAmount, setSavAmount] = useState('5000000');
  const [autoRenew, setAutoRenew] = useState(true);
  const [savBusy, setSavBusy] = useState(false);
  const [depositBookId, setDepositBookId] = useState<string | null>(null);
  const [depositExtraAmt, setDepositExtraAmt] = useState('1000000');
  const [showSettledSavings, setShowSettledSavings] = useState(false);

  // Loans state
  const [showApplyLoan, setShowApplyLoan] = useState(Boolean(initialAiCharLoanId));
  const [loanCategory, setLoanCategory] = useState<'personal' | 'consumer' | 'short' | 'long' | 'ai'>(
    initialAiCharLoanId ? 'ai' : 'personal'
  );
  const [aiDirection, setAiDirection] = useState<'borrow' | 'lend'>('borrow');
  const [aiCharId, setAiCharId] = useState(initialAiCharLoanId || aiAccounts[0]?.character_id || '');
  const [loanPrincipal, setLoanPrincipal] = useState('10000000');
  const [loanTerm, setLoanTerm] = useState(12);
  const [loanBusy, setLoanBusy] = useState(false);
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (initialAiCharLoanId) {
      setSubTab('loans');
      setLoanCategory('ai');
      setAiCharId(initialAiCharLoanId);
      setShowApplyLoan(true);
    }
  }, [initialAiCharLoanId]);

  const activeSavings = useMemo(() => savings.filter((s) => s.status === 'active'), [savings]);
  const settledSavings = useMemo(() => savings.filter((s) => s.status !== 'active'), [savings]);
  const totalSavingsPrincipal = useMemo(
    () => activeSavings.reduce((sum, s) => sum + Number(s.principal || 0), 0),
    [activeSavings]
  );
  const totalExpectedInterest = useMemo(
    () => activeSavings.reduce((sum, s) => sum + Number(s.expected_interest || 0), 0),
    [activeSavings]
  );

  const activeLoans = useMemo(() => loans.filter((l) => l.status === 'active'), [loans]);
  const paidOffLoans = useMemo(() => loans.filter((l) => l.status !== 'active'), [loans]);
  const totalDebt = useMemo(
    () => activeLoans.filter((l) => l.direction !== 'lend').reduce((sum, l) => sum + Number(l.remaining_balance || 0), 0),
    [activeLoans]
  );

  const selectedPkg = SAVINGS_PACKAGES.find((p) => p.id === selectedPkgId) || SAVINGS_PACKAGES[4];

  const previewSavingsInterest = useMemo(() => {
    const p = Number(savAmount) || 0;
    const months = selectedPkg.term_months > 0 ? selectedPkg.term_months : 1;
    return Math.round(p * (selectedPkg.rate / 100) * (months / 12));
  }, [savAmount, selectedPkg]);

  const loanPresets: Record<'personal' | 'consumer' | 'short' | 'long' | 'ai', { label: string; rate: number }> = {
    personal: { label: 'Vay tín chấp Cá nhân', rate: 10.5 },
    consumer: { label: 'Vay Tiêu dùng nhanh', rate: 12.0 },
    short: { label: 'Vay Ngắn hạn linh hoạt', rate: 8.5 },
    long: { label: 'Vay Dài hạn ưu đãi', rate: 9.2 },
    ai: { label: aiDirection === 'borrow' ? 'Vay vốn từ Nhân vật AI' : 'Cho Nhân vật AI vay vốn', rate: 3.6 },
  };

  const handleOpenSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savBusy) return;
    const principal = Math.round(Number(savAmount) || 0);
    if (principal < 500000) {
      showToast('Số tiền chưa đạt mức tối thiểu', 'Số tiền mở sổ tiết kiệm tối thiểu là 500.000 VNĐ.', 'error');
      return;
    }
    const available = Number(account?.available_balance ?? account?.balance ?? 0);
    if (principal > available) {
      showToast(
        'Số dư không đủ',
        'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
        'error'
      );
      return;
    }
    setSavBusy(true);
    try {
      const res = await osApi.banking.openSavings({
        product_type: selectedPkg.product_type,
        product_name: selectedPkg.name,
        principal,
        interest_rate: selectedPkg.rate,
        term_months: selectedPkg.term_months,
        auto_renew: autoRenew ? 1 : 0,
        accountId: account?.id,
      });
      onOverviewUpdate(res);
      setShowOpenSavings(false);
      showToast('Mở sổ tiết kiệm thành công', `Đã trích ${formatVnd(principal)} vào ${selectedPkg.name}.`, 'success');
      if (res.transaction) {
        onOpenReceiptTx(res.transaction);
      }
    } catch (err) {
      showToast('Không thể mở tiết kiệm', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
    } finally {
      setSavBusy(false);
    }
  };

  const handleDepositExtra = async (bookId: string) => {
    if (savBusy) return;
    const amt = Math.round(Number(depositExtraAmt) || 0);
    if (amt < 100000) {
      showToast('Số tiền chưa hợp lệ', 'Nạp thêm tối thiểu 100.000 VNĐ.', 'error');
      return;
    }
    const available = Number(account?.available_balance ?? account?.balance ?? 0);
    if (amt > available) {
      showToast(
        'Số dư không đủ',
        'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
        'error'
      );
      return;
    }
    setSavBusy(true);
    try {
      const res = await osApi.banking.depositSavings(bookId, amt);
      onOverviewUpdate(res);
      setDepositBookId(null);
      showToast('Nạp thêm thành công', `Đã cộng ${formatVnd(amt)} vào sổ tiết kiệm.`, 'success');
    } catch (err) {
      showToast('Lỗi nạp thêm', err instanceof Error ? err.message : 'Không thể nạp tiền', 'error');
    } finally {
      setSavBusy(false);
    }
  };

  const handleToggleAutoRenew = async (book: BankingSavingsBook) => {
    try {
      const next = book.auto_renew ? 0 : 1;
      const res = await osApi.banking.toggleSavingsAutoRenew(book.id, next);
      onOverviewUpdate(res);
      showToast('Đã cập nhật tái tục', next ? 'Sổ sẽ tự động tái tục khi đến hạn.' : 'Đã tắt tự động tái tục.', 'info');
    } catch (err) {
      showToast('Không thể cập nhật', err instanceof Error ? err.message : 'Lỗi', 'error');
    }
  };

  const handleEarlyWithdraw = (book: BankingSavingsBook) => {
    onRequestConfirm({
      title: 'Rút tiền tiết kiệm trước hạn',
      message: `Rút trước hạn "${book.product_name}" (${formatVnd(book.principal)}) sẽ chỉ hưởng lãi suất không kỳ hạn (0.5%/năm). Bạn chắc chắn muốn rút ngay?`,
      destructive: true,
      onConfirm: async () => {
        const res = await osApi.banking.earlyWithdrawSavings(book.id);
        onOverviewUpdate(res);
        showToast('Rút trước hạn thành công', `Tiền gốc và lãi đã hoàn về tài khoản thanh toán.`, 'success');
        if (res.transaction) onOpenReceiptTx(res.transaction);
      },
    });
  };

  const handleSettleBook = (book: BankingSavingsBook) => {
    onRequestConfirm({
      title: 'Tất toán sổ tiết kiệm',
      message: `Tất toán "${book.product_name}" nhận gốc ${formatVnd(book.principal)} + lãi ${formatVnd(book.expected_interest)} về tài khoản?`,
      onConfirm: async () => {
        const res = await osApi.banking.settleSavings(book.id);
        onOverviewUpdate(res);
        showToast('Tất toán thành công', `Đã nhận gốc và lãi về tài khoản.`, 'success');
        if (res.transaction) onOpenReceiptTx(res.transaction);
      },
    });
  };

  const handleApplyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const principal = Math.round(Number(loanPrincipal) || 0);
    if (principal < 500000) {
      showToast('Số tiền vay chưa hợp lệ', 'Số tiền tối thiểu là 500.000 VNĐ.', 'error');
      return;
    }
    if (loanCategory === 'ai' && !aiCharId) {
      showToast('Chưa chọn nhân vật AI', 'Vui lòng chọn một nhân vật AI đối tác.', 'error');
      return;
    }
    const preset = loanPresets[loanCategory];
    const targetAi = aiAccounts.find((a) => a.character_id === aiCharId);
    const loanName =
      loanCategory === 'ai'
        ? `${aiDirection === 'borrow' ? 'Vay từ' : 'Cho vay tới'} ${targetAi?.character_name || targetAi?.holder_name || 'AI'}`
        : `${preset.label} (${loanTerm} tháng)`;

    setLoanBusy(true);
    try {
      const res = await osApi.banking.applyLoan({
        loan_type: loanCategory,
        loan_name: loanName,
        principal,
        interest_rate: preset.rate,
        term_months: loanTerm,
        counterparty_char_id: loanCategory === 'ai' ? aiCharId : undefined,
        direction: loanCategory === 'ai' ? aiDirection : 'borrow',
      });
      onOverviewUpdate(res);
      setShowApplyLoan(false);
      showToast(
        loanCategory === 'ai' && aiDirection === 'lend' ? 'Đã giải ngân cho nhân vật AI' : 'Giải ngân khoản vay thành công',
        `${loanName}: ${formatVnd(principal)}`,
        'success'
      );
    } catch (err) {
      showToast('Không thể tạo khoản vay', err instanceof Error ? err.message : 'Lỗi xử lý khoản vay', 'error');
    } finally {
      setLoanBusy(false);
    }
  };

  const handlePayInstallment = async (loan: BankingLoanItem) => {
    setLoanBusy(true);
    try {
      const res = await osApi.banking.payLoanInstallment(loan.id);
      onOverviewUpdate(res);
      showToast('Thanh toán kỳ nợ thành công', `Đã ghi nhận kỳ thanh toán cho "${loan.loan_name}".`, 'success');
      if (res.transaction) onOpenReceiptTx(res.transaction);
    } catch (err) {
      showToast('Thanh toán thất bại', err instanceof Error ? err.message : 'Số dư không đủ', 'error');
    } finally {
      setLoanBusy(false);
    }
  };

  const handleEarlyPayoff = (loan: BankingLoanItem) => {
    onRequestConfirm({
      title: 'Tất toán khoản vay trước hạn',
      message: `Thanh toán toàn bộ dư nợ còn lại (${formatVnd(loan.remaining_balance)}) để tất toán "${loan.loan_name}"?`,
      onConfirm: async () => {
        const res = await osApi.banking.earlyPayoffLoan(loan.id);
        onOverviewUpdate(res);
        showToast('Tất toán khoản vay thành công', `Khoản vay "${loan.loan_name}" đã hoàn tất.`, 'success');
        if (res.transaction) onOpenReceiptTx(res.transaction);
      },
    });
  };

  return (
    <div className="h-full overflow-y-auto os-scroll p-3.5 space-y-3.5 pb-6">
      {/* Sub-navigation */}
      <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${theme.cardBg}`}>
        <button
          type="button"
          onClick={() => setSubTab('savings')}
          className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'savings' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
          }`}
        >
          <PiggyBank className="w-4 h-4" />
          <span>Tiết kiệm số ({activeSavings.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('loans')}
          className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'loans' ? 'bg-[#E14B5A] text-white' : theme.textSecondary
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Vay vốn & CHAR ({activeLoans.length})</span>
        </button>
      </div>

      {subTab === 'savings' ? (
        <div className="space-y-3.5">
          {/* Summary Banner */}
          <div className={`rounded-3xl p-4 bg-gradient-to-br ${theme.heroGradient} text-white shadow-lg space-y-3`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-rose-100 uppercase tracking-wide">Tổng tiền gửi tiết kiệm</p>
                <p className="text-2xl font-extrabold tabular-nums mt-0.5">{formatVnd(totalSavingsPrincipal, hideBalance)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowOpenSavings((s) => !s)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold flex items-center gap-1 shrink-0 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Mở sổ mới</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/15 text-xs">
              <div>
                <p className="text-[10px] text-white/75">Lãi dự kiến cuối kỳ</p>
                <p className="font-bold text-emerald-300 tabular-nums">+{formatVnd(totalExpectedInterest, hideBalance)}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/75">Số dư nguồn thanh toán</p>
                <p className="font-bold tabular-nums">{formatVnd(account?.available_balance ?? account?.balance ?? 0, hideBalance)}</p>
              </div>
            </div>
          </div>

          {/* Open New Savings Panel */}
          {showOpenSavings && (
            <form
              onSubmit={handleOpenSavings}
              className={`rounded-2xl border p-4 space-y-3 shadow-sm ${theme.cardBg}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#E14B5A]" />
                  <span>Chọn gói tiết kiệm Hikari (8 kỳ hạn)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOpenSavings(false)}
                  className={`text-xs font-semibold ${theme.textSecondary}`}
                >
                  Đóng
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {SAVINGS_PACKAGES.map((pkg) => {
                  const active = pkg.id === selectedPkgId;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[#E14B5A]/10 border-[#E14B5A] ring-1 ring-[#E14B5A]'
                          : theme.subCardBg
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-[#E14B5A] tabular-nums">
                          {pkg.rate.toFixed(1)}%/năm
                        </span>
                        <span className={`text-[10px] font-semibold ${theme.textSecondary}`}>
                          {pkg.term_months === 0
                            ? 'Linh hoạt'
                            : pkg.term_months === 0.25
                            ? '1 tuần'
                            : `${pkg.term_months} tháng`}
                        </span>
                      </div>
                      <p className="text-xs font-semibold mt-1 line-clamp-2">
                        {pkg.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>
                  Số tiền gửi (VNĐ · Tối thiểu 500.000đ)
                </label>
                <input
                  type="number"
                  min={500000}
                  step={100000}
                  value={savAmount}
                  onChange={(e) => setSavAmount(e.target.value)}
                  className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border text-sm font-bold tabular-nums outline-none ${theme.inputClass}`}
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[1000000, 5000000, 10000000, 30000000, 50000000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSavAmount(String(v))}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors ${theme.chipInactive}`}
                    >
                      {formatVnd(v)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-xl border p-3 flex items-center justify-between text-xs ${theme.badgeSuccess}`}>
                <span>Tiền lãi dự kiến nhận được:</span>
                <span className="font-extrabold tabular-nums">
                  +{formatVnd(previewSavingsInterest)}
                </span>
              </div>

              {selectedPkg.term_months > 0 && (
                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className={`text-xs font-semibold ${theme.textPrimary}`}>
                    Tự động tái tục gốc + lãi khi đáo hạn
                  </span>
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                    className="w-4 h-4 accent-[#E14B5A]"
                  />
                </label>
              )}

              <button
                type="submit"
                disabled={savBusy}
                className="w-full min-h-[44px] rounded-xl bg-[#E14B5A] hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <PiggyBank className="w-4 h-4" />
                <span>{savBusy ? 'Đang mở sổ...' : 'Xác nhận mở sổ tiết kiệm'}</span>
              </button>
            </form>
          )}

          {/* Active Savings Books */}
          <div className="space-y-2.5">
            <h3 className={`text-xs font-bold uppercase tracking-wider px-1 ${theme.textSecondary}`}>
              Sổ tiết kiệm đang hoạt động ({activeSavings.length})
            </h3>
            {activeSavings.length === 0 ? (
              <div className={`rounded-2xl border p-6 text-center space-y-2 ${theme.cardBg}`}>
                <PiggyBank className={`w-8 h-8 mx-auto opacity-50 ${theme.textSecondary}`} />
                <p className={`text-xs ${theme.textSecondary}`}>
                  Chưa có sổ tiết kiệm nào đang mở. Nhấn "Mở sổ mới" để bắt đầu sinh lời.
                </p>
              </div>
            ) : (
              activeSavings.map((book) => (
                <div
                  key={book.id}
                  className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border tabular-nums ${theme.badgeInfo}`}>
                          {book.interest_rate}%/năm
                        </span>
                        <span className={`text-[10px] font-semibold ${theme.textSecondary}`}>
                          {book.term_months === 0
                            ? 'Không kỳ hạn'
                            : book.term_months === 0.25
                            ? '1 tuần'
                            : `${book.term_months} tháng`}
                        </span>
                      </div>
                      <h4 className={`text-sm font-bold mt-1 truncate ${theme.textPrimary}`}>
                        {book.product_name}
                      </h4>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-extrabold tabular-nums ${theme.textPrimary}`}>
                        {formatVnd(book.principal, hideBalance)}
                      </p>
                      <p className={`text-[11px] font-semibold tabular-nums ${theme.isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        +{formatVnd(book.expected_interest, hideBalance)} lãi
                      </p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 text-[11px] rounded-xl border p-2.5 ${theme.subCardBg} ${theme.textSecondary}`}>
                    <div>
                      <span>Ngày mở: </span>
                      <strong className={`tabular-nums ${theme.textPrimary}`}>{formatShortDate(book.opened_at)}</strong>
                    </div>
                    <div className="text-right">
                      <span>Đáo hạn: </span>
                      <strong className={`tabular-nums ${theme.textPrimary}`}>
                        {book.term_months === 0 ? 'Rút tự do' : formatShortDate(book.maturity_date)}
                      </strong>
                    </div>
                  </div>

                  {depositBookId === book.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min={100000}
                        step={100000}
                        value={depositExtraAmt}
                        onChange={(e) => setDepositExtraAmt(e.target.value)}
                        className={`flex-1 min-h-[38px] px-3 py-2 rounded-xl border text-xs font-bold tabular-nums outline-none ${theme.inputClass}`}
                      />
                      <button
                        type="button"
                        disabled={savBusy}
                        onClick={() => void handleDepositExtra(book.id)}
                        className="min-h-[38px] px-3 py-2 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                      >
                        Nạp
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositBookId(null)}
                        className={`min-h-[38px] px-2.5 py-2 rounded-xl border text-xs font-semibold ${theme.chipInactive}`}
                      >
                        Hủy
                      </button>
                    </div>
                  )}

                  <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t ${theme.border}`}>
                    <button
                      type="button"
                      onClick={() => void handleToggleAutoRenew(book)}
                      className={`text-[11px] font-semibold flex items-center gap-1 ${theme.textSecondary}`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${book.auto_renew ? theme.accentClass : 'opacity-60'}`} />
                      <span>{book.auto_renew ? 'Tự động tái tục: BẬT' : 'Tự động tái tục: TẮT'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDepositBookId(depositBookId === book.id ? null : book.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${theme.badgePrimary}`}
                      >
                        Nạp thêm
                      </button>
                      {book.term_months > 0 && (
                        <button
                          type="button"
                          onClick={() => handleEarlyWithdraw(book)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${theme.badgeWarning}`}
                        >
                          Rút trước hạn
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSettleBook(book)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                      >
                        Tất toán
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Settled Savings History */}
          {settledSavings.length > 0 && (
            <div className={`rounded-2xl border overflow-hidden ${theme.cardBg}`}>
              <button
                type="button"
                onClick={() => setShowSettledSavings((s) => !s)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold"
              >
                <span>Lịch sử sổ đã tất toán ({settledSavings.length})</span>
                {showSettledSavings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showSettledSavings && (
                <div className={`divide-y px-4 pb-3 ${theme.border}`}>
                  {settledSavings.map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{s.product_name}</p>
                        <p className={`text-[11px] ${theme.textSecondary}`}>Tất toán: {formatShortDate(s.settled_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-emerald-600 tabular-nums">{formatVnd(s.actual_payout || s.principal)}</p>
                        <p className={`text-[10px] ${theme.textSecondary}`}>Gốc {formatVnd(s.principal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Loan Banner */}
          <div className={`rounded-3xl p-4 bg-gradient-to-br ${theme.heroGradient} text-white shadow-lg space-y-3`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-rose-100 uppercase tracking-wide">Tổng dư nợ hiện tại</p>
                <p className="text-2xl font-extrabold tabular-nums mt-0.5">{formatVnd(totalDebt, hideBalance)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyLoan((s) => !s)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold flex items-center gap-1 shrink-0 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Đăng ký vay / CHAR</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/15 text-xs">
              <div>
                <p className="text-[10px] text-white/75">Khoản đang hiệu lực</p>
                <p className="font-bold tabular-nums">{activeLoans.length} hợp đồng</p>
              </div>
              <div>
                <p className="text-[10px] text-white/75">Hạn mức tín chấp đề xuất</p>
                <p className="font-bold text-amber-200 tabular-nums">200.000.000 VNĐ</p>
              </div>
            </div>
          </div>

          {/* Apply Loan Form */}
          {showApplyLoan && (
            <form
              onSubmit={handleApplyLoan}
              className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold flex items-center gap-1.5 ${theme.textPrimary}`}>
                  <Landmark className={`w-4 h-4 ${theme.accentClass}`} />
                  <span>Khởi tạo khoản vay mới</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowApplyLoan(false)}
                  className={`text-xs font-semibold ${theme.textSecondary}`}
                >
                  Đóng
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(['personal', 'consumer', 'short', 'long', 'ai'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLoanCategory(cat)}
                    className={`p-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                      loanCategory === cat
                        ? 'border-[#E14B5A] bg-[#E14B5A]/12 text-[#E14B5A]'
                        : theme.chipInactive
                    } ${cat === 'ai' ? 'col-span-2 flex items-center justify-between' : ''}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {cat === 'ai' && <Bot className="w-3.5 h-3.5" />}
                      {cat === 'personal' && 'Vay cá nhân (10.5%)'}
                      {cat === 'consumer' && 'Vay tiêu dùng (12.0%)'}
                      {cat === 'short' && 'Vay ngắn hạn (8.5%)'}
                      {cat === 'long' && 'Vay dài hạn (9.2%)'}
                      {cat === 'ai' && 'Vay / Cho Nhân vật AI vay vốn'}
                    </span>
                    {cat === 'ai' && (
                      <span className={`text-[10px] font-bold ${theme.isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        Ưu đãi 3.6%
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {loanCategory === 'ai' && (
                <div className={`space-y-2.5 p-3 rounded-xl border ${theme.subCardBg}`}>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAiDirection('borrow')}
                      className={`min-h-[38px] py-2 rounded-lg text-xs font-bold border transition-colors ${
                        aiDirection === 'borrow'
                          ? 'bg-[#E14B5A] text-white border-[#E14B5A]'
                          : theme.chipInactive
                      }`}
                    >
                      Mượn tiền từ AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiDirection('lend')}
                      className={`min-h-[38px] py-2 rounded-lg text-xs font-bold border transition-colors ${
                        aiDirection === 'lend'
                          ? 'bg-[#E14B5A] text-white border-[#E14B5A]'
                          : theme.chipInactive
                      }`}
                    >
                      Cho AI vay vốn
                    </button>
                  </div>

                  <div>
                    <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>
                      Chọn nhân vật AI đối tác
                    </label>
                    <select
                      value={aiCharId}
                      onChange={(e) => setAiCharId(e.target.value)}
                      style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                      className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold outline-none ${theme.inputClass}`}
                    >
                      {aiAccounts.map((ai) => (
                        <option
                          key={ai.id}
                          value={ai.character_id}
                          style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                        >
                          {ai.character_name || ai.holder_name} · Số dư: {formatVnd(ai.balance)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Số tiền (VNĐ)</label>
                  <input
                    type="number"
                    min={500000}
                    step={500000}
                    value={loanPrincipal}
                    onChange={(e) => setLoanPrincipal(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold tabular-nums outline-none ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Kỳ hạn (tháng)</label>
                  <select
                    value={loanTerm}
                    onChange={(e) => setLoanTerm(Number(e.target.value))}
                    style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold outline-none ${theme.inputClass}`}
                  >
                    {[3, 6, 12, 18, 24, 36].map((m) => (
                      <option
                        key={m}
                        value={m}
                        style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                      >
                        {m} tháng
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loanBusy}
                className="w-full min-h-[44px] rounded-xl bg-[#E14B5A] hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {loanBusy
                    ? 'Đang xử lý...'
                    : loanCategory === 'ai' && aiDirection === 'lend'
                    ? 'Giải ngân cho Nhân vật CHAR'
                    : 'Xác nhận giải ngân ngay'}
                </span>
              </button>
            </form>
          )}

          {/* Active Loans */}
          <div className="space-y-2.5">
            <h3 className={`text-xs font-bold uppercase tracking-wider px-1 ${theme.textSecondary}`}>
              Khoản vay đang hiệu lực ({activeLoans.length})
            </h3>
            {activeLoans.length === 0 ? (
              <div className={`rounded-2xl border p-6 text-center space-y-1.5 ${theme.cardBg}`}>
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className={`text-xs font-semibold ${theme.textSecondary}`}>
                  Không có khoản nợ vay nào đang hiệu lực.
                </p>
              </div>
            ) : (
              activeLoans.map((loan) => {
                const progressPct = Math.min(100, Math.round((loan.paid_months / Math.max(1, loan.term_months)) * 100));
                const schedule = (() => {
                  try {
                    return JSON.parse(loan.schedule_json || '[]') as Array<{
                      month: number;
                      dueDate: string;
                      amount: number;
                      status: string;
                    }>;
                  } catch {
                    return [];
                  }
                })();
                const isLendToAi = loan.direction === 'lend';
                const expanded = expandedScheduleId === loan.id;

                return (
                  <div
                    key={loan.id}
                    className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              loan.counterparty_char_id ? theme.badgeInfo : theme.badgeNeutral
                            }`}
                          >
                            {isLendToAi ? 'Bạn cho AI vay' : loan.counterparty_char_id ? 'Vay Nhân vật AI' : `${loan.interest_rate}%/năm`}
                          </span>
                          <span className={`text-[10px] font-semibold tabular-nums ${theme.textSecondary}`}>
                            Kỳ {loan.paid_months}/{loan.term_months}
                          </span>
                        </div>
                        <h4 className={`text-sm font-bold mt-1 truncate ${theme.textPrimary}`}>
                          {loan.loan_name}
                        </h4>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-extrabold tabular-nums ${theme.accentClass}`}>
                          {formatVnd(loan.remaining_balance, hideBalance)}
                        </p>
                        <p className={`text-[11px] tabular-nums ${theme.textSecondary}`}>
                          Kỳ: {formatVnd(loan.monthly_payment, hideBalance)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className={`h-2 rounded-full overflow-hidden ${theme.progressTrackBg}`}>
                        <div
                          className="h-full bg-[#E14B5A] transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className={`flex items-center justify-between text-[11px] ${theme.textSecondary}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Đến hạn: {formatShortDate(loan.next_due_date)}
                        </span>
                        <span className={`font-bold tabular-nums ${theme.accentClass}`}>{progressPct}%</span>
                      </div>
                    </div>

                    <div className={`flex flex-wrap items-center justify-between gap-2 pt-1 border-t ${theme.border}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedScheduleId(expanded ? null : loan.id)}
                        className={`text-[11px] font-bold flex items-center gap-1 ${theme.textSecondary}`}
                      >
                        <Percent className="w-3.5 h-3.5 text-[#E14B5A]" />
                        <span>{expanded ? 'Ẩn lịch trả' : 'Lịch trả nợ'}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        {!isLendToAi && (
                          <>
                            <button
                              type="button"
                              disabled={loanBusy}
                              onClick={() => void handlePayInstallment(loan)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#E14B5A] text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>Đóng kỳ</span>
                            </button>
                            <button
                              type="button"
                              disabled={loanBusy}
                              onClick={() => handleEarlyPayoff(loan)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                            >
                              Tất toán
                            </button>
                          </>
                        )}
                        {isLendToAi && (
                          <button
                            type="button"
                            disabled={loanBusy}
                            onClick={() => void handlePayInstallment(loan)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Thu kỳ nợ từ AI</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && schedule.length > 0 && (
                      <div className={`max-h-44 overflow-y-auto os-scroll rounded-xl border p-2.5 space-y-1.5 text-[11px] ${theme.subCardBg}`}>
                        {schedule.map((row) => (
                          <div key={row.month} className={`flex items-center justify-between py-1 border-b last:border-0 ${theme.border}`}>
                            <span className="font-semibold">
                              Kỳ {row.month} · {formatShortDate(row.dueDate)}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold tabular-nums">{formatVnd(row.amount)}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                  row.status === 'paid' ? theme.badgeSuccess : theme.badgeNeutral
                                }`}
                              >
                                {row.status === 'paid' ? 'Đã trả' : 'Chờ'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {paidOffLoans.length > 0 && (
            <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
              <p className={`text-xs font-bold ${theme.textSecondary}`}>
                Hợp đồng đã hoàn tất ({paidOffLoans.length})
              </p>
              {paidOffLoans.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs py-1">
                  <span className="font-semibold truncate">{l.loan_name}</span>
                  <span className={`font-bold tabular-nums flex items-center gap-1 ${theme.isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {formatVnd(l.principal, hideBalance)} <ArrowRight className="w-3 h-3" /> Đã tất toán
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
