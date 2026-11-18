// packages/features/crud/src/__tests__/CrudService.bulkAcross.patches.test.ts

/**
 * @fileoverview CrudService.bulkAcross() — update patches validated like the server
 * @description Regression, both execution modes, real schemas (`createSchemas`):
 * - a patch resulting in a draft was parsed alone against the draft schema, which
 *   requires `status: 'draft'`: the default form writer (patch = form values, no
 *   status, `storedStatus: 'draft'`) could not save an edited draft. It is now checked
 *   merged with the stored row; only the sent keys are written.
 * - publishing a draft (`entersVisibleStatus`) was never checked whole: a required
 *   field left empty while it was a draft reached the write. The cached stored row
 *   merged with the patch is now checked against `update`.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi } from 'vitest';

import { createSchemas } from '@donotdev/core';
import type { BulkAcrossBatch, PreparedAtomicBatch } from '@donotdev/core';
import { listingEntity as probe } from '@dndev/test-entities';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));
vi.mock('../CrudService.cache', () => ({ updateListCaches: vi.fn(), updateGetCache: vi.fn() }));
vi.mock('../CrudService.internal', () => ({
  assertCanAccess: vi.fn(),
  ensureAdapter: vi.fn(async () => {}),
  getPiiFields: () => [],
  rateLimitKey: () => 'key',
  shouldShowSuccessToast: () => false,
}));

import { bulkAcrossImpl } from '../CrudService.bulkAcross';
import type { CrudServiceInternal } from '../types';

const built = createSchemas(probe);
/** What the default form writer passes on edit */
const schemas = { update: built.update, draft: built.draft } as BulkAcrossBatch['schemas'];

type Mode = 'legacy' | 'atomic';

/** Service whose caches hold `cached` for every id; returns the patches written */
function makeService(cached: Record<string, unknown> | null) {
  const written: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const ack = (updates: Array<{ id: string; patch: Record<string, unknown> }>) => {
    written.push(...updates);
    return { insertedIds: [], updatedIds: updates.map((u) => u.id), deletedIds: [], failed: [] };
  };
  const state = Object.fromEntries(
    ['setLoading', 'setError', 'addOptimistic', 'confirmOptimistic', 'rejectOptimistic', 'updateOptimistic',
      'confirmUpdate', 'rejectUpdate', 'deleteOptimistic', 'confirmDelete', 'rejectDelete'].map((key) => [key, vi.fn()])
  );
  const service = {
    adapter: {
      bulk: vi.fn(async (_collection: string, ops: { updates?: Array<{ id: string; patch: Record<string, unknown> }> }) =>
        ack(ops.updates ?? [])),
      atomicBulkAcross: {
        preflight: vi.fn(async () => {}),
        execute: vi.fn(async (batches: PreparedAtomicBatch[]) => ({
          results: Object.fromEntries(batches.map((b) => [b.collection, ack((b.updates ?? []) as never)])),
        })),
      },
    },
    store: { getState: () => state },
    security: null,
    currentUserId: 'u1',
    getQueryClient: () => ({
      getQueryData: () => cached,
      getQueriesData: () => [],
      setQueryData: vi.fn(),
      setQueriesData: vi.fn(),
      invalidateQueries: vi.fn(() => Promise.resolve()),
    }),
    invalidateCollection: vi.fn(async () => {}),
  } as unknown as CrudServiceInternal;
  return { service, written };
}

const run = (service: CrudServiceInternal, mode: Mode, update: BulkAcrossBatch['updates']) =>
  bulkAcrossImpl(
    service,
    [{ collection: probe.collection, updates: update, schemas }],
    mode === 'atomic' ? { execution: 'atomic' } : undefined
  );

describe.each<Mode>(['legacy', 'atomic'])('bulkAcross update patches (%s)', (mode) => {
  // The writer passes the stored row (`stored`, the form's record): the rules read its
  // status there (`storedStatus` is no longer read, BulkAcrossBatch JSDoc).
  it('default form writer: an edited stored draft (no status sent, cold cache) is saved', async () => {
    const { service, written } = makeService(null);
    await run(service, mode, [{ id: 'r1', patch: { title: null, rooms: 3 }, stored: { id: 'r1', status: 'draft', title: 'Kept', rooms: 1 } }]);
    expect(written).toEqual([{ id: 'r1', patch: { title: null, rooms: 3 } }]);
  });

  it('an edited cached stored draft writes only the sent keys', async () => {
    const { service, written } = makeService({ id: 'r1', status: 'draft', title: 'Kept', rooms: 1 });
    await run(service, mode, [{ id: 'r1', patch: { rooms: 2 } }]);
    expect(written).toEqual([{ id: 'r1', patch: { rooms: 2 } }]);
  });

  it('publishing a draft with a required field left empty is rejected before the write', async () => {
    const { service, written } = makeService({ id: 'r1', status: 'draft', title: null });
    await expect(run(service, mode, [{ id: 'r1', patch: { status: 'available' } }])).rejects.toThrow(/validation/i);
    expect(written).toEqual([]);
  });

  it('publishing a draft with its required fields filled is written', async () => {
    const { service, written } = makeService({ id: 'r1', status: 'draft', title: 'Filled' });
    await run(service, mode, [{ id: 'r1', patch: { status: 'available' } }]);
    expect(written).toEqual([{ id: 'r1', patch: { status: 'available' } }]);
  });
});
