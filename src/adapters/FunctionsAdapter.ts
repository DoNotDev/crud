// packages/features/crud/src/adapters/FunctionsAdapter.ts

/**
 * @fileoverview Firebase Functions Backend Adapter
 * @description HTTP callable Functions adapter for secure CRUD operations
 *
 * **Features:**
 * - Server-side security (admin checks, auth verification)
 * - Schema validation on server
 * - Idempotency keys support
 * - Audit logs and metadata
 * - Rate limiting
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import * as v from 'valibot';

import type {
  BulkOperations,
  BulkRequest,
  BulkResponse,
  BulkResult,
  CrudOperationOptions,
  dndevSchema,
  ICallableProvider,
  ICrudAdapter,
  ListSchemaType,
  PaginatedQueryResult,
} from '@donotdev/core';
import {
  BulkCollisionError,
  BulkRequestSchema,
  BulkResponseSchema,
  detectBulkCollisions,
  DoNotDevError,
  getProvider,
  validateWithSchema,
  wrapCrudError,
} from '@donotdev/core';
import { LIST_SCHEMA_TYPE } from '@donotdev/core';

/**
 * Query options for Functions queries
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface FunctionsQueryOptions {
  where?: Array<{ field: string; operator: string; value: unknown }>;
  orderBy?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  limit?: number;
  /** Cursor from previous page (QueryOptions uses startAfter; server uses startAfterId) */
  startAfter?: string | null;
  startAfterId?: string;
}

/**
 * Functions backend adapter
 * Works with any collection dynamically (collection name passed per operation)
 * Assumes Functions are named: `get_${collection}`, `create_${collection}`, etc.
 *
 * All backends go through ICallableProvider. If none configured, falls back to FirebaseCallableProvider.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export class FunctionsAdapter implements ICrudAdapter {
  readonly serverSideOnly = true;

  /**
   * Resolve ICallableProvider from provider registry.
   * Consumer must configure via configureProviders({ callable: adapter }).
   */
  private getCallable(): ICallableProvider {
    return getProvider('callable');
  }

  /**
   * Get callable function invoker. Always uses ICallableProvider (configured or Firebase fallback).
   */
  private async getCallableFn<TReq, TRes>(
    functionName: string
  ): Promise<(data: TReq) => Promise<{ data: TRes }>> {
    const callable = this.getCallable();
    return async (data: TReq) => ({
      data: await callable.call<TReq, TRes>(functionName, data),
    });
  }

  async get<T>(
    collectionName: string,
    id: string,
    schema: dndevSchema<unknown>
  ): Promise<T | null> {
    const functionName = `get_${collectionName}`;
    const getFn = await this.getCallableFn<{ id: string }, T>(functionName);
    try {
      const result = await getFn({ id });
      const data = result.data as T;
      // Validate response if schema provided
      if (schema) {
        const validated = validateWithSchema(schema, data, 'FunctionsAdapter.get') as Record<string, unknown>;
        return { ...validated, id } as T;
      }
      // Include document ID in result (mirrors FirestoreAdapter contract)
      return { ...(data as Record<string, unknown>), id } as T;
    } catch (error) {
      throw wrapCrudError(error, 'FunctionsAdapter', 'get', collectionName, id);
    }
  }

  async set<T>(
    collectionName: string,
    id: string,
    data: T,
    schema: dndevSchema<T>
  ): Promise<void> {
    const validated = schema
      ? validateWithSchema(schema, data, 'FunctionsAdapter.set')
      : data;
    const functionName = `update_${collectionName}`; // Use update for set (overwrite)
    const updateFn = await this.getCallableFn<{ id: string; payload: T }, T>(
      functionName
    );
    try {
      await updateFn({ id, payload: validated });
    } catch (error) {
      throw wrapCrudError(error, 'FunctionsAdapter', 'set', collectionName, id);
    }
  }

  async update<T>(
    collectionName: string,
    id: string,
    data: Partial<T>
  ): Promise<void> {
    const functionName = `update_${collectionName}`;
    const updateFn = await this.getCallableFn<
      { id: string; payload: Partial<T> },
      T
    >(functionName);
    try {
      await updateFn({ id, payload: data });
    } catch (error) {
      throw wrapCrudError(
        error,
        'FunctionsAdapter',
        'update',
        collectionName,
        id
      );
    }
  }

  async delete(collectionName: string, id: string): Promise<void> {
    const functionName = `delete_${collectionName}`;
    const deleteFn = await this.getCallableFn<{ id: string }, void>(
      functionName
    );
    try {
      await deleteFn({ id });
    } catch (error) {
      throw wrapCrudError(
        error,
        'FunctionsAdapter',
        'delete',
        collectionName,
        id
      );
    }
  }

  /**
   * Bulk transactional operation via the `bulk_${collection}` callable.
   *
   * @description Delegates atomicity, per-op ACL, and row validation to the
   *   server-side `bulk_${collection}` callable registered by
   *   `createCrudFunctions`. This client adapter is a thin pass-through:
   *
   *   1. `detectBulkCollisions(ops)` — rejects ambiguous payloads (same id in
   *      two buckets) before any network call. The thrown
   *      {@link BulkCollisionError} is not wrapped so callers can `instanceof`
   *      it.
   *   2. Empty bulk is a no-op — if all three arrays are empty/absent we return
   *      a zeroed {@link BulkResult} without issuing a callable. Matches the
   *      server's empty-bulk contract and avoids a needless round-trip.
   *   3. Validates the wire body with {@link BulkRequestSchema} before sending
   *      — malformed payloads fail loud locally.
   *   4. Invokes the callable via the provider registry (identical path to
   *      `add` / `update` / `delete`).
   *   5. Validates the server reply with {@link BulkResponseSchema} — a
   *      malformed server response surfaces as a clean error, never as a
   *      silent zeroed result.
   *   6. Any other failure is wrapped via {@link wrapCrudError} to preserve
   *      parity with sibling methods on this adapter.
   *
   * @param collection - Target collection (drives the callable name).
   * @param ops - Bulk operations to perform. All buckets are optional.
   * @param _schema - Intentionally unused — the server re-validates each
   *   insert against the authoritative `createSchema` bound to the entity.
   *   Matches how `add()` delegates validation server-side.
   * @param _options - Intentionally unused at the adapter layer. Per-op audit
   *   and rate-limit live in the service layer.
   * @returns The server-echoed ids, order-preserved per bucket.
   *
   * @throws {BulkCollisionError} Propagated unwrapped when the payload carries
   *   the same id in two mutually-exclusive buckets.
   * @throws {DoNotDevError} Wrapped via {@link wrapCrudError} for any
   *   callable-side failure or malformed server response.
   *
   * @example
   * ```typescript
   * const adapter = new FunctionsAdapter();
   * const result = await adapter.bulk<Event>('events', {
   *   inserts: [{ title: 'A' }, { title: 'B' }],
   *   updates: [{ id: 'e1', patch: { title: 'renamed' } }],
   *   deletes: ['e2'],
   * });
   * // result.insertedIds: ['evt_…', 'evt_…']
   * // result.updatedIds:  ['e1']
   * // result.deletedIds:  ['e2']
   * ```
   */
  async bulk<T extends Record<string, unknown>>(
    collection: string,
    ops: BulkOperations<T>,
    _schema?: dndevSchema<T>,
    _options?: CrudOperationOptions
  ): Promise<BulkResult> {
    // 1. Collision detection — surfaced unwrapped so callers can instanceof it.
    const collision = detectBulkCollisions({
      inserts: ops.inserts as Array<{ id?: string; [k: string]: unknown }>,
      updates: ops.updates,
      deletes: ops.deletes,
    });
    if (collision.where !== null) {
      throw new BulkCollisionError(collision.collisions, collision.where);
    }

    const inserts = ops.inserts ?? [];
    const updates = ops.updates ?? [];
    const deletes = ops.deletes ?? [];

    // 2. Empty bulk → no callable, zeroed response.
    if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
      return { insertedIds: [], updatedIds: [], deletedIds: [] };
    }

    // 3. Validate the wire body locally. Fail loud on malformed input.
    let body: BulkRequest;
    try {
      body = v.parse(BulkRequestSchema, {
        inserts,
        updates,
        deletes,
      });
    } catch (error) {
      throw new DoNotDevError(
        `FunctionsAdapter.bulk(${collection}): invalid bulk request payload`,
        'validation-failed',
        {
          details: {
            issues: error instanceof v.ValiError ? error.issues : undefined,
          },
          source: 'validation',
          originalError:
            error instanceof Error ? error : new Error(String(error)),
        }
      );
    }

    // 4. Resolve + invoke callable.
    const fn = await this.getCallableFn<BulkRequest, BulkResponse>(
      `bulk_${collection}`
    );

    try {
      const result = await fn(body);
      if (!result.data) {
        throw wrapCrudError(
          new Error('Bulk function returned no data'),
          'FunctionsAdapter',
          'bulk',
          collection
        );
      }

      // 5. Validate response. Malformed reply fails loud.
      let validated: BulkResponse;
      try {
        validated = v.parse(BulkResponseSchema, result.data);
      } catch (parseError) {
        throw new DoNotDevError(
          `FunctionsAdapter.bulk(${collection}): malformed server response`,
          'validation-failed',
          {
            details: {
              issues:
                parseError instanceof v.ValiError
                  ? parseError.issues
                  : undefined,
              response: result.data,
            },
            source: 'validation',
            originalError:
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
          }
        );
      }

      return {
        insertedIds: validated.insertedIds,
        updatedIds: validated.updatedIds,
        deletedIds: validated.deletedIds,
      };
    } catch (error) {
      // BulkCollisionError from upstream (shouldn't happen here, but pass through).
      if (error instanceof BulkCollisionError) throw error;
      throw wrapCrudError(error, 'FunctionsAdapter', 'bulk', collection);
    }
  }

  async add<T>(
    collectionName: string,
    data: T,
    schema?: dndevSchema<T>
  ): Promise<{ id: string; data: Record<string, unknown> }> {
    const validated = schema
      ? validateWithSchema(schema, data, 'FunctionsAdapter.add')
      : data;
    const functionName = `create_${collectionName}`;
    const createFn = await this.getCallableFn<
      { payload: T; idempotencyKey?: string },
      Record<string, unknown> & { id: string }
    >(functionName);
    try {
      const result = await createFn({ payload: validated });
      if (!result.data) {
        throw wrapCrudError(
          new Error('Create function returned no data'),
          'FunctionsAdapter',
          'add',
          collectionName
        );
      }
      // Return full server response (includes actual document data for findOrCreate)
      return { id: result.data.id, data: result.data };
    } catch (error) {
      throw wrapCrudError(error, 'FunctionsAdapter', 'add', collectionName);
    }
  }

  async query<T>(
    collectionName: string,
    options: FunctionsQueryOptions,
    schema: dndevSchema<unknown>,
    schemaType: ListSchemaType = LIST_SCHEMA_TYPE.LIST
  ): Promise<PaginatedQueryResult<T>> {
    const functionName =
      schemaType === LIST_SCHEMA_TYPE.LIST_CARD
        ? `listCard_${collectionName}`
        : `list_${collectionName}`;

    // Transform options to server format
    // Server expects: { where: Array<[field, op, value]>, orderBy: Array[field, dir]>, limit, startAfterId, search }
    const serverParams: {
      where?: Array<[string, string, unknown]>;
      orderBy?: Array<[string, 'asc' | 'desc']>;
      limit?: number;
      startAfterId?: string;
    } = {};

    if (options.where) {
      serverParams.where = options.where.map((w) => [
        w.field,
        w.operator,
        w.value,
      ]);
    }
    if (options.orderBy) {
      serverParams.orderBy = options.orderBy.map((o) => [
        o.field,
        (o.direction || 'asc') as 'asc' | 'desc',
      ]);
    }
    if (options.limit) {
      serverParams.limit = options.limit;
    }
    if (options.startAfter) {
      serverParams.startAfterId = options.startAfter;
    }

    const listFn = await this.getCallableFn<
      typeof serverParams,
      {
        items: T[];
        lastVisible: string | null;
        count: number;
        hasMore: boolean;
      }
    >(functionName);

    try {
      const result = await listFn(serverParams);
      if (!result.data) {
        throw wrapCrudError(
          new Error('Query function returned no data'),
          'FunctionsAdapter',
          'query',
          collectionName
        );
      }
      return {
        items: result.data.items,
        total: result.data.count,
        hasMore: result.data.hasMore,
        lastVisible: result.data.lastVisible,
      };
    } catch (error) {
      throw wrapCrudError(error, 'FunctionsAdapter', 'query', collectionName);
    }
  }

  // Functions backend doesn't support subscriptions — return no-op instead of throwing
  // CrudService guards with `if (!adapter.subscribe)` but the method IS defined,
  // so throwing would crash callers. Warn + no-op is the correct degradation.
  subscribe<T>(): () => void {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[dndev] FunctionsAdapter: subscriptions not supported. Use Firestore backend for real-time features.'
      );
    }
    return () => {};
  }

  subscribeToCollection<T>(): () => void {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[dndev] FunctionsAdapter: subscriptions not supported. Use Firestore backend for real-time features.'
      );
    }
    return () => {};
  }
}
