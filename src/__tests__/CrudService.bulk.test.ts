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
  withTimeoutMock,
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
    withTimeoutMock: vi.fn(<T>(p: Promise<T>) => p),
  };
});

vi.mock('@donotdev/components', () => ({
  toast: toastMock,
}));

vi.mock('@donotdev/core', async () => ({
  ...await import('../../../../core/schemas/src/common/crud/bulk'),
  ...await import('../../../../core/schemas/src/common/crud/status'),
  // The CRUD rules run for real (core/schemas crud/).
  ...await import('../../../../core/schemas/src/common/crud/create'),
  ...await import('../../../../core/schemas/src/common/crud/update'),
  ...await import('../../../../core/schemas/src/common/crud/prepared'),
  // The entities the rules resolve by collection (shared test entities).
  ...await import('../../../../core/schemas/src/common/entityRegistry'),
  createSchemas: (await import('../../../../core/schemas/src/common/createSchema')).createSchemas,
  DoNotDevError: (await import('../../../../core/types/src/errors/errorClasses')).DoNotDevError,
  BulkCollisionError: BulkCollisionErrorMock,
  BulkNotImplementedError: BulkNotImplementedErrorMock,
  detectBulkCollisions: detectBulkCollisionsMock,
  DEFAULT_STATUS_VALUE: 'available',
  generateUUID: (() => {
    let i = 0;
    return () => `uuid-${++i}`;
  })(),
  getI18nInstance: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
  handleError: handleErrorMock,
  withTimeout: withTimeoutMock,
  DEFAULT_CRUD_TIMEOUT: 30_000,
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: () => false,
  // Schema validation is covered by its own tests; bulk orchestration only.
  validateWithSchema: (_schema: unknown, data: unknown) => data,
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

import { eventEntity, piiEventEntity } from '@dndev/test-entities';

import { createSchemas } from '../../../../core/schemas/src/common/createSchema';
import type { CrudService } from '../CrudService';
import { bulkImpl } from '../CrudService.bulk';
import { entitySchemasOf } from '../CrudService.writeRules';
import { updateGetCache } from '../CrudService.cache';
import { withTimeout as realWithTimeout } from '../../../../core/utils/src/common/withTimeout';

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
    // A stored row for every `get` key: the CRUD update rules run on it.
    getQueryData: vi.fn((key?: readonly unknown[]): Record<string, unknown> | null =>
      key?.[2] === 'get' ? { id: key[3], title: 'stored', status: 'available' } : null
    ),
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
        failed: [],
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

// The entity's schemas (createSchemas), as useCrud passes them.
const schemas = createSchemas(eventEntity) as unknown as import('../types').EntityWriteSchemas<Event>;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('CrudService.bulk()', () => {
  beforeEach(() => {
    withTimeoutMock.mockReset();
    withTimeoutMock.mockImplementation(<T>(p: Promise<T>) => p);
    toastMock.mockClear();
    handleErrorMock.mockClear();
    detectBulkCollisionsMock.mockClear();
    vi.mocked(updateGetCache).mockClear();
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
        deletes: 2,
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
      failed: [],
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
      failed: [],
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
      failed: [],
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

  it('partial success: written rows are confirmed, only failed rows are reverted', async () => {
    const adapterBulk = vi.fn(async () => ({
      insertedIds: ['real-2'],
      updatedIds: ['e1'],
      deletedIds: [],
      failed: [
        { op: 'insert' as const, index: 0, error: 'denied' },
        { op: 'update' as const, id: 'e9', error: 'denied' },
        { op: 'delete' as const, id: 'e2', error: 'denied' },
      ],
    }));
    const { service, state } = makeService({ adapterBulk });

    const result = await bulkImpl<Event>(
      service,
      'events',
      {
        inserts: [{ title: 'A' }, { title: 'B' }],
        updates: [
          { id: 'e1', patch: { title: 'r' } },
          { id: 'e9', patch: { title: 'r' } },
        ],
        deletes: ['e2'],
      },
      schemas
    );

    expect(result.failed).toHaveLength(3);
    // Insert 0 failed (reverted), insert 1 confirmed with the only real id
    expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
    expect(state.confirmOptimistic).toHaveBeenCalledTimes(1);
    expect(state.confirmOptimistic).toHaveBeenCalledWith(
      'events',
      expect.stringMatching(/^temp_/),
      'real-2',
      { id: 'real-2', status: 'available', title: 'B' }
    );
    expect(state.confirmUpdate).toHaveBeenCalledWith('events', 'e1');
    expect(state.confirmUpdate).not.toHaveBeenCalledWith('events', 'e9');
    expect(state.rejectUpdate).toHaveBeenCalledWith('events', 'e9');
    expect(state.rejectUpdate).not.toHaveBeenCalledWith('events', 'e1');
    expect(state.rejectDelete).toHaveBeenCalledWith('events', 'e2');
    expect(toastMock).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('unknown commit: adapter rejection cleans optimistic state and refetches', async () => {
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
    ).rejects.toThrow('adapter exploded mid-way');
    // Non-collision errors go through handleError with the bulk user message.
    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'adapter exploded mid-way' }),
      expect.objectContaining({ userMessage: 'Failed to bulk-write events' })
    );

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

  it.each([
    ['missing insert outcome', { insertedIds: [], updatedIds: ['u'], deletedIds: ['d'], failed: [] }],
    ['missing update outcome', { insertedIds: ['new'], updatedIds: [], deletedIds: ['d'], failed: [] }],
    ['missing delete outcome', { insertedIds: ['new'], updatedIds: ['u'], deletedIds: [], failed: [] }],
    ['missing index', { insertedIds: [], updatedIds: ['u'], deletedIds: ['d'], failed: [{ op: 'insert', error: 'x' }] }],
    ['missing ID', { insertedIds: ['new'], updatedIds: [], deletedIds: ['d'], failed: [{ op: 'update', error: 'x' }] }],
    ['duplicate success', { insertedIds: ['new'], updatedIds: ['u', 'u'], deletedIds: ['d'], failed: [] }],
    ['unknown ID', { insertedIds: ['new'], updatedIds: ['other'], deletedIds: ['d'], failed: [] }],
    ['contradictory outcome', { insertedIds: ['new'], updatedIds: ['u'], deletedIds: ['d'], failed: [{ op: 'update', id: 'u', error: 'x' }] }],
  ])('%s never confirms, audits or reports success; cleanup precedes awaited refetch', async (_label, response) => {
    const audit = vi.fn();
    const { service, state, adapterBulk } = makeService({
      adapterBulk: vi.fn().mockResolvedValue(response),
      security: { audit, checkRateLimit: vi.fn() },
    });
    let finishInvalidation!: () => void;
    const invalidationGate = new Promise<void>((resolve) => { finishInvalidation = resolve; });
    vi.mocked(service.invalidateCollection).mockImplementation(async () => {
      expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
      expect(state.rejectUpdate).toHaveBeenCalledWith('events', 'u');
      expect(state.rejectDelete).toHaveBeenCalledWith('events', 'd');
      expect(state.confirmOptimistic).not.toHaveBeenCalled();
      expect(state.confirmUpdate).not.toHaveBeenCalled();
      expect(state.confirmDelete).not.toHaveBeenCalled();
      await invalidationGate;
    });
    let settled = false;
    const request = bulkImpl(service, 'events', {
      inserts: [{ title: 'A' }], updates: [{ id: 'u', patch: {} }], deletes: ['d'],
    }, schemas).finally(() => { settled = true; });
    const rejection = expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(service.invalidateCollection).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    finishInvalidation();
    await rejection;
    expect(adapterBulk).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalledWith('success', expect.anything());
    expect(state.setLoading).toHaveBeenLastCalledWith('events', false);
  });

  it('lost acknowledgement never replays a transient write', async () => {
    const { service, state, adapterBulk } = makeService({
      adapterBulk: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
    });
    await expect(bulkImpl(service, 'events', { inserts: [{ title: 'A' }] }, schemas)).rejects.toThrow('Failed to fetch');
    expect(adapterBulk).toHaveBeenCalledTimes(1);
    expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
    expect(state.rejectOptimistic.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(service.invalidateCollection).mock.invocationCallOrder[0]!
    );
  });

  it('bounds a forever-pending raw write and rolls back before refetch', async () => {
    vi.useFakeTimers();
    try {
      withTimeoutMock.mockImplementation(realWithTimeout);
      const { service, state, adapterBulk } = makeService({ adapterBulk: vi.fn(() => new Promise(() => {})) });
      vi.mocked(service.invalidateCollection).mockImplementation(async () => {
        expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
      });
      const rejection = expect(bulkImpl(service, 'events', { inserts: [{ title: 'A' }] }, schemas)).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(adapterBulk).toHaveBeenCalledTimes(1);
      expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
      expect(state.setLoading).toHaveBeenLastCalledWith('events', false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes late commit refetch behind initial refetch without stale patches', async () => {
    vi.useFakeTimers();
    try {
      withTimeoutMock.mockImplementation(realWithTimeout);
      let finishWrite!: (value: unknown) => void;
      let finishInitial!: () => void;
      const pending = new Promise((resolve) => { finishWrite = resolve; });
      const initial = new Promise<void>((resolve) => { finishInitial = resolve; });
      const { service, state } = makeService({ adapterBulk: vi.fn(() => pending) });
      let server = 'before';
      let cache = 'optimistic';
      vi.mocked(service.invalidateCollection).mockImplementation(async () => {
        const snapshot = server;
        if (vi.mocked(service.invalidateCollection).mock.calls.length === 1) await initial;
        cache = snapshot;
      });
      const rejection = expect(bulkImpl(service, 'events', { inserts: [{ title: 'A' }] }, schemas)).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
      server = 'committed';
      finishWrite({ insertedIds: ['late'], updatedIds: [], deletedIds: [], failed: [] });
      await Promise.resolve();
      expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
      finishInitial();
      await rejection;
      await vi.waitFor(() => expect(cache).toBe('committed'));
      expect(service.invalidateCollection).toHaveBeenCalledTimes(2);
      expect(state.confirmOptimistic).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('observes a late rejection and catches late refetch errors', async () => {
    vi.useFakeTimers();
    try {
      withTimeoutMock.mockImplementation(realWithTimeout);
      let rejectWrite!: (error: Error) => void;
      const pending = new Promise((_resolve, reject) => { rejectWrite = reject; });
      const { service } = makeService({ adapterBulk: vi.fn(() => pending) });
      vi.mocked(service.invalidateCollection)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('late refetch failed'));
      const rejection = expect(bulkImpl(service, 'events', { deletes: ['x'] }, schemas)).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      rejectWrite(new Error('late write failed'));
      await vi.waitFor(() => expect(handleErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'late refetch failed' }),
        expect.objectContaining({ showNotification: false })
      ));
      expect(service.invalidateCollection).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves the original write error when invalidation rejects', async () => {
    const original = new Error('write failed');
    const { service } = makeService({ adapterBulk: vi.fn().mockRejectedValue(original) });
    vi.mocked(service.invalidateCollection).mockRejectedValue(new Error('refetch failed'));
    await expect(bulkImpl(service, 'events', { deletes: ['x'] }, schemas)).rejects.toBe(original);
  });

  it('insert successes zip to nonfailed indexes in order, not the original dense index', async () => {
    const result = { insertedIds: ['first', 'third'], updatedIds: [], deletedIds: [],
      failed: [{ op: 'insert', index: 1, error: 'denied' }] };
    const { service, state } = makeService({ adapterBulk: vi.fn().mockResolvedValue(result) });
    expect(await bulkImpl(service, 'events', { inserts: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }, schemas)).toEqual(result);
    expect(state.confirmOptimistic.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      ['first', { id: 'first', status: 'available', title: 'A' }], ['third', { id: 'third', status: 'available', title: 'C' }],
    ]);
    expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
  });

  it('rollback replaces snapshots instead of retaining newly introduced patch fields', async () => {
    const { service, state, queryClient } = makeService({
      adapterBulk: vi.fn().mockResolvedValue({ insertedIds: [], updatedIds: [], deletedIds: [], failed: [] }),
    });
    const previous = { id: 'u', title: 'before' };
    queryClient.getQueryData.mockReturnValue(previous);
    vi.mocked(service.invalidateCollection).mockImplementation(async () => {
      expect(state.rejectUpdate).toHaveBeenCalledWith('events', 'u');
      expect(updateGetCache).toHaveBeenLastCalledWith(service, 'events', 'u', previous, 'set');
    });
    await expect(bulkImpl(service, 'events', {
      updates: [{ id: 'u', patch: { newField: 'optimistic' } }],
    }, {})).rejects.toThrow();
  });

  it('valid cold-cache partial failure removes pending entries before refetch', async () => {
    const result = { insertedIds: [], updatedIds: [], deletedIds: [],
      failed: [{ op: 'update', id: 'u', error: 'denied' }] };
    const { service, state } = makeService({ adapterBulk: vi.fn().mockResolvedValue(result) });
    vi.mocked(service.invalidateCollection).mockImplementation(async () => {
      expect(state.rejectUpdate).toHaveBeenCalledWith('events', 'u');
    });
    expect(await bulkImpl(service, 'events', { updates: [{ id: 'u', patch: {} }] }, schemas)).toEqual(result);
    expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
  });

  it('never patches bulk list membership and reconciles every acknowledged operation', async () => {
    const { service, queryClient, adapterBulk } = makeService();
    const previous = { id: 'p', title: 'before' };
    queryClient.getQueryData.mockReturnValue(previous);
    const result = await bulkImpl<Event>(service, 'events', {
      inserts: [{ title: 'new' }],
      updates: [{ id: 'p', patch: { title: 'after' } }],
    }, schemas);
    expect(result.insertedIds).toEqual(['real-1']);
    expect(queryClient.setQueriesData).not.toHaveBeenCalled();
    expect(updateGetCache).toHaveBeenCalledWith(service, 'events', 'p', { id: 'p', title: 'after' }, 'update');
    expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
    expect(adapterBulk).toHaveBeenCalledTimes(1);
  });

  it('registers pending rollback before a store callback that mutates then throws', async () => {
    const { service, state, adapterBulk } = makeService();
    state.addOptimistic.mockImplementation(() => { throw new Error('staging failed after mutation'); });
    await expect(bulkImpl<Event>(service, 'events', { inserts: [{ title: 'new' }] }, schemas))
      .rejects.toThrow('staging failed after mutation');
    expect(state.rejectOptimistic).toHaveBeenCalledTimes(1);
    expect(adapterBulk).not.toHaveBeenCalled();
    expect(service.invalidateCollection).not.toHaveBeenCalled();
  });

  /**
   * The schemas the rules resolve for the PII entity (`entitySchemasOf`), their metadata
   * naming one PII field per schema, so the test sees which schema each row used.
   */
  const piiSchemas = () => {
    const resolved = entitySchemasOf(piiEventEntity.collection);
    const withPii = (schema: { metadata: object }, piiFields: string[]) => {
      schema.metadata = { ...schema.metadata, security: { piiFields } };
    };
    withPii(resolved.create, ['createSecret']);
    withPii(resolved.draft, ['draftSecret']);
    withPii(resolved.update, ['updateSecret']);
    return resolved as never;
  };

  it('selects PII fields from each insert row effective draft schema', async () => {
    const encryptPii = vi.fn((row: Record<string, unknown>) => row);
    const { service, adapterBulk } = makeService({ security: { encryptPii, checkRateLimit: vi.fn() } });
    await bulkImpl(service, piiEventEntity.collection, {
      inserts: [{ status: 'draft', draftSecret: 'x' }, { status: 'available', title: 'T', createSecret: 'y' }],
    }, piiSchemas());
    expect(encryptPii.mock.calls.map(([, fields]) => fields)).toEqual([['draftSecret'], ['createSecret']]);
    expect(adapterBulk).toHaveBeenCalledTimes(1);
  });

  // An update of a cached stored draft (no status in the patch) is a draft write.
  it('selects PII fields of an update from the resulting status (cached stored draft)', async () => {
    const encryptPii = vi.fn((row: Record<string, unknown>) => row);
    const { service, queryClient } = makeService({ security: { encryptPii, checkRateLimit: vi.fn() } });
    queryClient.getQueryData.mockReturnValue({ id: 'e1', status: 'draft', title: 'old' });
    await bulkImpl(service, piiEventEntity.collection, { updates: [{ id: 'e1', patch: { draftSecret: 'x' } }] }, piiSchemas());
    expect(encryptPii.mock.calls.map(([, fields]) => fields)).toEqual([['draftSecret']]);
  });

  it('keeps acknowledged result when post-commit error reporting throws without retry', async () => {
    const audit = vi.fn(() => { throw new Error('reporting callback failed'); });
    const { service, adapterBulk } = makeService({ security: { audit, checkRateLimit: vi.fn() } });
    handleErrorMock.mockImplementation(() => { throw new Error('reporter failed'); });
    const result = await bulkImpl<Event>(service, 'events', { inserts: [{ title: 'new' }] }, schemas);
    expect(result.insertedIds).toEqual(['real-1']);
    expect(adapterBulk).toHaveBeenCalledTimes(1);
    expect(service.invalidateCollection).toHaveBeenCalledTimes(1);
  });

  it('BulkCollisionError from adapter passes through unwrapped', async () => {
    const collision = new BulkCollisionErrorMock(['x'], 'updates-deletes');
    const adapterBulk = vi.fn().mockRejectedValue(collision);
    const { service, state } = makeService({ adapterBulk });

    await expect(
      bulkImpl<Event>(service, 'events', { inserts: [{ title: 'A' }] }, schemas)
    ).rejects.toBe(collision);

    // No error toast for collision (re-thrown before the generic handler).
    expect(toastMock).not.toHaveBeenCalledWith('error', expect.anything());
    expect(handleErrorMock).not.toHaveBeenCalled();
    // Cleared at start, then set to the unwrapped collision error.
    expect(state.setError).toHaveBeenLastCalledWith('events', collision);
  });
});
