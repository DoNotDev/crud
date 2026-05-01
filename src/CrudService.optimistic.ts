// packages/features/crud/src/CrudService.optimistic.ts

/**
 * @fileoverview CrudService optimistic variants
 * @description addOptimistic / updateOptimistic / deleteOptimistic impl
 * functions. Flavour of mutations that mark items with `_optimistic: true` so
 * the UI can distinguish pending writes visually. Server response replaces
 * the optimistic marker.
 *
 * Extracted from CrudService.ts to keep each file under the 500-LOC cap.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { toast } from '@donotdev/components';
import type { dndevSchema } from '@donotdev/core';
import { generateUUID, getI18nInstance, handleError } from '@donotdev/core';

import {
  checkUniquenessFromCache,
  getItemFromListCache,
  updateListCaches,
} from './CrudService.cache';
import {
  auditCrud,
  ensureAdapter,
  getEntityName,
  rateLimitKey,
  runSerializedMutation,
  shouldShowSuccessToast,
  withResilience,
} from './CrudService.internal';
import { CRUD_OPERATION } from './types';
import type { CrudServiceInternal, MutationOptions } from './types';

export async function addOptimisticImpl<T extends { id?: string }>(
  self: CrudServiceInternal,
  collection: string,
  data: T,
  schema: dndevSchema<T>,
  options?: MutationOptions
): Promise<T & { id: string }> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // Frontend uniqueness check from cache (list/listCard queries)
  // findOrCreate: returns existing item immediately, no server call
  // Strict duplicate: throws error for the user
  const cachedId = checkUniquenessFromCache(
    self,
    collection,
    data as Record<string, unknown>,
    schema
  );
  if (cachedId) {
    return { ...data, id: cachedId } as T & { id: string };
  }

  // SOC2: rate limit before optimistic mutation (same as non-optimistic path)
  if (self.security) {
    await self.security.checkRateLimit(rateLimitKey(self, collection), 'write');
  }

  // Generate temp ID for optimistic update
  const tempId = `temp_${generateUUID()}`;
  const tempItem = { ...data, id: tempId, _optimistic: true };

  // 1. Immediate optimistic update
  if (self.store) {
    self.store.getState().addOptimistic(collection, tempId, tempItem);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }

    // 2. Server call
    const adapter = self.adapter;
    const addResult = await withResilience(() =>
      adapter.add<T>(collection, data, schema)
    );
    const realId = addResult.id;
    // Use server-returned data (correct for findOrCreate)
    const realItem = addResult.data as T & { id: string };

    // 3. Update TanStack Query caches FIRST
    // Remove temp item and add real item
    updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
    updateListCaches(
      self,
      collection,
      realId,
      realItem as T,
      CRUD_OPERATION.ADD
    );

    // 4. Confirm - replace temp with real (removes optimistic flag)
    if (self.store) {
      self.store
        .getState()
        .confirmOptimistic(collection, tempId, realId, realItem);
    }

    // SOC2: audit create after confirmed server write
    auditCrud(self, 'crud.create', collection, realId);

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.createSuccess', { ns: 'crud', entity: entityName })
      );
    }
    return realItem;
  } catch (error) {
    // Rollback: remove temp item from cache
    updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE);
    // Then remove optimistic flag
    if (self.store) {
      self.store.getState().rejectOptimistic(collection, tempId);
    }

    const wrappedError = handleError(error, {
      userMessage: `Failed to create ${collection}`,
      showNotification: true,
    });

    const i18n = getI18nInstance();
    const entityName = getEntityName(collection);
    toast(
      'error',
      i18n.t('messages.createError', { ns: 'crud', entity: entityName })
    );

    throw wrappedError;
  }
}

export async function updateOptimisticImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  data: Partial<T>,
  schema: dndevSchema<T>,
  options?: MutationOptions
): Promise<T> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // SOC2: rate limit before optimistic mutation
  if (self.security) {
    await self.security.checkRateLimit(rateLimitKey(self, collection), 'write');
  }

  // 1. Snapshot previous data from TanStack Query cache for rollback
  const queryClient = self.getQueryClient();
  const previousData =
    queryClient.getQueryData<T>(['crud', collection, 'get', id]) ??
    getItemFromListCache<T>(self, collection, id);

  const mergedData = previousData
    ? { ...previousData, ...data, _optimistic: true }
    : { ...data, id, _optimistic: true };

  // 2. Immediate optimistic update
  if (self.store && previousData) {
    self.store
      .getState()
      .updateOptimistic(collection, id, mergedData, previousData);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }

    // 3. Server call with concurrent mutation protection
    const adapter = self.adapter;
    await runSerializedMutation(self, collection, id, async () => {
      await withResilience(() => adapter.update<T>(collection, id, data));
    });

    // 4. Update TanStack Query caches FIRST (without _optimistic flag)
    // Use destructuring to fully remove the key — spreading undefined keeps the key present
    // and 'in' checks on cached objects would incorrectly read it as set.
    const { _optimistic: _removed, ...cleanData } = mergedData as Record<
      string,
      unknown
    >;
    updateListCaches(
      self,
      collection,
      id,
      cleanData as T,
      CRUD_OPERATION.UPDATE
    );

    // 5. Confirm update (removes optimistic flag)
    if (self.store) {
      self.store.getState().confirmUpdate(collection, id);
    }

    // SOC2: audit update after confirmed server write
    auditCrud(self, 'crud.update', collection, id);

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.updateSuccess', { ns: 'crud', entity: entityName })
      );
    }
    return cleanData as T;
  } catch (error) {
    // Rollback: restore original data to cache
    if (previousData) {
      updateListCaches(
        self,
        collection,
        id,
        previousData,
        CRUD_OPERATION.UPDATE
      );
    }
    // Then remove optimistic flag
    if (self.store) {
      self.store.getState().rejectUpdate(collection, id);
    }

    const wrappedError = handleError(error, {
      userMessage: `Failed to update ${collection}`,
      showNotification: true,
    });

    const i18n = getI18nInstance();
    const entityName = getEntityName(collection);
    toast(
      'error',
      i18n.t('messages.updateError', { ns: 'crud', entity: entityName })
    );

    throw wrappedError;
  }
}

export async function deleteOptimisticImpl(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  options?: MutationOptions
): Promise<void> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // SOC2: rate limit before optimistic mutation
  if (self.security) {
    await self.security.checkRateLimit(rateLimitKey(self, collection), 'write');
  }

  // 1. Snapshot previous data from TanStack Query cache for rollback
  const queryClient = self.getQueryClient();
  const previousData =
    queryClient.getQueryData(['crud', collection, 'get', id]) ??
    getItemFromListCache(self, collection, id);

  // 2. Immediate optimistic removal
  if (self.store && previousData) {
    self.store.getState().deleteOptimistic(collection, id, previousData);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }

    // 3. Server call with concurrent mutation protection
    const adapter = self.adapter;
    await runSerializedMutation(self, collection, id, async () => {
      await withResilience(() => adapter.delete(collection, id));
    });

    // 4. Update TanStack Query caches FIRST
    updateListCaches(self, collection, id, null, CRUD_OPERATION.DELETE);

    // 5. Confirm delete (removes optimistic flag)
    if (self.store) {
      self.store.getState().confirmDelete(collection, id);
    }

    // SOC2: audit delete + record anomaly for bulk-delete detection
    auditCrud(self, 'crud.delete', collection, id);
    self.security?.recordAnomaly?.(
      'bulk.deletes',
      self.currentUserId ?? undefined
    );

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.deleteSuccess', { ns: 'crud', entity: entityName })
      );
    }
  } catch (error) {
    // Rollback: restore item to cache
    if (previousData) {
      updateListCaches(self, collection, id, previousData, CRUD_OPERATION.ADD);
    }
    // Then remove optimistic flag
    if (self.store) {
      self.store.getState().rejectDelete(collection, id);
    }

    const wrappedError = handleError(error, {
      userMessage: `Failed to delete ${collection}`,
      showNotification: true,
    });

    const i18n = getI18nInstance();
    const entityName = getEntityName(collection);
    toast(
      'error',
      i18n.t('messages.deleteError', { ns: 'crud', entity: entityName })
    );

    throw wrappedError;
  }
}
