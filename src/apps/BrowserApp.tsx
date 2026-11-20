import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Bookmark,
  Plus,
  X,
  Share2,
  Shield,
  History,
  ExternalLink,
  Globe,
  Download,
  Search,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import { UniversalCardCheckoutModal } from '../components/banking/cards/UniversalCardCheckoutModal';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  incognito: boolean;
}

export function BrowserApp() {
  const { data, appParams, refreshData, openShareSheet, showToast } = useOS();
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_1',
      title: 'Trang bắt đầu',
      url: appParams.url || '',
      incognito: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab_1');
  const [addressInput, setAddressInput] = useState(appParams.url || '');
  const [panel, setPanel] = useState<'none' | 'tabs' | 'bookmarks' | 'history'>('none');
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [cloudPurchased, setCloudPurchased] = useState(false);
  const [cardCheckoutOpen, setCardCheckoutOpen] = useState(false);

  if (!data) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const navigateTo = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, url: '', title: 'Trang bắt đầu' } : t)));
      return;
    }
    const isUrl = trimmed.includes('.') && !trimmed.includes(' ');
    const targetUrl = isUrl
      ? trimmed.startsWith('http')
        ? trimmed
        : `https://${trimmed}`
      : `https://vi.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(trimmed)}`;

    setAddressInput(targetUrl);
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTab.id ? { ...t, url: targetUrl, title: trimmed } : t))
    );
    if (!activeTab.incognito) {
      await osApi.addBrowserHistory({ title: trimmed, url: targetUrl });
      refreshData();
    }
  };

  const addTab = (incognito = false) => {
    const id = `tab_${Date.now()}`;
    setTabs((prev) => [...prev, { id, title: incognito ? 'Thẻ ẩn danh' : 'Trang bắt đầu', url: '', incognito }]);
    setActiveTabId(id);
    setAddressInput('');
    setPanel('none');
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) {
      setTabs([{ id: 'tab_1', title: 'Trang bắt đầu', url: '', incognito: false }]);
      setActiveTabId('tab_1');
      setAddressInput('');
      return;
    }
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      setActiveTabId(next[0].id);
      setAddressInput(next[0].url);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Address Bar */}
      <div className={`px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 space-y-2 ${activeTab.incognito ? 'bg-zinc-900 text-white' : 'bg-white dark:bg-[#1A1A22]'}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo(addressInput);
          }}
          className="flex items-center gap-1.5"
        >
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
            {activeTab.incognito ? <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" /> : <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Nhập URL hoặc tìm trên Wikipedia..."
              className="bg-transparent text-xs outline-none flex-1"
            />
          </div>
          {activeTab.url && (
            <>
              <button
                type="button"
                onClick={async () => {
                  const safeName = (activeTab.title || 'TrangWeb').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28);
                  await osApi.createFile({
                    name: `${safeName}.txt`,
                    folder: 'Tải xuống',
                    mime_type: 'text/plain',
                    size_bytes: activeTab.url.length + 40,
                    content_text: `Tiêu đề: ${activeTab.title}\nURL: ${activeTab.url}\nLưu lúc: ${new Date().toLocaleString('vi-VN')}`,
                  });
                  await refreshData();
                  showToast('Đã lưu vào Tệp', `Đã lưu liên kết vào Tải xuống (${safeName}.txt).`, 'success');
                }}
                className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800"
                title="Lưu trang vào Tệp"
              >
                <Download className="w-4 h-4 text-emerald-500" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await osApi.createBookmark({ title: activeTab.title || activeTab.url, url: activeTab.url });
                  refreshData();
                  showToast('Đã đánh dấu', 'Đã thêm vào Dấu trang');
                }}
                className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800"
                title="Đánh dấu trang"
              >
                <Bookmark className="w-4 h-4 text-sky-500" />
              </button>
            </>
          )}
        </form>
        {findOpen && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs">
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <input
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Tìm nhanh trong URL, dấu trang & lịch sử..."
              className="flex-1 bg-transparent outline-none"
            />
            {findQuery && (
              <span className="text-[10px] text-sky-500 font-semibold">
                {data.bookmarks.filter((b) => b.title.toLowerCase().includes(findQuery.toLowerCase())).length +
                  data.browserHistory.filter((h) => h.title.toLowerCase().includes(findQuery.toLowerCase())).length}{' '}
                khớp
              </span>
            )}
            <button onClick={() => setFindOpen(false)} className="text-zinc-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Viewport */}
      <div className="flex-1 overflow-y-auto os-scroll flex flex-col">
        {!activeTab.url ? (
          <div className="p-4 space-y-5">
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 mb-2">Yêu thích & Truy cập nhanh</h2>
              <div className="grid grid-cols-3 gap-2.5">
                {data.bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    onClick={() => navigateTo(bm.url)}
                    className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-1.5 text-center hover:border-sky-400"
                  >
                    <Globe className="w-5 h-5 text-sky-500" />
                    <span className="text-xs font-medium truncate w-full">{bm.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-rose-500">Cổng Thanh Toán Trực Tuyến Hikari Pay</p>
                  <p className="text-[11px] text-zinc-500">Gói Cloud Drive OS 100GB · Thanh toán web bằng thẻ</p>
                </div>
                <span className="font-extrabold text-rose-500 shrink-0">29.000đ</span>
              </div>
              {cloudPurchased ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Đã kích hoạt gói Cloud Drive OS 100GB qua Hikari Pay</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCardCheckoutOpen(true)}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Thanh toán Cloud Drive OS 100GB (29.000đ)</span>
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-zinc-600 dark:text-zinc-300">
              <p className="font-semibold text-sky-600 dark:text-sky-400 mb-1">Lưu ý trình duyệt nhúng</p>
              <p>
                Một số trang web chặn nhúng iframe thông qua bảo mật X-Frame-Options/CSP. Nếu trang không hiển thị, hãy nhấn Mở thẻ ngoài ở thanh công cụ.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="truncate text-zinc-500">{activeTab.url}</span>
              <a
                href={activeTab.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sky-500 font-semibold shrink-0 ml-2"
              >
                <span>Mở thẻ ngoài</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <iframe
              key={activeTab.url}
              src={activeTab.url}
              title={activeTab.title}
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="flex-1 w-full bg-white border-0"
            />
          </div>
        )}
      </div>

      {/* Bottom Browser Bar */}
      <div className="px-3 py-2 bg-white dark:bg-[#1A1A22] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-zinc-600 dark:text-zinc-300 shrink-0">
        <button onClick={() => navigateTo('')} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Trang chủ">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setFindOpen((f) => !f)} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Tìm kiếm">
          <Search className="w-4 h-4" />
        </button>
        <button onClick={() => setPanel(panel === 'bookmarks' ? 'none' : 'bookmarks')} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Dấu trang">
          <Bookmark className="w-4 h-4" />
        </button>
        <button onClick={() => setPanel(panel === 'history' ? 'none' : 'history')} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Lịch sử">
          <History className="w-4 h-4" />
        </button>
        <button
          onClick={() =>
            openShareSheet({
              title: activeTab.title || 'Liên kết Web',
              text: activeTab.url || 'Chia sẻ từ Trình duyệt PHONE OS',
              url: activeTab.url,
            })
          }
          className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Chia sẻ"
        >
          <Share2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPanel(panel === 'tabs' ? 'none' : 'tabs')}
          className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-mono-num font-bold"
        >
          {tabs.length}
        </button>
      </div>

      {/* Panels: Tabs / Bookmarks / History */}
      {panel !== 'none' && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end p-3">
          <div className="w-full max-h-[75%] rounded-3xl bg-white dark:bg-[#1A1A22] p-4 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {panel === 'tabs' ? 'Thẻ đang mở' : panel === 'bookmarks' ? 'Dấu trang' : 'Lịch sử duyệt web'}
              </h3>
              <div className="flex items-center gap-2">
                {panel === 'tabs' && (
                  <>
                    <button onClick={() => addTab(true)} className="px-2.5 py-1 rounded-lg bg-zinc-800 text-white text-xs">
                      + Ẩn danh
                    </button>
                    <button onClick={() => addTab(false)} className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thẻ mới</span>
                    </button>
                  </>
                )}
                {panel === 'history' && (
                  <button
                    onClick={async () => {
                      await osApi.deleteBrowserHistory('all');
                      refreshData();
                    }}
                    className="text-xs text-rose-500 font-semibold"
                  >
                    Xóa tất cả
                  </button>
                )}
                <button onClick={() => setPanel('none')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto os-scroll space-y-2 text-xs">
              {panel === 'tabs' &&
                tabs.map((t) => (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-xl flex items-center justify-between border ${
                      t.id === activeTabId ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveTabId(t.id);
                        setAddressInput(t.url);
                        setPanel('none');
                      }}
                      className="flex-1 text-left truncate font-medium"
                    >
                      {t.incognito ? '🕶 ' : ''}{t.title}
                    </button>
                    <button onClick={() => closeTab(t.id)} className="p-1 text-zinc-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

              {panel === 'bookmarks' &&
                data.bookmarks.map((bm) => (
                  <div key={bm.id} className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setPanel('none');
                        navigateTo(bm.url);
                      }}
                      className="flex-1 text-left truncate"
                    >
                      <p className="font-semibold truncate">{bm.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{bm.url}</p>
                    </button>
                    <button
                      onClick={async () => {
                        await osApi.deleteBookmark(bm.id);
                        refreshData();
                      }}
                      className="text-rose-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

              {panel === 'history' &&
                data.browserHistory.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setPanel('none');
                      navigateTo(h.url);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-left block"
                  >
                    <p className="font-semibold truncate">{h.title}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{h.url}</p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      <UniversalCardCheckoutModal
        open={cardCheckoutOpen}
        title="Thanh toán trực tuyến · Cloud Drive OS 100GB"
        merchant="Cloud Drive OS 100GB"
        category="Dịch vụ Web"
        amount={29000}
        channelType="online"
        appSource="Trình duyệt"
        onClose={() => setCardCheckoutOpen(false)}
        onSuccess={(res) => {
          setCloudPurchased(true);
          showToast(
            'Thanh toán trực tuyến thành công',
            `Cloud Drive OS 100GB đã kích hoạt · Hoàn +${(res.cashbackEarned || 0).toLocaleString('vi-VN')}đ`,
            'success'
          );
        }}
      />
    </div>
  );
}
