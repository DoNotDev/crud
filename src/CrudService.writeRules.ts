// packages/features/crud/src/CrudService.writeRules.ts

/**
 * @fileoverview Client side of the CRUD rules
 * @description What every client write site (`add` / `set` / `update` / `remove`, `bulk`,
 * `bulkAcross`) shares around the CRUD rules (`prepareCreate` / `prepareUpdate` /
 * `prepareRemove`, core/schemas crud/):
 * - `storedRowsFor`: the stored row each update needs (the caller's, else the cache, else
 *   one read), so client and server run the same rule on the same record;
 * - `writtenOf`: the values to write, or a throw; unknown fields warn the user
 *   (CRUD rule 8: neither silent nor blocking).
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */

import { toast } from '@donotdev/components';
import {
  assertWrite,
  createSchemas,
  DoNotDevError,
  getEntityByCollection,
  getI18nInstance,
  updateNeedsStored,
} from '@donotdev/core';
import type { AnyEntity, dndevSchema, OperationSchemas, PreparedWrite } from '@donotdev/core';

import { getImpl } from './CrudService.queries';
import type { CrudServiceInternal } from './types';

const schemasByEntity = new WeakMap<AnyEntity, OperationSchemas>();

/**
 * The schemas the CRUD rules run on for a collection: `createSchemas` of the entity
 * `defineEntity()` registered for it. Writers resolve them here, so callers keep passing
 * what they always passed (a schema, or nothing).
 *
 * @param collection - Collection written
 * @returns `createSchemas(entity)` (cached per entity)
 * @throws {DoNotDevError} `internal` when no entity is defined for the collection: a write
 *   is never left unvalidated
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */
export function entitySchemasOf(collection: string): OperationSchemas {
  const entity = getEntityByCollection(collection);
  if (!entity) {
    throw new DoNotDevError(
      `[dndev] "${collection}": no entity defined for this collection (defineEntity); the CRUD rules need it to validate writes.`,
      'internal'
    );
  }
  const cached = schemasByEntity.get(entity);
  if (cached) return cached;
  const schemas = createSchemas(entity);
  schemasByEntity.set(entity, schemas);
  return schemas;
}

/** One update as a writer receives it. */
export interface UpdateRowInput {
  id: string;
  patch: Readonly<Record<string, unknown>>;
  /** The stored row the patch was made against (a form's record); omitted: cache, else read */
  stored?: Readonly<Record<string, unknown>> | null;
}

/**
 * The stored row of each update that needs one (`updateNeedsStored`): the caller's,
 * else the `get` cache, else one read (`noCache`). A list-cache row is a projection and
 * never stands in for the record.
 *
 * @param self - CRUD service
 * @param collection - Collection updated
 * @param updates - The updates
 * @param readSchema - `createSchemas(entity).get`
 * @returns Stored row by id (ids whose patch needs none are absent)
 * @throws {DoNotDevError} `not-found` when a needed row does not exist
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */
export async function storedRowsFor(
  self: CrudServiceInternal,
  collection: string,
  updates: readonly UpdateRowInput[],
  readSchema: dndevSchema<unknown>
): Promise<Map<string, Readonly<Record<string, unknown>>>> {
  const rows = new Map<string, Readonly<Record<string, unknown>>>();
  const queryClient = self.getQueryClient();
  for (const { id, patch, stored } of updates) {
    if (!updateNeedsStored(patch)) continue;
    const row =
      stored ??
      queryClient.getQueryData<Record<string, unknown>>(['crud', collection, 'get', id]) ??
      ((await getImpl(self, collection, id, readSchema, { noCache: true })) as Record<string, unknown> | null);
    if (!row) {
      throw new DoNotDevError(`${collection}/${id} not found`, 'not-found');
    }
    rows.set(id, row);
  }
  return rows;
}

/**
 * The values a client write sends, or a throw. Unknown fields (CRUD rule 8) show the
 * user a warning naming them; the known fields are written.
 *
 * @param result - The CRUD rule result
 * @param collection - Collection written
 * @param context - Write site, named in the error (e.g. `useCrud.update`)
 * @returns The rule's `written`
 * @throws {DoNotDevError} `validation-failed` with `details.issues` when the write is invalid
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */
export function writtenOf(
  result: PreparedWrite,
  collection: string,
  context: string
): Record<string, unknown> {
  const written = assertWrite(result, `${context}(${collection})`);
  if (result.unknownKeys.length > 0) {
    toast(
      'warning',
      getI18nInstance().t('messages.unknownFields', {
        ns: 'crud',
        fields: result.unknownKeys.join(', '),
      })
    );
  }
  return written;
}
