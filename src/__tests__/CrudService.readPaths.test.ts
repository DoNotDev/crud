// packages/features/crud/src/__tests__/CrudService.readPaths.test.ts

/**
 * @fileoverview Read-path parity: every read that fills the cache yields the same rows
 * @description get() / getDocQueryOptions share `['crud', c, 'get', id]`; query() /
 * getListQueryOptions share `['crud', c, 'query', JSON(opts)]`; subscriptions write
 * both. All must apply the same access check (on the adapter that reads), PII
 * decryption and request-scoped adapter. Regression: the reactive descriptors and
 * subscriptions read the adapter directly, caching ciphertext and skipping the check.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@donotdev/core', () => ({
  LIST_SCHEMA_TYPE: { LIST: 'list', LIST_CARD: 'listCard' },
  handleError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  getI18nInstance: () => ({ t: (key: string) => key }),
  hasProvider: () => true,
  getProvider: vi.fn(),
  // Test schemas flag restriction directly; the real introspection has its own tests.
  hasRestrictedVisibility: (schema: { restricted?: boolean }) =>
    schema?.restricted === true,
  withTimeout: <T>(p: Promise<T>) => p,
  DEFAULT_CRUD_TIMEOUT: 30_000,
}));

import {
  bindRequestAccessToken,
  getDocQueryOptionsImpl,
  getImpl,
  getListQueryOptionsImpl,
  queryImpl,
} from '../CrudService.queries';
import {
  subscribeImpl,
  subscribeToCollectionImpl,
} from '../CrudService.subscriptions';
import type { CrudServiceInternal } from '../types';

type Row = { id: string; name: string; email: string };

const STORED: Row = { id: 'c1', name: 'Ada', email: 'enc(ada@x.io)' };
const piiSchema = { security: { piiFields: ['email'] } };
const restrictedSchema = { restricted: true };

function makeAdapter(row: Row | null, flags: Record<string, boolean> = {}) {
  return {
    get: vi.fn(async () => (row ? { ...row } : null)),
    query: vi.fn(async () => ({ items: row ? [{ ...row }] : [], total: 1 })),
    ...flags,
  };
}

function makeService(adapter: unknown, queryClient: QueryClient) {
  const security = {
    decryptPii: vi.fn((data: Record<string, unknown>, fields: string[]) => {
      const out = { ...data };
      for (const f of fields) {
        out[f] = String(out[f]).replace(/^enc\((.*)\)$/, '$1');
      }
      return out;
    }),
  };
  const self = {
    adapter,
    security,
    store: null,
    initialize: vi.fn(async () => {}),
    getQueryClient: () => queryClient,
  } as unknown as CrudServiceInternal;
  return { self, security };
}

describe('getDocQueryOptions — same read path as get()', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('decrypts PII fields, like get()', async () => {
    const { self } = makeService(makeAdapter(STORED), queryClient);
    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      piiSchema as never
    );

    const doc = await query.queryFn({ client: queryClient });

    expect(doc?.email).toBe('ada@x.io');
  });

  it('caches the same value as get() under the shared key', async () => {
    const { self } = makeService(makeAdapter(STORED), queryClient);

    const viaGet = await getImpl<Row>(
      self,
      'customers',
      'c1',
      piiSchema as never
    );
    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      piiSchema as never
    );
    const viaDescriptor = await query.queryFn({ client: queryClient });

    expect(query.queryKey).toEqual(['crud', 'customers', 'get', 'c1']);
    expect(viaDescriptor).toEqual(viaGet);
  });

  it('refuses restricted entities on a direct adapter, like get()', async () => {
    const adapter = makeAdapter(STORED);
    const { self } = makeService(adapter, queryClient);
    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      restrictedSchema as never
    );

    await expect(query.queryFn({ client: queryClient })).rejects.toThrow(
      /restricted field visibility/
    );
    expect(adapter.get).not.toHaveBeenCalled();
  });

  it('allows restricted entities on a server-side adapter', async () => {
    const { self } = makeService(
      makeAdapter(STORED, { serverSideOnly: true }),
      queryClient
    );
    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      restrictedSchema as never
    );

    await expect(query.queryFn({ client: queryClient })).resolves.toEqual(
      STORED
    );
  });

  it('reads with the request-scoped adapter bound to the running client (server render)', async () => {
    const visitorAdapter = makeAdapter({ ...STORED, name: 'as-visitor' });
    const sharedAdapter = {
      ...makeAdapter(STORED),
      forAccessToken: vi.fn(() => visitorAdapter),
    };
    const { self } = makeService(sharedAdapter, queryClient);
    const requestClient = new QueryClient();
    expect(bindRequestAccessToken(self, requestClient, 'token')).toBe(true);

    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      {} as never
    );

    expect((await query.queryFn({ client: requestClient }))?.name).toBe(
      'as-visitor'
    );
    expect((await query.queryFn({ client: queryClient }))?.name).toBe('Ada');
  });
});

describe('getListQueryOptions — same read path as query()', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('decrypts PII fields per row and caches the same value as query()', async () => {
    const { self } = makeService(makeAdapter(STORED), queryClient);
    const viaQuery = await queryImpl<Row>(
      self,
      'customers',
      {},
      piiSchema as never
    );
    const list = getListQueryOptionsImpl<Row>(
      self,
      'customers',
      {},
      piiSchema as never
    );
    const viaDescriptor = await list.queryFn({ client: queryClient });

    expect(viaDescriptor.items[0]?.email).toBe('ada@x.io');
    expect(viaDescriptor).toEqual(viaQuery);
  });

  it('refuses restricted entities on a direct adapter, like query()', async () => {
    const adapter = makeAdapter(STORED);
    const { self } = makeService(adapter, queryClient);
    const list = getListQueryOptionsImpl<Row>(
      self,
      'customers',
      {},
      restrictedSchema as never
    );

    await expect(list.queryFn({ client: queryClient })).rejects.toThrow(
      /restricted field visibility/
    );
    expect(adapter.query).not.toHaveBeenCalled();
  });
});

describe('access check uses the adapter that reads', () => {
  it('refuses a direct request-scoped adapter behind a server-side shared one', async () => {
    const queryClient = new QueryClient();
    const directVisitorAdapter = makeAdapter(STORED);
    const sharedAdapter = {
      ...makeAdapter(STORED, { serverSideOnly: true }),
      forAccessToken: vi.fn(() => directVisitorAdapter),
    };
    const { self } = makeService(sharedAdapter, queryClient);
    const requestClient = new QueryClient();
    bindRequestAccessToken(self, requestClient, 'token');

    const query = getDocQueryOptionsImpl<Row>(
      self,
      'customers',
      'c1',
      restrictedSchema as never
    );

    await expect(query.queryFn({ client: requestClient })).rejects.toThrow(
      /restricted field visibility/
    );
    expect(directVisitorAdapter.get).not.toHaveBeenCalled();
  });
});

describe('subscriptions — cache the same plaintext rows as reads', () => {
  it('document snapshot: decrypted in the cache and in the callback', () => {
    const queryClient = new QueryClient();
    let push: (data: Row | null) => void = () => {};
    const adapter = {
      subscribe: vi.fn((_c: string, _id: string, cb: typeof push) => {
        push = cb;
        return () => {};
      }),
    };
    const { self } = makeService(adapter, queryClient);
    const callback = vi.fn();

    subscribeImpl<Row>(self, 'customers', 'c1', callback, piiSchema as never);
    push({ ...STORED });

    expect(
      queryClient.getQueryData<Row>(['crud', 'customers', 'get', 'c1'])?.email
    ).toBe('ada@x.io');
    expect(callback.mock.calls[0]?.[0]?.email).toBe('ada@x.io');
  });

  it('collection snapshot: rows decrypted in the list cache', () => {
    const queryClient = new QueryClient();
    let push: (data: Row[]) => void = () => {};
    const adapter = {
      subscribeToCollection: vi.fn(
        (_c: string, _o: unknown, cb: typeof push) => {
          push = cb;
          return () => {};
        }
      ),
    };
    const { self } = makeService(adapter, queryClient);

    subscribeToCollectionImpl<Row>(
      self,
      'customers',
      {},
      vi.fn(),
      piiSchema as never
    );
    push([{ ...STORED }]);

    const cached = queryClient.getQueryData<{ items: Row[] }>([
      'crud',
      'customers',
      'query',
      JSON.stringify({}),
    ]);
    expect(cached?.items[0]?.email).toBe('ada@x.io');
  });
});
