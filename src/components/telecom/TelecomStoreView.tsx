import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Filter,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { emitTelecomSyncEvent, osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingCardItem,
  TelecomCarrier,
  TelecomCatalogSim,
  TelecomOverviewPayload,
  TelecomTransaction,
} from '../../types/os';
import { getThemePalette } from '../banking/HikariBrand';
import { PaymentSourceSelector, resolveDefaultPaymentSource } from '../banking/PaymentSourceSelector';
import { formatVnd, isCardExpired } from '../banking/utils';
import {
  CarrierLogo,
  formatPhoneDisplay,
  parseCarrierTheme,
  parseJsonArray,
  SIM_TIER_OPTIONS,
} from './CarrierBrand';

type PricePreset = 'all' | 'under_200k' | '200k_1m' | '1m_5m' | 'above_5m';
type PatternFilter = 'all' | 'repeating' | 'progressive' | 'symmetric' | 'multi_digits';

interface TelecomStoreViewProps {
  carriers: TelecomCarrier[];
  catalog: TelecomCatalogSim[];
  accounts: BankingAccountDemo[];
  cards: BankingCardItem[];
  initialCarrierId?: string;
  selectedCatalogSim: TelecomCatalogSim | null;
  onSelectCatalogSim: (sim: TelecomCatalogSim | null) => void;
  onPurchaseSuccess: (overview: TelecomOverviewPayload, tx?: TelecomTransaction) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function TelecomStoreView({
  carriers,
  catalog,
  accounts,
  cards,
  initialCarrierId = 'all',
  selectedCatalogSim,
  onSelectCatalogSim,
  onPurchaseSuccess,
  onShowToast,
}: TelecomStoreViewProps) {
  const bankTheme = useMemo(() => getThemePalette('coral'), []);
  const [carrierFilter, setCarrierFilter] = useState<string>(initialCarrierId || 'all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [pricePreset, setPricePreset] = useState<PricePreset>('all');
  const [patternFilter, setPatternFilter] = useState<PatternFilter>('all');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [suffixFilter, setSuffixFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideSold, setHideSold] = useState(false);

  // Checkout Modal State
  const [aliasInput, setAliasInput] = useState('');
  const [setAsPrimary, setSetAsPrimary] = useState(false);
  const [paySource, setPaySource] = useState<{ accountId: string; cardId?: string }>(() =>
    resolveDefaultPaymentSource(accounts, cards)
  );
  const [buyBusy, setBuyBusy] = useState(false);

  useEffect(() => {
    if (initialCarrierId) {
      setCarrierFilter(initialCarrierId);
    }
  }, [initialCarrierId]);

  useEffect(() => {
    if (!selectedCatalogSim) return;
    const c = carriers.find((x) => x.id === selectedCatalogSim.carrier_id);
    setAliasInput(`${c?.code || selectedCatalogSim.carrier_id} · ${selectedCatalogSim.tier_label}`);
    setSetAsPrimary(false);
    setPaySource(resolveDefaultPaymentSource(accounts, cards));
  }, [selectedCatalogSim, carriers, accounts, cards]);

  const payCard = useMemo(
    () => (paySource.cardId ? cards.find((c) => c.id === paySource.cardId) || null : null),
    [cards, paySource.cardId]
  );
  const payAccount = useMemo(() => {
    if (payCard?.account_id) {
      const linked = accounts.find((a) => a.id === payCard.account_id);
      if (linked) return linked;
    }
    return accounts.find((a) => a.id === paySource.accountId) || accounts[0] || null;
  }, [accounts, payCard, paySource.accountId]);
  const payAvailable = Number(payAccount?.available_balance ?? payAccount?.balance ?? 0);
  const payInvalid =
    !payAccount ||
    payAccount.account_role === 'receive_only' ||
    payAccount.status === 'locked' ||
    (payCard ? payCard.status === 'locked' || isCardExpired(payCard.expiry) : false);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().replace(/\s+/g, '').toLowerCase();
    const pref = prefixFilter.trim().replace(/\D/g, '');
    const suff = suffixFilter.trim().replace(/\D/g, '');

    return catalog.filter((sim) => {
      if (hideSold && sim.status === 'sold') return false;
      if (carrierFilter !== 'all' && sim.carrier_id !== carrierFilter) return false;
      if (tierFilter !== 'all' && sim.sim_tier !== tierFilter) return false;
      if (pref && !sim.phone_number.startsWith(pref)) return false;
      if (suff && !sim.phone_number.endsWith(suff)) return false;

      if (pricePreset === 'under_200k' && sim.price >= 200000) return false;
      if (pricePreset === '200k_1m' && (sim.price < 200000 || sim.price > 1000000)) return false;
      if (pricePreset === '1m_5m' && (sim.price <= 1000000 || sim.price > 5000000)) return false;
      if (pricePreset === 'above_5m' && sim.price <= 5000000) return false;

      if (patternFilter === 'repeating' && sim.sim_tier !== 'repeating') return false;
      if (patternFilter === 'progressive' && sim.sim_tier !== 'progressive') return false;
      if (patternFilter === 'symmetric' && sim.sim_tier !== 'symmetric') return false;
      if (
        patternFilter === 'multi_digits' &&
        !['tam_hoa', 'tu_quy', 'ngu_quy', 'luc_quy'].includes(sim.sim_tier)
      ) {
        return false;
      }

      if (q) {
        const hay = `${sim.phone_number}${sim.sim_type}${sim.tier_label}${sim.description}${sim.event_tag}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, hideSold, carrierFilter, tierFilter, prefixFilter, suffixFilter, pricePreset, patternFilter, searchQuery]);

  const handleConfirmPurchase = async () => {
    if (!selectedCatalogSim || buyBusy) return;
    if (selectedCatalogSim.status === 'sold') {
      onShowToast('SIM đã bán', 'Số SIM này đã có chủ sở hữu.', 'error');
      return;
    }
    if (payInvalid) {
      onShowToast('Nguồn thanh toán không hợp lệ', 'Vui lòng chọn tài khoản hoặc thẻ Hikari Bank đang hoạt động.', 'error');
      return;
    }
    if (selectedCatalogSim.price > payAvailable) {
      onShowToast('Số dư Hikari Bank không đủ', 'Số dư tài khoản thanh toán chưa đủ để mua SIM này.', 'error');
      return;
    }

    setBuyBusy(true);
    try {
      const idempotencyKey = `atsim_${selectedCatalogSim.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await osApi.telecom.buySim({
        catalogId: selectedCatalogSim.id,
        aliasName: aliasInput.trim() || undefined,
        setAsPrimary,
        sourceAccountId: payAccount?.id,
        sourceCardId: payCard?.id,
        idempotencyKey,
      });
      emitTelecomSyncEvent('telecom');
      onShowToast(
        'Mua SIM thành công',
        `Đã sở hữu ${formatPhoneDisplay(res.phoneNumber)} (${res.carrierName}) và đồng bộ Hikari Bank.`,
        'success'
      );
      onSelectCatalogSim(null);
      onPurchaseSuccess(res, res.transaction);
    } catch (err) {
      onShowToast('Mua SIM thất bại', err instanceof Error ? err.message : 'Không thể mua SIM', 'error');
    } finally {
      setBuyBusy(false);
    }
  };

  return (
    <div className="p-3.5 pb-6 space-y-3.5">
      {/* Store Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
            <span>Cửa hàng SIM Số Đẹp</span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {filteredCatalog.filter((s) => s.status === 'available').length} SIM sẵn sàng · Thanh toán trực tiếp Hikari Bank
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHideSold((v) => !v)}
          className={`min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold ${
            hideSold
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621]'
          }`}
        >
          {hideSold ? 'Đang ẩn đã bán' : 'Ẩn SIM đã bán'}
        </button>
      </div>

      {/* Filters Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-3 space-y-2.5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm dãy số (VD: 888, 9999, Sakura, Limited...)"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>

        {/* Carrier Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCarrierFilter('all')}
            className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold shrink-0 border ${
              carrierFilter === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            Tất cả mạng
          </button>
          {carriers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCarrierFilter(c.id)}
              className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold shrink-0 border flex items-center gap-1.5 ${
                carrierFilter === c.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <CarrierLogo variant={c.logo_variant} size={18} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        {/* Tier Category Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {SIM_TIER_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTierFilter(t.id)}
              className={`min-h-[34px] px-2.5 rounded-xl text-[11px] font-bold shrink-0 border ${
                tierFilter === t.id
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Prefix / Suffix / Price / Pattern */}
        <div className="grid grid-cols-2 gap-2">
          <input
            value={prefixFilter}
            onChange={(e) => setPrefixFilter(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Đầu số (VD: 089, 036)"
            className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20 text-xs tabular-nums outline-none"
          />
          <input
            value={suffixFilter}
            onChange={(e) => setSuffixFilter(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Đuôi số (VD: 68, 9999)"
            className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20 text-xs tabular-nums outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={pricePreset}
            onChange={(e) => setPricePreset(e.target.value as PricePreset)}
            className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1E1E2B] text-[11px] font-bold outline-none"
          >
            <option value="all">Khoảng giá: Tất cả</option>
            <option value="under_200k">Dưới 200.000đ</option>
            <option value="200k_1m">200k – 1.000.000đ</option>
            <option value="1m_5m">1 triệu – 5 triệu</option>
            <option value="above_5m">Trên 5 triệu (VIP)</option>
          </select>

          <select
            value={patternFilter}
            onChange={(e) => setPatternFilter(e.target.value as PatternFilter)}
            className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1E1E2B] text-[11px] font-bold outline-none"
          >
            <option value="all">Dạng số: Tất cả</option>
            <option value="multi_digits">Tam hoa / Tứ-Ngũ-Lục quý</option>
            <option value="repeating">Số lặp (ABAB)</option>
            <option value="progressive">Số tiến (1234 / 6789)</option>
            <option value="symmetric">Số đối xứng (ABBA)</option>
          </select>
        </div>
      </div>

      {/* Catalog SIM List */}
      {filteredCatalog.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621] p-8 text-center space-y-2">
          <Filter className="w-8 h-8 opacity-40 mx-auto" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Không tìm thấy SIM phù hợp với bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCatalog.map((sim) => {
            const carrier = carriers.find((c) => c.id === sim.carrier_id);
            const sold = sim.status === 'sold';
            return (
              <div
                key={sim.id}
                className={`rounded-2xl border p-3.5 space-y-2.5 transition-colors ${
                  sold
                    ? 'border-slate-200/70 dark:border-slate-800/70 bg-slate-100/70 dark:bg-white/[0.02] opacity-70'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161621]'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CarrierLogo variant={carrier?.logo_variant || sim.carrier_id} size={40} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-base font-black tabular-nums tracking-tight">
                        {formatPhoneDisplay(sim.phone_number)}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {carrier?.name} · {sim.sim_type} · {sim.tier_label}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-rose-500 tabular-nums">{formatVnd(sim.price)}</p>
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      Hiếm {sim.rarity_score}/100
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{sim.description}</p>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-emerald-500 tabular-nums">
                    Tặng sẵn {formatVnd(sim.initial_balance)} trong SIM
                    {sim.event_tag ? ` · ${sim.event_tag}` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={sold}
                    onClick={() => onSelectCatalogSim(sim)}
                    className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold shrink-0 ${
                      sold
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {sold ? 'Đã bán' : 'Chọn mua'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SIM Detail & Hikari Bank Checkout Modal */}
      {selectedCatalogSim && (
        <div
          onClick={() => onSelectCatalogSim(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14141C] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden"
          >
            {(() => {
              const carrier = carriers.find((c) => c.id === selectedCatalogSim.carrier_id);
              const theme = parseCarrierTheme(carrier?.theme_json);
              const traits = parseJsonArray<string>(selectedCatalogSim.traits_json);
              const perks = parseJsonArray<string>(selectedCatalogSim.perks_json);
              const insufficient = selectedCatalogSim.price > payAvailable;

              return (
                <>
                  <div className={`bg-gradient-to-br ${theme.gradient} text-white p-5 shrink-0`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <CarrierLogo variant={carrier?.logo_variant || selectedCatalogSim.carrier_id} size={44} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-amber-200">
                            {carrier?.name} · {selectedCatalogSim.sim_type}
                          </p>
                          <h3 className="text-xl font-black tabular-nums tracking-tight">
                            {formatPhoneDisplay(selectedCatalogSim.phone_number)}
                          </h3>
                          <p className="text-xs text-white/80">
                            {selectedCatalogSim.tier_label} · Độ hiếm {selectedCatalogSim.rarity_score}/100
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectCatalogSim(null)}
                        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-3.5">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3.5 space-y-2 text-xs">
                      <p className="font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span>Đặc điểm & Quyền lợi số SIM</span>
                      </p>
                      <p className="text-slate-600 dark:text-slate-300">{selectedCatalogSim.description}</p>
                      {traits.length > 0 && (
                        <p className="text-indigo-500 font-semibold">Đặc điểm: {traits.join(' · ')}</p>
                      )}
                      {perks.map((pk, idx) => (
                        <p key={idx} className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{pk}</span>
                        </p>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold block text-slate-600 dark:text-slate-300">
                        Đặt tên gợi nhớ cho SIM mới
                      </label>
                      <input
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        maxLength={40}
                        placeholder="VD: SIM công việc / SIM Anime VIP"
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-black/20 text-xs font-semibold outline-none"
                      />
                    </div>

                    <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 text-xs font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={setAsPrimary}
                        onChange={(e) => setSetAsPrimary(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Đặt làm SIM CHÍNH ngay sau khi mua</span>
                    </label>

                    <PaymentSourceSelector
                      accounts={accounts}
                      cards={cards}
                      selectedAccountId={payAccount?.id || paySource.accountId}
                      selectedCardId={payCard?.id}
                      requiredAmount={selectedCatalogSim.price}
                      theme={bankTheme}
                      label="Thanh toán qua Hikari Bank"
                      onSelect={setPaySource}
                    />

                    {insufficient && (
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500 font-semibold flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          Số dư tài khoản Hikari Bank ({formatVnd(payAvailable)}) chưa đủ thanh toán {formatVnd(selectedCatalogSim.price)}.
                        </span>
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/5 p-3 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Giá niêm yết SIM</span>
                        <span className="font-bold tabular-nums">{formatVnd(selectedCatalogSim.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Số dư khởi tạo tặng kèm trong SIM</span>
                        <span className="font-bold text-emerald-500 tabular-nums">
                          +{formatVnd(selectedCatalogSim.initial_balance)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800">
                        <span className="font-bold">Tổng trừ từ Hikari Bank</span>
                        <span className="font-black text-rose-500 tabular-nums">{formatVnd(selectedCatalogSim.price)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      disabled={buyBusy || selectedCatalogSim.status === 'sold' || payInvalid || insufficient}
                      onClick={() => void handleConfirmPurchase()}
                      className="w-full min-h-[48px] rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-sm font-black"
                    >
                      {buyBusy
                        ? 'Đang kích hoạt & đồng bộ Hikari Bank...'
                        : selectedCatalogSim.status === 'sold'
                        ? 'SIM đã có chủ sở hữu'
                        : `Thanh toán ${formatVnd(selectedCatalogSim.price)} & Kích hoạt SIM`}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
