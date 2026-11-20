import React, { useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Pin,
  Plus,
  Presentation,
  Save,
  Share2,
  Trash2,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';
import type { OfficeDoc } from '../types/os';

function evalFormula(cell: string, rows: string[][]): string {
  const m = cell.trim().match(/^=SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
  if (!m) return cell;
  const col1 = m[1].toUpperCase().charCodeAt(0) - 65;
  const row1 = Number(m[2]) - 1;
  const col2 = m[3].toUpperCase().charCodeAt(0) - 65;
  const row2 = Number(m[4]) - 1;
  let total = 0;
  for (let r = Math.min(row1, row2); r <= Math.max(row1, row2); r++) {
    for (let c = Math.min(col1, col2); c <= Math.max(col1, col2); c++) {
      const val = Number(rows[r]?.[c]);
      if (Number.isFinite(val)) total += val;
    }
  }
  return total.toLocaleString('vi-VN');
}

export function OfficeApp() {
  const { data, refreshData, showToast, openShareSheet } = useOS();
  const [filter, setFilter] = useState<'all' | OfficeDoc['doc_type']>('all');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [pdfPage, setPdfPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<OfficeDoc['doc_type']>('document');

  const docs = data?.officeDocs || [];
  const filtered = docs.filter((d) => filter === 'all' || d.doc_type === filter);
  const activeDoc = docs.find((d) => d.id === activeDocId) || null;

  const createDoc = async () => {
    if (!newTitle.trim()) return;
    const defaultContent =
      newType === 'spreadsheet'
        ? { rows: [['Hạng mục', 'Số lượng', 'Giá trị'], ['Mục A', '1', '100000'], ['Tổng', '', '=SUM(C2:C2)']] }
        : newType === 'presentation'
          ? { slides: [{ title: newTitle, body: 'Nội dung slide đầu tiên', bg: '#1E1B4B' }] }
          : newType === 'pdf'
            ? { pages: ['Trang 1: Tài liệu PDF cục bộ'], bookmarks: [0], notes: '' }
            : { blocks: [{ type: 'h1', text: newTitle }, { type: 'p', text: 'Bắt đầu soạn thảo văn bản...' }] };

    const created = (await osApi.createOfficeDoc({
      title: newTitle.trim(),
      doc_type: newType,
      folder: 'Tài liệu',
      content_json: JSON.stringify(defaultContent),
    })) as OfficeDoc;
    await refreshData();
    setCreating(false);
    setNewTitle('');
    setActiveDocId(created.id);
    showToast('Văn phòng', 'Đã tạo tài liệu mới');
  };

  const saveContent = async (doc: OfficeDoc, contentObj: unknown) => {
    await osApi.updateOfficeDoc(doc.id, {
      content_json: JSON.stringify(contentObj),
      version: (doc.version || 1) + 1,
    });
    await refreshData();
    showToast('Đã lưu', `${doc.title} (Phiên bản v${(doc.version || 1) + 1})`, 'success');
  };

  const docIcon = (type: OfficeDoc['doc_type']) => {
    if (type === 'spreadsheet') return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    if (type === 'presentation') return <Presentation className="w-4 h-4 text-amber-500" />;
    if (type === 'pdf') return <FileText className="w-4 h-4 text-rose-500" />;
    return <FileText className="w-4 h-4 text-sky-500" />;
  };

  if (activeDoc) {
    const parsed = JSON.parse(activeDoc.content_json || '{}') as Record<string, unknown>;
    return (
      <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
        <div className="px-3 py-2.5 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              setActiveDocId(null);
              setSlideIdx(0);
              setPdfPage(0);
            }}
            className="text-xs font-bold text-violet-500 flex items-center gap-0.5 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" /> Danh sách
          </button>
          <span className="text-xs font-bold truncate flex-1 text-center">{activeDoc.title}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => openShareSheet({ title: activeDoc.title, text: activeDoc.content_json })}
              className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => {
                await osApi.deleteOfficeDoc(activeDoc.id);
                await refreshData();
                setActiveDocId(null);
                showToast('Đã xóa tài liệu', activeDoc.title);
              }}
              className="p-1.5 rounded-lg bg-rose-500/15 text-rose-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-3">
          {activeDoc.doc_type === 'document' && (
            <DocEditor doc={activeDoc} parsed={parsed} onSave={(next) => saveContent(activeDoc, next)} />
          )}

          {activeDoc.doc_type === 'spreadsheet' && (
            <SheetEditor doc={activeDoc} parsed={parsed} onSave={(next) => saveContent(activeDoc, next)} />
          )}

          {activeDoc.doc_type === 'presentation' && (
            <SlideViewer
              parsed={parsed}
              slideIdx={slideIdx}
              setSlideIdx={setSlideIdx}
              onSave={(next) => saveContent(activeDoc, next)}
            />
          )}

          {activeDoc.doc_type === 'pdf' && (
            <PdfViewer
              parsed={parsed}
              pdfPage={pdfPage}
              setPdfPage={setPdfPage}
              onSave={(next) => saveContent(activeDoc, next)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101015] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-[#17171F] border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            <h1 className="font-display font-bold text-base">Văn phòng & Tài liệu</h1>
          </div>
          <button
            onClick={() => setCreating((c) => !c)}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Tạo mới
          </button>
        </div>

        {creating && (
          <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 space-y-2 text-xs">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tên tài liệu..."
              className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 outline-none"
            />
            <div className="flex gap-1.5">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as OfficeDoc['doc_type'])}
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 outline-none"
              >
                <option value="document">Văn bản (.docx)</option>
                <option value="spreadsheet">Bảng tính (.xlsx)</option>
                <option value="presentation">Trình chiếu (.pptx)</option>
                <option value="pdf">PDF</option>
              </select>
              <button onClick={createDoc} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold">
                Tạo
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto os-scroll-hidden">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'document', label: 'Văn bản' },
            { id: 'spreadsheet', label: 'Bảng tính' },
            { id: 'presentation', label: 'Slide' },
            { id: 'pdf', label: 'PDF' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                filter === f.id ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-3 space-y-2">
        {filtered.map((doc) => (
          <div
            key={doc.id}
            onClick={() => setActiveDocId(doc.id)}
            className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                {docIcon(doc.doc_type)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{doc.title}</p>
                <p className="text-[10px] text-zinc-500">
                  {doc.folder} · v{doc.version || 1}
                </p>
              </div>
            </div>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await osApi.updateOfficeDoc(doc.id, { is_pinned: doc.is_pinned ? 0 : 1 });
                await refreshData();
              }}
              className={`p-1.5 rounded-lg ${doc.is_pinned ? 'text-amber-500' : 'text-zinc-400'}`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocEditor({ parsed, onSave }: { doc: OfficeDoc; parsed: Record<string, unknown>; onSave: (next: unknown) => void }) {
  const initialBlocks = Array.isArray(parsed.blocks)
    ? (parsed.blocks as Array<{ type?: string; text?: string } | string>).map((b) =>
        typeof b === 'string' ? { type: 'p', text: b } : { type: b.type || 'p', text: b.text || '' }
      )
    : [{ type: 'p', text: '' }];
  const [blocks, setBlocks] = useState(initialBlocks);

  return (
    <div className="space-y-2.5">
      {blocks.map((blk, i) => (
        <div key={i} className="p-2.5 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <select
              value={blk.type}
              onChange={(e) => setBlocks((prev) => prev.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))}
              className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-lg"
            >
              <option value="h1">Tiêu đề</option>
              <option value="p">Đoạn văn</option>
              <option value="list">Danh sách</option>
            </select>
            <span>Khối #{i + 1}</span>
          </div>
          <textarea
            value={blk.text}
            rows={blk.type === 'h1' ? 1 : 3}
            onChange={(e) => setBlocks((prev) => prev.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
            className={`w-full bg-transparent outline-none resize-none ${blk.type === 'h1' ? 'text-sm font-bold' : 'text-xs'}`}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => setBlocks((prev) => [...prev, { type: 'p', text: '' }])}
          className="flex-1 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold"
        >
          + Thêm đoạn
        </button>
        <button
          onClick={() => onSave({ blocks })}
          className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Lưu văn bản
        </button>
      </div>
    </div>
  );
}

function SheetEditor({ parsed, onSave }: { doc: OfficeDoc; parsed: Record<string, unknown>; onSave: (next: unknown) => void }) {
  const initialRows = Array.isArray(parsed.rows) ? (parsed.rows as string[][]) : [['Cột A', 'Cột B'], ['100', '200']];
  const [rows, setRows] = useState<string[][]>(initialRows);

  return (
    <div className="space-y-2.5">
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191922]">
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx === 0 ? 'bg-emerald-500/10 font-bold' : 'border-t border-zinc-200 dark:border-zinc-800'}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 min-w-[78px]">
                    <input
                      value={cell}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, ri) => (ri === rIdx ? r.map((c, ci) => (ci === cIdx ? e.target.value : c)) : r))
                        )
                      }
                      className="w-full bg-transparent outline-none"
                    />
                    {cell.startsWith('=') && (
                      <span className="block text-[10px] text-emerald-500 font-bold">
                        = {evalFormula(cell, rows)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setRows((prev) => [...prev, new Array(prev[0]?.length || 3).fill('0')])}
          className="flex-1 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold"
        >
          + Thêm hàng
        </button>
        <button
          onClick={() => onSave({ rows })}
          className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Lưu bảng tính
        </button>
      </div>
    </div>
  );
}

function SlideViewer({
  parsed,
  slideIdx,
  setSlideIdx,
  onSave,
}: {
  parsed: Record<string, unknown>;
  slideIdx: number;
  setSlideIdx: (n: number) => void;
  onSave: (next: unknown) => void;
}) {
  const initialSlides = Array.isArray(parsed.slides)
    ? (parsed.slides as Array<{ title: string; body: string; bg: string }>)
    : [{ title: 'Slide 1', body: 'Nội dung', bg: '#1E1B4B' }];
  const [slides, setSlides] = useState(initialSlides);
  const current = slides[slideIdx] || slides[0];

  return (
    <div className="space-y-3">
      <div
        className="rounded-3xl p-5 min-h-[200px] text-white flex flex-col justify-center space-y-2 shadow-xl"
        style={{ backgroundColor: current.bg || '#1E1B4B' }}
      >
        <span className="text-[10px] uppercase tracking-wider text-white/60">
          Slide {slideIdx + 1} / {slides.length}
        </span>
        <input
          value={current.title}
          onChange={(e) => setSlides((prev) => prev.map((s, i) => (i === slideIdx ? { ...s, title: e.target.value } : s)))}
          className="bg-transparent font-display text-lg font-bold outline-none"
        />
        <textarea
          value={current.body}
          rows={3}
          onChange={(e) => setSlides((prev) => prev.map((s, i) => (i === slideIdx ? { ...s, body: e.target.value } : s)))}
          className="bg-transparent text-xs text-white/90 outline-none resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          disabled={slideIdx <= 0}
          onClick={() => setSlideIdx(slideIdx - 1)}
          className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold disabled:opacity-40 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Trước
        </button>
        <button
          onClick={() => onSave({ slides })}
          className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Lưu Slide
        </button>
        <button
          disabled={slideIdx >= slides.length - 1}
          onClick={() => setSlideIdx(slideIdx + 1)}
          className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold disabled:opacity-40 flex items-center gap-1"
        >
          Sau <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PdfViewer({
  parsed,
  pdfPage,
  setPdfPage,
  onSave,
}: {
  parsed: Record<string, unknown>;
  pdfPage: number;
  setPdfPage: (n: number) => void;
  onSave: (next: unknown) => void;
}) {
  const pages = Array.isArray(parsed.pages) ? (parsed.pages as string[]) : ['Trang 1'];
  const [bookmarks, setBookmarks] = useState<number[]>(Array.isArray(parsed.bookmarks) ? (parsed.bookmarks as number[]) : []);
  const [notes, setNotes] = useState(typeof parsed.notes === 'string' ? parsed.notes : '');

  const isBookmarked = bookmarks.includes(pdfPage);
  const toggleBookmark = () => {
    setBookmarks((prev) => (prev.includes(pdfPage) ? prev.filter((p) => p !== pdfPage) : [...prev, pdfPage]));
  };

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Trang {pdfPage + 1} / {pages.length}</span>
          <button
            onClick={toggleBookmark}
            className={`flex items-center gap-1 font-semibold ${isBookmarked ? 'text-rose-500' : 'text-zinc-400'}`}
          >
            <Bookmark className="w-3.5 h-3.5" /> {isBookmarked ? 'Đã đánh dấu' : 'Đánh dấu trang'}
          </button>
        </div>
        <p className="text-xs leading-relaxed whitespace-pre-wrap">{pages[pdfPage]}</p>
      </div>

      <div className="flex items-center justify-between">
        <button
          disabled={pdfPage <= 0}
          onClick={() => setPdfPage(pdfPage - 1)}
          className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold disabled:opacity-40"
        >
          Trang trước
        </button>
        <button
          disabled={pdfPage >= pages.length - 1}
          onClick={() => setPdfPage(pdfPage + 1)}
          className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-bold disabled:opacity-40"
        >
          Trang sau
        </button>
      </div>

      <div className="p-3 rounded-2xl bg-white dark:bg-[#191922] border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
        <p className="font-bold">Ghi chú đọc PDF</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ghi chú riêng cho tài liệu PDF này..."
          className="w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none resize-none"
        />
        <button
          onClick={() => onSave({ pages, bookmarks, notes })}
          className="w-full py-2 rounded-xl bg-rose-500 text-white font-bold flex items-center justify-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Lưu dấu trang & ghi chú
        </button>
      </div>
    </div>
  );
}
