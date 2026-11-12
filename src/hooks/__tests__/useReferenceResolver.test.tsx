// packages/features/crud/src/hooks/__tests__/useReferenceResolver.test.tsx

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression: reference columns showed raw ids because the resolver queried the
// referenced collection by name only (no schema → no query). The referenced
// entity is now resolved from defineEntity's registry, with no app wiring.

const { listSpy, fakeService } = vi.hoisted(() => {
  const listSpy = vi.fn((collection: string, opts: unknown) => ({
    queryKey: ['crud', collection, 'query', JSON.stringify(opts)],
    queryFn: async () => ({ items: [{ id: 'b1', name: 'Acme' }], total: 1 }),
    staleTime: Infinity,
  }));
  const fakeService = {
    attachProvider: () => true,
    setStore: () => {},
    initialize: async () => {},
    getListQueryOptions: listSpy,
    bindRequestAccessToken: () => false,
  };
  return { listSpy, fakeService };
});

vi.mock('../../CrudService', () => ({
  getCrudService: () => fakeService,
}));
vi.mock('@donotdev/core', async (orig) => ({
  ...(await orig<object>()),
  useFeatureConsent: () => true,
}));

import { defineEntity } from '@donotdev/core';

import { useReferenceResolver } from '../useReferenceResolver';

defineEntity({
  name: 'Brand',
  collection: 'brands',
  fields: {
    name: { name: 'name', label: 'n', type: 'text', visibility: 'guest', validation: { required: true } },
  },
});
const product = defineEntity({
  name: 'Product',
  collection: 'products',
  fields: {
    brandId: {
      name: 'brandId',
      label: 'b',
      type: 'reference',
      visibility: 'guest',
      validation: { required: true, reference: 'brands' },
      options: { fieldSpecific: { displayField: 'name' } },
    },
    supplierId: {
      name: 'supplierId',
      label: 's',
      type: 'reference',
      visibility: 'guest',
      validation: { reference: 'suppliers' },
    },
  },
});

const wrapper = () => {
  const qc = new QueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

describe('useReferenceResolver', () => {
  beforeEach(() => listSpy.mockClear());

  it('resolves reference ids to labels using the defined entity', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useReferenceResolver(product), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(result.current).toEqual({ brands: { b1: 'Acme' } })
    );
    expect(listSpy.mock.calls.map((c) => c[0])).toEqual(['brands']);
    warn.mockRestore();
  });

  it('keeps raw ids for a collection with no entity, without querying it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useReferenceResolver(product), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.brands).toBeDefined());
    expect(result.current.suppliers).toBeUndefined();
    expect(listSpy.mock.calls.map((c) => c[0])).not.toContain('suppliers');
    warn.mockRestore();
  });
});
