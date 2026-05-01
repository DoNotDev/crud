// packages/features/crud/src/utils/mergeWithOptimistic.ts

/**
 * @fileoverview Optimistic merge utility
 * @description Merges TanStack Query results with optimistic operations from store
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { CRUD_OPERATION } from '../types';

import type { OptimisticMeta } from '../types';

interface WithId {
  id: string;
  [key: string]: unknown;
}

/**
 * Merge query results with optimistic operations.
 * - Filter out items marked for deletion
 * - Apply optimistic updates from metadata
 * - Append optimistic adds (temp IDs)
 *
 * @param queryData - Data from TanStack Query cache
 * @param optimistic - Optimistic operation metadata from store (contains optimisticData)
 * @returns Merged array with optimistic changes applied
 */
export function mergeWithOptimistic<T extends WithId>(
  queryData: T[],
  optimistic: Record<string, OptimisticMeta>
): T[] {
  const result: T[] = [];
  const seenIds = new Set<string>();

  // Process query data
  for (const item of queryData) {
    const op = optimistic[item.id];

    // Skip deleted items
    if (op?.operation === CRUD_OPERATION.DELETE) continue;

    // Apply optimistic update if exists (use optimisticData from metadata)
    if (op?.operation === CRUD_OPERATION.UPDATE && op.optimisticData) {
      result.push(op.optimisticData as T);
    } else {
      result.push(item);
    }
    seenIds.add(item.id);
  }

  // Append optimistic adds (items not in query results)
  for (const [id, meta] of Object.entries(optimistic)) {
    if (
      meta.operation === CRUD_OPERATION.ADD &&
      !seenIds.has(id) &&
      meta.optimisticData
    ) {
      result.push(meta.optimisticData as T);
    }
  }

  return result;
}
