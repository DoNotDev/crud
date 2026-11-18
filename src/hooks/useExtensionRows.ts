'use client';
// packages/features/crud/src/hooks/useExtensionRows.ts

/**
 * @fileoverview useExtensionRows hook (internal)
 * @description Reads the 1:1 extension rows of a loaded set of records: one
 * batched query (`field in [ids]`, chunked by {@link EXTENSION_IN_CHUNK}),
 * cached under the extension collection (refetched when it is invalidated) and
 * merged with its optimistic writes. Nothing is read for a viewer without
 * access to the extension entity.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useRef } from 'react';

import { createSchemas, useQuery } from '@donotdev/core';
import type { dndevSchema } from '@donotdev/core';

import { useCrudStore } from '../CrudStore';
import type { OptimisticMeta } from '../types';
import { EMPTY_OPTIMISTIC, getCrudServiceInstance } from '../useCrud';
import { EXTENSION_IN_CHUNK } from '../forms/extend';
import type { ResolvedExtension } from '../forms/extend';
import { mergeWithOptimistic } from '../utils/mergeWithOptimistic';
import { injectScopeFilter } from '../utils/scopeUtils';

/** Typed empty optimistic map (the shared `EMPTY_OPTIMISTIC` is untyped). */
const NO_OPTIMISTIC: Record<string, OptimisticMeta> = {};

type Row = Record<string, unknown> & { id: string };

/** Extension rows of one extension, by extended record id. */
export interface ExtensionRows {
  /** Extension row of each record that has one */
  byRecord: Map<string, Row>;
  /** True while the first read is in flight */
  loading: boolean;
  /** Read error, or null */
  error: Error | null;
}

const NONE: Row[] = [];

/**
 * One extension's rows for `ids` (see the file overview).
 *
 * @param ext - The resolved extension
 * @param ids - Ids of the extended records loaded
 * @param enabled - Read at all (e.g. the records are loaded)
 */
function useOneExtension(
  ext: ResolvedExtension,
  ids: readonly string[],
  enabled: boolean
): ExtensionRows {
  const collection = ext.entity.collection;
  const schemas = useMemo(() => createSchemas(ext.entity), [ext.entity]);
  const optimistic = useCrudStore(
    (state) => state.collections[collection]?.optimistic || EMPTY_OPTIMISTIC
  ) as Record<string, OptimisticMeta>;
  const idsKey = [...new Set(ids)].sort();
  const active = enabled && ext.readable && idsKey.length > 0;

  const query = useQuery({
    queryKey: ['crud', collection, 'extend', ext.field, idsKey],
    queryFn: async (): Promise<Row[]> => {
      const service = getCrudServiceInstance();
      if (!service) throw new Error('CRUD service is not ready');
      const chunks: string[][] = [];
      for (let i = 0; i < idsKey.length; i += EXTENSION_IN_CHUNK) {
        chunks.push(idsKey.slice(i, i + EXTENSION_IN_CHUNK));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          service.query<Row>(
            collection,
            injectScopeFilter(
              { where: [{ field: ext.field, operator: 'in', value: chunk }] },
              ext.entity.scope
            ),
            // why: createSchemas erases the row type; extension rows are records with an id
            schemas.get as dndevSchema<Row>
          )
        )
      );
      return results.flatMap((result) => result.items);
    },
    enabled: active,
  });

  const wanted = new Set(idsKey);
  const byRecord = new Map<string, Row>();
  for (const row of mergeWithOptimistic(
    active ? (query.data ?? NONE) : NONE,
    active ? optimistic : NO_OPTIMISTIC
  )) {
    const recordId = row[ext.field];
    if (typeof recordId === 'string' && wanted.has(recordId)) {
      byRecord.set(recordId, row);
    }
  }
  return {
    byRecord,
    loading: active && query.isLoading,
    error: active ? (query.error ?? null) : null,
  };
}

/**
 * Every extension's rows for `ids`, keyed by extension key. The set of
 * extension keys must not change while mounted (one read per key; throws).
 *
 * @param extensions - The resolved extensions
 * @param ids - Ids of the extended records loaded
 * @param enabled - Read at all
 */
export function useExtensionRows(
  extensions: readonly ResolvedExtension[],
  ids: readonly string[],
  enabled: boolean
): Record<string, ExtensionRows> {
  const keys = extensions.map((ext) => ext.key).join('|');
  const mountedKeys = useRef(keys);
  if (mountedKeys.current !== keys) {
    throw new Error(
      `extend: the extension keys changed while mounted ("${mountedKeys.current}" → "${keys}"). Keep the same keys, or remount (React key).`
    );
  }
  const result: Record<string, ExtensionRows> = {};
  for (const ext of extensions) {
    // Same keys on every render (checked above): a stable hook order.
    // eslint-disable-next-line react-hooks/rules-of-hooks -- why: fixed-length list, enforced above
    result[ext.key] = useOneExtension(ext, ids, enabled);
  }
  return result;
}
