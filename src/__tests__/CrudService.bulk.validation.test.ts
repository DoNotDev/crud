// packages/features/crud/src/__tests__/CrudService.bulk.validation.test.ts

/**
 * @fileoverview CrudService.bulk() — update patch validation
 * @description Regression: `bulk()` sent update patches unvalidated. Each patch is
 * now parsed with `createSchemas(entity)[writeSchemaFor({ op: 'update', status,
 * storedStatus })]` (stored status from the caches) and the parse output is written;
 * a draft published (`entersVisibleStatus`) is checked whole (cached stored row merged
 * with the patch) against `update`, like `useCrud.update` and the server functions.
 * Real schemas and real `validateWithSchema`.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import * as v from 'valibot';
import { describe, it, expect, vi } from 'vitest';

import { createSchemas } from '@donotdev/core';
import type { dndevSchema } from '@donotdev/core';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('../CrudService.cache.js', () => ({
  updateListCaches: vi.fn(),
  getItemFromListCache: vi.fn(),
  checkUniquenessFromCache: vi.fn(() => null),
  updateGetCache: vi.fn(),
  invalidateCollectionImpl: vi.fn(() => Promise.resolve()),
}));

import type { CrudService } from '../CrudService';
import { bulkImpl } from '../CrudService.bulk';
import { uppercaseCodeEntity as probe } from '@dndev/test-entities';

type Row = Record<string, unknown>;


const built = createSchemas(probe);
const schemas = {
  create: built.create as dndevSchema<Row>,
  draft: built.draft as dndevSchema<Row>,
  update: built.update as dndevSchema<Row>,
};

/** Service whose caches hold `stored` for every id */
function makeService(stored: Row | null) {
  const noop = vi.fn();
  const state = {
    setLoading: noop, setError: noop, addOptimistic: noop, confirmOptimistic: noop,
    rejectOptimistic: noop, updateOptimistic: noop, confirmUpdate: noop, rejectUpdate: noop,
    deleteOptimistic: noop, confirmDelete: noop, rejectDelete: noop,
  };
  const adapterBulk = vi.fn(async (_col: string, ops: { updates?: Array<{ id: string }> }) => ({
    insertedIds: [],
    updatedIds: (ops.updates ?? []).map((u) => u.id),
    deletedIds: [],
    failed: [],
  }));
  const service = {
    adapter: { bulk: adapterBulk, serverSideOnly: false, dbLevelSecurity: true },
    store: { getState: () => state },
    security: null,
    currentUserId: 'u1',
    _inflightMutations: new Map(),
    getQueryClient: () => ({
      getQueryData: () => stored,
      getQueriesData: () => [],
      invalidateQueries: vi.fn(() => Promise.resolve()),
    }),
    initialize: vi.fn(async () => {}),
    invalidateCollection: vi.fn(async () => {}),
  };
  return { service: service as unknown as CrudService, adapterBulk };
}

const quiet = { showSuccessToast: false };

describe('CrudService.bulk() update patches', () => {
  it('rejects an invalid patch before the write', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'available', title: 'A' });
    await expect(
      bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { rooms: 'many' } }] }, schemas, quiet)
    ).rejects.toThrow(/bulk\.update/);
    expect(adapterBulk).not.toHaveBeenCalled();
  });

  it('rejects a required field sent empty on a visible row', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'available', title: 'A' });
    await expect(
      bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { title: null } }] }, schemas, quiet)
    ).rejects.toThrow(/validation/i);
    expect(adapterBulk).not.toHaveBeenCalled();
  });

  it('writes the parse output, without the id', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'available', title: 'A' });
    await bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { code: 'abc' } }] }, schemas, quiet);
    expect(adapterBulk.mock.calls[0]![1].updates).toEqual([{ id: 'r1', patch: { code: 'ABC' } }]);
  });

  it('a stored draft is checked merged with the draft schema; only the sent keys are written', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'draft', title: null, rooms: 2 });
    await bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { title: null, code: 'x' } }] }, schemas, quiet);
    expect(adapterBulk.mock.calls[0]![1].updates).toEqual([{ id: 'r1', patch: { title: null, code: 'X' } }]);
  });

  it('a draft published is checked whole: a required field left empty is rejected', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'draft', title: null });
    await expect(
      bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { status: 'available' } }] }, schemas, quiet)
    ).rejects.toThrow(/validation/i);
    expect(adapterBulk).not.toHaveBeenCalled();
  });

  it('a draft published with its required fields filled is written', async () => {
    const { service, adapterBulk } = makeService({ id: 'r1', status: 'draft', title: 'Filled' });
    await bulkImpl<Row>(service, 'bulk_patch_probe', { updates: [{ id: 'r1', patch: { status: 'available' } }] }, schemas, quiet);
    expect(adapterBulk.mock.calls[0]![1].updates).toEqual([{ id: 'r1', patch: { status: 'available' } }]);
  });
});
