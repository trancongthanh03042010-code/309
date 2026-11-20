import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileImage,
  Filter,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type { BankingAccountDemo, BankingTransactionDemo, BillTemplateType, SharePayload } from '../../types/os';
import { downloadDataUrlAsPng, renderBillToPngDataUrl, txToBillInput } from './billRenderer';
import { getThemePalette, type HikariThemePalette } from './HikariBrand';
import {
  BILL_TEMPLATE_LABELS,
  formatTimeAgoOrDate,
  formatVnd,
  inferBillTemplate,
  isSuccessBillableTx,
  sharePngViaNativeSystem,
} from './utils';

interface BillPreviewModalProps {
  tx: BankingTransactionDemo | null;
  account: BankingAccountDemo | null;
  theme?: HikariThemePalette;
  onClose: () => void;
  onShare: (payload: SharePayload) => void;
  onToast: (
    title: string,
    msg: string,
    type?: 'info' | 'success' | 'error',
    action?: { label: string; onClick: () => void }
  ) => void;
  onSavedToPhotos?: () => void;
  onOpenHistory?: () => void;
}

const ZOOM_STEPS = [1, 1.25, 1.6, 2] as const;

export function BillPreviewModal({
  tx,
  account,
  theme = getThemePalette('coral'),
  onClose,
  onShare,
  onToast,
  onSavedToPhotos,
  onOpenHistory,
}: BillPreviewModalProps) {
  const [pngUrl, setPngUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    signatureVerified: boolean;
    status: string;
    refCode: string;
  } | null>(null);

  const billable = isSuccessBillableTx(tx);

  useEffect(() => {
    let active = true;
    setZoomIdx(0);
    setFullscreen(false);
    setVerifyResult(null);

    if (!tx || !isSuccessBillableTx(tx)) {
      setPngUrl('');
      setLoading(false);
      return;
    }

    if (tx.bill_image_url && tx.bill_image_url.startsWith('data:image/png')) {
      setPngUrl(tx.bill_image_url);
      setLoading(false);
      return;
    }

    setLoading(true);
    const input = txToBillInput(
      tx,
      account?.holder_name || 'Minh Anh',
      account?.account_number || '8800-2026-9901'
    );
    renderBillToPngDataUrl(input)
      .then((url) => {
        if (!active) return;
        setPngUrl(url);
        if (url && tx.id) {
          osApi.banking.saveBillImage(tx.id, url).catch(() => {});
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tx, account?.holder_name, account?.account_number]);

  if (!tx) return null;
  const refCode = tx.ref_code || tx.id.toUpperCase();
  const zoomScale = ZOOM_STEPS[zoomIdx] || 1;
  const billFilename = `HikariBank_BienLai_${refCode}.png`;

  const handleSaveToPhotos = async () => {
    if (!pngUrl || savingPhotos || !billable) return;
    setSavingPhotos(true);
    try {
      await osApi.createMedia({
        type: 'photo',
        title: `Biên lai Hikari ${refCode}`,
        data_url: pngUrl,
        album: 'Biên lai Hikari Bank',
        category: 'bill',
        caption: `${tx.counterparty} · ${formatVnd(tx.amount)} · ${tx.note || 'Chuyển khoản'}`,
      });
      onSavedToPhotos?.();
      onToast('Đã lưu ảnh bill', 'Biên lai PNG đã được lưu vào Thư viện Ảnh (Biên lai Hikari Bank).', 'success');
    } catch (err) {
      onToast('Không thể lưu ảnh', err instanceof Error ? err.message : 'Lỗi lưu vào Ảnh', 'error');
    } finally {
      setSavingPhotos(false);
    }
  };

  const handleVerifyTransaction = async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      const res = await osApi.banking.verifyTx(refCode);
      setVerifyResult({
        valid: res.valid,
        signatureVerified: res.signatureVerified,
        status: res.transaction.status,
        refCode: res.transaction.ref_code || refCode,
      });
      onToast(
        res.valid ? 'Giao dịch hợp lệ (Mô phỏng)' : 'Chưa xác thực',
        `Mã ${res.transaction.ref_code || refCode} · Trạng thái: ${res.transaction.status}`,
        res.valid ? 'success' : 'error'
      );
    } catch (err) {
      onToast('Không tìm thấy giao dịch', err instanceof Error ? err.message : 'Lỗi kiểm tra mã GD', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleNativeShare = async () => {
    if (!pngUrl || !billable) return;
    const outcome = await sharePngViaNativeSystem(
      pngUrl,
      billFilename,
      `Biên lai mô phỏng Hikari Bank ${refCode}`,
      `${tx.counterparty} · ${formatVnd(tx.amount)} · ${tx.note}`
    );
    if (outcome === 'shared') {
      onToast('Đã chia sẻ', 'Đã mở bảng chia sẻ hệ thống Android/Thiết bị.', 'success');
    } else if (outcome === 'unsupported') {
      onShare({
        title: `Biên lai ${refCode} (${formatVnd(tx.amount)})`,
        text: `${tx.counterparty} · ${formatVnd(tx.amount)} · ${tx.note}`,
        mediaUrl: pngUrl,
        mediaType: 'photo',
        sourceApp: 'Hikari Bank',
        extra: { isBill: true, txId: tx.id, refCode, amount: tx.amount },
      });
    }
  };

  const cycleZoom = () => setZoomIdx((i) => (i + 1) % ZOOM_STEPS.length);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-md max-h-[94vh] rounded-3xl overflow-hidden flex flex-col border shadow-2xl ${theme.cardBg} ${theme.textPrimary}`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#1E293B] via-[#9F1D35] to-[#E14B5A] text-white flex items-center justify-between shrink-0 gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold truncate">Biên lai Hikari Bank</h3>
                <span className="text-[10px] font-bold text-amber-200 shrink-0">· MÔ PHỎNG</span>
              </div>
              <p className="text-[11px] text-rose-100 font-mono tabular-nums truncate">Mã GD: {refCode}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                disabled={zoomIdx === 0 || !billable}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 flex items-center justify-center"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={cycleZoom}
                disabled={!billable}
                className="px-2 h-8 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-[10px] font-bold tabular-nums"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                disabled={zoomIdx === ZOOM_STEPS.length - 1 || !billable}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 flex items-center justify-center"
                title="Phóng to"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                disabled={!billable}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 flex items-center justify-center"
                title="Xem toàn màn hình"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live verification banner */}
          {verifyResult && (
            <div
              className={`px-4 py-2 text-[11px] flex items-center justify-between gap-2 shrink-0 border-b ${
                verifyResult.valid ? theme.badgeSuccess : theme.badgeDanger
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold truncate">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Hệ thống xác nhận: <strong>{verifyResult.status}</strong> ·{' '}
                  {verifyResult.signatureVerified ? 'Chữ ký số khớp' : 'Biên lai mô phỏng hợp lệ'}
                </span>
              </span>
              <span className="font-mono text-[10px] shrink-0">{verifyResult.refCode}</span>
            </div>
          )}

          {/* Preview Body or Strict Non-Billable Guard */}
          <div className={`flex-1 overflow-auto p-3 flex justify-center items-start ${theme.isDark ? 'bg-[#0D1018]' : 'bg-slate-100'}`}>
            {!billable ? (
              <div className={`my-8 max-w-xs rounded-2xl border p-5 text-center space-y-2.5 ${theme.cardBg}`}>
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                <p className={`text-sm font-extrabold ${theme.textPrimary}`}>
                  Không thể xuất biên lai PNG
                </p>
                <p className={`text-xs leading-relaxed ${theme.textSecondary}`}>
                  Giao dịch đang ở trạng thái <strong>{tx.status}</strong>. Hệ thống chỉ cấp biên lai mô phỏng cho các giao dịch đã hoàn tất (Thành công).
                </p>
              </div>
            ) : loading || !pngUrl ? (
              <div className={`py-20 flex flex-col items-center gap-2 ${theme.textSecondary}`}>
                <Loader2 className="w-7 h-7 animate-spin text-[#E14B5A]" />
                <p className="text-xs font-medium">Đang kết xuất biên lai Hikari 2x PNG...</p>
              </div>
            ) : (
              <img
                src={pngUrl}
                alt={`Biên lai ${refCode}`}
                onClick={cycleZoom}
                style={{ width: zoomScale === 1 ? '100%' : `${Math.round(zoomScale * 100)}%`, maxWidth: zoomScale === 1 ? '360px' : 'none' }}
                className="rounded-2xl shadow-lg transition-all cursor-zoom-in"
              />
            )}
          </div>

          {/* Actions Grid */}
          <div className={`p-3 border-t space-y-2 shrink-0 ${theme.cardBg} ${theme.border}`}>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => void handleSaveToPhotos()}
                disabled={!pngUrl || savingPhotos || !billable}
                className="min-h-[44px] rounded-xl bg-[#E14B5A] hover:bg-[#C83242] disabled:opacity-40 text-white text-[11px] font-bold flex items-center justify-center gap-1 px-2"
              >
                <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                <span>{savingPhotos ? 'Đang lưu...' : 'Lưu ảnh bill'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!pngUrl || !billable) return;
                  downloadDataUrlAsPng(pngUrl, billFilename);
                  onToast('Đã tải xuống thiết bị', `Đã lưu ${billFilename}`, 'success');
                }}
                disabled={!pngUrl || !billable}
                className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[11px] font-bold flex items-center justify-center gap-1 px-2"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Tải PNG</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!pngUrl || !billable) return;
                  onShare({
                    title: `Biên lai ${refCode} (${formatVnd(tx.amount)})`,
                    text: `${tx.counterparty} · ${formatVnd(tx.amount)} · ${tx.note}`,
                    mediaUrl: pngUrl,
                    mediaType: 'photo',
                    sourceApp: 'Hikari Bank',
                    extra: { isBill: true, txId: tx.id, refCode, amount: tx.amount },
                  });
                }}
                disabled={!pngUrl || !billable}
                className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold flex items-center justify-center gap-1 px-2"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>Chia sẻ</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(refCode).catch(() => {});
                  setCopied(true);
                  onToast('Đã sao chép', `Mã giao dịch ${refCode}`, 'info');
                  setTimeout(() => setCopied(false), 1800);
                }}
                className={`min-h-[40px] rounded-xl border text-[10.5px] font-bold flex items-center justify-center gap-1 px-1.5 ${theme.chipInactive}`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã chép' : 'Chép mã'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleVerifyTransaction()}
                disabled={verifying}
                className={`min-h-[40px] rounded-xl border text-[10.5px] font-bold flex items-center justify-center gap-1 px-1.5 ${theme.chipInactive}`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#E14B5A]" />
                <span>{verifying ? '...' : 'Kiểm tra'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleNativeShare()}
                disabled={!pngUrl || !billable}
                className={`min-h-[40px] rounded-xl border disabled:opacity-40 text-[10.5px] font-bold flex items-center justify-center gap-1 px-1.5 ${theme.chipInactive}`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>App khác</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory?.();
                }}
                className={`min-h-[40px] rounded-xl border text-[10.5px] font-bold flex items-center justify-center gap-1 px-1.5 ${theme.chipInactive}`}
              >
                <History className="w-3.5 h-3.5 opacity-70" />
                <span>Lịch sử</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Zoom Viewer */}
      {fullscreen && pngUrl && billable && (
        <div onClick={() => setFullscreen(false)} className="fixed inset-0 z-[80] bg-black/95 flex flex-col">
          <div
            onClick={(e) => e.stopPropagation()}
            className="px-4 py-3 flex items-center justify-between text-white border-b border-white/10 shrink-0"
          >
            <span className="text-xs font-bold font-mono">{refCode} · {Math.round(zoomScale * 100)}%</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => downloadDataUrlAsPng(pngUrl, billFilename)}
                className="p-2 rounded-xl bg-[#E14B5A] hover:bg-[#C83242]"
                title="Tải xuống PNG"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
                title="Thu gọn"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex-1 overflow-auto p-4 flex items-start justify-center"
          >
            <img
              src={pngUrl}
              alt={`Biên lai toàn màn hình ${refCode}`}
              onClick={cycleZoom}
              style={{ width: zoomScale === 1 ? '100%' : `${Math.round(zoomScale * 100)}%`, maxWidth: zoomScale === 1 ? '480px' : 'none' }}
              className="rounded-2xl shadow-2xl cursor-zoom-in"
            />
          </div>
        </div>
      )}
    </>
  );
}

interface BillArchiveViewProps {
  transactions: BankingTransactionDemo[];
  account: BankingAccountDemo | null;
  theme?: HikariThemePalette;
  onSelectBillTx: (tx: BankingTransactionDemo) => void;
  onShare: (payload: SharePayload) => void;
}

export function BillArchiveView({ transactions, account, theme, onSelectBillTx, onShare }: BillArchiveViewProps) {
  const [query, setQuery] = useState('');
  const [templateFilter, setTemplateFilter] = useState<'all' | BillTemplateType>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minVal = minAmount ? Number(minAmount) : 0;
    const maxVal = maxAmount ? Number(maxAmount) : Infinity;

    return transactions.filter((tx) => {
      const tmpl = inferBillTemplate(tx);
      if (templateFilter !== 'all' && tmpl !== templateFilter) return false;
      if (tx.amount < minVal || tx.amount > maxVal) return false;
      if (dateFilter && !tx.created_at.startsWith(dateFilter)) return false;
      if (q) {
        const hay = `${tx.ref_code || ''} ${tx.counterparty} ${tx.note} ${tx.account_number || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, query, templateFilter, minAmount, maxAmount, dateFilter]);

  const getPngForTx = async (tx: BankingTransactionDemo) => {
    if (!isSuccessBillableTx(tx)) return '';
    if (tx.bill_image_url && tx.bill_image_url.startsWith('data:image/png')) {
      return tx.bill_image_url;
    }
    const png = await renderBillToPngDataUrl(
      txToBillInput(tx, account?.holder_name || 'Minh Anh', account?.account_number || '8800-2026-9901')
    );
    if (png && tx.id) {
      osApi.banking.saveBillImage(tx.id, png).catch(() => {});
    }
    return png;
  };

  const handleQuickDownload = async (tx: BankingTransactionDemo) => {
    if (!isSuccessBillableTx(tx)) return;
    setBusyId(tx.id);
    try {
      const png = await getPngForTx(tx);
      if (png) downloadDataUrlAsPng(png, `HikariBank_${tx.ref_code || tx.id}.png`);
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickShare = async (tx: BankingTransactionDemo) => {
    if (!isSuccessBillableTx(tx)) return;
    setBusyId(tx.id);
    try {
      const png = await getPngForTx(tx);
      if (!png) return;
      onShare({
        title: `Biên lai ${tx.ref_code || tx.id}`,
        text: `${tx.counterparty} · ${formatVnd(tx.amount)}`,
        mediaUrl: png,
        mediaType: 'photo',
        sourceApp: 'Hikari Bank',
        extra: { isBill: true, txId: tx.id, refCode: tx.ref_code, amount: tx.amount },
      });
    } finally {
      setBusyId(null);
    }
  };

  const resolvedTheme = theme || getThemePalette('coral');
  const cardClass = resolvedTheme.cardBg;
  const subClass = resolvedTheme.subCardBg;

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-3 border space-y-2.5 ${cardClass}`}>
        <div className="flex items-center gap-2">
          <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${subClass}`}>
            <Search className="w-4 h-4 opacity-50 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã biên lai (HK...), người nhận, nội dung..."
              className={`w-full bg-transparent text-xs outline-none ${resolvedTheme.textPrimary}`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              showFilters ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : subClass
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTemplateFilter('all')}
            className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold shrink-0 border ${
              templateFilter === 'all' ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : resolvedTheme.chipInactive
            }`}
          >
            Tất cả ({transactions.length})
          </button>
          {(Object.keys(BILL_TEMPLATE_LABELS) as BillTemplateType[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTemplateFilter(key)}
              className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold shrink-0 whitespace-nowrap border ${
                templateFilter === key ? 'bg-[#E14B5A] text-white border-[#E14B5A]' : resolvedTheme.chipInactive
              }`}
            >
              {BILL_TEMPLATE_LABELS[key]}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${resolvedTheme.border}`}>
            <div>
              <label className="text-[10px] font-semibold opacity-70 block mb-1">Ngày GD</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${subClass}`}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold opacity-70 block mb-1">Từ số tiền</label>
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
                className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none tabular-nums ${subClass}`}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold opacity-70 block mb-1">Đến số tiền</label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="Không giới hạn"
                className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none tabular-nums ${subClass}`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className={`rounded-2xl p-8 text-center border ${cardClass}`}>
            <FileImage className="w-8 h-8 opacity-40 mx-auto mb-2" />
            <p className="text-xs font-semibold opacity-70">Không tìm thấy biên lai phù hợp</p>
          </div>
        ) : (
          filtered.map((tx) => {
            const tmpl = inferBillTemplate(tx);
            const billable = isSuccessBillableTx(tx);
            return (
              <div key={tx.id} className={`rounded-2xl p-3 border flex items-center justify-between gap-2.5 ${cardClass}`}>
                <button
                  type="button"
                  onClick={() => onSelectBillTx(tx)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      !billable
                        ? 'bg-rose-500/15 text-rose-500'
                        : tx.tx_type === 'income'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[#E14B5A]/15 text-[#E14B5A]'
                    }`}
                  >
                    <FileImage className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] opacity-75">
                      <span className="font-bold text-[#E14B5A]">{BILL_TEMPLATE_LABELS[tmpl]}</span>
                      <span>·</span>
                      <span className="font-mono truncate">{tx.ref_code || tx.id}</span>
                    </div>
                    <p className="text-xs font-bold truncate mt-0.5">{tx.counterparty}</p>
                    <p className="text-[11px] opacity-70 truncate">
                      {tx.status || 'Thành công'} · {formatTimeAgoOrDate(tx.created_at)}
                    </p>
                  </div>
                </button>

                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      !billable ? 'text-rose-500' : tx.tx_type === 'income' ? 'text-emerald-500' : ''
                    }`}
                  >
                    {!billable ? tx.status || 'Lỗi' : `${tx.tx_type === 'income' ? '+' : '-'}${formatVnd(tx.amount)}`}
                  </span>
                  {billable && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickDownload(tx)}
                        disabled={busyId === tx.id}
                        className={`p-1.5 rounded-lg border hover:text-[#E14B5A] ${subClass}`}
                        title="Tải ảnh PNG"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickShare(tx)}
                        disabled={busyId === tx.id}
                        className={`p-1.5 rounded-lg border hover:text-emerald-500 ${subClass}`}
                        title="Chia sẻ biên lai"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
