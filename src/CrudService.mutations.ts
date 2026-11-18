// packages/features/crud/src/CrudService.mutations.ts

/**
 * @fileoverview CrudService write operations
 * @description set / update / delete / add impl functions. Each follows the
 * same shape: snapshot → optimistic store update → resilient adapter call
 * under mutation serialization → cache update → confirm or roll back.
 *
 * Extracted from CrudService.ts to keep each file under the 500-LOC cap.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { toast } from '@donotdev/components';
import type { CrudCreateInput, dndevSchema } from '@donotdev/core';
import {
  generateUUID,
  getI18nInstance,
  handleError,
  prepareCreate,
  prepareUpdate,
} from '@donotdev/core';

import {
  checkUniquenessFromCache,
  getItemFromListCache,
  updateListCaches,
} from './CrudService.cache';
import {
  assertCanAccess,
  auditCrud,
  decryptPiiRow,
  ensureAdapter,
  getEntityName,
  getPiiFields,
  rateLimitKey,
  runSerializedMutation,
  shouldShowSuccessToast,
  withResilience,
} from './CrudService.internal';
import { entitySchemasOf, storedRowsFor, writtenOf } from './CrudService.writeRules';
import { CRUD_OPERATION } from './types';
import type { CrudServiceInternal, MutationOptions } from './types';

export async function setImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  input: T,
  _schema: dndevSchema<T>,
  options?: MutationOptions
): Promise<Record<string, unknown>> {
  // CRUD create rules (core/schemas crud/create) on the entity's schemas: a full write is
  // validated like a create. The caller's schema is not used: the rules pick it.
  const schemas = entitySchemasOf(collection);
  const prepared = prepareCreate(schemas, input as Record<string, unknown>);
  // why: the entity's schemas are built at runtime (dndevSchema<unknown>); the adapter API carries the caller's row type T
  const schema = schemas[prepared.schemaKey] as dndevSchema<T>;
  const data = writtenOf(prepared, collection, 'set') as T;

  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  // Snapshot for rollback from TanStack Query cache
  const queryClient = self.getQueryClient();
  const previousData =
    queryClient.getQueryData<T>(['crud', collection, 'get', id]) ?? null;

  // Optimistic update in store
  if (self.store) {
    self.store.getState().updateOptimistic(collection, id, data, previousData);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }
    assertCanAccess(self.adapter, collection, schema);

    // SOC2: rate limit write, encrypt PII before storage
    if (self.security) {
      await self.security.checkRateLimit(
        rateLimitKey(self, collection),
        'write'
      );
    }
    const piiFields = getPiiFields(schema);
    const payload =
      piiFields.length > 0 && self.security
        ? (self.security.encryptPii(
            data as Record<string, unknown>,
            piiFields
          ) as T)
        : data;

    const adapter = self.adapter;
    const written = await runSerializedMutation(self, collection, id, () =>
      withResilience(() =>
        adapter.set<T>(collection, id, payload, schema, {
          readSchema: options?.readSchema,
        })
      )
    );
    // What the backend stored (its own values included), PII decrypted like a read.
    const stored = decryptPiiRow(self, schema, written);

    // Update TanStack Query caches FIRST (before removing optimistic flag)
    // Use SET (full replacement) — not UPDATE (partial merge)
    updateListCaches(
      self,
      collection,
      id,
      { ...(data as Record<string, unknown>), ...stored, id } as T,
      CRUD_OPERATION.SET
    );

    // Then confirm optimistic (removes the flag)
    if (self.store) {
      self.store.getState().confirmUpdate(collection, id);
    }

    // SOC2: audit update (set = full replacement, semantically an update)
    auditCrud(self, 'crud.update', collection, id);

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.updateSuccess', { ns: 'crud', entity: entityName })
      );
    }
    return stored;
  } catch (error) {
    // Rollback: restore original data to cache (full replacement, matching SET semantics)
    if (previousData) {
      updateListCaches(
        self,
        collection,
        id,
        previousData as T,
        CRUD_OPERATION.SET
      );
    }
    // Then remove optimistic flag
    if (self.store) {
      self.store.getState().rejectUpdate(collection, id);
    }

    const wrappedError = handleError(error, {
      userMessage: `Failed to save ${collection}`,
      showNotification: true,
    });

    const i18n = getI18nInstance();
    const entityName = getEntityName(collection);
    toast(
      'error',
      i18n.t('messages.updateError', { ns: 'crud', entity: entityName })
    );

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

export async function updateImpl<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  patch: Partial<T>,
  _schema?: dndevSchema<T>,
  options?: MutationOptions
): Promise<Record<string, unknown>> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // CRUD update rules (core/schemas crud/update) on the entity's schemas and the stored
  // row (cache, else read). The caller's schema is not used: the rules pick it.
  const schemas = entitySchemasOf(collection);
  const patchRecord = patch as Record<string, unknown>;
  const storedRows = await storedRowsFor(self, collection, [{ id, patch: patchRecord }], schemas.get);
  const prepared = prepareUpdate(schemas, { id, patch: patchRecord, stored: storedRows.get(id) });
  // why: the entity's schemas are built at runtime (dndevSchema<unknown>); the adapter API carries the caller's row type T
  const schema = schemas[prepared.schemaKey] as dndevSchema<T>;
  const data = writtenOf(prepared, collection, 'update') as Partial<T>;

  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  // Snapshot previous data from TanStack Query cache for rollback
  const queryClient = self.getQueryClient();
  const previousData =
    queryClient.getQueryData<T>(['crud', collection, 'get', id]) ??
    getItemFromListCache<T>(self, collection, id);

  const mergedData = previousData
    ? { ...previousData, ...data }
    : { ...data, id };

  // Optimistic Update in store — always apply regardless of cold cache.
  // On cold cache previousData is null; mergedData is the partial update.
  // Rollback on error falls back to invalidation when no snapshot is available.
  if (self.store) {
    self.store
      .getState()
      .updateOptimistic(collection, id, mergedData, previousData ?? null);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }
    assertCanAccess(self.adapter, collection, schema);

    // SOC2: rate limit write, encrypt PII fields
    if (self.security) {
      await self.security.checkRateLimit(
        rateLimitKey(self, collection),
        'write'
      );
    }
    const piiFields = getPiiFields(schema);
    const payload =
      piiFields.length > 0 && self.security
        ? (self.security.encryptPii(
            data as Record<string, unknown>,
            piiFields
          ) as Partial<T>)
        : data;

    const adapter = self.adapter;
    const written = await runSerializedMutation(self, collection, id, () =>
      withResilience(() =>
        adapter.update<T>(collection, id, payload, {
          readSchema: options?.readSchema,
        })
      )
    );
    // What the backend stored (its own values included), PII decrypted like a read.
    const stored = decryptPiiRow(self, schema, written);

    // Update TanStack Query caches FIRST (before removing optimistic flag):
    // the stored values over the optimistic merge.
    updateListCaches(
      self,
      collection,
      id,
      { ...mergedData, ...stored } as T,
      CRUD_OPERATION.UPDATE
    );

    // Then confirm optimistic (removes the flag)
    if (self.store) {
      self.store.getState().confirmUpdate(collection, id);
    }

    // SOC2: audit update
    auditCrud(self, 'crud.update', collection, id);

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.updateSuccess', { ns: 'crud', entity: entityName })
      );
    }
    return stored;
  } catch (error) {
    // Rollback: restore original data to cache
    if (previousData) {
      updateListCaches(
        self,
        collection,
        id,
        previousData as T,
        CRUD_OPERATION.UPDATE
      );
    } else {
      // No snapshot available (cold cache) — invalidate to force a refetch rather than leaving stale optimistic data
      void self.invalidateCollection(collection);
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

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

export async function deleteImpl(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  options?: MutationOptions
): Promise<void> {
  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  // Snapshot from TanStack Query cache for rollback
  const queryClient = self.getQueryClient();
  const previousData =
    queryClient.getQueryData(['crud', collection, 'get', id]) ??
    getItemFromListCache(self, collection, id);

  // Optimistic delete in store
  if (self.store && previousData) {
    self.store.getState().deleteOptimistic(collection, id, previousData);
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }

    // SOC2: rate limit write before executing delete
    if (self.security) {
      await self.security.checkRateLimit(
        rateLimitKey(self, collection),
        'write'
      );
    }

    const adapter = self.adapter;
    await runSerializedMutation(self, collection, id, async () => {
      await withResilience(() => adapter.delete(collection, id));
    });

    // Update TanStack Query caches FIRST (before removing optimistic flag)
    updateListCaches(self, collection, id, null, CRUD_OPERATION.DELETE);

    // Then confirm delete (removes the flag)
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
    // No cache rollback: caches are written only after the server confirms the
    // delete, so on failure they still hold the row. Dropping the optimistic flag
    // restores it (re-adding it would duplicate the row in every cached list).
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

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}

export async function addImpl<T extends Record<string, unknown>>(
  self: CrudServiceInternal,
  collection: string,
  input: CrudCreateInput<T>,
  _schema: dndevSchema<T>,
  options?: MutationOptions
): Promise<string> {
  // CRUD create rules (core/schemas crud/create) on the entity's schemas: status (default
  // `available`), schema, parse. The caller's schema is not used: the rules pick it.
  const schemas = entitySchemasOf(collection);
  const prepared = prepareCreate(schemas, input as Record<string, unknown>);
  // why: the entity's schemas are built at runtime (dndevSchema<unknown>); the adapter API carries the caller's row type T
  const schema = schemas[prepared.schemaKey] as dndevSchema<T>;
  const data = writtenOf(prepared, collection, 'add') as CrudCreateInput<T>;

  // Auto-initialize with Firestore if not already initialized
  await ensureAdapter(self);

  // Frontend uniqueness check from cache (list/listCard queries)
  // findOrCreate: returns existing ID immediately, no server call
  // Strict duplicate: throws error for the user
  const cachedId = checkUniquenessFromCache(self, collection, data, schema);
  if (cachedId) {
    return cachedId;
  }

  if (self.store) {
    self.store.getState().setLoading(collection, true);
    self.store.getState().setError(collection, null);
  }

  // Generate temp ID for optimistic update
  const tempId = `temp_${generateUUID()}`;

  // Optimistic add in store
  if (self.store) {
    self.store
      .getState()
      .addOptimistic(collection, tempId, { ...data, id: tempId });
  }

  try {
    if (!self.adapter) {
      throw new Error('Adapter not initialized');
    }
    assertCanAccess(self.adapter, collection, schema);

    // SOC2: rate limit write, encrypt PII before storage
    if (self.security) {
      await self.security.checkRateLimit(
        rateLimitKey(self, collection),
        'write'
      );
    }
    const piiFields = getPiiFields(schema);
    const payload =
      piiFields.length > 0 && self.security
        ? (self.security.encryptPii(
            data as Record<string, unknown>,
            piiFields
          ) as T)
        : data;

    const adapter = self.adapter;
    const addResult = await withResilience(() =>
      adapter.add<T>(collection, payload as T, schema, {
        readSchema: options?.readSchema,
      })
    );
    const realId = addResult.id;
    // Use server-returned data for cache (correct for findOrCreate)
    const serverData = addResult.data as T;

    // Update TanStack Query caches FIRST (before removing optimistic flag)
    // Remove the temp item and add the real item
    updateListCaches(self, collection, tempId, null, CRUD_OPERATION.DELETE); // Remove temp
    updateListCaches(self, collection, realId, serverData, CRUD_OPERATION.ADD);

    // Then confirm optimistic (removes the flag)
    if (self.store) {
      self.store
        .getState()
        .confirmOptimistic(collection, tempId, realId, serverData);
    }

    // SOC2: audit create
    auditCrud(self, 'crud.create', collection, realId);

    if (shouldShowSuccessToast(self, options)) {
      const i18n = getI18nInstance();
      const entityName = getEntityName(collection);
      toast(
        'success',
        i18n.t('messages.createSuccess', { ns: 'crud', entity: entityName })
      );
    }
    return realId;
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

    if (self.store) {
      self.store.getState().setError(collection, wrappedError);
    }

    throw wrappedError;
  } finally {
    if (self.store) {
      self.store.getState().setLoading(collection, false);
    }
  }
}
