import crypto from 'crypto';
import type Database from 'better-sqlite3';

export type OsReleaseType = 'major' | 'minor' | 'patch';

export interface OsReleaseRecord {
  id: string;
  osName: string;
  version: string;
  releaseName: string;
  releaseType: OsReleaseType;
  releaseDate: string;
  buildNumber: string;
  summary: string;
  features: string[];
  uiUpgrades: string[];
  systemUpgrades: string[];
  performanceImprovements: string[];
  fixes: string[];
  optimizations: string[];
  compatibilityNotes: string[];
  isCurrent?: boolean;
  isLatest?: boolean;
  source?: string;
  createdAt?: string;
}

/**
 * SINGLE SOURCE OF TRUTH FOR PHONE OS RELEASES.
 *
 * Quy tắc phát hành trong tương lai (4.2.0, 4.3.0, 5.0.0...):
 * Chỉ cần thêm bản ghi phiên bản mới vào mảng OS_RELEASE_MANIFEST bên dưới
 * và cập nhật CURRENT_OS_VERSION. Khi máy chủ khởi động, syncOsVersionHistory(db)
 * sẽ TỰ ĐỘNG phát hiện, ghi nhận bản ghi lịch sử mới lên đầu danh sách,
 * cập nhật phiên bản hiện tại và giữ nguyên 100% lịch sử trước đó.
 */
export const OS_RELEASE_MANIFEST: OsReleaseRecord[] = [
  {
    id: 'ver_4_1_0',
    osName: 'PHONE OS',
    version: '4.1.0',
    releaseName: 'Lịch sử Phiên bản Toàn diện & Hệ thống Thẻ Ngân hàng Thực tế',
    releaseType: 'minor',
    releaseDate: '2026-11-19',
    buildNumber: '2026.11.19-4.1-SYSTEM',
    summary:
      'Nâng cấp toàn diện trang Cập nhật Hệ điều hành thành kho lưu trữ lịch sử phiên bản tự động ghi nhận bản phát hành mới; đồng thời chuẩn hóa hệ sinh thái thẻ ngân hàng thực tế, bảo mật PIN/CVV/khóa thẻ đa lớp, cổng thanh toán dùng chung liên ứng dụng và luồng hoàn tất hóa đơn hoàn tiền.',
    features: [
      'Hệ thống Lịch sử Phiên bản Toàn diện (Complete Version History) lưu trữ bền vững toàn bộ các bản phát hành PHONE OS trong SQLite.',
      'Cơ chế Auto-Changelog tự động phát hiện và ghi nhận bản cập nhật mới (4.1.0, 4.2.0, 5.0.0...) ngay khi phát hành mà không cần nhập thủ công.',
      'Tìm kiếm theo số phiên bản / tên bản cập nhật, lọc theo Phiên bản lớn, Phiên bản nhỏ, Bản vá lỗi, Năm phát hành và Xuất / Sao lưu / Khôi phục lịch sử JSON.',
      'Hệ thống Thẻ Ngân hàng Hikari Bank thực tế: phân loại thẻ Debit / Credit, số thẻ 16 số & CVV mã hóa AES-256-GCM, xem số thẻ/CVV & sao chép sau khi xác thực PIN.',
      'Đầy đủ vòng đời thẻ: Khóa thẻ tức thì, Mở khóa yêu cầu xác thực PIN, Đổi PIN thẻ, Cấp lại thẻ mới (giữ điểm & quyền lợi), Hủy thẻ và Đổi thiết kế thẻ.',
      'Cổng thanh toán bằng thẻ dùng chung (Universal Card Checkout) tích hợp cho Shopping, Đặt đồ ăn, Đặt xe, Anime Telecom, Phim & Series, Kho Nhạc, Kho Ứng dụng và Trình duyệt.',
    ],
    uiUpgrades: [
      'Thiết kế lại trang Cài đặt → Cập nhật Hệ điều hành với thẻ tổng quan phiên bản hiện tại, trạng thái hệ thống, tổng số bản phát hành và thẻ phiên bản đóng/mở linh hoạt.',
      'Gắn nhãn MỚI NHẤT cho phiên bản cao nhất cùng hệ thống biểu tượng phân biệt rõ ràng từng nhóm thay đổi (Tính năng, Giao diện, Hệ thống, Hiệu suất, Sửa lỗi, Tối ưu, Tương thích).',
      'Nâng cấp thẻ ngân hàng BankCardVisual hiển thị chip EMV, hạng thẻ, nhãn DEBIT/CREDIT, ngày phát hành, nút hiện/ẩn số thẻ & CVV và nhật ký giao dịch riêng trên từng thẻ.',
      'Cập nhật mục Hoàn tiền & Quẹt thẻ (CardBenefitsHub): tách rõ hóa đơn cần thanh toán và hóa đơn đã hoàn thành.',
    ],
    systemUpgrades: [
      'Xây dựng bảng os_version_history tách biệt khỏi giao diện, gắn ID duy nhất và tự động đồng bộ SemVer trên mỗi lần khởi động.',
      'Triển khai bộ xử lý thanh toán thẻ tập trung processUniversalCardPayment() kiểm tra 9 lớp bảo mật: trạng thái khóa (CARD_LOCKED), trạng thái hủy, tên chủ thẻ, hạn sử dụng, CVV hash, hạn mức/giao dịch/ngày/tháng/kênh Online-POS-Quốc tế và số dư khả dụng.',
      'Tự động ghi nhận giao dịch BỊ TỪ CHỐI (DECLINED) kèm lý do chi tiết và thông báo ngân hàng khi quẹt thẻ đang bị khóa hoặc sai thông tin, tuyệt đối không trừ tiền.',
      'Lưu trạng thái hóa đơn hoàn tiền (banking_card_bills) bền vững vào SQLite, đồng bộ trạng thái hoàn tất ngay sau khi thanh toán.',
    ],
    performanceImprovements: [
      'Thực thi đồng bộ lịch sử phiên bản trong transaction SQLite WAL đơn nhất khi khởi động máy chủ.',
      'Loại bỏ các trường mã hóa nhạy cảm (card_number_enc, cvv_enc, card_pin_hash) khỏi payload /api/banking/overview để giảm dung lượng và bảo mật dữ liệu.',
    ],
    fixes: [
      'Sửa lỗi mục thanh toán bằng thẻ trong phần Hoàn tiền không đánh dấu hoàn tất hóa đơn sau khi trả xong và vẫn cho thanh toán khi đã hết hóa đơn.',
      'Sửa lỗi hàm phát hành thẻ trước đây chưa lưu số thẻ mã hóa PAN, CVV hash, ngày phát hành và phân loại Debit/Credit.',
      'Sửa lỗi đồng bộ schema db_messages_v3.ts và db_banking.ts khiến một số cơ sở dữ liệu cũ thiếu cột khi khởi động.',
    ],
    optimizations: [
      'Đồng bộ trực tiếp Ví mô phỏng (WalletApp) với danh sách thẻ Hikari Bank theo thời gian thực qua sự kiện hệ thống.',
      'Thêm cơ chế chống trừ tiền lặp (Idempotency Key) cho mọi giao dịch thanh toán thẻ liên ứng dụng.',
    ],
    compatibilityNotes: [
      'Giữ nguyên 100% dữ liệu người dùng, tin nhắn, tài khoản ngân hàng và tự động nâng cấp dữ liệu vault cho các thẻ đã phát hành từ phiên bản 3.0 / 4.0.',
      'Giao dịch thẻ ngân hàng hoạt động trong môi trường mô phỏng nội bộ PHONE OS (Loại D), không kết nối cổng thanh toán tiền thật.',
    ],
  },
  {
    id: 'ver_4_0_0',
    osName: 'PHONE OS',
    version: '4.0.0',
    releaseName: 'Ultimate Experience & Entertainment Ecosystem',
    releaseType: 'major',
    releaseDate: '2026-11-17',
    buildNumber: '2026.11.17-4.0-ULTIMATE',
    summary:
      'Phiên bản nâng cấp lớn mang đến 3 ứng dụng giải trí chuẩn hóa (YouTube, Phim & Series, Kho Nhạc), bộ Design Tokens đồng nhất sáng/tối, cơ chế migration tự động có sao lưu từ 3.0 lên 4.0 cùng hàng loạt nâng cấp Launcher và Bảo mật.',
    features: [
      'Bổ sung 3 ứng dụng giải trí chuẩn hóa: YouTube (IFrame nhúng + YouTube Data API), Phim & Series (Khám phá & liên kết bản quyền), Kho Nhạc (Playlist SQLite + Spotify/Apple Music adapter).',
      'Hệ thống Design Tokens iOS-inspired thống nhất sáng/tối + AOD Màn hình khóa + Quên mã PIN khôi phục an toàn (SHA-256) + Trung tâm Khôi phục khi khởi động lỗi.',
      'Launcher nâng cấp: Hoàn tác bố cục, sắp xếp Thư viện ứng dụng, Cửa sổ nổi (Floating Window), cử chỉ & độ nhạy tùy chỉnh.',
      'Podcast RSS Parser thực tế + Hẹn giờ tắt; Video Player nạp phụ đề .vtt/.srt + PiP; Khôi phục từng phần (Selective Restore) & Xuất/Xóa dữ liệu cá nhân.',
    ],
    uiUpgrades: [
      'Đồng bộ bảng màu Design Tokens và các component chuẩn hóa OSDesignSystem trên toàn bộ ứng dụng.',
      'Tích hợp màn hình khóa AOD với đồng hồ tùy biến và điều khiển phát nhạc trực tiếp.',
    ],
    systemUpgrades: [
      'Cơ chế Auto-Migration 3.0 -> 4.0 kèm tự động chụp bản sao lưu an toàn bak_pre_os4_auto trước khi nâng cấp lược đồ CSDL.',
      'Hệ sinh thái Ngân hàng Hikari Bank & Viễn thông Anime Telecom liên kết hai chiều.',
    ],
    performanceImprovements: [],
    fixes: [
      'Đồng bộ MediaSession API cho điều khiển phát trên Màn hình khóa & Trung tâm Điều khiển.',
      'Gắn nhãn phân loại trung thực Loại A/B/C/D trên toàn bộ ứng dụng và Cài đặt.',
    ],
    optimizations: [],
    compatibilityNotes: [
      'Ứng dụng bên thứ ba bị giới hạn DRM (Netflix, Disney+, Spotify) mở qua liên kết chính thức thay vì vượt DRM.',
      'Sinh trắc học gốc, đọc/gửi SMS/SIM và điều khiển phần cứng hệ thống Android cần đóng gói Capacitor Native.',
    ],
  },
  {
    id: 'ver_3_0_0',
    osName: 'PHONE OS',
    version: '3.0.0',
    releaseName: 'Living AI World & Life Apps LTS',
    releaseType: 'major',
    releaseDate: '2026-11-17',
    buildNumber: '2026.11.17-3.0-LTS',
    summary:
      'Mở rộng hệ điều hành lên 40 ứng dụng đời thực, nâng cấp thế giới nhân vật Living AI World 7 chỉ số quan hệ và hoàn thiện lõi hệ điều hành với sao lưu/khôi phục có Rollback.',
    features: [
      'Bổ sung 8 ứng dụng đời thực: Podcast, Mua sắm, Đặt đồ ăn, Ngân hàng mô phỏng, Đặt xe, Office, Cộng đồng, Nhà thông minh.',
      'Nâng cấp Living AI World: 7 chỉ số quan hệ, Story & Event Engine, Nhóm chat đa nhân vật, Video Call mô phỏng.',
      'Hệ điều hành: Pin & Tiết kiệm pin, Mạng Wi-Fi/BT/VPN/NFC mô phỏng, Âm thanh & Rung, Bàn phím ảo + Clipboard, Quyền ứng dụng, Bộ nhớ, Sao lưu/Khôi phục có Rollback, Chia đôi màn hình & PiP.',
    ],
    uiUpgrades: [],
    systemUpgrades: [
      'Cơ sở dữ liệu SQLite WAL đa mô-đun hỗ trợ backup nguyên khối và khôi phục an toàn.',
    ],
    performanceImprovements: [],
    fixes: [
      'Mã hóa băm SHA-256 cho mã khóa PIN/Mật khẩu.',
      'Hàng đợi tin nhắn ngoại tuyến không mất nội dung đang nhập.',
    ],
    optimizations: [],
    compatibilityNotes: [
      'Pin phần cứng, Wi-Fi/Bluetooth/VPN hệ thống và thanh toán ngân hàng hoạt động ở chế độ mô phỏng trong trình duyệt web.',
    ],
  },
  {
    id: 'ver_2_0_0',
    osName: 'PHONE OS',
    version: '2.0.0',
    releaseName: 'Core OS & Vietnamese AI Foundation',
    releaseType: 'major',
    releaseDate: '2026-11-10',
    buildNumber: '2026.11.10-2.0-CORE',
    summary:
      'Phiên bản nền tảng đầu tiên được ghi nhận trong hệ thống với 32 ứng dụng cốt lõi, trợ lý AI Gemini và trải nghiệm giao diện tiếng Việt toàn diện.',
    features: [
      '32 ứng dụng cốt lõi & Trợ lý AI Gemini.',
      'Việt hóa toàn diện hệ thống.',
    ],
    uiUpgrades: [],
    systemUpgrades: [],
    performanceImprovements: [
      'Tối ưu phản hồi tin nhắn 0ms optimistic UI.',
    ],
    fixes: [
      'Tối ưu phản hồi tin nhắn 0ms optimistic UI.',
    ],
    optimizations: [],
    compatibilityNotes: [],
  },
];

export const CURRENT_OS_VERSION = OS_RELEASE_MANIFEST[0].version;
export const CURRENT_BUILD_NUMBER = OS_RELEASE_MANIFEST[0].buildNumber;
export const CURRENT_RELEASE_DATE = OS_RELEASE_MANIFEST[0].releaseDate;

export function parseSemver(version: string): [number, number, number] {
  const clean = String(version || '0.0.0').replace(/^v/i, '').trim();
  const parts = clean.split('.').map((p) => {
    const n = parseInt(p.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function compareSemverDesc(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPat - aPat;
}

export function classifyReleaseType(version: string, explicit?: string): OsReleaseType {
  if (explicit === 'major' || explicit === 'minor' || explicit === 'patch') {
    return explicit;
  }
  const [, minor, patch] = parseSemver(version);
  if (patch > 0) return 'patch';
  if (minor > 0) return 'minor';
  return 'major';
}

function parseStringArrayJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    // ignore invalid json
  }
  return [];
}

function ensureVersionHistoryTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS os_version_history (
      id TEXT PRIMARY KEY,
      os_name TEXT NOT NULL DEFAULT 'PHONE OS',
      version TEXT NOT NULL UNIQUE,
      release_name TEXT NOT NULL,
      release_type TEXT NOT NULL DEFAULT 'minor',
      release_date TEXT NOT NULL,
      build_number TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      features_json TEXT DEFAULT '[]',
      ui_upgrades_json TEXT DEFAULT '[]',
      system_upgrades_json TEXT DEFAULT '[]',
      performance_improvements_json TEXT DEFAULT '[]',
      fixes_json TEXT DEFAULT '[]',
      optimizations_json TEXT DEFAULT '[]',
      compatibility_notes_json TEXT DEFAULT '[]',
      is_current INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manifest',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_os_ver_hist_date ON os_version_history(release_date DESC);
  `);
}

export function syncOsVersionHistory(db: Database.Database): {
  currentVersion: string;
  newlyRecordedVersions: string[];
} {
  ensureVersionHistoryTable(db);
  const now = new Date().toISOString();

  const existingRows = db
    .prepare('SELECT id, version, is_current FROM os_version_history')
    .all() as Array<{ id: string; version: string; is_current: number }>;
  const existingVersions = new Set(existingRows.map((r) => String(r.version)));
  const prevCurrent = existingRows.find((r) => Number(r.is_current) === 1)?.version || '';

  const newlyRecordedVersions: string[] = [];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO os_version_history (
      id, os_name, version, release_name, release_type, release_date, build_number, summary,
      features_json, ui_upgrades_json, system_upgrades_json, performance_improvements_json,
      fixes_json, optimizations_json, compatibility_notes_json, is_current, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'manifest', ?)
  `);

  const run = db.transaction(() => {
    for (const rel of OS_RELEASE_MANIFEST) {
      const cleanVer = String(rel.version).trim();
      if (!cleanVer) continue;
      if (!existingVersions.has(cleanVer)) {
        insertStmt.run(
          rel.id || `ver_${cleanVer.replace(/\./g, '_')}`,
          rel.osName || 'PHONE OS',
          cleanVer,
          rel.releaseName,
          classifyReleaseType(cleanVer, rel.releaseType),
          rel.releaseDate,
          rel.buildNumber || '',
          rel.summary || '',
          JSON.stringify(rel.features || []),
          JSON.stringify(rel.uiUpgrades || []),
          JSON.stringify(rel.systemUpgrades || []),
          JSON.stringify(rel.performanceImprovements || []),
          JSON.stringify(rel.fixes || []),
          JSON.stringify(rel.optimizations || []),
          JSON.stringify(rel.compatibilityNotes || []),
          now
        );
        existingVersions.add(cleanVer);
        newlyRecordedVersions.push(cleanVer);
      }
    }

    const allVersions = (
      db.prepare('SELECT version FROM os_version_history').all() as Array<{ version: string }>
    )
      .map((r) => r.version)
      .sort(compareSemverDesc);

    const latestVersion = allVersions[0] || CURRENT_OS_VERSION;
    db.prepare('UPDATE os_version_history SET is_current = CASE WHEN version = ? THEN 1 ELSE 0 END').run(latestVersion);

    try {
      db.prepare("UPDATE user_profile SET schema_version = ? WHERE id = 'user_1'").run(latestVersion);
    } catch {
      // ignore if user_profile not created yet
    }

    // Auto-record migration audit & OS notification when a newer version is first discovered
    if (newlyRecordedVersions.length > 0 && newlyRecordedVersions.includes(latestVersion)) {
      const fromVer = prevCurrent && prevCurrent !== latestVersion ? prevCurrent : allVersions[1] || '3.0.0';
      const migId = `mig_${fromVer.replace(/\./g, '_')}_to_${latestVersion.replace(/\./g, '_')}`;
      const manifestEntry = OS_RELEASE_MANIFEST.find((r) => r.version === latestVersion);
      try {
        db.prepare(`
          INSERT OR IGNORE INTO os_migrations (id, from_version, to_version, backup_id, status, detail, migrated_at)
          VALUES (?, ?, ?, '', 'completed', ?, ?)
        `).run(
          migId,
          fromVer,
          latestVersion,
          `Tự động ghi nhận phát hành PHONE OS ${latestVersion}${manifestEntry?.releaseName ? ` (${manifestEntry.releaseName})` : ''}.`,
          now
        );
      } catch {
        // ignore if os_migrations doesn't exist
      }

      if (prevCurrent && prevCurrent !== latestVersion) {
        try {
          db.prepare(`
            INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at)
            VALUES (?, 'settings', 'Cập nhật hệ thống', ?, ?, 'settings', 'update', 1, 0, ?)
          `).run(
            `notif_os_${latestVersion.replace(/\./g, '_')}_${Date.now()}`,
            `Đã cập nhật PHONE OS ${latestVersion}`,
            manifestEntry?.releaseName || 'Bản ghi lịch sử phiên bản mới đã được lưu tự động.',
            now
          );
        } catch {
          // ignore if notifications table missing
        }
      }
    }

    return latestVersion;
  });

  const currentVersion = run();
  return { currentVersion, newlyRecordedVersions };
}

export function listOsVersionHistory(db: Database.Database): OsReleaseRecord[] {
  ensureVersionHistoryTable(db);
  let rows = db.prepare('SELECT * FROM os_version_history').all() as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    syncOsVersionHistory(db);
    rows = db.prepare('SELECT * FROM os_version_history').all() as Array<Record<string, unknown>>;
  }

  const sorted = rows
    .map((r): OsReleaseRecord => {
      const version = String(r.version || '');
      return {
        id: String(r.id || `ver_${version.replace(/\./g, '_')}`),
        osName: String(r.os_name || 'PHONE OS'),
        version,
        releaseName: String(r.release_name || `PHONE OS ${version}`),
        releaseType: classifyReleaseType(version, String(r.release_type || '')),
        releaseDate: String(r.release_date || ''),
        buildNumber: String(r.build_number || ''),
        summary: String(r.summary || ''),
        features: parseStringArrayJson(r.features_json),
        uiUpgrades: parseStringArrayJson(r.ui_upgrades_json),
        systemUpgrades: parseStringArrayJson(r.system_upgrades_json),
        performanceImprovements: parseStringArrayJson(r.performance_improvements_json),
        fixes: parseStringArrayJson(r.fixes_json),
        optimizations: parseStringArrayJson(r.optimizations_json),
        compatibilityNotes: parseStringArrayJson(r.compatibility_notes_json),
        isCurrent: Boolean(r.is_current),
        isLatest: false,
        source: String(r.source || 'manifest'),
        createdAt: String(r.created_at || ''),
      };
    })
    .sort((a, b) => compareSemverDesc(a.version, b.version));

  if (sorted.length > 0) {
    sorted[0].isLatest = true;
  }
  return sorted;
}

export function getLatestOsRelease(db: Database.Database): OsReleaseRecord {
  const list = listOsVersionHistory(db);
  return list.find((v) => v.isCurrent) || list[0] || OS_RELEASE_MANIFEST[0];
}

export function getOsVersionHistoryPayload(db: Database.Database) {
  const versions = listOsVersionHistory(db);
  const current = versions.find((v) => v.isCurrent) || versions[0] || OS_RELEASE_MANIFEST[0];
  let migrations: unknown[] = [];
  try {
    migrations = db.prepare('SELECT * FROM os_migrations ORDER BY migrated_at DESC').all();
  } catch {
    migrations = [];
  }

  const years = Array.from(
    new Set(
      versions
        .map((v) => String(v.releaseDate || '').slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y))
    )
  ).sort((a, b) => Number(b) - Number(a));

  return {
    osName: current.osName || 'PHONE OS',
    currentVersion: current.version,
    releaseName: current.releaseName,
    buildNumber: current.buildNumber || CURRENT_BUILD_NUMBER,
    releaseDate: current.releaseDate || CURRENT_RELEASE_DATE,
    systemStatus: 'Hoạt động ổn định · Tự động ghi nhận lịch sử',
    updateAvailable: false,
    totalVersions: versions.length,
    years,
    serverNote: `Hệ thống đang vận hành ${current.osName} ${current.version} (${current.releaseName}). Toàn bộ ${versions.length} phiên bản đã phát hành được lưu trữ bền vững trong lịch sử hệ thống.`,
    migrations,
    versions: versions.map((v) => ({
      ...v,
      // Backward compatible aliases
      date: v.releaseDate,
      knownIssues: v.compatibilityNotes,
    })),
  };
}

export function exportOsVersionHistory(db: Database.Database) {
  const versions = listOsVersionHistory(db);
  const exportedAt = new Date().toISOString();
  const payload = {
    schema: 'phone_os_version_history_backup_v1',
    osName: 'PHONE OS',
    exportedAt,
    totalVersions: versions.length,
    versions,
  };
  const integrityHash = crypto.createHash('sha256').update(JSON.stringify(versions)).digest('hex');
  return { ...payload, integrityHash };
}

export function restoreOsVersionHistory(
  db: Database.Database,
  rawPayload: unknown
): { imported: number; skippedExisting: number; totalVersions: number } {
  ensureVersionHistoryTable(db);

  const listRaw: unknown[] = Array.isArray(rawPayload)
    ? rawPayload
    : rawPayload && typeof rawPayload === 'object' && Array.isArray((rawPayload as { versions?: unknown[] }).versions)
    ? (rawPayload as { versions: unknown[] }).versions
    : [];

  if (listRaw.length === 0) {
    throw new Error('Dữ liệu khôi phục không chứa danh sách phiên bản hợp lệ.');
  }

  const now = new Date().toISOString();
  let imported = 0;
  let skippedExisting = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO os_version_history (
      id, os_name, version, release_name, release_type, release_date, build_number, summary,
      features_json, ui_upgrades_json, system_upgrades_json, performance_improvements_json,
      fixes_json, optimizations_json, compatibility_notes_json, is_current, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'restored', ?)
  `);

  const run = db.transaction(() => {
    for (const item of listRaw) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const version = String(obj.version || '').trim();
      if (!/^\d+\.\d+\.\d+$/.test(version)) continue;

      const exists = db.prepare('SELECT id FROM os_version_history WHERE version = ?').get(version);
      if (exists) {
        skippedExisting++;
        continue;
      }

      const id = String(obj.id || `ver_${version.replace(/\./g, '_')}_${Date.now()}`);
      const releaseDate = String(obj.releaseDate || obj.date || now.slice(0, 10)).slice(0, 10);
      const releaseName = String(obj.releaseName || `PHONE OS ${version}`).trim();
      const releaseType = classifyReleaseType(version, String(obj.releaseType || ''));
      const compatibility = obj.compatibilityNotes ?? obj.knownIssues;

      const info = insertStmt.run(
        id,
        String(obj.osName || 'PHONE OS'),
        version,
        releaseName,
        releaseType,
        releaseDate,
        String(obj.buildNumber || ''),
        String(obj.summary || ''),
        JSON.stringify(parseStringArrayJson(obj.features)),
        JSON.stringify(parseStringArrayJson(obj.uiUpgrades)),
        JSON.stringify(parseStringArrayJson(obj.systemUpgrades)),
        JSON.stringify(parseStringArrayJson(obj.performanceImprovements)),
        JSON.stringify(parseStringArrayJson(obj.fixes)),
        JSON.stringify(parseStringArrayJson(obj.optimizations)),
        JSON.stringify(parseStringArrayJson(compatibility)),
        String(obj.createdAt || now)
      );
      if (info.changes > 0) imported++;
    }

    const allVersions = (
      db.prepare('SELECT version FROM os_version_history').all() as Array<{ version: string }>
    )
      .map((r) => r.version)
      .sort(compareSemverDesc);

    const latest = allVersions[0] || CURRENT_OS_VERSION;
    db.prepare('UPDATE os_version_history SET is_current = CASE WHEN version = ? THEN 1 ELSE 0 END').run(latest);
    return allVersions.length;
  });

  const totalVersions = run();
  return { imported, skippedExisting, totalVersions };
}
