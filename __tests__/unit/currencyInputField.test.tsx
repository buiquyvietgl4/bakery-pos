import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CurrencyInputField from '@/components/admin/CurrencyInputField';

describe('CurrencyInputField', () => {
  it('hiển thị định dạng tiền tệ có dấu chấm khi không focus', () => {
    const handleChange = vi.fn();
    render(<CurrencyInputField value={20000} onChange={handleChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('20.000');
  });

  it('khi focus hiển thị số thuần để gõ không bị vấp dấu chấm hay lặp phím', () => {
    const handleChange = vi.fn();
    render(<CurrencyInputField value={20000} onChange={handleChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe('20000');
  });

  it('khi người dùng gõ 20000 gọi onChange với số 20000 chuẩn xác', () => {
    let currentValue = 0;
    const TestComponent = () => {
      const [val, setVal] = useState(0);
      return (
        <CurrencyInputField
          value={val}
          onChange={(n) => {
            currentValue = n;
            setVal(n);
          }}
        />
      );
    };

    render(<TestComponent />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '20000' } });
    expect(currentValue).toBe(20000);
    expect(input.value).toBe('20000');

    // Khi blur, tự động định dạng lại thành 20.000
    fireEvent.blur(input);
    expect(input.value).toBe('20.000');
  });

  it('nút xóa (X) đặt lại giá trị về 0 ngay lập tức', () => {
    let currentValue = 20000;
    const TestComponent = () => {
      const [val, setVal] = useState(20000);
      return (
        <CurrencyInputField
          value={val}
          onChange={(n) => {
            currentValue = n;
            setVal(n);
          }}
        />
      );
    };

    render(<TestComponent />);
    const clearBtn = screen.getByTitle('Xóa để nhập lại');
    fireEvent.click(clearBtn);
    expect(currentValue).toBe(0);
  });
});
