// packages/features/crud/src/__tests__/useCrud.bulk.integration.test.ts

/**
 * @fileoverview useCrud().bulk — hook-level smoke integration test
 * @description Verifies the `bulk` method wired up by `useCrud` delegates to
 * the bound `CrudService` instance with the correct collection + schemas, and
 * that its `useCallback` dependency list behaves like `addFn`'s (stable across
 * renders, rebuilds on `scope.provider` change). Heavy React + Zustand +
 * feature-consent plumbing is stubbed via `vi.hoisted` so the hook resolves
 * against an in-memory fake service.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Hoisted shared state — the fake service + spy.
// -----------------------------------------------------------------------------

const { bulkSpy, fakeService, setHasService, getCrudServiceInstanceMock } =
  vi.hoisted(() => {
    const bulkSpy = vi.fn(async () => ({
      insertedIds: ['srv-1'],
      updatedIds: [],
      deletedIds: [],
    }));
    const fakeService = {
      bulk: bulkSpy,
      initialize: vi.fn(async () => {}),
      setStore: vi.fn(),
    };
    let hasService = true;
    const setHasService = (v: boolean) => {
      hasService = v;
    };
    const getCrudServiceInstanceMock = vi.fn(() =>
      hasService ? fakeService : null
    );
    return {
      bulkSpy,
      fakeService,
      setHasService,
      getCrudServiceInstanceMock,
    };
  });

// -----------------------------------------------------------------------------
// Mocks — registered before importing useCrud.
// -----------------------------------------------------------------------------

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', () => {
  const CRUD_OPERATORS = { EQ: '==' };
  return {
    FEATURE_STATUS: {
      INITIALIZING: 'initializing',
      READY: 'ready',
      DEGRADED: 'degraded',
      ERROR: 'error',
    },
    FRAMEWORK_FEATURES: { CRUD: 'crud' },
    DEGRADED_CRUD_API: {
      status: 'degraded',
      data: null,
      loading: false,
      error: null,
      get: async () => null,
      set: async () => {},
      update: async () => {},
      delete: async () => {},
      add: async () => '',
      query: async () => [],
      subscribe: () => () => {},
      subscribeToCollection: () => () => {},
      invalidate: async () => {},
      isAvailable: false,
    },
    handleError: vi.fn((e) => e),
    isClient: () => true,
    useFeatureConsent: () => true,
    createSchemas: (entity: { name: string }) => ({
      create: { __schema: 'create', entity: entity.name },
      draft: { __schema: 'draft' },
      update: { __schema: 'update', entity: entity.name },
      get: { __schema: 'get' },
      list: { __schema: 'list' },
      listCard: { __schema: 'listCard' },
      delete: { __schema: 'delete' },
    }),
    getGlobalSingleton: (_k: string, factory: () => unknown) => factory(),
    getScopeValue: (provider: string) => `${provider}-value`,
    CRUD_OPERATORS,
  };
});

// Stub the CrudStore — the hook subscribes to it; we return static values.
vi.mock('../CrudStore', () => ({
  useCrudStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ crudService: {}, collections: {} }),
    {
      getState: () => ({
        crudService: {},
        setCrudService: vi.fn(),
      }),
    }
  ),
}));

// Short-circuit CrudService.getCrudService — we never need the real singleton.
vi.mock('../CrudService', () => ({
  getCrudService: () => fakeService,
}));

// The hook reads the service via this internal getter — swap it with our spy.
vi.mock('../useCrud', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../useCrud')>();
  return {
    ...mod,
    getCrudServiceInstance: getCrudServiceInstanceMock,
  };
});

// -----------------------------------------------------------------------------
// Subject — React hook under test.
// -----------------------------------------------------------------------------

import { renderHook } from '@testing-library/react';
import type { Entity } from '@donotdev/core';

import { useCrud } from '../useCrud';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const eventEntity = {
  name: 'Event',
  collection: 'events',
  fields: {},
} as unknown as Entity;

const scopedEntity = {
  name: 'Event',
  collection: 'events',
  fields: {},
  scope: { field: 'companyId', provider: 'company-a' },
} as unknown as Entity;

const scopedEntityB = {
  name: 'Event',
  collection: 'events',
  fields: {},
  scope: { field: 'companyId', provider: 'company-b' },
} as unknown as Entity;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('useCrud().bulk — hook integration', () => {
  beforeEach(() => {
    bulkSpy.mockClear();
    getCrudServiceInstanceMock.mockClear();
    setHasService(true);
  });

  it('renders without error and exposes bulk as a function', () => {
    const { result } = renderHook(() => useCrud(eventEntity));

    expect(result.current).toBeTruthy();
    const api = result.current as ReturnType<typeof useCrud>;
    // Narrow by checking it's an object (not the FeatureStatus overload result).
    if (typeof api === 'string') throw new Error('unexpected status return');
    expect(typeof api.bulk).toBe('function');
  });

  it('delegates bulk(ops) to crudService.bulk with the bound collection + schemas', async () => {
    const { result } = renderHook(() => useCrud(eventEntity));
    const api = result.current as ReturnType<typeof useCrud>;
    if (typeof api === 'string') throw new Error('unexpected status return');

    await api.bulk({
      inserts: [{ title: 'A' }],
      updates: [{ id: 'e1', patch: { title: 'r' } }],
      deletes: ['e2'],
    });

    expect(bulkSpy).toHaveBeenCalledTimes(1);
    const [collection, ops, schemasArg] = bulkSpy.mock.calls[0] as [
      string,
      { inserts: unknown[]; updates: unknown[]; deletes: string[] },
      { create: unknown; update: unknown },
    ];
    expect(collection).toBe('events');
    expect(ops.inserts).toEqual([{ title: 'A' }]);
    expect(ops.updates).toEqual([{ id: 'e1', patch: { title: 'r' } }]);
    expect(ops.deletes).toEqual(['e2']);
    expect(schemasArg).toMatchObject({
      create: { __schema: 'create' },
      update: { __schema: 'update' },
    });
  });

  it('bulk reference is stable across re-renders when entity/scope unchanged', () => {
    const { result, rerender } = renderHook(() => useCrud(eventEntity));

    const api1 = result.current as ReturnType<typeof useCrud>;
    if (typeof api1 === 'string') throw new Error('unexpected');
    const firstBulk = api1.bulk;

    rerender();
    const api2 = result.current as ReturnType<typeof useCrud>;
    if (typeof api2 === 'string') throw new Error('unexpected');

    expect(api2.bulk).toBe(firstBulk);
  });

  it('bulk reference changes when scope.provider changes (matches addFn deps)', () => {
    const { result, rerender } = renderHook(
      ({ entity }: { entity: Entity }) => useCrud(entity),
      { initialProps: { entity: scopedEntity } }
    );

    const api1 = result.current as ReturnType<typeof useCrud>;
    if (typeof api1 === 'string') throw new Error('unexpected');
    const firstBulk = api1.bulk;

    rerender({ entity: scopedEntityB });
    const api2 = result.current as ReturnType<typeof useCrud>;
    if (typeof api2 === 'string') throw new Error('unexpected');

    expect(api2.bulk).not.toBe(firstBulk);
  });

  it('bulk injects scope into inserts when entity has a scope provider', async () => {
    const { result } = renderHook(() => useCrud(scopedEntity));
    const api = result.current as ReturnType<typeof useCrud>;
    if (typeof api === 'string') throw new Error('unexpected');

    await api.bulk({ inserts: [{ title: 'A' }, { title: 'B' }] });

    const [, ops] = bulkSpy.mock.calls[0] as [
      string,
      { inserts: Array<{ title: string; companyId?: string }> },
    ];
    expect(ops.inserts[0]).toMatchObject({
      title: 'A',
      companyId: 'company-a-value',
    });
    expect(ops.inserts[1]).toMatchObject({
      title: 'B',
      companyId: 'company-a-value',
    });
  });
});
