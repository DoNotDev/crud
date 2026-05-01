'use client';
// packages/features/crud/src/components/form/fields/PriceFieldComponent.tsx

/**
 * @fileoverview Price Field Component
 * @description Structured price: amount (FloatingLabel "Price (symbol)") + optional row (Currency select, VAT Incl., Discount %).
 * Value shape: { amount, currency?, vatIncluded?, discountPercent? }.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { CirclePlus, CircleMinus } from 'lucide-react';
import { useId, useState } from 'react';

import {
  Input,
  Checkbox,
  Stack,
  Select,
  CollapsiblePrimitive,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@donotdev/components';
import { useTranslation, getCurrencySymbol } from '@donotdev/core';

import type { ChangeEvent, ComponentType } from 'react';

export interface PriceValue {
  amount: number | null;
  currency?: string;
  vatIncluded?: boolean;
  discountPercent?: number;
}

export interface PriceFieldComponentProps {
  /** Field label (for amount) */
  label: string;
  /** Current value */
  value?: PriceValue | null;
  /** Change handler */
  onChange: (value: PriceValue) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Required */
  required?: boolean;
  /** Disabled */
  disabled?: boolean;
  /** Placeholder for amount */
  placeholder?: string;
  /** Default currency when value.currency is unset */
  defaultCurrency?: string;
  /** Label for collapsible section */
  optionsTitle?: string;
  /** Allowed currencies in the select; when set, only these are shown (e.g. ['EUR'] for single-currency) */
  currencies?: string[];
}

/** Default list when currencies prop is not set */
const DEFAULT_CURRENCY_OPTIONS = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'JPY',
  'KRW',
] as const;

const PriceFieldComponent: ComponentType<PriceFieldComponentProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  placeholder = '0',
  defaultCurrency = 'EUR',
  optionsTitle = 'Price options',
  currencies: currenciesProp,
}) => {
  const amountId = useId();
  const { t } = useTranslation('crud');
  const currencyOptions = currenciesProp?.length
    ? currenciesProp
    : [...DEFAULT_CURRENCY_OPTIONS];
  const currency = value?.currency ?? defaultCurrency;
  const effectiveCurrency = currencyOptions.includes(currency)
    ? currency
    : (currencyOptions[0] ?? defaultCurrency);
  const vatIncluded = value?.vatIncluded ?? true;
  const discountPercent = value?.discountPercent ?? 0;
  const amountLabel = `${label} (${getCurrencySymbol(effectiveCurrency)})`;

  const update = (partial: Partial<PriceValue>) => {
    const amount =
      partial.amount !== undefined ? partial.amount : (value?.amount ?? null);
    let currencyVal =
      partial.currency !== undefined
        ? partial.currency
        : (value?.currency ?? defaultCurrency);
    if (!currencyOptions.includes(currencyVal)) {
      currencyVal = effectiveCurrency;
    }
    const vat =
      partial.vatIncluded !== undefined
        ? partial.vatIncluded
        : (value?.vatIncluded ?? true);
    const discount =
      partial.discountPercent !== undefined
        ? partial.discountPercent
        : (value?.discountPercent ?? 0);
    onChange({
      amount: amount === null ? null : Number(amount),
      currency: currencyVal,
      vatIncluded: vat,
      discountPercent: Number(discount),
    });
  };

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === null) {
      update({ amount: null });
      return;
    }
    const num = parseFloat(raw);
    update({ amount: isNaN(num) ? null : num });
  };

  const handleCurrencyChange = (v: string) => {
    update({ currency: v || defaultCurrency });
  };

  const handleDiscountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === null) {
      update({ discountPercent: 0 });
      return;
    }
    const num = parseFloat(raw);
    update({
      discountPercent: isNaN(num) ? 0 : num,
    });
  };

  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <CollapsiblePrimitive open={optionsOpen} onOpenChange={setOptionsOpen}>
      <Stack>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'var(--gap-sm)',
            alignItems: 'end',
          }}
        >
          <Input
            id={amountId}
            type="number"
            inputMode="decimal"
            label={amountLabel}
            value={
              value?.amount !== undefined && value?.amount !== null
                ? value.amount
                : ''
            }
            onChange={handleAmountChange}
            disabled={disabled}
            placeholder={placeholder}
            required={required}
            min={0}
            step={0.01}
            data-variant={error ? 'destructive' : undefined}
            aria-invalid={error}
          />
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={optionsTitle}
              aria-expanded={optionsOpen}
              className="dndev-collapsible-trigger"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--gap-sm)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {optionsOpen ? (
                <CircleMinus
                  className="dndev-collapsible-icon"
                  aria-hidden="true"
                />
              ) : (
                <CirclePlus
                  className="dndev-collapsible-icon"
                  aria-hidden="true"
                />
              )}
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="dndev-collapsible-content">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                currencyOptions.length > 1 ? '1fr auto 1fr' : 'auto 1fr',
              gap: 'var(--gap-sm)',
              alignItems: 'end',
              paddingTop: 'var(--gap-md)',
            }}
          >
            {currencyOptions.length > 1 && (
              <Select
                value={effectiveCurrency}
                onValueChange={handleCurrencyChange}
                placeholder={defaultCurrency}
                options={currencyOptions.map((c) => ({ value: c, label: c }))}
                disabled={disabled}
                label={t('price.currency', { defaultValue: 'Currency' })}
              />
            )}
            <Checkbox
              id={`${amountId}-vat`}
              label={t('price.vatIncluded', { defaultValue: 'VAT Incl.' })}
              checked={vatIncluded}
              onCheckedChange={(checked) =>
                update({ vatIncluded: checked === true })
              }
              disabled={disabled}
            />
            <Input
              id={`${amountId}-discount`}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={1}
              value={discountPercent === 0 ? '' : discountPercent}
              onChange={handleDiscountChange}
              disabled={disabled}
              placeholder="0"
              label={t('price.discountLabel', { defaultValue: 'Discount (%)' })}
            />
          </div>
        </CollapsibleContent>
      </Stack>
      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
    </CollapsiblePrimitive>
  );
};

export default PriceFieldComponent;
