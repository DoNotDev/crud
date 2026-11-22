// packages/features/crud/src/__tests__/useCrudList.translate.test.tsx

/**
 * @fileoverview useCrudList / useCrudCardList — `translate` option
 * @description Regression: both hooks built the options of `useBaseCrudList` without
 * `translate`, so `translate: false` was ignored and rows were always translated.
 * `translate: false` returns rows as stored; the default translates.
 *
 * @version 0.1.0
 * @since 0.3.2
 * @author AMBROISE PARK Consulting
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { carEntity } from '@dndev/test-entities';

// -----------------------------------------------------------------------------
// Hoisted state — fake service, test-controlled environment.
// -----------------------------------------------------------------------------

const { fakeService, env } = vi.hoisted(() => {
  const fakeService = {
    getListQueryOptions: (collection: string, _o: unknown, _s: unknown, _c: unknown, schemaType: string) => ({
      queryKey: ['crud', collection, schemaType] as const,
      queryFn: async () => ({
        items: [
          {
            id: 'c1',
            model: 'Berline',
            modelI18n: { en: 'Sedan', de: '' },
            price: 5,
          },
        ],
      }),
      staleTime: Infinity,
    }),
  };
  const env = { language: 'en' };
  return { fakeService, env };
});

vi.mock('@donotdev/core', async () => {
  const rq = await import('@tanstack/react-query');
  const translations = await import(
    '../../../../core/utils/src/common/entityTranslations'
  );
  return {
    useTranslation: () => ({ language: env.language }),
    getTranslatedFieldNames: translations.getTranslatedFieldNames,
    translateRow: translations.translateRow,
    isClient: () => true,
    hasProvider: () => false,
    useAuthSessionSnapshot: () => null,
    useQuery: rq.useQuery,
    useQueryClient: rq.useQueryClient,
  };
});

vi.mock('../useCrud', () => ({
  useCrud: (arg: unknown) =>
    arg === 'status'
      ? 'ready'
      : {
          _collection: 'cars',
          _schemas: { get: {} },
          _cacheOptions: {},
          _scope: undefined,
          invalidate: async () => {},
          error: null,
        },
  getCrudServiceInstance: () => fakeService,
  EMPTY_OPTIMISTIC: {},
}));

vi.mock('../CrudStore', () => ({
  useCrudStore: (selector: (s: { collections: object }) => unknown) =>
    selector({ collections: {} }),
}));

vi.mock('../hooks/useCrudFilters', () => ({
  useCrudFilters: () => ({ filters: {} }),
}));

// -----------------------------------------------------------------------------
// Subjects — imported after mocks register.
// -----------------------------------------------------------------------------

import { useCrudCardList } from '../useCrudCardList';
import { useCrudList } from '../useCrudList';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  env.language = 'en';
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

const hooks = [
  ['useCrudList', useCrudList],
  ['useCrudCardList', useCrudCardList],
] as const;

describe.each(hooks)('%s translated fields', (_name, useList) => {
  type Row = { model?: string; modelI18n?: unknown };
  const render = (options?: { translate?: boolean }) =>
    renderHook(
      () => useList(carEntity, options) as { items: Row[] },
      { wrapper }
    );

  it('translates rows by default', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.items[0]?.model).toBe('Sedan'));
  });

  it('returns rows as stored with translate: false', async () => {
    const { result } = render({ translate: false });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]?.model).toBe('Berline');
    expect(result.current.items[0]?.modelI18n).toEqual({ en: 'Sedan', de: '' });
  });
});
