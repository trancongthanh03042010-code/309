import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Layers,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { BankingAccountDemo, BankingCardItem } from '../../types/os';
import type { HikariThemePalette } from './HikariBrand';
import { formatVnd, isCardExpired, maskAccountNumber } from './utils';

interface PaymentSourceSelectorProps {
  accounts: BankingAccountDemo[];
  cards: BankingCardItem[];
  selectedAccountId: string;
  selectedCardId?: string;
  requiredAmount?: number;
  hideBalance?: boolean;
  theme: HikariThemePalette;
  label?: string;
  onSelect: (source: { accountId: string; cardId?: string }) => void;
}

export function resolveDefaultPaymentSource(
  accounts: BankingAccountDemo[],
  cards: BankingCardItem[]
): { accountId: string; cardId?: string } {
  const usableAccIds = new Set(
    accounts.filter((a) => a.account_role !== 'receive_only' && a.status !== 'locked').map((a) => a.id)
  );
  const activeCards = cards.filter((c) => {
    if (c.status === 'locked' || c.status === 'cancelled' || isCardExpired(c.expiry)) return false;
    if (c.linked_status === 'unlinked' || !c.account_id) return false;
    return usableAccIds.has(c.account_id);
  });
  const primaryCard = activeCards.find((c) => Number(c.is_primary) === 1) || activeCards[0];
  if (primaryCard) {
    const fallbackAcc =
      accounts.find((a) => a.id === primaryCard.account_id && usableAccIds.has(a.id)) ||
      accounts.find((a) => Number(a.is_primary) === 1 && usableAccIds.has(a.id)) ||
      accounts.find((a) => usableAccIds.has(a.id));
    if (fallbackAcc) {
      return { accountId: fallbackAcc.id, cardId: primaryCard.id };
    }
  }
  const primaryAcc =
    accounts.find((a) => Number(a.is_primary) === 1 && usableAccIds.has(a.id)) ||
    accounts.find((a) => usableAccIds.has(a.id)) ||
    accounts[0];
  return { accountId: primaryAcc?.id || 'bank_1', cardId: undefined };
}

export function PaymentSourceSelector({
  accounts,
  cards,
  selectedAccountId,
  selectedCardId,
  requiredAmount = 0,
  hideBalance = false,
  theme,
  label = 'Nguồn thanh toán',
  onSelect,
}: PaymentSourceSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  const selectedCard = useMemo(
    () => (selectedCardId ? cards.find((c) => c.id === selectedCardId) || null : null),
    [cards, selectedCardId]
  );

  const selectedAccount = useMemo(() => {
    if (selectedCard?.account_id) {
      const byCard = accounts.find((a) => a.id === selectedCard.account_id);
      if (byCard) return byCard;
    }
    return (
      accounts.find((a) => a.id === selectedAccountId) ||
      accounts.find((a) => Number(a.is_primary) === 1) ||
      accounts[0] ||
      null
    );
  }, [accounts, selectedAccountId, selectedCard]);

  const balance = Number(selectedAccount?.available_balance ?? selectedAccount?.balance ?? 0);
  const insufficient = requiredAmount > 0 && balance < requiredAmount;
  const shortfall = Math.max(0, Math.round(requiredAmount - balance));

  return (
    <div className={`rounded-2xl p-3 border space-y-2.5 ${theme.cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${theme.textSecondary}`}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${theme.subCardBg} ${theme.accentClass}`}
        >
          <span>Đổi thẻ/tài khoản</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Selected summary */}
      <div className={`rounded-xl p-2.5 border flex items-center justify-between gap-2 ${theme.subCardBg}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.accentBgSoft}`}>
            {selectedCard ? <CreditCard className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-extrabold truncate">
                {selectedCard
                  ? `${selectedCard.card_nickname || selectedCard.card_name} (•••• ${selectedCard.last4})`
                  : selectedAccount?.nickname || selectedAccount?.account_type || 'Tài khoản Hikari'}
              </p>
              {selectedCard && Number(selectedCard.is_primary) === 1 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${theme.badgePrimary}`}>
                  Thẻ chính
                </span>
              )}
              {!selectedCard && selectedAccount && Number(selectedAccount.is_primary) === 1 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${theme.badgePrimary}`}>
                  TK chính
                </span>
              )}
            </div>
            <p className={`text-[11px] truncate ${theme.textSecondary}`}>
              {selectedCard
                ? `${selectedCard.bank_name || 'Hikari Bank'} · ${selectedCard.tier_label || 'Standard'}${
                    Number(selectedCard.cashback_rate || 0) > 0 ? ` · Hoàn ${selectedCard.cashback_rate}%` : ''
                  } · ${maskAccountNumber(selectedAccount?.account_number)}`
                : `STK: ${maskAccountNumber(selectedAccount?.account_number)}`}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[10px] ${theme.textSecondary}`}>Số dư khả dụng</p>
          <p className={`text-xs font-black tabular-nums ${insufficient ? 'text-rose-500' : theme.accentClass}`}>
            {formatVnd(balance, hideBalance)}
          </p>
        </div>
      </div>

      {insufficient && (
        <div className={`rounded-xl border p-2.5 text-xs flex items-start gap-2 ${theme.badgeDanger}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-bold">
              Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.
            </p>
            <p className="text-[11px] opacity-90 tabular-nums">
              Hiện có: {formatVnd(balance, hideBalance)} · Cần thêm: {formatVnd(shortfall)}
            </p>
          </div>
        </div>
      )}

      {expanded && (
        <div className={`pt-2 border-t space-y-2.5 ${theme.border}`}>
          {cards.length > 0 && (
            <div className="space-y-1.5">
              <p className={`text-[10px] font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
                Thẻ Hikari liên kết tài khoản
              </p>
              {cards.map((card) => {
                const cancelled = card.status === 'cancelled';
                const locked = card.status === 'locked';
                const expired = isCardExpired(card.expiry);
                const unlinked = card.linked_status === 'unlinked' || !card.account_id;
                const linkedAcc = accounts.find((a) => a.id === card.account_id);
                const accReceiveOnly = linkedAcc?.account_role === 'receive_only';
                const accLocked = linkedAcc?.status === 'locked';
                const disabled = cancelled || locked || expired || unlinked || !linkedAcc || accReceiveOnly || accLocked;
                const reason = cancelled
                  ? 'Thẻ đã hủy'
                  : locked
                  ? 'Thẻ đang khóa'
                  : expired
                  ? 'Thẻ đã hết hạn'
                  : unlinked || !linkedAcc
                  ? 'Chưa liên kết tài khoản'
                  : accReceiveOnly
                  ? 'TK chỉ nhận tiền'
                  : accLocked
                  ? 'TK liên kết đang khóa'
                  : '';
                const isSelected = selectedCardId === card.id;
                const linkedBal = Number(linkedAcc?.available_balance ?? linkedAcc?.balance ?? 0);

                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!linkedAcc || disabled) return;
                      onSelect({ accountId: linkedAcc.id, cardId: card.id });
                      setExpanded(false);
                    }}
                    className={`w-full min-h-[46px] p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                      disabled
                        ? `${theme.subCardBg} opacity-55 cursor-not-allowed`
                        : isSelected
                        ? `border-[#E14B5A] ${theme.accentBgSoft}`
                        : `${theme.subCardBg}`
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate">
                          {card.card_nickname || card.card_name}
                        </span>
                        <span className={`text-[10px] font-mono ${theme.textSecondary}`}>•••• {card.last4}</span>
                        <span className={`text-[10px] font-bold ${theme.accentClass}`}>
                          {card.bank_short_code || 'HK'} · {card.tier_label || 'Standard'}
                        </span>
                        {Number(card.is_primary) === 1 && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${theme.badgePrimary}`}>
                            Chính
                          </span>
                        )}
                      </div>
                      <p className={`text-[10.5px] truncate mt-0.5 ${theme.textSecondary}`}>
                        {disabled ? (
                          <span className="text-rose-500 font-semibold inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" /> {reason}
                          </span>
                        ) : (
                          <span>
                            TK {linkedAcc?.nickname || linkedAcc?.account_type} · Hoàn {Number(card.cashback_rate || 0)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold tabular-nums shrink-0">
                      {unlinked ? '—' : formatVnd(linkedBal, hideBalance)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-1.5">
            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${theme.textSecondary}`}>
              Tài khoản thanh toán trực tiếp
            </p>
            {accounts.map((acc) => {
              const isReceiveOnly = acc.account_role === 'receive_only';
              const isAccLocked = acc.status === 'locked';
              const disabled = isReceiveOnly || isAccLocked;
              const isSelected = !selectedCardId && selectedAccount?.id === acc.id;
              const bal = Number(acc.available_balance ?? acc.balance ?? 0);

              return (
                <button
                  key={acc.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onSelect({ accountId: acc.id, cardId: undefined });
                    setExpanded(false);
                  }}
                  className={`w-full min-h-[46px] p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                    disabled
                      ? `${theme.subCardBg} opacity-55 cursor-not-allowed`
                      : isSelected
                      ? `border-[#E14B5A] ${theme.accentBgSoft}`
                      : theme.subCardBg
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold truncate">{acc.nickname || acc.account_type}</span>
                      {Number(acc.is_primary) === 1 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${theme.badgePrimary}`}>
                          <Sparkles className="w-2.5 h-2.5" /> Chính
                        </span>
                      )}
                      {isReceiveOnly && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${theme.badgeNeutral}`}>
                          Chỉ nhận tiền
                        </span>
                      )}
                    </div>
                    <p className={`text-[10.5px] font-mono truncate ${theme.textSecondary}`}>
                      {isReceiveOnly
                        ? 'Tài khoản chỉ nhận tiền — không dùng thanh toán'
                        : isAccLocked
                        ? 'Tài khoản đang khóa'
                        : maskAccountNumber(acc.account_number)}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold tabular-nums shrink-0">
                    {formatVnd(bal, hideBalance)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
