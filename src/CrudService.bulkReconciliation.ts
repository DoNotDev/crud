import { DEFAULT_CRUD_TIMEOUT, handleError, withTimeout } from '@donotdev/core';

import type { CrudServiceInternal } from './types';

/** Serializes bounded refetches per collection, cancelling obsolete TanStack attempts. */
export function createBulkReconciliation(self: CrudServiceInternal, operation: string) {
  const queues = new Map<string, Promise<void>>();
  return (collection: string): Promise<void> => {
    const previous = queues.get(collection) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        // withTimeout observes the underlying promise even if it settles late.
        await withTimeout(Promise.resolve().then(() => self.invalidateCollection(collection)), DEFAULT_CRUD_TIMEOUT);
      } catch (error) {
        // Cancellation prevents a stale TanStack fetch from publishing after a newer one.
        try {
          const cancellation = self.getQueryClient().cancelQueries({ queryKey: ['crud', collection] });
          void Promise.resolve(cancellation).catch(() => {});
        } catch { /* diagnostics must not replace the write outcome */ }
        try {
          handleError(error, { context: { operation, collection }, showNotification: false });
        } catch { /* detached diagnostics must never reject */ }
      }
    });
    queues.set(collection, next);
    return next;
  };
}
