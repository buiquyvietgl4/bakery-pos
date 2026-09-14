'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';
import {
  HouseholdBusinessInfo,
  S2aRowItem,
  S2aSummaryByGroup,
  TaxPolicyConfig,
  BkHdkdInventoryRow,
  BkHdkdExpenseItemRow,
} from '@/lib/types/taxConfig';

interface TaxBookPrintViewProps {
  info: HouseholdBusinessInfo;
  periodLabel: string;
  bookCode:
    | 'S1a-HKD'
    | 'S2a-HKD'
    | 'S2b-HKD'
    | 'S2c-HKD'
    | 'S2d-HKD'
    | 'S2e-HKD'
    | 'S3a-HKD'
    | '01/CNKD'
    | '01-2/BK-HĐKD'
    | '01/TKN-CNKD';
  rows: S2aRowItem[];
  summary: S2aSummaryByGroup[];
  totals: {
    totalRevenue: number;
    totalVat: number;
    totalPit: number;
    totalTax: number;
  };
  policy?: TaxPolicyConfig;
  inventoryRows?: BkHdkdInventoryRow[];
  expenseSummary?: BkHdkdExpenseItemRow[];
  onClose: () => void;
}

export const TaxBookPrintView: React.FC<TaxBookPrintViewProps> = ({
  info,
  periodLabel,
  bookCode,
  rows,
  summary,
  totals,
  policy,
  inventoryRows = [],
  expenseSummary = [],
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const today = new Date();
  const dateStr = `Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs overflow-y-auto p-4 sm:p-6 flex justify-center items-start animate-in fade-in">
      
      {/* Container Trang In */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-zinc-200 print:shadow-none print:border-none print:m-0 print:w-full">
        
        {/* Thanh công cụ điều khiển (Ẩn khi bấm In) */}
        <div className="p-4 bg-zinc-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-amber-500 text-zinc-950 text-xs font-black">
              {bookCode}
            </span>
            <span className="text-sm font-semibold text-zinc-200">
              {bookCode === '01/TKN-CNKD'
                ? 'Tờ Khai Thông Báo Doanh Thu Năm (Doanh Thu ≤ 1 Tỷ - Miễn Thuế)'
                : bookCode === '01/CNKD'
                ? 'Tờ Khai Thuế Cá Nhân Kinh Doanh (Doanh Thu > 1 Tỷ)'
                : bookCode === '01-2/BK-HĐKD'
                ? 'Phụ Lục Bảng Kê Hoạt Động Kinh Doanh (Kèm Mẫu 01/CNKD)'
                : 'Mẫu Sổ Kế Toán Chuẩn Bộ Tài Chính (Khổ A4)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay (A4)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
              title="Đóng xem trước"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nội dung Mẫu Sổ Chuẩn Theo Bộ Tài Chính */}
        <div className="p-8 sm:p-12 text-black font-serif text-[12px] leading-relaxed bg-white print:p-0">
          
          {/* Header Thông tin Hộ Kinh Doanh & Số hiệu Thông tư */}
          <div className="grid grid-cols-2 gap-4 pb-6">
            <div>
              <p className="font-bold text-sm uppercase">{info.shop_name}</p>
              <p>Địa chỉ: <span className="font-semibold">{info.business_address}</span></p>
              <p>Mã số thuế: <span className="font-semibold tracking-wider">{info.tax_code}</span></p>
              <p>Điện thoại: {info.phone}</p>
            </div>

            <div className="text-center pl-4">
              <p className="font-bold text-sm">Mẫu số {bookCode}</p>
              <p className="text-[11px] italic text-zinc-700">
                {bookCode === '01/TKN-CNKD'
                  ? `(Ban hành kèm theo ${policy?.circular_citation || 'Thông tư số 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP'})`
                  : bookCode === '01/CNKD'
                  ? `(Ban hành kèm theo ${policy?.circular_citation || 'Thông tư số 40/2021/TT-BTC & Thông tư 50/2026/TT-BTC'})`
                  : bookCode === '01-2/BK-HĐKD'
                  ? '(Ban hành kèm theo Thông tư số 40/2021/TT-BTC của Bộ Tài chính)'
                  : '(Ban hành kèm theo Thông tư số 88/2021/TT-BTC & Thông tư 152/2025/TT-BTC)'}
              </p>
            </div>
          </div>

          {/* Tiêu Đề Sổ Kế Toán / Tờ Khai */}
          <div className="text-center py-4 border-t border-b border-zinc-300 my-2">
            <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wide">
              {bookCode === 'S2a-HKD' && 'SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ'}
              {bookCode === 'S2c-HKD' && 'SỔ CHI TIẾT DOANH THU, CHI PHÍ'}
              {bookCode === 'S2d-HKD' && 'SỔ CHI TIẾT VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA'}
              {bookCode === 'S2e-HKD' && 'SỔ CHI TIẾT TIỀN'}
              {bookCode === 'S1a-HKD' && 'SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ (KHÔNG CHỊU THUẾ)'}
              {bookCode === 'S3a-HKD' && 'SỔ THEO DÕI NGHĨA VỤ THUẾ KHÁC'}
              {bookCode === '01/CNKD' && 'TỜ KHAI THUẾ ĐỐI VỚI CÁ NHÂN KINH DOANH (DOANH THU > 1 TỶ)'}
              {bookCode === '01-2/BK-HĐKD' && 'PHỤ LỤC BẢNG KÊ HOẠT ĐỘNG KINH DOANH TRONG KỲ'}
              {bookCode === '01/TKN-CNKD' && 'TỜ KHAI THUẾ / THÔNG BÁO DOANH THU NĂM (DOANH THU ≤ 1 TỶ - MIỄN THUẾ)'}
            </h1>
            <p className="text-xs italic text-zinc-600 mt-1">
              Địa điểm kinh doanh: {info.business_address}
            </p>
            <p className="text-xs font-semibold mt-0.5">
              Kỳ ghi sổ / Kê khai: {periodLabel}
            </p>
            <p className="text-right text-[11px] italic mt-2">
              Đơn vị tính: Đồng Việt Nam
            </p>
          </div>

          {/* Bảng Kê Dữ Liệu Theo Loại Sổ / Tờ Khai */}
          {bookCode === '01/TKN-CNKD' ? (
            /* ── BẢNG TỜ KHAI 01/TKN-CNKD (DOANH THU <= 1 TỶ - MIỄN THUẾ) ── */
            <div className="my-4 space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-center text-xs text-emerald-950 font-bold">
                XÁC NHẬN NGHĨA VỤ THUẾ: HỘ KINH DOANH ĐỦ ĐIỀU KIỆN ĐƯỢC MIỄN 100% THUẾ GTGT &amp; THUẾ TNCN
                <div className="text-[11px] font-normal mt-0.5 text-emerald-800">
                  (Căn cứ theo Nghị định số 141/2026/NĐ-CP &amp; Thông tư số 50/2026/TT-BTC: Doanh thu năm không quá 1.000.000.000 đồng)
                </div>
              </div>

              <table className="w-full border-collapse border border-black text-left text-[11px]">
                <thead>
                  <tr className="bg-zinc-100 text-center font-bold">
                    <th className="border border-black p-2 w-16">Chỉ tiêu</th>
                    <th className="border border-black p-2">Nội dung kê khai doanh thu</th>
                    <th className="border border-black p-2 w-28 text-center">Tỷ lệ quy định</th>
                    <th className="border border-black p-2 w-36 text-right">Doanh thu phát sinh</th>
                    <th className="border border-black p-2 w-36 text-right">Số thuế phải nộp</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold bg-zinc-50">
                    <td className="border border-black p-2 text-center font-mono">[21]</td>
                    <td className="border border-black p-2 uppercase">TỔNG DOANH THU THỰC TẾ PHÁT SINH TRONG NĂM</td>
                    <td className="border border-black p-2 text-center">-</td>
                    <td className="border border-black p-2 text-right font-black">
                      {totals.totalRevenue.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-black text-emerald-800">
                      0 đ (Miễn thuế)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[22]</td>
                    <td className="border border-black p-2">1. Doanh thu sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh</td>
                    <td className="border border-black p-2 text-center">GTGT 3% | TNCN 1.5%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[2]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right text-emerald-800">0 đ (Miễn thuế)</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[23]</td>
                    <td className="border border-black p-2">2. Doanh thu bán lẻ phụ kiện tiệc, nến, mũ, hàng hóa mua bán</td>
                    <td className="border border-black p-2 text-center">GTGT 1% | TNCN 0.5%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[0]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right text-emerald-800">0 đ (Miễn thuế)</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[24]</td>
                    <td className="border border-black p-2">3. Doanh thu dịch vụ giao hàng, ship bánh, trang trí tiệc</td>
                    <td className="border border-black p-2 text-center">GTGT 5% | TNCN 2%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[1]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right text-emerald-800">0 đ (Miễn thuế)</td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[25]</td>
                    <td className="border border-black p-2">4. Doanh thu hoạt động kinh doanh khác</td>
                    <td className="border border-black p-2 text-center">GTGT 2% | TNCN 1%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[3]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right text-emerald-800">0 đ (Miễn thuế)</td>
                  </tr>
                  <tr className="bg-emerald-50/60 font-bold">
                    <td className="border border-black p-2 text-center font-mono">[26]</td>
                    <td className="border border-black p-2">Thuế Giá Trị Gia Tăng (GTGT) phải nộp trong năm:</td>
                    <td className="border border-black p-2 text-center">Miễn thuế</td>
                    <td className="border border-black p-2 text-right">-</td>
                    <td className="border border-black p-2 text-right text-emerald-900 font-black">0 đ</td>
                  </tr>
                  <tr className="bg-emerald-50/60 font-bold">
                    <td className="border border-black p-2 text-center font-mono">[27]</td>
                    <td className="border border-black p-2">Thuế Thu Nhập Cá Nhân (TNCN) phải nộp trong năm:</td>
                    <td className="border border-black p-2 text-center">Miễn thuế</td>
                    <td className="border border-black p-2 text-right">-</td>
                    <td className="border border-black p-2 text-right text-emerald-900 font-black">0 đ</td>
                  </tr>
                  <tr className="bg-zinc-100 font-bold">
                    <td className="border border-black p-2 text-center font-mono">[28]</td>
                    <td className="border border-black p-2">Lệ phí môn bài (Đã bãi bỏ đối với HKD từ 01/01/2026):</td>
                    <td className="border border-black p-2 text-center">-</td>
                    <td className="border border-black p-2 text-right">-</td>
                    <td className="border border-black p-2 text-right">0 đ</td>
                  </tr>
                  <tr className="bg-amber-100 font-bold text-amber-950">
                    <td colSpan={3} className="border border-black p-2.5 uppercase">
                      [29] TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (VNĐ)
                    </td>
                    <td colSpan={2} className="border border-black p-2.5 text-right font-black text-sm text-emerald-900">
                      0 VNĐ (MIỄN NỘP THUẾ)
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="italic text-[11px] text-zinc-600 pt-1">
                * Cam đoan: Tôi cam đoan số liệu khai trên là hoàn toàn đúng sự thật và chịu trách nhiệm trước pháp luật về tính chính xác của doanh thu thông báo.
              </p>
            </div>
          ) : bookCode === '01/CNKD' ? (
            /* ── BẢNG TỜ KHAI 01/CNKD (DOANH THU > 1 TỶ - KÊ KHAI NỘP THUẾ) ── */
            <div className="my-4 space-y-3">
              <table className="w-full border-collapse border border-black text-left text-[11px]">
                <thead>
                  <tr className="bg-zinc-100 text-center font-bold">
                    <th className="border border-black p-2 w-16">Chỉ tiêu</th>
                    <th className="border border-black p-2">Nội dung kinh tế kê khai</th>
                    <th className="border border-black p-2 w-28 text-center">Tỷ lệ tính thuế</th>
                    <th className="border border-black p-2 w-36 text-right">Doanh thu kê khai (VNĐ)</th>
                    <th className="border border-black p-2 w-36 text-right">Số thuế phải nộp (VNĐ)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold bg-zinc-100">
                    <td className="border border-black p-2 text-center font-mono">[28]</td>
                    <td className="border border-black p-2 uppercase">TỔNG DOANH THU TÍNH THUẾ TRONG KỲ</td>
                    <td className="border border-black p-2 text-center">-</td>
                    <td className="border border-black p-2 text-right font-black">
                      {totals.totalRevenue.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-black text-amber-900">
                      {totals.totalTax.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[29]</td>
                    <td className="border border-black p-2">1. Phân phối, cung cấp hàng hóa (Phụ kiện sinh nhật, nến, mũ, bánh nhập)</td>
                    <td className="border border-black p-2 text-center">GTGT 1% | TNCN 0.5%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[0]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-semibold">
                      {(summary[0]?.total_tax || 0).toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[30]</td>
                    <td className="border border-black p-2">2. Dịch vụ, xây dựng không bao thầu NVL (Phí ship riêng, trang trí tiệc)</td>
                    <td className="border border-black p-2 text-center">GTGT 5% | TNCN 2%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[1]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-semibold">
                      {(summary[1]?.total_tax || 0).toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr className="bg-amber-50/50">
                    <td className="border border-black p-2 text-center font-mono font-bold text-amber-900">[31]</td>
                    <td className="border border-black p-2 font-bold text-amber-950">3. Sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh</td>
                    <td className="border border-black p-2 text-center font-bold text-amber-900">GTGT 3% | TNCN 1.5%</td>
                    <td className="border border-black p-2 text-right font-bold text-amber-950">
                      {(summary[2]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-bold text-amber-950">
                      {(summary[2]?.total_tax || 0).toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black p-2 text-center font-mono">[32]</td>
                    <td className="border border-black p-2">4. Hoạt động kinh doanh khác</td>
                    <td className="border border-black p-2 text-center">GTGT 2% | TNCN 1%</td>
                    <td className="border border-black p-2 text-right">
                      {(summary[3]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="border border-black p-2 text-right font-semibold">
                      {(summary[3]?.total_tax || 0).toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold">
                    <td className="border border-black p-2 text-center font-mono text-emerald-900">[33]</td>
                    <td className="border border-black p-2 text-emerald-950">Tổng số thuế GTGT phải nộp trong kỳ:</td>
                    <td className="border border-black p-2 text-center">-</td>
                    <td className="border border-black p-2 text-right">-</td>
                    <td className="border border-black p-2 text-right text-emerald-900 font-black">
                      {totals.totalVat.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td className="border border-black p-2 text-center font-mono text-blue-900">[34]</td>
                    <td className="border border-black p-2 text-blue-950">Tổng số thuế TNCN phải nộp trong kỳ:</td>
                    <td className="border border-black p-2 text-center">-</td>
                    <td className="border border-black p-2 text-right">-</td>
                    <td className="border border-black p-2 text-right text-blue-900 font-black">
                      {totals.totalPit.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                  <tr className="bg-amber-100 font-bold text-amber-950">
                    <td colSpan={3} className="border border-black p-2.5 uppercase">
                      [35] TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (GTGT + TNCN)
                    </td>
                    <td colSpan={2} className="border border-black p-2.5 text-right font-black text-sm text-amber-950">
                      {totals.totalTax.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : bookCode === '01-2/BK-HĐKD' ? (
            /* ── BẢNG PHỤ LỤC 01-2/BK-HĐKD (KÈM THEO TỜ KHAI 01/CNKD) ── */
            <div className="my-4 space-y-6">
              {/* Header hành chính của Phụ lục */}
              <div className="bg-zinc-50 border border-zinc-300 p-3 rounded text-[11px] space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <p>[01] Kỳ tính thuế: <span className="font-semibold">{periodLabel}</span></p>
                  <p>[02] Tên người nộp thuế: <span className="font-semibold uppercase">{info.shop_name}</span></p>
                  <p>[03] Mã số thuế: <span className="font-semibold font-mono">{info.tax_code}</span></p>
                  <p>[04] Tên đại diện: <span className="font-semibold">{info.owner_name}</span></p>
                  <p>[05] Địa chỉ kinh doanh: <span>{info.business_address}</span></p>
                  <p>[06] Số điện thoại: <span>{info.phone}</span></p>
                </div>
              </div>

              {/* PHẦN I: BẢNG KÊ VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA */}
              <div className="space-y-2">
                <h3 className="font-bold text-xs uppercase text-zinc-900 border-b border-black pb-1">
                  I. Bảng kê vật liệu, dụng cụ, sản phẩm, hàng hóa
                </h3>
                <table className="w-full border-collapse border border-black text-left text-[11px]">
                  <thead>
                    <tr className="bg-zinc-100 text-center font-bold">
                      <th rowSpan={2} className="border border-black p-1.5 w-10">STT</th>
                      <th rowSpan={2} className="border border-black p-1.5">Tên hàng hóa, dịch vụ</th>
                      <th rowSpan={2} className="border border-black p-1.5 w-14">ĐVT</th>
                      <th colSpan={2} className="border border-black p-1">Tồn đầu kỳ</th>
                      <th colSpan={2} className="border border-black p-1">Nhập trong kỳ</th>
                      <th colSpan={2} className="border border-black p-1">Xuất trong kỳ</th>
                      <th colSpan={2} className="border border-black p-1">Tồn cuối kỳ</th>
                    </tr>
                    <tr className="bg-zinc-100 text-center font-bold">
                      <th className="border border-black p-1 w-14">Lượng</th>
                      <th className="border border-black p-1 w-20">Tiền (VNĐ)</th>
                      <th className="border border-black p-1 w-14">Lượng</th>
                      <th className="border border-black p-1 w-20">Tiền (VNĐ)</th>
                      <th className="border border-black p-1 w-14">Lượng</th>
                      <th className="border border-black p-1 w-20">Tiền (VNĐ)</th>
                      <th className="border border-black p-1 w-14">Lượng</th>
                      <th className="border border-black p-1 w-20">Tiền (VNĐ)</th>
                    </tr>
                    <tr className="text-center italic text-zinc-600 bg-zinc-50/60 text-[10px]">
                      <td className="border border-black py-0.5">[07]</td>
                      <td className="border border-black py-0.5">[08]</td>
                      <td className="border border-black py-0.5">[09]</td>
                      <td className="border border-black py-0.5">[10]</td>
                      <td className="border border-black py-0.5">[11]</td>
                      <td className="border border-black py-0.5">[12]</td>
                      <td className="border border-black py-0.5">[13]</td>
                      <td className="border border-black py-0.5">[14]</td>
                      <td className="border border-black py-0.5">[15]</td>
                      <td className="border border-black py-0.5">[16]</td>
                      <td className="border border-black py-0.5">[17]</td>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="border border-black p-4 text-center italic text-zinc-500">
                          Chưa có phát sinh tồn kho vật tư trong kỳ.
                        </td>
                      </tr>
                    ) : (
                      inventoryRows.map((r, i) => (
                        <tr key={i} className="hover:bg-zinc-50">
                          <td className="border border-black p-1.5 text-center">{r.stt}</td>
                          <td className="border border-black p-1.5 font-medium">{r.item_name}</td>
                          <td className="border border-black p-1.5 text-center">{r.unit}</td>
                          <td className="border border-black p-1.5 text-right">{r.opening_qty.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.opening_amount.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.in_qty.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.in_amount.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.out_qty.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.out_amount.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right">{r.closing_qty.toLocaleString('vi-VN')}</td>
                          <td className="border border-black p-1.5 text-right font-semibold">{r.closing_amount.toLocaleString('vi-VN')}</td>
                        </tr>
                      ))
                    )}
                    <tr className="font-bold bg-zinc-100 border-t-2 border-black">
                      <td colSpan={4} className="border border-black p-2 uppercase">TỔNG CỘNG GIÁ TRỊ TỒN KHO VẬT TƯ</td>
                      <td className="border border-black p-2 text-right">
                        {inventoryRows.reduce((s, r) => s + r.opening_amount, 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="border border-black p-2 text-center">-</td>
                      <td className="border border-black p-2 text-right">
                        {inventoryRows.reduce((s, r) => s + r.in_amount, 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="border border-black p-2 text-center">-</td>
                      <td className="border border-black p-2 text-right">
                        {inventoryRows.reduce((s, r) => s + r.out_amount, 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="border border-black p-2 text-center">-</td>
                      <td className="border border-black p-2 text-right text-emerald-900 font-black">
                        {inventoryRows.reduce((s, r) => s + r.closing_amount, 0).toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* PHẦN II: BẢNG KÊ CHI PHÍ QUẢN LÝ KINH DOANH */}
              <div className="space-y-2">
                <h3 className="font-bold text-xs uppercase text-zinc-900 border-b border-black pb-1">
                  II. Bảng kê chi phí quản lý kinh doanh phát sinh trong kỳ
                </h3>
                <table className="w-full border-collapse border border-black text-left text-[11px]">
                  <thead>
                    <tr className="bg-zinc-100 text-center font-bold">
                      <th className="border border-black p-2 w-16">Chỉ tiêu</th>
                      <th className="border border-black p-2">Tên loại chi phí quản lý kinh doanh</th>
                      <th className="border border-black p-2 w-48 text-right">Số tiền phát sinh (VNĐ)</th>
                      <th className="border border-black p-2 w-48">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseSummary.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="border border-black p-4 text-center italic text-zinc-500">
                          Chưa có chi phí quản lý ghi nhận trong kỳ.
                        </td>
                      </tr>
                    ) : (
                      expenseSummary.map((exp) => (
                        <tr key={exp.indicator_code} className="hover:bg-zinc-50">
                          <td className="border border-black p-2 text-center font-mono font-bold">
                            [{exp.indicator_code}]
                          </td>
                          <td className="border border-black p-2 font-medium">{exp.name}</td>
                          <td className="border border-black p-2 text-right font-semibold">
                            {exp.amount.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="border border-black p-2 text-zinc-600 text-xs italic">{exp.note || '-'}</td>
                        </tr>
                      ))
                    )}
                    <tr className="font-bold bg-amber-100 text-amber-950 border-t-2 border-black">
                      <td colSpan={2} className="border border-black p-2.5 uppercase">
                        TỔNG CỘNG CHI PHÍ QUẢN LÝ KINH DOANH TRONG KỲ ([24] đến [30])
                      </td>
                      <td className="border border-black p-2.5 text-right font-black text-sm">
                        {expenseSummary.reduce((s, r) => s + r.amount, 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="border border-black p-2.5 text-zinc-700 text-xs italic">Toàn bộ chi phí hợp lệ</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="italic text-[11px] text-zinc-600 pt-1">
                * Cam đoan: Tôi cam đoan số liệu kê khai trên là đúng sự thật và chịu hoàn toàn trách nhiệm trước pháp luật về tính chính xác của phụ lục này.
              </p>
            </div>
          ) : (
            /* ── BẢNG CÁC SỔ S1a, S2a, S2c, S2d, S2e ── */
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse border border-black text-left text-[11px]">
                <thead>
                  <tr className="bg-zinc-100 text-center font-bold">
                    <th className="border border-black p-2 w-10">STT</th>
                    <th className="border border-black p-2 w-28">Ký hiệu chứng từ</th>
                    <th className="border border-black p-2 w-24">Ngày, tháng</th>
                    <th className="border border-black p-2">Diễn giải</th>
                    <th className="border border-black p-2 w-36">Nhóm ngành nghề</th>
                    <th className="border border-black p-2 w-28 text-right">Số tiền (VNĐ)</th>
                    <th className="border border-black p-2 w-24 text-right">Thuế GTGT</th>
                    <th className="border border-black p-2 w-24 text-right">Thuế TNCN</th>
                  </tr>
                  <tr className="text-center italic text-zinc-600 bg-zinc-50/50">
                    <td className="border border-black py-0.5">-</td>
                    <td className="border border-black py-0.5">A</td>
                    <td className="border border-black py-0.5">B</td>
                    <td className="border border-black py-0.5">C</td>
                    <td className="border border-black py-0.5">D</td>
                    <td className="border border-black py-0.5 text-right">1</td>
                    <td className="border border-black py-0.5 text-right">2</td>
                    <td className="border border-black py-0.5 text-right">3</td>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-black p-4 text-center italic text-zinc-500">
                        Chưa phát sinh giao dịch bán hàng trong kỳ này.
                      </td>
                    </tr>
                  ) : (
                    rows.slice(0, 100).map((r, i) => (
                      <tr key={r.id} className="hover:bg-zinc-50/80">
                        <td className="border border-black p-1.5 text-center">{i + 1}</td>
                        <td className="border border-black p-1.5 font-mono text-center">{r.voucher_no}</td>
                        <td className="border border-black p-1.5 text-center">{r.voucher_date}</td>
                        <td className="border border-black p-1.5">{r.description}</td>
                        <td className="border border-black p-1.5 text-zinc-800">
                          {r.group_id}. {r.group_name.slice(0, 28)}...
                        </td>
                        <td className="border border-black p-1.5 text-right font-medium">
                          {r.revenue.toLocaleString('vi-VN')}
                        </td>
                        <td className="border border-black p-1.5 text-right text-emerald-800">
                          {r.vat_amount.toLocaleString('vi-VN')}
                        </td>
                        <td className="border border-black p-1.5 text-right text-blue-800">
                          {r.pit_amount.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Phân nhóm Tổng Hợp Theo Ngành Nghề (Mẫu chuẩn S2a-HKD) */}
                  <tr className="bg-zinc-100 font-bold border-t-2 border-black">
                    <td colSpan={5} className="border border-black p-2 uppercase">
                      TỔNG CỘNG DOANH THU BÁN HÀNG TRONG KỲ
                    </td>
                    <td className="border border-black p-2 text-right">
                      {totals.totalRevenue.toLocaleString('vi-VN')}
                    </td>
                    <td className="border border-black p-2 text-right text-emerald-900">
                      {totals.totalVat.toLocaleString('vi-VN')}
                    </td>
                    <td className="border border-black p-2 text-right text-blue-900">
                      {totals.totalPit.toLocaleString('vi-VN')}
                    </td>
                  </tr>

                  {/* Chi tiết từng nhóm ngành nghề */}
                  {summary.map((s) => (
                    <tr key={s.group_id} className="bg-zinc-50/50">
                      <td colSpan={4} className="border border-black p-1.5 pl-6 italic">
                        - Nhóm {s.group_id}: {s.group_name} (GTGT {s.vat_percent}%, TNCN {s.pit_percent}%)
                      </td>
                      <td className="border border-black p-1.5 text-center text-xs">
                        {s.count} giao dịch
                      </td>
                      <td className="border border-black p-1.5 text-right font-semibold">
                        {s.total_revenue.toLocaleString('vi-VN')}
                      </td>
                      <td className="border border-black p-1.5 text-right">
                        {s.total_vat.toLocaleString('vi-VN')}
                      </td>
                      <td className="border border-black p-1.5 text-right">
                        {s.total_pit.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}

                  {/* Tổng Thuế Phải Nộp Vào NSNN */}
                  <tr className="bg-amber-100 font-bold text-amber-950">
                    <td colSpan={5} className="border border-black p-2">
                      TỔNG SỐ NGHĨA VỤ THUẾ PHẢI NỘP NGÂN SÁCH NHÀ NƯỚC (GTGT + TNCN):
                    </td>
                    <td colSpan={3} className="border border-black p-2 text-right text-sm">
                      {totals.totalTax.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Phần Chữ Ký Người Đại Diện Hộ Kinh Doanh */}
          <div className="grid grid-cols-2 gap-8 pt-8 pb-12 text-center text-xs break-inside-avoid">
            <div>
              <p className="font-bold">Người ghi sổ</p>
              <p className="italic text-zinc-500 mb-16">(Ký, họ và tên)</p>
              <p className="font-semibold text-zinc-800">Kế Toán Tiệm Bánh</p>
            </div>

            <div>
              <p className="italic mb-1">{dateStr}</p>
              <p className="font-bold uppercase">Người đại diện hộ kinh doanh</p>
              <p className="italic text-zinc-500 mb-16">(Ký, ghi rõ họ tên và đóng dấu nếu có)</p>
              <p className="font-bold text-sm uppercase text-zinc-900">{info.owner_name}</p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
