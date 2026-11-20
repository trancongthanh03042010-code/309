import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  CreditCard,
  Gift,
  History,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type {
  BankingCardItem,
  CardBillItem,
  CardCashbackLogItem,
  CardInterestLogItem,
  CardPartnerOffer,
  CardPointsLedgerItem,
  CardRewardCatalogItem,
  CardTierId,
  CardUserVoucher,
} from '../../../types/os';
import type { HikariThemePalette } from '../HikariBrand';
import { formatTimeAgoOrDate, formatVnd, isCardExpired } from '../utils';

interface CardBenefitsHubProps {
  cards: BankingCardItem[];
  selectedCardId: string;
  onSelectCardId: (cardId: string) => void;
  cardBills?: CardBillItem[];
  partners: CardPartnerOffer[];
  rewardCatalog: CardRewardCatalogItem[];
  vouchers: CardUserVoucher[];
  pointsLedger: CardPointsLedgerItem[];
  cashbackLogs: CardCashbackLogItem[];
  interestLogs: CardInterestLogItem[];
  theme: HikariThemePalette;
  hideBalance?: boolean;
  busy: boolean;
  onPayWithCard: (
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
  ) => Promise<void>;
  onRedeemReward: (cardId: string, catalogId: string) => Promise<void>;
  onClaimInterest: (cardId: string) => Promise<void>;
}

const TIER_ORDER: CardTierId[] = ['standard', 'silver', 'gold', 'platinum', 'diamond', 'infinite'];

function tierRank(tier?: string): number {
  const idx = TIER_ORDER.indexOf((tier || 'standard') as CardTierId);
  return idx >= 0 ? idx : 0;
}

export function CardBenefitsHub({
  cards,
  selectedCardId,
  onSelectCardId,
  cardBills = [],
  partners,
  rewardCatalog,
  vouchers,
  pointsLedger,
  cashbackLogs,
  interestLogs,
  theme,
  hideBalance = false,
  busy,
  onPayWithCard,
  onRedeemReward,
  onClaimInterest,
}: CardBenefitsHubProps) {
  const [subTab, setSubTab] = useState<'partners' | 'rewards' | 'ledger'>('partners');
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [channelType, setChannelType] = useState<'online' | 'pos' | 'intl'>('online');

  const unpaidBills = useMemo(
    () => cardBills.filter((b) => b.status === 'unpaid'),
    [cardBills]
  );
  const completedBills = useMemo(
    () => cardBills.filter((b) => b.status === 'completed'),
    [cardBills]
  );

  // Keep selectedBillId synced to an active unpaid bill or cleared when 0 remain
  useEffect(() => {
    if (unpaidBills.length === 0) {
      if (selectedBillId) setSelectedBillId('');
      return;
    }
    if (!selectedBillId || !unpaidBills.some((b) => b.id === selectedBillId)) {
      setSelectedBillId(unpaidBills[0].id);
    }
  }, [unpaidBills, selectedBillId]);

  const activeCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId) || cards[0] || null,
    [cards, selectedCardId]
  );

  const selectedBill = useMemo(
    () => unpaidBills.find((b) => b.id === selectedBillId) || null,
    [unpaidBills, selectedBillId]
  );

  const selectedPartner = useMemo(
    () => (selectedBill?.partner_id ? partners.find((p) => p.id === selectedBill.partner_id) || null : null),
    [partners, selectedBill]
  );

  const availableVouchers = useMemo(
    () =>
      vouchers.filter(
        (v) => v.status === 'available' && (!activeCard || v.card_id === activeCard.id)
      ),
    [vouchers, activeCard]
  );

  const selectedVoucher = useMemo(
    () => availableVouchers.find((v) => v.id === selectedVoucherId) || null,
    [availableVouchers, selectedVoucherId]
  );

  const hasPayTarget = Boolean(selectedBill && unpaidBills.length > 0);
  const parsedAmount = selectedBill ? Math.max(0, Math.round(Number(selectedBill.amount || 0))) : 0;
  const merchantName = selectedBill ? selectedBill.merchant_name : '';

  const partnerQualified = useMemo(() => {
    if (!selectedPartner || !activeCard) return false;
    return tierRank(String(activeCard.card_tier || 'standard')) >= tierRank(String(selectedPartner.min_tier || 'standard'));
  }, [selectedPartner, activeCard]);

  const voucherMinSpend = useMemo(() => {
    if (!selectedVoucher) return 0;
    return Number(selectedVoucher.min_spend || (Number(selectedVoucher.cash_value || 0) >= 100000 ? 250000 : 0));
  }, [selectedVoucher]);

  const voucherMinUnmet = Boolean(selectedVoucher && voucherMinSpend > 0 && parsedAmount > 0 && parsedAmount < voucherMinSpend);

  const previewCalc = useMemo(() => {
    const baseEmpty = {
      discount: 0,
      netAmount: 0,
      fee: 0,
      feePct: 0,
      totalDebit: 0,
      cashback: 0,
      cashbackPct: Number(activeCard?.cashback_rate || 0),
      points: 0,
      zeroAfterDiscount: false,
    };
    if (!activeCard || !hasPayTarget || parsedAmount < 1000) {
      return baseEmpty;
    }

    let discount = 0;
    if (selectedVoucher) {
      const vMin = Number(selectedVoucher.min_spend || (Number(selectedVoucher.cash_value || 0) >= 100000 ? 250000 : 0));
      if (vMin === 0 || parsedAmount >= vMin) {
        const vPct = Number(selectedVoucher.discount_pct || 0);
        const vCash = Number(selectedVoucher.cash_value || 0);
        const vMax = Number(selectedVoucher.max_discount || (vPct > 0 ? 200000 : 0));
        if (vPct > 0) {
          const rawV = Math.round(parsedAmount * (vPct / 100));
          discount += vMax > 0 ? Math.min(vMax, rawV) : rawV;
        } else if (vCash > 0) {
          discount += vCash;
        }
      }
    }

    if (selectedPartner && partnerQualified && Number(selectedPartner.discount_pct || 0) > 0) {
      const pPct = Number(selectedPartner.discount_pct || 0);
      const pMax = Number(selectedPartner.max_discount || 0);
      const rawP = Math.round(parsedAmount * (pPct / 100));
      discount += pMax > 0 ? Math.min(pMax, rawP) : rawP;
    }

    const rawNet = parsedAmount - discount;
    if (rawNet <= 0) {
      return {
        ...baseEmpty,
        discount: parsedAmount,
        netAmount: 0,
        zeroAfterDiscount: true,
      };
    }

    const netAmount = Math.round(rawNet);
    const feePct =
      channelType === 'intl'
        ? Number(activeCard.intl_fee_pct || activeCard.tx_fee_pct || 0)
        : Number(activeCard.tx_fee_pct || 0);
    const fixedFee = Number(activeCard.fixed_tx_fee || 0);
    const fee = Math.round(netAmount * (feePct / 100)) + fixedFee;
    const totalDebit = netAmount + fee;

    const baseRate = Math.max(0, Number(activeCard.cashback_rate || 0));
    const partnerCbBonus =
      selectedPartner && partnerQualified && Number(selectedPartner.cashback_bonus_pct || 0) > 0
        ? Number(selectedPartner.cashback_bonus_pct || 0)
        : 0;
    const cashbackPct = Number((baseRate + partnerCbBonus).toFixed(2));

    const cap = Math.max(0, Number(activeCard.cashback_cap_month || 0));
    const used = Math.max(0, Number(activeCard.cashback_used_month || 0));
    const remainingCap = cap > 0 ? Math.max(0, cap - used) : Number.POSITIVE_INFINITY;
    const rawCb = Math.round(netAmount * (cashbackPct / 100));
    const ensuredCb = cashbackPct > 0 && netAmount >= 1000 && remainingCap >= 1 ? Math.max(1, rawCb) : rawCb;
    const cashback = Math.min(ensuredCb, remainingCap);

    const ptRate = Math.max(0, Number(activeCard.reward_point_rate ?? 1));
    const partnerPtsBonus =
      selectedPartner && partnerQualified ? Math.max(0, Number(selectedPartner.points_bonus_pct || 0)) : 0;
    const rawPts = Math.floor((netAmount / 100_000) * ptRate * (1 + partnerPtsBonus / 100));
    const points = Math.max(netAmount >= 20000 && ptRate > 0 ? 1 : 0, rawPts);

    return {
      discount,
      netAmount,
      fee,
      feePct,
      totalDebit,
      cashback,
      cashbackPct,
      points,
      zeroAfterDiscount: false,
    };
  }, [activeCard, hasPayTarget, parsedAmount, selectedPartner, partnerQualified, selectedVoucher, channelType]);

  const cardBlockedReason = useMemo(() => {
    if (unpaidBills.length === 0) return 'Không còn hóa đơn cần thanh toán';
    if (!activeCard) return 'Chưa có thẻ';
    if (activeCard.status === 'cancelled') return 'Thẻ đã bị hủy';
    if (activeCard.status === 'locked') return 'Thẻ đang bị khóa';
    if (isCardExpired(activeCard.expiry)) return 'Thẻ đã hết hạn';
    if (activeCard.linked_status === 'unlinked' || !activeCard.account_id) return 'Thẻ chưa liên kết tài khoản';
    if (channelType === 'online' && !activeCard.online_payment_enabled) return 'Thẻ đang tắt thanh toán online';
    if (channelType === 'pos' && !activeCard.contactless_enabled) return 'Thẻ đang tắt thanh toán NFC/POS';
    if (channelType === 'intl' && !(activeCard.intl_payment_enabled ?? 1)) return 'Thẻ đang tắt thanh toán quốc tế';
    if (!hasPayTarget) return 'Vui lòng chọn hóa đơn cần thanh toán';
    if (parsedAmount <= 0) return 'Hóa đơn 0đ — không thể thanh toán';
    if (voucherMinUnmet) return `Voucher yêu cầu hóa đơn ≥ ${formatVnd(voucherMinSpend)}`;
    if (previewCalc.zeroAfterDiscount || previewCalc.netAmount <= 0) return 'Hóa đơn 0đ sau ưu đãi — không thể thanh toán';
    if (previewCalc.totalDebit > Number(activeCard.linked_balance || 0)) return 'Số dư tài khoản liên kết không đủ';
    return '';
  }, [
    unpaidBills.length,
    activeCard,
    channelType,
    hasPayTarget,
    parsedAmount,
    voucherMinUnmet,
    voucherMinSpend,
    previewCalc.zeroAfterDiscount,
    previewCalc.netAmount,
    previewCalc.totalDebit,
  ]);

  const filteredCashback = useMemo(
    () => (activeCard ? cashbackLogs.filter((l) => l.card_id === activeCard.id) : cashbackLogs),
    [cashbackLogs, activeCard]
  );
  const filteredInterest = useMemo(
    () => (activeCard ? interestLogs.filter((l) => l.card_id === activeCard.id) : interestLogs),
    [interestLogs, activeCard]
  );
  const filteredPoints = useMemo(
    () => (activeCard ? pointsLedger.filter((l) => l.card_id === activeCard.id) : pointsLedger),
    [pointsLedger, activeCard]
  );

  const renderBillBadge = (b: CardBillItem) => {
    if (Number(b.cashback_bonus_pct || 0) > 0) {
      return (
        <span className="text-[10px] font-extrabold text-emerald-500 shrink-0">
          +{b.cashback_bonus_pct}% hoàn tiền
        </span>
      );
    }
    if (Number(b.discount_pct || 0) > 0) {
      return (
        <span className="text-[10px] font-extrabold text-[#E14B5A] shrink-0">
          Giảm {b.discount_pct}%
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3.5">
      {/* Card selector strip */}
      <div className={`rounded-2xl border p-3 space-y-2 ${theme.cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${theme.textSecondary}`}>
            Thẻ áp dụng ưu đãi & hoàn tiền
          </span>
          {activeCard && (
            <span className="text-xs font-extrabold text-amber-500 tabular-nums">
              {Number(activeCard.reward_points || 0).toLocaleString('de-DE')} điểm
            </span>
          )}
        </div>

        <select
          value={activeCard?.id || ''}
          onChange={(e) => {
            onSelectCardId(e.target.value);
            setSelectedVoucherId('');
          }}
          className={`w-full min-h-[42px] px-3 rounded-xl border text-xs font-bold outline-none ${theme.inputClass}`}
        >
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.bank_short_code || 'HK'} · {c.card_nickname || c.card_name} (•••• {c.last4}) · {c.tier_label} · Hoàn {Number(c.cashback_rate || 0)}%
              {c.status === 'locked' ? ' [ĐÃ KHÓA]' : c.status === 'cancelled' ? ' [ĐÃ HỦY]' : ''}
            </option>
          ))}
        </select>

        {activeCard && (
          <div className={`flex items-center justify-between text-[11px] tabular-nums ${theme.textSecondary}`}>
            <span>
              TK: {activeCard.linked_status === 'unlinked' ? 'Chưa liên kết' : activeCard.linked_account_name}
            </span>
            <span className="font-bold">
              Khả dụng: {activeCard.linked_status === 'unlinked' ? '—' : formatVnd(Number(activeCard.linked_balance || 0), hideBalance)}
            </span>
          </div>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { id: 'partners', label: `Quẹt thẻ (${unpaidBills.length})`, icon: ShoppingBag },
          { id: 'rewards', label: 'Đổi điểm & Quà', icon: Gift },
          { id: 'ledger', label: 'Lịch sử Hoàn/Lãi', icon: History },
        ].map((item) => {
          const Icon = item.icon;
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id as typeof subTab)}
              className={`min-h-[44px] px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                active ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : theme.cardBg
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Partner Card Bills & Checkout */}
      {subTab === 'partners' && (
        <div className="space-y-3">
          <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.cardBg}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#E14B5A]" />
                <span>Hóa đơn cần thanh toán bằng thẻ ({unpaidBills.length})</span>
              </h4>
            </div>

            {unpaidBills.length === 0 ? (
              <div className={`rounded-xl border p-4 text-center space-y-1.5 ${theme.subCardBg}`}>
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                <p className="text-xs font-extrabold">Hiện không còn hóa đơn cần thanh toán</p>
                <p className={`text-[11px] ${theme.textSecondary}`}>
                  Tất cả hóa đơn đối tác hoàn tiền đã được thanh toán hoàn tất. Không thể thanh toán khi không còn hóa đơn.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[260px] overflow-y-auto os-scroll pr-0.5">
                {unpaidBills.map((bill) => {
                  const active = selectedBill?.id === bill.id;
                  return (
                    <button
                      key={bill.id}
                      type="button"
                      onClick={() => setSelectedBillId(bill.id)}
                      className={`min-h-[60px] rounded-xl border p-2.5 text-left flex items-center justify-between gap-2 transition-all ${
                        active ? `border-[#E14B5A] ${theme.accentBgSoft}` : theme.subCardBg
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">{bill.title}</p>
                        <p className={`text-[10.5px] truncate ${theme.textSecondary}`}>
                          {bill.merchant_name} · {bill.category} · Hạn {bill.due_date}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-rose-500 tabular-nums">{formatVnd(bill.amount)}</p>
                        {renderBillBadge(bill)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checkout Form */}
          <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.cardBg}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#E14B5A]" />
                <span>Thanh toán bằng thẻ</span>
              </h4>
              <div className="flex items-center gap-1">
                {(['online', 'pos', 'intl'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    disabled={!hasPayTarget}
                    onClick={() => setChannelType(ch)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border disabled:opacity-45 ${
                      channelType === ch ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : theme.subCardBg
                    }`}
                  >
                    {ch === 'online' ? 'Online' : ch === 'pos' ? 'POS' : 'Quốc tế'}
                  </button>
                ))}
              </div>
            </div>

            {selectedBill && (
              <div className={`rounded-xl border p-3 space-y-1 text-xs ${theme.subCardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold truncate">{selectedBill.title}</span>
                  <span className="font-black text-rose-500 tabular-nums shrink-0">
                    {formatVnd(parsedAmount)}
                  </span>
                </div>
                <p className={`text-[11px] ${theme.textSecondary}`}>{selectedBill.description}</p>
              </div>
            )}

            {selectedPartner && activeCard && !partnerQualified && (
              <div className={`rounded-xl border p-2 text-[11px] font-semibold ${theme.badgeWarning}`}>
                Ưu đãi thêm của đối tác áp dụng từ hạng {String(selectedPartner.min_tier).toUpperCase()}. Thẻ {activeCard.tier_label} hiện tại vẫn nhận hoàn tiền {Number(activeCard.cashback_rate || 0)}% gốc của thẻ.
              </div>
            )}

            {availableVouchers.length > 0 && hasPayTarget && (
              <div className="space-y-1">
                <label className={`text-[11px] font-semibold block ${theme.textSecondary}`}>
                  Áp dụng Voucher ({availableVouchers.length} khả dụng)
                </label>
                <select
                  value={selectedVoucherId}
                  onChange={(e) => setSelectedVoucherId(e.target.value)}
                  className={`w-full min-h-[40px] px-3 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                >
                  <option value="">Không dùng voucher</option>
                  {availableVouchers.map((v) => {
                    const code = v.voucher_code || v.code || v.id;
                    const vPct = Number(v.discount_pct || 0);
                    const vCash = Number(v.cash_value || 0);
                    const vMax = Number(v.max_discount || 0);
                    const vMin = Number(v.min_spend || 0);
                    const desc =
                      vPct > 0
                        ? `Giảm ${vPct}%${vMax > 0 ? ` (tối đa ${formatVnd(vMax)})` : ''}`
                        : vCash > 0
                        ? `Giảm ${formatVnd(vCash)}${vMin > 0 ? ` (đơn ≥ ${formatVnd(vMin)})` : ''}`
                        : v.title;
                    return (
                      <option key={v.id} value={v.id}>
                        {code} · {desc}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Breakdown — strictly 1 cashback line, distinct % lines for discount, fee & points */}
            <div className={`rounded-xl border p-3 text-xs space-y-1.5 tabular-nums ${theme.subCardBg}`}>
              {previewCalc.discount > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Giảm giá trực tiếp</span>
                  <span className="font-bold text-rose-500">-{formatVnd(previewCalc.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={theme.textSecondary}>
                  Phí giao dịch ({previewCalc.feePct}% · {channelType === 'intl' ? 'Quốc tế' : channelType === 'pos' ? 'POS' : 'Online'})
                </span>
                <span className="font-bold">{previewCalc.fee === 0 ? '0đ' : formatVnd(previewCalc.fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>
                  Hoàn tiền ({previewCalc.cashbackPct}%)
                </span>
                <span className="font-bold text-emerald-500">
                  +{formatVnd(previewCalc.cashback)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Điểm thưởng tích lũy</span>
                <span className="font-bold text-amber-500">
                  +{previewCalc.points} điểm
                </span>
              </div>
              <div className={`flex justify-between pt-1.5 border-t font-extrabold ${theme.border}`}>
                <span>Tổng trừ tài khoản liên kết</span>
                <span className="text-rose-500">
                  {previewCalc.totalDebit > 0 ? `-${formatVnd(previewCalc.totalDebit)}` : '0 VNĐ'}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={busy || Boolean(cardBlockedReason) || !activeCard || !hasPayTarget}
              onClick={() =>
                activeCard &&
                selectedBill &&
                parsedAmount >= 1000 &&
                previewCalc.netAmount > 0 &&
                onPayWithCard(activeCard.id, {
                  merchant: merchantName,
                  amount: parsedAmount,
                  category: selectedBill.category || selectedPartner?.category || 'Mua sắm',
                  billId: selectedBill.id,
                  partnerId: selectedPartner?.id || selectedBill.partner_id || undefined,
                  voucherId: selectedVoucher?.id,
                  channelType,
                })
              }
              className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-45 text-white text-xs font-extrabold"
            >
              {busy
                ? 'Đang xử lý thanh toán...'
                : cardBlockedReason
                ? cardBlockedReason
                : `Thanh toán ${formatVnd(previewCalc.totalDebit)}`}
            </button>
          </div>

          {completedBills.length > 0 && (
            <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
              <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Hóa đơn đã hoàn thành ({completedBills.length})</span>
              </h4>
              <div className="space-y-1.5">
                {completedBills.map((bill) => (
                  <div
                    key={bill.id}
                    className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 text-xs ${theme.subCardBg}`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{bill.title}</p>
                      <p className={`text-[10.5px] truncate ${theme.textSecondary}`}>
                        {bill.merchant_name} · {bill.paid_at ? formatTimeAgoOrDate(bill.paid_at) : 'Đã thanh toán'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold tabular-nums">{formatVnd(bill.amount)}</p>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[9.5px] font-extrabold">
                        Đã hoàn thành
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Reward Points & Redemption */}
      {subTab === 'rewards' && (
        <div className="space-y-3">
          {activeCard?.interest_preview && (
            <div className={`rounded-2xl border p-3.5 flex items-center justify-between gap-2 ${theme.cardBg}`}>
              <div className="min-w-0">
                <p className="text-xs font-extrabold flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span>Lãi số dư thẻ ({activeCard.interest_rate || 0}%/năm)</span>
                </p>
                <p className={`text-[11px] ${theme.textSecondary} tabular-nums`}>
                  {activeCard.interest_preview.alreadyClaimedToday
                    ? 'Hôm nay bạn đã nhận lãi chu kỳ này.'
                    : `Dự kiến nhận: ${formatVnd(activeCard.interest_preview.estimatedInterest)}`}
                </p>
              </div>
              <button
                type="button"
                disabled={
                  busy ||
                  activeCard.interest_preview.estimatedInterest <= 0 ||
                  activeCard.interest_preview.alreadyClaimedToday
                }
                onClick={() => onClaimInterest(activeCard.id)}
                className="min-h-[38px] px-3 rounded-xl bg-emerald-600 disabled:opacity-45 text-white text-[11px] font-bold shrink-0"
              >
                {activeCard.interest_preview.alreadyClaimedToday ? 'Đã nhận' : 'Nhận lãi'}
              </button>
            </div>
          )}

          <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.cardBg}`}>
            <h4 className="text-xs font-extrabold flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>Kho đổi điểm thưởng ({rewardCatalog.length})</span>
            </h4>
            <div className="space-y-2">
              {rewardCatalog.map((item) => {
                const points = Number(activeCard?.reward_points || 0);
                const enough = points >= item.points_cost;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-2.5 ${theme.subCardBg}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold truncate">{item.title}</p>
                      <p className={`text-[10.5px] ${theme.textSecondary}`}>{item.description}</p>
                      <p className="text-[11px] font-bold text-amber-500 mt-0.5 tabular-nums">
                        Cần {item.points_cost.toLocaleString('de-DE')} điểm
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !activeCard || !enough}
                      onClick={() => activeCard && onRedeemReward(activeCard.id, item.id)}
                      className="min-h-[38px] px-3 rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-40 text-white text-[11px] font-bold shrink-0"
                    >
                      {enough ? 'Đổi ngay' : 'Thiếu điểm'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {availableVouchers.length > 0 && (
            <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
              <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#E14B5A]" />
                <span>Voucher của thẻ ({availableVouchers.length})</span>
              </h4>
              <div className="space-y-1.5">
                {availableVouchers.map((v) => {
                  const vPct = Number(v.discount_pct || 0);
                  const vCash = Number(v.cash_value || 0);
                  return (
                    <div key={v.id} className={`rounded-xl border p-2.5 flex items-center justify-between text-xs ${theme.subCardBg}`}>
                      <div>
                        <p className="font-bold">{v.title}</p>
                        <p className={`text-[10.5px] font-mono ${theme.textSecondary}`}>Mã: {v.voucher_code || v.code}</p>
                      </div>
                      <span className="font-extrabold text-emerald-500 tabular-nums">
                        {vPct > 0 ? `-${vPct}%` : vCash > 0 ? `-${formatVnd(vCash)}` : 'Đặc quyền'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Cashback, Interest & Points Logs */}
      {subTab === 'ledger' && (
        <div className="space-y-3">
          <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
            <h4 className="text-xs font-extrabold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Lịch sử hoàn tiền Cashback ({filteredCashback.length})</span>
            </h4>
            {filteredCashback.length === 0 ? (
              <p className={`text-xs ${theme.textSecondary}`}>Chưa có khoản hoàn tiền nào cho thẻ này.</p>
            ) : (
              <div className="space-y-1.5">
                {filteredCashback.slice(0, 20).map((log) => (
                  <div key={log.id} className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 text-xs ${theme.subCardBg}`}>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{log.merchant}</p>
                      <p className={`text-[10.5px] ${theme.textSecondary}`}>
                        {log.cashback_rate}% trên {formatVnd(log.spend_amount)} · {formatTimeAgoOrDate(log.created_at)}
                      </p>
                    </div>
                    <span className="font-extrabold text-emerald-500 tabular-nums shrink-0">
                      +{formatVnd(log.cashback_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.cardBg}`}>
            <h4 className="text-xs font-extrabold">Lịch sử nhận lãi & biến động điểm</h4>
            {filteredInterest.length === 0 && filteredPoints.length === 0 ? (
              <p className={`text-xs ${theme.textSecondary}`}>Chưa có lịch sử lãi suất hoặc điểm thưởng.</p>
            ) : (
              <div className="space-y-1.5">
                {filteredInterest.slice(0, 10).map((log) => (
                  <div key={log.id} className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 text-xs ${theme.subCardBg}`}>
                    <div className="min-w-0">
                      <p className="font-bold">Lãi số dư ({log.annual_rate}% · {log.days_accrued} ngày)</p>
                      <p className={`text-[10.5px] ${theme.textSecondary}`}>Kỳ {log.cycle_key}</p>
                    </div>
                    <span className="font-extrabold text-sky-500 tabular-nums shrink-0">
                      +{formatVnd(log.interest_amount)}
                    </span>
                  </div>
                ))}
                {filteredPoints.slice(0, 12).map((pt) => (
                  <div key={pt.id} className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 text-xs ${theme.subCardBg}`}>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{pt.detail}</p>
                      <p className={`text-[10.5px] ${theme.textSecondary}`}>{formatTimeAgoOrDate(pt.created_at)}</p>
                    </div>
                    <span className={`font-extrabold tabular-nums shrink-0 ${pt.delta >= 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {pt.delta >= 0 ? `+${pt.delta}` : pt.delta} điểm
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
