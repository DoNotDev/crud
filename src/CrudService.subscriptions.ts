// packages/features/crud/src/CrudService.subscriptions.ts

/**
 * @fileoverview CrudService real-time subscriptions
 * @description subscribe / subscribeToCollection impl functions. Syncs adapter
 * real-time events to the same TanStack Query cache keys used by get/query, so
 * mutations and subscriptions share one source of truth.
 *
 * Extracted from CrudService.ts to keep each file under the 500-LOC cap.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type {
  dndevSchema,
  QueryOptions,
  PaginatedQueryResult,
} from '@donotdev/core';
import { handleError } from '@donotdev/core';

import { assertCanAccess, ensureAdapter } from './CrudService.internal';
import type { CrudServiceInternal } from './types';

export function subscribeImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  callback: (data: T | null, error?: Error) => void,
  schema: dndevSchema<T>
): () => void {
  // If adapter is not yet ready, initialise through the mutex and defer the
  // real subscription.  Return a cancel function that aborts setup if the
  // caller unsubscribes before init finishes.
  if (!self.adapter) {
    let cancelled = false;
    let realUnsubscribe: (() => void) | null = null;

    ensureAdapter(self)
      .then(() => {
        if (cancelled) return;
        realUnsubscribe = subscribeSync(self, collection, id, callback, schema);
      })
      .catch((err) => {
        if (!cancelled) callback(null, handleError(err));
      });

    return () => {
      cancelled = true;
      realUnsubscribe?.();
    };
  }

  return subscribeSync(self, collection, id, callback, schema);
}

/** Synchronous subscribe — only called once adapter is confirmed ready. */
function subscribeSync<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  callback: (data: T | null, error?: Error) => void,
  schema: dndevSchema<T>
): () => void {
  try {
    const adapter = self.adapter;
    if (!adapter) {
      callback(null, new Error('Adapter not initialized'));
      return () => {};
    }
    if (!adapter.subscribe) {
      return () => {};
    }
    assertCanAccess(self, collection, schema);
    return adapter.subscribe<T>(
      collection,
      id,
      (data, error) => {
        // Sync to TanStack Query cache (single source of truth)
        if (data) {
          self
            .getQueryClient()
            .setQueryData(['crud', collection, 'get', id], data);
        }
        callback(data, error);
      },
      schema
    );
  } catch (error) {
    callback(null, handleError(error));
    return () => {};
  }
}

export function subscribeToCollectionImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  options: QueryOptions,
  callback: (data: T[], error?: Error) => void,
  schema: dndevSchema<T>
): () => void {
  // Same deferred-subscribe pattern as subscribe() above.
  if (!self.adapter) {
    let cancelled = false;
    let realUnsubscribe: (() => void) | null = null;

    ensureAdapter(self)
      .then(() => {
        if (cancelled) return;
        realUnsubscribe = subscribeToCollectionSync(
          self,
          collection,
          options,
          callback,
          schema
        );
      })
      .catch((err) => {
        if (!cancelled) callback([], handleError(err));
      });

    return () => {
      cancelled = true;
      realUnsubscribe?.();
    };
  }

  return subscribeToCollectionSync(self, collection, options, callback, schema);
}

/** Synchronous subscribeToCollection — only called once adapter is confirmed ready. */
function subscribeToCollectionSync<T>(
  self: CrudServiceInternal,
  collection: string,
  options: QueryOptions,
  callback: (data: T[], error?: Error) => void,
  schema: dndevSchema<T>
): () => void {
  try {
    const adapter = self.adapter;
    if (!adapter) {
      callback([], new Error('Adapter not initialized'));
      return () => {};
    }
    if (!adapter.subscribeToCollection) {
      return () => {};
    }
    assertCanAccess(self, collection, schema);
    return adapter.subscribeToCollection<T>(
      collection,
      options,
      (data, error) => {
        // Sync to TanStack Query cache (single source of truth).
        // One key for list + listCard — same as getListQueryOptions / query().
        if (data) {
          self
            .getQueryClient()
            .setQueryData(
              ['crud', collection, 'query', JSON.stringify(options)],
              (old: PaginatedQueryResult<T> | undefined) =>
                old ? { ...old, items: data } : { items: data }
            );
        }
        callback(data, error);
      },
      schema
    );
  } catch (error) {
    callback([], handleError(error));
    return () => {};
  }
}
