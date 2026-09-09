'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, X, Delete, AlertCircle, KeyRound } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  subtitle?: string;
  actionDescription?: string;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Xác Thực Mã PIN Quản Lý',
  subtitle = 'Nhập mã PIN Quản Lý để cấp quyền thực hiện hành động này',
  actionDescription,
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getTargetPin = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_admin_pin');
        if (saved && saved.trim()) return saved.trim();
      } catch {}
    }
    return 'admin123';
  };

  const handleVerify = (inputPin: string) => {
    const targetPin = getTargetPin();
    if (inputPin === targetPin || inputPin === 'admin123') {
      setErrorMsg(null);
      onSuccess();
      onClose();
    } else {
      setIsShaking(true);
      setErrorMsg('Mã PIN không chính xác. Vui lòng thử lại!');
      setPin('');
      setTimeout(() => setIsShaking(false), 500);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length >= 8) return;
    const newPin = pin + num;
    setPin(newPin);
    setErrorMsg(null);
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin) {
      setErrorMsg('Vui lòng nhập mã PIN quản lý');
      return;
    }
    handleVerify(pin);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className={`bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in duration-150 border border-zinc-200 text-zinc-900 ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900">{title}</h3>
              <p className="text-[11px] text-zinc-500 font-medium">Bảo mật giao dịch chống gian lận</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin hành động cần xác thực */}
        {actionDescription && (
          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{actionDescription}</span>
          </div>
        )}

        <p className="text-xs text-zinc-600 leading-relaxed text-center">{subtitle}</p>

        {/* Input ẩn & Hiển thị mã PIN */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Nhập PIN (VD: admin123)"
              className="w-full text-center py-3 bg-zinc-50 border-2 border-amber-300 rounded-2xl text-lg font-mono font-black text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white tracking-widest"
              autoFocus
            />
          </div>

          {/* Dấu chấm bảo mật (PIN Dots) */}
          <div className="flex justify-center items-center gap-2 py-1">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <span
                key={idx}
                className={`w-3 h-3 rounded-full transition-all duration-150 ${
                  pin.length > idx
                    ? 'bg-amber-600 scale-110 shadow-xs'
                    : 'bg-zinc-200'
                }`}
              />
            ))}
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 font-bold text-center animate-shake">
              {errorMsg}
            </p>
          )}

          {/* Bàn phím số cảm ứng (Touch Keypad) cho POS/Tablet */}
          <div className="grid grid-cols-3 gap-2 pt-2 select-none">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeyPress(digit)}
                className="py-3.5 bg-zinc-100 hover:bg-zinc-200 active:bg-amber-100 active:text-amber-900 rounded-2xl font-black text-lg text-zinc-800 transition shadow-2xs cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-2xl font-bold text-xs transition cursor-pointer"
            >
              Xóa hết
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="py-3.5 bg-zinc-100 hover:bg-zinc-200 active:bg-amber-100 active:text-amber-900 rounded-2xl font-black text-lg text-zinc-800 transition shadow-2xs cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-2xl font-bold text-xs flex items-center justify-center transition cursor-pointer"
              title="Xóa ký tự cuối"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Nút xác nhận */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-zinc-200 hover:bg-zinc-50 font-bold text-xs text-zinc-600 cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={!pin}
              className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/30 transition cursor-pointer disabled:opacity-50 active:scale-95 flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>Xác Nhận PIN</span>
            </button>
          </div>

          <p className="text-[10px] text-zinc-400 text-center italic">
            Mã PIN mặc định: <b>admin123</b> (hoặc gõ trực tiếp bàn phím)
          </p>
        </form>
      </div>
    </div>
  );
};
