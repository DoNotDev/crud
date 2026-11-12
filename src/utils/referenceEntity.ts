// packages/features/crud/src/utils/referenceEntity.ts

/**
 * @fileoverview Reference target resolution
 * @description Resolves a reference field's collection (`validation.reference`) to the
 * entity registered by `defineEntity`, so referenced records are read with their real
 * schema (access, field mapping, visibility). Pure: safe on server and client.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { getEntityByCollection } from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

const warnedCollections = new Set<string>();

/**
 * Entity for a referenced collection. Without one, callers keep showing raw ids;
 * development builds warn once per collection.
 *
 * @param collection - The reference field's `validation.reference`
 * @param referencedBy - `entity.field` label for the warning
 * @returns The referenced entity, or `undefined` when no entity defines that collection
 */
export function resolveReferenceEntity(
  collection: string,
  referencedBy: string
): AnyEntity | undefined {
  const entity = getEntityByCollection(collection);
  if (
    !entity &&
    process.env.NODE_ENV === 'development' &&
    !warnedCollections.has(collection)
  ) {
    warnedCollections.add(collection);
    console.warn(
      `[crud] No entity defined for collection "${collection}" (referenced by ${referencedBy}): ` +
        `reference values show raw ids. Define it with defineEntity().`
    );
  }
  return entity;
}
