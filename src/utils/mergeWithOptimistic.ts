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

/**
 * Apply a pending optimistic operation to one cached document.
 * Single-document counterpart of {@link mergeWithOptimistic}:
 * - delete → null
 * - update → the optimistic value merged over the cached document (the optimistic
 *   value can be partial: cold cache, or a snapshot taken from a list row)
 * - add → the cached document when the server already returned it, else the optimistic value
 *
 * @param doc - Document from the TanStack Query cache (null = not found)
 * @param op - Optimistic operation pending for this document id, if any
 * @returns The document to display
 */
export function applyOptimisticToDoc<T>(
  doc: T | null,
  op: OptimisticMeta | undefined
): T | null {
  if (!op) return doc;
  if (op.operation === CRUD_OPERATION.DELETE) return null;
  if (op.operation === CRUD_OPERATION.UPDATE && op.optimisticData) {
    return (doc ? { ...doc, ...op.optimisticData } : op.optimisticData) as T;
  }
  if (op.operation === CRUD_OPERATION.ADD && !doc && op.optimisticData) {
    return op.optimisticData as T;
  }
  return doc;
}
