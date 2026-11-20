import React, { useMemo, useState } from 'react';
import { Check, CreditCard, Lock, Palette, ShieldCheck, Sparkles, X } from 'lucide-react';
import type {
  BankBrandId,
  BankingAccountDemo,
  BankingCardItem,
  CardBankBrand,
  CardTierId,
} from '../../../types/os';
import type { HikariThemePalette } from '../HikariBrand';
import { formatVnd, maskAccountNumber } from '../utils';
import { BankBrandEmblem, CARD_DESIGN_THEMES } from './BankCardVisual';

const TIER_ORDER: CardTierId[] = ['standard', 'silver', 'gold', 'platinum', 'diamond', 'infinite'];

interface IssueCardModalProps {
  open: boolean;
  banks: CardBankBrand[];
  accounts: BankingAccountDemo[];
  existingCards: BankingCardItem[];
  totalAssets: number;
  theme: HikariThemePalette;
  busy: boolean;
  onClose: () => void;
  onIssue: (payload: {
    bank_id: string;
    card_tier: CardTierId;
    card_category: 'debit' | 'credit';
    card_nickname: string;
    account_id: string;
    design_theme: string;
    pin?: string;
  }) => Promise<void>;
}

export function IssueCardModal({
  open,
  banks,
  accounts,
  existingCards,
  totalAssets,
  theme,
  busy,
  onClose,
  onIssue,
}: IssueCardModalProps) {
  const payableAccounts = useMemo(
    () => accounts.filter((a) => a.account_role !== 'receive_only' && a.status !== 'locked'),
    [accounts]
  );

  const [selectedBankId, setSelectedBankId] = useState<BankBrandId>('hikari');
  const [cardCategory, setCardCategory] = useState<'debit' | 'credit'>('debit');
  const [selectedTier, setSelectedTier] = useState<CardTierId>('standard');
  const [designTheme, setDesignTheme] = useState<string>('default');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    () => payableAccounts.find((a) => Number(a.is_primary) === 1)?.id || payableAccounts[0]?.id || 'bank_1'
  );
  const [nickname, setNickname] = useState('');
  const [pinInput, setPinInput] = useState('');

  const selectedBank = useMemo(
    () => banks.find((b) => b.id === selectedBankId) || banks[0] || null,
    [banks, selectedBankId]
  );

  const selectedAccount = useMemo(
    () => payableAccounts.find((a) => a.id === selectedAccountId) || payableAccounts[0] || null,
    [payableAccounts, selectedAccountId]
  );

  const linkedBalance = Number(selectedAccount?.available_balance ?? selectedAccount?.balance ?? 0);
  const bestCardSpend = useMemo(
    () => existingCards.reduce((mx, c) => Math.max(mx, Number(c.total_card_spend || c.spent_month || 0)), 0),
    [existingCards]
  );
  const bestPoints = useMemo(
    () => existingCards.reduce((mx, c) => Math.max(mx, Number(c.reward_points || 0)), 0),
    [existingCards]
  );

  const activePolicy = selectedBank?.tier_policies?.[selectedTier];

  const tierLockReason = (tier: CardTierId): string => {
    const pol = selectedBank?.tier_policies?.[tier];
    if (!pol || tier === 'standard') return '';
    const req = pol.upgradeReq;
    const missing: string[] = [];
    if (linkedBalance < req.minLinkedBalance) {
      missing.push(`Số dư TK ≥ ${formatVnd(req.minLinkedBalance)}`);
    }
    if (totalAssets < req.minTotalAssets) {
      missing.push(`Tổng TS ≥ ${formatVnd(req.minTotalAssets)}`);
    }
    if (req.minCardSpend > 0 && bestCardSpend < req.minCardSpend) {
      missing.push(`Chi tiêu thẻ ≥ ${formatVnd(req.minCardSpend)}`);
    }
    if (req.minRewardPoints > 0 && bestPoints < req.minRewardPoints) {
      missing.push(`Điểm thưởng ≥ ${req.minRewardPoints}`);
    }
    return missing.join(' · ');
  };

  if (!open) return null;

  const lockReason = tierLockReason(selectedTier);
  const cleanPin = pinInput.trim();
  const pinError = cleanPin.length > 0 && !/^\d{4,6}$/.test(cleanPin) ? 'Mã PIN thẻ phải gồm 4–6 chữ số.' : '';
  const themeEntry = CARD_DESIGN_THEMES[designTheme] || CARD_DESIGN_THEMES.default;
  const headerPrimary = themeEntry.primary || selectedBank?.primary_color || '#E14B5A';
  const headerSecondary = themeEntry.secondary || selectedBank?.secondary_color || '#7F1D2E';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${theme.cardBg} ${theme.textPrimary}`}
      >
        <div
          style={{
            background: `linear-gradient(120deg, ${headerPrimary}, ${headerSecondary})`,
          }}
          className="px-5 py-4 text-white flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <BankBrandEmblem bankId={selectedBankId} size={36} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                Phát hành thẻ {cardCategory === 'credit' ? 'Tín dụng (Credit)' : 'Ghi nợ (Debit)'}
              </p>
              <h3 className="text-base font-extrabold truncate">
                {selectedBank?.name || 'Hikari Bank'} · {selectedBank?.jp_name || ''}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
          {/* Step 1: Select Bank */}
          <div className="space-y-2">
            <label className={`text-xs font-extrabold uppercase tracking-wider block ${theme.textSecondary}`}>
              1. Chọn ngân hàng phát hành ({banks.length})
            </label>
            <div className="grid grid-cols-1 gap-2">
              {banks.map((b) => {
                const active = b.id === selectedBankId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBankId(b.id)}
                    className={`min-h-[54px] rounded-2xl border p-2.5 text-left flex items-center justify-between gap-2.5 transition-all ${
                      active ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BankBrandEmblem bankId={b.id} size={32} />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">
                          {b.name} <span className={`font-medium ${theme.textSecondary}`}>· {b.jp_name}</span>
                        </p>
                        <p className={`text-[11px] truncate ${theme.textSecondary}`}>{b.specialty}</p>
                      </div>
                    </div>
                    {active && <Check className="w-4 h-4 text-[#E14B5A] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select Category (Debit vs Credit) */}
          <div className="space-y-2">
            <label className={`text-xs font-extrabold uppercase tracking-wider block ${theme.textSecondary}`}>
              2. Loại thẻ phát hành
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCardCategory('debit')}
                className={`min-h-[60px] rounded-2xl border p-2.5 text-left transition-all ${
                  cardCategory === 'debit' ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#E14B5A]" />
                    Thẻ Ghi nợ (Debit)
                  </span>
                  {cardCategory === 'debit' && <Check className="w-3.5 h-3.5 text-[#E14B5A]" />}
                </div>
                <p className={`text-[10.5px] mt-1 ${theme.textSecondary}`}>
                  Trừ trực tiếp số dư tài khoản liên kết
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCardCategory('credit')}
                className={`min-h-[60px] rounded-2xl border p-2.5 text-left transition-all ${
                  cardCategory === 'credit' ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Thẻ Tín dụng (Credit)
                  </span>
                  {cardCategory === 'credit' && <Check className="w-3.5 h-3.5 text-[#E14B5A]" />}
                </div>
                <p className={`text-[10.5px] mt-1 ${theme.textSecondary}`}>
                  Hạn mức tín dụng riêng theo hạng thẻ
                </p>
              </button>
            </div>
          </div>

          {/* Step 3: Select Tier */}
          {selectedBank && (
            <div className="space-y-2">
              <label className={`text-xs font-extrabold uppercase tracking-wider block ${theme.textSecondary}`}>
                3. Chọn hạng thẻ & chính sách lãi / hoàn tiền
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIER_ORDER.map((tierId) => {
                  const pol = selectedBank.tier_policies[tierId];
                  if (!pol) return null;
                  const reason = tierLockReason(tierId);
                  const locked = Boolean(reason);
                  const active = selectedTier === tierId;
                  return (
                    <button
                      key={tierId}
                      type="button"
                      onClick={() => setSelectedTier(tierId)}
                      className={`min-h-[74px] rounded-2xl border p-2.5 text-left flex flex-col justify-between transition-all ${
                        active ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                      } ${locked ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black">{pol.tierLabel}</span>
                        {locked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] space-y-0.5 tabular-nums">
                        <p className="font-bold text-emerald-500">Hoàn {pol.cashbackRate}% · Lãi {pol.interestRate}%</p>
                        <p className={`text-[10px] truncate ${theme.textSecondary}`}>
                          {cardCategory === 'credit'
                            ? `HM TD ${formatVnd(pol.creditLimit)}`
                            : `HM ${formatVnd(pol.dailyLimit)}/ngày`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activePolicy && (
                <div className={`rounded-2xl border p-3 text-xs space-y-2 ${theme.subCardBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold">{activePolicy.cardTitle}</span>
                    <span className={`font-bold tabular-nums ${theme.accentClass}`}>
                      +{activePolicy.rewardPointRate}đ/100k
                    </span>
                  </div>
                  <div className={`grid grid-cols-2 gap-2 text-[11px] ${theme.textSecondary} tabular-nums`}>
                    <span>Hoàn tiền: <strong className={theme.textPrimary}>{activePolicy.cashbackRate}%</strong></span>
                    <span>Lãi suất năm: <strong className={theme.textPrimary}>{activePolicy.interestRate}%</strong></span>
                    <span>Phí GD: <strong className={theme.textPrimary}>{activePolicy.txFeePct}% + {formatVnd(activePolicy.fixedTxFee)}</strong></span>
                    <span>Rút ATM: <strong className={theme.textPrimary}>{formatVnd(activePolicy.withdrawFee)}</strong></span>
                  </div>
                  <ul className={`text-[11px] space-y-1 pt-1 border-t ${theme.border}`}>
                    {activePolicy.benefits.slice(0, 3).map((b) => (
                      <li key={b} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {lockReason && (
                    <div className={`rounded-xl border p-2 text-[11px] font-semibold ${theme.badgeWarning}`}>
                      Điều kiện mở khóa: {lockReason}. Bạn có thể phát hành hạng thấp hơn rồi nâng cấp sau.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Card Design Theme */}
          <div className="space-y-2">
            <label className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${theme.textSecondary}`}>
              <Palette className="w-3.5 h-3.5" />
              <span>4. Kiểu dáng mặt thẻ</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(CARD_DESIGN_THEMES).map(([key, info]) => {
                const active = designTheme === key;
                const p = info.primary || selectedBank?.primary_color || '#E14B5A';
                const s = info.secondary || selectedBank?.secondary_color || '#7F1D2E';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDesignTheme(key)}
                    className={`rounded-xl border p-2 text-left transition-all ${
                      active ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                    }`}
                  >
                    <div
                      className="h-5 rounded-md mb-1.5 border border-white/20"
                      style={{ background: `linear-gradient(120deg, ${p}, ${s})` }}
                    />
                    <p className="text-[10.5px] font-bold truncate">{info.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 5: Linked Account, Nickname & PIN */}
          <div className="space-y-2.5">
            <label className={`text-xs font-extrabold uppercase tracking-wider block ${theme.textSecondary}`}>
              5. Tài khoản liên kết, tên gợi nhớ & mã PIN
            </label>
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className={`w-full min-h-[44px] px-3 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
            >
              {payableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.nickname || acc.account_type} · {maskAccountNumber(acc.account_number)} ({formatVnd(acc.available_balance ?? acc.balance)})
                </option>
              ))}
            </select>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
              placeholder={activePolicy?.cardTitle || 'Tên gợi nhớ cho thẻ (tùy chọn)'}
              className={`w-full min-h-[44px] px-3 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className={theme.textSecondary}>Mã PIN thẻ 4–6 số (mặc định 123456 nếu để trống)</span>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Nhập mã PIN riêng (4–6 số)"
                className={`w-full min-h-[44px] px-3 rounded-xl border text-xs font-mono font-bold tracking-widest outline-none ${theme.inputClass}`}
              />
              {pinError && <p className="text-[11px] font-semibold text-rose-500">{pinError}</p>}
            </div>
          </div>
        </div>

        <div className={`p-4 border-t shrink-0 ${theme.border}`}>
          <button
            type="button"
            disabled={busy || Boolean(lockReason) || Boolean(pinError) || !selectedAccount}
            onClick={() =>
              selectedAccount &&
              onIssue({
                bank_id: selectedBankId,
                card_tier: selectedTier,
                card_category: cardCategory,
                card_nickname: nickname.trim() || activePolicy?.cardTitle || '',
                account_id: selectedAccount.id,
                design_theme: designTheme,
                ...(cleanPin ? { pin: cleanPin } : {}),
              })
            }
            className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-45 text-white text-xs font-extrabold"
          >
            {busy
              ? 'Đang phát hành thẻ...'
              : lockReason
              ? 'Chưa đủ điều kiện mở hạng thẻ này'
              : `Phát hành thẻ ${cardCategory === 'credit' ? 'Credit' : 'Debit'} ${activePolicy?.tierLabel || ''} ngay`}
          </button>
        </div>
      </div>
    </div>
  );
}

