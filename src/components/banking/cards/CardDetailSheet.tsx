import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Link2,
  Link2Off,
  Lock,
  Pencil,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
  X,
} from 'lucide-react';
import type {
  BankingAccountDemo,
  BankingCardItem,
  BankingTransactionDemo,
  CardRevealResult,
} from '../../../types/os';
import type { HikariThemePalette } from '../HikariBrand';
import { formatTimeAgoOrDate, formatVnd, isCardExpired, maskAccountNumber } from '../utils';
import { BankCardVisual } from './BankCardVisual';

type PinActionState =
  | { kind: 'reveal'; title: string; subtitle: string; destructive?: boolean }
  | { kind: 'unlock'; title: string; subtitle: string; destructive?: boolean }
  | {
      kind: 'channel';
      title: string;
      subtitle: string;
      patch: {
        online_payment_enabled?: number;
        contactless_enabled?: number;
        intl_payment_enabled?: number;
      };
    }
  | {
      kind: 'limits';
      title: string;
      subtitle: string;
      patch: {
        per_tx_limit: number;
        daily_limit: number;
        monthly_limit: number;
        transfer_limit: number;
        withdraw_limit: number;
        online_limit: number;
      };
    }
  | { kind: 'reissue'; title: string; subtitle: string; destructive?: boolean }
  | { kind: 'cancel'; title: string; subtitle: string; destructive?: boolean };

interface CardDetailSheetProps {
  card: BankingCardItem | null;
  accounts: BankingAccountDemo[];
  transactions: BankingTransactionDemo[];
  theme: HikariThemePalette;
  hideBalance?: boolean;
  busy: boolean;
  onClose: () => void;
  onSetPrimary: (cardId: string) => Promise<void>;
  onUpdateCard: (
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
  ) => Promise<boolean>;
  onRevealCard: (cardId: string, pin: string) => Promise<CardRevealResult>;
  onChangePin: (cardId: string, currentPin: string, newPin: string) => Promise<boolean>;
  onCancelCard: (cardId: string, pin: string) => Promise<boolean>;
  onReissueCard: (cardId: string, pin: string) => Promise<boolean>;
  onLinkCard: (cardId: string, accountId: string) => Promise<void>;
  onUnlinkCard: (cardId: string) => Promise<void>;
  onClaimInterest: (cardId: string) => Promise<void>;
  onUpgradeCard: (cardId: string, targetTier?: string) => Promise<void>;
  onOpenBenefitsHub: (cardId: string) => void;
  onSelectTransaction: (tx: BankingTransactionDemo) => void;
}

export function CardDetailSheet({
  card,
  accounts,
  transactions,
  theme,
  hideBalance = false,
  busy,
  onClose,
  onSetPrimary,
  onUpdateCard,
  onRevealCard,
  onChangePin,
  onCancelCard,
  onReissueCard,
  onLinkCard,
  onUnlinkCard,
  onClaimInterest,
  onUpgradeCard,
  onOpenBenefitsHub,
  onSelectTransaction,
}: CardDetailSheetProps) {
  const [tab, setTab] = useState<'overview' | 'limits' | 'upgrade' | 'history'>('overview');
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [editingLimits, setEditingLimits] = useState(false);
  const [perTxInput, setPerTxInput] = useState('');
  const [dailyInput, setDailyInput] = useState('');
  const [monthlyInput, setMonthlyInput] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [onlineInput, setOnlineInput] = useState('');
  const [linkAccId, setLinkAccId] = useState('');

  // Revealed secret state w/ auto-hide timer
  const [revealedSecret, setRevealedSecret] = useState<CardRevealResult | null>(null);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Inline PIN prompt state
  const [pinAction, setPinAction] = useState<PinActionState | null>(null);
  const [pinPromptValue, setPinPromptValue] = useState('');
  const [pinPromptError, setPinPromptError] = useState('');

  // Change PIN form
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changePinErr, setChangePinErr] = useState('');

  useEffect(() => {
    setRevealedSecret(null);
    setRevealSecondsLeft(0);
    setPinAction(null);
    setPinPromptValue('');
    setPinPromptError('');
    setChangePinOpen(false);
    setEditingLimits(false);
    setEditingNick(false);
  }, [card?.id]);

  useEffect(() => {
    if (!revealedSecret || revealSecondsLeft <= 0) {
      if (revealedSecret && revealSecondsLeft <= 0) setRevealedSecret(null);
      return;
    }
    const timer = window.setInterval(() => {
      setRevealSecondsLeft((s) => {
        if (s <= 1) {
          setRevealedSecret(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [revealedSecret, revealSecondsLeft]);

  const payableAccounts = useMemo(
    () => accounts.filter((a) => a.account_role !== 'receive_only' && a.status !== 'locked'),
    [accounts]
  );

  const cardTxs = useMemo(() => {
    if (!card) return [];
    return transactions.filter((t) => t.source_card_id === card.id);
  }, [card, transactions]);

  if (!card) return null;

  const isCancelled = card.status === 'cancelled';
  const isLocked = card.status === 'locked';
  const expired = isCardExpired(card.expiry);
  const isUnlinked = card.linked_status === 'unlinked' || !card.account_id;
  const linkedAcc = accounts.find((a) => a.id === card.account_id) || null;
  const dailyLimit = Number(card.daily_limit || 50_000_000);
  const monthlyLimit = Number(card.monthly_limit || 200_000_000);
  const spentToday = Number(card.spent_today || 0);
  const spentMonth = Number(card.spent_month || 0);
  const cashbackCap = Number(card.cashback_cap_month || 1_000_000);
  const cashbackUsed = Number(card.cashback_used_month || 0);
  const interestPreview = card.interest_preview;
  const upgrade = card.upgrade_status;
  const categoryLabel = card.card_category === 'credit' || card.card_type === 'credit' ? 'Credit' : 'Debit';

  const openNickEdit = () => {
    setNickInput(card.card_nickname || card.card_name);
    setEditingNick(true);
  };

  const openLimitEdit = () => {
    setPerTxInput(String(Number(card.per_tx_limit || 20_000_000)));
    setDailyInput(String(dailyLimit));
    setMonthlyInput(String(monthlyLimit));
    setTransferInput(String(Number(card.transfer_limit || dailyLimit)));
    setWithdrawInput(String(Number(card.withdraw_limit || 20_000_000)));
    setOnlineInput(String(Number(card.online_limit || dailyLimit)));
    setEditingLimits(true);
  };

  const handleCopyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedField(key);
    window.setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 1500);
  };

  const requestPinFor = (action: PinActionState) => {
    setPinPromptValue('');
    setPinPromptError('');
    setPinAction(action);
  };

  const submitPinAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinAction || busy) return;
    const pin = pinPromptValue.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      setPinPromptError('Vui lòng nhập mã PIN hợp lệ (4–6 chữ số, mặc định 123456).');
      return;
    }
    setPinPromptError('');
    try {
      if (pinAction.kind === 'reveal') {
        const secret = await onRevealCard(card.id, pin);
        setRevealedSecret(secret);
        setRevealSecondsLeft(secret.expiresInSec || 60);
        setPinAction(null);
      } else if (pinAction.kind === 'unlock') {
        const ok = await onUpdateCard(card.id, { status: 'active', pin });
        if (ok) setPinAction(null);
      } else if (pinAction.kind === 'channel') {
        const ok = await onUpdateCard(card.id, { ...pinAction.patch, pin });
        if (ok) setPinAction(null);
      } else if (pinAction.kind === 'limits') {
        const ok = await onUpdateCard(card.id, { ...pinAction.patch, pin });
        if (ok) {
          setEditingLimits(false);
          setPinAction(null);
        }
      } else if (pinAction.kind === 'reissue') {
        const ok = await onReissueCard(card.id, pin);
        if (ok) {
          setPinAction(null);
          onClose();
        }
      } else if (pinAction.kind === 'cancel') {
        const ok = await onCancelCard(card.id, pin);
        if (ok) {
          setPinAction(null);
        }
      }
    } catch (err) {
      setPinPromptError(err instanceof Error ? err.message : 'Mã PIN không đúng hoặc thao tác thất bại.');
    }
  };

  const progressBar = (used: number, cap: number, colorClass: string) => {
    const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
    return (
      <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-lg max-h-[93vh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${theme.cardBg} ${theme.textPrimary}`}
      >
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0 ${theme.border}`}>
          <div className="min-w-0">
            <p className={`text-[10.5px] font-bold uppercase tracking-wider ${theme.textSecondary}`}>
              {card.bank_name || 'Hikari Bank'} · {categoryLabel} · {card.tier_label || 'Standard'}
            </p>
            <h3 className="text-sm font-extrabold truncate">{card.card_nickname || card.card_name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme.subCardBg}`}
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className={`px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0 ${theme.border}`}>
          {[
            { id: 'overview', label: 'Thông số & Bảo mật' },
            { id: 'limits', label: 'Hạn mức & Kênh' },
            { id: 'upgrade', label: 'Nâng hạng thẻ' },
            { id: 'history', label: `Lịch sử (${cardTxs.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold shrink-0 border transition-colors ${
                tab === t.id ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : theme.subCardBg
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5">
          <BankCardVisual
            card={card}
            revealedPan={revealedSecret?.cardNumber}
            revealedCvv={revealedSecret?.cvv}
          />

          {isCancelled && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500 space-y-1">
              <p className="font-extrabold flex items-center gap-1.5">
                <Ban className="w-4 h-4 shrink-0" />
                <span>Thẻ này đã bị hủy vĩnh viễn</span>
              </p>
              <p className="text-[11px]">
                {card.cancelled_at ? `Thời gian hủy: ${formatTimeAgoOrDate(card.cancelled_at)}. ` : ''}
                {card.replaced_by_card_id
                  ? `Đã phát hành thẻ thay thế (${card.replaced_by_card_id}).`
                  : 'Mọi giao dịch bằng thẻ này đều bị từ chối.'}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={busy || isCancelled}
              onClick={() => {
                if (isLocked) {
                  requestPinFor({
                    kind: 'unlock',
                    title: 'Mở khóa thẻ bằng mã PIN',
                    subtitle: `Nhập mã PIN thẻ •••• ${card.last4} để kích hoạt lại khả năng thanh toán.`,
                  });
                } else {
                  void onUpdateCard(card.id, { status: 'locked' });
                }
              }}
              className={`min-h-[44px] rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-45 ${theme.subCardBg}`}
            >
              {isLocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span>{isLocked ? 'Mở khóa' : 'Khóa thẻ'}</span>
            </button>

            <button
              type="button"
              disabled={busy || isCancelled || Number(card.is_primary) === 1 || isLocked || expired || isUnlinked}
              onClick={() => onSetPrimary(card.id)}
              className={`min-h-[44px] rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-45 ${theme.subCardBg}`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{Number(card.is_primary) === 1 ? 'Đang là chính' : 'Đặt thẻ chính'}</span>
            </button>

            <button
              type="button"
              disabled={isCancelled || isLocked || isUnlinked}
              onClick={() => {
                onClose();
                onOpenBenefitsHub(card.id);
              }}
              className="min-h-[44px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-45 text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Quẹt thẻ / Quà</span>
            </button>
          </div>

          {tab === 'overview' && (
            <div className="space-y-3">
              {/* Secret Card PAN & CVV Box */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.subCardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#E14B5A]" />
                      <span>Số thẻ đầy đủ & CVV (Mã hóa Vault)</span>
                    </p>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>
                      {revealedSecret
                        ? `Đang hiển thị an toàn · Tự ẩn sau ${revealSecondsLeft}s`
                        : 'Cần xác thực mã PIN thẻ để xem & sao chép số thẻ / CVV'}
                    </p>
                  </div>
                  {revealedSecret ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRevealedSecret(null);
                        setRevealSecondsLeft(0);
                      }}
                      className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${theme.cardBg}`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ẩn ngay</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || isCancelled}
                      onClick={() =>
                        requestPinFor({
                          kind: 'reveal',
                          title: 'Xem số thẻ 16 số & CVV',
                          subtitle: 'Nhập mã PIN thẻ (mặc định 123456) để giải mã thông tin thẻ.',
                        })
                      }
                      className="min-h-[34px] px-2.5 rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-45 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Hiện số & CVV</span>
                    </button>
                  )}
                </div>

                {revealedSecret && (
                  <div className={`rounded-xl border p-2.5 space-y-2 text-xs ${theme.cardBg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className={`text-[10px] ${theme.textSecondary}`}>Số thẻ 16 số</span>
                        <p className="font-mono font-extrabold tracking-wider">{revealedSecret.cardNumber}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText('pan', revealedSecret.cardNumberDigits)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10.5px] font-bold flex items-center gap-1 ${theme.subCardBg}`}
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedField === 'pan' ? 'Đã chép' : 'Sao chép'}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-black/10 dark:border-white/10">
                      <div>
                        <span className={`text-[10px] ${theme.textSecondary}`}>Hiệu lực</span>
                        <p className="font-mono font-bold">{revealedSecret.expiry}</p>
                      </div>
                      <div>
                        <span className={`text-[10px] ${theme.textSecondary}`}>CVV</span>
                        <p className="font-mono font-extrabold text-rose-500">{revealedSecret.cvv}</p>
                      </div>
                      <div className="flex justify-end items-end">
                        <button
                          type="button"
                          onClick={() => handleCopyText('cvv', revealedSecret.cvv)}
                          className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${theme.subCardBg}`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedField === 'cvv' ? 'Đã chép' : 'Chép CVV'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`grid grid-cols-2 gap-2 pt-1 text-[10.5px] ${theme.textSecondary}`}>
                  <span>Ngày phát hành: <strong className={theme.textPrimary}>{(card.issued_at || card.created_at || '').slice(0, 10)}</strong></span>
                  <span>Loại thẻ: <strong className={theme.textPrimary}>{categoryLabel}</strong></span>
                  {card.locked_at && (
                    <span>Khóa lúc: <strong className="text-rose-500">{formatTimeAgoOrDate(card.locked_at)}</strong></span>
                  )}
                  {card.unlocked_at && (
                    <span>Mở khóa lúc: <strong className="text-emerald-500">{formatTimeAgoOrDate(card.unlocked_at)}</strong></span>
                  )}
                </div>
              </div>

              {/* Nickname Editor */}
              {!isCancelled && (
                <div className={`rounded-2xl border p-3 ${theme.subCardBg}`}>
                  {editingNick ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={nickInput}
                        onChange={(e) => setNickInput(e.target.value)}
                        maxLength={40}
                        className={`flex-1 min-h-[38px] px-3 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                      />
                      <button
                        type="button"
                        disabled={busy || !nickInput.trim()}
                        onClick={async () => {
                          const ok = await onUpdateCard(card.id, { card_nickname: nickInput.trim() });
                          if (ok) setEditingNick(false);
                        }}
                        className="min-h-[38px] px-3 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`text-[10.5px] ${theme.textSecondary}`}>Tên gợi nhớ thẻ</p>
                        <p className="text-xs font-extrabold">{card.card_nickname || card.card_name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={openNickEdit}
                        className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${theme.cardBg}`}
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Đổi tên</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Financial Metrics Table */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 text-xs ${theme.subCardBg}`}>
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-[#E14B5A]" />
                    <span>Chỉ số tài chính thẻ</span>
                  </span>
                  <span className={`text-[11px] font-bold ${theme.accentClass}`}>
                    {card.tier_label || String(card.card_tier || 'Standard').toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1 tabular-nums">
                  <div className={`rounded-xl border p-2.5 ${theme.cardBg}`}>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Hoàn tiền (Cashback)</p>
                    <p className="text-base font-black text-emerald-500">{Number(card.cashback_rate || 0)}%</p>
                    <p className={`text-[10px] ${theme.textSecondary}`}>
                      Đã nhận {formatVnd(cashbackUsed)} / {formatVnd(cashbackCap)}
                    </p>
                  </div>
                  <div className={`rounded-xl border p-2.5 ${theme.cardBg}`}>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Lãi suất số dư/năm</p>
                    <p className="text-base font-black text-sky-500">{Number(card.interest_rate || 0)}%/năm</p>
                    <p className={`text-[10px] ${theme.textSecondary}`}>
                      Trần tính lãi {formatVnd(Number(card.interest_balance_cap || 0))}
                    </p>
                  </div>
                  <div className={`rounded-xl border p-2.5 ${theme.cardBg}`}>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Điểm thưởng hiện có</p>
                    <p className="text-base font-black text-amber-500">
                      {Number(card.reward_points || 0).toLocaleString('de-DE')} điểm
                    </p>
                    <p className={`text-[10px] ${theme.textSecondary}`}>
                      Tích {Number(card.reward_point_rate || 0)} điểm / 100kđ
                    </p>
                  </div>
                  <div className={`rounded-xl border p-2.5 ${theme.cardBg}`}>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Biểu phí giao dịch</p>
                    <p className="text-xs font-extrabold">
                      {Number(card.tx_fee_pct || 0)}% + {formatVnd(Number(card.fixed_tx_fee || 0))}
                    </p>
                    <p className={`text-[10px] ${theme.textSecondary}`}>
                      Rút ATM {formatVnd(Number(card.withdraw_fee || 0))} · QT {Number(card.intl_fee_pct || 0)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Interest Claim Card */}
              <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.subCardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span>Nhận lãi định kỳ theo số dư liên kết</span>
                    </p>
                    <p className={`text-[11px] ${theme.textSecondary} tabular-nums`}>
                      {interestPreview
                        ? `Số dư tính lãi: ${formatVnd(interestPreview.eligibleBalance, hideBalance)} · ${interestPreview.elapsedDays} ngày`
                        : 'Tính theo số dư tài khoản liên kết'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      isCancelled ||
                      !interestPreview ||
                      interestPreview.estimatedInterest <= 0 ||
                      interestPreview.alreadyClaimedToday
                    }
                    onClick={() => onClaimInterest(card.id)}
                    className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-[11px] font-bold shrink-0 tabular-nums"
                  >
                    {interestPreview?.alreadyClaimedToday
                      ? 'Đã nhận hôm nay'
                      : interestPreview && interestPreview.estimatedInterest > 0
                      ? `Nhận +${formatVnd(interestPreview.estimatedInterest)}`
                      : 'Chưa đủ lãi'}
                  </button>
                </div>
              </div>

              {/* Change PIN & Lifecycle Actions (Reissue / Cancel) */}
              {!isCancelled && (
                <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.subCardBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-[#E14B5A]" />
                      <span>Quản lý mã PIN & Vòng đời thẻ</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setChangePinErr('');
                        setChangePinOpen((v) => !v);
                      }}
                      className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold ${theme.cardBg}`}
                    >
                      {changePinOpen ? 'Đóng' : 'Đổi mã PIN thẻ'}
                    </button>
                  </div>

                  {changePinOpen && (
                    <div className={`rounded-xl border p-3 space-y-2 ${theme.cardBg}`}>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={curPin}
                        onChange={(e) => setCurPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Mã PIN hiện tại (mặc định 123456)"
                        className={`w-full min-h-[38px] px-3 rounded-xl border text-xs font-mono outline-none ${theme.inputClass}`}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="PIN mới (4-6 số)"
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-mono outline-none ${theme.inputClass}`}
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={confirmNewPin}
                          onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Nhập lại PIN mới"
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-mono outline-none ${theme.inputClass}`}
                        />
                      </div>
                      {changePinErr && <p className="text-[11px] font-semibold text-rose-500">{changePinErr}</p>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!/^\d{4,6}$/.test(curPin) || !/^\d{4,6}$/.test(newPin)) {
                            setChangePinErr('Mã PIN phải gồm 4–6 chữ số.');
                            return;
                          }
                          if (newPin !== confirmNewPin) {
                            setChangePinErr('Mã PIN nhập lại không khớp.');
                            return;
                          }
                          setChangePinErr('');
                          const ok = await onChangePin(card.id, curPin, newPin);
                          if (ok) {
                            setCurPin('');
                            setNewPin('');
                            setConfirmNewPin('');
                            setChangePinOpen(false);
                          }
                        }}
                        className="w-full min-h-[38px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                      >
                        Xác nhận đổi PIN thẻ
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        requestPinFor({
                          kind: 'reissue',
                          title: 'Cấp lại thẻ mới (Reissue)',
                          subtitle:
                            'Thẻ hiện tại sẽ bị hủy và một thẻ mới giữ nguyên hạng, điểm thưởng, liên kết tài khoản nhưng cấp số thẻ & CVV mới sẽ được phát hành.',
                        })
                      }
                      className={`min-h-[40px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 ${theme.cardBg}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-sky-500" />
                      <span>Cấp lại thẻ</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        requestPinFor({
                          kind: 'cancel',
                          title: 'Hủy thẻ vĩnh viễn',
                          subtitle:
                            'Thẻ sẽ chuyển sang trạng thái ĐÃ HỦY và không thể kích hoạt lại hoặc dùng thanh toán.',
                          destructive: true,
                        })
                      }
                      className="min-h-[40px] px-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 text-[11px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Hủy thẻ</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Card Benefits */}
              {Array.isArray(card.benefits) && card.benefits.length > 0 && (
                <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.subCardBg}`}>
                  <p className="text-xs font-extrabold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#E14B5A]" />
                    <span>Đặc quyền hạng thẻ {card.tier_label}</span>
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {card.benefits.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'limits' && (
            <div className="space-y-3">
              {/* Linked Account Management */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.subCardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold flex items-center gap-1.5">
                      {isUnlinked ? (
                        <Link2Off className="w-4 h-4 text-rose-500" />
                      ) : (
                        <Link2 className="w-4 h-4 text-emerald-500" />
                      )}
                      <span>Tài khoản thanh toán liên kết</span>
                    </p>
                    <p className={`text-[11px] ${theme.textSecondary} tabular-nums`}>
                      {isUnlinked || !linkedAcc
                        ? 'Thẻ đang ngưng liên kết tài khoản — mọi thanh toán sẽ bị từ chối.'
                        : `${linkedAcc.nickname || linkedAcc.account_type} · ${maskAccountNumber(linkedAcc.account_number)} · Khả dụng ${formatVnd(linkedAcc.available_balance ?? linkedAcc.balance, hideBalance)}`}
                    </p>
                  </div>
                  {!isUnlinked && !isCancelled && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onUnlinkCard(card.id)}
                      className="min-h-[36px] px-2.5 rounded-xl border border-rose-500/40 text-rose-500 text-[11px] font-bold shrink-0"
                    >
                      Ngắt liên kết
                    </button>
                  )}
                </div>

                {!isCancelled && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={linkAccId || card.account_id || payableAccounts[0]?.id || ''}
                      onChange={(e) => setLinkAccId(e.target.value)}
                      className={`flex-1 min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                    >
                      {payableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.nickname || acc.account_type} · {maskAccountNumber(acc.account_number)} ({formatVnd(acc.available_balance ?? acc.balance)})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || payableAccounts.length === 0}
                      onClick={() => onLinkCard(card.id, linkAccId || card.account_id || payableAccounts[0]?.id || '')}
                      className="min-h-[40px] px-3 rounded-xl bg-[#E14B5A] text-white text-[11px] font-bold shrink-0"
                    >
                      {isUnlinked ? 'Liên kết' : 'Đổi TK'}
                    </button>
                  </div>
                )}
              </div>

              {/* Channel Toggles (PIN required on server) */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.subCardBg}`}>
                <p className="text-xs font-extrabold">Kênh giao dịch thẻ (Xác thực PIN khi thay đổi)</p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold">Thanh toán trực tuyến (Online)</p>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Quẹt thẻ trực tuyến & cổng thanh toán</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isCancelled}
                    onClick={() =>
                      requestPinFor({
                        kind: 'channel',
                        title: card.online_payment_enabled ? 'Tắt thanh toán Online' : 'Bật thanh toán Online',
                        subtitle: 'Nhập mã PIN thẻ để cập nhật kênh thanh toán trực tuyến.',
                        patch: { online_payment_enabled: card.online_payment_enabled ? 0 : 1 },
                      })
                    }
                    className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold disabled:opacity-45 ${
                      card.online_payment_enabled
                        ? 'bg-emerald-600 text-white'
                        : `border ${theme.cardBg} ${theme.textSecondary}`
                    }`}
                  >
                    {card.online_payment_enabled ? 'Đang bật' : 'Đang tắt'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold">Thanh toán không tiếp xúc (NFC / POS)</p>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Chạm máy POS tại cửa hàng</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isCancelled}
                    onClick={() =>
                      requestPinFor({
                        kind: 'channel',
                        title: card.contactless_enabled ? 'Tắt thanh toán NFC / POS' : 'Bật thanh toán NFC / POS',
                        subtitle: 'Nhập mã PIN thẻ để cập nhật kênh thanh toán chạm POS.',
                        patch: { contactless_enabled: card.contactless_enabled ? 0 : 1 },
                      })
                    }
                    className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold disabled:opacity-45 ${
                      card.contactless_enabled
                        ? 'bg-emerald-600 text-white'
                        : `border ${theme.cardBg} ${theme.textSecondary}`
                    }`}
                  >
                    {card.contactless_enabled ? 'Đang bật' : 'Đang tắt'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-sky-500" />
                      <span>Thanh toán quốc tế (International)</span>
                    </p>
                    <p className={`text-[10.5px] ${theme.textSecondary}`}>Chi tiêu ngoại tệ & sàn quốc tế</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isCancelled}
                    onClick={() =>
                      requestPinFor({
                        kind: 'channel',
                        title:
                          card.intl_payment_enabled ?? 1
                            ? 'Tắt thanh toán quốc tế'
                            : 'Bật thanh toán quốc tế',
                        subtitle: 'Nhập mã PIN thẻ để cập nhật quyền giao dịch quốc tế.',
                        patch: { intl_payment_enabled: card.intl_payment_enabled ?? 1 ? 0 : 1 },
                      })
                    }
                    className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold disabled:opacity-45 ${
                      card.intl_payment_enabled ?? 1
                        ? 'bg-emerald-600 text-white'
                        : `border ${theme.cardBg} ${theme.textSecondary}`
                    }`}
                  >
                    {card.intl_payment_enabled ?? 1 ? 'Đang bật' : 'Đang tắt'}
                  </button>
                </div>
              </div>

              {/* Limits Display & Inline Editor */}
              <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.subCardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-extrabold">Hạn mức giao dịch thực tế</p>
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => (editingLimits ? setEditingLimits(false) : openLimitEdit())}
                      className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold ${theme.cardBg}`}
                    >
                      {editingLimits ? 'Hủy' : 'Điều chỉnh'}
                    </button>
                  )}
                </div>

                {!editingLimits ? (
                  <div className="space-y-2.5 text-xs tabular-nums">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className={theme.textSecondary}>Đã dùng hôm nay</span>
                        <span className="font-bold">
                          {formatVnd(spentToday)} / {formatVnd(dailyLimit)}
                        </span>
                      </div>
                      {progressBar(spentToday, dailyLimit, 'bg-[#E14B5A]')}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className={theme.textSecondary}>Đã dùng trong tháng</span>
                        <span className="font-bold">
                          {formatVnd(spentMonth)} / {formatVnd(monthlyLimit)}
                        </span>
                      </div>
                      {progressBar(spentMonth, monthlyLimit, 'bg-amber-500')}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                        <span className={theme.textSecondary}>Tối đa / lần</span>
                        <p className="font-extrabold">{formatVnd(Number(card.per_tx_limit || 20_000_000))}</p>
                      </div>
                      <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                        <span className={theme.textSecondary}>Chuyển khoản</span>
                        <p className="font-extrabold">{formatVnd(Number(card.transfer_limit || dailyLimit))}</p>
                      </div>
                      <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                        <span className={theme.textSecondary}>Rút tiền ATM</span>
                        <p className="font-extrabold">{formatVnd(Number(card.withdraw_limit || 20_000_000))}</p>
                      </div>
                      <div className={`rounded-xl border p-2 ${theme.cardBg}`}>
                        <span className={theme.textSecondary}>Thanh toán online</span>
                        <p className="font-extrabold">{formatVnd(Number(card.online_limit || dailyLimit))}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {[
                      { label: 'Mỗi lần (đ)', val: perTxInput, set: setPerTxInput },
                      { label: 'Theo ngày (đ)', val: dailyInput, set: setDailyInput },
                      { label: 'Theo tháng (đ)', val: monthlyInput, set: setMonthlyInput },
                      { label: 'Chuyển khoản (đ)', val: transferInput, set: setTransferInput },
                      { label: 'Rút ATM (đ)', val: withdrawInput, set: setWithdrawInput },
                      { label: 'Online (đ)', val: onlineInput, set: setOnlineInput },
                    ].map((f) => (
                      <div key={f.label} className="flex items-center justify-between gap-2">
                        <span className={theme.textSecondary}>{f.label}</span>
                        <input
                          type="number"
                          value={f.val}
                          onChange={(e) => f.set(e.target.value)}
                          className={`w-40 min-h-[36px] px-2.5 rounded-xl border text-right font-bold tabular-nums outline-none ${theme.inputClass}`}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        requestPinFor({
                          kind: 'limits',
                          title: 'Xác thực PIN để lưu hạn mức mới',
                          subtitle: 'Nhập mã PIN thẻ để áp dụng hạn mức giao dịch mới.',
                          patch: {
                            per_tx_limit: Number(perTxInput),
                            daily_limit: Number(dailyInput),
                            monthly_limit: Number(monthlyInput),
                            transfer_limit: Number(transferInput),
                            withdraw_limit: Number(withdrawInput),
                            online_limit: Number(onlineInput),
                          },
                        })
                      }
                      className="w-full min-h-[42px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold mt-2"
                    >
                      Lưu hạn mức mới
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'upgrade' && (
            <div className="space-y-3">
              {upgrade?.hasNextTier ? (
                <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.subCardBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-[10.5px] font-bold uppercase ${theme.textSecondary}`}>Hạng kế tiếp</p>
                      <h4 className="text-sm font-extrabold">
                        {upgrade.nextTierLabel} · {upgrade.nextCardTitle}
                      </h4>
                    </div>
                    <div className="text-right tabular-nums text-[11px]">
                      <p className="font-extrabold text-emerald-500">Hoàn {upgrade.nextCashbackRate}%</p>
                      <p className={theme.textSecondary}>Lãi {upgrade.nextInterestRate}%/năm</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs tabular-nums">
                    {upgrade.checks.map((chk) => (
                      <div key={chk.key} className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${theme.cardBg}`}>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{chk.label}</p>
                          <p className={`text-[11px] ${theme.textSecondary}`}>
                            {chk.key === 'txCount' || chk.key === 'rewardPoints'
                              ? `${chk.current.toLocaleString('de-DE')} / ${chk.required.toLocaleString('de-DE')}`
                              : `${formatVnd(chk.current)} / ${formatVnd(chk.required)}`}
                          </p>
                        </div>
                        <span className={`text-[11px] font-extrabold shrink-0 ${chk.passed ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {chk.passed ? 'Đạt' : 'Chưa đạt'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={busy || isCancelled || !upgrade.eligible}
                    onClick={() => onUpgradeCard(card.id, upgrade.nextTier || undefined)}
                    className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-45 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>
                      {upgrade.eligible
                        ? `Nâng cấp lên ${upgrade.nextTierLabel}`
                        : `Chưa đủ điều kiện nâng hạng (${upgrade.missingReasons.length})`}
                    </span>
                  </button>
                </div>
              ) : (
                <div className={`rounded-2xl border p-4 text-center space-y-1 ${theme.subCardBg}`}>
                  <Sparkles className="w-6 h-6 text-amber-500 mx-auto" />
                  <p className="text-sm font-extrabold">Bạn đang sở hữu hạng thẻ cao nhất ({card.tier_label})</p>
                  <p className={`text-xs ${theme.textSecondary}`}>
                    Hưởng toàn bộ đặc quyền tối đa của {card.bank_name || 'Hikari Bank'}.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {cardTxs.length === 0 ? (
                <div className={`rounded-2xl border p-5 text-center text-xs ${theme.subCardBg} ${theme.textSecondary}`}>
                  Chưa có giao dịch nào phát sinh từ thẻ •••• {card.last4}.
                </div>
              ) : (
                cardTxs.map((tx) => {
                  const isDeclined =
                    tx.status === 'Thất bại' || tx.tx_status_code === 'DECLINED' || tx.bill_template === 'failed';
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectTransaction(tx);
                      }}
                      className={`w-full min-h-[54px] rounded-2xl border p-3 text-left flex items-center justify-between gap-2 ${theme.subCardBg}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold truncate">{tx.counterparty}</p>
                          {isDeclined && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 text-[9.5px] font-extrabold shrink-0">
                              Bị từ chối
                            </span>
                          )}
                        </div>
                        <p className={`text-[10.5px] truncate ${isDeclined ? 'text-rose-500' : theme.textSecondary}`}>
                          {isDeclined && tx.failure_reason
                            ? `${tx.failure_reason} · ${formatTimeAgoOrDate(tx.created_at)}`
                            : `${formatTimeAgoOrDate(tx.created_at)} · ${tx.category}`}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-extrabold tabular-nums shrink-0 ${
                          isDeclined ? 'text-slate-400' : 'text-rose-500'
                        }`}
                      >
                        {isDeclined ? '0đ' : `-${formatVnd(tx.total_debit ?? tx.amount)}`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Inline PIN Verification Modal Overlay */}
        {pinAction && (
          <div
            onClick={() => setPinAction(null)}
            className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <form
              onSubmit={submitPinAction}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl border p-5 space-y-3 shadow-2xl ${theme.cardBg} ${theme.textPrimary}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#E14B5A]" />
                  <span>{pinAction.title}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setPinAction(null)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${theme.subCardBg}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className={`text-xs leading-relaxed ${theme.textSecondary}`}>{pinAction.subtitle}</p>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={pinPromptValue}
                onChange={(e) => setPinPromptValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Nhập mã PIN thẻ (4–6 số)"
                className={`w-full min-h-[44px] px-3 rounded-xl border text-center text-sm font-mono font-bold tracking-[0.3em] outline-none ${theme.inputClass}`}
              />
              {pinPromptError && <p className="text-xs font-semibold text-rose-500">{pinPromptError}</p>}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPinAction(null)}
                  className={`min-h-[42px] rounded-xl border text-xs font-bold ${theme.subCardBg}`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={`min-h-[42px] rounded-xl text-white text-xs font-extrabold ${
                    'destructive' in pinAction && pinAction.destructive
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#E14B5A] hover:bg-[#C83242]'
                  }`}
                >
                  {busy ? 'Đang xác thực...' : 'Xác nhận PIN'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

