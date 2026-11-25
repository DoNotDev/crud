// packages/features/crud/src/components/form/fields/__tests__/ReferenceFieldComponent.test.tsx

/**
 * @fileoverview Regression (audit 2026-11-25 #13): the create form showed the raw key
 * "reference.placeholder": the key was missing from the crud locales.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import crudEn from '../../../../../../../core/i18n/locales/lazy/crud_en.json';
import crudFr from '../../../../../../../core/i18n/locales/lazy/crud_fr.json';

const { namespaces } = vi.hoisted(() => ({ namespaces: [] as unknown[] }));

vi.mock('@donotdev/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/core')>()),
  useTranslation: (ns: unknown) => {
    namespaces.push(ns);
    return {
      t: (key: string, options?: { label?: string }) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], crudEn);
        return typeof value === 'string'
          ? value.replace('{{label}}', options?.label ?? '')
          : key;
      },
    };
  },
}));
vi.mock('@donotdev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@donotdev/components')>()),
  Combobox: ({ placeholder, emptyMessage }: { placeholder: string; emptyMessage: string }) => (
    <output data-empty={emptyMessage}>{placeholder}</output>
  ),
}));

import ReferenceFieldComponent from '../ReferenceFieldComponent';

describe('ReferenceFieldComponent placeholder', () => {
  it('reads reference.placeholder and messages.noResults from the crud namespace', () => {
    render(
      <ReferenceFieldComponent label="Supplier" onChange={() => {}} options={[]} />
    );
    const output = screen.getByText('Select Supplier');
    expect(output.getAttribute('data-empty')).toBe('No results found');
    expect(namespaces).toContain('crud');
  });

  it('has the keys in the crud locales', () => {
    expect(crudEn.reference.placeholder).toBe('Select {{label}}');
    expect(crudFr.reference.placeholder).toContain('{{label}}');
    expect(crudFr.messages.noResults).toBeTruthy();
  });
});
