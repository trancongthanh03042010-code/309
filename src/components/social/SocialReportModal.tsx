import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { socialApi } from '../../services/socialApi';

interface SocialReportModalProps {
  targetType: 'post' | 'video' | 'comment' | 'user';
  targetId: string;
  onClose: () => void;
  onSubmitted: (msg: string) => void;
}

const REPORT_REASONS = [
  'Tin rác hoặc lừa đảo',
  'Ngôn từ kích động thù địch / quấy rối',
  'Thông tin sai sự thật',
  'Nội dung nhạy cảm / bạo lực',
  'Vi phạm bản quyền / giả mạo',
];

export function SocialReportModal({ targetType, targetId, onClose, onSubmitted }: SocialReportModalProps) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await socialApi.submitReport({ target_type: targetType, target_id: targetId, reason, detail });
      onSubmitted('Báo cáo đã được ghi nhận vào hàng đợi kiểm duyệt.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi báo cáo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#14161D] rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-500">
            <Flag className="w-4 h-4" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Báo cáo vi phạm</h3>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setReason(r)}
                className={`w-full min-h-[44px] px-3 rounded-xl text-left text-xs font-medium border transition-colors ${
                  reason === r
                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Mô tả chi tiết thêm cho kiểm duyệt viên (không bắt buộc)..."
            className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 outline-none resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[44px] rounded-xl bg-rose-600 text-white text-xs font-semibold disabled:opacity-60"
            >
              {loading ? 'Đang gửi...' : 'Gửi báo cáo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
