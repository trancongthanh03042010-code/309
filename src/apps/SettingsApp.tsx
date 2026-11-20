import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BatteryCharging,
  BellOff,
  Bluetooth,
  CheckCircle2,
  CloudUpload,
  Download,
  HardDrive,
  Info,
  Lock,
  Palette,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  User,
  Volume2,
  Wifi,
  PlugZap,
  KeyRound,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Wrench,
  AlertTriangle,
  Sliders,
  Search,
  Calendar,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { IntegrationServiceStatus, OsReleaseType, SystemUpdatePayload } from '../types/os';

type Section =
  | 'menu'
  | 'profile'
  | 'battery'
  | 'network'
  | 'sound'
  | 'display'
  | 'focus'
  | 'security'
  | 'privacy'
  | 'storage'
  | 'backup'
  | 'integrations'
  | 'update'
  | 'errors'
  | 'about';

const SECTION_TITLES: Record<Section, string> = {
  menu: 'Cài đặt Hệ thống',
  profile: 'Hồ sơ, Thiết bị & Tài khoản',
  battery: 'Pin & Năng lượng',
  network: 'Mạng, Wi-Fi & Bluetooth',
  sound: 'Âm thanh & Rung',
  display: 'Hiển thị, Cử chỉ & AOD',
  focus: 'Tập trung, Ngủ & AI chủ động',
  security: 'Bảo mật & Khôi phục khóa',
  privacy: 'Quyền ứng dụng',
  storage: 'Bộ nhớ & Dọn dẹp',
  backup: 'Sao lưu, Xem trước & Khôi phục',
  integrations: 'Tích hợp & Minh bạch (A/B/C/D)',
  update: 'Cập nhật Hệ điều hành',
  errors: 'Trung tâm Lỗi & Chẩn đoán',
  about: 'Giới thiệu & Cài đặt PWA',
};

export function SettingsApp() {
  const {
    data,
    appParams,
    refreshData,
    updateProfile,
    showToast,
    requestConfirm,
    batterySource,
    isOnline,
    canInstallPwa,
    isPwaInstalled,
    promptPwaInstall,
  } = useOS();

  const [section, setSection] = useState<Section>('menu');
  const [nameInput, setNameInput] = useState(data?.profile.name || '');
  const [bioInput, setBioInput] = useState(data?.profile.bio || '');
  const [pinInput, setPinInput] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recEmail, setRecEmail] = useState(data?.profile.recovery_email || '');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [wifiModalSsid, setWifiModalSsid] = useState<string | null>(null);
  const [wifiPass, setWifiPass] = useState('');
  const [healthInfo, setHealthInfo] = useState<{ status: string; database: string; geminiConfigured: boolean; uptimeSec: number } | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationServiceStatus[]>([]);
  const [previewBackupData, setPreviewBackupData] = useState<{
    id: string;
    schemaVersion: string;
    osVersion: string;
    createdAt: string;
    integrityValid: boolean;
    counts: Record<string, number>;
    modules: string[];
  } | null>(null);
  const [selectedRestoreModules, setSelectedRestoreModules] = useState<string[]>([
    'profile_launcher',
    'communication',
    'productivity',
    'ai_world',
    'media_lifestyle',
  ]);
  const [updateInfo, setUpdateInfo] = useState<SystemUpdatePayload | null>(null);
  const [verSearch, setVerSearch] = useState('');
  const [verTypeFilter, setVerTypeFilter] = useState<'all' | OsReleaseType>('all');
  const [verYearFilter, setVerYearFilter] = useState<string>('all');
  const [expandedVersionIds, setExpandedVersionIds] = useState<Record<string, boolean>>({});
  const [verBusy, setVerBusy] = useState(false);
  const [includeAiBackup, setIncludeAiBackup] = useState(true);

  useEffect(() => {
    if (appParams.tab && Object.keys(SECTION_TITLES).includes(appParams.tab)) {
      setSection(appParams.tab as Section);
    }
  }, [appParams.tab]);

  useEffect(() => {
    osApi
      .getSystemUpdate4()
      .then((res) => {
        setUpdateInfo(res);
        if (res.versions?.[0]) {
          setExpandedVersionIds((prev) =>
            Object.keys(prev).length > 0 ? prev : { [res.versions[0].id]: true }
          );
        }
      })
      .catch(() => {
        osApi
          .getSystemUpdate()
          .then((res) => {
            setUpdateInfo(res);
            if (res.versions?.[0]) {
              setExpandedVersionIds((prev) =>
                Object.keys(prev).length > 0 ? prev : { [res.versions[0].id]: true }
              );
            }
          })
          .catch(() => {});
      });
  }, []);

  useEffect(() => {
    if (section === 'errors') {
      osApi.getHealth().then(setHealthInfo).catch(() => {});
    }
    if (section === 'update') {
      osApi
        .getSystemUpdate4()
        .then((res) => {
          setUpdateInfo(res);
          if (res.versions?.[0]) {
            setExpandedVersionIds((prev) => ({ ...prev, [res.versions[0].id]: true }));
          }
        })
        .catch(() => osApi.getSystemUpdate().then(setUpdateInfo).catch(() => {}));
    }
    if (section === 'integrations') {
      osApi.getIntegrations().then((r) => setIntegrations(r.services || [])).catch(() => {});
    }
  }, [section]);

  if (!data) return null;
  const p = data.profile;
  const activeOsVersion = updateInfo?.currentVersion || p.schema_version || '4.1.0';

  const handleExportVersionHistory = async () => {
    setVerBusy(true);
    try {
      const dump = await osApi.exportSystemVersionHistory();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phoneos-version-history-${activeOsVersion}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã xuất lịch sử phiên bản', `Gồm ${dump.totalVersions} bản ghi phát hành hợp lệ.`, 'success');
    } catch (err) {
      showToast('Xuất lịch sử thất bại', err instanceof Error ? err.message : 'Lỗi hệ thống', 'error');
    } finally {
      setVerBusy(false);
    }
  };

  const handleRestoreVersionHistoryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setVerBusy(true);
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const res = await osApi.restoreSystemVersionHistory(parsed);
        if (res.history) setUpdateInfo(res.history);
        showToast(
          'Khôi phục lịch sử thành công',
          `Đã bổ sung ${res.imported} phiên bản (bỏ qua ${res.skippedExisting} phiên bản đã có).`,
          'success'
        );
      } catch (err) {
        showToast('Khôi phục lịch sử thất bại', err instanceof Error ? err.message : 'Tệp JSON không hợp lệ', 'error');
      } finally {
        setVerBusy(false);
      }
    };
    reader.readAsText(file);
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result || '');
        const res = await osApi.importBackup(text);
        await refreshData();
        showToast(
          'Đã nhập tệp sao lưu',
          res.integrityValid ? 'Chữ ký SHA-256 hợp lệ!' : 'Cảnh báo: Chữ ký không khớp, hãy kiểm tra trước khi khôi phục.',
          res.integrityValid ? 'success' : 'info'
        );
      } catch (err) {
        showToast('Nhập sao lưu thất bại', err instanceof Error ? err.message : 'Tệp không hợp lệ', 'error');
      }
    };
    reader.readAsText(file);
  };

  if (section !== 'menu') {
    return (
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
        <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
          <button onClick={() => setSection('menu')} className="flex items-center gap-1 text-xs font-semibold text-[#A78BFA]">
            <ArrowLeft className="w-4 h-4" />
            <span>Cài đặt</span>
          </button>
          <span className="text-sm font-bold ml-2 truncate">{SECTION_TITLES[section]}</span>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-3.5 space-y-3 text-xs">
          {section === 'profile' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800">
                <img src={p.avatar} alt="" className="w-14 h-14 rounded-full object-cover" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{p.name}</p>
                  <p className="text-zinc-500 truncate">@{p.username} · {p.email}</p>
                  <p className="text-[10px] text-violet-500">{p.bio || 'Người dùng PHONE OS 3.0'}</p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <label className="block text-zinc-500">Tên hiển thị</label>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                />
                <label className="block text-zinc-500">Tiểu sử</label>
                <input
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                />
                <button
                  onClick={async () => {
                    await updateProfile({ name: nameInput, bio: bioInput });
                    showToast('Đã lưu hồ sơ', 'Thông tin cá nhân đã được cập nhật', 'success');
                  }}
                  className="w-full py-2 rounded-xl bg-[#A78BFA] text-white font-bold"
                >
                  Lưu thông tin cá nhân
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center justify-between">
                  <span>Đồng hồ 24 giờ</span>
                  <input type="checkbox" checked={p.clock_24h !== 0} onChange={(e) => updateProfile({ clock_24h: e.target.checked ? 1 : 0 })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Chế độ Khách (Guest Mode)</span>
                  <input type="checkbox" checked={p.guest_mode === 1} onChange={(e) => updateProfile({ guest_mode: e.target.checked ? 1 : 0 })} />
                </label>
                <div className="flex items-center justify-between pt-1">
                  <span>Múi giờ hệ thống</span>
                  <select
                    value={p.timezone || 'Asia/Ho_Chi_Minh'}
                    onChange={(e) => updateProfile({ timezone: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Thiết bị đã đăng nhập ({data.devices.length})</p>
                {data.devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-[10px] text-zinc-500">{d.platform}</p>
                    </div>
                    {d.is_current ? <span className="text-[10px] text-emerald-500 font-bold">Thiết bị này</span> : null}
                  </div>
                ))}
              </div>

              <button
                onClick={() =>
                  requestConfirm({
                    title: 'Đặt lại hồ sơ tài khoản?',
                    message: 'Khôi phục tên, tiểu sử và gỡ mã PIN về mặc định mà không xóa ghi chú/ứng dụng.',
                    destructive: true,
                    onConfirm: async () => {
                      await osApi.resetAccount();
                      await refreshData();
                      showToast('Đã đặt lại hồ sơ', 'Hồ sơ trở về mặc định an toàn');
                    },
                  })
                }
                className="w-full py-2.5 rounded-2xl bg-rose-500/15 text-rose-500 font-bold"
              >
                Đặt lại cài đặt tài khoản (An toàn)
              </button>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <p className="font-bold">Dữ liệu cá nhân & Quyền riêng tư</p>
                <a
                  href="/api/os4/export-user-data"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Xuất toàn bộ dữ liệu cá nhân (JSON)
                </a>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                  <p className="text-[11px] text-rose-500 font-semibold">Xóa dữ liệu cá nhân (Gõ đúng: XOA DU LIEU)</p>
                  <div className="flex gap-2">
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Nhập XOA DU LIEU..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await osApi.deleteAccountData(deleteConfirmText.trim());
                          setDeleteConfirmText('');
                          await refreshData();
                          showToast('Đã xóa dữ liệu', 'Dữ liệu cá nhân đã được dọn sạch.', 'success');
                        } catch (err) {
                          showToast('Chưa thể xóa', err instanceof Error ? err.message : 'Xác nhận sai', 'error');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'battery' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Nguồn dữ liệu Pin</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${batterySource === 'real' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                    {batterySource === 'real' ? 'Loại A · Web Battery API thật' : 'Loại B · Pin mô phỏng'}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="font-display text-3xl font-bold font-mono-num">{p.battery_level}%</span>
                  <span className="text-emerald-500 font-semibold">{p.charging ? 'Đang sạc' : 'Đang dùng pin'}</span>
                </div>
                <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${p.battery_level <= (p.low_battery_threshold || 20) ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${p.battery_level}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <label className="flex items-center justify-between">
                  <span>Chế độ Tiết kiệm pin</span>
                  <input type="checkbox" checked={p.battery_saver === 1} onChange={(e) => updateProfile({ battery_saver: e.target.checked ? 1 : 0 })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Hiển thị % pin trên thanh trạng thái</span>
                  <input type="checkbox" checked={p.show_battery_pct !== 0} onChange={(e) => updateProfile({ show_battery_pct: e.target.checked ? 1 : 0 })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Sạc mô phỏng (khi không dùng phần cứng)</span>
                  <input
                    type="checkbox"
                    checked={p.charging === 1}
                    onChange={async (e) => {
                      await osApi.logBattery(p.battery_level, e.target.checked ? 1 : 0);
                      await refreshData();
                    }}
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span>Mức điều chỉnh pin mô phỏng</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={p.battery_level}
                    onChange={async (e) => {
                      await osApi.logBattery(Number(e.target.value), p.charging || 0);
                      await refreshData();
                    }}
                    className="w-32 accent-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Biểu đồ lịch sử pin gần đây</p>
                <div className="flex items-end gap-1.5 h-20 pt-2">
                  {data.batteryHistory.slice(-10).map((bh) => (
                    <div key={bh.id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div className="w-full rounded-t-lg bg-emerald-500/80" style={{ height: `${Math.max(8, bh.level)}%` }} />
                      <span className="text-[9px] font-mono-num">{bh.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'network' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Trình duyệt thực tế</span>
                  <span className={`font-bold ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isOnline ? 'Trực tuyến (Real Network)' : 'Ngoại tuyến'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { key: 'wifi_on', label: 'Wi-Fi (Mô phỏng)', val: p.wifi_on },
                    { key: 'bluetooth_on', label: 'Bluetooth (Mô phỏng)', val: p.bluetooth_on },
                    { key: 'mobile_data_on', label: 'Dữ liệu 5G', val: p.mobile_data_on },
                    { key: 'airplane_mode', label: 'Chế độ Máy bay', val: p.airplane_mode },
                    { key: 'vpn_on', label: 'VPN Bảo mật', val: p.vpn_on },
                    { key: 'nfc_on', label: 'NFC', val: p.nfc_on },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => updateProfile({ [item.key]: item.val ? 0 : 1 })}
                      className={`p-2 rounded-xl border text-left font-semibold ${
                        item.val ? 'bg-sky-500/15 border-sky-500 text-sky-600 dark:text-sky-300' : 'bg-zinc-100 dark:bg-zinc-900 border-transparent'
                      }`}
                    >
                      {item.label}: {item.val ? 'Bật' : 'Tắt'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold flex items-center gap-1.5"><Wifi className="w-4 h-4 text-sky-500" /> Danh sách mạng Wi-Fi (Mô phỏng)</p>
                {data.wifiNetworks.map((net) => {
                  const connected = p.wifi_on && p.selected_wifi === net.ssid;
                  return (
                    <div key={net.ssid} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <div>
                        <p className="font-semibold">{net.ssid} {connected ? '· Đã kết nối' : ''}</p>
                        <p className="text-[10px] text-zinc-500">{net.security} · Tín hiệu {net.signal}%</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={async () => {
                            if (net.security === 'Mở' || net.is_saved) {
                              await osApi.connectWifi(net.ssid, '');
                              await refreshData();
                              showToast('Wi-Fi', `Đã kết nối ${net.ssid} (Mô phỏng)`);
                            } else {
                              setWifiModalSsid(net.ssid);
                              setWifiPass('');
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[10px] font-bold"
                        >
                          {connected ? 'Đang dùng' : 'Kết nối'}
                        </button>
                        {net.is_saved ? (
                          <button
                            onClick={async () => {
                              await osApi.forgetWifi(net.ssid);
                              await refreshData();
                            }}
                            className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px]"
                          >
                            Quên
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {wifiModalSsid && (
                  <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 space-y-2">
                    <p className="font-semibold">Nhập mật khẩu cho {wifiModalSsid}</p>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={wifiPass}
                        onChange={(e) => setWifiPass(e.target.value)}
                        placeholder="Ít nhất 4 ký tự..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 outline-none"
                      />
                      <button
                        onClick={async () => {
                          try {
                            await osApi.connectWifi(wifiModalSsid, wifiPass);
                            await refreshData();
                            setWifiModalSsid(null);
                            showToast('Wi-Fi', `Đã kết nối ${wifiModalSsid}`);
                          } catch (err) {
                            showToast('Lỗi Wi-Fi', err instanceof Error ? err.message : 'Sai mật khẩu', 'error');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-bold"
                      >
                        Vào
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold flex items-center gap-1.5"><Bluetooth className="w-4 h-4 text-blue-500" /> Bluetooth (Mô phỏng)</p>
                  <button
                    onClick={async () => {
                      await osApi.scanBluetooth();
                      await refreshData();
                      showToast('Bluetooth', 'Đã quét thiết bị xung quanh');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-500 text-[10px] font-bold"
                  >
                    Quét thiết bị
                  </button>
                </div>
                {data.bluetoothDevices.map((bt) => (
                  <div key={bt.id} className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <div>
                      <p className="font-semibold">{bt.name}</p>
                      <p className="text-[10px] text-zinc-500">{bt.paired ? 'Đã ghép nối' : 'Chưa ghép nối'} · Pin {bt.battery_pct}%</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          await osApi.updateBluetooth(bt.id, { paired: 1, connected: bt.connected ? 0 : 1 });
                          await refreshData();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${bt.connected ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}
                      >
                        {bt.connected ? 'Ngắt' : 'Kết nối'}
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.deleteBluetooth(bt.id);
                          await refreshData();
                        }}
                        className="p-1 text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'sound' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Hồ sơ âm thanh</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'normal', label: 'Bình thường' },
                    { id: 'vibrate', label: 'Chỉ rung' },
                    { id: 'silent', label: 'Im lặng' },
                  ].map((sp) => (
                    <button
                      key={sp.id}
                      onClick={() => updateProfile({ sound_profile: sp.id, silent_mode: sp.id === 'silent' ? 1 : 0 })}
                      className={`py-2 rounded-xl font-semibold ${(p.sound_profile || 'normal') === sp.id ? 'bg-[#A78BFA] text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <p className="font-bold">Âm lượng từng kênh</p>
                {[
                  { key: 'vol_ring', label: 'Nhạc chuông', val: p.vol_ring ?? 80 },
                  { key: 'vol_notif', label: 'Thông báo', val: p.vol_notif ?? 75 },
                  { key: 'vol_media', label: 'Đa phương tiện', val: p.vol_media ?? 75 },
                  { key: 'vol_call', label: 'Cuộc gọi', val: p.vol_call ?? 85 },
                  { key: 'vol_alarm', label: 'Báo thức', val: p.vol_alarm ?? 90 },
                ].map((sl) => (
                  <div key={sl.key} className="flex items-center gap-2">
                    <span className="w-28 text-zinc-500">{sl.label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sl.val}
                      onChange={(e) => updateProfile({ [sl.key]: Number(e.target.value), ...(sl.key === 'vol_media' ? { volume: Number(e.target.value) } : {}) })}
                      className="flex-1 accent-[#A78BFA]"
                    />
                    <span className="w-8 text-right font-mono-num">{sl.val}%</span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Phản hồi âm thanh & Rung</p>
                {[
                  { key: 'sys_sounds', label: 'Âm thanh chạm hệ thống', val: p.sys_sounds !== 0 },
                  { key: 'kb_sounds', label: 'Âm thanh gõ bàn phím ảo', val: p.kb_sounds !== 0 },
                  { key: 'cam_shutter', label: 'Tiếng màn trập máy ảnh', val: p.cam_shutter !== 0 },
                  { key: 'haptic_touch', label: 'Rung phản hồi chạm', val: p.haptic_touch !== 0 },
                  { key: 'haptic_msg', label: 'Rung khi có tin nhắn', val: p.haptic_msg !== 0 },
                  { key: 'haptic_call', label: 'Rung khi có cuộc gọi', val: p.haptic_call !== 0 },
                ].map((tg) => (
                  <label key={tg.key} className="flex items-center justify-between">
                    <span>{tg.label}</span>
                    <input type="checkbox" checked={tg.val} onChange={(e) => updateProfile({ [tg.key]: e.target.checked ? 1 : 0 })} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {section === 'display' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <span className="font-semibold">Giao diện</span>
                <div className="flex gap-1.5">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateProfile({ theme: t })}
                      className={`px-3 py-1.5 rounded-xl font-semibold ${p.theme === t ? 'bg-[#A78BFA] text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                    >
                      {t === 'light' ? 'Sáng' : 'Tối'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Cỡ chữ, Thu phóng & Trợ năng</p>
                <div className="flex items-center justify-between">
                  <span>Cỡ chữ</span>
                  <div className="flex gap-1">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => updateProfile({ font_size: sz })}
                        className={`px-2.5 py-1 rounded-lg ${p.font_size === sz ? 'bg-[#A78BFA] text-white font-bold' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                      >
                        {sz === 'small' ? 'Nhỏ' : sz === 'medium' ? 'Vừa' : 'Lớn'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span>Hiệu ứng chuyển động</span>
                  <select
                    value={p.anim_level || 'full'}
                    onChange={(e) => updateProfile({ anim_level: e.target.value, reduce_motion: e.target.value !== 'full' ? 1 : 0 })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="full">Đầy đủ</option>
                    <option value="reduced">Giảm bớt</option>
                    <option value="none">Tắt hẳn</option>
                  </select>
                </div>
                <label className="flex items-center justify-between">
                  <span>Độ tương phản cao</span>
                  <input type="checkbox" checked={p.high_contrast === 1} onChange={(e) => updateProfile({ high_contrast: e.target.checked ? 1 : 0 })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Chữ đậm hệ thống</span>
                  <input type="checkbox" checked={p.font_weight === 'bold'} onChange={(e) => updateProfile({ font_weight: e.target.checked ? 'bold' : 'normal' })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Hiện tên nhãn biểu tượng</span>
                  <input type="checkbox" checked={p.icon_labels !== 0} onChange={(e) => updateProfile({ icon_labels: e.target.checked ? 1 : 0 })} />
                </label>
                <div className="flex items-center justify-between">
                  <span>Số cột màn hình chính</span>
                  <div className="flex gap-1">
                    {[4, 5].map((cols) => (
                      <button
                        key={cols}
                        onClick={() => updateProfile({ home_columns: cols })}
                        className={`px-3 py-1 rounded-lg ${(p.home_columns || 4) === cols ? 'bg-[#A78BFA] text-white font-bold' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                      >
                        {cols} cột
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span>Chủ đề Bàn phím ảo</span>
                  <select
                    value={p.kb_theme || 'auto'}
                    onChange={(e) => updateProfile({ kb_theme: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="auto">Tự động</option>
                    <option value="lavender">Oải hương</option>
                    <option value="dark">Tối</option>
                    <option value="light">Sáng</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Cử chỉ hệ thống & Màn hình luôn bật (AOD)</p>
                <label className="flex items-center justify-between">
                  <span>Bật cử chỉ vuốt cạnh (Mở Thông báo / Về Home)</span>
                  <input
                    type="checkbox"
                    checked={p.gestures_enabled !== 0}
                    onChange={(e) => updateProfile({ gestures_enabled: e.target.checked ? 1 : 0 })}
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span>Độ nhạy cử chỉ vuốt</span>
                  <select
                    value={p.gesture_sensitivity || 'medium'}
                    onChange={(e) => updateProfile({ gesture_sensitivity: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value="low">Nhẹ / Ít nhạy</option>
                    <option value="medium">Cân bằng</option>
                    <option value="high">Rất nhạy</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tự giảm sáng AOD sau</span>
                  <select
                    value={p.aod_timeout_sec ?? 30}
                    onChange={(e) => updateProfile({ aod_timeout_sec: Number(e.target.value) })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value={15}>15 giây</option>
                    <option value={30}>30 giây</option>
                    <option value={60}>60 giây</option>
                    <option value={0}>Luôn sáng</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Hình nền</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Cực Quang Oải Hương', url: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg' },
                    { label: 'Hoàng Hôn Sakura', url: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg' },
                  ].map((w) => (
                    <button
                      key={w.url}
                      onClick={() => updateProfile({ wallpaper: w.url })}
                      className={`rounded-2xl overflow-hidden border-2 ${p.wallpaper === w.url ? 'border-[#A78BFA]' : 'border-transparent'}`}
                    >
                      <img src={w.url} alt={w.label} className="w-full h-20 object-cover" />
                      <p className="p-1 text-[10px] font-medium">{w.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'focus' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Chế độ Tập trung (Focus)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'off', label: 'Tắt' },
                    { id: 'work', label: 'Làm việc' },
                    { id: 'study', label: 'Học tập' },
                    { id: 'sleep', label: 'Nghỉ ngơi / Ngủ' },
                  ].map((fm) => (
                    <button
                      key={fm.id}
                      onClick={() => updateProfile({ focus_mode: fm.id })}
                      className={`py-2 rounded-xl font-semibold ${(p.focus_mode || 'off') === fm.id ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between pt-2">
                  <span>Không làm phiền (DND)</span>
                  <input type="checkbox" checked={p.dnd === 1} onChange={(e) => updateProfile({ dnd: e.target.checked ? 1 : 0 })} />
                </label>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Giờ yên tĩnh & AI chủ động</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Bắt đầu yên tĩnh</label>
                    <input
                      type="time"
                      value={p.quiet_start || '23:00'}
                      onChange={(e) => updateProfile({ quiet_start: e.target.value })}
                      className="w-full mt-0.5 px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Kết thúc yên tĩnh</label>
                    <input
                      type="time"
                      value={p.quiet_end || '07:00'}
                      onChange={(e) => updateProfile({ quiet_end: e.target.value })}
                      className="w-full mt-0.5 px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between pt-1">
                  <span>Cho phép AI chủ động nhắn tin/đăng bài</span>
                  <input type="checkbox" checked={p.proactive_ai_enabled !== 0} onChange={(e) => updateProfile({ proactive_ai_enabled: e.target.checked ? 1 : 0 })} />
                </label>
                <label className="flex items-center justify-between">
                  <span>Cho phép AI ghi nhớ toàn hệ thống</span>
                  <input type="checkbox" checked={p.ai_memory_enabled !== 0} onChange={(e) => updateProfile({ ai_memory_enabled: e.target.checked ? 1 : 0 })} />
                </label>
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <p className="font-semibold">Bảo mật Màn hình khóa (Băm SHA-256 trên máy chủ)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { id: 'swipe', label: 'Vuốt mở' },
                    { id: 'pin', label: 'Mã PIN' },
                    { id: 'password', label: 'Mật khẩu' },
                    { id: 'pattern', label: 'Mẫu hình (vd 1-2-3)' },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => updateProfile({ unlock_mode: m.id })}
                      className={`py-2 rounded-xl ${p.unlock_mode === m.id ? 'bg-[#A78BFA] text-white font-semibold' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {p.unlock_mode !== 'swipe' && (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder={p.has_lock_secret ? 'Nhập mã mới để thay đổi...' : 'Nhập mã PIN / mật khẩu / chuỗi số...'}
                      className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!pinInput.trim()) return;
                        await updateProfile({ pin_code: pinInput.trim() });
                        setPinInput('');
                        showToast('Đã băm & lưu khóa', 'Mã khóa đã được bảo vệ bằng SHA-256.', 'success');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#A78BFA] text-white font-semibold"
                    >
                      Đặt
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span>Tự khóa sau không hoạt động</span>
                  <select
                    value={p.auto_lock_sec ?? 120}
                    onChange={(e) => updateProfile({ auto_lock_sec: Number(e.target.value) })}
                    className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                  >
                    <option value={30}>30 giây</option>
                    <option value={120}>2 phút</option>
                    <option value={300}>5 phút</option>
                    <option value={0}>Không tự khóa</option>
                  </select>
                </div>
              </div>

              <label className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <span>Ẩn nội dung thông báo nhạy cảm khi khóa</span>
                <input type="checkbox" checked={p.hide_sensitive_lock === 1} onChange={(e) => updateProfile({ hide_sensitive_lock: e.target.checked ? 1 : 0 })} />
              </label>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-500" />
                  <span>Mã khôi phục khóa (khi quên PIN)</span>
                </p>
                <p className="text-[11px] text-zinc-500">
                  Trạng thái: {p.has_recovery_code ? 'Đã thiết lập mã khôi phục an toàn (SHA-256)' : 'Chưa thiết lập'}
                </p>
                <input
                  value={recEmail}
                  onChange={(e) => setRecEmail(e.target.value)}
                  placeholder="Email khôi phục (tùy chọn)..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={recCode}
                    onChange={(e) => setRecCode(e.target.value)}
                    placeholder="Mã khôi phục (>= 6 ký tự)..."
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
                  />
                  <button
                    onClick={async () => {
                      if (recCode.trim().length < 6) {
                        showToast('Mã quá ngắn', 'Mã khôi phục cần ít nhất 6 ký tự.', 'error');
                        return;
                      }
                      await osApi.setupLockRecovery(recEmail.trim(), recCode.trim());
                      setRecCode('');
                      await refreshData();
                      showToast('Đã lưu mã khôi phục', 'Bạn có thể dùng mã này để đặt lại PIN tại màn hình khóa.', 'success');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
                  >
                    Lưu mã
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'privacy' && (
            <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <p className="font-bold">Bảng điều khiển Quyền từng ứng dụng</p>
              {data.appPermissions.map((ap) => (
                <div key={`${ap.app_id}_${ap.permission_key}`} className="py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize">{ap.app_id} · {ap.permission_key}</span>
                    <select
                      value={ap.status}
                      onChange={async (e) => {
                        await osApi.updatePermission({ app_id: ap.app_id, permission_key: ap.permission_key, status: e.target.value });
                        await refreshData();
                      }}
                      className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 outline-none"
                    >
                      <option value="granted">Luôn cho phép</option>
                      <option value="while_using">Khi đang mở</option>
                      <option value="prompt">Hỏi mỗi lần</option>
                      <option value="denied">Từ chối</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-zinc-500">{ap.reason}</p>
                </div>
              ))}
            </div>
          )}

          {section === 'storage' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-bold">Dung lượng & Bản ghi SQLite</p>
                {[
                  ['Ảnh & Video', `${data.media.length} tệp`],
                  ['Tin nhắn & Chuỗi AI', `${data.messages.length} tin nhắn`],
                  ['Ký ức Nhân vật AI', `${data.memories.length} ký ức`],
                  ['Ghi chú & Văn phòng', `${data.notes.length + data.officeDocs.length} tài liệu`],
                  ['Ứng dụng đã cài', `${data.apps.filter((a) => a.installed).length} ứng dụng`],
                  ['Bản sao lưu đã lưu', `${data.backups.length} bản`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <span className="text-zinc-500">{k}</span>
                    <span className="font-mono-num font-semibold">{v}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  const deletedMedia = data.media.filter((m) => m.is_deleted);
                  for (const m of deletedMedia) await osApi.deleteMedia(m.id);
                  await refreshData();
                  showToast('Dọn dẹp bộ nhớ', `Đã dọn ${deletedMedia.length} mục rác tạm thời.`, 'success');
                }}
                className="w-full py-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold"
              >
                Dọn dẹp thùng rác Ảnh & Bộ nhớ đệm
              </button>
            </div>
          )}

          {section === 'backup' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <p className="font-bold">Tạo & Nhập bản sao lưu (Kèm SHA-256 Checksum)</p>
                <label className="flex items-center justify-between">
                  <span>Bao gồm lịch sử chat & ký ức AI</span>
                  <input type="checkbox" checked={includeAiBackup} onChange={(e) => setIncludeAiBackup(e.target.checked)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      await osApi.createBackup(includeAiBackup);
                      await refreshData();
                      showToast('Sao lưu hoàn tất', 'Đã tạo ảnh chụp dữ liệu SQLite mới!', 'success');
                    }}
                    className="py-2 rounded-xl bg-[#A78BFA] text-white font-bold flex items-center justify-center gap-1"
                  >
                    <CloudUpload className="w-3.5 h-3.5" /> Sao lưu ngay
                  </button>
                  <label className="py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 font-bold flex items-center justify-center gap-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Nhập JSON
                    <input type="file" accept=".json,application/json" onChange={handleImportBackupFile} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold">Đồng bộ Đám mây (Mô phỏng cục bộ)</p>
                  <button
                    onClick={async () => {
                      await osApi.runSync(['Hồ sơ', 'Ghi chú', 'Danh bạ', 'Ký ức AI'], 'newest');
                      await refreshData();
                      showToast('Đồng bộ xong', 'Dữ liệu đã đồng bộ cục bộ an toàn.');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[10px] font-bold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Đồng bộ
                  </button>
                </div>
                {data.syncJobs.slice(0, 3).map((sj) => (
                  <p key={sj.id} className="text-[10px] text-zinc-500">
                    {sj.status} · {sj.detail}
                  </p>
                ))}
              </div>

              <div className="space-y-2">
                <p className="font-bold text-zinc-500 uppercase">Lịch sử bản sao lưu ({data.backups.length})</p>
                {data.backups.map((b) => (
                  <div key={b.id} className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{b.os_version}</span>
                      <span className="text-[10px] font-mono-num text-zinc-500">{b.size_kb} KB</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono-num truncate">SHA256: {b.integrity_hash}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        onClick={async () => {
                          const prev = await osApi.previewBackup(b.id);
                          setPreviewBackupData(prev);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-bold flex items-center gap-1"
                      >
                        <FileCheck2 className="w-3 h-3" /> Xem trước
                      </button>
                      <a
                        href={`/api/os3/backups/${b.id}/download`}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Tải JSON
                      </a>
                      <button
                        onClick={() =>
                          requestConfirm({
                            title: 'Khôi phục từ bản sao lưu?',
                            message: 'Thao tác chạy trong SQLite transaction (tự động rollback nếu có lỗi). Dữ liệu hiện tại sẽ được thay thế theo bản này.',
                            confirmLabel: 'Khôi phục',
                            onConfirm: async () => {
                              await osApi.restoreBackup(b.id);
                              await refreshData();
                              showToast('Khôi phục thành công', 'Hệ thống đã tải lại dữ liệu từ bản sao lưu!', 'success');
                            },
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Khôi phục toàn bộ
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.deleteBackup(b.id);
                          await refreshData();
                        }}
                        className="p-1 text-rose-500 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {previewBackupData && (
                <div className="p-3.5 rounded-2xl bg-violet-500/10 border border-violet-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-violet-600 dark:text-violet-300">
                      Xem trước & Khôi phục chọn lọc ({previewBackupData.osVersion})
                    </p>
                    <button onClick={() => setPreviewBackupData(null)} className="text-[11px] text-zinc-500">
                      Đóng
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Toàn vẹn SHA-256: {previewBackupData.integrityValid ? 'Hợp lệ' : 'Chưa khớp / Chế độ xem nhanh'}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      { id: 'profile_launcher', label: `Hồ sơ & Launcher (${previewBackupData.counts.installed_apps ?? 0} app)` },
                      { id: 'communication', label: `Liên lạc & Tin nhắn (${previewBackupData.counts.messages ?? 0} tin)` },
                      { id: 'productivity', label: `Ghi chú, Lịch & Tệp (${previewBackupData.counts.notes ?? 0} ghi chú)` },
                      { id: 'ai_world', label: `Nhân vật AI & Ký ức (${previewBackupData.counts.characters ?? 0} nhân vật)` },
                      { id: 'media_lifestyle', label: `Giải trí & Lối sống (${previewBackupData.counts.podcasts ?? 0} podcast)` },
                    ].map((mod) => {
                      const checked = selectedRestoreModules.includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className="p-2 rounded-xl bg-white dark:bg-[#1A1A22] flex items-center gap-2 text-[11px] font-medium"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedRestoreModules((prev) =>
                                e.target.checked ? [...prev, mod.id] : prev.filter((x) => x !== mod.id)
                              )
                            }
                          />
                          <span>{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={async () => {
                      await osApi.selectiveRestoreBackup(previewBackupData.id, selectedRestoreModules);
                      await refreshData();
                      setPreviewBackupData(null);
                      showToast('Khôi phục từng phần thành công', 'Đã áp dụng các mô-đun đã chọn.', 'success');
                    }}
                    className="w-full py-2 rounded-xl bg-violet-600 text-white font-bold"
                  >
                    Khôi phục các mô-đun đã chọn
                  </button>
                </div>
              )}
            </div>
          )}

          {section === 'integrations' && (
            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/25 text-[11px] leading-relaxed">
                Bảng trạng thái thời gian thực phân loại <strong>Loại A (Nội bộ thật)</strong>, <strong>Loại B (API/Embed chính thức)</strong>, <strong>Loại C (Phần cứng/OS)</strong> và <strong>Loại D (Mô phỏng)</strong>.
              </div>
              {integrations.map((svc) => (
                <div key={svc.key} className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{svc.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        svc.status === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : svc.status === 'unconfigured'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-sky-500/15 text-sky-500'
                      }`}
                    >
                      Loại {svc.type} ·{' '}
                      {svc.status === 'connected'
                        ? svc.type === 'C'
                          ? 'Hỗ trợ theo quyền Web'
                          : 'Hoạt động'
                        : svc.status === 'unconfigured'
                          ? 'Chưa cấu hình Key/Plugin'
                          : 'Mô phỏng'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">{svc.detail}</p>
                  {svc.configGuide && <p className="text-[10px] text-amber-600 dark:text-amber-300">Cấu hình: {svc.configGuide}</p>}
                </div>
              ))}
            </div>
          )}

          {section === 'update' && (() => {
            const allVersions = updateInfo?.versions || [];
            const availableYears = updateInfo?.years || Array.from(
              new Set(allVersions.map((v) => String(v.releaseDate || v.date || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))
            ).sort((a, b) => Number(b) - Number(a));
            const q = verSearch.trim().toLowerCase();
            const filteredVersions = allVersions.filter((ver) => {
              if (verTypeFilter !== 'all' && ver.releaseType !== verTypeFilter) return false;
              const year = String(ver.releaseDate || ver.date || '').slice(0, 4);
              if (verYearFilter !== 'all' && year !== verYearFilter) return false;
              if (!q) return true;
              const haystack = [
                ver.version,
                ver.releaseName,
                ver.summary,
                ...(ver.features || []),
                ...(ver.uiUpgrades || []),
                ...(ver.systemUpgrades || []),
                ...(ver.performanceImprovements || []),
                ...(ver.fixes || []),
                ...(ver.optimizations || []),
                ...(ver.compatibilityNotes || []),
              ]
                .join(' ')
                .toLowerCase();
              return haystack.includes(q);
            });

            const releaseTypeBadge = (type: OsReleaseType) => {
              if (type === 'major') return { label: 'Phiên bản lớn', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' };
              if (type === 'minor') return { label: 'Phiên bản nhỏ', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' };
              return { label: 'Bản vá lỗi', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' };
            };

            const isFiltered = Boolean(q || verTypeFilter !== 'all' || verYearFilter !== 'all');

            return (
              <div className="space-y-3">
                {/* Summary Header Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white space-y-2.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">
                        Cập nhật Hệ điều hành
                      </p>
                      <h2 className="font-display text-xl font-extrabold tracking-tight">
                        {updateInfo?.osName || 'PHONE OS'} {activeOsVersion}
                      </h2>
                      {updateInfo?.releaseName && (
                        <p className="text-[11px] font-semibold text-white/90 truncate">
                          {updateInfo.releaseName}
                        </p>
                      )}
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-400/20 border border-emerald-200/40 text-[10px] font-extrabold text-emerald-100 shrink-0">
                      Mới nhất
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-[10.5px]">
                    <div className="p-2 rounded-xl bg-white/10">
                      <p className="text-white/70">Ngày phát hành</p>
                      <p className="font-bold font-mono-num">{updateInfo?.releaseDate || '2026-11-19'}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-white/10">
                      <p className="text-white/70">Trạng thái</p>
                      <p className="font-bold truncate">Đã cập nhật</p>
                    </div>
                    <div className="p-2 rounded-xl bg-white/10">
                      <p className="text-white/70">Tổng phiên bản</p>
                      <p className="font-bold font-mono-num">{updateInfo?.totalVersions ?? allVersions.length} bản</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-white/80 pt-0.5">
                    <span className="font-mono truncate">Build: {updateInfo?.buildNumber || '—'}</span>
                    <span>{updateInfo?.systemStatus || 'Hoạt động ổn định'}</span>
                  </div>
                </div>

                {/* Export / Backup & Restore Version History */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-xs">Sao lưu & Phục hồi Lịch sử Phiên bản</p>
                    <span className="text-[10px] text-emerald-500 font-bold">Auto-Changelog Bật</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={verBusy}
                      onClick={handleExportVersionHistory}
                      className="min-h-[38px] px-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Xuất sao lưu JSON</span>
                    </button>
                    <label className="min-h-[38px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 shrink-0 text-violet-500" />
                      <span>Khôi phục JSON</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleRestoreVersionHistoryFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Search & Filters */}
                <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
                    <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <input
                      value={verSearch}
                      onChange={(e) => setVerSearch(e.target.value)}
                      placeholder="Tìm theo số phiên bản (4.1.0), tên bản cập nhật..."
                      className="flex-1 bg-transparent text-xs outline-none"
                    />
                    {verSearch && (
                      <button
                        type="button"
                        onClick={() => setVerSearch('')}
                        className="text-[10px] font-bold text-zinc-500"
                      >
                        Xóa
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Tất cả' },
                        { id: 'major', label: 'Phiên bản lớn' },
                        { id: 'minor', label: 'Phiên bản nhỏ' },
                        { id: 'patch', label: 'Bản vá lỗi' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setVerTypeFilter(f.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border transition-colors ${
                          verTypeFilter === f.id
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-zinc-100 dark:bg-zinc-900 border-transparent text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}

                    <div className="ml-auto flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <select
                        value={verYearFilter}
                        onChange={(e) => setVerYearFilter(e.target.value)}
                        className="px-2 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-[10.5px] font-bold outline-none"
                      >
                        <option value="all">Mọi năm</option>
                        {availableYears.map((y) => (
                          <option key={y} value={y}>
                            Năm {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => {
                        setVerSearch('');
                        setVerTypeFilter('all');
                        setVerYearFilter('all');
                      }}
                      className="w-full py-1.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300 text-[11px] font-bold"
                    >
                      Xem tất cả phiên bản ({allVersions.length})
                    </button>
                  )}
                </div>

                {/* Version History List */}
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    Lịch sử cập nhật ({filteredVersions.length}/{allVersions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const anyCollapsed = filteredVersions.some((v) => !expandedVersionIds[v.id]);
                      const next: Record<string, boolean> = {};
                      filteredVersions.forEach((v) => {
                        next[v.id] = anyCollapsed;
                      });
                      setExpandedVersionIds(next);
                    }}
                    className="text-[11px] font-bold text-violet-500"
                  >
                    {filteredVersions.some((v) => !expandedVersionIds[v.id]) ? 'Mở tất cả' : 'Thu gọn tất cả'}
                  </button>
                </div>

                {filteredVersions.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-center space-y-2">
                    <p className="text-xs text-zinc-500">Không tìm thấy phiên bản nào khớp bộ lọc hiện tại.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setVerSearch('');
                        setVerTypeFilter('all');
                        setVerYearFilter('all');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold"
                    >
                      Xem tất cả phiên bản
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredVersions.map((ver, index) => {
                      const isExpanded = Boolean(expandedVersionIds[ver.id]);
                      const typeBadge = releaseTypeBadge(ver.releaseType);
                      const isLatest = Boolean(ver.isLatest || (index === 0 && !isFiltered));
                      const sectionGroups: Array<{
                        title: string;
                        items: string[];
                        icon: React.ComponentType<{ className?: string }>;
                        iconCls: string;
                        itemCls: string;
                      }> = [
                        {
                          title: 'Tính năng mới',
                          items: ver.features || [],
                          icon: Sparkles,
                          iconCls: 'text-emerald-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Nâng cấp giao diện',
                          items: ver.uiUpgrades || [],
                          icon: Palette,
                          iconCls: 'text-fuchsia-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Nâng cấp hệ thống',
                          items: ver.systemUpgrades || [],
                          icon: Cpu,
                          iconCls: 'text-sky-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Cải tiến hiệu suất',
                          items: ver.performanceImprovements || [],
                          icon: Gauge,
                          iconCls: 'text-indigo-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Sửa lỗi',
                          items: ver.fixes || [],
                          icon: Wrench,
                          iconCls: 'text-amber-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Thay đổi và tối ưu hóa',
                          items: ver.optimizations || [],
                          icon: Sliders,
                          iconCls: 'text-cyan-500',
                          itemCls: 'text-zinc-700 dark:text-zinc-200',
                        },
                        {
                          title: 'Ghi chú tương thích',
                          items: ver.compatibilityNotes || ver.knownIssues || [],
                          icon: AlertTriangle,
                          iconCls: 'text-rose-500',
                          itemCls: 'text-amber-700 dark:text-amber-300',
                        },
                      ].filter((g) => g.items.length > 0);

                      return (
                        <div
                          key={ver.id || ver.version}
                          className={`rounded-2xl bg-white dark:bg-[#1A1A22] border overflow-hidden transition-colors ${
                            isLatest
                              ? 'border-violet-500/50 shadow-sm'
                              : 'border-zinc-200 dark:border-zinc-800'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedVersionIds((prev) => ({ ...prev, [ver.id]: !prev[ver.id] }))
                            }
                            className="w-full p-3.5 text-left flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-display text-sm font-extrabold">
                                  {ver.osName || 'PHONE OS'} {ver.version}
                                </span>
                                {isLatest && (
                                  <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[9.5px] font-extrabold tracking-wide">
                                    MỚI NHẤT
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold ${typeBadge.cls}`}>
                                  {typeBadge.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate">
                                {ver.releaseName}
                              </p>
                              <div className="flex items-center gap-2 text-[10.5px] text-zinc-500 font-mono-num">
                                <span>Phát hành: {ver.releaseDate || ver.date}</span>
                                {ver.buildNumber && <span>· {ver.buildNumber}</span>}
                              </div>
                            </div>
                            <span className="p-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 shrink-0">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="px-3.5 pb-3.5 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                              {ver.summary && (
                                <p className="text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/70 p-2.5 rounded-xl">
                                  {ver.summary}
                                </p>
                              )}

                              {sectionGroups.map((grp) => {
                                const GrpIcon = grp.icon;
                                return (
                                  <div key={grp.title} className="space-y-1">
                                    <p className="text-[11px] font-extrabold flex items-center gap-1.5">
                                      <GrpIcon className={`w-3.5 h-3.5 shrink-0 ${grp.iconCls}`} />
                                      <span>{grp.title}</span>
                                    </p>
                                    <ul className="space-y-1 pl-5">
                                      {grp.items.map((item, idx) => (
                                        <li
                                          key={idx}
                                          className={`text-[11px] leading-relaxed list-disc ${grp.itemCls}`}
                                        >
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {updateInfo?.migrations && updateInfo.migrations.length > 0 && (
                  <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                    <p className="font-bold text-[11px]">Lịch sử Di chuyển Dữ liệu An toàn (Migration)</p>
                    {updateInfo.migrations.map((m) => (
                      <div key={m.id} className="text-[10.5px] flex items-center justify-between gap-2 text-zinc-500">
                        <span className="truncate">{m.from_version} → {m.to_version} ({m.status})</span>
                        <span className="font-mono text-[10px] shrink-0">{m.backup_id || m.migrated_at.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {section === 'errors' && (
            <div className="space-y-3">
              {healthInfo && (
                <div className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-500" /> Sức khỏe máy chủ Backend</p>
                  <div className="flex justify-between"><span>Trạng thái</span><span className="text-emerald-500 font-bold">{healthInfo.status}</span></div>
                  <div className="flex justify-between"><span>Cơ sở dữ liệu</span><span>{healthInfo.database}</span></div>
                  <div className="flex justify-between"><span>Gemini Server Key</span><span>{healthInfo.geminiConfigured ? 'Đã cấu hình' : 'Chưa có Key'}</span></div>
                  <div className="flex justify-between"><span>Thời gian hoạt động</span><span className="font-mono-num">{healthInfo.uptimeSec}s</span></div>
                  <button
                    onClick={async () => {
                      const diag = await osApi.getDiagnostics();
                      const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `phoneos4-diagnostics-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast('Gói chẩn đoán', 'Đã xuất báo cáo chẩn đoán an toàn (đã che bí mật).', 'success');
                    }}
                    className="w-full mt-2 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Tải Gói chẩn đoán (Diagnostics JSON)
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="font-bold text-zinc-500 uppercase">Nhật ký sự cố ({data.systemErrors.length})</p>
                {data.systemErrors.length > 0 && (
                  <button
                    onClick={async () => {
                      await osApi.deleteSystemError('all');
                      await refreshData();
                    }}
                    className="text-rose-500 font-bold"
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>
              {data.systemErrors.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-zinc-500">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                  Hệ thống vận hành ổn định, chưa ghi nhận lỗi nào.
                </div>
              ) : (
                data.systemErrors.map((er) => (
                  <div key={er.id} className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-500">{er.app_id} · {er.error_code}</span>
                      <button
                        onClick={async () => {
                          await osApi.updateSystemError(er.id, !er.resolved);
                          await refreshData();
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${er.resolved ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}
                      >
                        {er.resolved ? 'Đã xử lý' : 'Đánh dấu xong'}
                      </button>
                    </div>
                    <p>{er.message}</p>
                    {er.detail && <p className="text-[10px] text-zinc-500 font-mono truncate">{er.detail}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'about' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <p className="font-display text-base font-bold">PHONE OS {activeOsVersion} — {updateInfo?.releaseName || 'System Edition'}</p>
                <p className="text-zinc-500">{data.apps.length} Ứng dụng tích hợp · Kiến trúc SQLite WAL + Gemini AI Server + PWA Android.</p>
                {isPwaInstalled ? (
                  <p className="text-emerald-500 font-bold">✓ Đang chạy ở chế độ Ứng dụng độc lập (PWA Standalone)</p>
                ) : canInstallPwa ? (
                  <button
                    onClick={promptPwaInstall}
                    className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-bold"
                  >
                    Cài đặt PHONE OS {activeOsVersion} lên Màn hình chính (PWA)
                  </button>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    Trên Chrome/Edge Android: Mở menu trình duyệt → chọn "Thêm vào Màn hình chính / Cài đặt ứng dụng" để dùng toàn màn hình như App.
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <p className="font-bold text-xs">Minh bạch phân loại tính năng (Loại A / B / C / D)</p>
                <p className="text-zinc-500">
                  <strong>Loại A (Nội bộ PHONE OS thật):</strong> Chat & TTS & STT & OCR & Dịch Gemini AI qua backend, Két sắt AES-256-GCM, Mã khóa & Mã khôi phục SHA-256, Bảng tính Office, Backup/Preview/Selective Restore SQLite Transaction, YouTube Watchlist, Music Playlists, RSS Podcast.
                </p>
                <p className="text-zinc-500">
                  <strong>Loại B (Dịch vụ Internet chính thức):</strong> YouTube Data API v3 + YouTube IFrame Embed chính thức, TMDB Discovery API, Thời tiết Open-Meteo, Tỷ giá Frankfurter, Bản đồ OpenStreetMap, Liên kết ngoài Spotify/Apple Music/Netflix.
                </p>
                <p className="text-zinc-500">
                  <strong>Loại C (Phụ thuộc thiết bị/hệ điều hành):</strong> Web Battery API, Camera/Mic getUserMedia, MediaSession API, GetDisplayMedia, PWA Install. Sinh trắc học phần cứng hay cài APK Android cần build wrapper Capacitor/TWA riêng.
                </p>
                <p className="text-zinc-500">
                  <strong>Loại D (Mô phỏng trung thực):</strong> Ngân hàng Demo (tiền ảo), Mua sắm & Đặt đồ ăn & Đặt xe, Nhà thông minh, Cuộc gọi AI, Wi-Fi/Bluetooth/VPN/NFC mô phỏng.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h1 className="font-display text-lg font-bold">Cài đặt Hệ thống</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-500 font-bold">v{activeOsVersion}</span>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        <button
          onClick={() => setSection('profile')}
          className="w-full p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-left"
        >
          <img src={p.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{p.name}</p>
            <p className="text-xs text-zinc-500 truncate">Tài khoản PHONE OS · @{p.username}</p>
          </div>
        </button>

        {[
          { id: 'integrations' as Section, label: 'Tích hợp API & Minh bạch (A/B/C/D)', icon: PlugZap, color: 'text-violet-500' },
          { id: 'battery' as Section, label: `Pin & Năng lượng (${p.battery_level}%)`, icon: BatteryCharging, color: 'text-emerald-500' },
          { id: 'network' as Section, label: 'Mạng, Wi-Fi, Bluetooth, VPN & NFC', icon: Wifi, color: 'text-sky-500' },
          { id: 'sound' as Section, label: 'Âm thanh, Nhạc chuông & Rung', icon: Volume2, color: 'text-violet-500' },
          { id: 'display' as Section, label: 'Hiển thị, Cử chỉ vuốt, AOD & Bàn phím', icon: Palette, color: 'text-fuchsia-500' },
          { id: 'focus' as Section, label: 'Chế độ Tập trung, DND & AI chủ động', icon: BellOff, color: 'text-indigo-500' },
          { id: 'security' as Section, label: 'Bảo mật, Mã khóa SHA-256 & Khôi phục', icon: Lock, color: 'text-emerald-600' },
          { id: 'privacy' as Section, label: 'Quyền riêng tư & Quyền ứng dụng', icon: Shield, color: 'text-amber-500' },
          { id: 'storage' as Section, label: 'Bộ nhớ & Dọn dẹp', icon: HardDrive, color: 'text-pink-500' },
          { id: 'backup' as Section, label: 'Sao lưu, Xem trước & Khôi phục chọn lọc', icon: CloudUpload, color: 'text-cyan-500' },
          { id: 'update' as Section, label: `Cập nhật Hệ điều hành (${activeOsVersion})`, icon: Sparkles, color: 'text-purple-500' },
          { id: 'errors' as Section, label: `Trung tâm Lỗi & Chẩn đoán (${data.systemErrors.filter((e) => !e.resolved).length})`, icon: ShieldAlert, color: 'text-rose-500' },
          { id: 'about' as Section, label: 'Giới thiệu, Cài PWA & Minh bạch', icon: Info, color: 'text-zinc-500' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className="w-full p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-left text-xs font-semibold hover:border-[#A78BFA]/40"
            >
              <Icon className={`w-4 h-4 ${item.color} shrink-0`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
