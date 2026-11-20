import crypto from 'crypto';
import type Database from 'better-sqlite3';
import {
  getBankDefinition,
  hashCvv,
  hashPan,
  normalizePanDigits,
} from './db_cards.ts';
import {
  CardEngineHttpError,
  isCardExpiredLocal,
  processUniversalCardPayment,
} from './card_engine.ts';

export type YouTubePlanId = 'free' | 'basic' | 'standard' | 'premium';
export type MovieAccessType = 'FREE' | 'PREMIUM' | 'RENT' | 'BUY' | 'LOCKED';

export interface YouTubePlanConfig {
  id: YouTubePlanId;
  name: string;
  tagline: string;
  price: number;
  maxQuality: '480p' | '720p' | '1080p' | '4K';
  maxDevices: number;
  adFree: boolean;
  adFreeScope: string;
  downloadSupported: boolean;
  exclusivePriority: boolean;
  badge?: string;
  features: string[];
}

export const YOUTUBE_PLANS: Record<YouTubePlanId, YouTubePlanConfig> = {
  free: {
    id: 'free',
    name: 'Miễn phí',
    tagline: 'Xem video & nội dung miễn phí cơ bản',
    price: 0,
    maxQuality: '480p',
    maxDevices: 1,
    adFree: false,
    adFreeScope: 'Có quảng cáo tiêu chuẩn',
    downloadSupported: false,
    exclusivePriority: false,
    features: [
      'Xem video YouTube & phim gắn nhãn FREE',
      'Chất lượng tiêu chuẩn tối đa 480p–720p',
      '1 thiết bị cùng lúc',
      'Thuê hoặc mua lẻ từng phim điện ảnh',
    ],
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    tagline: 'Khởi đầu không quảng cáo trong kho Premium',
    price: 49000,
    maxQuality: '720p',
    maxDevices: 1,
    adFree: true,
    adFreeScope: 'Không quảng cáo trong nội dung Premium',
    downloadSupported: false,
    exclusivePriority: false,
    badge: 'Tiết kiệm',
    features: [
      'Xem nội dung Premium cơ bản',
      'Chất lượng HD tối đa 720p',
      'Xem trên 1 thiết bị',
      'Không quảng cáo trong nội dung Premium',
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    tagline: 'Toàn bộ kho phim Full HD & tải xem ngoại tuyến',
    price: 79000,
    maxQuality: '1080p',
    maxDevices: 2,
    adFree: true,
    adFreeScope: 'Không quảng cáo toàn nền tảng',
    downloadSupported: true,
    exclusivePriority: false,
    badge: 'Phổ biến nhất',
    features: [
      'Toàn bộ nội dung Premium & Series',
      'Chất lượng Full HD tối đa 1080p',
      'Xem đồng thời trên 2 thiết bị',
      'Không quảng cáo hoàn toàn',
      'Tải xuống nội dung được hỗ trợ',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    tagline: 'Trải nghiệm rạp chiếu 4K HDR & ưu tiên độc quyền',
    price: 129000,
    maxQuality: '4K',
    maxDevices: 4,
    adFree: true,
    adFreeScope: 'Không quảng cáo toàn nền tảng',
    downloadSupported: true,
    exclusivePriority: true,
    badge: 'Cao cấp nhất',
    features: [
      'Toàn bộ nội dung Premium & Phim chiếu sớm',
      'Chất lượng tối đa 4K Ultra HD (khi nguồn hỗ trợ)',
      'Xem đồng thời trên 4 thiết bị',
      'Không quảng cáo trên mọi video & phim',
      'Tải xuống nội dung không giới hạn',
      'Ưu tiên xem Series độc quyền sớm nhất',
    ],
  },
};

export const YOUTUBE_MOVIE_CATEGORIES = [
  'Tất cả',
  'Phim hành động',
  'Phim tình cảm',
  'Phim kinh dị',
  'Phim hoạt hình',
  'Anime',
  'Khoa học viễn tưởng',
  'Hài hước',
  'Tài liệu',
  'Phim truyền hình',
  'Series độc quyền',
] as const;

const PLAN_RANK: Record<YouTubePlanId, number> = {
  free: 0,
  basic: 1,
  standard: 2,
  premium: 3,
};

const QUALITY_ORDER = ['360p', '480p', '720p', '1080p', '1440p', '4K'] as const;

export function capQuality(planMax: string, sourceMax: string): string {
  const pIdx = QUALITY_ORDER.indexOf(planMax as (typeof QUALITY_ORDER)[number]);
  const sIdx = QUALITY_ORDER.indexOf(sourceMax as (typeof QUALITY_ORDER)[number]);
  const maxIdx = Math.min(pIdx >= 0 ? pIdx : 2, sIdx >= 0 ? sIdx : 3);
  return QUALITY_ORDER[Math.max(0, maxIdx)] || '720p';
}

function ytUid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function formatVndYt(amount: number): string {
  return `${Math.round(Number(amount || 0)).toLocaleString('de-DE')}đ`;
}

function addDaysIso(baseIso: string | Date, days: number): string {
  const d = baseIso instanceof Date ? new Date(baseIso.getTime()) : new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function normalizeHolder(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export class YouTubePaymentHttpError extends Error {
  statusCode: number;
  code: string;
  bankCode?: string;
  reason: string;
  constructor(statusCode: number, message: string, code: string, bankCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.bankCode = bankCode;
    this.reason = message;
  }
}

interface SeedMovieEpisode {
  episodeNumber: number;
  title: string;
  durationLabel: string;
  durationSec: number;
  synopsis: string;
  accentColor: string;
  subtitles: Array<{ startSec: number; endSec: number; vi: string; en: string }>;
}

function buildEpisodeSubtitles(title: string, epNum: number): SeedMovieEpisode['subtitles'] {
  return [
    {
      startSec: 0,
      endSec: 7,
      vi: `[Tập ${epNum}] ${title} — Mở đầu phân cảnh độ phân giải cao`,
      en: `[Ep ${epNum}] ${title} — Opening sequence in Cinema HDR`,
    },
    {
      startSec: 7,
      endSec: 16,
      vi: 'Tín hiệu từ trung tâm điều phối vừa phát đi thông điệp khẩn lúc nửa đêm.',
      en: 'Signals from command headquarters just transmitted an urgent midnight dispatch.',
    },
    {
      startSec: 16,
      endSec: 26,
      vi: '“Nếu chúng ta không hành động ngay bây giờ, cánh cổng thời gian sẽ khép lại mãi mãi.”',
      en: '“If we do not act right now, the gateway will close forever.”',
    },
    {
      startSec: 26,
      endSec: 38,
      vi: 'Âm thanh trầm ấm vang lên giữa màn mưa neon trên tầng tháp quan sát.',
      en: 'A deep resonant hum echoes across the rain-lit neon observation deck.',
    },
    {
      startSec: 38,
      endSec: 52,
      vi: 'Hành trình bước sang bước ngoặt mới — cảm ơn bạn đã thưởng thức trên YouTube Cinema.',
      en: 'The journey reaches a turning point — thank you for watching on YouTube Cinema.',
    },
  ];
}

const SEED_YOUTUBE_MOVIES = [
  {
    id: 'mov_yt_orbital_sky',
    title: 'Tháp Quỹ Đạo Tokyo 2099',
    original_title: 'Orbital Spire 2099',
    description:
      'Năm 2099, thang máy quỹ đạo nối Tokyo với trạm không gian Aether gặp sự cố lượng tử bí ẩn. Hai kỹ sư trẻ phải vượt qua 80 tầng khí quyển để cứu lấy nguồn năng lượng của toàn thành phố.',
    genre: 'Khoa học viễn tưởng · Series độc quyền',
    categories: ['Khoa học viễn tưởng', 'Series độc quyền', 'Anime'],
    content_kind: 'exclusive',
    access_type: 'PREMIUM' as MovieAccessType,
    min_tier: 'basic' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/poster_abyss_scifi_1795104740946.jpg',
    backdrop_url: '/src/assets/images/cinema_hero_banner_1795104737657.jpg',
    year: 2026,
    duration_label: '6 Tập · 48p/tập',
    duration_sec: 180,
    rating: 9.2,
    cast: ['Haruto Sato', 'Yuki Shirakawa', 'Rei Takahashi'],
    director: 'Makoto Shinoda',
    trailer_video_id: 'LXb3EKWsInQ',
    episodes: [1, 2, 3, 4, 5, 6].map((n) => ({
      episodeNumber: n,
      title:
        n === 1
          ? 'Tập 1: Tầng Khí Quyển Số 0'
          : n === 2
          ? 'Tập 2: Tín Hiệu Mất Kết Nối'
          : n === 3
          ? 'Tập 3: Cầu Kính Giữa Tinh Vân'
          : n === 4
          ? 'Tập 4: Ký Ức Hộp Đen'
          : n === 5
          ? 'Tập 5: Vượt Trọng Lực'
          : 'Tập 6: Bình Minh Quỹ Đạo',
      durationLabel: `${42 + n} phút`,
      durationSec: 180 + n * 15,
      synopsis: `Diễn biến chương ${n} trên thang máy quỹ đạo Tokyo 2099 với hình ảnh HDR sống động.`,
      accentColor: '#E11D48',
      subtitles: buildEpisodeSubtitles('Tháp Quỹ Đạo Tokyo 2099', n),
    })),
    is_trending: 1,
    is_new_release: 1,
    is_featured: 1,
    is_exclusive: 1,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 1,
  },
  {
    id: 'mov_yt_cyber_katana',
    title: 'Lưỡi Kiếm Đêm Shibuya',
    original_title: 'Neon Ronin: Shibuya Storm',
    description:
      'Giữa cơn bão điện từ tại Neo-Shibuya, một kiếm sĩ mang giáp phản lực truy tìm tập đoàn đứng sau vụ đánh cắp trí tuệ nhân tạo cổ đại.',
    genre: 'Phim hành động · Anime',
    categories: ['Phim hành động', 'Anime', 'Khoa học viễn tưởng'],
    content_kind: 'movie',
    access_type: 'PREMIUM' as MovieAccessType,
    min_tier: 'basic' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/poster_cyber_action_1795104741176.jpg',
    backdrop_url: '/src/assets/images/social_neon_street_1794918924716.jpg',
    year: 2026,
    duration_label: '128 phút',
    duration_sec: 210,
    rating: 8.9,
    cast: ['Kenji Kuroda', 'Kaede Morita', 'Akira Hayate'],
    director: 'Takeshi Kojima',
    trailer_video_id: 'aqz-KE-bpKQ',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Bản Điện Ảnh Đầy Đủ (Director Cut)',
        durationLabel: '128 phút',
        durationSec: 210,
        synopsis: 'Trận chiến đỉnh cao giữa màn mưa sấm sét trên tầng thượng Shibuya.',
        accentColor: '#DC2626',
        subtitles: buildEpisodeSubtitles('Lưỡi Kiếm Đêm Shibuya', 1),
      },
    ],
    is_trending: 1,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 2,
  },
  {
    id: 'mov_yt_sakura_crossing',
    title: 'Ga Tàu Mùa Hoa Anh Đào',
    original_title: 'Sakura Platform 07',
    description:
      'Mỗi mùa hoa anh đào nở tại sân ga ngoại ô Kyoto, hai người bạn thuở nhỏ lại tìm thấy những bức thư bị thất lạc từ năm năm trước.',
    genre: 'Phim tình cảm · Anime',
    categories: ['Phim tình cảm', 'Anime'],
    content_kind: 'movie',
    access_type: 'PREMIUM' as MovieAccessType,
    min_tier: 'basic' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/poster_sakura_romance_1795104741540.jpg',
    backdrop_url: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
    year: 2025,
    duration_label: '112 phút',
    duration_sec: 195,
    rating: 9.0,
    cast: ['Sakura Fujimoto', 'Sora Kazama'],
    director: 'Haruka Shinkai',
    trailer_video_id: 'jfKfPfyJRdk',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Phim Điện Ảnh Full HD',
        durationLabel: '112 phút',
        durationSec: 195,
        synopsis: 'Câu chuyện tình yêu trong trẻo dưới nắng chiều và cánh hoa anh đào.',
        accentColor: '#F43F5E',
        subtitles: buildEpisodeSubtitles('Ga Tàu Mùa Hoa Anh Đào', 1),
      },
    ],
    is_trending: 1,
    is_new_release: 0,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '1080p',
    locked_reason: '',
    sort_order: 3,
  },
  {
    id: 'mov_yt_torii_shadow',
    title: 'Đèn Lồng Đỏ Rừng Tuyết Tùng',
    original_title: 'Lantern Beyond the Torii',
    description:
      'Đoàn làm phim tài liệu bước qua cổng Torii bị bỏ hoang giữa rừng sâu Nagano và phát hiện ra nghi lễ ánh sáng lặp lại sau mỗi 33 năm.',
    genre: 'Phim kinh dị',
    categories: ['Phim kinh dị', 'Phim truyền hình'],
    content_kind: 'series',
    access_type: 'PREMIUM' as MovieAccessType,
    min_tier: 'standard' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/poster_crimson_mystery_1795104741095.jpg',
    backdrop_url: '/src/assets/images/poster_crimson_mystery_1795104741095.jpg',
    year: 2026,
    duration_label: '4 Tập · 52p/tập',
    duration_sec: 175,
    rating: 8.7,
    cast: ['Mei Lin', 'Haruto Kurosawa', 'Ryo Naruse'],
    director: 'Kiyoshi Mori',
    trailer_video_id: '4xDzrJKXOOY',
    episodes: [1, 2, 3, 4].map((n) => ({
      episodeNumber: n,
      title: `Tập ${n}: ${['Cổng Đá Sương Mù', 'Ánh Đèn Nửa Đêm', 'Băng Ghi Âm Thất Lạc', 'Bình Minh Rừng Tuyết Tùng'][n - 1]}`,
      durationLabel: '52 phút',
      durationSec: 175,
      synopsis: `Phần ${n} giải mã bí ẩn ngọn đèn lồng đỏ tại rừng Nagano.`,
      accentColor: '#0F766E',
      subtitles: buildEpisodeSubtitles('Đèn Lồng Đỏ Rừng Tuyết Tùng', n),
    })),
    is_trending: 0,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 4,
  },
  {
    id: 'mov_yt_starlight_stage',
    title: 'Ánh Sao Sân Khấu Độc Quyền',
    original_title: 'Starlight Encore Exclusive',
    description:
      'Hậu trường chưa từng công bố và đại nhạc hội 4K HDR độc quyền của nhóm thần tượng Lena & Ren tại Tokyo Dome.',
    genre: 'Series độc quyền · Phim truyền hình',
    categories: ['Series độc quyền', 'Phim truyền hình', 'Phim tình cảm'],
    content_kind: 'exclusive',
    access_type: 'PREMIUM' as MovieAccessType,
    min_tier: 'premium' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/char_lena_starlight_1795088463461.jpg',
    backdrop_url: '/src/assets/images/social_music_live_1794918926157.jpg',
    year: 2026,
    duration_label: '5 Tập · 45p/tập',
    duration_sec: 190,
    rating: 9.4,
    cast: ['Lena Starlight', 'Ren Tachibana', 'Yuki Shirakawa'],
    director: 'Aoi Mizuno',
    trailer_video_id: '5qap5aO4i9A',
    episodes: [1, 2, 3, 4, 5].map((n) => ({
      episodeNumber: n,
      title: `Tập ${n}: ${['Ánh Đèn Tập Luyện', 'Nốt Nhạc Bị Giấu', 'Trước Giờ G', 'Đêm Diễn Tokyo Dome', 'Lời Hứa Encore'][n - 1]}`,
      durationLabel: '45 phút',
      durationSec: 190,
      synopsis: `Series độc quyền dành riêng cho hội viên YouTube Premium.`,
      accentColor: '#7C3AED',
      subtitles: buildEpisodeSubtitles('Ánh Sao Sân Khấu Độc Quyền', n),
    })),
    is_trending: 1,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 1,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 5,
  },
  {
    id: 'mov_yt_ocean_doc',
    title: 'Đại Dương Sâu Thẳm: Nhịp Thở Xanh',
    original_title: 'Deep Blue Resonance',
    description:
      'Hành trình quay phim 3 năm theo dấu đàn cá voi lưng gù và sinh vật phát quang dưới rãnh đại dương Thái Bình Dương.',
    genre: 'Tài liệu',
    categories: ['Tài liệu'],
    content_kind: 'documentary',
    access_type: 'FREE' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/poster_ocean_doc_1795104741045.jpg',
    backdrop_url: '/src/assets/images/poster_ocean_doc_1795104741045.jpg',
    year: 2025,
    duration_label: '74 phút',
    duration_sec: 165,
    rating: 9.1,
    cast: ['TS. Hải Dương Minh Khang (Dẫn chuyện)'],
    director: 'Elena Vance',
    trailer_video_id: 'LXb3EKWsInQ',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Phim Tài Liệu Đầy Đủ',
        durationLabel: '74 phút',
        durationSec: 165,
        synopsis: 'Khám phá hệ sinh thái san hô phát quang và hành trình di cư của cá voi xanh.',
        accentColor: '#0284C7',
        subtitles: buildEpisodeSubtitles('Đại Dương Sâu Thẳm', 1),
      },
    ],
    is_trending: 1,
    is_new_release: 0,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 6,
  },
  {
    id: 'mov_yt_saigon_comedy',
    title: 'Tiệm Cà Phê Bất Ổn',
    original_title: 'Midnight Cafe Chaos',
    description:
      'Ba người bạn mở quán cà phê xuyên đêm giữa trung tâm thành phố, nơi mỗi vị khách ghé qua đều kéo theo những tình huống dở khóc dở cười.',
    genre: 'Hài hước · Phim truyền hình',
    categories: ['Hài hước', 'Phim truyền hình'],
    content_kind: 'tv_show',
    access_type: 'FREE' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    backdrop_url: '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    year: 2026,
    duration_label: '3 Tập · 30p/tập',
    duration_sec: 150,
    rating: 8.5,
    cast: ['Hinata Mori', 'Kaito Vance', 'Momo Sato'],
    director: 'Minh Tâm Nguyễn',
    trailer_video_id: 'M7lc1UVf-VE',
    episodes: [1, 2, 3].map((n) => ({
      episodeNumber: n,
      title: `Tập ${n}: ${['Ly Cà Phê Nhầm Chủ', 'Ngày Mất Điện Toàn Phố', 'Thực Khách Bí Ẩn'][n - 1]}`,
      durationLabel: '30 phút',
      durationSec: 150,
      synopsis: `Tiếng cười nhẹ nhàng cuối ngày tại Tiệm Cà Phê Bất Ổn tập ${n}.`,
      accentColor: '#D97706',
      subtitles: buildEpisodeSubtitles('Tiệm Cà Phê Bất Ổn', n),
    })),
    is_trending: 0,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '1080p',
    locked_reason: '',
    sort_order: 7,
  },
  {
    id: 'mov_yt_bunny_anim',
    title: 'Tiệm Bánh Thung Lũng Mây',
    original_title: 'Cloud Valley Bakery',
    description:
      'Phim hoạt hình ấm áp kể về cô thợ làm bánh Momo và chiếc lò nướng biết bay giúp kết nối mọi ngôi làng trên đỉnh núi.',
    genre: 'Phim hoạt hình',
    categories: ['Phim hoạt hình', 'Hài hước'],
    content_kind: 'movie',
    access_type: 'FREE' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/char_momo_bakery_1795088463375.jpg',
    backdrop_url: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
    year: 2025,
    duration_label: '94 phút',
    duration_sec: 160,
    rating: 8.6,
    cast: ['Momo Sato (Lồng tiếng)', 'Rin Hoshizora'],
    director: 'Natsuki Abe',
    trailer_video_id: 'aqz-KE-bpKQ',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Phim Hoạt Hình Đầy Đủ',
        durationLabel: '94 phút',
        durationSec: 160,
        synopsis: 'Cuộc phiêu lưu ngọt ngào giữa bầu trời đầy mây cùng những chiếc bánh mì ấm nóng.',
        accentColor: '#EC4899',
        subtitles: buildEpisodeSubtitles('Tiệm Bánh Thung Lũng Mây', 1),
      },
    ],
    is_trending: 0,
    is_new_release: 0,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '1080p',
    locked_reason: '',
    sort_order: 8,
  },
  {
    id: 'mov_yt_neon_detective',
    title: 'Hồ Sơ Thám Tử Phố Đêm',
    original_title: 'Haruto Casefiles: Neon Rain',
    description:
      'Thám tử Haruto giải mã vụ án mất tích liên hoàn ẩn sau những bảng quảng cáo điện tử tại khu phố cổ.',
    genre: 'Phim hành động · Phim truyền hình',
    categories: ['Phim hành động', 'Phim truyền hình'],
    content_kind: 'movie',
    access_type: 'RENT' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 29000,
    buy_price: 79000,
    poster_url: '/src/assets/images/char_haruto_detective_1795088464373.jpg',
    backdrop_url: '/src/assets/images/social_neon_street_1794918924716.jpg',
    year: 2026,
    duration_label: '134 phút · Thuê 72 giờ',
    duration_sec: 200,
    rating: 8.8,
    cast: ['Haruto Kurosawa', 'Mei Aikawa'],
    director: 'Daichi Ito',
    trailer_video_id: 'M7lc1UVf-VE',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Phim Chiếu Rạp (Thuê 72h)',
        durationLabel: '134 phút',
        durationSec: 200,
        synopsis: 'Mọi manh mối đều dẫn về căn phòng thu phát sóng bị phong tỏa năm 1998.',
        accentColor: '#2563EB',
        subtitles: buildEpisodeSubtitles('Hồ Sơ Thám Tử Phố Đêm', 1),
      },
    ],
    is_trending: 1,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 9,
  },
  {
    id: 'mov_yt_knight_chronicle',
    title: 'Biên Niên Sử Kỵ Sĩ Hoàng Kim',
    original_title: 'Golden Knight Chronicles',
    description:
      'Bản đặc biệt mua sở hữu vĩnh viễn: hành trình của Leon bảo vệ vương quốc ánh sáng trước đội quân bóng tối.',
    genre: 'Anime · Phim hành động',
    categories: ['Anime', 'Phim hành động'],
    content_kind: 'movie',
    access_type: 'BUY' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 0,
    buy_price: 99000,
    poster_url: '/src/assets/images/char_leon_knight_1795088462669.jpg',
    backdrop_url: '/src/assets/images/hikari_banner_skyline_1795080144709.jpg',
    year: 2026,
    duration_label: '142 phút · Mua vĩnh viễn',
    duration_sec: 220,
    rating: 9.0,
    cast: ['Leon Von Crest', 'Kaede Sato'],
    director: 'Hiroshi Tanaka',
    trailer_video_id: 'aqz-KE-bpKQ',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Bản Mở Rộng Đầy Đủ (Sở hữu vĩnh viễn)',
        durationLabel: '142 phút',
        durationSec: 220,
        synopsis: 'Trận công thành kinh điển với nhạc giao hưởng thu âm trực tiếp.',
        accentColor: '#CA8A04',
        subtitles: buildEpisodeSubtitles('Biên Niên Sử Kỵ Sĩ Hoàng Kim', 1),
      },
    ],
    is_trending: 0,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '4K',
    locked_reason: '',
    sort_order: 10,
  },
  {
    id: 'mov_yt_cyber_ghost',
    title: 'Bóng Ma Mạng Lưới',
    original_title: 'Ghost in the Grid',
    description:
      'Một hacker mũ trắng phát hiện ý thức của người anh trai quá cố vẫn tồn tại bên trong hệ điều hành thành phố.',
    genre: 'Khoa học viễn tưởng · Phim hành động',
    categories: ['Khoa học viễn tưởng', 'Phim hành động'],
    content_kind: 'movie',
    access_type: 'RENT' as MovieAccessType,
    min_tier: 'free' as YouTubePlanId,
    rent_price: 35000,
    buy_price: 89000,
    poster_url: '/src/assets/images/char_rei_cyber_1795088463021.jpg',
    backdrop_url: '/src/assets/images/social_studio_setup_1794918925398.jpg',
    year: 2026,
    duration_label: '118 phút · Thuê 72 giờ',
    duration_sec: 185,
    rating: 8.6,
    cast: ['Rei Tachibana', 'Akira Kurosawa'],
    director: 'Kenji Kamiyama',
    trailer_video_id: '4xDzrJKXOOY',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Phim Điện Ảnh (Thuê 72h)',
        durationLabel: '118 phút',
        durationSec: 185,
        synopsis: 'Cuộc đột nhập máy chủ trung tâm giữa bão dữ liệu lượng tử.',
        accentColor: '#06B6D4',
        subtitles: buildEpisodeSubtitles('Bóng Ma Mạng Lưới', 1),
      },
    ],
    is_trending: 0,
    is_new_release: 0,
    is_featured: 0,
    is_exclusive: 0,
    max_source_quality: '1080p',
    locked_reason: '',
    sort_order: 11,
  },
  {
    id: 'mov_yt_horizon_locked',
    title: 'Chân Trời Bất Tận (Bản Sắp Chiếu)',
    original_title: 'Endless Horizon: Early Cut',
    description:
      'Siêu phẩm điện ảnh đa vũ trụ đang trong giai đoạn cấp phép bản quyền khu vực và hoàn thiện âm thanh Dolby Atmos.',
    genre: 'Khoa học viễn tưởng · Series độc quyền',
    categories: ['Khoa học viễn tưởng', 'Series độc quyền'],
    content_kind: 'exclusive',
    access_type: 'LOCKED' as MovieAccessType,
    min_tier: 'premium' as YouTubePlanId,
    rent_price: 0,
    buy_price: 0,
    poster_url: '/src/assets/images/social_neon_street_1794918924716.jpg',
    backdrop_url: '/src/assets/images/cinema_hero_banner_1795104737657.jpg',
    year: 2027,
    duration_label: '150 phút · Sắp phát hành',
    duration_sec: 200,
    rating: 9.5,
    cast: ['Sora Orbit', 'Lena Starlight', 'Ryo Naruse'],
    director: 'Hideo Akiyama',
    trailer_video_id: 'LXb3EKWsInQ',
    episodes: [
      {
        episodeNumber: 1,
        title: 'Tập 1 (Chưa mở khóa)',
        durationLabel: '150 phút',
        durationSec: 200,
        synopsis: 'Đang chờ lịch công chiếu chính thức trên YouTube Premium.',
        accentColor: '#64748B',
        subtitles: buildEpisodeSubtitles('Chân Trời Bất Tận', 1),
      },
    ],
    is_trending: 0,
    is_new_release: 1,
    is_featured: 0,
    is_exclusive: 1,
    max_source_quality: '4K',
    locked_reason: 'Phim đang trong giai đoạn khóa bản quyền trước ngày công chiếu chính thức.',
    sort_order: 12,
  },
];

const SEED_YOUTUBE_SHORTS = [
  {
    id: 'short_1',
    video_id: 'LXb3EKWsInQ',
    title: 'Thác Nước Costa Rica 4K HDR - Góc máy Flycam 60fps',
    creator_name: 'Jacob + Katie Schwarz',
    creator_avatar: '/src/assets/images/char_kaito_athlete_1795088463135.jpg',
    category: 'Thiên nhiên',
    likes_count: 14200,
    comments_count: 312,
    thumbnail_url: '/src/assets/images/poster_ocean_doc_1795104741045.jpg',
    duration_sec: 42,
    accent_color: '#0EA5E9',
    caption: 'Cảm nhận làn nước xanh ngọc và màu sắc HDR cực nét chỉ trong 42 giây! #4K #Nature',
    sort_order: 1,
  },
  {
    id: 'short_2',
    video_id: 'jfKfPfyJRdk',
    title: '1 phút setup góc học tập Chill Lo-Fi đêm khuya',
    creator_name: 'Yuki Studio',
    creator_avatar: '/src/assets/images/char_yuki_1794880089308.jpg',
    category: 'Âm nhạc',
    likes_count: 9840,
    comments_count: 185,
    thumbnail_url: '/src/assets/images/social_studio_setup_1794918925398.jpg',
    duration_sec: 35,
    accent_color: '#E11D48',
    caption: 'Ánh đèn hổ phách + bàn phím cơ + tiếng mưa nhẹ để tập trung 100% 🎧✨',
    sort_order: 2,
  },
  {
    id: 'short_3',
    video_id: '4xDzrJKXOOY',
    title: 'Hậu trường kỹ xảo Cyber Samurai Neo-Shibuya',
    creator_name: 'Studio Akira VFX',
    creator_avatar: '/src/assets/images/char_akira_1794880089961.jpg',
    category: 'Hoạt hình',
    likes_count: 22100,
    comments_count: 540,
    thumbnail_url: '/src/assets/images/poster_cyber_action_1795104741176.jpg',
    duration_sec: 48,
    accent_color: '#EF4444',
    caption: 'Cách đội ngũ dựng từng tia sét phản chiếu trên mặt đường ướt Shibuya ⚡🗡️',
    sort_order: 3,
  },
  {
    id: 'short_4',
    video_id: 'aqz-KE-bpKQ',
    title: 'Một buổi chiều ghé Tiệm Cà Phê Sài Gòn cùng Hinata',
    creator_name: 'Hinata Vlog',
    creator_avatar: '/src/assets/images/char_hinata_cafe_1795088463551.jpg',
    category: 'Vlog',
    likes_count: 6750,
    comments_count: 98,
    thumbnail_url: '/src/assets/images/social_saigon_cafe_1794918924529.jpg',
    duration_sec: 30,
    accent_color: '#F59E0B',
    caption: 'Cà phê sữa đá và góc ban công đón nắng đẹp nhất cuối tuần ☕🌿',
    sort_order: 4,
  },
  {
    id: 'short_5',
    video_id: '5qap5aO4i9A',
    title: 'Tokyo Dome Encore - Khoảnh khắc biển ánh sáng tim tím',
    creator_name: 'Lena Official',
    creator_avatar: '/src/assets/images/char_lena_starlight_1795088463461.jpg',
    category: 'Âm nhạc',
    likes_count: 31500,
    comments_count: 890,
    thumbnail_url: '/src/assets/images/social_music_live_1794918926157.jpg',
    duration_sec: 55,
    accent_color: '#8B5CF6',
    caption: 'Cảm ơn 50.000 khán giả đã hòa giọng cùng Lena trong đêm diễn đặc biệt! 💜🎤',
    sort_order: 5,
  },
];

export function ensureYoutubePremiumSchema(db: Database.Database): void {
  const now = new Date().toISOString();
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_movies_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      genre TEXT NOT NULL,
      categories_json TEXT DEFAULT '[]',
      content_kind TEXT DEFAULT 'movie',
      access_type TEXT NOT NULL DEFAULT 'FREE',
      min_tier TEXT DEFAULT 'free',
      rent_price INTEGER DEFAULT 0,
      buy_price INTEGER DEFAULT 0,
      poster_url TEXT DEFAULT '',
      backdrop_url TEXT DEFAULT '',
      year INTEGER DEFAULT 2026,
      duration_label TEXT DEFAULT '',
      duration_sec INTEGER DEFAULT 180,
      rating REAL DEFAULT 8.5,
      cast_json TEXT DEFAULT '[]',
      director TEXT DEFAULT '',
      trailer_video_id TEXT DEFAULT '',
      episodes_json TEXT DEFAULT '[]',
      is_trending INTEGER DEFAULT 0,
      is_new_release INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_exclusive INTEGER DEFAULT 0,
      max_source_quality TEXT DEFAULT '1080p',
      locked_reason TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_shorts_catalog (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_avatar TEXT DEFAULT '',
      category TEXT DEFAULT 'Giải trí',
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      thumbnail_url TEXT DEFAULT '',
      duration_sec INTEGER DEFAULT 45,
      accent_color TEXT DEFAULT '#E11D48',
      caption TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS youtube_memberships (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'free',
      subscribed_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      next_billing_at TEXT DEFAULT '',
      auto_renew INTEGER DEFAULT 0,
      saved_card_id TEXT DEFAULT '',
      saved_card_summary_json TEXT DEFAULT '{}',
      pending_downgrade_plan TEXT DEFAULT '',
      device_limit INTEGER DEFAULT 1,
      max_quality TEXT DEFAULT '480p',
      download_enabled INTEGER DEFAULT 0,
      ad_free INTEGER DEFAULT 0,
      cancelled_at TEXT DEFAULT '',
      last_renewal_error TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_movie_entitlements (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL,
      entitlement_type TEXT NOT NULL,
      price_paid INTEGER DEFAULT 0,
      purchased_at TEXT NOT NULL,
      expires_at TEXT DEFAULT '',
      tx_id TEXT DEFAULT '',
      invoice_id TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS youtube_billing_invoices (
      id TEXT PRIMARY KEY,
      invoice_code TEXT NOT NULL,
      tx_id TEXT DEFAULT '',
      card_id TEXT DEFAULT '',
      card_last4 TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      action_type TEXT NOT NULL,
      plan_id TEXT DEFAULT '',
      movie_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paid',
      failure_code TEXT DEFAULT '',
      failure_reason TEXT DEFAULT '',
      period_start TEXT DEFAULT '',
      period_end TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_movie_favorites (
      movie_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_movie_progress (
      movie_id TEXT PRIMARY KEY,
      episode_number INTEGER DEFAULT 1,
      progress_sec INTEGER DEFAULT 0,
      duration_sec INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_yt_entitlements_movie ON youtube_movie_entitlements(movie_id);
    CREATE INDEX IF NOT EXISTS idx_yt_invoices_created ON youtube_billing_invoices(created_at DESC);
  `);

  const insertMovie = db.prepare(`
    INSERT OR IGNORE INTO youtube_movies_catalog (
      id, title, original_title, description, genre, categories_json, content_kind,
      access_type, min_tier, rent_price, buy_price, poster_url, backdrop_url, year,
      duration_label, duration_sec, rating, cast_json, director, trailer_video_id,
      episodes_json, is_trending, is_new_release, is_featured, is_exclusive,
      max_source_quality, locked_reason, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of SEED_YOUTUBE_MOVIES) {
    insertMovie.run(
      m.id,
      m.title,
      m.original_title,
      m.description,
      m.genre,
      JSON.stringify(m.categories),
      m.content_kind,
      m.access_type,
      m.min_tier,
      m.rent_price,
      m.buy_price,
      m.poster_url,
      m.backdrop_url,
      m.year,
      m.duration_label,
      m.duration_sec,
      m.rating,
      JSON.stringify(m.cast),
      m.director,
      m.trailer_video_id,
      JSON.stringify(m.episodes),
      m.is_trending,
      m.is_new_release,
      m.is_featured,
      m.is_exclusive,
      m.max_source_quality,
      m.locked_reason,
      m.sort_order,
      now
    );
  }

  const insertShort = db.prepare(`
    INSERT OR IGNORE INTO youtube_shorts_catalog (
      id, video_id, title, creator_name, creator_avatar, category,
      likes_count, comments_count, thumbnail_url, duration_sec, accent_color, caption, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of SEED_YOUTUBE_SHORTS) {
    insertShort.run(
      s.id,
      s.video_id,
      s.title,
      s.creator_name,
      s.creator_avatar,
      s.category,
      s.likes_count,
      s.comments_count,
      s.thumbnail_url,
      s.duration_sec,
      s.accent_color,
      s.caption,
      s.sort_order
    );
  }

  db.prepare(`
    INSERT OR IGNORE INTO youtube_memberships (
      id, plan_id, status, subscribed_at, expires_at, next_billing_at, auto_renew,
      saved_card_id, saved_card_summary_json, pending_downgrade_plan,
      device_limit, max_quality, download_enabled, ad_free, cancelled_at, last_renewal_error, updated_at
    ) VALUES ('user_1', 'free', 'free', '', '', '', 0, '', '{}', '', 1, '480p', 0, 0, '', '', ?)
  `).run(now);
}

function pushYoutubeOsNotification(db: Database.Database, title: string, body: string, payload = 'youtube_premium'): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (id, app_id, group_key, title, body, action_route, action_payload, priority, is_read, created_at)
    VALUES (?, 'youtube', 'YouTube Premium', ?, ?, 'youtube', ?, 0, 0, ?)
  `).run(ytUid('notif'), title, body, payload, now);
}

function genInvoiceCode(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `YTP-${datePart}-${crypto.randomInt(1000, 9999)}`;
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getSavedCardLiveInfo(db: Database.Database, savedCardId: string, fallbackSummaryJson?: string) {
  const fallback = safeParseJson<Record<string, unknown>>(fallbackSummaryJson || '{}', {});
  if (!savedCardId) return null;
  const card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(savedCardId) as Record<string, unknown> | undefined;
  if (!card) {
    if (!fallback.last4) return null;
    return {
      cardId: savedCardId,
      bankId: String(fallback.bankId || 'hikari'),
      bankName: String(fallback.bankName || 'Hikari Bank'),
      cardNickname: String(fallback.cardNickname || 'Thẻ đã lưu'),
      cardCategory: String(fallback.cardCategory || 'debit'),
      last4: String(fallback.last4 || ''),
      maskedNumber: String(fallback.maskedNumber || `•••• •••• •••• ${String(fallback.last4 || '')}`),
      expiry: String(fallback.expiry || ''),
      liveStatus: 'deleted',
      statusReason: 'Thẻ này không còn tồn tại trong Hikari Bank.',
    };
  }
  const bank = getBankDefinition(String(card.bank_id || 'hikari'));
  const status = String(card.status || 'active');
  const expired = isCardExpiredLocal(String(card.expiry || ''));
  const liveStatus = status === 'cancelled' ? 'cancelled' : status !== 'active' ? 'locked' : expired ? 'expired' : 'active';
  const statusReason =
    liveStatus === 'locked'
      ? 'Thẻ hiện đang bị khóa tại Hikari Bank.'
      : liveStatus === 'cancelled'
      ? 'Thẻ này đã bị hủy vĩnh viễn.'
      : liveStatus === 'expired'
      ? 'Thẻ đã hết hạn sử dụng.'
      : 'Đang hoạt động bình thường';

  return {
    cardId: String(card.id),
    bankId: bank.id,
    bankName: bank.name,
    cardNickname: String(card.card_nickname || card.card_name || bank.name),
    cardCategory: String(card.card_category || 'debit'),
    last4: String(card.last4 || ''),
    maskedNumber: String(card.masked_number || `•••• •••• •••• ${String(card.last4 || '')}`),
    expiry: String(card.expiry || ''),
    liveStatus,
    statusReason,
  };
}

/**
 * Enforces real subscription expiration and auto-renewal on due date.
 * Automatically downgrades expired plans when auto-renew is off or billing fails.
 */
export function syncYoutubeMembershipLifecycle(db: Database.Database) {
  ensureYoutubePremiumSchema(db);
  const mem = db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>;
  const currentPlanId = (String(mem.plan_id || 'free') as YouTubePlanId) || 'free';
  const status = String(mem.status || 'free');
  const expiresAt = String(mem.expires_at || '');
  const now = new Date();
  const nowIso = now.toISOString();

  if (currentPlanId === 'free' || !expiresAt || status === 'expired' || status === 'free') {
    return {
      membership: db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>,
      lifecycleEvent: null as null | { type: string; message: string },
    };
  }

  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs) || expiryMs > now.getTime()) {
    return { membership: mem, lifecycleEvent: null };
  }

  // Subscription reached expiration time
  const plan = YOUTUBE_PLANS[currentPlanId] || YOUTUBE_PLANS.basic;
  const autoRenew = Number(mem.auto_renew || 0) === 1;
  const savedCardId = String(mem.saved_card_id || '').trim();
  const savedSummary = safeParseJson<Record<string, unknown>>(String(mem.saved_card_summary_json || '{}'), {});

  if (autoRenew && savedCardId) {
    const cycleIdem = `yt_renew_${currentPlanId}_${expiresAt.slice(0, 13)}`;
    try {
      const payRes = processUniversalCardPayment({
        cardId: savedCardId,
        merchant: `YouTube Premium · Gia hạn ${plan.name}`,
        amount: plan.price,
        category: 'Giải trí',
        channelType: 'online',
        appSource: 'YouTube Premium',
        idempotencyKey: cycleIdem,
      });

      const tx = payRes.transaction as Record<string, unknown>;
      const nextExpiresAt = addDaysIso(now, 30);
      const liveCard = getSavedCardLiveInfo(db, savedCardId, String(mem.saved_card_summary_json || '{}'));
      const invId = ytUid('ytinv');
      const invCode = genInvoiceCode();

      db.prepare(`
        UPDATE youtube_memberships
        SET status = 'active', subscribed_at = ?, expires_at = ?, next_billing_at = ?,
            device_limit = ?, max_quality = ?, download_enabled = ?, ad_free = ?,
            last_renewal_error = '', updated_at = ?
        WHERE id = 'user_1'
      `).run(
        nowIso,
        nextExpiresAt,
        nextExpiresAt,
        plan.maxDevices,
        plan.maxQuality,
        plan.downloadSupported ? 1 : 0,
        plan.adFree ? 1 : 0,
        nowIso
      );

      db.prepare(`
        INSERT INTO youtube_billing_invoices (
          id, invoice_code, tx_id, card_id, card_last4, bank_name, action_type,
          plan_id, movie_id, title, amount, status, period_start, period_end, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'renew', ?, '', ?, ?, 'paid', ?, ?, ?)
      `).run(
        invId,
        invCode,
        String(tx.id || ''),
        savedCardId,
        liveCard?.last4 || String(tx.source_card_last4 || ''),
        liveCard?.bankName || String(tx.bank_name || 'Hikari Bank'),
        plan.id,
        `Gia hạn tự động YouTube ${plan.name} (1 tháng)`,
        plan.price,
        nowIso,
        nextExpiresAt,
        nowIso
      );

      pushYoutubeOsNotification(
        db,
        `Gia hạn YouTube ${plan.name} thành công`,
        `Đã trừ ${formatVndYt(plan.price)} từ thẻ •••• ${liveCard?.last4 || ''}. Hiệu lực đến ${new Date(nextExpiresAt).toLocaleDateString('vi-VN')}.`
      );

      return {
        membership: db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>,
        lifecycleEvent: {
          type: 'renewed',
          message: `Đã tự động gia hạn gói ${plan.name} thêm 1 tháng.`,
        },
      };
    } catch (err) {
      const rawCode = err instanceof CardEngineHttpError ? err.code : 'RENEWAL_FAILED';
      const mappedCode = rawCode === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT_FUNDS' : rawCode;
      const reason =
        err instanceof Error ? err.message : 'Không thể trừ tiền thẻ đã lưu để gia hạn YouTube Premium.';

      db.prepare(`
        INSERT INTO youtube_billing_invoices (
          id, invoice_code, tx_id, card_id, card_last4, bank_name, action_type,
          plan_id, movie_id, title, amount, status, failure_code, failure_reason, period_start, period_end, created_at
        ) VALUES (?, ?, '', ?, ?, ?, 'renew_failed', ?, '', ?, ?, 'failed', ?, ?, ?, ?, ?)
      `).run(
        ytUid('ytinv'),
        genInvoiceCode(),
        savedCardId,
        String(savedSummary.last4 || ''),
        String(savedSummary.bankName || 'Hikari Bank'),
        plan.id,
        `Gia hạn thất bại gói YouTube ${plan.name}`,
        plan.price,
        mappedCode,
        reason,
        nowIso,
        nowIso,
        nowIso
      );

      db.prepare(`
        UPDATE youtube_memberships
        SET plan_id = 'free', status = 'expired', next_billing_at = '', auto_renew = 0,
            device_limit = 1, max_quality = '480p', download_enabled = 0, ad_free = 0,
            last_renewal_error = ?, updated_at = ?
        WHERE id = 'user_1'
      `).run(reason, nowIso);

      pushYoutubeOsNotification(
        db,
        'Gia hạn YouTube Premium thất bại',
        `${reason} Gói thành viên đã tạm chuyển về Miễn phí. Vui lòng cập nhật phương thức thanh toán.`
      );

      return {
        membership: db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>,
        lifecycleEvent: {
          type: 'renew_failed',
          message: reason,
        },
      };
    }
  }

  // Auto-renew disabled or cancelled -> cleanly downgrade to free and lock premium content
  const expiredMessage = 'Gói YouTube Premium đã hết hạn. Đăng ký lại để mở khóa phim và quyền lợi hội viên.';
  db.prepare(`
    UPDATE youtube_memberships
    SET plan_id = 'free', status = 'expired', next_billing_at = '', auto_renew = 0,
        device_limit = 1, max_quality = '480p', download_enabled = 0, ad_free = 0,
        last_renewal_error = ?, updated_at = ?
    WHERE id = 'user_1'
  `).run(expiredMessage, nowIso);

  pushYoutubeOsNotification(
    db,
    'Gói YouTube Premium đã hết hạn',
    `Gói ${plan.name} đã hết hạn. Nội dung Premium đã được khóa trở lại.`
  );

  return {
    membership: db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>,
    lifecycleEvent: {
      type: 'expired',
      message: expiredMessage,
    },
  };
}

function getActiveEntitlementForMovie(db: Database.Database, movieId: string) {
  const rows = db
    .prepare('SELECT * FROM youtube_movie_entitlements WHERE movie_id = ? ORDER BY purchased_at DESC')
    .all(movieId) as Array<Record<string, unknown>>;
  const nowMs = Date.now();
  for (const row of rows) {
    const type = String(row.entitlement_type || '');
    if (type === 'buy') return row;
    if (type === 'rent') {
      const exp = String(row.expires_at || '');
      if (!exp || new Date(exp).getTime() > nowMs) return row;
    }
  }
  return null;
}

export function evaluateMovieAccess(db: Database.Database, movieId: string) {
  const { membership } = syncYoutubeMembershipLifecycle(db);
  const movie = db.prepare('SELECT * FROM youtube_movies_catalog WHERE id = ?').get(movieId) as
    | Record<string, unknown>
    | undefined;
  if (!movie) {
    return null;
  }

  const planId = (String(membership.plan_id || 'free') as YouTubePlanId) || 'free';
  const memStatus = String(membership.status || 'free');
  const activePlan = memStatus === 'active' ? YOUTUBE_PLANS[planId] || YOUTUBE_PLANS.free : YOUTUBE_PLANS.free;
  const effectivePlanId: YouTubePlanId = memStatus === 'active' ? planId : 'free';
  const entitlement = getActiveEntitlementForMovie(db, movieId);

  const accessType = String(movie.access_type || 'FREE') as MovieAccessType;
  const minTier = (String(movie.min_tier || 'basic') as YouTubePlanId) || 'basic';
  const sourceMax = String(movie.max_source_quality || '1080p');

  let allowed = false;
  let reasonCode = '';
  let reasonMessage = '';
  let recommendedPlanId: YouTubePlanId = minTier === 'free' ? 'basic' : minTier;
  let canRent = false;
  let canBuy = false;

  if (accessType === 'LOCKED') {
    allowed = false;
    reasonCode = 'CONTENT_LOCKED';
    reasonMessage = String(movie.locked_reason || 'Nội dung hiện đang tạm khóa phát hành.');
  } else if (accessType === 'FREE') {
    allowed = true;
  } else if (accessType === 'PREMIUM') {
    if (memStatus === 'active' && PLAN_RANK[effectivePlanId] >= PLAN_RANK[minTier]) {
      allowed = true;
    } else {
      allowed = false;
      recommendedPlanId = minTier === 'free' ? 'basic' : minTier;
      if (memStatus === 'expired') {
        reasonCode = 'SUBSCRIPTION_EXPIRED';
        reasonMessage = 'Gói thành viên YouTube Premium của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục xem.';
      } else if (memStatus === 'active' && PLAN_RANK[effectivePlanId] < PLAN_RANK[minTier]) {
        reasonCode = 'TIER_UPGRADE_REQUIRED';
        reasonMessage = `Nội dung này yêu cầu từ gói ${YOUTUBE_PLANS[recommendedPlanId].name} trở lên.`;
      } else {
        reasonCode = 'PREMIUM_REQUIRED';
        reasonMessage = `Bạn cần đăng ký gói YouTube ${YOUTUBE_PLANS[recommendedPlanId].name} để mở khóa phim này.`;
      }
    }
  } else if (accessType === 'RENT') {
    if (entitlement) {
      allowed = true;
    } else {
      allowed = false;
      canRent = Number(movie.rent_price || 0) > 0;
      canBuy = Number(movie.buy_price || 0) > 0;
      reasonCode = 'RENT_REQUIRED';
      reasonMessage = `Phim chiếu rạp có phí thuê ${formatVndYt(Number(movie.rent_price || 0))} trong 72 giờ.`;
    }
  } else if (accessType === 'BUY') {
    if (entitlement) {
      allowed = true;
    } else {
      allowed = false;
      canBuy = Number(movie.buy_price || 0) > 0;
      reasonCode = 'PURCHASE_REQUIRED';
      reasonMessage = `Mua sở hữu vĩnh viễn phim với giá ${formatVndYt(Number(movie.buy_price || 0))}.`;
    }
  }

  const maxQuality =
    accessType === 'FREE' && effectivePlanId === 'free'
      ? capQuality('720p', sourceMax)
      : entitlement
      ? sourceMax
      : capQuality(activePlan.maxQuality, sourceMax);

  const availableQualities = QUALITY_ORDER.filter(
    (q) => QUALITY_ORDER.indexOf(q) <= QUALITY_ORDER.indexOf(sourceMax as (typeof QUALITY_ORDER)[number])
  );

  return {
    movieId,
    allowed,
    accessType,
    minTier,
    currentPlanId: effectivePlanId,
    membershipStatus: memStatus,
    recommendedPlanId,
    reasonCode,
    reasonMessage,
    canRent,
    canBuy,
    rentPrice: Number(movie.rent_price || 0),
    buyPrice: Number(movie.buy_price || 0),
    maxQuality,
    availableQualities,
    maxDevices: activePlan.maxDevices,
    adFree: activePlan.adFree || Boolean(entitlement),
    downloadAllowed: activePlan.downloadSupported || String(entitlement?.entitlement_type || '') === 'buy',
    entitlement: entitlement
      ? {
          id: String(entitlement.id),
          entitlementType: String(entitlement.entitlement_type) as 'rent' | 'buy',
          pricePaid: Number(entitlement.price_paid || 0),
          purchasedAt: String(entitlement.purchased_at || ''),
          expiresAt: String(entitlement.expires_at || ''),
        }
      : null,
  };
}

function hydrateMovieRow(
  db: Database.Database,
  row: Record<string, unknown>,
  favSet: Set<string>,
  progressMap: Map<string, Record<string, unknown>>,
  entitlementMap: Map<string, Record<string, unknown>>,
  membershipState: { planId: YouTubePlanId; status: string }
) {
  const id = String(row.id);
  const ent = entitlementMap.get(id) || null;
  const prog = progressMap.get(id);
  const accessType = String(row.access_type || 'FREE') as MovieAccessType;
  const minTier = (String(row.min_tier || 'basic') as YouTubePlanId) || 'basic';

  let isUnlocked = false;
  if (accessType === 'FREE') isUnlocked = true;
  else if (accessType === 'PREMIUM') {
    isUnlocked = membershipState.status === 'active' && PLAN_RANK[membershipState.planId] >= PLAN_RANK[minTier];
  } else if (accessType === 'RENT' || accessType === 'BUY') {
    isUnlocked = Boolean(ent);
  }

  return {
    id,
    title: String(row.title),
    originalTitle: String(row.original_title || ''),
    description: String(row.description || ''),
    genre: String(row.genre || ''),
    categories: safeParseJson<string[]>(row.categories_json, []),
    contentKind: String(row.content_kind || 'movie'),
    accessType,
    minTier,
    rentPrice: Number(row.rent_price || 0),
    buyPrice: Number(row.buy_price || 0),
    posterUrl: String(row.poster_url || ''),
    backdropUrl: String(row.backdrop_url || ''),
    year: Number(row.year || 2026),
    durationLabel: String(row.duration_label || ''),
    durationSec: Number(row.duration_sec || 180),
    rating: Number(row.rating || 8.5),
    cast: safeParseJson<string[]>(row.cast_json, []),
    director: String(row.director || ''),
    trailerVideoId: String(row.trailer_video_id || ''),
    // Only reveal full episode playable metadata if unlocked (keep titles/lengths for preview UI)
    episodes: safeParseJson<SeedMovieEpisode[]>(row.episodes_json, []).map((ep) => ({
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      durationLabel: ep.durationLabel,
      durationSec: ep.durationSec,
      synopsis: ep.synopsis,
      accentColor: isUnlocked || ep.episodeNumber === 1 ? ep.accentColor : '#3F3F46',
      subtitles: isUnlocked ? ep.subtitles : [],
    })),
    isTrending: Number(row.is_trending || 0) === 1,
    isNewRelease: Number(row.is_new_release || 0) === 1,
    isFeatured: Number(row.is_featured || 0) === 1,
    isExclusive: Number(row.is_exclusive || 0) === 1,
    maxSourceQuality: String(row.max_source_quality || '1080p'),
    lockedReason: String(row.locked_reason || ''),
    isFavorite: favSet.has(id),
    isUnlocked,
    progress: prog
      ? {
          episodeNumber: Number(prog.episode_number || 1),
          progressSec: Number(prog.progress_sec || 0),
          durationSec: Number(prog.duration_sec || 0),
          updatedAt: String(prog.updated_at || ''),
        }
      : null,
    entitlement: ent
      ? {
          id: String(ent.id),
          entitlementType: String(ent.entitlement_type) as 'rent' | 'buy',
          pricePaid: Number(ent.price_paid || 0),
          purchasedAt: String(ent.purchased_at || ''),
          expiresAt: String(ent.expires_at || ''),
        }
      : null,
  };
}

export function getYoutubeStreamingOverview(db: Database.Database) {
  const { membership, lifecycleEvent } = syncYoutubeMembershipLifecycle(db);
  const planId = (String(membership.plan_id || 'free') as YouTubePlanId) || 'free';
  const memStatus = String(membership.status || 'free');
  const activePlanId: YouTubePlanId = memStatus === 'active' ? planId : 'free';

  const favRows = db.prepare('SELECT movie_id FROM youtube_movie_favorites').all() as Array<{ movie_id: string }>;
  const favSet = new Set(favRows.map((r) => r.movie_id));

  const progRows = db
    .prepare('SELECT * FROM youtube_movie_progress ORDER BY updated_at DESC')
    .all() as Array<Record<string, unknown>>;
  const progressMap = new Map(progRows.map((r) => [String(r.movie_id), r]));

  const entRows = db
    .prepare('SELECT * FROM youtube_movie_entitlements ORDER BY purchased_at DESC')
    .all() as Array<Record<string, unknown>>;
  const nowMs = Date.now();
  const entitlementMap = new Map<string, Record<string, unknown>>();
  for (const e of entRows) {
    const mid = String(e.movie_id);
    if (entitlementMap.has(mid)) continue;
    const type = String(e.entitlement_type);
    const exp = String(e.expires_at || '');
    if (type === 'buy' || !exp || new Date(exp).getTime() > nowMs) {
      entitlementMap.set(mid, e);
    }
  }

  const movieRows = db
    .prepare('SELECT * FROM youtube_movies_catalog ORDER BY sort_order ASC')
    .all() as Array<Record<string, unknown>>;

  const movies = movieRows.map((row) =>
    hydrateMovieRow(db, row, favSet, progressMap, entitlementMap, { planId: activePlanId, status: memStatus })
  );

  // Personalized ranking based on history/favorites genres
  const preferredGenres = new Set<string>();
  for (const m of movies) {
    if (m.isFavorite || m.progress) {
      m.categories.forEach((c) => preferredGenres.add(c));
    }
  }
  const recommendedMovies = [...movies].sort((a, b) => {
    const aScore =
      a.categories.filter((c) => preferredGenres.has(c)).length * 3 +
      (a.isTrending ? 2 : 0) +
      (a.rating >= 9 ? 1 : 0);
    const bScore =
      b.categories.filter((c) => preferredGenres.has(c)).length * 3 +
      (b.isTrending ? 2 : 0) +
      (b.rating >= 9 ? 1 : 0);
    return bScore - aScore;
  });

  const shorts = db.prepare('SELECT * FROM youtube_shorts_catalog ORDER BY sort_order ASC').all() as Array<
    Record<string, unknown>
  >;

  const invoices = db
    .prepare('SELECT * FROM youtube_billing_invoices ORDER BY created_at DESC LIMIT 30')
    .all() as Array<Record<string, unknown>>;

  const savedCardLive = getSavedCardLiveInfo(
    db,
    String(membership.saved_card_id || ''),
    String(membership.saved_card_summary_json || '{}')
  );

  const notifications = db
    .prepare("SELECT * FROM notifications WHERE app_id = 'youtube' ORDER BY created_at DESC LIMIT 20")
    .all();

  const plan = YOUTUBE_PLANS[activePlanId] || YOUTUBE_PLANS.free;

  return {
    plans: Object.values(YOUTUBE_PLANS),
    categories: [...YOUTUBE_MOVIE_CATEGORIES],
    membership: {
      planId,
      effectivePlanId: activePlanId,
      planName: YOUTUBE_PLANS[planId]?.name || 'Miễn phí',
      status: memStatus,
      subscribedAt: String(membership.subscribed_at || ''),
      expiresAt: String(membership.expires_at || ''),
      nextBillingAt: String(membership.next_billing_at || ''),
      autoRenew: Number(membership.auto_renew || 0) === 1,
      cancelledAt: String(membership.cancelled_at || ''),
      deviceLimit: plan.maxDevices,
      maxQuality: plan.maxQuality,
      downloadEnabled: plan.downloadSupported,
      adFree: plan.adFree,
      exclusivePriority: plan.exclusivePriority,
      lastRenewalError: String(membership.last_renewal_error || ''),
      savedCard: savedCardLive,
    },
    lifecycleEvent,
    movies,
    recommendedMovies,
    shorts: shorts.map((s) => ({
      id: String(s.id),
      videoId: String(s.video_id),
      title: String(s.title),
      creatorName: String(s.creator_name),
      creatorAvatar: String(s.creator_avatar),
      category: String(s.category),
      likesCount: Number(s.likes_count || 0),
      commentsCount: Number(s.comments_count || 0),
      thumbnailUrl: String(s.thumbnail_url || ''),
      durationSec: Number(s.duration_sec || 45),
      accentColor: String(s.accent_color || '#E11D48'),
      caption: String(s.caption || ''),
    })),
    invoices: invoices.map((inv) => ({
      id: String(inv.id),
      invoiceCode: String(inv.invoice_code),
      txId: String(inv.tx_id || ''),
      cardId: String(inv.card_id || ''),
      cardLast4: String(inv.card_last4 || ''),
      bankName: String(inv.bank_name || ''),
      actionType: String(inv.action_type || 'subscribe'),
      planId: String(inv.plan_id || ''),
      movieId: String(inv.movie_id || ''),
      title: String(inv.title || ''),
      amount: Number(inv.amount || 0),
      status: String(inv.status || 'paid'),
      failureCode: String(inv.failure_code || ''),
      failureReason: String(inv.failure_reason || ''),
      periodStart: String(inv.period_start || ''),
      periodEnd: String(inv.period_end || ''),
      createdAt: String(inv.created_at || ''),
    })),
    notifications,
  };
}

function validateAndGetTokenizedCard(
  db: Database.Database,
  params: {
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
  }
) {
  let card: Record<string, unknown> | undefined;
  const isManual = !params.cardId?.trim();

  if (params.cardId?.trim()) {
    card = db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(params.cardId.trim()) as
      | Record<string, unknown>
      | undefined;
    if (!card) {
      throw new YouTubePaymentHttpError(404, 'Không tìm thấy thẻ ngân hàng.', 'CARD_NOT_FOUND');
    }
  } else {
    const cleanDigits = normalizePanDigits(params.cardNumber || '');
    if (cleanDigits.length !== 16) {
      throw new YouTubePaymentHttpError(400, 'Số thẻ ngân hàng phải gồm đủ 16 chữ số.', 'INVALID_CARD_NUMBER');
    }
    card = db.prepare('SELECT * FROM banking_cards WHERE card_number_hash = ? LIMIT 1').get(hashPan(cleanDigits)) as
      | Record<string, unknown>
      | undefined;
    if (!card) {
      throw new YouTubePaymentHttpError(400, 'Số thẻ không tồn tại trong hệ thống Hikari Bank.', 'CARD_NOT_FOUND');
    }
  }

  const cardStatus = String(card.status || 'active');
  if (cardStatus === 'cancelled' || String(card.cancelled_at || '').trim()) {
    throw new YouTubePaymentHttpError(400, 'Thẻ ngân hàng đã bị hủy vĩnh viễn.', 'CARD_CANCELLED');
  }
  if (cardStatus !== 'active') {
    throw new YouTubePaymentHttpError(400, 'Thẻ thanh toán hiện đang bị khóa.', 'CARD_LOCKED');
  }
  if (isCardExpiredLocal(String(card.expiry || ''))) {
    throw new YouTubePaymentHttpError(400, 'Thẻ đã hết hạn sử dụng. Vui lòng dùng thẻ khác.', 'CARD_EXPIRED');
  }

  if (isManual) {
    const acc = card.account_id
      ? (db.prepare("SELECT holder_name FROM banking_accounts_demo WHERE id = ? AND owner_type = 'user'").get(
          String(card.account_id)
        ) as { holder_name?: string } | undefined)
      : undefined;
    const expectedHolder = normalizeHolder(String(acc?.holder_name || card.holder_name || 'MINH ANH'));
    const providedHolder = normalizeHolder(params.holderName || '');
    if (!providedHolder || providedHolder !== expectedHolder) {
      throw new YouTubePaymentHttpError(
        400,
        'Tên chủ thẻ không khớp với thẻ đã phát hành.',
        'INVALID_HOLDER_NAME'
      );
    }
    if (!params.expiry || params.expiry.trim() !== String(card.expiry || '').trim()) {
      throw new YouTubePaymentHttpError(400, 'Ngày hết hạn thẻ (MM/YY) không chính xác.', 'INVALID_EXPIRY');
    }
    if (!params.cvv || hashCvv(params.cvv.trim()) !== String(card.cvv_hash || '')) {
      throw new YouTubePaymentHttpError(400, 'Mã bảo mật CVV không chính xác.', 'INVALID_CVV');
    }
  }

  const bank = getBankDefinition(String(card.bank_id || 'hikari'));
  return {
    cardId: String(card.id),
    summary: {
      cardId: String(card.id),
      bankId: bank.id,
      bankName: bank.name,
      cardNickname: String(card.card_nickname || card.card_name || bank.name),
      cardCategory: String(card.card_category || 'debit'),
      last4: String(card.last4 || ''),
      maskedNumber: String(card.masked_number || `•••• •••• •••• ${String(card.last4 || '')}`),
      expiry: String(card.expiry || ''),
    },
  };
}

export function subscribeYoutubePlan(
  db: Database.Database,
  params: {
    planId: YouTubePlanId;
    autoRenew?: boolean;
    savePaymentMethod?: boolean;
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
    idempotencyKey?: string;
  }
) {
  ensureYoutubePremiumSchema(db);
  const plan = YOUTUBE_PLANS[params.planId];
  if (!plan || plan.id === 'free') {
    throw new YouTubePaymentHttpError(400, 'Gói YouTube Premium không hợp lệ.', 'INVALID_PLAN');
  }

  const mem = db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>;
  const currentPlanId = (String(mem.plan_id || 'free') as YouTubePlanId) || 'free';
  const currentStatus = String(mem.status || 'free');

  const actionType =
    currentStatus === 'active' && currentPlanId !== 'free'
      ? PLAN_RANK[plan.id] > PLAN_RANK[currentPlanId]
        ? 'upgrade'
        : PLAN_RANK[plan.id] < PLAN_RANK[currentPlanId]
        ? 'downgrade'
        : 'renew'
      : 'subscribe';

  // Resolve target cardId if user checked out with saved card or manual card
  let resolvedCardId = params.cardId?.trim() || '';
  if (!resolvedCardId && !params.cardNumber?.trim()) {
    resolvedCardId = String(mem.saved_card_id || '').trim();
    if (!resolvedCardId) {
      throw new YouTubePaymentHttpError(400, 'Vui lòng chọn thẻ hoặc nhập thông tin thẻ ngân hàng.', 'MISSING_PAYMENT_METHOD');
    }
  }

  // Validate manual or saved card through Hikari Bank Universal Card Payment Engine
  let payResult: ReturnType<typeof processUniversalCardPayment>;
  try {
    payResult = processUniversalCardPayment({
      ...(resolvedCardId
        ? { cardId: resolvedCardId }
        : {
            cardNumber: params.cardNumber,
            holderName: params.holderName,
            expiry: params.expiry,
            cvv: params.cvv,
          }),
      merchant: `YouTube Premium · Gói ${plan.name}`,
      amount: plan.price,
      category: 'Giải trí',
      channelType: 'online',
      appSource: 'YouTube',
      idempotencyKey: params.idempotencyKey || ytUid('ytpay'),
    });
  } catch (err) {
    if (err instanceof CardEngineHttpError) {
      const mappedCode = err.code === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT_FUNDS' : err.code;
      throw new YouTubePaymentHttpError(err.statusCode, err.message, mappedCode, err.code);
    }
    throw err;
  }

  const receipt = payResult.receipt as Record<string, unknown>;
  const tx = payResult.transaction as Record<string, unknown>;
  const usedCardId = String(receipt.sourceCardId || tx.source_card_id || resolvedCardId || '');
  const usedLast4 = String(receipt.sourceCardLast4 || tx.source_card_last4 || '');
  const usedBankName = String(receipt.bankName || tx.bank_name || 'Hikari Bank');
  const cardRow = usedCardId
    ? (db.prepare('SELECT * FROM banking_cards WHERE id = ?').get(usedCardId) as Record<string, unknown> | undefined)
    : undefined;
  const bankDef = getBankDefinition(String(cardRow?.bank_id || 'hikari'));

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = addDaysIso(now, 30);
  const shouldAutoRenew = Boolean(params.autoRenew);
  const shouldSaveMethod = Boolean(params.savePaymentMethod || shouldAutoRenew);

  const nextSavedCardId = shouldSaveMethod
    ? usedCardId
    : String(mem.saved_card_id || '');
  const nextSavedSummary = shouldSaveMethod
    ? JSON.stringify({
        cardId: usedCardId,
        bankId: bankDef.id,
        bankName: usedBankName,
        cardNickname: String(cardRow?.card_nickname || cardRow?.card_name || usedBankName),
        cardCategory: String(cardRow?.card_category || 'debit'),
        last4: usedLast4,
        maskedNumber: String(cardRow?.masked_number || `•••• •••• •••• ${usedLast4}`),
        expiry: String(cardRow?.expiry || ''),
      })
    : String(mem.saved_card_summary_json || '{}');

  const invoiceId = ytUid('ytinv');
  const invoiceCode = genInvoiceCode();
  const actionLabel =
    actionType === 'upgrade'
      ? `Nâng cấp lên YouTube ${plan.name} (1 tháng)`
      : actionType === 'downgrade'
      ? `Chuyển đổi sang gói YouTube ${plan.name} (1 tháng)`
      : actionType === 'renew'
      ? `Gia hạn gói YouTube ${plan.name} (1 tháng)`
      : `Đăng ký mới gói YouTube ${plan.name} (1 tháng)`;

  const applyTx = db.transaction(() => {
    db.prepare(`
      UPDATE youtube_memberships
      SET plan_id = ?, status = 'active', subscribed_at = ?, expires_at = ?, next_billing_at = ?,
          auto_renew = ?, saved_card_id = ?, saved_card_summary_json = ?, pending_downgrade_plan = '',
          device_limit = ?, max_quality = ?, download_enabled = ?, ad_free = ?,
          cancelled_at = '', last_renewal_error = '', updated_at = ?
      WHERE id = 'user_1'
    `).run(
      plan.id,
      nowIso,
      expiresAt,
      shouldAutoRenew ? expiresAt : '',
      shouldAutoRenew ? 1 : 0,
      nextSavedCardId,
      nextSavedSummary,
      plan.maxDevices,
      plan.maxQuality,
      plan.downloadSupported ? 1 : 0,
      plan.adFree ? 1 : 0,
      nowIso
    );

    // Avoid duplicate invoice on idempotent replay
    const existingInv = db
      .prepare('SELECT id FROM youtube_billing_invoices WHERE tx_id = ? LIMIT 1')
      .get(String(tx.id || '')) as { id: string } | undefined;
    if (!existingInv) {
      db.prepare(`
        INSERT INTO youtube_billing_invoices (
          id, invoice_code, tx_id, card_id, card_last4, bank_name, action_type,
          plan_id, movie_id, title, amount, status, period_start, period_end, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'paid', ?, ?, ?)
      `).run(
        invoiceId,
        invoiceCode,
        String(tx.id || ''),
        usedCardId,
        usedLast4,
        usedBankName,
        actionType,
        plan.id,
        actionLabel,
        plan.price,
        nowIso,
        expiresAt,
        nowIso
      );

      pushYoutubeOsNotification(
        db,
        `Kích hoạt YouTube ${plan.name} thành công`,
        `Hóa đơn ${invoiceCode} · Thanh toán ${formatVndYt(plan.price)} bằng thẻ •••• ${usedLast4}. Chất lượng tối đa ${plan.maxQuality}, tối đa ${plan.maxDevices} thiết bị.`
      );
    }
  });

  applyTx();

  const invoiceRow = db
    .prepare('SELECT * FROM youtube_billing_invoices WHERE tx_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(String(tx.id || '')) as Record<string, unknown> | undefined;

  return {
    ok: true,
    actionType,
    payment: payResult,
    invoice: invoiceRow || null,
    overview: getYoutubeStreamingOverview(db),
  };
}

export function purchaseYoutubeMovie(
  db: Database.Database,
  movieId: string,
  params: {
    mode: 'rent' | 'buy';
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
    idempotencyKey?: string;
  }
) {
  ensureYoutubePremiumSchema(db);
  const movie = db.prepare('SELECT * FROM youtube_movies_catalog WHERE id = ?').get(movieId) as
    | Record<string, unknown>
    | undefined;
  if (!movie) {
    throw new YouTubePaymentHttpError(404, 'Không tìm thấy phim hoặc series.', 'MOVIE_NOT_FOUND');
  }
  if (String(movie.access_type) === 'LOCKED') {
    throw new YouTubePaymentHttpError(
      403,
      String(movie.locked_reason || 'Phim hiện đang bị khóa phát hành.'),
      'CONTENT_LOCKED'
    );
  }

  const existingEnt = getActiveEntitlementForMovie(db, movieId);
  if (existingEnt && (String(existingEnt.entitlement_type) === 'buy' || params.mode === 'rent')) {
    throw new YouTubePaymentHttpError(400, 'Bạn đã có quyền xem phim này rồi.', 'ALREADY_ENTITLED');
  }

  const price = params.mode === 'buy' ? Number(movie.buy_price || 0) : Number(movie.rent_price || 0);
  if (!Number.isFinite(price) || price < 1000) {
    throw new YouTubePaymentHttpError(400, 'Phim này không hỗ trợ hình thức thanh toán đã chọn.', 'INVALID_PURCHASE_MODE');
  }

  let resolvedCardId = params.cardId?.trim() || '';
  if (!resolvedCardId && !params.cardNumber?.trim()) {
    const mem = db.prepare("SELECT saved_card_id FROM youtube_memberships WHERE id = 'user_1'").get() as
      | { saved_card_id?: string }
      | undefined;
    resolvedCardId = String(mem?.saved_card_id || '').trim();
    if (!resolvedCardId) {
      throw new YouTubePaymentHttpError(400, 'Vui lòng chọn hoặc nhập thẻ ngân hàng để thanh toán.', 'MISSING_PAYMENT_METHOD');
    }
  }

  const actionLabel =
    params.mode === 'buy'
      ? `Mua phim: ${String(movie.title)}`
      : `Thuê phim 72h: ${String(movie.title)}`;

  let payResult: ReturnType<typeof processUniversalCardPayment>;
  try {
    payResult = processUniversalCardPayment({
      ...(resolvedCardId
        ? { cardId: resolvedCardId }
        : {
            cardNumber: params.cardNumber,
            holderName: params.holderName,
            expiry: params.expiry,
            cvv: params.cvv,
          }),
      merchant: `YouTube Cinema · ${actionLabel}`,
      amount: price,
      category: 'Giải trí',
      channelType: 'online',
      appSource: 'YouTube',
      idempotencyKey: params.idempotencyKey || ytUid('ytmov'),
    });
  } catch (err) {
    if (err instanceof CardEngineHttpError) {
      const mappedCode = err.code === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT_FUNDS' : err.code;
      throw new YouTubePaymentHttpError(err.statusCode, err.message, mappedCode, err.code);
    }
    throw err;
  }

  const tx = payResult.transaction as Record<string, unknown>;
  const receipt = payResult.receipt as Record<string, unknown>;
  const usedCardId = String(receipt.sourceCardId || tx.source_card_id || resolvedCardId || '');
  const usedLast4 = String(receipt.sourceCardLast4 || tx.source_card_last4 || '');
  const usedBankName = String(receipt.bankName || tx.bank_name || 'Hikari Bank');

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = params.mode === 'rent' ? addDaysIso(now, 3) : '';
  const entId = ytUid('ytent');
  const invId = ytUid('ytinv');
  const invCode = genInvoiceCode();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO youtube_movie_entitlements (id, movie_id, entitlement_type, price_paid, purchased_at, expires_at, tx_id, invoice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entId, movieId, params.mode, price, nowIso, expiresAt, String(tx.id || ''), invId);

    db.prepare(`
      INSERT INTO youtube_billing_invoices (
        id, invoice_code, tx_id, card_id, card_last4, bank_name, action_type,
        plan_id, movie_id, title, amount, status, period_start, period_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'paid', ?, ?, ?)
    `).run(
      invId,
      invCode,
      String(tx.id || ''),
      usedCardId,
      usedLast4,
      usedBankName,
      params.mode,
      movieId,
      actionLabel,
      price,
      nowIso,
      expiresAt,
      nowIso
    );

    pushYoutubeOsNotification(
      db,
      params.mode === 'buy' ? 'Mua phim thành công' : 'Thuê phim thành công',
      `${actionLabel} · ${formatVndYt(price)} qua thẻ •••• ${usedLast4}. Sẵn sàng xem ngay.`
    );
  })();

  return {
    ok: true,
    entitlementId: entId,
    payment: payResult,
    overview: getYoutubeStreamingOverview(db),
  };
}

export function cancelYoutubeMembership(db: Database.Database) {
  ensureYoutubePremiumSchema(db);
  const { membership } = syncYoutubeMembershipLifecycle(db);
  const planId = String(membership.plan_id || 'free') as YouTubePlanId;
  if (planId === 'free' || String(membership.status) !== 'active') {
    throw new YouTubePaymentHttpError(400, 'Hiện không có gói YouTube Premium đang hoạt động để hủy.', 'NO_ACTIVE_PLAN');
  }
  const nowIso = new Date().toISOString();
  const plan = YOUTUBE_PLANS[planId];

  db.prepare(`
    UPDATE youtube_memberships
    SET auto_renew = 0, next_billing_at = '', cancelled_at = ?, updated_at = ?
    WHERE id = 'user_1'
  `).run(nowIso, nowIso);

  db.prepare(`
    INSERT INTO youtube_billing_invoices (
      id, invoice_code, tx_id, card_id, card_last4, bank_name, action_type,
      plan_id, movie_id, title, amount, status, period_start, period_end, created_at
    ) VALUES (?, ?, '', ?, '', '', 'cancel', ?, '', ?, 0, 'cancelled', ?, ?, ?)
  `).run(
    ytUid('ytinv'),
    genInvoiceCode(),
    String(membership.saved_card_id || ''),
    planId,
    `Hủy gia hạn gói YouTube ${plan.name}`,
    String(membership.subscribed_at || nowIso),
    String(membership.expires_at || ''),
    nowIso
  );

  pushYoutubeOsNotification(
    db,
    'Đã hủy tự động gia hạn YouTube Premium',
    `Bạn vẫn giữ quyền lợi gói ${plan.name} cho đến hết ngày ${new Date(String(membership.expires_at)).toLocaleDateString('vi-VN')}.`
  );

  return getYoutubeStreamingOverview(db);
}

export function toggleYoutubeAutoRenew(db: Database.Database, enabled: boolean, cardId?: string) {
  ensureYoutubePremiumSchema(db);
  const { membership } = syncYoutubeMembershipLifecycle(db);
  const planId = String(membership.plan_id || 'free') as YouTubePlanId;
  if (planId === 'free' || String(membership.status) !== 'active') {
    throw new YouTubePaymentHttpError(400, 'Chỉ có thể bật tự động gia hạn khi đang có gói thành viên hoạt động.', 'NO_ACTIVE_PLAN');
  }

  const targetCardId = (cardId || String(membership.saved_card_id || '')).trim();
  if (enabled) {
    if (!targetCardId) {
      throw new YouTubePaymentHttpError(
        400,
        'Vui lòng liên kết một thẻ ngân hàng hợp lệ trước khi bật tự động gia hạn.',
        'MISSING_PAYMENT_METHOD'
      );
    }
    const validated = validateAndGetTokenizedCard(db, { cardId: targetCardId });
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE youtube_memberships
      SET auto_renew = 1, next_billing_at = expires_at, saved_card_id = ?, saved_card_summary_json = ?,
          cancelled_at = '', last_renewal_error = '', updated_at = ?
      WHERE id = 'user_1'
    `).run(validated.cardId, JSON.stringify(validated.summary), nowIso);
  } else {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE youtube_memberships
      SET auto_renew = 0, next_billing_at = '', updated_at = ?
      WHERE id = 'user_1'
    `).run(nowIso);
  }

  return getYoutubeStreamingOverview(db);
}

export function updateYoutubeSavedPaymentMethod(
  db: Database.Database,
  params: {
    unlink?: boolean;
    cardId?: string;
    cardNumber?: string;
    holderName?: string;
    expiry?: string;
    cvv?: string;
  }
) {
  ensureYoutubePremiumSchema(db);
  const nowIso = new Date().toISOString();
  if (params.unlink) {
    db.prepare(`
      UPDATE youtube_memberships
      SET saved_card_id = '', saved_card_summary_json = '{}', auto_renew = 0, next_billing_at = '', updated_at = ?
      WHERE id = 'user_1'
    `).run(nowIso);
    return getYoutubeStreamingOverview(db);
  }

  const validated = validateAndGetTokenizedCard(db, params);
  db.prepare(`
    UPDATE youtube_memberships
    SET saved_card_id = ?, saved_card_summary_json = ?, last_renewal_error = '', updated_at = ?
    WHERE id = 'user_1'
  `).run(validated.cardId, JSON.stringify(validated.summary), nowIso);

  return getYoutubeStreamingOverview(db);
}

export function simulateYoutubeBillingCycle(db: Database.Database) {
  ensureYoutubePremiumSchema(db);
  const mem = db.prepare("SELECT * FROM youtube_memberships WHERE id = 'user_1'").get() as Record<string, unknown>;
  if (String(mem.plan_id || 'free') === 'free' || String(mem.status || 'free') !== 'active') {
    throw new YouTubePaymentHttpError(400, 'Không có gói đang hoạt động để mô phỏng chu kỳ đến hạn.', 'NO_ACTIVE_PLAN');
  }
  const pastIso = new Date(Date.now() - 60_000).toISOString();
  db.prepare("UPDATE youtube_memberships SET expires_at = ? WHERE id = 'user_1'").run(pastIso);
  const overview = getYoutubeStreamingOverview(db);
  return overview;
}
