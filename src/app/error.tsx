'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center p-6 text-center bg-zinc-950 text-white">
      <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-black mb-2 text-zinc-100">Đã xảy ra lỗi tải trang</h2>
      <p className="text-xs text-zinc-400 max-w-md mb-6">
        Hệ thống phát hiện lỗi không mong muốn khi hiển thị. Vui lòng bấm "Thử Lại" hoặc quay về trang Bán hàng.
      </p>
      {error?.message && (
        <pre className="text-[11px] bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-rose-400 max-w-lg overflow-x-auto mb-6">
          {error.message}
        </pre>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-orange-600/30"
        >
          <RefreshCw className="w-4 h-4" /> Thử Lại
        </button>
        <Link
          href="/pos"
          className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-2 transition"
        >
          <Home className="w-4 h-4" /> Về Màn Hình POS
        </Link>
      </div>
    </div>
  );
}
