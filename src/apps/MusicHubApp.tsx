import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Disc3,
  ExternalLink,
  Link2,
  ListMusic,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import { OSAppHeader, OSRealityLabel, OSSegmentedControl, OSStateView } from '../components/ui/OSDesignSystem';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  redirectUri: string;
  callbackPath: string;
  profile: {
    accountId: string;
    displayName: string;
    avatarUrl: string;
    profileUrl: string;
    connectedAt: string;
  } | null;
}

interface SpotifyLibraryData {
  playlists: Array<{
    id: string;
    name: string;
    imageUrl: string;
    tracksTotal: number;
    externalUrl: string;
  }>;
  tracks: Array<{
    id: string;
    title: string;
    artist: string;
    durationSec: number;
    cover: string;
    previewUrl: string;
    externalUrl: string;
  }>;
}

interface SpotifyEmbedItem {
  id: string;
  spotify_type: string;
  spotify_id: string;
  title: string;
  thumbnail_url: string;
  canonical_url: string;
  embed_url: string;
  created_at: string;
}

export function MusicHubApp() {
  const {
    data,
    refreshData,
    tracks,
    addCustomTrack,
    currentTrack,
    musicPlaying,
    musicProgress,
    musicShuffle,
    musicRepeat,
    toggleMusicShuffle,
    cycleMusicRepeat,
    playTrack,
    toggleMusic,
    nextTrack,
    prevTrack,
    seekMusic,
    openApp,
    addClipboardEntry,
    showToast,
  } = useOS();

  const [tab, setTab] = useState<'library' | 'playlists' | 'services'>('library');
  const [newPlName, setNewPlName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [spotifyLibrary, setSpotifyLibrary] = useState<SpotifyLibraryData | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [oauthErrorMsg, setOauthErrorMsg] = useState<string | null>(null);
  const [showRedirectUri, setShowRedirectUri] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [spotifyLinkInput, setSpotifyLinkInput] = useState('');
  const [embedBusy, setEmbedBusy] = useState(false);
  const [spotifyEmbeds, setSpotifyEmbeds] = useState<SpotifyEmbedItem[]>([]);
  const [activeEmbed, setActiveEmbed] = useState<SpotifyEmbedItem | null>(null);
  const [hiresPassActive, setHiresPassActive] = useState(false);
  const [cardCheckoutOpen, setCardCheckoutOpen] = useState(false);

  const playlists = data?.musicPlaylists || [];
  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  const loadSpotifyEmbeds = useCallback(async () => {
    try {
      const res = await osApi.getSpotifyEmbeds();
      const items = res.items || [];
      setSpotifyEmbeds(items);
      setActiveEmbed((prev) => prev || items[0] || null);
    } catch {
      // Ignore transient load failure
    }
  }, []);

  const handleAddSpotifyLink = async (rawUrl: string) => {
    const clean = rawUrl.trim();
    if (!clean) return;
    setEmbedBusy(true);
    try {
      const res = await osApi.addSpotifyEmbed(clean);
      setSpotifyLinkInput('');
      setActiveEmbed(res.item);
      await loadSpotifyEmbeds();
      showToast('Spotify', `Đã kết nối & mở trình phát: ${res.item.title}`, 'success');
    } catch (err) {
      showToast('Spotify', err instanceof Error ? err.message : 'Không thể thêm liên kết Spotify', 'error');
    } finally {
      setEmbedBusy(false);
    }
  };

  const handleDeleteSpotifyEmbed = async (id: string) => {
    try {
      await osApi.deleteSpotifyEmbed(id);
      setSpotifyEmbeds((prev) => prev.filter((item) => item.id !== id));
      setActiveEmbed((prev) => (prev?.id === id ? null : prev));
      showToast('Spotify', 'Đã xóa liên kết khỏi danh sách.');
    } catch {
      // Ignore delete error
    }
  };

  const loadSpotifyLibrary = useCallback(async () => {
    setLibraryBusy(true);
    try {
      const lib = await osApi.getSpotifyLibrary();
      setSpotifyLibrary(lib);
    } catch (err) {
      showToast('Spotify', err instanceof Error ? err.message : 'Không thể tải thư viện Spotify', 'error');
    } finally {
      setLibraryBusy(false);
    }
  }, [showToast]);

  const loadOAuthStatus = useCallback(
    async (notifyIfConnected = false): Promise<boolean> => {
      try {
        const res = await osApi.getMusicOAuthStatus();
        setSpotifyStatus(res.spotify);
        if (res.spotify.connected) {
          setOauthBusy(false);
          setPendingAuthUrl(null);
          setOauthErrorMsg(null);
          if (notifyIfConnected) {
            showToast('Spotify OAuth', 'Đã kết nối Spotify thành công!', 'success');
          }
          await loadSpotifyLibrary();
          return true;
        }
        setSpotifyLibrary(null);
        return false;
      } catch {
        return false;
      }
    },
    [loadSpotifyLibrary, showToast]
  );

  useEffect(() => {
    void loadOAuthStatus();
    void loadSpotifyEmbeds();
  }, [loadOAuthStatus, loadSpotifyEmbeds]);

  useEffect(() => {
    const handleOAuthPayload = (payload: unknown) => {
      const msg = payload as { type?: string; provider?: string; error?: string } | null;
      if (!msg || msg.provider !== 'spotify') return;
      if (msg.type === 'OAUTH_AUTH_SUCCESS') {
        setOauthBusy(false);
        setPendingAuthUrl(null);
        setOauthErrorMsg(null);
        showToast('Spotify OAuth', 'Đã kết nối Spotify thành công!', 'success');
        void loadOAuthStatus();
      } else if (msg.type === 'OAUTH_AUTH_ERROR') {
        const errText = String(msg.error || 'Xác thực Spotify thất bại');
        setOauthBusy(false);
        setPendingAuthUrl(null);
        setOauthErrorMsg(errText);
        showToast('Spotify OAuth', errText, 'error');
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrustedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');
      if (!isTrustedOrigin) return;
      handleOAuthPayload(event.data);
    };

    window.addEventListener('message', handleMessage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('phoneos_spotify_oauth');
        channel.onmessage = (event) => handleOAuthPayload(event.data);
      } catch {
        channel = null;
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      try {
        channel?.close();
      } catch {
        // Ignore close error
      }
    };
  }, [loadOAuthStatus, showToast]);

  // Fallback polling & focus/visibility re-check for Android browsers where window.opener is null
  useEffect(() => {
    if (!oauthBusy) return;
    let active = true;
    const startedAt = Date.now();

    const checkConnection = async () => {
      if (!active) return;
      const connected = await loadOAuthStatus(true);
      if (connected) {
        active = false;
      } else if (Date.now() - startedAt > 120_000) {
        active = false;
        setOauthBusy(false);
      }
    };

    const timer = window.setInterval(() => {
      void checkConnection();
    }, 2000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkConnection();
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [oauthBusy, loadOAuthStatus]);

  const handleConnectSpotify = async () => {
    setOauthErrorMsg(null);
    setOauthBusy(true);
    try {
      const { url } = await osApi.getSpotifyAuthUrl();
      setPendingAuthUrl(url);
      const popup = window.open(url, 'spotify_oauth_popup', 'width=600,height=700');
      if (!popup) {
        setOauthBusy(false);
        setOauthErrorMsg('Trình duyệt đã chặn cửa sổ bật lên. Nhấn nút "Mở trang đăng nhập Spotify" bên dưới để tiếp tục.');
        showToast('Cửa sổ bật lên bị chặn', 'Nhấn liên kết mở trực tiếp để đăng nhập Spotify.', 'error');
      }
    } catch (err) {
      setOauthBusy(false);
      setPendingAuthUrl(null);
      const msg = err instanceof Error ? err.message : 'Chưa thể khởi tạo OAuth Spotify';
      setOauthErrorMsg(msg);
      showToast('Spotify OAuth', msg, 'error');
    }
  };

  const handleDisconnectSpotify = async () => {
    await osApi.disconnectSpotify();
    setSpotifyLibrary(null);
    setOauthErrorMsg(null);
    setPendingAuthUrl(null);
    await loadOAuthStatus();
    showToast('Spotify', 'Đã ngắt kết nối tài khoản Spotify.');
  };

  const handleUploadAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const track = {
      id: `trk_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Tệp cục bộ',
      durationSec: 210,
      cover: '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg',
      type: 'audio' as const,
      audioUrl: url,
    };
    addCustomTrack(track);
    playTrack(track);
    showToast('Music Hub', `Đang phát tệp cục bộ: ${track.title}`, 'success');
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    await osApi.createMusicPlaylist(
      newPlName.trim(),
      tracks.slice(0, 2).map((t) => t.id)
    );
    setNewPlName('');
    await refreshData();
    showToast('Danh sách phát', 'Đã tạo danh sách phát mới trong SQLite', 'success');
  };

  const toggleTrackInPlaylist = async (trackId: string) => {
    if (!selectedPlaylist) return;
    let ids: string[] = [];
    try {
      ids = JSON.parse(selectedPlaylist.tracks_json || '[]');
    } catch {
      ids = [];
    }
    const nextIds = ids.includes(trackId) ? ids.filter((x) => x !== trackId) : [...ids, trackId];
    await osApi.updateMusicPlaylist(selectedPlaylist.id, { tracks: nextIds });
    await refreshData();
  };

  const handlePlaySpotifyPreview = (t: SpotifyLibraryData['tracks'][number]) => {
    if (!t.previewUrl) {
      showToast('Spotify', 'Bài hát này không có bản nghe thử 30s — hãy mở trực tiếp trên Spotify.');
      return;
    }
    const track = {
      id: `sp_${t.id}`,
      title: t.title,
      artist: `${t.artist} (Spotify Preview 30s)`,
      durationSec: 30,
      cover: t.cover,
      type: 'audio' as const,
      audioUrl: t.previewUrl,
    };
    addCustomTrack(track);
    playTrack(track);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const liveCallbackUri =
    spotifyStatus?.redirectUri ||
    (typeof window !== 'undefined' ? `${window.location.origin}/auth/spotify/callback` : '/auth/spotify/callback');

  return (
    <div className="flex-1 flex flex-col bg-[var(--os-bg)] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <OSAppHeader
        title="Music Hub"
        subtitle="Nhạc cục bộ, Playlist & Dịch vụ chính thức"
        rightAction={
          <label className="min-h-[36px] px-3 rounded-xl bg-[var(--os-primary)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập MP3</span>
            <input type="file" accept="audio/*" onChange={handleUploadAudio} className="hidden" />
          </label>
        }
      />

      {/* Active Mini Controller */}
      {currentTrack && (
        <div className="p-3.5 bg-[var(--os-surface)] border-b border-[var(--os-border)] space-y-2.5 shrink-0">
          <div className="flex items-center gap-3">
            <img src={currentTrack.cover} alt={currentTrack.title} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{currentTrack.title}</p>
              <p className="text-[11px] text-zinc-500 truncate">
                {currentTrack.artist} · {currentTrack.type === 'audio' ? 'Tệp âm thanh thật' : 'Nhạc nền Synth'}
              </p>
            </div>
            <OSRealityLabel type="A" detail="MediaSession" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono-num text-zinc-500 w-8">{fmt(musicProgress)}</span>
            <input
              type="range"
              min={0}
              max={currentTrack.durationSec || 180}
              value={musicProgress}
              onChange={(e) => seekMusic(Number(e.target.value))}
              className="flex-1 accent-[var(--os-primary)]"
              aria-label="Tiến độ phát nhạc"
            />
            <span className="text-[10px] font-mono-num text-zinc-500 w-8 text-right">{fmt(currentTrack.durationSec)}</span>
          </div>

          <div className="flex items-center justify-between px-2">
            <button
              onClick={toggleMusicShuffle}
              className={`p-2 rounded-xl ${musicShuffle ? 'text-[var(--os-primary)] bg-violet-500/15' : 'text-zinc-400'}`}
              title="Trộn bài"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <button onClick={prevTrack} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={toggleMusic}
                className="w-11 h-11 rounded-full bg-[var(--os-primary)] text-white flex items-center justify-center shadow"
              >
                {musicPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button onClick={nextTrack} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={cycleMusicRepeat}
              className={`p-2 rounded-xl flex items-center gap-0.5 text-[10px] font-bold ${
                musicRepeat !== 'off' ? 'text-[var(--os-primary)] bg-violet-500/15' : 'text-zinc-400'
              }`}
              title="Lặp lại"
            >
              <Repeat className="w-4 h-4" />
              {musicRepeat === 'one' && <span>1</span>}
            </button>
          </div>
        </div>
      )}

      <div className="px-3.5 pt-2.5 pb-2 bg-[var(--os-surface)] border-b border-[var(--os-border)] shrink-0">
        <OSSegmentedControl
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { id: 'library', label: 'Thư viện' },
            { id: 'playlists', label: 'Playlist' },
            { id: 'services', label: 'Streaming' },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2.5">
        {tab === 'library' && (
          <>
            {tracks.map((t) => {
              const active = currentTrack?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => playTrack(t)}
                  className={`w-full p-2.5 rounded-2xl border flex items-center gap-3 text-left transition-colors ${
                    active
                      ? 'bg-violet-500/10 border-[var(--os-primary)]'
                      : 'bg-[var(--os-surface)] border-[var(--os-border)]'
                  }`}
                >
                  <img src={t.cover} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{t.title}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{t.artist}</p>
                  </div>
                  <span className="text-[10px] font-mono-num text-zinc-400">{fmt(t.durationSec)}</span>
                </button>
              );
            })}
          </>
        )}

        {tab === 'playlists' && (
          <div className="space-y-3">
            <form
              onSubmit={handleCreatePlaylist}
              className="p-3 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2"
            >
              <p className="text-xs font-bold">Tạo Playlist mới</p>
              <div className="flex gap-2">
                <input
                  value={newPlName}
                  onChange={(e) => setNewPlName(e.target.value)}
                  placeholder="Tên playlist..."
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[36px] px-3 rounded-xl bg-[var(--os-primary)] text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tạo
                </button>
              </div>
            </form>

            {playlists.length === 0 ? (
              <OSStateView
                mode="empty"
                title="Chưa có danh sách phát"
                message="Tạo playlist riêng của bạn để sắp xếp các bản nhạc yêu thích."
              />
            ) : (
              playlists.map((pl) => {
                let ids: string[] = [];
                try {
                  ids = JSON.parse(pl.tracks_json || '[]');
                } catch {
                  ids = [];
                }
                const isSelected = selectedPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    className="p-3 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedPlaylistId(isSelected ? null : pl.id)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0">
                          <Disc3 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{pl.name}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{ids.length} bài hát</p>
                        </div>
                      </button>
                      <button
                        onClick={async () => {
                          await osApi.deleteMusicPlaylist(pl.id);
                          if (selectedPlaylistId === pl.id) setSelectedPlaylistId(null);
                          await refreshData();
                        }}
                        className="p-2 text-zinc-400 hover:text-rose-500"
                        title="Xóa playlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isSelected && (
                      <div className="pt-2 border-t border-[var(--os-border)] space-y-1.5">
                        <p className="text-[11px] font-semibold text-zinc-500">Chạm để thêm/bớt bài hát vào Playlist:</p>
                        {tracks.map((tr) => {
                          const included = ids.includes(tr.id);
                          return (
                            <div key={tr.id} className="flex items-center justify-between gap-2 py-1">
                              <button
                                onClick={() => playTrack(tr)}
                                className="text-xs font-medium truncate text-left flex-1 hover:text-[var(--os-primary)]"
                              >
                                {tr.title}
                              </button>
                              <button
                                onClick={() => toggleTrackInPlaylist(tr.id)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold ${
                                  included ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800'
                                }`}
                              >
                                {included ? 'Trong danh sách' : '+ Thêm'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'services' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Các nền tảng nhạc bản quyền yêu cầu OAuth chính thức của nhà cung cấp. PHONE OS không thu thập mật khẩu bên thứ ba hay phát luồng lậu.
              </span>
            </div>

            {/* Spotify Official OAuth Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-500">Spotify</p>
                  <p className="text-[11px] text-zinc-500">
                    {spotifyStatus?.connected
                      ? `Đã kết nối OAuth · ${spotifyStatus.profile?.displayName || 'Tài khoản Spotify'}`
                      : spotifyStatus?.configured
                      ? 'Sẵn sàng đăng nhập bằng OAuth 2.0 chính thức'
                      : 'Cần cấu hình SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {spotifyStatus?.connected ? (
                    <>
                      <button
                        onClick={() => void loadSpotifyLibrary()}
                        disabled={libraryBusy}
                        className="min-h-[34px] px-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1"
                        title="Làm mới thư viện Spotify"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${libraryBusy ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={handleDisconnectSpotify}
                        className="min-h-[34px] px-2.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Ngắt</span>
                      </button>
                    </>
                  ) : spotifyStatus?.configured ? (
                    <button
                      onClick={handleConnectSpotify}
                      disabled={oauthBusy}
                      className="min-h-[36px] px-3 rounded-xl bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{oauthBusy ? 'Đang chờ...' : 'Kết nối Spotify'}</span>
                    </button>
                  ) : (
                    <a
                      href="https://open.spotify.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[36px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <span>Mở web</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {oauthBusy && !spotifyStatus?.connected && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2 text-[11px]">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Đang chờ xác thực từ Spotify. Sau khi nhấn Đồng ý, hệ thống sẽ tự động cập nhật khi bạn quay lại tab này.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => void loadOAuthStatus(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Kiểm tra kết nối</span>
                    </button>
                    {pendingAuthUrl && (
                      <a
                        href={pendingAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[11px] font-semibold inline-flex items-center gap-1 border border-zinc-200 dark:border-zinc-700"
                      >
                        <span>Mở lại trang Spotify</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setOauthBusy(false);
                        setPendingAuthUrl(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-semibold"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {oauthErrorMsg && !spotifyStatus?.connected && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2 text-[11px] text-rose-600 dark:text-rose-300">
                  <p className="font-semibold">{oauthErrorMsg}</p>
                  {pendingAuthUrl && (
                    <a
                      href={pendingAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOauthBusy(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <span>Mở trang đăng nhập Spotify</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {spotifyStatus?.connected && spotifyStatus.profile && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {spotifyStatus.profile.avatarUrl ? (
                      <img src={spotifyStatus.profile.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {spotifyStatus.profile.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{spotifyStatus.profile.displayName}</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Đã kết nối Spotify thành công · OAuth 2.0</p>
                    </div>
                  </div>
                  <a
                    href={spotifyStatus.profile.profileUrl || 'https://open.spotify.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Spotify</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {!spotifyStatus?.connected && spotifyStatus?.configured && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <button
                    type="button"
                    onClick={() => setShowRedirectUri((v) => !v)}
                    className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    {showRedirectUri ? 'Ẩn Redirect URI' : 'Xem Redirect URI đang dùng'}
                  </button>
                </div>
              )}

              {!spotifyStatus?.connected && (!spotifyStatus?.configured || showRedirectUri) && (
                <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 space-y-1.5 text-[11px]">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {spotifyStatus?.configured
                      ? 'Redirect URI cần khớp chính xác trong Spotify Developer Dashboard:'
                      : 'Hướng dẫn bật OAuth Spotify chính thức:'}
                  </p>
                  {!spotifyStatus?.configured && (
                    <p className="text-zinc-500">
                      Thêm Redirect URI sau vào Spotify Developer Dashboard và khai báo{' '}
                      <code className="font-mono">SPOTIFY_CLIENT_ID</code>,{' '}
                      <code className="font-mono">SPOTIFY_CLIENT_SECRET</code>,{' '}
                      <code className="font-mono">APP_URL</code> trên máy chủ:
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 px-2 py-1 rounded bg-white dark:bg-zinc-800 text-[10px] font-mono truncate border border-zinc-200 dark:border-zinc-700">
                      {liveCallbackUri}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(liveCallbackUri).catch(() => {});
                        addClipboardEntry(liveCallbackUri);
                        setCopiedUri(true);
                        setTimeout(() => setCopiedUri(false), 1800);
                        showToast('Đã sao chép', 'Đã sao chép Callback URI vào bộ nhớ tạm.');
                      }}
                      className="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] font-semibold inline-flex items-center gap-1 shrink-0"
                    >
                      {copiedUri ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUri ? 'Đã chép' : 'Chép'}</span>
                    </button>
                  </div>
                </div>
              )}

              {spotifyStatus?.connected && spotifyLibrary && (
                <div className="space-y-2.5 pt-2 border-t border-[var(--os-border)]">
                  {spotifyLibrary.playlists.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <ListMusic className="w-3.5 h-3.5" />
                        <span>Playlist Spotify của bạn ({spotifyLibrary.playlists.length})</span>
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto os-scroll">
                        {spotifyLibrary.playlists.map((pl) => (
                          <a
                            key={pl.id}
                            href={pl.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between gap-2 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={pl.imageUrl || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'}
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{pl.name}</p>
                                <p className="text-[10px] text-zinc-500">{pl.tracksTotal} bài hát</p>
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {spotifyLibrary.tracks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-zinc-500">
                        Bài hát đã lưu ({spotifyLibrary.tracks.length})
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto os-scroll">
                        {spotifyLibrary.tracks.map((tr) => (
                          <div
                            key={tr.id}
                            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <img src={tr.cover} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{tr.title}</p>
                                <p className="text-[10px] text-zinc-500 truncate">{tr.artist}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {tr.previewUrl && (
                                <button
                                  onClick={() => handlePlaySpotifyPreview(tr)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 text-[10px] font-semibold"
                                  title="Nghe thử 30s chính thức"
                                >
                                  Preview
                                </button>
                              )}
                              <a
                                href={tr.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-500"
                                title="Mở trong Spotify"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Keyless Official Spotify Link & Embed Player (No API Key / No Premium needed) */}
              <div className="pt-2.5 border-t border-[var(--os-border)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-500">Kết nối nhanh qua Link Spotify (Không cần API)</p>
                    <p className="text-[10px] text-zinc-500">
                      Dán link Playlist, Bài hát, Album hoặc Podcast từ ứng dụng Spotify để phát ngay bằng trình phát nhúng chính thức.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddSpotifyLink(spotifyLinkInput);
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    value={spotifyLinkInput}
                    onChange={(e) => setSpotifyLinkInput(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/..."
                    className="flex-1 px-2.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs outline-none border border-transparent focus:border-emerald-500/40"
                  />
                  <button
                    type="submit"
                    disabled={embedBusy || !spotifyLinkInput.trim()}
                    className="min-h-[36px] px-3 rounded-xl bg-emerald-500 text-white text-xs font-semibold shrink-0 disabled:opacity-50"
                  >
                    {embedBusy ? 'Đang tải...' : 'Phát ngay'}
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={embedBusy}
                    onClick={() => void handleAddSpotifyLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium hover:text-emerald-500"
                  >
                    + Today’s Top Hits
                  </button>
                  <button
                    type="button"
                    disabled={embedBusy}
                    onClick={() => void handleAddSpotifyLink('https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium hover:text-emerald-500"
                  >
                    + Lofi Beats
                  </button>
                </div>

                {activeEmbed && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold truncate text-emerald-600 dark:text-emerald-400">
                        Đang phát: {activeEmbed.title}
                      </span>
                      <a
                        href={activeEmbed.canonical_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-emerald-500 inline-flex items-center gap-1 shrink-0"
                      >
                        <span>Mở app</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <iframe
                      title={`Spotify Embed: ${activeEmbed.title}`}
                      src={activeEmbed.embed_url}
                      width="100%"
                      height={activeEmbed.spotify_type === 'track' || activeEmbed.spotify_type === 'episode' ? 152 : 352}
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="rounded-xl bg-zinc-900"
                    />
                  </div>
                )}

                {spotifyEmbeds.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto os-scroll">
                    <p className="text-[11px] font-semibold text-zinc-500">
                      Đã lưu trên PHONE OS ({spotifyEmbeds.length})
                    </p>
                    {spotifyEmbeds.map((item) => {
                      const isActive = activeEmbed?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`p-2 rounded-xl flex items-center justify-between gap-2 border ${
                            isActive
                              ? 'bg-emerald-500/10 border-emerald-500/30'
                              : 'bg-zinc-100 dark:bg-zinc-900 border-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveEmbed(item)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <img
                              src={item.thumbnail_url || '/src/assets/images/wallpaper_aurora_lavender_1794880088230.jpg'}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{item.title}</p>
                              <p className="text-[10px] text-zinc-500 uppercase">{item.spotify_type}</p>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveEmbed(item)}
                              className="p-1.5 rounded-lg bg-emerald-500 text-white"
                              title="Phát trong Spotify Embed"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSpotifyEmbed(item.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Apple Music Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-rose-500">Apple Music</p>
                  <p className="text-[11px] text-zinc-500">Cần Apple MusicKit Developer Token (JWT) · Chưa kết nối</p>
                </div>
                <a
                  href="https://music.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>Mở web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-zinc-500">
                Truy cập trình phát web chính thức của Apple Music. Apple yêu cầu khóa chứng chỉ MusicKit trả phí từ Apple Developer.
              </p>
            </div>

            {/* YouTube Music Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-red-500">YouTube Music</p>
                  <p className="text-[11px] text-zinc-500">Hỗ trợ mở liên kết ngoài hoặc nhúng YouTube trong Hub YouTube</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openApp('youtube')}
                    className="min-h-[36px] px-3 rounded-xl bg-red-500/15 text-red-500 text-xs font-semibold"
                  >
                    YouTube Hub
                  </button>
                  <a
                    href="https://music.youtube.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <span>Web</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                Nghe trực tiếp qua trang chính thức YouTube Music hoặc phát video âm nhạc hợp lệ trong ứng dụng YouTube nội bộ.
              </p>
            </div>
            {/* Hi-Res Audio Pass Hikari Pay */}
            <div className="p-3.5 rounded-2xl bg-[var(--os-surface)] border border-[var(--os-border)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-rose-500">Gói Hi-Res Audio Pass (Lossless)</p>
                  <p className="text-[11px] text-zinc-500">Trải nghiệm âm thanh chất lượng phòng thu trên Music Hub</p>
                </div>
                <span className="text-xs font-extrabold text-rose-500 shrink-0">59.000đ/tháng</span>
              </div>
              {hiresPassActive ? (
                <div className="min-h-[38px] px-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Đã kích hoạt gói Hi-Res Audio Pass bằng Thẻ ngân hàng</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCardCheckoutOpen(true)}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Thanh toán gói Hi-Res Audio Pass (59.000đ) bằng Thẻ</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <UniversalCardCheckoutModal
        open={cardCheckoutOpen}
        title="Đăng ký Hi-Res Audio Pass (1 tháng)"
        merchant="Music Hub Hi-Res Pass"
        category="Giải trí"
        amount={59000}
        channelType="online"
        appSource="Music Hub"
        onClose={() => setCardCheckoutOpen(false)}
        onSuccess={(res) => {
          setHiresPassActive(true);
          showToast(
            'Kích hoạt Hi-Res Audio Pass',
            `Đã thanh toán 59.000đ · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
            'success'
          );
        }}
      />
    </div>
  );
}
