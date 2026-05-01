import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import CurrencyFieldComponent from '../CurrencyFieldComponent';

// Mock @donotdev/components
vi.mock('@donotdev/components', () => ({
  Input: ({ value, onChange, onFocus, onBlur, ...props }: any) => (
    <input
      data-testid="currency-input"
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    />
  ),
  FloatingLabel: ({ children, label }: any) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
  Stack: ({ children }: any) => <div>{children}</div>,
}));

describe('CurrencyFieldComponent', () => {
  it('does NOT force .00 on initial render for whole numbers', () => {
    const onChange = vi.fn();
    render(
      <CurrencyFieldComponent
        label="Price"
        value={1000} // $10.00
        onChange={onChange}
      />
    );

    const input = screen.getByTestId('currency-input') as HTMLInputElement;
    expect(input.value).toBe('10');
  });

  it('keeps "10.5" without forcing "10.50"', () => {
    const onChange = vi.fn();
    render(
      <CurrencyFieldComponent
        label="Price"
        value={1050} // $10.50
        onChange={onChange}
      />
    );

    const input = screen.getByTestId('currency-input') as HTMLInputElement;
    expect(input.value).toBe('10.5');
  });

  it('maintains input during typing by avoiding auto-formatting while focused', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CurrencyFieldComponent
        label="Price"
        value={undefined}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    );

    const input = screen.getByTestId('currency-input') as HTMLInputElement;

    // Focus first
    fireEvent.focus(input);

    // Type '1'
    fireEvent.change(input, { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(100);

    // Parent updates value to 100
    rerender(
      <CurrencyFieldComponent label="Price" value={100} onChange={onChange} />
    );

    // Value should stay '1' (not '1.00')
    expect(input.value).toBe('1');

    // Type '.'
    fireEvent.change(input, { target: { value: '1.' } });
    expect(onChange).toHaveBeenCalledWith(100);

    // Parent updates value to 100
    rerender(
      <CurrencyFieldComponent label="Price" value={100} onChange={onChange} />
    );

    // Value should stay '1.' (not '1')
    expect(input.value).toBe('1.');
  });

  it('formats correctly on blur', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CurrencyFieldComponent label="Price" value={100} onChange={onChange} />
    );

    const input = screen.getByTestId('currency-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10.5' } });

    // Prop updates to 1050
    rerender(
      <CurrencyFieldComponent label="Price" value={1050} onChange={onChange} />
    );
    expect(input.value).toBe('10.5');

    // Blur - in my new implementation, on blur we update displayValue from value
    fireEvent.blur(input);

    // formatValue(1050) is "10.5" now.
    expect(input.value).toBe('10.5');
  });
});
