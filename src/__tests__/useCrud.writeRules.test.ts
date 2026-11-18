// packages/features/crud/src/__tests__/useCrud.writeRules.test.ts

/**
 * @fileoverview useCrud set / add / update / remove — the CRUD rules
 * @description The hook applies no rule itself: it hands the payload as given to the
 * service, which runs the CRUD rules (core/schemas crud/) on the entity's schemas
 * (`entitySchemasOf`); `remove(id)` is the service's logical delete (no schemas).
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { eventEntity } from '@dndev/test-entities';

// -----------------------------------------------------------------------------
// Hoisted shared state — the fake service + spy.
// -----------------------------------------------------------------------------

const { bulkSpy, fakeService, setHasService, getCrudServiceInstanceMock, stored, validateSpy } =
  vi.hoisted(() => {
    const validateSpy = vi.fn((_schema: unknown, data: unknown) => data);
    const stored: { row: Record<string, unknown> | undefined } = { row: undefined };
    const bulkSpy = vi.fn(async () => ({
      insertedIds: ['srv-1'],
      updatedIds: [],
      deletedIds: [],
    }));
    const fakeService = {
      bulk: bulkSpy,
      set: vi.fn(async () => {}),
      add: vi.fn(async () => 'new-id'),
      update: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      getQueryClient: vi.fn(() => ({
        getQueryData: () => stored.row,
        getQueriesData: () => [],
      })),
      bulkAcross: vi.fn(async () => ({ results: {} })),
      initialize: vi.fn(async () => {}),
      attachProvider: vi.fn(() => true),
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
      stored,
      validateSpy,
    };
  });

// -----------------------------------------------------------------------------
// Mocks — registered before importing useCrud.
// -----------------------------------------------------------------------------

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', async () => {
  const CRUD_OPERATORS = { EQ: '==' };
  const { entersVisibleStatus, statusOf, writeSchemaFor } = await import('../../../../core/schemas/src/common/crud/status');
  return {
    entersVisibleStatus,
    statusOf,
    validateWithSchema: validateSpy,
    writeSchemaFor,
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
    AtomicBulkError: class extends Error {
      constructor(message: string, public outcome: string) { super(message); this.name = 'AtomicBulkError'; }
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

import { useCrud } from '../useCrud';

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

function api() {
  const { result } = renderHook(() => useCrud(eventEntity));
  const crud = result.current as ReturnType<typeof useCrud>;
  if (typeof crud === 'string') throw new Error('unexpected status return');
  return crud;
}

describe('useCrud — the CRUD rules run in the service, on the entity schemas', () => {
  beforeEach(() => {
    fakeService.set.mockClear();
    fakeService.add.mockClear();
    fakeService.update.mockClear();
    fakeService.remove.mockClear();
    setHasService(true);
  });

  // The service resolves the entity's schemas itself (`entitySchemasOf`); the hook passes
  // the payload untouched (no default status, no validation) and the entity's schema.
  it('add, set, update hand the payload as given to the service', async () => {
    await api().add({ title: 'A', status: 'draft' } as never);
    await api().set('e1', { title: 'A' } as never);
    await api().update('e1', { title: 'B' } as never);
    const create = expect.objectContaining({ __schema: 'create', entity: eventEntity.name });
    const update = expect.objectContaining({ __schema: 'update', entity: eventEntity.name });
    expect(fakeService.add).toHaveBeenCalledWith('events', { title: 'A', status: 'draft' }, create, expect.anything());
    expect(fakeService.set).toHaveBeenCalledWith('events', 'e1', { title: 'A' }, create, expect.anything());
    expect(fakeService.update).toHaveBeenCalledWith('events', 'e1', { title: 'B' }, update, expect.anything());
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('remove: the service logical delete', async () => {
    await api().remove('e1');
    expect(fakeService.remove).toHaveBeenCalledWith('events', 'e1');
  });
});
