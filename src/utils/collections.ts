// packages/features/crud/src/utils/collections.ts

/**
 * @fileoverview Collection utilities
 * @description Utilities for working with collections and subcollections
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { CrudCreateInput, dndevSchema } from '@donotdev/core';

import { getCrudService } from '../CrudService';

/**
 * Deterministic subcollection configuration
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface DeterministicSubcollectionConfig<T> {
  path: (userId: string) => string; // e.g., users/{uid}/plan
  idOf: (item: T) => string; // e.g., day → "1"
  schema: dndevSchema<T>;
  range?: { start: number; end: number };
}

/**
 * Append subcollection configuration
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export interface AppendSubcollectionConfig<T extends Record<string, unknown>> {
  path: (userId: string) => string; // e.g., users/{uid}/results
  schema: dndevSchema<T>;
  idFrom?: (item: CrudCreateInput<T>) => string; // optional idempotency key
}

/**
 * Load a deterministic range of items from a subcollection
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export async function loadDeterministicRange<T>(
  userId: string,
  config: DeterministicSubcollectionConfig<T>
): Promise<T[]> {
  const crud = getCrudService();
  const items: T[] = [];
  const start = config.range?.start ?? 1;
  const end = config.range?.end ?? 28;
  for (let i = start; i <= end; i++) {
    const id = String(i);
    const doc = await crud.get<T>(config.path(userId), id, config.schema);
    if (doc) items.push(doc);
  }
  return items;
}

/**
 * Upsert a deterministic range of items in a subcollection
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export async function upsertDeterministic<T>(
  userId: string,
  config: DeterministicSubcollectionConfig<T>,
  data: T[]
): Promise<void> {
  const crud = getCrudService();
  for (const item of data) {
    const id = config.idOf(item);
    await crud.set<T>(config.path(userId), id, item, config.schema);
  }
}

/**
 * Append an item to a subcollection
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export async function appendToCollection<T extends Record<string, unknown>>(
  userId: string,
  config: AppendSubcollectionConfig<T>,
  item: CrudCreateInput<T>
): Promise<string | void> {
  const crud = getCrudService();
  if (config.idFrom) {
    const id = config.idFrom(item);
    return crud.set<T>(config.path(userId), id, item as T, config.schema);
  }
  return crud.add<T>(config.path(userId), item, config.schema);
}
