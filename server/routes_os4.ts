import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.ts';
import { hashSecret } from './routes_os3.ts';
import {
  exportOsVersionHistory,
  getLatestOsRelease,
  getOsVersionHistoryPayload,
  restoreOsVersionHistory,
} from './os_releases.ts';
import {
  YouTubePaymentHttpError,
  cancelYoutubeMembership,
  evaluateMovieAccess,
  getYoutubeStreamingOverview,
  purchaseYoutubeMovie,
  simulateYoutubeBillingCycle,
  subscribeYoutubePlan,
  toggleYoutubeAutoRenew,
  updateYoutubeSavedPaymentMethod,
} from './youtube_premium_engine.ts';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function redactSensitive(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, '[PHONE_REDACTED]')
    .replace(/(api[_-]?key|token|password|pin|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 400);
}

// Verified official embeddable YouTube catalog (fallback when YOUTUBE_API_KEY is not configured)
const CURATED_OFFICIAL_YOUTUBE = [
  {
    videoId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    durationLabel: 'Trực tiếp',
    category: 'Âm nhạc',
    description: 'Kênh âm nhạc lofi chính thức của Lofi Girl — phát qua trình phát nhúng YouTube chính thức.',
  },
  {
    videoId: '5qap5aO4i9A',
    title: 'lofi hip hop beats to chill / study (Lofi Records)',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    durationLabel: 'Video',
    category: 'Âm nhạc',
    description: 'Tuyển tập âm nhạc thư giãn làm việc và học tập.',
  },
  {
    videoId: 'LXb3EKWsInQ',
    title: 'COSTA RICA IN 4K 60fps HDR (Ultra HD)',
    channelTitle: 'Jacob + Katie Schwarz',
    thumbnail: 'https://i.ytimg.com/vi/LXb3EKWsInQ/hqdefault.jpg',
    durationLabel: '5:14',
    category: 'Thiên nhiên',
    description: 'Thước phim thiên nhiên 4K HDR chính thức kiểm tra chất lượng hiển thị.',
  },
  {
    videoId: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 60fps 4K - Blender Open Movie',
    channelTitle: 'Blender Foundation',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    durationLabel: '10:34',
    category: 'Hoạt hình',
    description: 'Phim hoạt hình mã nguồn mở chính thức từ Blender Foundation.',
  },
  {
    videoId: 'M7lc1UVf-VE',
    title: 'YouTube Developers Live: Embedded IFrame Player API',
    channelTitle: 'Google for Developers',
    thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg',
    durationLabel: '22:18',
    category: 'Công nghệ',
    description: 'Hướng dẫn chính thức tích hợp trình phát nhúng YouTube IFrame.',
  },
  {
    videoId: '4xDzrJKXOOY',
    title: 'synthwave radio - chill synth / retro beats',
    channelTitle: 'Lofi Girl Synthwave',
    thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    durationLabel: 'Trực tiếp',
    category: 'Âm nhạc',
    description: 'Đài phát synthwave chính thức giúp tập trung lập trình và sáng tạo.',
  },
];

// Discovery Movies / Series Catalog with official trailers & legal platform links
const MOVIE_DISCOVERY_CATALOG = [
  {
    id: 'mov_suzume',
    title: 'Khóa Chặt Cửa Nào Suzume',
    originalTitle: 'Suzume no Tojimari',
    year: 2022,
    genre: 'Anime · Phiêu lưu',
    duration: '122 phút',
    rating: 8.3,
    poster: '/src/assets/images/wallpaper_sakura_dusk_1794880090073.jpg',
    trailerYoutubeId: '5pTcio2hTSw',
    synopsis: 'Cô nữ sinh 17 tuổi Suzume đồng hành cùng chàng trai bí ẩn để đóng lại những cánh cửa tai họa khắp nước Nhật.',
    cast: ['Nanoka Hara', 'Hokuto Matsumura', 'Eri Fukatsu'],
    providers: [
      { name: 'Netflix', url: 'https://www.netflix.com/search?q=Suzume', note: 'Mở ứng dụng/web chính thức' },
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/search?q=Suzume', note: 'Nền tảng Anime bản quyền' },
    ],
  },
  {
    id: 'mov_yourname',
    title: 'Tên Cậu Là Gì? (Your Name)',
    originalTitle: 'Kimi no Na wa',
    year: 2016,
    genre: 'Anime · Lãng mạn',
    duration: '107 phút',
    rating: 8.8,
    poster: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
    trailerYoutubeId: 'xU47nhruN-Q',
    synopsis: 'Hai người xa lạ ở Tokyo và vùng quê Itomori bất ngờ hoán đổi thân xác qua những giấc mơ kỳ lạ.',
    cast: ['Ryunosuke Kamiki', 'Mone Kamishiraishi'],
    providers: [
      { name: 'Netflix', url: 'https://www.netflix.com/search?q=Your%20Name', note: 'Mở trên Netflix' },
      { name: 'Prime Video', url: 'https://www.primevideo.com/search?phrase=Your+Name', note: 'Mở trên Prime Video' },
    ],
  },
  {
    id: 'mov_dune2',
    title: 'Hành Tinh Cát: Phần Hai',
    originalTitle: 'Dune: Part Two',
    year: 2024,
    genre: 'Khoa học viễn tưởng',
    duration: '166 phút',
    rating: 8.6,
    poster: '/src/assets/images/char_akira_1794880089961.jpg',
    trailerYoutubeId: 'Way9Dexny3w',
    synopsis: 'Paul Atreides hợp sức cùng Chani và người Fremen bước vào cuộc hành trình bảo vệ hành tinh Arrakis.',
    cast: ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson'],
    providers: [
      { name: 'Prime Video', url: 'https://www.primevideo.com/search?phrase=Dune', note: 'Thuê/Xem trên Prime Video' },
      { name: 'Apple TV', url: 'https://tv.apple.com/search?term=Dune', note: 'Mở trên Apple TV' },
    ],
  },
  {
    id: 'mov_insideout2',
    title: 'Những Mảnh Ghép Cảm Xúc 2',
    originalTitle: 'Inside Out 2',
    year: 2024,
    genre: 'Hoạt hình · Gia đình',
    duration: '96 phút',
    rating: 7.9,
    poster: '/src/assets/images/char_sakura_1794880090451.jpg',
    trailerYoutubeId: 'LEjhY15eCx0',
    synopsis: 'Trung tâm điều khiển tâm trí của Riley đón nhận những cảm xúc tuổi thiếu niên hoàn toàn mới.',
    cast: ['Amy Poehler', 'Maya Hawke', 'Kensington Tallman'],
    providers: [
      { name: 'Disney+', url: 'https://www.disneyplus.com/search?q=Inside+Out+2', note: 'Mở trên Disney+' },
      { name: 'Galaxy Play', url: 'https://galaxyplay.vn/search?q=Inside+Out', note: 'Dịch vụ bản quyền VN' },
    ],
  },
];

// Live YouTube search without requiring YOUTUBE_API_KEY (parses ytInitialData from youtube.com/results)
interface YouTubeSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnail: string;
  durationLabel: string;
  viewCountText?: string;
  publishedTimeText?: string;
  category: string;
  description: string;
}

function getYouTubeSearchSpParam(sort: string, duration: string, type: string): string {
  // Official YouTube `sp` base64-encoded filter combinations when available
  if (sort === 'date') return 'CAI%253D';
  if (sort === 'views') return 'CAM%253D';
  if (sort === 'rating') return 'CAE%253D';
  if (duration === 'short') return 'EgIYAQ%253D%253D';
  if (duration === 'medium') return 'EgIYAw%253D%253D';
  if (duration === 'long') return 'EgIYAg%253D%253D';
  if (type === 'channel') return 'EgIQAg%253D%253D';
  return '';
}

async function searchYouTubeLive(
  searchQuery: string,
  category = '',
  opts?: { sort?: string; duration?: string; type?: string }
): Promise<YouTubeSearchItem[]> {
  const sp = getYouTubeSearchSpParam(opts?.sort || 'relevance', opts?.duration || 'any', opts?.type || 'video');
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}${sp ? `&sp=${sp}` : ''}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`YouTube HTTP ${res.status}`);
  }
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!match?.[1]) {
    throw new Error('Không phân tích được dữ liệu tìm kiếm YouTube');
  }
  const data = JSON.parse(match[1]) as {
    contents?: {
      twoColumnSearchResultsRenderer?: {
        primaryContents?: {
          sectionListRenderer?: {
            contents?: Array<{
              itemSectionRenderer?: {
                contents?: Array<{
                  videoRenderer?: {
                    videoId?: string;
                    title?: { runs?: Array<{ text?: string }> };
                    ownerText?: {
                      runs?: Array<{
                        text?: string;
                        navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
                      }>;
                    };
                    thumbnail?: { thumbnails?: Array<{ url?: string }> };
                    lengthText?: { simpleText?: string };
                    viewCountText?: { simpleText?: string };
                    publishedTimeText?: { simpleText?: string };
                    detailedMetadataSnippets?: Array<{ snippetText?: { runs?: Array<{ text?: string }> } }>;
                  };
                }>;
              };
            }>;
          };
        };
      };
    };
  };

  const sections =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const items: YouTubeSearchItem[] = [];
  const seen = new Set<string>();

  for (const sec of sections) {
    for (const entry of sec.itemSectionRenderer?.contents || []) {
      const v = entry.videoRenderer;
      if (!v?.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      const title = v.title?.runs?.map((r) => r.text || '').join('') || 'Video YouTube';
      const channelTitle = v.ownerText?.runs?.[0]?.text || 'Kênh YouTube';
      const channelId = v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || channelTitle;
      const rawThumb = v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
      const thumbnail = rawThumb || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const durationLabel = v.lengthText?.simpleText || 'Trực tiếp';
      const viewCountText = v.viewCountText?.simpleText || '';
      const publishedTimeText = v.publishedTimeText?.simpleText || '';
      const description =
        v.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r) => r.text || '').join('') || '';
      items.push({
        videoId: v.videoId,
        title,
        channelTitle,
        channelId,
        thumbnail,
        durationLabel,
        viewCountText,
        publishedTimeText,
        category: category || 'Tìm kiếm',
        description,
      });
      if (items.length >= 16) return items;
    }
  }
  return items;
}

// Simple search cache to conserve YouTube requests
const ytCache = new Map<string, { at: number; items: unknown[] }>();

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower.endsWith('.local')) return true;
  if (/^10\./.test(lower) || /^192\.168\./.test(lower) || /^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true;
  return false;
}

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ');

const DEFAULT_CLOUD_RUN_APP_URL = 'https://ais-dev-bsub4spdizvja5lpktnt7m-1003779894555.asia-east1.run.app';

function isDisallowedCallbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'aistudio.google.com' ||
    host.endsWith('.aistudio.google.com')
  );
}

function getBaseAppUrl(req?: Request): string {
  const raw = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'https:' && !isDisallowedCallbackHost(parsed.hostname)) {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }
  const forwardedHost = (typeof req?.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host']
    : req?.headers.host || ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostOnly = forwardedHost.split(':')[0];
  if (hostOnly && hostOnly.endsWith('.run.app') && !isDisallowedCallbackHost(hostOnly)) {
    return `https://${forwardedHost}`;
  }
  return DEFAULT_CLOUD_RUN_APP_URL;
}

function resolveSafeAppUrl(requestedOrigin?: string, req?: Request): string {
  const envAppUrl = getBaseAppUrl(req);
  if (!requestedOrigin) return envAppUrl;
  try {
    const parsed = new URL(requestedOrigin.trim());
    const host = parsed.hostname.toLowerCase();
    // Never allow localhost or Google AI Studio portal host as an OAuth callback target
    if (isDisallowedCallbackHost(host)) {
      return envAppUrl;
    }
    const isValidRunApp = parsed.protocol === 'https:' && host.endsWith('.run.app');
    let matchesEnvHost = false;
    try {
      matchesEnvHost = parsed.origin === new URL(envAppUrl).origin;
    } catch {
      matchesEnvHost = false;
    }
    if (isValidRunApp || matchesEnvHost) {
      return parsed.origin.replace(/\/+$/, '');
    }
  } catch {
    // Ignore malformed origin
  }
  return envAppUrl;
}

function getSpotifyConfig(requestedOrigin?: string, req?: Request) {
  const clientId = (process.env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || '').trim();
  const appUrl = resolveSafeAppUrl(requestedOrigin, req);
  const redirectUri = `${appUrl}/auth/spotify/callback`;
  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

interface SpotifyOAuthRow {
  provider: string;
  account_id: string;
  display_name: string;
  avatar_url: string;
  profile_url: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  connected_at: string;
}

function renderOAuthCallbackHtml(success: boolean, message: string, accountName = ''): string {
  const esc = (s: string) =>
    s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
  const safeMsg = esc(message);
  const safeAcc = esc(accountName);
  const payload = JSON.stringify(
    success
      ? { type: 'OAUTH_AUTH_SUCCESS', provider: 'spotify', displayName: accountName }
      : { type: 'OAUTH_AUTH_ERROR', provider: 'spotify', error: message }
  );
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spotify OAuth · PHONE OS</title>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#101014;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <div style="max-width:360px;width:100%;background:#1a1a22;border:1px solid #27272a;border-radius:20px;padding:24px;">
      <div style="width:48px;height:48px;border-radius:999px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:22px;background:${
        success ? 'rgba(16,185,129,0.16)' : 'rgba(244,63,94,0.16)'
      };color:${success ? '#34d399' : '#fb7185'};">
        ${success ? '✓' : '!'}
      </div>
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;">${safeMsg}</p>
      ${safeAcc ? `<p style="font-size:13px;color:#34d399;margin:0 0 10px;">Tài khoản: ${safeAcc}</p>` : ''}
      <p id="hint" style="font-size:12px;color:#a1a1aa;line-height:1.5;margin:0 0 18px;">
        ${
          success
            ? 'Trạng thái đã được lưu vào PHONE OS. Nếu tab này không tự đóng trên điện thoại, hãy đóng tab này và quay lại tab PHONE OS.'
            : 'Vui lòng đóng tab này để quay lại PHONE OS và thử lại.'
        }
      </p>
      <button onclick="window.close()" style="width:100%;padding:11px 16px;border:0;border-radius:12px;background:${
        success ? '#10b981' : '#3f3f46'
      };color:#fff;font-size:13px;font-weight:600;cursor:pointer;">
        Đóng cửa sổ này
      </button>
    </div>
    <script>
      (function () {
        var msg = ${payload};
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            var ch = new BroadcastChannel('phoneos_spotify_oauth');
            ch.postMessage(msg);
            ch.close();
          }
        } catch (e) {}
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(msg, '*');
            setTimeout(function () { window.close(); }, 450);
          }
        } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

export async function handleSpotifyOAuthCallback(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    const errDesc =
      oauthError === 'access_denied'
        ? 'Bạn đã hủy cấp quyền kết nối Spotify.'
        : `Spotify từ chối cấp quyền: ${oauthError}`;
    res.status(400).send(renderOAuthCallbackHtml(false, errDesc));
    return;
  }

  // Clean expired states and validate single-use state from SQLite
  db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
  const stateRow = state
    ? (db.prepare('SELECT state, provider, redirect_uri, expires_at FROM oauth_states WHERE state = ? AND provider = ?').get(state, 'spotify') as
        | { state: string; provider: string; redirect_uri: string; expires_at: number }
        | undefined)
    : undefined;

  if (!state || !stateRow || stateRow.expires_at < Date.now()) {
    if (state) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    res.status(400).send(renderOAuthCallbackHtml(false, 'Phiên xác thực OAuth không hợp lệ hoặc đã hết hạn. Vui lòng thử kết nối lại.'));
    return;
  }
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

  const cfg = getSpotifyConfig();
  if (!cfg.configured || !code) {
    res.status(400).send(renderOAuthCallbackHtml(false, 'Thiếu cấu hình Spotify OAuth hoặc mã xác thực từ Spotify.'));
    return;
  }

  try {
    const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: stateRow.redirect_uri,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      res
        .status(502)
        .send(renderOAuthCallbackHtml(false, `Đổi mã token Spotify thất bại (${tokenRes.status}): ${errText.slice(0, 140)}`));
      return;
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    const meJson = meRes.ok
      ? ((await meRes.json()) as {
          id?: string;
          display_name?: string;
          images?: Array<{ url?: string }>;
          external_urls?: { spotify?: string };
        })
      : {};

    const displayName = meJson.display_name || 'Người dùng Spotify';
    const now = new Date().toISOString();
    const expiresAt = Date.now() + (tokenJson.expires_in || 3600) * 1000;
    db.prepare(`
      INSERT OR REPLACE INTO music_oauth_connections (
        provider, account_id, display_name, avatar_url, profile_url,
        access_token, refresh_token, expires_at, scope, connected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'spotify',
      meJson.id || '',
      displayName,
      meJson.images?.[0]?.url || '',
      meJson.external_urls?.spotify || 'https://open.spotify.com',
      tokenJson.access_token,
      tokenJson.refresh_token || '',
      expiresAt,
      tokenJson.scope || SPOTIFY_SCOPES,
      now
    );

    res.send(renderOAuthCallbackHtml(true, 'Đã kết nối Spotify thành công!', displayName));
  } catch (err) {
    res.status(500).send(
      renderOAuthCallbackHtml(false, err instanceof Error ? err.message : 'Lỗi kết nối máy chủ Spotify.')
    );
  }
}

async function ensureValidSpotifyAccessToken(): Promise<SpotifyOAuthRow | null> {
  const row = db
    .prepare('SELECT * FROM music_oauth_connections WHERE provider = ?')
    .get('spotify') as SpotifyOAuthRow | undefined;
  if (!row || !row.access_token) return null;
  if (Date.now() < row.expires_at - 60_000) return row;
  if (!row.refresh_token) return row;

  const cfg = getSpotifyConfig();
  if (!cfg.configured) return row;

  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!refreshRes.ok) {
    if (refreshRes.status === 400 || refreshRes.status === 401) {
      db.prepare('DELETE FROM music_oauth_connections WHERE provider = ?').run('spotify');
    }
    return null;
  }

  const tokenJson = (await refreshRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const nextExpiresAt = Date.now() + (tokenJson.expires_in || 3600) * 1000;
  const nextRefresh = tokenJson.refresh_token || row.refresh_token;
  db.prepare(
    'UPDATE music_oauth_connections SET access_token = ?, refresh_token = ?, expires_at = ? WHERE provider = ?'
  ).run(tokenJson.access_token, nextRefresh, nextExpiresAt, 'spotify');

  return {
    ...row,
    access_token: tokenJson.access_token,
    refresh_token: nextRefresh,
    expires_at: nextExpiresAt,
  };
}

export function createOS4Router(): Router {
  const router = Router();

  // ==========================================
  // 1. INTEGRATIONS REGISTRY (HONEST A/B/C/D)
  // ==========================================
  router.get('/integrations', (_req: Request, res: Response) => {
    const geminiOk = Boolean(process.env.GEMINI_API_KEY);
    const youtubeOk = Boolean(process.env.YOUTUBE_API_KEY);
    const tmdbOk = Boolean(process.env.TMDB_API_KEY);

    res.json({
      osVersion: getLatestOsRelease(db).version,
      services: [
        {
          key: 'sqlite_core',
          name: 'Cơ sở dữ liệu & Hệ điều hành nội bộ PHONE OS',
          type: 'A',
          status: 'connected',
          detail: 'Hoạt động thật với SQLite WAL, Ghi chú, Lịch, Nhắc nhở, Danh bạ, Hồ sơ, Sao lưu & Khôi phục nguyên tử.',
        },
        {
          key: 'gemini_ai',
          name: 'Gemini AI (Trợ lý, Nhân vật AI, Dịch, OCR, Giọng nói)',
          type: 'B',
          status: geminiOk ? 'connected' : 'unconfigured',
          detail: geminiOk
            ? 'Đã kết nối GEMINI_API_KEY qua proxy máy chủ bảo mật.'
            : 'Chưa cấu hình GEMINI_API_KEY trong .env — đang dùng phản hồi dự phòng nội bộ.',
          ...(geminiOk
            ? {}
            : { configGuide: 'Thêm GEMINI_API_KEY=... vào tệp .env phía máy chủ và khởi động lại.' }),
        },
        {
          key: 'youtube_data',
          name: 'Tìm kiếm YouTube & Trình phát IFrame chính thức',
          type: 'B',
          status: 'connected',
          detail: youtubeOk
            ? 'Đã kết nối YOUTUBE_API_KEY để tìm kiếm video thật + phát qua YouTube IFrame Embed chính thức.'
            : 'Hoạt động tìm kiếm YouTube trực tiếp qua proxy máy chủ (không cần API key) & phát qua trình phát nhúng YouTube IFrame chính thức.',
        },
        {
          key: 'weather_maps_news',
          name: 'Open-Meteo, Frankfurter, OpenStreetMap, Hacker News',
          type: 'B',
          status: 'connected',
          detail: 'Các API công khai hoạt động trực tiếp qua backend proxy (Thời tiết, Tiền tệ, Bản đồ Nominatim, Tin tức).',
        },
        {
          key: 'streaming_hubs',
          name: 'Netflix / Disney+ / Spotify / Apple Music',
          type: 'B',
          status: getSpotifyConfig().configured ? 'connected' : 'unconfigured',
          detail: getSpotifyConfig().configured
            ? 'Đã kích hoạt Spotify OAuth 2.0 chính thức trong Kho Nhạc; không thu thập mật khẩu bên thứ ba hay phát luồng lậu.'
            : 'Không lưu mật khẩu hay vượt DRM; hỗ trợ kết nối Spotify OAuth 2.0 chính thức khi cấu hình SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET và mở liên kết chính thức tới ứng dụng/trang web của nhà cung cấp.',
          ...(getSpotifyConfig().configured
            ? {}
            : {
                configGuide:
                  'Cấu hình SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET và APP_URL trên máy chủ để bật nút Kết nối Spotify OAuth trong Kho Nhạc.',
              }),
        },
        {
          key: 'device_hardware',
          name: 'Camera, Micro, Vị trí, Pin, Thông báo & Chia sẻ Web',
          type: 'C',
          status: 'connected',
          detail: 'Dùng Web API thực tế (getUserMedia, Geolocation, BatteryManager, MediaSession, Notification) khi người dùng cấp quyền; không giả mạo dữ liệu cảm biến khi bị từ chối.',
        },
        {
          key: 'android_native_only',
          name: 'Sinh trắc học phần cứng, SMS/SIM Telecom, APK Installer, Tắt mở Wi-Fi/BT OS gốc',
          type: 'C',
          status: 'unconfigured',
          detail: 'Chưa kết nối Capacitor/Native Android plugin — trong môi trường Web/PWA các thao tác mạng, gọi SIM và sinh trắc học hoạt động ở phạm vi nội bộ hoặc mô phỏng.',
          configGuide: 'Đóng gói với Capacitor Android và thêm plugin Biometric/LocalNotifications/Telephony.',
        },
        {
          key: 'simulated_world',
          name: 'Ngân hàng Demo, Mua sắm, Đặt đồ ăn, Đặt xe, Nhà thông minh, AOD Web',
          type: 'D',
          status: 'simulated',
          detail: 'Mô phỏng hoàn toàn bằng dữ liệu hư cấu trong SQLite và luôn gắn nhãn [Mô phỏng]; không phát sinh giao dịch tiền thật.',
        },
      ],
    });
  });

  // ==========================================
  // 2. YOUTUBE OFFICIAL SEARCH + LIBRARY
  // ==========================================
  router.get('/youtube/search', async (req: Request, res: Response) => {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
    const category = (typeof req.query.category === 'string' ? req.query.category : '').trim();
    const sort = (typeof req.query.sort === 'string' ? req.query.sort : 'relevance').trim();
    const duration = (typeof req.query.duration === 'string' ? req.query.duration : 'any').trim();
    const type = (typeof req.query.type === 'string' ? req.query.type : 'video').trim();
    const saveHistory = req.query.save === '1';
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (saveHistory && q) {
      db.prepare('DELETE FROM youtube_search_history WHERE LOWER(query) = LOWER(?)').run(q);
      db.prepare('INSERT INTO youtube_search_history (id, query, created_at) VALUES (?, ?, ?)').run(
        uid('ytsh'),
        q,
        new Date().toISOString()
      );
    }

    if (!q && (!category || category === 'Tất cả')) {
      res.json({
        apiConfigured: true,
        source: 'curated_official_embed',
        note: '',
        items: CURATED_OFFICIAL_YOUTUBE,
      });
      return;
    }

    const searchQuery = q || `${category} official`;
    const cacheKey = `${searchQuery.toLowerCase()}::${sort}::${duration}::${type}`;
    const cached = ytCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      res.json({ apiConfigured: true, source: 'youtube_search_cache', note: '', items: cached.items });
      return;
    }

    if (apiKey) {
      try {
        const orderParam = sort === 'date' ? 'date' : sort === 'views' ? 'viewCount' : sort === 'rating' ? 'rating' : 'relevance';
        const durParam = ['short', 'medium', 'long'].includes(duration) ? `&videoDuration=${duration}` : '';
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&order=${orderParam}${durParam}&maxResults=14&q=${encodeURIComponent(
          searchQuery
        )}&key=${encodeURIComponent(apiKey)}`;
        const apiRes = await fetch(url);
        if (apiRes.ok) {
          const json = (await apiRes.json()) as {
            items?: Array<{
              id?: { videoId?: string };
              snippet?: {
                title?: string;
                channelTitle?: string;
                channelId?: string;
                description?: string;
                publishedAt?: string;
                thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
              };
            }>;
          };
          const items = (json.items || [])
            .filter((it) => it.id?.videoId)
            .map((it) => ({
              videoId: it.id!.videoId!,
              title: it.snippet?.title || 'Video YouTube',
              channelTitle: it.snippet?.channelTitle || 'Kênh YouTube',
              channelId: it.snippet?.channelId || it.snippet?.channelTitle || '',
              thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || '',
              durationLabel: 'YouTube',
              publishedTimeText: it.snippet?.publishedAt ? it.snippet.publishedAt.slice(0, 10) : '',
              category: category || 'Tìm kiếm',
              description: it.snippet?.description || '',
            }));
          if (items.length > 0) {
            ytCache.set(cacheKey, { at: Date.now(), items });
            res.json({ apiConfigured: true, source: 'youtube_data_api', note: '', items });
            return;
          }
        }
      } catch {
        // Fallback to live YouTube search below
      }
    }

    try {
      const liveItems = await searchYouTubeLive(searchQuery, category, { sort, duration, type });
      if (liveItems.length > 0) {
        ytCache.set(cacheKey, { at: Date.now(), items: liveItems });
        res.json({ apiConfigured: true, source: 'youtube_live_search', note: '', items: liveItems });
        return;
      }
    } catch {
      // Fallback to curated catalog if offline or blocked
    }

    const filtered = CURATED_OFFICIAL_YOUTUBE.filter((v) => {
      const matchCat = !category || category === 'Tất cả' || v.category === category;
      const matchQ =
        !q ||
        v.title.toLowerCase().includes(q.toLowerCase()) ||
        v.channelTitle.toLowerCase().includes(q.toLowerCase()) ||
        v.category.toLowerCase().includes(q.toLowerCase());
      return matchCat && matchQ;
    });
    res.json({
      apiConfigured: true,
      source: 'curated_official_embed',
      note: filtered.length === 0 ? 'Không thể kết nối tìm kiếm YouTube trực tuyến lúc này.' : '',
      items: filtered,
    });
  });

  router.get('/youtube/search-history', (_req: Request, res: Response) => {
    const items = db.prepare('SELECT * FROM youtube_search_history ORDER BY created_at DESC LIMIT 20').all();
    res.json({ items });
  });

  router.delete('/youtube/search-history/:id', (req: Request, res: Response) => {
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM youtube_search_history').run();
    } else {
      db.prepare('DELETE FROM youtube_search_history WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  router.post('/youtube/library', (req: Request, res: Response) => {
    const {
      video_id,
      title,
      channel_title,
      thumbnail_url = '',
      duration_label = '',
      list_type = 'history',
      progress_sec = 0,
      duration_sec = 0,
      channel_id = '',
      category = '',
    } = req.body as {
      video_id: string;
      title: string;
      channel_title: string;
      thumbnail_url?: string;
      duration_label?: string;
      list_type?: string;
      progress_sec?: number;
      duration_sec?: number;
      channel_id?: string;
      category?: string;
    };
    if (!video_id || !title) {
      res.status(400).json({ error: 'Thiếu thông tin video' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM youtube_library WHERE video_id = ? AND list_type = ?')
      .get(video_id, list_type) as { id: string } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      db.prepare(
        `UPDATE youtube_library
         SET created_at = ?, updated_at = ?, title = ?, thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url),
             progress_sec = CASE WHEN ? > 0 THEN ? ELSE progress_sec END,
             duration_sec = CASE WHEN ? > 0 THEN ? ELSE duration_sec END
         WHERE id = ?`
      ).run(now, now, title, thumbnail_url, progress_sec, progress_sec, duration_sec, duration_sec, existing.id);
      res.json(db.prepare('SELECT * FROM youtube_library WHERE id = ?').get(existing.id));
      return;
    }
    const id = uid('yt');
    db.prepare(
      `INSERT INTO youtube_library (id, video_id, title, channel_title, thumbnail_url, duration_label, list_type, progress_sec, duration_sec, channel_id, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      video_id,
      title,
      channel_title || 'YouTube',
      thumbnail_url,
      duration_label,
      list_type,
      Number(progress_sec) || 0,
      Number(duration_sec) || 0,
      channel_id || channel_title || '',
      category,
      now,
      now
    );
    res.json(db.prepare('SELECT * FROM youtube_library WHERE id = ?').get(id));
  });

  router.delete('/youtube/library/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM youtube_library WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/youtube/progress', (req: Request, res: Response) => {
    const {
      video_id,
      title = 'Video YouTube',
      channel_title = 'YouTube',
      thumbnail_url = '',
      duration_label = '',
      progress_sec = 0,
      duration_sec = 0,
    } = req.body as {
      video_id: string;
      title?: string;
      channel_title?: string;
      thumbnail_url?: string;
      duration_label?: string;
      progress_sec?: number;
      duration_sec?: number;
    };
    if (!video_id) {
      res.status(400).json({ error: 'Thiếu video_id' });
      return;
    }
    const now = new Date().toISOString();
    const existing = db
      .prepare("SELECT id FROM youtube_library WHERE video_id = ? AND list_type = 'history'")
      .get(video_id) as { id: string } | undefined;
    if (existing) {
      db.prepare('UPDATE youtube_library SET progress_sec = ?, duration_sec = CASE WHEN ? > 0 THEN ? ELSE duration_sec END, updated_at = ?, created_at = ? WHERE id = ?').run(
        Math.max(0, Math.round(Number(progress_sec) || 0)),
        Math.round(Number(duration_sec) || 0),
        Math.round(Number(duration_sec) || 0),
        now,
        now,
        existing.id
      );
      res.json({ ok: true, item: db.prepare('SELECT * FROM youtube_library WHERE id = ?').get(existing.id) });
      return;
    }
    const id = uid('yt');
    db.prepare(
      `INSERT INTO youtube_library (id, video_id, title, channel_title, thumbnail_url, duration_label, list_type, progress_sec, duration_sec, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'history', ?, ?, ?, ?)`
    ).run(
      id,
      video_id,
      title,
      channel_title,
      thumbnail_url || `https://i.ytimg.com/vi/${video_id}/hqdefault.jpg`,
      duration_label,
      Math.max(0, Math.round(Number(progress_sec) || 0)),
      Math.max(0, Math.round(Number(duration_sec) || 0)),
      now,
      now
    );
    res.json({ ok: true, item: db.prepare('SELECT * FROM youtube_library WHERE id = ?').get(id) });
  });

  router.post('/youtube/like', (req: Request, res: Response) => {
    const {
      video_id,
      title = 'Video YouTube',
      channel_title = 'YouTube',
      thumbnail_url = '',
      duration_label = '',
      value = 1,
    } = req.body as {
      video_id: string;
      title?: string;
      channel_title?: string;
      thumbnail_url?: string;
      duration_label?: string;
      value?: number;
    };
    if (!video_id) {
      res.status(400).json({ error: 'Thiếu video_id' });
      return;
    }
    const nextLiked = value === 1 ? 1 : value === -1 ? -1 : 0;
    const now = new Date().toISOString();
    const existing = db
      .prepare("SELECT id, liked FROM youtube_library WHERE video_id = ? AND list_type = 'liked'")
      .get(video_id) as { id: string; liked: number } | undefined;

    if (nextLiked === 0 || (existing && existing.liked === nextLiked)) {
      if (existing) db.prepare('DELETE FROM youtube_library WHERE id = ?').run(existing.id);
      res.json({ liked: 0, likesCount: 120 });
      return;
    }

    if (existing) {
      db.prepare('UPDATE youtube_library SET liked = ?, updated_at = ?, created_at = ? WHERE id = ?').run(nextLiked, now, now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO youtube_library (id, video_id, title, channel_title, thumbnail_url, duration_label, list_type, liked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'liked', ?, ?, ?)`
      ).run(
        uid('yt'),
        video_id,
        title,
        channel_title,
        thumbnail_url || `https://i.ytimg.com/vi/${video_id}/hqdefault.jpg`,
        duration_label,
        nextLiked,
        now,
        now
      );
    }
    res.json({ liked: nextLiked, likesCount: nextLiked === 1 ? 121 : 120 });
  });

  router.get('/youtube/video-meta/:videoId', (req: Request, res: Response) => {
    const videoId = req.params.videoId;
    const channelParam = typeof req.query.channel === 'string' ? req.query.channel : '';
    const historyRow = db
      .prepare("SELECT progress_sec, duration_sec FROM youtube_library WHERE video_id = ? AND list_type = 'history' LIMIT 1")
      .get(videoId) as { progress_sec?: number; duration_sec?: number } | undefined;
    const likedRow = db
      .prepare("SELECT liked FROM youtube_library WHERE video_id = ? AND list_type = 'liked' LIMIT 1")
      .get(videoId) as { liked?: number } | undefined;
    const watchLaterRow = db
      .prepare("SELECT id FROM youtube_library WHERE video_id = ? AND list_type = 'watch_later' LIMIT 1")
      .get(videoId) as { id: string } | undefined;
    const isSubscribed = channelParam
      ? Boolean(db.prepare('SELECT 1 FROM youtube_subscriptions WHERE channel_id = ? OR LOWER(channel_title) = LOWER(?) LIMIT 1').get(channelParam, channelParam))
      : false;
    const playlists = db.prepare('SELECT * FROM youtube_playlists ORDER BY updated_at DESC').all() as Array<{
      id: string;
      name: string;
      items_json: string;
    }>;
    const inPlaylistIds = playlists
      .filter((pl) => {
        try {
          const items = JSON.parse(pl.items_json || '[]') as Array<{ video_id?: string }>;
          return items.some((it) => it.video_id === videoId);
        } catch {
          return false;
        }
      })
      .map((pl) => pl.id);

    res.json({
      videoId,
      liked: likedRow?.liked || 0,
      likesCount: (likedRow?.liked || 0) === 1 ? 121 : 120,
      progressSec: historyRow?.progress_sec || 0,
      durationSec: historyRow?.duration_sec || 0,
      inWatchLater: Boolean(watchLaterRow),
      watchLaterId: watchLaterRow?.id || '',
      isSubscribed,
      inPlaylistIds,
    });
  });

  router.get('/youtube/subscriptions', (_req: Request, res: Response) => {
    const subscriptions = db.prepare('SELECT * FROM youtube_subscriptions ORDER BY subscribed_at DESC').all();
    res.json({ subscriptions });
  });

  router.post('/youtube/subscribe', (req: Request, res: Response) => {
    const { channel_id, channel_title, avatar_url = '' } = req.body as {
      channel_id?: string;
      channel_title: string;
      avatar_url?: string;
    };
    const cid = (channel_id || channel_title || '').trim();
    if (!cid) {
      res.status(400).json({ error: 'Thiếu thông tin kênh' });
      return;
    }
    const existing = db
      .prepare('SELECT channel_id FROM youtube_subscriptions WHERE channel_id = ? OR LOWER(channel_title) = LOWER(?)')
      .get(cid, channel_title || cid) as { channel_id: string } | undefined;
    if (existing) {
      db.prepare('DELETE FROM youtube_subscriptions WHERE channel_id = ?').run(existing.channel_id);
      res.json({ subscribed: false, subscriptions: db.prepare('SELECT * FROM youtube_subscriptions ORDER BY subscribed_at DESC').all() });
      return;
    }
    db.prepare('INSERT INTO youtube_subscriptions (channel_id, channel_title, avatar_url, subscribed_at) VALUES (?, ?, ?, ?)').run(
      cid,
      channel_title || cid,
      avatar_url,
      new Date().toISOString()
    );
    res.json({ subscribed: true, subscriptions: db.prepare('SELECT * FROM youtube_subscriptions ORDER BY subscribed_at DESC').all() });
  });

  router.get('/youtube/comments', (req: Request, res: Response) => {
    const videoId = typeof req.query.videoId === 'string' ? req.query.videoId : '';
    if (!videoId) {
      res.json({ comments: [] });
      return;
    }
    const comments = db.prepare('SELECT * FROM youtube_comments WHERE video_id = ? ORDER BY created_at DESC').all(videoId);
    res.json({ comments });
  });

  router.post('/youtube/comments', (req: Request, res: Response) => {
    const { video_id, parent_id = '', content } = req.body as { video_id: string; parent_id?: string; content: string };
    const text = (content || '').trim();
    if (!video_id || !text) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung bình luận' });
      return;
    }
    const profile = db.prepare("SELECT name, avatar FROM user_profile WHERE id = 'user_1'").get() as
      | { name?: string; avatar?: string }
      | undefined;
    const id = uid('ytc');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO youtube_comments (id, video_id, parent_id, author_id, author_name, author_avatar, content, likes_count, is_liked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)'
    ).run(id, video_id, parent_id, 'user_1', profile?.name || 'Minh Anh', profile?.avatar || '/src/assets/images/char_sakura_1794880090451.jpg', text, now);
    res.json({ comment: db.prepare('SELECT * FROM youtube_comments WHERE id = ?').get(id) });
  });

  router.patch('/youtube/comments/:id', (req: Request, res: Response) => {
    const cmt = db.prepare('SELECT * FROM youtube_comments WHERE id = ?').get(req.params.id) as
      | { likes_count: number; is_liked: number }
      | undefined;
    if (!cmt) {
      res.status(404).json({ error: 'Không tìm thấy bình luận' });
      return;
    }
    if (req.body.toggleLike) {
      const nextLiked = cmt.is_liked ? 0 : 1;
      const nextCount = Math.max(0, cmt.likes_count + (nextLiked ? 1 : -1));
      db.prepare('UPDATE youtube_comments SET is_liked = ?, likes_count = ? WHERE id = ?').run(nextLiked, nextCount, req.params.id);
    }
    res.json({ comment: db.prepare('SELECT * FROM youtube_comments WHERE id = ?').get(req.params.id) });
  });

  router.delete('/youtube/comments/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM youtube_comments WHERE id = ? OR parent_id = ?').run(req.params.id, req.params.id);
    res.json({ ok: true });
  });

  router.get('/youtube/playlists', (_req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM youtube_playlists ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>;
    res.json({
      playlists: rows.map((r) => ({
        ...r,
        items: (() => {
          try {
            return JSON.parse(String(r.items_json || '[]'));
          } catch {
            return [];
          }
        })(),
      })),
    });
  });

  router.post('/youtube/playlists', (req: Request, res: Response) => {
    const { name, description = '', firstVideo } = req.body as {
      name: string;
      description?: string;
      firstVideo?: { video_id: string; title: string; channel_title: string; thumbnail_url?: string; duration_label?: string };
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Tên danh sách phát không được trống' });
      return;
    }
    const id = uid('ytpl');
    const now = new Date().toISOString();
    const items = firstVideo?.video_id ? [firstVideo] : [];
    db.prepare('INSERT INTO youtube_playlists (id, name, description, items_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      name.trim(),
      description.trim(),
      JSON.stringify(items),
      now,
      now
    );
    const created = db.prepare('SELECT * FROM youtube_playlists WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ playlist: { ...created, items } });
  });

  router.patch('/youtube/playlists/:id', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM youtube_playlists WHERE id = ?').get(req.params.id) as
      | { id: string; name: string; description: string; items_json: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy danh sách phát' });
      return;
    }
    let items: Array<{ video_id: string; title: string; channel_title: string; thumbnail_url?: string; duration_label?: string }> = [];
    try {
      items = JSON.parse(row.items_json || '[]');
    } catch {
      items = [];
    }
    const { name, addVideo, removeVideoId } = req.body as {
      name?: string;
      addVideo?: { video_id: string; title: string; channel_title: string; thumbnail_url?: string; duration_label?: string };
      removeVideoId?: string;
    };
    if (addVideo?.video_id) {
      if (!items.some((it) => it.video_id === addVideo.video_id)) {
        items.unshift(addVideo);
      }
    }
    if (removeVideoId) {
      items = items.filter((it) => it.video_id !== removeVideoId);
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE youtube_playlists SET name = ?, items_json = ?, updated_at = ? WHERE id = ?').run(
      name?.trim() || row.name,
      JSON.stringify(items),
      now,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM youtube_playlists WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json({ playlist: { ...updated, items } });
  });

  router.delete('/youtube/playlists/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM youtube_playlists WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ==========================================
  // 2B. YOUTUBE PREMIUM 2.0, MOVIES & BANK CHECKOUT
  // ==========================================
  router.get('/youtube/streaming/overview', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getYoutubeStreamingOverview(db));
  });

  router.get('/youtube/movies/:id/access', (req: Request, res: Response) => {
    const access = evaluateMovieAccess(db, req.params.id);
    if (!access) {
      res.status(404).json({ error: 'Không tìm thấy phim hoặc series.' });
      return;
    }
    res.json(access);
  });

  router.post('/youtube/movies/:id/play', (req: Request, res: Response) => {
    const access = evaluateMovieAccess(db, req.params.id);
    if (!access) {
      res.status(404).json({ error: 'Không tìm thấy phim hoặc series.' });
      return;
    }
    if (!access.allowed) {
      res.status(403).json({
        error: access.reasonMessage || 'Bạn chưa đủ quyền xem nội dung này.',
        reason: access.reasonMessage,
        code: access.reasonCode || 'ACCESS_DENIED',
        access,
      });
      return;
    }
    const movie = db.prepare('SELECT * FROM youtube_movies_catalog WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;
    const epNum = Math.max(1, Number((req.body as { episodeNumber?: number })?.episodeNumber || 1));
    let episodes: Array<Record<string, unknown>> = [];
    try {
      episodes = JSON.parse(String(movie.episodes_json || '[]'));
    } catch {
      episodes = [];
    }
    const ep = episodes.find((e) => Number(e.episodeNumber) === epNum) || episodes[0] || null;
    res.json({
      ok: true,
      access,
      episode: ep,
      streamManifest: {
        movieId: req.params.id,
        episodeNumber: ep ? Number(ep.episodeNumber || 1) : 1,
        maxQuality: access.maxQuality,
        availableQualities: access.availableQualities,
        adFree: access.adFree,
        downloadAllowed: access.downloadAllowed,
        streamToken: crypto
          .createHmac('sha256', 'yt_stream_gate')
          .update(`${req.params.id}:${access.currentPlanId}:${Date.now()}`)
          .digest('hex')
          .slice(0, 16),
      },
    });
  });

  router.post('/youtube/movies/:id/favorite', (req: Request, res: Response) => {
    const movie = db.prepare('SELECT id FROM youtube_movies_catalog WHERE id = ?').get(req.params.id);
    if (!movie) {
      res.status(404).json({ error: 'Không tìm thấy phim.' });
      return;
    }
    const existing = db.prepare('SELECT movie_id FROM youtube_movie_favorites WHERE movie_id = ?').get(req.params.id);
    if (existing) {
      db.prepare('DELETE FROM youtube_movie_favorites WHERE movie_id = ?').run(req.params.id);
    } else {
      db.prepare('INSERT INTO youtube_movie_favorites (movie_id, created_at) VALUES (?, ?)').run(
        req.params.id,
        new Date().toISOString()
      );
    }
    res.json({ isFavorite: !existing, overview: getYoutubeStreamingOverview(db) });
  });

  router.post('/youtube/movies/:id/progress', (req: Request, res: Response) => {
    const { episodeNumber = 1, progressSec = 0, durationSec = 0 } = req.body as {
      episodeNumber?: number;
      progressSec?: number;
      durationSec?: number;
    };
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO youtube_movie_progress (movie_id, episode_number, progress_sec, duration_sec, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(movie_id) DO UPDATE SET
        episode_number = excluded.episode_number,
        progress_sec = excluded.progress_sec,
        duration_sec = CASE WHEN excluded.duration_sec > 0 THEN excluded.duration_sec ELSE youtube_movie_progress.duration_sec END,
        updated_at = excluded.updated_at
    `).run(req.params.id, Math.max(1, Math.round(episodeNumber)), Math.max(0, Math.round(progressSec)), Math.max(0, Math.round(durationSec)), now);
    res.json({ ok: true });
  });

  router.post('/youtube/movies/:id/purchase', (req: Request, res: Response) => {
    try {
      const result = purchaseYoutubeMovie(db, req.params.id, req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({
          error: err.message,
          reason: err.reason,
          code: err.code,
          bankCode: err.bankCode,
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Thanh toán mua/thuê phim thất bại.' });
    }
  });

  router.post('/youtube/premium/subscribe', (req: Request, res: Response) => {
    try {
      const result = subscribeYoutubePlan(db, req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({
          error: err.message,
          reason: err.reason,
          code: err.code,
          bankCode: err.bankCode,
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Đăng ký gói YouTube Premium thất bại.' });
    }
  });

  router.post('/youtube/premium/cancel', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, overview: cancelYoutubeMembership(db) });
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể hủy gói.' });
    }
  });

  router.post('/youtube/premium/toggle-autorenew', (req: Request, res: Response) => {
    try {
      const { enabled, cardId } = req.body as { enabled?: boolean; cardId?: string };
      res.json({ ok: true, overview: toggleYoutubeAutoRenew(db, Boolean(enabled), cardId) });
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể cập nhật tự động gia hạn.' });
    }
  });

  router.post('/youtube/premium/payment-method', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, overview: updateYoutubeSavedPaymentMethod(db, req.body) });
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể cập nhật phương thức thanh toán.' });
    }
  });

  router.post('/youtube/premium/simulate-cycle', (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, overview: simulateYoutubeBillingCycle(db) });
    } catch (err) {
      if (err instanceof YouTubePaymentHttpError) {
        res.status(err.statusCode).json({ error: err.message, reason: err.reason, code: err.code });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể mô phỏng chu kỳ thanh toán.' });
    }
  });

  // ==========================================
  // 3. MOVIES & STREAMING HUB
  // ==========================================
  router.get('/movies/catalog', (_req: Request, res: Response) => {
    res.json({
      realityType: 'B/D',
      tmdbConfigured: Boolean(process.env.TMDB_API_KEY),
      note: 'Trung tâm Khám phá Phim & Trailer chính thức — mở liên kết bản quyền trực tiếp trên nền tảng cung cấp, không lưu phim lậu hay vượt DRM.',
      items: MOVIE_DISCOVERY_CATALOG,
    });
  });

  router.post('/movies/watchlist', (req: Request, res: Response) => {
    const { movie_id, title, poster_url = '', is_watchlisted, is_favorite, user_rating } = req.body as {
      movie_id: string;
      title: string;
      poster_url?: string;
      is_watchlisted?: number;
      is_favorite?: number;
      user_rating?: number;
    };
    const existing = db.prepare('SELECT * FROM movie_watchlist WHERE movie_id = ?').get(movie_id) as Record<string, unknown> | undefined;
    const now = new Date().toISOString();
    if (!existing) {
      db.prepare(
        'INSERT INTO movie_watchlist (movie_id, title, poster_url, is_watchlisted, is_favorite, user_rating, watched_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(movie_id, title, poster_url, is_watchlisted ?? 1, is_favorite ?? 0, user_rating ?? 0, now);
    } else {
      db.prepare(
        'UPDATE movie_watchlist SET is_watchlisted = COALESCE(?, is_watchlisted), is_favorite = COALESCE(?, is_favorite), user_rating = COALESCE(?, user_rating), watched_at = ? WHERE movie_id = ?'
      ).run(is_watchlisted ?? null, is_favorite ?? null, user_rating ?? null, now, movie_id);
    }
    res.json(db.prepare('SELECT * FROM movie_watchlist WHERE movie_id = ?').get(movie_id));
  });

  // ==========================================
  // 4. MUSIC PLAYLISTS + PODCAST RSS IMPORT
  // ==========================================
  router.post('/music/playlists', (req: Request, res: Response) => {
    const { name, tracks = [] } = req.body as { name: string; tracks?: string[] };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập tên danh sách phát' });
      return;
    }
    const id = uid('pl');
    db.prepare('INSERT INTO music_playlists (id, name, tracks_json, updated_at) VALUES (?, ?, ?, ?)').run(
      id,
      name.trim(),
      JSON.stringify(tracks),
      new Date().toISOString()
    );
    res.json(db.prepare('SELECT * FROM music_playlists WHERE id = ?').get(id));
  });

  router.patch('/music/playlists/:id', (req: Request, res: Response) => {
    const { name, tracks } = req.body as { name?: string; tracks?: string[] };
    const sets = ['updated_at = ?'];
    const vals: unknown[] = [new Date().toISOString()];
    if (name !== undefined) {
      sets.push('name = ?');
      vals.push(name);
    }
    if (tracks !== undefined) {
      sets.push('tracks_json = ?');
      vals.push(JSON.stringify(tracks));
    }
    vals.push(req.params.id);
    db.prepare(`UPDATE music_playlists SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json(db.prepare('SELECT * FROM music_playlists WHERE id = ?').get(req.params.id));
  });

  router.delete('/music/playlists/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM music_playlists WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.get('/music/oauth/status', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const requestedOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const cfg = getSpotifyConfig(requestedOrigin, req);
    const row = db
      .prepare(
        'SELECT provider, account_id, display_name, avatar_url, profile_url, scope, connected_at FROM music_oauth_connections WHERE provider = ?'
      )
      .get('spotify') as Omit<SpotifyOAuthRow, 'access_token' | 'refresh_token' | 'expires_at'> | undefined;

    res.json({
      spotify: {
        configured: cfg.configured,
        connected: Boolean(row),
        redirectUri: cfg.redirectUri,
        callbackPath: '/auth/spotify/callback',
        profile: row
          ? {
              accountId: row.account_id,
              displayName: row.display_name,
              avatarUrl: row.avatar_url,
              profileUrl: row.profile_url,
              connectedAt: row.connected_at,
            }
          : null,
      },
    });
  });

  router.get('/music/oauth/spotify/url', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const requestedOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const cfg = getSpotifyConfig(requestedOrigin, req);
    if (!cfg.configured) {
      res.status(400).json({
        error: 'Chưa cấu hình SPOTIFY_CLIENT_ID và SPOTIFY_CLIENT_SECRET trên máy chủ.',
        redirectUri: cfg.redirectUri,
      });
      return;
    }
    const state = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 10 * 60_000;
    db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT OR REPLACE INTO oauth_states (state, provider, redirect_uri, expires_at) VALUES (?, ?, ?, ?)').run(
      state,
      'spotify',
      cfg.redirectUri,
      expiresAt
    );

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      scope: SPOTIFY_SCOPES,
      state,
      show_dialog: 'true',
    });

    res.json({
      url: `https://accounts.spotify.com/authorize?${params.toString()}`,
      redirectUri: cfg.redirectUri,
    });
  });

  router.get('/music/oauth/spotify/library', async (_req: Request, res: Response) => {
    try {
      const conn = await ensureValidSpotifyAccessToken();
      if (!conn) {
        res.status(401).json({ error: 'Chưa kết nối tài khoản Spotify hoặc phiên OAuth đã hết hạn.' });
        return;
      }

      const [plRes, tracksRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me/playlists?limit=15', {
          headers: { Authorization: `Bearer ${conn.access_token}` },
          signal: AbortSignal.timeout(8000),
        }),
        fetch('https://api.spotify.com/v1/me/tracks?limit=15', {
          headers: { Authorization: `Bearer ${conn.access_token}` },
          signal: AbortSignal.timeout(8000),
        }),
      ]);

      if (plRes.status === 401 || tracksRes.status === 401) {
        db.prepare('DELETE FROM music_oauth_connections WHERE provider = ?').run('spotify');
        res.status(401).json({ error: 'Token Spotify đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại qua OAuth.' });
        return;
      }

      if (plRes.status === 403 || tracksRes.status === 403) {
        res.status(403).json({
          error:
            'Spotify từ chối truy cập Web API (403): tài khoản tạo app trên Spotify Developer Dashboard cần gói Spotify Premium hoặc cần thêm user vào User Management.',
        });
        return;
      }

      const plJson = plRes.ok
        ? ((await plRes.json()) as {
            items?: Array<{
              id: string;
              name: string;
              images?: Array<{ url?: string }>;
              tracks?: { total?: number };
              external_urls?: { spotify?: string };
            }>;
          })
        : { items: [] };

      const tracksJson = tracksRes.ok
        ? ((await tracksRes.json()) as {
            items?: Array<{
              track?: {
                id: string;
                name: string;
                duration_ms?: number;
                preview_url?: string | null;
                artists?: Array<{ name?: string }>;
                album?: { images?: Array<{ url?: string }> };
                external_urls?: { spotify?: string };
              };
            }>;
          })
        : { items: [] };

      res.json({
        playlists: (plJson.items || []).map((p) => ({
          id: p.id,
          name: p.name,
          imageUrl: p.images?.[0]?.url || '',
          tracksTotal: p.tracks?.total || 0,
          externalUrl: p.external_urls?.spotify || 'https://open.spotify.com',
        })),
        tracks: (tracksJson.items || [])
          .filter((item) => item.track?.id)
          .map((item) => {
            const t = item.track!;
            return {
              id: t.id,
              title: t.name,
              artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') || 'Spotify',
              durationSec: Math.round((t.duration_ms || 30000) / 1000),
              cover: t.album?.images?.[0]?.url || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
              previewUrl: t.preview_url || '',
              externalUrl: t.external_urls?.spotify || 'https://open.spotify.com',
            };
          }),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Không thể đồng bộ thư viện Spotify' });
    }
  });

  router.post('/music/oauth/spotify/disconnect', (_req: Request, res: Response) => {
    db.prepare('DELETE FROM music_oauth_connections WHERE provider = ?').run('spotify');
    res.json({ ok: true });
  });

  // Keyless official Spotify oEmbed + Embed Player (no Client ID/Secret or Premium required)
  const SPOTIFY_ALLOWED_TYPES = new Set(['track', 'playlist', 'album', 'artist', 'episode', 'show']);

  async function resolveSpotifyLink(rawInput: string): Promise<{
    spotifyType: string;
    spotifyId: string;
    canonicalUrl: string;
    embedUrl: string;
  }> {
    let input = rawInput.trim();
    if (!input) {
      throw new Error('Vui lòng dán link hoặc URI Spotify hợp lệ.');
    }

    const uriMatch = input.match(/^spotify:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$/i);
    if (uriMatch) {
      const spotifyType = uriMatch[1].toLowerCase();
      const spotifyId = uriMatch[2];
      return {
        spotifyType,
        spotifyId,
        canonicalUrl: `https://open.spotify.com/${spotifyType}/${spotifyId}`,
        embedUrl: `https://open.spotify.com/embed/${spotifyType}/${spotifyId}?utm_source=oembed`,
      };
    }

    if (!/^https?:\/\//i.test(input)) {
      input = `https://${input}`;
    }
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('Link Spotify không đúng định dạng URL.');
    }

    const host = parsed.hostname.toLowerCase();
    if (host === 'spotify.link' || host === 'spotify.app.link') {
      const resolveRes = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      });
      parsed = new URL(resolveRes.url);
    }

    if (parsed.hostname.toLowerCase() !== 'open.spotify.com') {
      throw new Error('Chỉ hỗ trợ liên kết chính thức từ open.spotify.com hoặc spotify.link.');
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const cleaned = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    if (cleaned[0] === 'user') {
      throw new Error(
        'Link hồ sơ (/user/...) không hỗ trợ nhúng trực tiếp. Hãy mở Playlist, Album hoặc Bài hát → Chia sẻ → Sao chép liên kết.'
      );
    }
    const spotifyType = (cleaned[0] || '').toLowerCase();
    const spotifyId = cleaned[1] || '';
    if (!SPOTIFY_ALLOWED_TYPES.has(spotifyType) || !/^[a-zA-Z0-9]+$/.test(spotifyId)) {
      throw new Error('Liên kết cần là bài hát, playlist, album, nghệ sĩ hoặc podcast hợp lệ trên Spotify.');
    }

    return {
      spotifyType,
      spotifyId,
      canonicalUrl: `https://open.spotify.com/${spotifyType}/${spotifyId}`,
      embedUrl: `https://open.spotify.com/embed/${spotifyType}/${spotifyId}?utm_source=oembed`,
    };
  }

  router.get('/music/spotify/embeds', (_req: Request, res: Response) => {
    const items = db.prepare('SELECT * FROM spotify_saved_items ORDER BY created_at DESC LIMIT 40').all();
    res.json({ items });
  });

  router.post('/music/spotify/embeds', async (req: Request, res: Response) => {
    try {
      const { url = '' } = req.body as { url?: string };
      const resolved = await resolveSpotifyLink(url);

      let title = `Spotify ${resolved.spotifyType}`;
      let thumbnailUrl = '';
      let embedUrl = resolved.embedUrl;

      try {
        const oembedRes = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(resolved.canonicalUrl)}`,
          { signal: AbortSignal.timeout(7000) }
        );
        if (oembedRes.ok) {
          const oj = (await oembedRes.json()) as {
            title?: string;
            thumbnail_url?: string;
            iframe_url?: string;
          };
          if (oj.title) title = oj.title;
          if (oj.thumbnail_url) thumbnailUrl = oj.thumbnail_url;
          if (oj.iframe_url && oj.iframe_url.startsWith('https://open.spotify.com/embed/')) {
            embedUrl = oj.iframe_url;
          }
        }
      } catch {
        // Keep canonical embedUrl even if oEmbed metadata fetch times out
      }

      const now = new Date().toISOString();
      const existing = db
        .prepare('SELECT id FROM spotify_saved_items WHERE spotify_type = ? AND spotify_id = ?')
        .get(resolved.spotifyType, resolved.spotifyId) as { id: string } | undefined;

      if (existing) {
        db.prepare(
          'UPDATE spotify_saved_items SET title = ?, thumbnail_url = ?, canonical_url = ?, embed_url = ?, created_at = ? WHERE id = ?'
        ).run(title, thumbnailUrl, resolved.canonicalUrl, embedUrl, now, existing.id);
        res.json({ item: db.prepare('SELECT * FROM spotify_saved_items WHERE id = ?').get(existing.id) });
        return;
      }

      const id = uid('sp_emb');
      db.prepare(`
        INSERT INTO spotify_saved_items (id, spotify_type, spotify_id, title, thumbnail_url, canonical_url, embed_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, resolved.spotifyType, resolved.spotifyId, title, thumbnailUrl, resolved.canonicalUrl, embedUrl, now);

      res.json({ item: db.prepare('SELECT * FROM spotify_saved_items WHERE id = ?').get(id) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể thêm liên kết Spotify' });
    }
  });

  router.delete('/music/spotify/embeds/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM spotify_saved_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/podcast/rss', async (req: Request, res: Response) => {
    try {
      const { feedUrl } = req.body as { feedUrl: string };
      const parsed = new URL(feedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
        res.status(400).json({ error: 'Địa chỉ RSS không hợp lệ hoặc không được phép truy cập mạng nội bộ' });
        return;
      }
      const rssRes = await fetch(parsed.toString(), { signal: AbortSignal.timeout(8000) });
      if (!rssRes.ok) {
        res.status(502).json({ error: `Máy chủ RSS trả về mã ${rssRes.status}` });
        return;
      }
      const xml = await rssRes.text();
      const channelTitle =
        xml.match(/<channel>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || parsed.hostname;
      const channelDesc =
        xml.match(/<channel>[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 220) ||
        `Nguồn RSS hợp pháp từ ${parsed.hostname}`;

      const podId = uid('pod');
      db.prepare('INSERT INTO podcasts (id, title, host, category, description, cover_url, is_followed) VALUES (?, ?, ?, ?, ?, ?, 1)').run(
        podId,
        channelTitle,
        parsed.hostname,
        'RSS Ngoài',
        channelDesc,
        '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'
      );

      const itemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)).slice(0, 5);
      const addedEpisodes: string[] = [];
      for (const m of itemMatches) {
        const block = m[1];
        const epTitle = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || 'Tập mới';
        const epDesc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 200) || '';
        const epId = uid('ep');
        db.prepare(
          'INSERT INTO podcast_episodes (id, podcast_id, title, description, duration_sec, progress_sec, is_downloaded, is_favorite, published_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)'
        ).run(epId, podId, epTitle, epDesc, 900, new Date().toISOString());
        addedEpisodes.push(epId);
      }

      res.json({ ok: true, podcast: db.prepare('SELECT * FROM podcasts WHERE id = ?').get(podId), episodesCount: addedEpisodes.length });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Không thể đọc nguồn RSS podcast' });
    }
  });

  // ==========================================
  // 5. LOCK RECOVERY & PRIVACY / DATA EXPORT
  // ==========================================
  router.post('/security/recovery-setup', (req: Request, res: Response) => {
    const { recoveryEmail = '', recoveryCode = '' } = req.body as { recoveryEmail?: string; recoveryCode?: string };
    if (recoveryCode.trim().length < 6) {
      res.status(400).json({ error: 'Mã khôi phục phải có ít nhất 6 ký tự' });
      return;
    }
    db.prepare('UPDATE user_profile SET recovery_email = ?, recovery_code_hash = ? WHERE id = ?').run(
      recoveryEmail.trim(),
      hashSecret(recoveryCode.trim()),
      'user_1'
    );
    res.json({ ok: true });
  });

  router.post('/security/recover-pin', (req: Request, res: Response) => {
    const { recoveryCode = '', newMode = 'swipe', newPin = '' } = req.body as {
      recoveryCode?: string;
      newMode?: string;
      newPin?: string;
    };
    const row = db.prepare('SELECT recovery_code_hash FROM user_profile WHERE id = ?').get('user_1') as { recovery_code_hash: string } | undefined;
    if (!row?.recovery_code_hash) {
      res.status(400).json({ error: 'Bạn chưa thiết lập mã khôi phục an toàn trong Cài đặt → Bảo mật.' });
      return;
    }
    if (hashSecret(recoveryCode.trim()) !== row.recovery_code_hash) {
      res.status(401).json({ error: 'Mã khôi phục không khớp.' });
      return;
    }
    const nextHash = newMode === 'swipe' ? '' : hashSecret(newPin);
    db.prepare('UPDATE user_profile SET unlock_mode = ?, pin_code = ?, pin_hash = ?, failed_unlock_count = 0 WHERE id = ?').run(
      newMode,
      '',
      nextHash,
      'user_1'
    );
    res.json({ ok: true });
  });

  // Selective Backup Preview & Restore
  const MODULE_TABLE_MAP: Record<string, string[]> = {
    profile_launcher: ['user_profile', 'installed_apps', 'home_widgets', 'app_permissions'],
    communication: ['contacts', 'conversations', 'messages', 'emails'],
    productivity: ['notes', 'calendar_events', 'reminders', 'files', 'office_docs', 'shortcuts'],
    ai_world: ['characters', 'character_memories', 'ai_relationships', 'ai_events'],
    media_lifestyle: ['podcasts', 'podcast_episodes', 'shopping_orders', 'food_orders', 'ride_trips', 'smart_devices', 'smart_scenes'],
  };

  router.get('/backups/:id/preview', (req: Request, res: Response) => {
    const row = db.prepare('SELECT id, schema_version, os_version, integrity_hash, created_at, payload_json FROM backups WHERE id = ?').get(req.params.id) as
      | { id: string; schema_version: string; os_version: string; integrity_hash: string; created_at: string; payload_json: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
      return;
    }
    const parsed = JSON.parse(row.payload_json) as { data?: Record<string, unknown[]> };
    const counts: Record<string, number> = {};
    for (const [k, list] of Object.entries(parsed.data || {})) {
      if (Array.isArray(list)) counts[k] = list.length;
    }
    const computed = crypto.createHash('sha256').update(JSON.stringify(parsed.data || {})).digest('hex');
    res.json({
      id: row.id,
      schemaVersion: row.schema_version,
      osVersion: row.os_version,
      createdAt: row.created_at,
      integrityValid: computed === row.integrity_hash,
      counts,
      modules: Object.keys(MODULE_TABLE_MAP),
    });
  });

  router.post('/backups/:id/selective-restore', (req: Request, res: Response) => {
    const { modules = [] } = req.body as { modules?: string[] };
    const row = db.prepare('SELECT payload_json FROM backups WHERE id = ?').get(req.params.id) as { payload_json: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
      return;
    }
    const parsed = JSON.parse(row.payload_json) as { data?: Record<string, Array<Record<string, unknown>>> };
    if (!parsed.data) {
      res.status(400).json({ error: 'Dữ liệu sao lưu trống' });
      return;
    }
    const allowedTables =
      modules.length > 0
        ? new Set(modules.flatMap((m) => MODULE_TABLE_MAP[m] || []))
        : null;

    const tx = db.transaction((restoreData: Record<string, Array<Record<string, unknown>>>) => {
      for (const [table, rows] of Object.entries(restoreData)) {
        if (allowedTables && !allowedTables.has(table)) continue;
        if (!Array.isArray(rows)) continue;
        const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) continue;
        db.prepare(`DELETE FROM ${table}`).run();
        const validCols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
        for (const r of rows) {
          const safeCols = Object.keys(r).filter((c) => validCols.includes(c));
          if (safeCols.length === 0) continue;
          const placeholders = safeCols.map(() => '?').join(', ');
          db.prepare(`INSERT OR REPLACE INTO ${table} (${safeCols.join(', ')}) VALUES (${placeholders})`).run(...safeCols.map((c) => r[c]));
        }
      }
    });

    try {
      tx(parsed.data);
      res.json({ ok: true, restoredModules: modules.length > 0 ? modules : ['all'] });
    } catch (err) {
      res.status(500).json({ error: `Khôi phục thất bại (đã rollback): ${err instanceof Error ? err.message : 'Lỗi DB'}` });
    }
  });

  router.get('/export-user-data', (_req: Request, res: Response) => {
    const profileRow = db.prepare('SELECT * FROM user_profile WHERE id = ?').get('user_1') as Record<string, unknown> | undefined;
    if (profileRow) {
      delete profileRow.pin_hash;
      delete profileRow.pin_code;
      delete profileRow.recovery_code_hash;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      osVersion: getLatestOsRelease(db).version,
      profile: profileRow,
      notes: db.prepare('SELECT * FROM notes').all(),
      reminders: db.prepare('SELECT * FROM reminders').all(),
      events: db.prepare('SELECT * FROM calendar_events').all(),
      contacts: db.prepare('SELECT * FROM contacts').all(),
      characterMemories: db.prepare('SELECT * FROM character_memories').all(),
      youtubeLibrary: db.prepare('SELECT * FROM youtube_library').all(),
      movieWatchlist: db.prepare('SELECT * FROM movie_watchlist').all(),
      musicPlaylists: db.prepare('SELECT * FROM music_playlists').all(),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="phone_os_4_personal_data.json"');
    res.send(JSON.stringify(payload, null, 2));
  });

  router.get('/characters/:id/export-memories', (req: Request, res: Response) => {
    const char = db.prepare('SELECT id, name, mood, relationship_level, content_boundary FROM characters WHERE id = ?').get(req.params.id);
    if (!char) {
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }
    const memories = db.prepare('SELECT * FROM character_memories WHERE character_id = ? ORDER BY created_at DESC').all(req.params.id);
    const rel = db.prepare('SELECT * FROM ai_relationships WHERE character_id = ?').get(req.params.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ai_memories_${req.params.id}.json"`);
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), character: char, relationship: rel, memories }, null, 2));
  });

  router.delete('/account', (req: Request, res: Response) => {
    const { confirmText = '' } = req.body as { confirmText?: string };
    if (confirmText.trim().toUpperCase() !== 'XOA DU LIEU') {
      res.status(400).json({ error: 'Vui lòng nhập chính xác "XOA DU LIEU" để xác nhận.' });
      return;
    }
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM messages WHERE sender_type = 'user'").run();
      db.prepare('DELETE FROM notes').run();
      db.prepare('DELETE FROM youtube_library').run();
      db.prepare('DELETE FROM movie_watchlist').run();
      db.prepare("UPDATE user_profile SET name = 'Người dùng Mới', email = 'user@phoneos.local', bio = 'Hồ sơ mới thiết lập lại', pin_code = '', pin_hash = '', recovery_code_hash = '', unlock_mode = 'swipe', failed_unlock_count = 0 WHERE id = 'user_1'").run();
    });
    tx();
    res.json({ ok: true });
  });

  router.get('/diagnostics', (_req: Request, res: Response) => {
    const correlationId = uid('diag');
    const errors = (db.prepare('SELECT id, app_id, error_code, message, resolved, created_at FROM system_errors ORDER BY created_at DESC LIMIT 30').all() as Array<{
      id: string; app_id: string; error_code: string; message: string; resolved: number; created_at: string;
    }>).map((e) => ({ ...e, message: redactSensitive(e.message) }));

    const migrations = db.prepare('SELECT * FROM os_migrations ORDER BY migrated_at DESC').all();
    res.json({
      correlationId,
      generatedAt: new Date().toISOString(),
      osVersion: getLatestOsRelease(db).version,
      uptimeSec: Math.floor(process.uptime()),
      migrations,
      redactedErrors: errors,
      privacyNote: 'Nhật ký chẩn đoán đã tự động loại bỏ email, số điện thoại, API key và nội dung trò chuyện riêng tư.',
    });
  });

  router.get('/system-update', (_req: Request, res: Response) => {
    res.json(getOsVersionHistoryPayload(db));
  });

  router.get('/system-update/export', (_req: Request, res: Response) => {
    const backup = exportOsVersionHistory(db);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="phone_os_version_history_v${getLatestOsRelease(db).version}.json"`
    );
    res.send(JSON.stringify(backup, null, 2));
  });

  router.post('/system-update/restore', (req: Request, res: Response) => {
    try {
      const result = restoreOsVersionHistory(db, req.body);
      res.json({
        ok: true,
        ...result,
        payload: getOsVersionHistoryPayload(db),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Không thể khôi phục lịch sử phiên bản.',
      });
    }
  });

  return router;
}
