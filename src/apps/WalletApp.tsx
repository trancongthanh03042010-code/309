import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  CreditCard,
  Gift,
  Lock,
  Plus,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Ticket,
  Train,
  Trash2,
  X,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { BANKING_SYNC_EVENT, osApi, TELECOM_SYNC_EVENT } from '../services/api';
import type { BankingAccountDemo, BankingCardItem, WalletCard } from '../types/os';
import { BankCardVisual } from '../components/banking/cards/BankCardVisual';
import { formatVnd, isCardExpired, maskAccountNumber } from '../components/banking/utils';

const CARD_TYPE_LABELS: Record<WalletCard['card_type'], string> = {
  member: 'Thành viên',
  transit: 'Giao thông',
  event: 'Sự kiện',
  gift: 'Quà tặng',
};

export function WalletApp() {
  const { data, refreshData, showToast, requestConfirm, openApp } = useOS();
  const [selectedCard, setSelectedCard] = useState<WalletCard | null>(null);
  const [selectedBankCard, setSelectedBankCard] = useState<BankingCardItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [bankCards, setBankCards] = useState<BankingCardItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankingAccountDemo[]>([]);

  const [cardType, setCardType] = useState<'member' | 'gift' | 'event' | 'transit'>('member');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [codeValue, setCodeValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('2027-12-31');
  const [color, setColor] = useState('#A78BFA');

  const cards = data?.walletCards || [];

  const loadBankCards = useCallback(async () => {
    try {
      const ov = await osApi.banking.getOverview();
      setBankCards(ov.cards || []);
      setBankAccounts(ov.accounts || []);
      setSelectedBankCard((prev) => (prev ? (ov.cards || []).find((c) => c.id === prev.id) || null : null));
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    void loadBankCards();
  }, [loadBankCards]);

  useEffect(() => {
    const onSync = () => void loadBankCards();
    window.addEventListener(BANKING_SYNC_EVENT, onSync);
    window.addEventListener(TELECOM_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener(BANKING_SYNC_EVENT, onSync);
      window.removeEventListener(TELECOM_SYNC_EVENT, onSync);
    };
  }, [loadBankCards]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !codeValue.trim()) return;
    await osApi.createWalletCard({
      card_type: cardType,
      title: title.trim(),
      subtitle: subtitle.trim() || 'Thẻ điện tử',
      code_value: codeValue.trim(),
      color,
      expires_at: expiresAt,
    });
    setTitle('');
    setSubtitle('');
    setCodeValue('');
    setShowAdd(false);
    await refreshData();
    showToast('Ví', 'Đã thêm thẻ vào Ví mô phỏng.', 'success');
  };

  const renderIcon = (type: WalletCard['card_type']) => {
    if (type === 'event') return <Ticket className="w-4 h-4" />;
    if (type === 'transit') return <Train className="w-4 h-4" />;
    if (type === 'gift') return <Gift className="w-4 h-4" />;
    return <CreditCard className="w-4 h-4" />;
  };

  // Deterministic visual QR matrix from code string
  const buildQrGrid = (code: string) => {
    const size = 9;
    const cells: boolean[] = [];
    let seed = 0;
    for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) % 999983;
    for (let i = 0; i < size * size; i++) {
      const r = Math.floor(i / size);
      const c = i % size;
      const corner = (r < 2 && c < 2) || (r < 2 && c > size - 3) || (r > size - 3 && c < 2);
      cells.push(corner || ((seed + i * 17) % 3 !== 0));
    }
    return cells;
  };

  const linkedAccForSelected = selectedBankCard
    ? bankAccounts.find((a) => a.id === selectedBankCard.account_id) || null
    : null;

  return (
    <div className="relative h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold font-display">Ví & Thẻ</h1>
          <p className="text-[11px] text-zinc-500">Thẻ Ngân hàng Hikari, Thành viên & Vé sự kiện</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm thẻ
        </button>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Ví thẻ điện tử mô phỏng trên PHONE OS. Đồng bộ trực tiếp với kho thẻ Hikari Bank (không kết nối mạng thanh toán thật).
          </span>
        </div>

        {/* Synchronized Hikari Bank Cards Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
              <span>Thẻ Ngân hàng Hikari Bank ({bankCards.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => openApp('banking', { tab: 'cards' })}
              className="text-[11px] font-bold text-rose-500 flex items-center gap-0.5"
            >
              <span>Quản lý</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {bankCards.length === 0 ? (
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 flex items-center justify-between gap-2">
              <span>Chưa có thẻ Hikari Bank nào được phát hành.</span>
              <button
                type="button"
                onClick={() => openApp('banking', { tab: 'cards' })}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500 text-white text-[11px] font-bold shrink-0"
              >
                Mở thẻ
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {bankCards.map((bc) => (
                <BankCardVisual
                  key={bc.id}
                  card={bc}
                  compact
                  onClick={() => setSelectedBankCard(bc)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Classic Wallet Cards */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
            Thẻ Thành viên & Vé sự kiện ({cards.length})
          </h2>
          {cards.map((card) => (
            <div
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="rounded-3xl p-4 text-white shadow-md cursor-pointer transition-transform active:scale-[0.98]"
              style={{ background: `linear-gradient(135deg, ${card.color || '#A78BFA'}, #18181B)` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-white/15">{renderIcon(card.card_type)}</div>
                  <div>
                    <p className="text-sm font-bold">{card.title}</p>
                    <p className="text-[11px] text-white/80">{card.subtitle}</p>
                  </div>
                </div>
                <QrCode className="w-5 h-5 text-white/80" />
              </div>
              <div className="mt-5 flex items-end justify-between text-[11px]">
                <span className="font-mono-num tracking-wider opacity-90">{card.code_value}</span>
                <span className="opacity-75">HSD {card.expires_at}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bank Card Detail Modal */}
      {selectedBankCard && (
        <div
          onClick={() => setSelectedBankCard(null)}
          className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-3.5 max-h-[88vh] overflow-y-auto os-scroll border border-zinc-200 dark:border-zinc-800 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-500">
                Thẻ {selectedBankCard.card_category === 'credit' ? 'Credit' : 'Debit'} · {selectedBankCard.bank_name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedBankCard(null)}
                className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <BankCardVisual card={selectedBankCard} compact />

            <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Trạng thái</span>
                <span
                  className={`font-extrabold flex items-center gap-1 ${
                    selectedBankCard.status === 'cancelled'
                      ? 'text-zinc-500'
                      : selectedBankCard.status === 'locked'
                      ? 'text-rose-500'
                      : isCardExpired(selectedBankCard.expiry)
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                  }`}
                >
                  {selectedBankCard.status === 'cancelled' && <Ban className="w-3.5 h-3.5" />}
                  {selectedBankCard.status === 'locked' && <Lock className="w-3.5 h-3.5" />}
                  {selectedBankCard.status === 'cancelled'
                    ? 'Đã hủy'
                    : selectedBankCard.status === 'locked'
                    ? 'Đang khóa'
                    : isCardExpired(selectedBankCard.expiry)
                    ? 'Hết hạn'
                    : 'Đang hoạt động'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Ngày phát hành</span>
                <span className="font-mono font-bold">{(selectedBankCard.issued_at || '').slice(0, 10) || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tài khoản liên kết</span>
                <span className="font-semibold text-right truncate max-w-[180px]">
                  {linkedAccForSelected
                    ? `${linkedAccForSelected.nickname || linkedAccForSelected.account_type} (${maskAccountNumber(
                        linkedAccForSelected.account_number
                      )})`
                    : 'Chưa liên kết'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Số dư khả dụng</span>
                <span className="font-black text-emerald-500 tabular-nums">
                  {selectedBankCard.linked_status === 'unlinked'
                    ? '—'
                    : formatVnd(
                        Number(selectedBankCard.linked_balance ?? linkedAccForSelected?.available_balance ?? 0)
                      )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Hoàn tiền / Điểm</span>
                <span className="font-bold text-rose-500">
                  {Number(selectedBankCard.cashback_rate || 0)}% · {Number(selectedBankCard.reward_points || 0).toLocaleString('de-DE')} điểm
                </span>
              </div>
            </div>

            {Array.isArray(selectedBankCard.benefits) && selectedBankCard.benefits.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-1 text-[11px]">
                <p className="font-bold flex items-center gap-1 text-zinc-500">
                  <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                  <span>Quyền lợi hạng {selectedBankCard.tier_label}</span>
                </p>
                {selectedBankCard.benefits.slice(0, 3).map((b) => (
                  <p key={b} className="text-zinc-700 dark:text-zinc-300">
                    • {b}
                  </p>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedBankCard(null);
                openApp('banking', { tab: 'cards' });
              }}
              className="w-full min-h-[42px] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <span>Quản lý trong Hikari Bank</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selectedCard && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-xs rounded-3xl bg-white dark:bg-[#1A1A22] p-5 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Thẻ {CARD_TYPE_LABELS[selectedCard.card_type] || selectedCard.card_type}
              </span>
              <button onClick={() => setSelectedCard(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <h3 className="text-base font-bold">{selectedCard.title}</h3>
              <p className="text-xs text-zinc-500">{selectedCard.subtitle}</p>
            </div>
            <div className="mx-auto w-36 h-36 p-3 rounded-2xl bg-white border border-zinc-200 grid grid-cols-9 gap-0.5">
              {buildQrGrid(selectedCard.code_value).map((on, idx) => (
                <div key={idx} className={on ? 'bg-zinc-900 rounded-[1px]' : 'bg-transparent'} />
              ))}
            </div>
            <p className="text-xs font-mono-num font-semibold">{selectedCard.code_value}</p>
            <button
              onClick={() => {
                const target = selectedCard;
                setSelectedCard(null);
                requestConfirm({
                  title: 'Xóa thẻ khỏi Ví?',
                  message: `Xóa "${target.title}" khỏi Ví?`,
                  destructive: true,
                  onConfirm: async () => {
                    await osApi.deleteWalletCard(target.id);
                    refreshData();
                  },
                });
              }}
              className="w-full py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa thẻ
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-end p-3">
          <form
            onSubmit={handleAdd}
            className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Thêm thẻ điện tử</h3>
              <button type="button" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['member', 'transit', 'event', 'gift'] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setCardType(t)}
                  className={`py-1.5 rounded-xl text-[11px] font-semibold ${
                    cardType === t ? 'bg-[#A78BFA] text-white' : 'bg-zinc-100 dark:bg-zinc-900'
                  }`}
                >
                  {CARD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên thẻ (vd: Thẻ tàu điện Suica)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Phụ đề / Hạng thẻ"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <input
              required
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value)}
              placeholder="Mã thẻ / Mã vạch"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-mono-num outline-none"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {['#A78BFA', '#F472B6', '#10B981', '#3B82F6', '#F59E0B'].map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-zinc-900 dark:ring-white' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-[11px]"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold">
              Lưu thẻ
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
