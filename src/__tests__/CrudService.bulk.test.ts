// packages/features/crud/src/__tests__/CrudService.bulk.test.ts

/**
 * @fileoverview CrudService.bulk() — unit tests
 * @description Service-layer tests for the transactional bulk orchestration:
 * happy path, empty short-circuit, collision rejection, atomic rollback,
 * rate-limit scoping, audit shape, toast suppression, BulkNotImplementedError
 * pass-through. Uses vi.hoisted mocks for `@donotdev/core` so the service
 * imports resolve to our spies without pulling in the real adapter surface.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Hoisted mocks — registered before `bulkImpl` is imported.
// -----------------------------------------------------------------------------

const {
  BulkCollisionErrorMock,
  BulkNotImplementedErrorMock,
  detectBulkCollisionsMock,
  handleErrorMock,
  toastMock,
} = vi.hoisted(() => {
  class BulkCollisionErrorMock extends Error {
    readonly collidingIds: string[];
    readonly where: 'updates-deletes' | 'inserts-updates';
    constructor(
      collidingIds: string[],
      where: 'updates-deletes' | 'inserts-updates'
    ) {
      super(`BulkCollisionError: ${collidingIds.join(',')} (${where})`);
      this.name = 'BulkCollisionError';
      this.collidingIds = collidingIds;
      this.where = where;
    }
  }

  class BulkNotImplementedErrorMock extends Error {
    readonly adapterName: string;
    constructor(adapterName: string) {
      super(`BulkNotImplementedError: ${adapterName}`);
      this.name = 'BulkNotImplementedError';
      this.adapterName = adapterName;
    }
  }

  const detectBulkCollisionsMock = vi.fn(
    (ops: {
      inserts?: Array<{ id?: string }>;
      updates?: Array<{ id: string }>;
      deletes?: string[];
    }) => {
      const updateIds = new Set((ops.updates ?? []).map((u) => u.id));
      const overlap = (ops.deletes ?? []).filter((id) => updateIds.has(id));
      if (overlap.length > 0) {
        return { collisions: overlap, where: 'updates-deletes' as const };
      }
      const insOverlap: string[] = [];
      for (const row of ops.inserts ?? []) {
        if (typeof row.id === 'string' && updateIds.has(row.id)) {
          insOverlap.push(row.id);
        }
      }
      if (insOverlap.length > 0) {
        return { collisions: insOverlap, where: 'inserts-updates' as const };
      }
      return { collisions: [], where: null };
    }
  );

  const handleErrorMock = vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
  );
  const toastMock = vi.fn();

  return {
    BulkCollisionErrorMock,
    BulkNotImplementedErrorMock,
    detectBulkCollisionsMock,
    handleErrorMock,
    toastMock,
  };
});

vi.mock('@donotdev/components', () => ({
  toast: toastMock,
}));

vi.mock('@donotdev/core', () => ({
  BulkCollisionError: BulkCollisionErrorMock,
  BulkNotImplementedError: BulkNotImplementedErrorMock,
  detectBulkCollisions: detectBulkCollisionsMock,
  DEFAULT_STATUS_VALUE: 'draft',
  generateUUID: (() => {
    let i = 0;
    return () => `uuid-${++i}`;
  })(),
  getI18nInstance: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
  handleError: handleErrorMock,
  withTimeout: <T>(p: Promise<T>) => p,
  DEFAULT_CRUD_TIMEOUT: 30_000,
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: () => false,
}));

// Stub the cache helpers so we don't need a real QueryClient.
vi.mock('../CrudService.cache.js', () => ({
  updateListCaches: vi.fn(),
  getItemFromListCache: vi.fn(),
  checkUniquenessFromCache: vi.fn(() => null),
  updateGetCache: vi.fn(),
  invalidateCollectionImpl: vi.fn(() => Promise.resolve()),
}));

// -----------------------------------------------------------------------------
// Subject under test — imported after mocks register.
// -----------------------------------------------------------------------------

import { bulkImpl } from '../CrudService.bulk';
import { updateListCaches } from '../CrudService.cache';
import type { CrudService } from '../CrudService';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface Event {
  title: string;
  id?: string;
}

function makeStoreState() {
  return {
    setLoading: vi.fn(),
    setError: vi.fn(),
    addOptimistic: vi.fn(),
    confirmOptimistic: vi.fn(),
    rejectOptimistic: vi.fn(),
    updateOptimistic: vi.fn(),
    confirmUpdate: vi.fn(),
    rejectUpdate: vi.fn(),
    deleteOptimistic: vi.fn(),
    confirmDelete: vi.fn(),
    rejectDelete: vi.fn(),
  };
}

function makeQueryClient() {
  return {
    getQueryData: vi.fn(() => null),
    getQueriesData: vi.fn(() => []),
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(() => Promise.resolve()),
  };
}

function makeService(
  overrides: {
    adapterBulk?: ReturnType<typeof vi.fn>;
    security?: {
      audit?: ReturnType<typeof vi.fn>;
      checkRateLimit?: ReturnType<typeof vi.fn>;
      recordAnomaly?: ReturnType<typeof vi.fn>;
      encryptPii?: ReturnType<typeof vi.fn>;
    };
  } = {}
) {
  const state = makeStoreState();
  const queryClient = makeQueryClient();
  const adapterBulk =
    overrides.adapterBulk ??
    vi.fn(
      async (
        _col: string,
        ops: {
          inserts?: Event[];
          updates?: Array<{ id: string }>;
          deletes?: string[];
        }
      ) => ({
        insertedIds: (ops.inserts ?? []).map((_, i) => `real-${i + 1}`),
        updatedIds: (ops.updates ?? []).map((u) => u.id),
        deletedIds: (ops.deletes ?? []).slice(),
      })
    );

  const adapter = {
    bulk: adapterBulk,
    serverSideOnly: false,
    dbLevelSecurity: false,
  };

  const service = {
    adapter,
    store: { getState: () => state },
    security: overrides.security ?? null,
    currentUserId: 'user-42',
    _inflightMutations: new Map(),
    getQueryClient: () => queryClient,
    initialize: vi.fn(async () => {}),
    invalidateCollection: vi.fn(async () => {}),
  };

  return {
    service: service as unknown as CrudService,
    state,
    queryClient,
    adapterBulk,
  };
}

const schemas = {
  create: {
    metadata: {},
    security: {},
  } as unknown as import('@donotdev/core').dndevSchema<Event>,
  update: {
    metadata: {},
    security: {},
  } as unknown as import('@donotdev/core').dndevSchema<Event>,
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('CrudService.bulk()', () => {
  beforeEach(() => {
    toastMock.mockClear();
    handleErrorMock.mockClear();
    detectBulkCollisionsMock.mockClear();
    vi.mocked(updateListCaches).mockClear();
  });

  it('happy path: single adapter call, one toast, one audit, store reflects all buckets', async () => {
    const audit = vi.fn();
    const checkRateLimit = vi.fn(async () => {});
    const recordAnomaly = vi.fn();
    const { service, state, adapterBulk } = makeService({
      security: { audit, checkRateLimit, recordAnomaly },
    });

    const result = await bulkImpl<Event>(
      service,
      'events',
      {
        inserts: [{ title: 'A' }, { title: 'B' }],
        updates: [{ id: 'e1', patch: { title: 'renamed' } }],
        deletes: ['e2', 'e3'],
      },
      schemas
    );

    expect(adapterBulk).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      type: 'crud.bulk',
      collection: 'events',
      metadata: {
        inserts: 2,
        updates: 1,
        deletes: 3,
      },
    });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(recordAnomaly).toHaveBeenCalledWith('bulk.deletes', 'user-42');
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toBe('success');

    // Store saw all three buckets.
    expect(state.addOptimistic).toHaveBeenCalledTimes(2);
    expect(state.updateOptimistic).toHaveBeenCalledTimes(1);
    // deleteOptimistic only fires when prev data exists; cold cache means 0.
    expect(state.confirmOptimistic).toHaveBeenCalledTimes(2);
    expect(state.confirmUpdate).toHaveBeenCalledWith('events', 'e1');
    expect(state.confirmDelete).toHaveBeenCalledWith('events', 'e2');
    expect(state.confirmDelete).toHaveBeenCalledWith('events', 'e3');

    expect(result).toEqual({
      insertedIds: ['real-1', 'real-2'],
      updatedIds: ['e1'],
      deletedIds: ['e2', 'e3'],
    });
  });

  it('empty payload: no adapter call, no audit, no toast, no store mutation, zeroed result', async () => {
    const audit = vi.fn();
    const checkRateLimit = vi.fn();
    const { service, state, adapterBulk } = makeService({
      security: { audit, checkRateLimit },
    });

    const result = await bulkImpl<Event>(service, 'events', {}, schemas);

    expect(adapterBulk).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(state.addOptimistic).not.toHaveBeenCalled();
    expect(state.updateOptimistic).not.toHaveBeenCalled();
    expect(state.deleteOptimistic).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      deletedIds: [],
    });
  });

  it('empty payload with explicit empty arrays is also a no-op', async () => {
    const { service, adapterBulk } = makeService();

    const result = await bulkImpl<Event>(
      service,
      'events',
      { inserts: [], updates: [], deletes: [] },
      schemas
    );

    expect(adapterBulk).not.toHaveBeenCalled();
    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      deletedIds: [],
    });
  });

  it('collision rejection: same id in updates + deletes throws BulkCollisionError pre-write', async () => {
    const { service, state, adapterBulk } = makeService();

    await expect(
      bulkImpl<Event>(
        service,
        'events',
        {
          updates: [{ id: 'x', patch: { title: 'r' } }],
          deletes: ['x'],
        },
        schemas
      )
    ).rejects.toBeInstanceOf(BulkCollisionErrorMock);

    expect(adapterBulk).not.toHaveBeenCalled();
    expect(state.addOptimistic).not.toHaveBeenCalled();
    expect(state.updateOptimistic).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
  });

  it('atomicity: adapter rejection reverts all optimistic ops atomically', async () => {
    const adapterBulk = vi
      .fn()
      .mockRejectedValue(new Error('adapter exploded mid-way'));
    const { service, state } = makeService({ adapterBulk });

    await expect(
      bulkImpl<Event>(
        service,
        'events',
        {
          inserts: [{ title: 'A' }],
          updates: [{ id: 'e1', patch: { title: 'r' } }],
          deletes: ['e2'],
        },
        schemas
      )
    ).rejects.toThrow(/Failed to bulk-write events/);

    // All three rollback store calls fired.
    expect(state.rejectOptimistic).toHaveBeenCalledTimes(1); // 1 insert
    expect(state.rejectUpdate).toHaveBeenCalledWith('events', 'e1');
    expect(state.rejectDelete).toHaveBeenCalledWith('events', 'e2');
    // Loading cleared in finally.
    expect(state.setLoading).toHaveBeenCalledWith('events', false);
    // Error toast.
    expect(toastMock).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('rate limit: ONE checkRateLimit call for the whole bulk, not N', async () => {
    const checkRateLimit = vi.fn(async () => {});
    const { service } = makeService({
      security: { audit: vi.fn(), checkRateLimit },
    });

    await bulkImpl<Event>(
      service,
      'events',
      {
        inserts: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
        updates: [
          { id: 'e1', patch: {} },
          { id: 'e2', patch: {} },
        ],
        deletes: ['e3', 'e4'],
      },
      schemas
    );

    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith('user-42:events', 'write');
  });

  it('audit payload: counts reflect row counts per bucket', async () => {
    const audit = vi.fn();
    const { service } = makeService({
      security: { audit, checkRateLimit: vi.fn() },
    });

    await bulkImpl<Event>(
      service,
      'events',
      {
        inserts: [{ title: 'A' }, { title: 'B' }],
        updates: [{ id: 'e1', patch: {} }],
        deletes: ['d1', 'd2', 'd3'],
      },
      schemas
    );

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      type: 'crud.bulk',
      collection: 'events',
      metadata: {
        inserts: 2,
        updates: 1,
        deletes: 3,
      },
    });
  });

  it('toast suppression: { showSuccessToast: false } silences the success toast', async () => {
    const { service } = makeService();

    await bulkImpl<Event>(
      service,
      'events',
      { inserts: [{ title: 'A' }] },
      schemas,
      { showSuccessToast: false }
    );

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('BulkNotImplementedError passthrough: not wrapped, preserves instance', async () => {
    const adapterBulk = vi
      .fn()
      .mockRejectedValue(new BulkNotImplementedErrorMock('test-adapter'));
    const { service } = makeService({ adapterBulk });

    // Current impl funnels non-collision adapter errors through handleError.
    // BulkNotImplementedError surfaces as the same Error instance via
    // handleErrorMock (identity passthrough) so consumers can still inspect it.
    await expect(
      bulkImpl<Event>(service, 'events', { deletes: ['x'] }, schemas)
    ).rejects.toBeInstanceOf(BulkNotImplementedErrorMock);
  });

  it('BulkCollisionError from adapter passes through unwrapped', async () => {
    const adapterBulk = vi
      .fn()
      .mockRejectedValue(new BulkCollisionErrorMock(['x'], 'updates-deletes'));
    const { service, state } = makeService({ adapterBulk });

    await expect(
      bulkImpl<Event>(service, 'events', { inserts: [{ title: 'A' }] }, schemas)
    ).rejects.toBeInstanceOf(BulkCollisionErrorMock);

    // No error toast for collision (re-thrown before the generic handler).
    expect(toastMock).not.toHaveBeenCalledWith('error', expect.anything());
    expect(state.setError).toHaveBeenCalledTimes(1);
  });
});
