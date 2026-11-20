import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import type { AppId } from '../../types/os';

interface Props {
  appId: AppId;
  onErrorLog?: (appId: string, code: string, msg: string, detail: string) => void;
  onCloseApp: () => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Lỗi hiển thị ứng dụng' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onErrorLog?.(
      this.props.appId,
      'APP_RENDER_CRASH',
      error?.message || 'Ứng dụng gặp sự cố',
      (info?.componentStack || '').slice(0, 400)
    );
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.appId !== this.props.appId && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white dark:bg-zinc-950">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center mb-3">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold mb-1">Ứng dụng tạm dừng đột ngột</h3>
          <p className="text-xs opacity-65 mb-4 max-w-[260px]">
            Lỗi được cô lập an toàn, không ảnh hưởng tới PHONE OS. Chi tiết đã ghi vào Trung tâm Lỗi.
          </p>
          <p className="text-[11px] font-mono bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-xl mb-5 max-w-[280px] truncate">
            {this.state.errorMessage}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thử tải lại
            </button>
            <button
              onClick={this.props.onCloseApp}
              className="px-4 py-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5"
            >
              <Home className="w-3.5 h-3.5" /> Về màn hình chính
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
