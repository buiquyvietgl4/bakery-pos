import Link from 'next/link';
import { ShoppingBag, ChefHat, BarChart3, ArrowRight, ShieldCheck, Sparkles, Cloud, Wifi } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col justify-center max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="text-center space-y-4 max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          HỆ THỐNG OFFLINE-FIRST & TỰ ĐỘNG TÍNH GIÁ VỐN
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-zinc-900 tracking-tight leading-tight">
          Quản Lý Tiệm Bánh <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500">Thông Minh & Tinh Gọn</span>
        </h1>
        <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
          Bán hàng tại quầy không gián đoạn kể cả mất mạng, tự động đồng bộ công thức bánh cho bếp, kiểm soát kho nguyên liệu và chốt lãi lỗ P&L từng đồng.
        </p>
      </div>

      {/* 3 Main Action Portals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* POS Portal */}
        <Link
          href="/pos"
          className="group relative bg-white rounded-3xl p-6 sm:p-8 border border-amber-100 shadow-sm hover:shadow-xl hover:border-amber-300 transition-all duration-300 flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full -z-0 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 mb-6 group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Màn hình Quầy Thu Ngân</span>
            <h2 className="text-2xl font-bold text-zinc-900 mt-1 mb-2 group-hover:text-amber-600 transition-colors">
              Bán Hàng POS
            </h2>
            <p className="text-zinc-600 text-sm leading-relaxed mb-6">
              Menu trực quan, giỏ hàng nhanh, in hóa đơn nhiệt và tự lưu tạm trên máy khi rớt mạng.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-sm font-bold text-amber-700 group-hover:translate-x-1.5 transition-transform">
            Vào quầy bán hàng <ArrowRight className="w-4 h-4 ml-1.5" />
          </div>
        </Link>

        {/* Kitchen KDS Portal */}
        <Link
          href="/kitchen"
          className="group relative bg-white rounded-3xl p-6 sm:p-8 border border-orange-100 shadow-sm hover:shadow-xl hover:border-orange-300 transition-all duration-300 flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full -z-0 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 mb-6 group-hover:scale-110 transition-transform">
              <ChefHat className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Màn hình Bếp KDS</span>
            <h2 className="text-2xl font-bold text-zinc-900 mt-1 mb-2 group-hover:text-orange-600 transition-colors">
              Bếp Làm Bánh
            </h2>
            <p className="text-zinc-600 text-sm leading-relaxed mb-6">
              Hiển thị đơn hàng theo thời gian thực (Realtime), tra cứu định lượng công thức bột bơ trứng.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-sm font-bold text-orange-700 group-hover:translate-x-1.5 transition-transform">
            Vào màn hình Bếp <ArrowRight className="w-4 h-4 ml-1.5" />
          </div>
        </Link>

        {/* Admin Portal */}
        <Link
          href="/admin"
          className="group relative bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-0 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 mb-6 group-hover:scale-110 transition-transform">
              <BarChart3 className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Dành cho Chủ Tiệm</span>
            <h2 className="text-2xl font-bold text-zinc-900 mt-1 mb-2 group-hover:text-emerald-600 transition-colors">
              Quản Trị & Kế Toán
            </h2>
            <p className="text-zinc-600 text-sm leading-relaxed mb-6">
              Theo dõi Doanh thu, Báo cáo lãi lỗ P&L, định lượng công thức BOM và tải ảnh sản phẩm 1 lần.
            </p>
          </div>
          <div className="relative z-10 flex items-center text-sm font-bold text-emerald-700 group-hover:translate-x-1.5 transition-transform">
            Vào trang Quản trị <ArrowRight className="w-4 h-4 ml-1.5" />
          </div>
        </Link>
      </div>

      {/* Feature Highlights Banner */}
      <div className="mt-12 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 rounded-2xl p-6 border border-amber-200/50 flex flex-wrap items-center justify-around gap-4 text-xs font-semibold text-zinc-700">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-amber-600" />
          <span>Offline-First (IndexedDB)</span>
        </div>
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-orange-600" />
          <span>Cloud Supabase PostgreSQL</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Bảo mật RLS Ẩn Giá Vốn</span>
        </div>
      </div>
    </div>
  );
}
