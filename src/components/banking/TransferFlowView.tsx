import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Delete,
  Download,
  Fingerprint,
  History,
  Lock,
  Maximize2,
  Pin,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingBeneficiary,
  BankingCardItem,
  BankingOverviewPayload,
  BankingSecurityState,
  BankingTransactionDemo,
  SharePayload,
} from '../../types/os';
import { downloadDataUrlAsPng, renderBillToPngDataUrl, txToBillInput } from './billRenderer';
import type { HikariThemePalette } from './HikariBrand';
import { PaymentSourceSelector, resolveDefaultPaymentSource } from './PaymentSourceSelector';
import {
  AVATAR_PRESETS,
  formatVnd,
  isCardExpired,
  isSuccessBillableTx,
  PARTNER_BANKS,
  sharePngViaNativeSystem,
  TRANSFER_METHODS,
  TRANSFER_NOTE_PRESETS,
  TRANSFER_SUGGESTED_AMOUNTS,
} from './utils';

export interface VerifiedRecipientState {
  valid: boolean;
  recipientName: string;
  bankCode: string;
  bankName: string;
  avatar?: string;
  status?: string;
  isAi?: boolean;
  characterId?: string;
}

export interface TransferDraftState {
  sourceId: string;
  sourceCardId?: string;
  step: 1 | 2 | 3 | 4 | 5;
  bankCode: string;
  accountNumber: string;
  verifiedRecipient: VerifiedRecipientState | null;
  rawDigits: string;
  note: string;
  memo: string;
  method: string;
  saveBeneficiary: boolean;
}

export function createInitialTransferDraft(
  defaultSourceId = 'bank_1',
  defaultSourceCardId?: string
): TransferDraftState {
  return {
    sourceId: defaultSourceId,
    sourceCardId: defaultSourceCardId,
    step: 1,
    bankCode: 'HIKARI',
    accountNumber: '',
    verifiedRecipient: null,
    rawDigits: '',
    note: 'Chuyển tiền Hikari Bank',
    memo: '',
    method: TRANSFER_METHODS[0].label,
    saveBeneficiary: true,
  };
}

interface TransferFlowViewProps {
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  cards: BankingCardItem[];
  aiAccounts: BankingAccountDemo[];
  beneficiaries: BankingBeneficiary[];
  security: BankingSecurityState | null;
  hideBalance?: boolean;
  theme: HikariThemePalette;
  draft: TransferDraftState;
  onDraftChange: React.Dispatch<React.SetStateAction<TransferDraftState>>;
  initialRecipient?: {
    accountNumber?: string;
    bankCode?: string;
    name?: string;
    amount?: number;
    note?: string;
    characterId?: string;
  } | null;
  onUpdated: (payload: BankingOverviewPayload) => void;
  onOpenQr: () => void;
  onShare: (payload: SharePayload) => void;
  onOpenReceipt?: (tx: BankingTransactionDemo) => void;
  onOpenHistory?: () => void;
  onSavedToPhotos?: () => void;
  onShowToast: (
    title: string,
    msg: string,
    type?: 'info' | 'success' | 'error',
    action?: { label: string; onClick: () => void }
  ) => void;
}

export function TransferFlowView({
  account,
  accounts,
  cards,
  aiAccounts,
  beneficiaries,
  security,
  hideBalance = false,
  theme,
  draft,
  onDraftChange,
  initialRecipient,
  onUpdated,
  onOpenQr,
  onShare,
  onOpenReceipt,
  onOpenHistory,
  onSavedToPhotos,
  onShowToast,
}: TransferFlowViewProps) {
  const defaultSource = useMemo(() => resolveDefaultPaymentSource(accounts, cards), [accounts, cards]);

  // Sync initial default card/account if draft hasn't selected a valid active source yet
  useEffect(() => {
    const selectedCardObj = draft.sourceCardId ? cards.find((c) => c.id === draft.sourceCardId) : undefined;
    const hasValidAcc = accounts.some(
      (a) => a.id === draft.sourceId && a.account_role !== 'receive_only' && a.status !== 'locked'
    );
    const cardInvalid =
      selectedCardObj &&
      (selectedCardObj.status === 'locked' ||
        isCardExpired(selectedCardObj.expiry) ||
        selectedCardObj.linked_status === 'unlinked' ||
        !selectedCardObj.account_id);

    if (!hasValidAcc || cardInvalid) {
      onDraftChange((prev) => ({
        ...prev,
        sourceId: defaultSource.accountId,
        sourceCardId: defaultSource.cardId,
      }));
    } else if (!draft.sourceCardId && defaultSource.cardId && draft.sourceId === 'bank_1' && draft.step === 1 && !draft.rawDigits) {
      onDraftChange((prev) => ({
        ...prev,
        sourceId: defaultSource.accountId,
        sourceCardId: defaultSource.cardId,
      }));
    }
  }, [accounts, cards, defaultSource, draft.sourceId, draft.sourceCardId, draft.step, draft.rawDigits, onDraftChange]);

  const selectedCard = useMemo(
    () => (draft.sourceCardId ? cards.find((c) => c.id === draft.sourceCardId) || null : null),
    [cards, draft.sourceCardId]
  );

  const sourceAcc = useMemo(() => {
    if (selectedCard?.account_id) {
      const linked = accounts.find((a) => a.id === selectedCard.account_id);
      if (linked) return linked;
    }
    return (
      accounts.find((a) => a.id === draft.sourceId) ||
      account ||
      accounts.find((a) => Number(a.is_primary) === 1) ||
      accounts[0] ||
      null
    );
  }, [accounts, selectedCard, draft.sourceId, account]);

  const { step, bankCode, accountNumber, verifiedRecipient, rawDigits, note, memo, method, saveBeneficiary } = draft;
  const amount = rawDigits ? Number(rawDigits) : 0;

  const [lookupError, setLookupError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authMethod, setAuthMethod] = useState<'pin' | 'biometric'>('pin');
  const [submitting, setSubmitting] = useState(false);
  const [clientTxId, setClientTxId] = useState(() => `hktx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const [resultState, setResultState] = useState<{
    ok: boolean;
    tx?: BankingTransactionDemo;
    error?: string;
    pngUrl?: string;
  } | null>(null);
  const [savingToPhotos, setSavingToPhotos] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const [recipientFilter, setRecipientFilter] = useState<'ai' | 'saved' | 'qr'>('ai');
  const [qrInput, setQrInput] = useState('');
  const [recipientSearch, setRecipientSearch] = useState('');

  useEffect(() => {
    if (initialRecipient?.accountNumber) {
      const normalizedBank = initialRecipient.bankCode === 'PHONEBANK' ? 'HIKARI' : initialRecipient.bankCode || 'HIKARI';
      onDraftChange((prev) => ({
        ...prev,
        step: 2,
        bankCode: normalizedBank,
        accountNumber: initialRecipient.accountNumber || '',
        verifiedRecipient: {
          valid: true,
          recipientName: (initialRecipient.name || 'NGƯỜI NHẬN').toUpperCase(),
          bankCode: normalizedBank,
          bankName: PARTNER_BANKS.find((b) => b.code === normalizedBank)?.name || 'Hikari Bank',
          isAi: Boolean(initialRecipient.characterId),
          characterId: initialRecipient.characterId,
          status: 'Đang hoạt động',
        },
        rawDigits: initialRecipient.amount ? String(Math.round(initialRecipient.amount)) : prev.rawDigits,
        note: initialRecipient.note || prev.note,
      }));
    }
  }, [initialRecipient, onDraftChange]);

  const baseMethodFee = TRANSFER_METHODS.find((m) => m.label === method)?.fee || 0;
  const expressWaivedByTier =
    selectedCard &&
    ['platinum', 'diamond', 'infinite'].includes(String(selectedCard.card_tier || 'standard'));
  const cardTxFee = selectedCard
    ? Math.round(amount * (Number(selectedCard.tx_fee_pct || 0) / 100)) +
      Math.round(Number(selectedCard.fixed_tx_fee || 0))
    : 0;
  const methodFee = selectedCard
    ? (method.includes('Hỏa tốc') && !expressWaivedByTier ? 11000 : 0) + (amount > 0 ? cardTxFee : 0)
    : baseMethodFee;

  const available = Number(sourceAcc?.available_balance ?? sourceAcc?.balance ?? 0);
  const totalDebit = amount + methodFee;
  const balanceAfterPreview = Math.max(0, available - totalDebit);
  const dailyLimit = Number(sourceAcc?.daily_limit || 100000000);
  const sourceInvalid =
    !sourceAcc ||
    sourceAcc.account_role === 'receive_only' ||
    sourceAcc.status === 'locked' ||
    (selectedCard
      ? selectedCard.status === 'locked' ||
        isCardExpired(selectedCard.expiry) ||
        selectedCard.linked_status === 'unlinked' ||
        !selectedCard.account_id
      : false);
  const cardLimitError = useMemo(() => {
    if (!selectedCard || amount <= 0) return '';
    if (amount > Number(selectedCard.per_tx_limit || 50_000_000)) {
      return `Vượt hạn mức/giao dịch (${formatVnd(Number(selectedCard.per_tx_limit || 50_000_000))})`;
    }
    if (amount > Number(selectedCard.transfer_limit || selectedCard.daily_limit || 100_000_000)) {
      return `Vượt hạn mức chuyển khoản thẻ (${formatVnd(Number(selectedCard.transfer_limit || selectedCard.daily_limit || 100_000_000))})`;
    }
    const spentToday = Number(selectedCard.spent_today || 0);
    if (spentToday + totalDebit > Number(selectedCard.daily_limit || 50_000_000)) {
      return `Vượt hạn mức ngày của thẻ (còn ${formatVnd(Math.max(0, Number(selectedCard.daily_limit || 50_000_000) - spentToday))})`;
    }
    const spentMonth = Number(selectedCard.spent_month || 0);
    if (spentMonth + totalDebit > Number(selectedCard.monthly_limit || 200_000_000)) {
      return `Vượt hạn mức tháng của thẻ`;
    }
    return '';
  }, [selectedCard, amount, totalDebit]);
  const insufficientBalance = totalDebit > available || amount > available;
  const previewPoints = selectedCard ? Math.floor((amount / 100_000) * Number(selectedCard.reward_point_rate || 0)) : 0;

  const handleLookup = async (overrideAcc?: string, overrideBank?: string) => {
    const acc = (overrideAcc ?? accountNumber).trim();
    const bCode = overrideBank ?? bankCode;
    if (!acc) {
      setLookupError('Vui lòng nhập số tài khoản');
      onDraftChange((p) => ({ ...p, verifiedRecipient: null }));
      return;
    }
    setLookingUp(true);
    setLookupError('');
    try {
      const res = await osApi.banking.lookupRecipient(acc, bCode);
      onDraftChange((p) => ({
        ...p,
        verifiedRecipient: {
          valid: true,
          recipientName: res.recipientName,
          bankCode: res.bankCode,
          bankName: res.bankName || PARTNER_BANKS.find((b) => b.code === res.bankCode)?.name || res.bankCode,
          avatar: res.avatar,
          status: res.status || 'Đang hoạt động',
          isAi: res.isAi,
          characterId: res.characterId,
        },
      }));
    } catch (err) {
      onDraftChange((p) => ({ ...p, verifiedRecipient: null }));
      setLookupError(err instanceof Error ? err.message : 'Không tìm thấy tài khoản nhận');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSelectQuickTarget = (params: {
    name: string;
    account_number: string;
    bank_code: string;
    bank_name: string;
    avatar?: string;
    isAi?: boolean;
    characterId?: string;
  }) => {
    setLookupError('');
    onDraftChange((p) => ({
      ...p,
      bankCode: params.bank_code === 'PHONEBANK' ? 'HIKARI' : params.bank_code,
      accountNumber: params.account_number,
      verifiedRecipient: {
        valid: true,
        recipientName: params.name.toUpperCase(),
        bankCode: params.bank_code === 'PHONEBANK' ? 'HIKARI' : params.bank_code,
        bankName: params.bank_name,
        avatar: params.avatar,
        status: 'Đang hoạt động',
        isAi: params.isAi,
        characterId: params.characterId,
      },
      step: 2,
    }));
  };

  const handleValidateQrText = async () => {
    if (!qrInput.trim()) return;
    try {
      const res = await osApi.banking.validateQr(qrInput.trim());
      onDraftChange((p) => ({
        ...p,
        bankCode: res.bankCode,
        accountNumber: res.accountNumber,
        verifiedRecipient: {
          valid: true,
          recipientName: res.recipientName,
          bankCode: res.bankCode,
          bankName: res.bankName,
          status: 'Đang hoạt động',
        },
        rawDigits: res.amount > 0 ? String(res.amount) : p.rawDigits,
        note: res.note || p.note,
        step: 2,
      }));
      onShowToast('Quét QR thành công', `${res.recipientName} · ${res.accountNumber}`, 'success');
    } catch (err) {
      onShowToast('Mã QR không hợp lệ', err instanceof Error ? err.message : 'Vui lòng kiểm tra mã', 'error');
    }
  };

  const pushKey = (key: string) => {
    onDraftChange((p) => {
      const prev = p.rawDigits;
      let next = prev;
      if (key === 'C') next = '';
      else if (key === 'BACK') next = prev.slice(0, -1);
      else if (key === '000') {
        if (!prev) next = '';
        else next = `${prev}000`.length > 13 ? prev : `${prev}000`;
      } else {
        if (prev === '0' && key === '0') next = '0';
        else {
          const candidate = prev === '0' ? key : `${prev}${key}`;
          next = candidate.length > 13 ? prev : candidate;
        }
      }
      return { ...p, rawDigits: next };
    });
  };

  const executeTransfer = async (usedAuth: 'pin' | 'biometric') => {
    if (!verifiedRecipient || !sourceAcc || submitting) return;
    if (sourceInvalid) {
      onShowToast('Nguồn thanh toán không hợp lệ', 'Vui lòng chọn thẻ hoặc tài khoản đang hoạt động.', 'error');
      return;
    }
    if (totalDebit > available || amount <= 0) {
      onShowToast(
        'Số dư không đủ',
        'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
        'error'
      );
      return;
    }
    if (sourceAcc.has_pin && usedAuth === 'pin' && pinInput.length < 4) {
      onShowToast('Thiếu mã PIN', 'Vui lòng nhập đủ mã PIN giao dịch', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await osApi.banking.transfer({
        sourceAccountId: sourceAcc.id,
        sourceCardId: selectedCard?.id,
        clientTxId,
        idempotencyKey: clientTxId,
        amount,
        counterparty: verifiedRecipient.recipientName,
        accountNumber,
        bankCode: verifiedRecipient.bankCode,
        bankName: verifiedRecipient.bankName,
        note,
        memo,
        method,
        pin: usedAuth === 'pin' ? pinInput : undefined,
        authMethod: usedAuth,
        saveBeneficiary,
        targetCharacterId: verifiedRecipient.characterId || '',
        sourceType: 'manual_transfer',
      });
      onUpdated(res);
      let pngUrl = '';
      const mergedTx: BankingTransactionDemo = {
        ...res.transaction,
        source_card_id: res.transaction?.source_card_id || selectedCard?.id,
        source_card_last4: res.transaction?.source_card_last4 || selectedCard?.last4,
      };
      if (mergedTx && isSuccessBillableTx(mergedTx)) {
        pngUrl = await renderBillToPngDataUrl(
          txToBillInput(mergedTx, sourceAcc.holder_name, sourceAcc.account_number)
        );
        if (pngUrl && mergedTx.id) {
          osApi.banking.saveBillImage(mergedTx.id, pngUrl).catch(() => {});
        }
      }
      const txWithPng: BankingTransactionDemo = { ...mergedTx, bill_image_url: pngUrl || undefined };
      setResultState({ ok: true, tx: txWithPng, pngUrl: pngUrl || undefined });
      onDraftChange((p) => ({ ...p, step: 5 }));
      onShowToast(
        'Chuyển tiền thành công',
        `-${formatVnd(amount)} tới ${verifiedRecipient.recipientName}`,
        'success',
        onOpenReceipt ? { label: 'Xem biên lai', onClick: () => onOpenReceipt(txWithPng) } : undefined
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Giao dịch thất bại';
      setClientTxId(`hktx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      onShowToast('Chuyển tiền thất bại', msg, 'error');
      setResultState({ ok: false, error: msg });
      onDraftChange((p) => ({ ...p, step: 5 }));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNewTransfer = () => {
    setPinInput('');
    setResultState(null);
    setClientTxId(`hktx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    onDraftChange(createInitialTransferDraft(defaultSource.accountId, defaultSource.cardId));
  };

  const filteredBeneficiaries = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return beneficiaries;
    return beneficiaries.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.account_number.includes(q) ||
        b.alias.toLowerCase().includes(q)
    );
  }, [beneficiaries, recipientSearch]);

  const filteredAiAccounts = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return aiAccounts;
    return aiAccounts.filter((a) => a.holder_name.toLowerCase().includes(q) || a.account_number.includes(q));
  }, [aiAccounts, recipientSearch]);

  return (
    <div className="p-3.5 space-y-3.5 pb-6">
      {/* Progress Bar Header */}
      <div className={`rounded-2xl p-3 border ${theme.cardBg}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {step > 1 && step < 5 && (
              <button
                type="button"
                onClick={() =>
                  onDraftChange((s) => ({ ...s, step: s.step > 1 ? ((s.step - 1) as 1 | 2 | 3 | 4) : s.step }))
                }
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${theme.subCardBg}`}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className={`text-sm font-extrabold truncate ${theme.textPrimary}`}>
                {step === 1
                  ? 'Bước 1 · Chọn người nhận'
                  : step === 2
                  ? 'Bước 2 · Nhập số tiền'
                  : step === 3
                  ? 'Bước 3 · Nội dung & Phương thức'
                  : step === 4
                  ? 'Bước 4 · Xác nhận chuyển tiền'
                  : 'Kết quả giao dịch'}
              </h2>
              <p className={`text-[11px] truncate ${theme.textSecondary}`}>
                Nguồn:{' '}
                {selectedCard
                  ? `${selectedCard.card_nickname || selectedCard.card_name} (•••• ${selectedCard.last4})`
                  : sourceAcc?.nickname || sourceAcc?.account_type}{' '}
                · <span className={`font-bold tabular-nums ${theme.accentClass}`}>{formatVnd(available, hideBalance)}</span>
              </p>
            </div>
          </div>
          <span className={`text-xs font-extrabold tabular-nums ${theme.accentClass}`}>{step}/5</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-1.5 rounded ${i <= step ? 'bg-[#E14B5A]' : theme.progressTrackBg}`} />
          ))}
        </div>
      </div>

      {/* STEP 1: SOURCE + RECIPIENT */}
      {step === 1 && (
        <div className="space-y-3">
          <PaymentSourceSelector
            accounts={accounts}
            cards={cards}
            selectedAccountId={sourceAcc?.id || draft.sourceId}
            selectedCardId={selectedCard?.id}
            requiredAmount={amount}
            hideBalance={hideBalance}
            theme={theme}
            label="Nguồn tiền chuyển khoản"
            onSelect={({ accountId, cardId }) =>
              onDraftChange((p) => ({ ...p, sourceId: accountId, sourceCardId: cardId }))
            }
          />

          {/* Direct Account Lookup */}
          <div className={`rounded-2xl p-3.5 border space-y-2.5 ${theme.cardBg}`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`text-[11px] font-bold block mb-1 ${theme.textSecondary}`}>Ngân hàng nhận</label>
                <select
                  value={bankCode}
                  onChange={(e) => {
                    onDraftChange((p) => ({ ...p, bankCode: e.target.value, verifiedRecipient: null }));
                  }}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`w-full min-h-[42px] px-2.5 rounded-xl border text-xs font-bold outline-none ${theme.inputClass}`}
                >
                  {PARTNER_BANKS.map((b) => (
                    <option
                      key={b.code}
                      value={b.code}
                      style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    >
                      {b.short} · {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`text-[11px] font-bold block mb-1 ${theme.textSecondary}`}>Số tài khoản</label>
                <input
                  value={accountNumber}
                  onChange={(e) => {
                    setLookupError('');
                    onDraftChange((p) => ({ ...p, accountNumber: e.target.value, verifiedRecipient: null }));
                  }}
                  placeholder="Nhập STK..."
                  className={`w-full min-h-[42px] px-2.5 rounded-xl border text-xs font-mono font-bold outline-none ${theme.inputClass}`}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleLookup()}
                disabled={lookingUp}
                className="flex-1 min-h-[44px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{lookingUp ? 'Đang kiểm tra...' : 'Kiểm tra tài khoản'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenQr}
                className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${theme.subCardBg} ${theme.accentClass}`}
              >
                <QrCode className="w-4 h-4" />
                <span>Mã QR</span>
              </button>
            </div>

            {lookupError && (
              <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-xs font-semibold ${theme.badgeDanger}`}>
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {verifiedRecipient && (
              <div className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${theme.badgeSuccess}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {verifiedRecipient.avatar ? (
                    <img src={verifiedRecipient.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold truncate">{verifiedRecipient.recipientName}</p>
                    <p className={`text-[11px] truncate ${theme.textSecondary}`}>
                      {verifiedRecipient.bankName} · {accountNumber}
                    </p>
                    <p className="text-[10px] font-semibold">
                      {verifiedRecipient.status} {verifiedRecipient.isAi ? '· Tài khoản CHAR DokiChat' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDraftChange((p) => ({ ...p, step: 2 }))}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <span>Tiếp</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Pick Tabs */}
          <div className={`rounded-2xl p-3.5 border space-y-3 ${theme.cardBg}`}>
            <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${theme.subCardBg}`}>
              {[
                { id: 'ai', label: 'Nhân vật CHAR' },
                { id: 'saved', label: 'Danh bạ' },
                { id: 'qr', label: 'Quét chuỗi QR' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRecipientFilter(t.id as 'ai' | 'saved' | 'qr')}
                  className={`min-h-[38px] rounded-lg text-[11px] font-bold ${
                    recipientFilter === t.id ? 'bg-[#E14B5A] text-white' : theme.textSecondary
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {recipientFilter !== 'qr' && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${theme.inputClass}`}>
                <Search className="w-4 h-4 opacity-50" />
                <input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc số tài khoản..."
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            )}

            {recipientFilter === 'ai' && (
              <div className="space-y-2">
                {filteredAiAccounts.map((ai) => (
                  <button
                    key={ai.id}
                    type="button"
                    onClick={() =>
                      handleSelectQuickTarget({
                        name: ai.holder_name,
                        account_number: ai.account_number,
                        bank_code: 'HIKARI',
                        bank_name: 'Hikari Bank',
                        avatar: ai.avatar,
                        isAi: true,
                        characterId: ai.character_id,
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-2 text-left ${theme.subCardBg}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={ai.avatar || AVATAR_PRESETS[1]}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate flex items-center gap-1 ${theme.textPrimary}`}>
                          <span>{ai.holder_name}</span>
                          <Bot className="w-3.5 h-3.5 text-[#E14B5A]" />
                        </p>
                        <p className={`text-[11px] font-mono ${theme.textSecondary}`}>{ai.account_number}</p>
                        <p className={`text-[10px] truncate ${theme.accentClass}`}>
                          {ai.personality_label || 'Tài khoản CHAR'} · Đồng bộ DokiChat
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${theme.accentClass}`}>Chọn</span>
                  </button>
                ))}
              </div>
            )}

            {recipientFilter === 'saved' && (
              <div className="space-y-2">
                {filteredBeneficiaries.map((b) => (
                  <div
                    key={b.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${theme.subCardBg}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectQuickTarget({
                          name: b.name,
                          account_number: b.account_number,
                          bank_code: b.bank_code,
                          bank_name: b.bank_name,
                        })
                      }
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-xs font-bold truncate ${theme.textPrimary}`}>
                        {b.name} {b.alias ? `(${b.alias})` : ''}
                      </p>
                      <p className={`text-[11px] truncate font-mono ${theme.textSecondary}`}>
                        {b.account_number} · {b.bank_name}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await osApi.banking.togglePinBeneficiary(b.id);
                          onUpdated(res);
                        }}
                        className={`p-2 rounded-lg ${b.is_favorite ? 'text-amber-500 bg-amber-500/10' : 'opacity-50'}`}
                        title="Ghim người nhận"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await osApi.banking.deleteBeneficiary(b.id);
                          onUpdated(res);
                        }}
                        className="p-2 rounded-lg opacity-50 hover:text-rose-500"
                        title="Xóa người nhận"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recipientFilter === 'qr' && (
              <div className="space-y-2">
                <p className={`text-[11px] ${theme.textSecondary}`}>
                  Dán chuỗi mã QR Hikari Bank (hỗ trợ cả <code className="font-mono">HIKARI_OS|...</code> và{' '}
                  <code className="font-mono">PHONEBANK|...</code>)
                </p>
                <textarea
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  rows={2}
                  placeholder="HIKARI_OS|8800-2026-7712|YUKI SHIRAKAWA|500000|Cà phê"
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono outline-none ${theme.inputClass}`}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQrInput('HIKARI_OS|8800-2026-7712|YUKI SHIRAKAWA|250000|Mời cà phê matcha')}
                    className={`min-h-[42px] px-3 rounded-xl border text-xs font-bold ${theme.chipInactive}`}
                  >
                    Mẫu QR Yuki
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleValidateQrText()}
                    className="flex-1 min-h-[42px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                  >
                    Xác thực & Chuyển tiền
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: NUMERIC KEYPAD & LIVE SOURCE SWITCHER */}
      {step === 2 && verifiedRecipient && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-3 border flex items-center justify-between gap-2 ${theme.cardBg}`}>
            <div className="min-w-0">
              <p className={`text-[10px] font-bold uppercase ${theme.textSecondary}`}>Chuyển tới</p>
              <p className={`text-xs font-extrabold truncate ${theme.textPrimary}`}>{verifiedRecipient.recipientName}</p>
              <p className={`text-[11px] font-mono ${theme.textSecondary}`}>
                {accountNumber} · {verifiedRecipient.bankName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDraftChange((p) => ({ ...p, step: 1 }))}
              className={`min-h-[38px] px-3 rounded-xl border text-[11px] font-bold ${theme.subCardBg} ${theme.accentClass}`}
            >
              Đổi người
            </button>
          </div>

          <PaymentSourceSelector
            accounts={accounts}
            cards={cards}
            selectedAccountId={sourceAcc?.id || draft.sourceId}
            selectedCardId={selectedCard?.id}
            requiredAmount={amount}
            hideBalance={hideBalance}
            theme={theme}
            label="Thẻ / Tài khoản nguồn"
            onSelect={({ accountId, cardId }) =>
              onDraftChange((p) => ({ ...p, sourceId: accountId, sourceCardId: cardId }))
            }
          />

          <div className={`bg-gradient-to-br ${theme.heroGradient} text-white rounded-2xl p-4 text-center shadow-lg`}>
            <p className="text-[11px] text-rose-100 font-semibold uppercase tracking-wider">Số tiền cần chuyển</p>
            <p className="text-3xl font-black tracking-tight tabular-nums mt-1.5 break-all">
              {amount === 0 ? '0 VNĐ' : formatVnd(amount)}
            </p>
            {amount > available ? (
              <p className="text-[11px] text-amber-200 font-bold mt-1.5 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Số dư không đủ ({formatVnd(available, hideBalance)}). Chọn nguồn khác hoặc giảm số tiền.
              </p>
            ) : amount > dailyLimit ? (
              <p className="text-[11px] text-amber-200 font-bold mt-1.5">
                Vượt hạn mức ngày ({formatVnd(dailyLimit, hideBalance)})
              </p>
            ) : (
              <p className="text-[11px] text-rose-100/85 mt-1.5">
                Khả dụng: <span className="font-bold text-white tabular-nums">{formatVnd(available, hideBalance)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {TRANSFER_SUGGESTED_AMOUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onDraftChange((p) => ({ ...p, rawDigits: String(preset) }))}
                className={`min-h-[42px] rounded-xl text-xs font-extrabold tabular-nums border transition-colors ${
                  amount === preset
                    ? 'bg-[#E14B5A] text-white border-[#E14B5A]'
                    : `${theme.cardBg} ${theme.textPrimary}`
                }`}
              >
                {preset.toLocaleString('de-DE')}đ
              </button>
            ))}
          </div>

          <div className={`rounded-2xl p-2.5 border shadow-sm space-y-2 ${theme.cardBg}`}>
            <div className="flex items-center justify-between px-1">
              <span className={`text-[11px] font-semibold ${theme.textSecondary}`}>Bàn phím số bảo mật Hikari</span>
              <button
                type="button"
                onClick={() => pushKey('C')}
                className={`text-[11px] font-extrabold px-2 py-1 rounded-lg border ${theme.badgeDanger}`}
              >
                Xóa toàn bộ
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'BACK'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pushKey(k)}
                  className={`h-12 rounded-xl border active:scale-[0.98] text-base font-extrabold flex items-center justify-center tabular-nums transition-transform ${theme.subCardBg}`}
                >
                  {k === 'BACK' ? <Delete className="w-5 h-5" /> : k}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={amount < 1000 || amount > available || sourceInvalid}
              onClick={() => {
                if (amount < 1000) {
                  onShowToast('Số tiền chưa hợp lệ', 'Số tiền chuyển tối thiểu là 1.000 VNĐ', 'error');
                  return;
                }
                if (amount > available) {
                  onShowToast(
                    'Số dư không đủ',
                    'Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.',
                    'error'
                  );
                  return;
                }
                onDraftChange((p) => ({ ...p, step: 3 }));
              }}
              className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-sm font-extrabold flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
            >
              <span>Tiếp tục · {amount > 0 ? formatVnd(amount) : 'Nhập số tiền'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CONTENT & METHOD */}
      {step === 3 && verifiedRecipient && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-3.5 border space-y-3 ${theme.cardBg}`}>
            <div>
              <label className={`text-xs font-bold block mb-1.5 ${theme.textPrimary}`}>Nội dung chuyển khoản</label>
              <input
                value={note}
                onChange={(e) => onDraftChange((p) => ({ ...p, note: e.target.value }))}
                maxLength={120}
                placeholder="Nhập nội dung chuyển khoản..."
                className={`w-full min-h-[42px] px-3 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TRANSFER_NOTE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onDraftChange((p) => ({ ...p, note: preset }))}
                    className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold border ${
                      note === preset ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : theme.chipInactive
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1 ${theme.textPrimary}`}>Ghi chú cá nhân (tùy chọn)</label>
              <input
                value={memo}
                onChange={(e) => onDraftChange((p) => ({ ...p, memo: e.target.value }))}
                placeholder="Ví dụ: Tiền chia nhóm tối thứ 6"
                className={`w-full min-h-[40px] px-3 rounded-xl border text-xs outline-none ${theme.inputClass}`}
              />
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${theme.textPrimary}`}>Phương thức chuyển tiền</label>
              <div className="space-y-1.5">
                {TRANSFER_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onDraftChange((p) => ({ ...p, method: m.label }))}
                    className={`w-full min-h-[44px] p-2.5 rounded-xl border text-left flex items-center justify-between ${
                      method === m.label ? `border-[#E14B5A] ${theme.accentBgSoft}` : `${theme.subCardBg} ${theme.textPrimary}`
                    }`}
                  >
                    <span className="text-xs font-bold">{m.label}</span>
                    <span className="text-[11px] font-semibold whitespace-nowrap">{m.speed}</span>
                  </button>
                ))}
              </div>
            </div>

            {(insufficientBalance || cardLimitError) && (
              <div className={`rounded-xl border p-2.5 text-xs flex items-center gap-2 ${theme.badgeDanger}`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {cardLimitError
                    ? cardLimitError
                    : `Tổng tiền (${formatVnd(totalDebit)}) vượt quá số dư khả dụng (${formatVnd(available, hideBalance)}).`}
                </span>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold pt-1">
              <input
                type="checkbox"
                checked={saveBeneficiary}
                onChange={(e) => onDraftChange((p) => ({ ...p, saveBeneficiary: e.target.checked }))}
                className="w-4 h-4 accent-[#E14B5A]"
              />
              <span className={theme.textPrimary}>Lưu người nhận vào danh bạ thụ hưởng</span>
            </label>
          </div>

          <button
            type="button"
            disabled={insufficientBalance || sourceInvalid || Boolean(cardLimitError)}
            onClick={() => onDraftChange((p) => ({ ...p, step: 4 }))}
            className="w-full min-h-[46px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>Kiểm tra & Xác nhận</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 4: EXPLICIT CONFIRMATION WITH CARD/ACCOUNT SOURCE + BALANCE BEFORE/AFTER */}
      {step === 4 && verifiedRecipient && sourceAcc && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-4 border space-y-3 ${theme.cardBg}`}>
            <div className={`text-center pb-3 border-b ${theme.border}`}>
              <p className={`text-[11px] font-semibold ${theme.textSecondary}`}>XÁC NHẬN CHUYỂN KHOẢN HIKARI</p>
              <p className={`text-2xl font-black tabular-nums mt-1 ${theme.accentClass}`}>{formatVnd(amount)}</p>
              {amount >= 50000000 && (
                <p className="text-[11px] text-amber-500 font-bold mt-1 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Cảnh báo giao dịch giá trị lớn — vui lòng kiểm tra kỹ thông tin
                </p>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {selectedCard && (
                <div className="flex justify-between gap-3">
                  <span className={theme.textSecondary}>Thẻ thanh toán</span>
                  <span className="font-bold text-right">
                    {selectedCard.card_nickname || selectedCard.card_name} · Hikari •••• {selectedCard.last4}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Tài khoản nguồn</span>
                <span className="font-bold text-right">
                  {sourceAcc.nickname || sourceAcc.account_type} · {sourceAcc.account_number}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Người nhận</span>
                <span className="font-extrabold text-right">{verifiedRecipient.recipientName}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Ngân hàng / STK</span>
                <span className="font-semibold font-mono text-right">
                  {verifiedRecipient.bankName} · {accountNumber}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Phí giao dịch</span>
                <span className={`font-bold tabular-nums ${methodFee === 0 ? 'text-emerald-500' : theme.textPrimary}`}>
                  {methodFee === 0 ? 'Miễn phí (0đ)' : formatVnd(methodFee)}
                </span>
              </div>
              {selectedCard && previewPoints > 0 && (
                <div className="flex justify-between gap-3">
                  <span className={theme.textSecondary}>Điểm thưởng dự kiến</span>
                  <span className="font-bold text-amber-500 tabular-nums text-right">
                    +{previewPoints} điểm
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Số dư trước GD</span>
                <span className="font-semibold tabular-nums">{formatVnd(available, hideBalance)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Tổng tiền trừ</span>
                <span className="font-extrabold text-rose-500 tabular-nums">-{formatVnd(totalDebit)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={theme.textSecondary}>Số dư dự kiến sau GD</span>
                <span className="font-extrabold text-emerald-500 tabular-nums">
                  {formatVnd(balanceAfterPreview, hideBalance)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className={`shrink-0 ${theme.textSecondary}`}>Nội dung</span>
                <span className="font-semibold text-right">{note}</span>
              </div>
            </div>

            {insufficientBalance && (
              <div className={`rounded-xl border p-2.5 text-xs flex items-start gap-2 ${theme.badgeDanger}`}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Số dư không đủ. Vui lòng chọn tài khoản khác hoặc giảm số tiền giao dịch.
                  </p>
                  <button
                    type="button"
                    onClick={() => onDraftChange((p) => ({ ...p, step: 2 }))}
                    className="underline font-bold mt-1"
                  >
                    Quay lại đổi thẻ hoặc sửa số tiền
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`rounded-2xl p-4 border space-y-3 ${theme.cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${theme.textPrimary}`}>
                <Lock className="w-4 h-4 text-[#E14B5A]" />
                Xác thực SmartOTP Hikari
              </span>
              {security?.biometric_enabled ? (
                <button
                  type="button"
                  onClick={() => setAuthMethod((m) => (m === 'pin' ? 'biometric' : 'pin'))}
                  className={`text-[11px] font-bold ${theme.accentClass}`}
                >
                  {authMethod === 'pin' ? 'Dùng Sinh trắc học' : 'Dùng mã PIN'}
                </button>
              ) : null}
            </div>

            {sourceAcc.has_pin && authMethod === 'pin' ? (
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập mã PIN SmartOTP (4-6 số)"
                className={`w-full px-3 py-3 rounded-xl border text-center text-base tracking-[0.4em] font-bold outline-none ${theme.inputClass}`}
              />
            ) : (
              <div className={`rounded-xl p-3 flex items-center gap-2.5 text-xs font-semibold ${theme.accentBgSoft}`}>
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>
                  {authMethod === 'biometric'
                    ? 'Sẵn sàng xác thực bằng Sinh trắc học thiết bị Phone OS'
                    : 'Xác thực một chạm sẵn sàng (có thể đặt PIN riêng trong Cài đặt)'}
                </span>
              </div>
            )}

            {authMethod === 'biometric' && security?.biometric_enabled ? (
              <button
                type="button"
                onClick={() => void executeTransfer('biometric')}
                disabled={submitting || insufficientBalance || sourceInvalid}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Fingerprint className="w-5 h-5" />
                <span>{submitting ? 'Đang xử lý...' : 'Quét vân tay / FaceID & Chuyển ngay'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void executeTransfer('pin')}
                disabled={submitting || insufficientBalance || sourceInvalid}
                className="w-full min-h-[48px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Đang xử lý giao dịch...' : 'Xác nhận chuyển tiền ngay'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 5: RESULT + REAL PNG RECEIPT */}
      {step === 5 && resultState && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-4 border text-center space-y-2 ${theme.cardBg}`}>
            {resultState.ok ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className={`text-base font-extrabold ${theme.textPrimary}`}>Giao dịch thành công</h3>
                <p className={`text-xl font-black tabular-nums ${theme.accentClass}`}>{formatVnd(amount)}</p>
                {selectedCard && (
                  <p className={`text-[11px] font-semibold ${theme.textSecondary}`}>
                    Thanh toán qua thẻ: {selectedCard.card_nickname || selectedCard.card_name} (•••• {selectedCard.last4})
                  </p>
                )}
                {verifiedRecipient?.isAi && (
                  <p className="text-[11px] font-semibold text-emerald-500 flex items-center justify-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Đã cộng tiền trực tiếp vào ví {verifiedRecipient.recipientName} & gửi thẻ giao dịch vào DokiChat!
                  </p>
                )}
              </>
            ) : (
              <>
                <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
                <h3 className="text-base font-extrabold text-rose-500">Giao dịch không thành công</h3>
                <p className={`text-xs ${theme.textSecondary}`}>{resultState.error}</p>
              </>
            )}
          </div>

          {resultState.ok && resultState.pngUrl && resultState.tx && (
            <div className={`rounded-2xl p-3 border space-y-3 ${theme.cardBg}`}>
              <div>
                <img
                  src={resultState.pngUrl}
                  alt="Biên lai PNG"
                  onClick={() => onOpenReceipt?.(resultState.tx!)}
                  className="w-full max-w-[340px] mx-auto rounded-2xl shadow-md cursor-pointer"
                />
                {onOpenReceipt && (
                  <button
                    type="button"
                    onClick={() => onOpenReceipt(resultState.tx!)}
                    className={`mt-2 mx-auto min-h-[38px] px-3.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 ${theme.subCardBg} ${theme.accentClass}`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Chi tiết & Toàn màn hình</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={savingToPhotos}
                  onClick={async () => {
                    setSavingToPhotos(true);
                    try {
                      const refCode = resultState.tx!.ref_code || resultState.tx!.id;
                      await osApi.createMedia({
                        type: 'photo',
                        title: `Biên lai ${refCode}`,
                        data_url: resultState.pngUrl!,
                        album: 'Biên lai Hikari Bank',
                        category: 'bill',
                        caption: `${verifiedRecipient?.recipientName || resultState.tx!.counterparty} · ${formatVnd(amount)}`,
                      });
                      onSavedToPhotos?.();
                      onShowToast('Đã lưu ảnh bill', 'Biên lai đã được lưu vào Thư viện Ảnh.', 'success');
                    } catch (err) {
                      onShowToast('Lỗi lưu ảnh', err instanceof Error ? err.message : 'Không thể lưu', 'error');
                    } finally {
                      setSavingToPhotos(false);
                    }
                  }}
                  className="min-h-[44px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>{savingToPhotos ? 'Đang lưu...' : 'Lưu ảnh bill'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onShare({
                      title: `Biên lai ${resultState.tx!.ref_code}`,
                      text: `Đã chuyển ${formatVnd(amount)} tới ${verifiedRecipient?.recipientName}`,
                      mediaUrl: resultState.pngUrl,
                      mediaType: 'photo',
                      sourceApp: 'Hikari Bank',
                      extra: {
                        isBill: true,
                        txId: resultState.tx!.id,
                        refCode: resultState.tx!.ref_code,
                        amount,
                      },
                    })
                  }
                  className="min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Chia sẻ / Chat</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadDataUrlAsPng(
                      resultState.pngUrl!,
                      `HikariBank_${resultState.tx!.ref_code || resultState.tx!.id}.png`
                    );
                    onShowToast('Đã tải PNG', 'Biên lai đã được tải về thiết bị', 'success');
                  }}
                  className={`min-h-[40px] rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 ${theme.subCardBg}`}
                >
                  <Download className="w-3.5 h-3.5 text-[#E14B5A]" />
                  <span>Tải xuống</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const code = resultState.tx!.ref_code || resultState.tx!.id;
                    navigator.clipboard?.writeText(code).catch(() => {});
                    setCopiedRef(true);
                    onShowToast('Đã sao chép', `Mã giao dịch ${code}`, 'info');
                    setTimeout(() => setCopiedRef(false), 1800);
                  }}
                  className={`min-h-[40px] rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 ${theme.subCardBg}`}
                >
                  {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedRef ? 'Đã chép' : 'Chép mã'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const refCode = resultState.tx!.ref_code || resultState.tx!.id;
                    const outcome = await sharePngViaNativeSystem(
                      resultState.pngUrl!,
                      `HikariBank_${refCode}.png`,
                      `Biên lai ${refCode}`,
                      `Đã chuyển ${formatVnd(amount)} tới ${verifiedRecipient?.recipientName}`
                    );
                    if (outcome === 'unsupported') {
                      onShare({
                        title: `Biên lai ${refCode}`,
                        text: `Đã chuyển ${formatVnd(amount)} tới ${verifiedRecipient?.recipientName}`,
                        mediaUrl: resultState.pngUrl,
                        mediaType: 'photo',
                        sourceApp: 'Hikari Bank',
                        extra: { isBill: true, txId: resultState.tx!.id, refCode, amount },
                      });
                    }
                  }}
                  className={`min-h-[40px] rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 ${theme.subCardBg}`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>App khác</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className={`min-h-[46px] rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 ${theme.cardBg}`}
              >
                <History className="w-4 h-4 text-[#E14B5A]" />
                <span>Lịch sử giao dịch</span>
              </button>
            )}
            <button
              type="button"
              onClick={resetForNewTransfer}
              className={`${onOpenHistory ? '' : 'col-span-2'} min-h-[46px] rounded-xl bg-[#E14B5A] text-white text-xs font-extrabold`}
            >
              Giao dịch mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
