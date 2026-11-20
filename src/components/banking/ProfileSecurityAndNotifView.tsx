import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  Award,
  Bell,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Fingerprint,
  Headphones,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Palette,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  User,
} from 'lucide-react';
import { osApi } from '../../services/api';
import type {
  BankingAccountDemo,
  BankingComputedStats,
  BankingNotificationItem,
  BankingOverviewPayload,
  BankingPaymentRequest,
  BankingPreferences,
  BankingSecurityState,
  BankingSupportTicket,
  BankingThemeId,
  BankingTransactionDemo,
  SharePayload,
} from '../../types/os';
import { downloadDataUrlAsPng, renderQrCardPng } from './billRenderer';
import {
  ASSISTANT_EXPRESSIONS,
  ASSISTANT_OUTFITS,
  getThemePalette,
  HIKARI_THEMES,
  HIKARI_WALLPAPERS,
  HikariLogo,
  type HikariThemePalette,
} from './HikariBrand';
import {
  AVATAR_PRESETS,
  formatShortDate,
  formatTimeAgoOrDate,
  formatVnd,
  HIKARI_AVATAR_TELLER,
  TIER_ORDER,
} from './utils';

interface ProfileSecurityViewProps {
  initialSection?: 'profile' | 'security' | 'qr' | 'support';
  account: BankingAccountDemo | null;
  accounts: BankingAccountDemo[];
  aiAccounts?: BankingAccountDemo[];
  security: BankingSecurityState | null;
  preferences?: BankingPreferences | null;
  computedStats: BankingComputedStats;
  paymentRequests: BankingPaymentRequest[];
  supportTickets: BankingSupportTicket[];
  transactions: BankingTransactionDemo[];
  userAvatar: string;
  theme?: HikariThemePalette;
  onOverviewUpdate: (payload: BankingOverviewPayload) => void;
  onOpenNotifications: () => void;
  onOpenAssistant?: () => void;
  onResetUi?: () => Promise<void>;
  onOpenTxBill: (tx: BankingTransactionDemo) => void;
  onShare: (payload: SharePayload) => void;
  onShowToast: (title: string, msg: string, type?: 'info' | 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void>;
  }) => void;
  onLockedSession: () => void;
}

const SUPPORT_FAQS = [
  {
    q: 'Chuyển tiền nội bộ & liên ngân hàng có mất phí không?',
    a: 'Hikari Bank (ひかり銀行) miễn phí 100% chuyển khoản nội bộ và chuyển nhanh 24/7. Chỉ chuyển Hỏa tốc Ưu tiên có phí 11.000đ.',
  },
  {
    q: 'Rút tiết kiệm trước hạn tính lãi như thế nào?',
    a: 'Khi tất toán trước ngày đáo hạn, tiền gốc được giữ nguyên 100% và hưởng lãi suất không kỳ hạn 0.5%/năm tính trên số ngày thực gửi.',
  },
  {
    q: 'Làm sao chuyển tiền với Nhân vật CHAR trong DokiChat?',
    a: 'Bạn có thể chọn nhanh Nhân vật CHAR từ trang chủ Hikari Bank hoặc gửi chuyển khoản/quà tặng trực tiếp trong DokiChat; hệ thống sẽ cập nhật số dư hai chiều và gửi thẻ biên lai mô phỏng vào cuộc trò chuyện.',
  },
  {
    q: 'Biên lai PNG và thẻ ảo Hikari có phải chứng từ thật không?',
    a: 'Không. Toàn bộ số dư, thẻ ảo (CVV luôn ẩn •••) và biên lai PNG đều mang dấu BIÊN LAI MÔ PHỎNG – PHONE OS chỉ dùng cho trải nghiệm trong game.',
  },
];

export function ProfileSecurityView({
  initialSection = 'profile',
  account,
  accounts,
  security,
  preferences,
  computedStats,
  paymentRequests,
  supportTickets,
  transactions,
  userAvatar,
  theme = getThemePalette('coral'),
  onOverviewUpdate,
  onOpenNotifications,
  onOpenAssistant,
  onResetUi,
  onOpenTxBill,
  onShare,
  onShowToast: showToast,
  onRequestConfirm,
  onLockedSession,
}: ProfileSecurityViewProps) {
  const [section, setSection] = useState<'profile' | 'security' | 'qr' | 'support'>(initialSection);
  const [prefBusy, setPrefBusy] = useState(false);

  // Profile fields
  const [holderName, setHolderName] = useState(account?.holder_name || 'Minh Anh');
  const [avatarUrl, setAvatarUrl] = useState(account?.avatar || userAvatar || AVATAR_PRESETS[0]);
  const [dob, setDob] = useState(security?.dob || '1999-05-18');
  const [phone, setPhone] = useState(security?.phone || '0912345678');
  const [email, setEmail] = useState(security?.email || 'minhanh@phoneos.sim');
  const [address, setAddress] = useState(security?.address || 'Quận 1, TP. Hồ Chí Minh');
  const [savingProfile, setSavingProfile] = useState(false);

  // Security fields
  const [newPin, setNewPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [dailyLimit, setDailyLimit] = useState(String(account?.daily_limit || 50000000));
  const [monthlyLimit, setMonthlyLimit] = useState(String(account?.monthly_limit || 300000000));
  const [secBusy, setSecBusy] = useState(false);

  // QR & Payment request state
  const [qrAmount, setQrAmount] = useState('');
  const [qrNote, setQrNote] = useState('Chuyen tien qua Hikari Bank Sim-QR');
  const [reqAmount, setReqAmount] = useState('500000');
  const [reqNote, setReqNote] = useState('Thanh toán qua liên kết QR Hikari');
  const [simSender, setSimSender] = useState('Yuki Shirakawa');
  const [simAmount, setSimAmount] = useState('500000');
  const [qrBusy, setQrBusy] = useState(false);
  const [copiedQrPayload, setCopiedQrPayload] = useState(false);

  // Support AI & Tickets state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: 'Xin chào! Mình là Hikari-chan — Giao dịch viên hỗ trợ của Hikari Bank (ひかり銀行). Bạn cần tra cứu giao dịch, tư vấn tiết kiệm hay kiểm tra hóa đơn mô phỏng?',
    },
  ]);
  const [aiBusy, setAiBusy] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [ticketCat, setTicketCat] = useState('Tra soát giao dịch');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketTxRef, setTicketTxRef] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (account) {
      setHolderName(account.holder_name || 'Minh Anh');
      setAvatarUrl(account.avatar || userAvatar || AVATAR_PRESETS[0]);
      setDailyLimit(String(account.daily_limit || 50000000));
      setMonthlyLimit(String(account.monthly_limit || 300000000));
    }
  }, [account, userAvatar]);

  useEffect(() => {
    if (security) {
      if (security.dob) setDob(security.dob);
      if (security.phone) setPhone(security.phone);
      if (security.email) setEmail(security.email);
      if (security.address) setAddress(security.address);
    }
  }, [security]);

  const devices = useMemo(() => {
    try {
      return JSON.parse(security?.devices_json || '[]') as Array<{
        id: string;
        name: string;
        platform: string;
        lastActive: string;
        isCurrent?: boolean;
      }>;
    } catch {
      return [];
    }
  }, [security?.devices_json]);

  const loginLogs = useMemo(() => {
    try {
      return JSON.parse(security?.login_logs_json || '[]') as Array<{
        id: string;
        method: string;
        device: string;
        time: string;
        status: string;
      }>;
    } catch {
      return [];
    }
  }, [security?.login_logs_json]);

  const qrPayload = useMemo(() => {
    const amt = Number(qrAmount) > 0 ? Math.round(Number(qrAmount)) : 0;
    return `HIKARI_OS|${account?.account_number || '8800-2026-9901'}|${account?.holder_name || 'Minh Anh'}|${amt}|${qrNote.trim()}`;
  }, [account?.account_number, account?.holder_name, qrAmount, qrNote]);

  const qrCardPng = useMemo(() => {
    return renderQrCardPng({
      accountNumber: account?.account_number || '8800-2026-9901',
      holderName: account?.holder_name || 'Minh Anh',
      amount: Number(qrAmount) > 0 ? Math.round(Number(qrAmount)) : undefined,
      note: qrNote.trim() || undefined,
      qrPayload,
    });
  }, [account?.account_number, account?.holder_name, qrAmount, qrNote, qrPayload]);

  const handleUpdatePreference = async (patch: Partial<BankingPreferences>) => {
    setPrefBusy(true);
    try {
      const res = await osApi.banking.updatePreferences(patch);
      onOverviewUpdate(res);
      showToast('Đã cập nhật tùy chọn', 'Giao diện và cài đặt Hikari Bank đã được lưu.', 'success');
    } catch (err) {
      showToast('Không thể cập nhật', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setPrefBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await osApi.banking.updateProfile({
        holder_name: holderName.trim() || 'Minh Anh',
        avatar: avatarUrl,
        dob,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
      });
      onOverviewUpdate(res);
      showToast('Đã cập nhật hồ sơ', 'Thông tin khách hàng Hikari Bank đã được lưu.', 'success');
    } catch (err) {
      showToast('Lỗi cập nhật', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleSecSetting = async (patch: Parameters<typeof osApi.banking.updateSecuritySettings>[0]) => {
    setSecBusy(true);
    try {
      const res = await osApi.banking.updateSecuritySettings(patch);
      onOverviewUpdate(res);
      showToast('Đã lưu cài đặt bảo mật', 'Cấu hình bảo mật mới đã có hiệu lực.', 'success');
    } catch (err) {
      showToast('Lỗi bảo mật', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setSecBusy(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPin)) {
      showToast('PIN chưa hợp lệ', 'Mã PIN giao dịch phải gồm đúng 6 chữ số.', 'error');
      return;
    }
    setSecBusy(true);
    try {
      const res = await osApi.banking.setPin(newPin);
      onOverviewUpdate(res);
      setNewPin('');
      showToast('Đổi mã PIN thành công', 'Mã PIN xác thực mới đã được áp dụng.', 'success');
    } catch (err) {
      showToast('Không thể đổi PIN', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setSecBusy(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.trim().length < 6) {
      showToast('Mật khẩu quá ngắn', 'Mật khẩu đăng nhập cần tối thiểu 6 ký tự.', 'error');
      return;
    }
    setSecBusy(true);
    try {
      const res = await osApi.banking.changePassword(newPassword.trim());
      onOverviewUpdate(res);
      setNewPassword('');
      showToast('Đổi mật khẩu thành công', 'Mật khẩu truy cập PhoneBank đã được cập nhật.', 'success');
    } catch (err) {
      showToast('Lỗi cập nhật mật khẩu', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setSecBusy(false);
    }
  };

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = Math.max(1000000, Number(dailyLimit) || 50000000);
    const m = Math.max(d, Number(monthlyLimit) || 300000000);
    setSecBusy(true);
    try {
      const res = await osApi.banking.updateAccountLimits(d, m, account?.id);
      onOverviewUpdate(res);
      showToast('Đã cập nhật hạn mức', `Hạn mức ngày: ${formatVnd(d)}`, 'success');
    } catch (err) {
      showToast('Lỗi cập nhật hạn mức', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setSecBusy(false);
    }
  };

  const handleLockAppNow = async () => {
    setSecBusy(true);
    try {
      const res = await osApi.banking.lockApp();
      onOverviewUpdate(res);
      onLockedSession();
      showToast('Đã khóa PhoneBank', 'Phiên đăng nhập đã được khóa an toàn.', 'info');
    } catch (err) {
      showToast('Không thể khóa', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setSecBusy(false);
    }
  };

  const handleCreatePayReq = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(reqAmount) || 0);
    if (amt < 1000) {
      showToast('Số tiền chưa hợp lệ', 'Vui lòng nhập tối thiểu 1.000 VNĐ.', 'error');
      return;
    }
    setQrBusy(true);
    try {
      const res = await osApi.banking.createPaymentRequest({
        amount: amt,
        note: reqNote.trim(),
      });
      onOverviewUpdate(res);
      showToast('Đã tạo liên kết QR nhận tiền', `Liên kết nhận ${formatVnd(amt)} đã sẵn sàng.`, 'success');
    } catch (err) {
      showToast('Không thể tạo liên kết', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setQrBusy(false);
    }
  };

  const handleSimulateReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(simAmount) || 0);
    if (amt < 1000) {
      showToast('Số tiền chưa hợp lệ', 'Vui lòng nhập tối thiểu 1.000 VNĐ.', 'error');
      return;
    }
    setQrBusy(true);
    try {
      const res = await osApi.banking.receiveDemo({
        amount: amt,
        senderName: simSender.trim() || 'Chuyển khoản QR',
        note: `Nhận tiền QR · ${simSender.trim() || 'PhoneBank'}`,
        accountId: account?.id,
      });
      onOverviewUpdate(res);
      showToast('Nhận tiền thành công', `+${formatVnd(amt)} vào tài khoản.`, 'success');
      if (res.transaction) onOpenTxBill(res.transaction);
    } catch (err) {
      showToast('Lỗi nhận tiền', err instanceof Error ? err.message : 'Thất bại', 'error');
    } finally {
      setQrBusy(false);
    }
  };

  const handleAskSupportAi = async (questionText?: string) => {
    const q = (questionText ?? aiQuestion).trim();
    if (!q || aiBusy) return;
    setAiQuestion('');
    setAiMessages((prev) => [...prev, { role: 'user', text: q }]);
    setAiBusy(true);
    try {
      const res = await osApi.banking.askSupportAi(q);
      setAiMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Hiện kết nối máy chủ trợ lý AI tạm gián đoạn. Bạn có thể tạo Yêu cầu tra soát bên dưới để bộ phận CSKH xử lý ngay.',
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketDesc.trim()) {
      showToast('Thiếu thông tin', 'Vui lòng nhập tiêu đề và mô tả sự cố.', 'error');
      return;
    }
    setTicketBusy(true);
    try {
      const res = await osApi.banking.createSupportTicket({
        category: ticketCat,
        subject: ticketSubject.trim(),
        description: ticketDesc.trim(),
        tx_ref: ticketTxRef || undefined,
      });
      onOverviewUpdate(res);
      setTicketSubject('');
      setTicketDesc('');
      setTicketTxRef('');
      showToast('Đã gửi yêu cầu hỗ trợ', 'Ticket tra soát đã được tiếp nhận.', 'success');
    } catch (err) {
      showToast('Không thể gửi yêu cầu', err instanceof Error ? err.message : 'Lỗi', 'error');
    } finally {
      setTicketBusy(false);
    }
  };

  const handleResetDemo = () => {
    onRequestConfirm({
      title: 'Khôi phục dữ liệu mô phỏng',
      message: 'Khôi phục số dư, giao dịch mẫu, hóa đơn và cài đặt Hikari Bank về trạng thái ban đầu?',
      destructive: true,
      onConfirm: async () => {
        const res = await osApi.banking.resetDemo();
        onOverviewUpdate(res);
        showToast('Đã khôi phục', 'Dữ liệu Hikari Bank 3.0 đã được làm mới.', 'success');
      },
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tabs */}
      <div className="px-3.5 pt-3 pb-2 shrink-0">
        <div className={`grid grid-cols-4 gap-1 p-1 rounded-2xl border ${theme.cardBg}`}>
          {[
            { id: 'profile' as const, label: 'Hồ sơ', icon: User },
            { id: 'security' as const, label: 'Bảo mật', icon: ShieldCheck },
            { id: 'qr' as const, label: 'QR & Thu', icon: QrCode },
            { id: 'support' as const, label: 'Hikari AI', icon: Headphones },
          ].map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-h-[42px] px-1 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
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
        {section === 'profile' && (
          <>
            {/* Customer Hero + 6-Tier Membership */}
            <div className={`rounded-3xl p-4 bg-gradient-to-br ${theme.heroGradient} text-white shadow-lg space-y-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={avatarUrl}
                    alt={holderName}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-white/30 shrink-0"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold truncate">{account?.holder_name || holderName}</h3>
                    <p className="text-[11px] text-rose-100 font-semibold">
                      Mã KH: <span className="font-mono">{preferences?.customer_code || 'HK-CID-202601'}</span> ·{' '}
                      {security?.kyc_status === 'verified' ? 'eKYC Đã xác thực' : 'Chờ xác thực'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenNotifications}
                  className="min-h-[38px] px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Thông báo</span>
                </button>
              </div>

              <div className="rounded-2xl bg-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-amber-300">
                    <Award className="w-4 h-4" />
                    Hạng hội viên: {computedStats.tierName}
                  </span>
                  <span className="font-bold tabular-nums text-sky-200">
                    {(security?.reward_points || 0).toLocaleString('de-DE')} điểm
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-300 to-amber-300 transition-all"
                    style={{ width: `${computedStats.tierProgressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/75">
                  <span>Tiến độ lên {computedStats.nextTier}</span>
                  <span className="tabular-nums">
                    {formatVnd(computedStats.totalAssets)} / {formatVnd(computedStats.nextThreshold)}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1 pt-1">
                  {TIER_ORDER.map((t) => (
                    <div
                      key={t}
                      className={`text-center py-1 rounded text-[9px] font-bold truncate px-0.5 ${
                        t === computedStats.tierName
                          ? 'bg-white text-[#101D3A]'
                          : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {t.replace(' Banking', '')}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-white/70 text-[10px]">Số tài khoản</p>
                  <p className="font-bold tabular-nums">{accounts.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-white/70 text-[10px]">Ngày tham gia</p>
                  <p className="font-bold tabular-nums">{formatShortDate(account?.opened_at || '')}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-white/70 text-[10px]">Tổng tài sản</p>
                  <p className="font-bold tabular-nums">{Math.round(computedStats.totalAssets / 1000000)}tr</p>
                </div>
              </div>
            </div>

            {/* Editable Profile Form */}
            <form
              onSubmit={handleSaveProfile}
              className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}
            >
              <h4 className={`text-xs font-bold ${theme.textPrimary}`}>Thông tin cá nhân & Liên hệ</h4>

              <div className="flex items-center gap-2">
                {AVATAR_PRESETS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setAvatarUrl(av)}
                    className={`w-10 h-10 rounded-full overflow-hidden border-2 ${
                      avatarUrl === av ? 'border-[#E14B5A]' : 'border-transparent opacity-70'
                    }`}
                  >
                    <img src={av} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Họ và tên</label>
                  <input
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Ngày sinh</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none tabular-nums ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Số điện thoại</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none tabular-nums ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none ${theme.inputClass}`}
                  />
                </div>
                <div className="col-span-2">
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>Địa chỉ liên hệ</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none ${theme.inputClass}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[44px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                >
                  {savingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}
                </button>
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${theme.subCardBg}`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Đặt lại dữ liệu mẫu</span>
                </button>
              </div>
            </form>

            {/* Hikari Bank Theme, Wallpaper & Assistant Personalization */}
            <div className={`rounded-2xl border p-4 space-y-3.5 ${theme.cardBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HikariLogo variant="coral" size={30} />
                  <div>
                    <h4 className="text-xs font-extrabold">Giao diện & Cá nhân hóa Hikari Bank</h4>
                    <p className={`text-[11px] ${theme.textSecondary}`}>
                      Phiên bản Hikari Bank 3.0 · ひかり銀行 · Your Life, Your Journey.
                    </p>
                  </div>
                </div>
                {onOpenAssistant && (
                  <button
                    type="button"
                    onClick={onOpenAssistant}
                    className="min-h-[36px] px-2.5 rounded-xl bg-[#E14B5A]/12 text-[#E14B5A] text-[11px] font-bold shrink-0"
                  >
                    Hikari-chan
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <p className={`text-[11px] font-bold flex items-center gap-1.5 ${theme.textSecondary}`}>
                  <Palette className="w-3.5 h-3.5 text-[#E14B5A]" /> Bảng màu chủ đạo
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(HIKARI_THEMES) as BankingThemeId[]).map((tid) => {
                    const tItem = HIKARI_THEMES[tid];
                    const active = (preferences?.theme_id || 'coral') === tid;
                    return (
                      <button
                        key={tid}
                        type="button"
                        disabled={prefBusy}
                        onClick={() => void handleUpdatePreference({ theme_id: tid })}
                        className={`min-h-[44px] p-2.5 rounded-xl border text-left flex items-center gap-2.5 ${
                          active ? 'border-[#E14B5A] bg-[#E14B5A]/10 ring-1 ring-[#E14B5A]' : theme.subCardBg
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg bg-gradient-to-br ${tItem.heroGradient} shrink-0`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{tItem.name}</p>
                          <p className={`text-[10px] truncate ${theme.textSecondary}`}>{tItem.jpLabel}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className={`text-[11px] font-bold ${theme.textSecondary}`}>Hình nền thẻ đầu trang</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {HIKARI_WALLPAPERS.map((wp) => {
                    const active = (preferences?.dashboard_wallpaper || 'skyline') === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        disabled={prefBusy}
                        onClick={() => void handleUpdatePreference({ dashboard_wallpaper: wp.id })}
                        className={`p-2 rounded-xl border text-center space-y-1 ${
                          active ? 'border-[#E14B5A] bg-[#E14B5A]/10' : theme.subCardBg
                        }`}
                      >
                        <div className={`h-6 rounded-md bg-gradient-to-r ${wp.previewClass}`} />
                        <p className="text-[10px] font-semibold truncate">{wp.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>
                    Trang phục Hikari-chan
                  </label>
                  <select
                    value={preferences?.assistant_outfit || 'teller_classic'}
                    disabled={prefBusy}
                    onChange={(e) => void handleUpdatePreference({ assistant_outfit: e.target.value })}
                    style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    className={`w-full min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                  >
                    {ASSISTANT_OUTFITS.map((o) => (
                      <option
                        key={o.id}
                        value={o.id}
                        style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                      >
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${theme.textSecondary}`}>
                    Biểu cảm giao tiếp
                  </label>
                  <select
                    value={preferences?.assistant_expression || 'cheerful'}
                    disabled={prefBusy}
                    onChange={(e) => void handleUpdatePreference({ assistant_expression: e.target.value })}
                    style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    className={`w-full min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold outline-none ${theme.inputClass}`}
                  >
                    {ASSISTANT_EXPRESSIONS.map((ex) => (
                      <option
                        key={ex.id}
                        value={ex.id}
                        style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                      >
                        {ex.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={`grid grid-cols-1 gap-2 pt-2 border-t ${theme.border}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-[#E14B5A]" />
                    Tự khóa sau khi không thao tác
                  </span>
                  <select
                    value={String(preferences?.inactivity_lock_sec ?? 180)}
                    disabled={prefBusy}
                    onChange={(e) => void handleUpdatePreference({ inactivity_lock_sec: Number(e.target.value) })}
                    style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-bold outline-none ${theme.inputClass}`}
                  >
                    <option value="60" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>1 phút</option>
                    <option value="180" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>3 phút</option>
                    <option value="300" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>5 phút</option>
                    <option value="0" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>Tắt tự khóa</option>
                  </select>
                </div>

                <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                  <span className="text-xs font-semibold">Ẩn số dư mặc định khi mở ứng dụng</span>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences?.privacy_hide_balance)}
                    disabled={prefBusy}
                    onChange={() =>
                      void handleUpdatePreference({
                        privacy_hide_balance: !preferences?.privacy_hide_balance,
                      })
                    }
                    className="w-4 h-4 accent-[#E14B5A]"
                  />
                </label>

                <div className={`flex items-center justify-between gap-2 pt-1 text-[11px] ${theme.textSecondary}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={HIKARI_AVATAR_TELLER} alt="" className="w-7 h-7 rounded-full object-cover" />
                    <span className="truncate">Chủ đề: {theme.name} · Mã KH {preferences?.customer_code || 'HK-CID-202601'}</span>
                  </div>
                  {onResetUi && (
                    <button
                      type="button"
                      disabled={prefBusy}
                      onClick={() => void onResetUi()}
                      className="min-h-[36px] px-3 rounded-xl border text-[11px] font-bold text-[#E14B5A] border-[#E14B5A]/30 whitespace-nowrap shrink-0"
                    >
                      Đặt lại giao diện mặc định
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {section === 'security' && (
          <div className="space-y-3.5">
            {/* Quick Lock & Toggles */}
            <div className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}>
              <div className="flex items-center justify-between">
                <h4 className={`text-xs font-bold flex items-center gap-1.5 ${theme.textPrimary}`}>
                  <Lock className={`w-4 h-4 ${theme.accentClass}`} />
                  <span>Kiểm soát truy cập & Xác thực</span>
                </h4>
                <button
                  type="button"
                  disabled={secBusy}
                  onClick={() => void handleLockAppNow()}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${theme.badgeDanger}`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Khóa app ngay</span>
                </button>
              </div>

              {[
                {
                  key: 'app_lock_enabled' as const,
                  label: 'Bật màn hình khóa mỗi lần mở Hikari Bank',
                  val: Boolean(security?.app_lock_enabled),
                },
                {
                  key: 'biometric_enabled' as const,
                  label: 'Mở khóa & xác nhận chuyển tiền bằng Sinh trắc học',
                  val: Boolean(security?.biometric_enabled),
                },
                {
                  key: 'unusual_alert_active' as const,
                  label: 'Cảnh báo giao dịch bất thường theo thời gian thực',
                  val: Boolean(security?.unusual_alert_active),
                },
                {
                  key: 'notif_balance' as const,
                  label: 'Thông báo biến động số dư qua Phone OS',
                  val: Boolean(security?.notif_balance),
                },
                {
                  key: 'notif_security' as const,
                  label: 'Thông báo đăng nhập & thay đổi bảo mật',
                  val: Boolean(security?.notif_security),
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center justify-between gap-2 py-1.5 border-b last:border-0 cursor-pointer ${theme.border}`}
                >
                  <span className={`text-xs font-medium ${theme.textPrimary}`}>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.val}
                    disabled={secBusy}
                    onChange={() => void handleToggleSecSetting({ [item.key]: item.val ? 0 : 1 })}
                    className="w-4 h-4 accent-[#E14B5A] shrink-0"
                  />
                </label>
              ))}
            </div>

            {/* PIN & Password */}
            <div className="grid grid-cols-1 gap-3">
              <form
                onSubmit={handleSavePin}
                className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <KeyRound className={`w-4 h-4 ${theme.accentClass}`} />
                    Đổi mã PIN giao dịch (6 số)
                  </span>
                  <span className={`text-[10px] font-semibold ${theme.isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {account?.has_pin ? 'Đã thiết lập' : 'Mặc định 123456'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Nhập PIN 6 chữ số mới"
                    className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold tracking-widest outline-none ${theme.inputClass}`}
                  />
                  <button
                    type="submit"
                    disabled={secBusy}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                  >
                    Lưu PIN
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleSavePassword}
                className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
              >
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Fingerprint className={`w-4 h-4 ${theme.accentClass}`} />
                  Đổi mật khẩu đăng nhập PhoneBank
                </span>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                    className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl border text-xs outline-none ${theme.inputClass}`}
                  />
                  <button
                    type="submit"
                    disabled={secBusy}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
                  >
                    Cập nhật
                  </button>
                </div>
              </form>
            </div>

            {/* Transaction Limits */}
            <form
              onSubmit={handleUpdateLimits}
              className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
            >
              <h4 className="text-xs font-bold">Hạn mức chuyển khoản tài khoản chính</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Hạn mức / ngày (VNĐ)</label>
                  <input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Hạn mức / tháng (VNĐ)</label>
                  <input
                    type="number"
                    value={monthlyLimit}
                    onChange={(e) => setMonthlyLimit(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={secBusy}
                className={`w-full min-h-[42px] py-2 rounded-xl border text-xs font-bold ${theme.badgePrimary}`}
              >
                Lưu hạn mức mới
              </button>
            </form>

            {/* Devices & Login Logs */}
            <div className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}>
              <h4 className="text-xs font-bold flex items-center gap-1.5">
                <Smartphone className={`w-4 h-4 ${theme.accentClass}`} />
                <span>Thiết bị tin cậy ({devices.length})</span>
              </h4>
              {devices.map((d) => (
                <div
                  key={d.id}
                  className={`flex items-center justify-between gap-2 py-2 border-b last:border-0 text-xs ${theme.border}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold truncate">{d.name}</p>
                    <p className={`text-[10px] ${theme.textSecondary}`}>
                      {d.platform} · {formatTimeAgoOrDate(d.lastActive)}
                    </p>
                  </div>
                  {d.isCurrent ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${theme.badgeSuccess}`}>
                      Hiện tại
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleToggleSecSetting({ removeDeviceId: d.id })}
                      className={`p-1.5 rounded-lg border ${theme.badgeDanger}`}
                      title="Gỡ thiết bị"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {loginLogs.length > 0 && (
                <div className={`pt-2 border-t space-y-1.5 ${theme.border}`}>
                  <p className={`text-[11px] font-bold ${theme.textSecondary}`}>Nhật ký truy cập gần đây</p>
                  {loginLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-[11px]">
                      <span className="truncate font-medium">
                        {log.method} · {log.device}
                      </span>
                      <span className={`tabular-nums shrink-0 ${theme.textSecondary}`}>
                        {formatTimeAgoOrDate(log.time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'qr' && (
          <div className="space-y-3.5">
            {/* Live QR PNG Card */}
            <div className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold flex items-center gap-1.5">
                  <QrCode className={`w-4 h-4 ${theme.accentClass}`} />
                  <span>Mã QR nhận tiền VietQR PNG</span>
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(qrPayload).catch(() => {});
                    setCopiedQrPayload(true);
                    showToast('Đã sao chép chuỗi QR', qrPayload, 'info');
                    setTimeout(() => setCopiedQrPayload(false), 1600);
                  }}
                  className={`text-[11px] font-bold flex items-center gap-1 ${theme.accentClass}`}
                >
                  {copiedQrPayload ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Chép mã QR</span>
                </button>
              </div>

              {qrCardPng && (
                <div className="flex justify-center">
                  <img
                    src={qrCardPng}
                    alt="PhoneBank VietQR"
                    className={`w-60 rounded-2xl shadow-md border ${theme.border}`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Số tiền cố định (tuỳ chọn)</label>
                  <input
                    type="number"
                    value={qrAmount}
                    onChange={(e) => setQrAmount(e.target.value)}
                    placeholder="Để trống = nhập tự do"
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Nội dung trên QR</label>
                  <input
                    value={qrNote}
                    onChange={(e) => setQrNote(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-medium outline-none ${theme.inputClass}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadDataUrlAsPng(qrCardPng, `PhoneBank_QR_${account?.account_number || 'VietQR'}.png`);
                    showToast('Đã tải ảnh QR', 'Mã QR VietQR PNG đã lưu về máy.', 'success');
                  }}
                  className={`min-h-[42px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${theme.chipInactive}`}
                >
                  <Download className={`w-4 h-4 ${theme.accentClass}`} />
                  <span>Tải QR PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onShare({
                      title: `QR Nhận tiền · ${account?.holder_name || 'Hikari Bank'}`,
                      text: `STK: ${account?.account_number} · Hikari Bank\n${qrNote}`,
                      mediaUrl: qrCardPng,
                      mediaType: 'photo',
                      sourceApp: 'Hikari Bank',
                    })
                  }
                  className="min-h-[42px] rounded-xl bg-[#E14B5A] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Chia sẻ QR</span>
                </button>
              </div>
            </div>

            {/* General QR Payment Link Creator */}
            <form
              onSubmit={handleCreatePayReq}
              className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
            >
              <h4 className="text-xs font-bold">Tạo liên kết QR nhận tiền</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Số tiền (VNĐ)</label>
                  <input
                    type="number"
                    min={1000}
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block mb-1 ${theme.textSecondary}`}>Lời nhắn QR</label>
                  <input
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value)}
                    placeholder="Nội dung nhận tiền..."
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs outline-none ${theme.inputClass}`}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={qrBusy}
                className="w-full min-h-[42px] py-2.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
              >
                Tạo liên kết QR nhận tiền
              </button>

              {paymentRequests.filter((pr) => !pr.target_character_id).length > 0 && (
                <div className={`pt-2 space-y-1.5 border-t ${theme.border}`}>
                  {paymentRequests
                    .filter((pr) => !pr.target_character_id)
                    .slice(0, 4)
                    .map((pr) => (
                      <div key={pr.id} className="flex items-center justify-between text-[11px] py-1">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{pr.note || pr.qr_payload}</p>
                          <p className={`text-[10px] ${theme.textSecondary}`}>{formatTimeAgoOrDate(pr.created_at)}</p>
                        </div>
                        <span className="font-bold text-[#E14B5A] tabular-nums shrink-0">{formatVnd(pr.amount)}</span>
                      </div>
                    ))}
                </div>
              )}
            </form>

            {/* Instant Receive Simulator */}
            <form
              onSubmit={handleSimulateReceive}
              className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
            >
              <h4 className={`text-xs font-bold flex items-center gap-1.5 ${theme.isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <ArrowDownLeft className="w-4 h-4" />
                <span>Nhận tiền chuyển khoản ngay (Kiểm thử tiền vào)</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  value={simSender}
                  onChange={(e) => setSimSender(e.target.value)}
                  placeholder="Tên người chuyển"
                  className={`min-h-[40px] px-3 py-2 rounded-xl border font-semibold outline-none ${theme.inputClass}`}
                />
                <input
                  type="number"
                  min={1000}
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  placeholder="Số tiền nhận"
                  className={`min-h-[40px] px-3 py-2 rounded-xl border font-bold tabular-nums outline-none ${theme.inputClass}`}
                />
              </div>
              <button
                type="submit"
                disabled={qrBusy}
                className="w-full min-h-[42px] py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                {qrBusy ? 'Đang ghi có...' : 'Nhận tiền vào tài khoản ngay'}
              </button>
            </form>
          </div>
        )}

        {section === 'support' && (
          <div className="space-y-3.5">
            {/* Live Gemini Support Chat */}
            <div className={`rounded-2xl border p-4 space-y-3 ${theme.cardBg}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#E14B5A]" />
                  <span>Trợ lý Hikari-chan AI (Chỉ đọc · 24/7)</span>
                </h4>
                <span className="text-[10px] font-bold text-emerald-500">Trực tuyến</span>
              </div>

              <div className="max-h-56 overflow-y-auto os-scroll space-y-2 pr-1">
                {aiMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-2xl text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#E14B5A] text-white ml-8'
                        : `${theme.subCardBg} border ${theme.textPrimary} mr-6`
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
                {aiBusy && (
                  <div className={`p-2.5 rounded-2xl border text-xs mr-12 flex items-center gap-1.5 ${theme.subCardBg} ${theme.textSecondary}`}>
                    <Bot className="w-3.5 h-3.5 animate-spin text-[#E14B5A]" />
                    <span>Đang tra cứu dữ liệu tài khoản...</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  'Kiểm tra giao dịch gần nhất',
                  'Hướng dẫn rút tiết kiệm trước hạn',
                  'Điều kiện lên hạng thành viên tiếp theo',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void handleAskSupportAi(prompt)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold shrink-0 ${theme.badgePrimary}`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAskSupportAi();
                    }
                  }}
                  placeholder="Đặt câu hỏi cho tổng đài viên AI..."
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl border text-xs outline-none ${theme.inputClass}`}
                />
                <button
                  type="button"
                  disabled={aiBusy || !aiQuestion.trim()}
                  onClick={() => void handleAskSupportAi()}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E14B5A] text-white text-xs font-bold disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* FAQ Accordion */}
            <div className={`rounded-2xl border p-4 space-y-2 ${theme.cardBg}`}>
              <h4 className="text-xs font-bold flex items-center gap-1.5">
                <HelpCircle className={`w-4 h-4 ${theme.accentClass}`} />
                <span>Câu hỏi thường gặp</span>
              </h4>
              <div className={`divide-y ${theme.border}`}>
                {SUPPORT_FAQS.map((item, idx) => {
                  const open = openFaqIdx === idx;
                  return (
                    <div key={idx} className="py-2">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIdx(open ? null : idx)}
                        className="w-full flex items-center justify-between gap-2 text-left text-xs font-bold"
                      >
                        <span>{item.q}</span>
                        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                      </button>
                      {open && <p className={`text-[11px] mt-1.5 leading-relaxed ${theme.textSecondary}`}>{item.a}</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Support Ticket Form & Tracking */}
            <form
              onSubmit={handleCreateTicket}
              className={`rounded-2xl border p-4 space-y-2.5 ${theme.cardBg}`}
            >
              <h4 className="text-xs font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>Gửi yêu cầu tra soát / Khiếu nại</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <select
                  value={ticketCat}
                  onChange={(e) => setTicketCat(e.target.value)}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`min-h-[40px] px-2.5 py-2 rounded-xl border font-semibold outline-none ${theme.inputClass}`}
                >
                  <option value="Tra soát giao dịch" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Tra soát giao dịch
                  </option>
                  <option value="Khiếu nại thẻ / Phí" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Khiếu nại thẻ / Phí
                  </option>
                  <option value="Bảo mật tài khoản" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Bảo mật tài khoản
                  </option>
                  <option value="Tư vấn tiết kiệm & vay" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Tư vấn tiết kiệm & vay
                  </option>
                </select>
                <select
                  value={ticketTxRef}
                  onChange={(e) => setTicketTxRef(e.target.value)}
                  style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                  className={`min-h-[40px] px-2.5 py-2 rounded-xl border font-mono text-[11px] outline-none ${theme.inputClass}`}
                >
                  <option value="" style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}>
                    Chọn mã GD (tuỳ chọn)
                  </option>
                  {transactions.slice(0, 12).map((t) => (
                    <option
                      key={t.id}
                      value={t.ref_code || t.id}
                      style={{ backgroundColor: theme.selectOptionBg, color: theme.selectOptionText }}
                    >
                      {t.ref_code || t.id} · {formatVnd(t.amount)}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="Tiêu đề yêu cầu (VD: Kiểm tra giao dịch chưa ghi có)"
                className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs outline-none ${theme.inputClass}`}
              />
              <textarea
                rows={2}
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                placeholder="Mô tả chi tiết vấn đề cần hỗ trợ..."
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none resize-none ${theme.inputClass}`}
              />
              <button
                type="submit"
                disabled={ticketBusy}
                className="w-full min-h-[42px] py-2.5 rounded-xl bg-[#E14B5A] text-white text-xs font-bold"
              >
                {ticketBusy ? 'Đang gửi...' : 'Gửi yêu cầu tra soát'}
              </button>

              {supportTickets.length > 0 && (
                <div className={`pt-2 space-y-2 border-t ${theme.border}`}>
                  <p className={`text-[11px] font-bold ${theme.textSecondary}`}>
                    Yêu cầu đã gửi ({supportTickets.length})
                  </p>
                  {supportTickets.map((tk) => (
                    <div key={tk.id} className={`rounded-xl border p-2.5 space-y-1 text-[11px] ${theme.subCardBg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold truncate">{tk.subject}</span>
                        <span className={`px-1.5 py-0.5 rounded border font-bold shrink-0 ${theme.badgeInfo}`}>
                          {tk.status}
                        </span>
                      </div>
                      <p className={theme.textSecondary}>{tk.admin_reply}</p>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

interface BankingNotificationsViewProps {
  notifications: BankingNotificationItem[];
  transactions: BankingTransactionDemo[];
  theme?: HikariThemePalette;
  onBack: () => void;
  onOverviewUpdate: (payload: BankingOverviewPayload) => void;
  onOpenTxBill: (tx: BankingTransactionDemo) => void;
}

export function BankingNotificationsView({
  notifications,
  transactions,
  theme = getThemePalette('coral'),
  onBack,
  onOverviewUpdate,
  onOpenTxBill,
}: BankingNotificationsViewProps) {
  const [onlyUnread, setOnlyUnread] = useState(false);

  const visibleList = useMemo(
    () => (onlyUnread ? notifications.filter((n) => !n.is_read) : notifications),
    [notifications, onlyUnread]
  );

  const handleMarkAll = async () => {
    try {
      const res = await osApi.banking.markAllNotificationsRead();
      onOverviewUpdate(res);
    } catch {
      // ignore
    }
  };

  const handleClickItem = async (n: BankingNotificationItem) => {
    if (!n.is_read) {
      try {
        const res = await osApi.banking.markNotificationRead(n.id);
        onOverviewUpdate(res);
      } catch {
        // ignore
      }
    }
    if (n.ref_id) {
      const matched = transactions.find((t) => t.id === n.ref_id || t.ref_code === n.ref_id);
      if (matched) {
        onBack();
        onOpenTxBill(matched);
        return;
      }
      try {
        const res = await osApi.banking.verifyTx(n.ref_id);
        if (res?.transaction) {
          onBack();
          onOpenTxBill(res.transaction);
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className={`h-full flex flex-col ${theme.pageBg}`}>
      <header className={`px-3.5 py-3 border-b flex items-center justify-between gap-2 shrink-0 ${theme.cardBg}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center ${theme.subCardBg}`}
            aria-label="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-bold">Thông báo Hikari Bank</h2>
            <p className={`text-[11px] ${theme.textSecondary}`}>
              {notifications.filter((n) => !n.is_read).length} chưa đọc · Đồng bộ với Phone OS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAll()}
          className="px-2.5 py-1.5 rounded-xl bg-[#E14B5A]/12 text-[#E14B5A] text-[11px] font-bold flex items-center gap-1"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Đọc hết</span>
        </button>
      </header>

      <div className="px-3.5 pt-2.5 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setOnlyUnread(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
            !onlyUnread ? 'bg-[#E14B5A] text-white' : `${theme.cardBg} border ${theme.textSecondary}`
          }`}
        >
          Tất cả ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setOnlyUnread(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
            onlyUnread ? 'bg-[#E14B5A] text-white' : `${theme.cardBg} border ${theme.textSecondary}`
          }`}
        >
          Chưa đọc ({notifications.filter((n) => !n.is_read).length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-2">
        {visibleList.length === 0 ? (
          <div className={`rounded-2xl border p-8 text-center text-xs ${theme.cardBg} ${theme.textSecondary}`}>
            Không có thông báo nào.
          </div>
        ) : (
          visibleList.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void handleClickItem(n)}
              className={`w-full text-left rounded-2xl p-3.5 border transition-colors ${
                n.is_read ? theme.cardBg : 'bg-[#E14B5A]/8 border-[#E14B5A]/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold">{n.title}</p>
                {!n.is_read && <span className="text-[10px] font-bold text-[#E14B5A]">Mới</span>}
              </div>
              <p className={`text-xs mt-1 ${theme.textSecondary}`}>{n.body}</p>
              <div className={`flex items-center justify-between text-[10px] mt-2 ${theme.textSecondary}`}>
                <span>{formatTimeAgoOrDate(n.created_at)}</span>
                {n.ref_id && <span className="text-[#E14B5A] font-semibold">Xem chi tiết GD →</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
