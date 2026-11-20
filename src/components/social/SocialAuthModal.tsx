import React, { useState } from 'react';
import { KeyRound, Lock, Mail, Sparkles, User, X } from 'lucide-react';
import { setStoredSocialToken, socialApi } from '../../services/socialApi';
import type { SocialUser } from '../../types/social';

interface SocialAuthModalProps {
  canDismiss?: boolean;
  onClose?: () => void;
  onAuthenticated: (user: SocialUser) => void;
}

export function SocialAuthModal({ canDismiss = false, onClose, onAuthenticated }: SocialAuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState<'personal' | 'creator' | 'business'>('personal');

  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [localOtpNotice, setLocalOtpNotice] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await socialApi.login({
        identifier: identifier.trim(),
        password,
        device_name: navigator.userAgent.includes('Android') ? 'Android Smartphone' : 'Phone OS Browser',
      });
      setStoredSocialToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await socialApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        account_type: accountType,
      });
      setStoredSocialToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await socialApi.forgotPassword(resetEmail.trim());
      setLocalOtpNotice(`${res.note} Mã xác thực cục bộ: ${res.localSimulatedOtp}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo mã khôi phục.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await socialApi.resetPassword(resetEmail.trim(), resetCode.trim(), newPassword);
      setSuccessMsg('Đã đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay.');
      setTab('login');
      setIdentifier(resetEmail.trim());
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mã xác thực không hợp lệ.');
    } finally {
      setLoading(false);
    }
  };

  const handleOsBootstrap = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await socialApi.osBootstrap();
      setStoredSocialToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đồng bộ tài khoản Phone OS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">VibeSphere Tài khoản</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Đăng nhập, đăng ký hoặc chuyển đổi phiên</p>
            </div>
          </div>
          {canDismiss && onClose && (
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-3">
          {(
            [
              { id: 'login', label: 'Đăng nhập' },
              { id: 'register', label: 'Đăng ký' },
              { id: 'forgot', label: 'Khôi phục' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setError('');
              }}
              className={`flex-1 min-h-[44px] text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400">
              {successMsg}
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Username hoặc Email</label>
                <div className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <User className="w-4 h-4 text-zinc-400 shrink-0" />
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="minhanh.os hoặc minhanh@phoneos.vn"
                    required
                    className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Mật khẩu</label>
                <div className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    required
                    className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Đang xác thực...' : 'Đăng nhập'}
              </button>

              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <button
                  type="button"
                  onClick={handleOsBootstrap}
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  Đăng nhập nhanh bằng tài khoản Phone OS mặc định
                </button>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center">
                  Tài khoản mẫu có sẵn: minhanh.os · Mật khẩu: VibeSphere@2026
                </p>
              </div>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Tên hiển thị</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Bảo Ngọc"
                  required
                  className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="baongoc.vn"
                    required
                    className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Loại tài khoản</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as 'personal' | 'creator' | 'business')}
                    className="w-full px-2.5 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  >
                    <option value="personal">Cá nhân</option>
                    <option value="creator">Nhà sáng tạo</option>
                    <option value="business">Doanh nghiệp</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Email</label>
                <div className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ngoc@example.com"
                    required
                    className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Mật khẩu (tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản VibeSphere'}
              </button>
            </form>
          )}

          {tab === 'forgot' && (
            <div className="space-y-3">
              <form onSubmit={handleForgotSend} className="space-y-2.5">
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Email đã đăng ký</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Nhập email..."
                    required
                    className="flex-1 px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[44px] px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shrink-0"
                  >
                    Lấy mã
                  </button>
                </div>
              </form>

              {localOtpNotice && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <KeyRound className="w-3.5 h-3.5" /> Thông báo môi trường cục bộ
                  </div>
                  <p>{localOtpNotice}</p>
                </div>
              )}

              <form onSubmit={handleResetConfirm} className="space-y-2.5 pt-1">
                <input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Nhập mã 6 số..."
                  required
                  className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mật khẩu mới (tối thiểu 6 ký tự)..."
                  minLength={6}
                  required
                  className="w-full px-3 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-semibold"
                >
                  Đặt lại mật khẩu
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
