'use client';

import React, { useState, useEffect } from 'react';
import { formatCurrencyInput } from '@/lib/utils/formatCurrency';

interface CurrencyInputFieldProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  showClearButton?: boolean;
  unitSuffix?: string;
}

export default function CurrencyInputField({
  value,
  onChange,
  placeholder = 'VD: 20.000',
  className = '',
  required = false,
  autoFocus = false,
  showClearButton = true,
  unitSuffix,
}: CurrencyInputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState<string>('');

  // Khi không focus, hiển thị chuỗi định dạng có dấu chấm phân cách hàng nghìn (20.000)
  // Khi đang focus, hiển thị số thuần để gõ mượt mà, không bị nhảy con trỏ và không bị UniKey lặp ký tự đầu
  const displayValue = isFocused ? localText : formatCurrencyInput(value);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setLocalText(value > 0 ? String(value) : '');
    // Select all text khi focus
    e.currentTarget.select();
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Đảm bảo sau sự kiện mouseup của trình duyệt, toàn bộ số vẫn được bôi đen để gõ số mới sẽ thay thế số cũ
    e.currentTarget.select();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Lọc chỉ giữ chữ số
    const cleanDigits = raw.replace(/\D/g, '');
    setLocalText(cleanDigits);
    const num = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    onChange(num);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const num = localText ? parseInt(localText.replace(/\D/g, ''), 10) : 0;
    onChange(num);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        required={required}
        autoFocus={autoFocus}
        value={displayValue}
        onFocus={handleFocus}
        onClick={handleClick}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
      {unitSuffix && !showClearButton && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-xs pointer-events-none">
          {unitSuffix}
        </span>
      )}
      {showClearButton && value > 0 && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLocalText('');
            onChange(0);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-xs font-bold"
          title="Xóa để nhập lại"
        >
          ✕
        </button>
      )}
    </div>
  );
}
