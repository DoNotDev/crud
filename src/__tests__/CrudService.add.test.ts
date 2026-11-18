// packages/features/crud/src/__tests__/CrudService.add.test.ts

/**
 * @fileoverview add() default status
 * @description
 * - No status given: the framework default (`DEFAULT_STATUS_VALUE`), as forms and
 *   bulk inserts. Regression: add() hardcoded `'draft'`, so records created from
 *   code were drafts, hidden from non-admins.
 * - A status given by the caller (e.g. `'draft'`) is kept.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@donotdev/components', () => ({ toast: vi.fn() }));

vi.mock('@donotdev/core', async () => ({
  // The CRUD rules run for real (core/schemas crud/).
  ...(await vi.importActual<Record<string, unknown>>('@donotdev/core')),
  DEFAULT_STATUS_VALUE: 'available',
  generateUUID: () => 'uuid',
  getI18nInstance: () => ({ t: (key: string) => key }),
  handleError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  hasProvider: () => true,
  getProvider: vi.fn(),
  hasRestrictedVisibility: () => false,
  withTimeout: <T>(p: Promise<T>) => p,
  DEFAULT_CRUD_TIMEOUT: 30_000,
}));

import { createSchemas } from '@donotdev/core';

import { addImpl } from '../CrudService.mutations';
import type { CrudServiceInternal } from '../types';
import { carEntity } from '@dndev/test-entities';

type Car = { name: string; status?: string };

const SCHEMAS = createSchemas(carEntity);

let queryClient: QueryClient;

function makeService(adapter: unknown): CrudServiceInternal {
  const storeState = {
    hideSuccessToasts: true,
    addOptimistic: vi.fn(),
    confirmOptimistic: vi.fn(),
    rejectOptimistic: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
  };
  return {
    adapter,
    security: null,
    store: { getState: () => storeState },
    currentUserId: null,
    _inflightMutations: new Map(),
    initialize: vi.fn(async () => {}),
    getQueryClient: () => queryClient,
  } as unknown as CrudServiceInternal;
}

function makeAdapter() {
  return {
    serverSideOnly: true,
    add: vi.fn(async (_collection: string, data: Record<string, unknown>) => ({
      id: 'c1',
      data: { ...data, id: 'c1' },
    })),
  };
}

beforeEach(() => {
  queryClient = new QueryClient();
});

describe('addImpl — status', () => {
  it('uses DEFAULT_STATUS_VALUE when the caller gives no status', async () => {
    const adapter = makeAdapter();

    await addImpl<Car>(makeService(adapter), 'cars', { name: 'Tesla' }, SCHEMAS);

    expect(adapter.add.mock.calls[0]?.[1]).toMatchObject({ status: 'available' });
  });

  it('keeps the status the caller gives', async () => {
    const adapter = makeAdapter();

    await addImpl<Car>(makeService(adapter), 'cars', { name: 'Tesla', status: 'draft' }, SCHEMAS);

    expect(adapter.add.mock.calls[0]?.[1]).toMatchObject({ status: 'draft' });
  });
});
