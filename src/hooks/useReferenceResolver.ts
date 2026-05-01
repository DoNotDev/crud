'use client';
// packages/features/crud/src/hooks/useReferenceResolver.ts

/**
 * @fileoverview useReferenceResolver Hook
 * @description Pre-fetches referenced collections for an entity and builds
 * a lookup map: `{ collectionName: { [id]: displayLabel } }`.
 * Used by EntityList to resolve reference IDs to human-readable labels.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo } from 'react';

import type { AnyEntity } from '@donotdev/core';

import { buildReferenceLabel } from '../components/controlled/select/ControlledReferenceField';
import { useCrudList } from '../useCrudList';

/** Lookup map: collection → { id → displayLabel } */
export type ReferenceData = Record<string, Record<string, string>>;

/** Internal type for collected reference field info */
interface ReferenceFieldInfo {
  collection: string;
  labelFields?: string[];
  displayField?: string;
}

/**
 * Scan entity fields and collect unique referenced collections with their label config.
 */
function collectReferenceFields(entity: AnyEntity): ReferenceFieldInfo[] {
  const seen = new Map<string, ReferenceFieldInfo>();

  for (const field of Object.values(entity.fields)) {
    const collection = field.validation?.reference;
    if (typeof collection === 'string' && !seen.has(collection)) {
      const fieldSpecific = field.options?.fieldSpecific as
        | { labelFields?: string[]; displayField?: string }
        | undefined;
      seen.set(collection, {
        collection,
        labelFields: fieldSpecific?.labelFields,
        displayField: fieldSpecific?.displayField,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Hook that fetches referenced collections for an entity and builds a lookup map.
 *
 * Supports up to 4 unique referenced collections. Each collection is fetched via useCrudList.
 * Because hooks must be called unconditionally, we always call all 4 useCrudList slots
 * and disable unused ones.
 *
 * @param entity - The entity whose reference fields to resolve
 * @returns ReferenceData lookup map
 */
export function useReferenceResolver(
  entity: AnyEntity,
  enabled = true
): ReferenceData {
  // Collect reference fields — memoized on entity identity
  const refFields = useMemo(() => collectReferenceFields(entity), [entity]);

  // We support up to 4 referenced collections (hooks must be called unconditionally)
  const ref0 = refFields[0];
  const ref1 = refFields[1];
  const ref2 = refFields[2];
  const ref3 = refFields[3];

  const { items: items0 } = useCrudList<{ id: string }>(
    ref0?.collection ?? '__disabled_0__',
    { enabled: enabled && !!ref0 }
  );
  const { items: items1 } = useCrudList<{ id: string }>(
    ref1?.collection ?? '__disabled_1__',
    { enabled: enabled && !!ref1 }
  );
  const { items: items2 } = useCrudList<{ id: string }>(
    ref2?.collection ?? '__disabled_2__',
    { enabled: enabled && !!ref2 }
  );
  const { items: items3 } = useCrudList<{ id: string }>(
    ref3?.collection ?? '__disabled_3__',
    { enabled: enabled && !!ref3 }
  );

  const allResults = [
    { info: ref0, items: items0 },
    { info: ref1, items: items1 },
    { info: ref2, items: items2 },
    { info: ref3, items: items3 },
  ];

  return useMemo(() => {
    const data: ReferenceData = {};

    for (const { info, items } of allResults) {
      if (!info || !items.length) continue;
      const lookup: Record<string, string> = {};
      for (const item of items) {
        const rec = item as Record<string, any>;
        lookup[rec.id] = buildReferenceLabel(
          rec,
          info.labelFields,
          info.displayField
        );
      }
      data[info.collection] = lookup;
    }

    return data;
  }, [
    ref0?.collection,
    items0,
    ref1?.collection,
    items1,
    ref2?.collection,
    items2,
    ref3?.collection,
    items3,
  ]);
}
