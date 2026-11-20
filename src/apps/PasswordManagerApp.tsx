import React, { useMemo, useState } from 'react';
import { Lock, Unlock, Plus, Copy, Trash2, RefreshCw, Eye, EyeOff, KeyRound, Search, X } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { VaultItem } from '../types/os';

const SALT = new TextEncoder().encode('PHONE_OS_VAULT_SALT_V1');

async function deriveKey(masterPass: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPass),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPassword(masterPass: string, plaintext: string): Promise<{ payload: string; ivHex: string }> {
  const key = await deriveKey(masterPass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const payload = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { payload, ivHex };
}

async function decryptPassword(masterPass: string, payloadB64: string, ivHex: string): Promise<string> {
  const key = await deriveKey(masterPass);
  const iv = new Uint8Array((ivHex.match(/.{1,2}/g) || []).map((h) => parseInt(h, 16)));
  const bytes = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes);
  return new TextDecoder().decode(plain);
}

export function PasswordManagerApp() {
  const { data, refreshData, showToast, requestConfirm } = useOS();
  const [masterPass, setMasterPass] = useState('');
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');

  const items = data?.vaultItems || [];

  const filtered = useMemo(
    () =>
      items.filter(
        (v) =>
          !query ||
          v.site.toLowerCase().includes(query.toLowerCase()) ||
          v.username.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    const arr = crypto.getRandomValues(new Uint8Array(16));
    let out = '';
    for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    setPassword(out);
  };

  const strengthScore = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (masterPass.length < 4) {
      showToast('Két mật khẩu', 'Vui lòng nhập ít nhất 4 ký tự cho cụm mật khẩu chính.', 'error');
      return;
    }
    setUnlockedKey(masterPass);
    // Attempt decrypting existing entries encrypted with this key
    const map: Record<string, string> = {};
    for (const item of items) {
      try {
        map[item.id] = await decryptPassword(masterPass, item.encrypted_payload, item.iv_hex);
      } catch {
        map[item.id] = '[Đã khóa — được mã hóa bằng mật khẩu chính khác]';
      }
    }
    setDecryptedMap(map);
  };

  const handleReveal = async (item: VaultItem) => {
    if (!unlockedKey) return;
    if (!decryptedMap[item.id]) {
      try {
        const plain = await decryptPassword(unlockedKey, item.encrypted_payload, item.iv_hex);
        setDecryptedMap((m) => ({ ...m, [item.id]: plain }));
      } catch {
        setDecryptedMap((m) => ({ ...m, [item.id]: '[Không thể giải mã với khóa hiện tại]' }));
      }
    }
    setVisibleIds((v) => ({ ...v, [item.id]: !v[item.id] }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockedKey || !site.trim() || !username.trim() || !password) return;
    const { payload, ivHex } = await encryptPassword(unlockedKey, password);
    await osApi.createVaultItem({
      site: site.trim(),
      username: username.trim(),
      encrypted_payload: payload,
      iv_hex: ivHex,
      notes: notes.trim(),
    });
    setSite('');
    setUsername('');
    setPassword('');
    setNotes('');
    setShowAdd(false);
    await refreshData();
    showToast('Đã lưu vào Két', 'Thông tin đăng nhập đã được mã hóa AES-256-GCM.', 'success');
  };

  if (!unlockedKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
        <div className="w-full max-w-xs p-5 rounded-3xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-4 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#A78BFA]/15 text-[#A78BFA] flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold font-display">Két Mật khẩu</h1>
            <p className="text-[11px] text-zinc-500 mt-1">
              Mã hóa phía client qua Web Crypto AES-256-GCM. Cụm mật khẩu chính không bao giờ lưu trên ổ đĩa.
            </p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              value={masterPass}
              onChange={(e) => setMasterPass(e.target.value)}
              placeholder="Nhập cụm mật khẩu chính"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none text-center"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold">
              Mở khóa Két sắt
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-emerald-500" />
            <h1 className="text-base font-bold font-display">Két Mật khẩu</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setUnlockedKey(null);
                setDecryptedMap({});
                setVisibleIds({});
              }}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-[11px] font-semibold"
            >
              Khóa lại
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-2.5 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trang web hoặc tên đăng nhập..."
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-2.5">
        {filtered.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <KeyRound className="w-7 h-7 text-zinc-400 mx-auto" />
            <p className="text-xs text-zinc-500">Chưa có thông tin đăng nhập nào được lưu.</p>
          </div>
        )}
        {filtered.map((item) => {
          const shown = visibleIds[item.id];
          const plain = decryptedMap[item.id];
          return (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold">{item.site}</p>
                  <p className="text-[11px] text-zinc-500">{item.username}</p>
                </div>
                <button
                  onClick={() =>
                    requestConfirm({
                      title: 'Xóa thông tin?',
                      message: `Xóa tài khoản đăng nhập cho ${item.site}?`,
                      destructive: true,
                      onConfirm: async () => {
                        await osApi.deleteVaultItem(item.id);
                        refreshData();
                      },
                    })
                  }
                  className="text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                <span className="text-xs font-mono-num truncate">
                  {shown ? plain || '••••••••' : '••••••••••••'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleReveal(item)} className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                    {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={async () => {
                      let text = plain;
                      if (!text && unlockedKey) {
                        try {
                          text = await decryptPassword(unlockedKey, item.encrypted_payload, item.iv_hex);
                        } catch {
                          showToast('Lỗi Két sắt', 'Mật khẩu chính không khớp với mục này.', 'error');
                          return;
                        }
                      }
                      if (text) {
                        navigator.clipboard?.writeText(text);
                        showToast('Đã sao chép', 'Đã sao chép mật khẩu vào bộ nhớ tạm.', 'success');
                      }
                    }}
                    className="p-1 text-zinc-500 hover:text-[#A78BFA]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-end p-3">
          <form onSubmit={handleAdd} className="w-full rounded-3xl bg-white dark:bg-[#1A1A22] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Đăng nhập mã hóa mới</h3>
              <button type="button" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="Trang web / Ứng dụng (vd: github.com)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tên đăng nhập hoặc Email"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <div className="flex gap-1.5">
              <input
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-mono-num outline-none"
              />
              <button
                type="button"
                onClick={generateStrongPassword}
                className="px-3 py-2 rounded-xl bg-purple-500/15 text-[#A78BFA] text-xs font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Tạo
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((lvl) => (
                <div
                  key={lvl}
                  className={`h-1.5 flex-1 rounded-full ${
                    strengthScore >= lvl
                      ? strengthScore >= 3
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                      : 'bg-zinc-200 dark:bg-zinc-800'
                  }`}
                />
              ))}
              <span className="text-[10px] text-zinc-500 ml-1">
                {strengthScore >= 3 ? 'Mạnh' : strengthScore >= 2 ? 'Trung bình' : 'Yếu'}
              </span>
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú (tùy chọn)"
              className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold">
              Mã hóa & Lưu
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
