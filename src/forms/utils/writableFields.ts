// packages/features/crud/src/forms/utils/writableFields.ts

/**
 * @fileoverview Fields a form writes
 * @description Field names the viewer's form (record form, child-row grid, default
 * writer) writes for an operation, from the entity descriptor (design 3.4). The
 * same set is the form state (`buildInitialFromRecord`), the local draft and the
 * default writer's payload.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { describeEntity } from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

import { getFieldsForOperation } from './getFieldsForOperation';

/**
 * Fields the viewer may write on the entity for an operation, from the entity
 * descriptor: visible fields the form writes (`user` fields editable for the role
 * and operation, `derived` / `editable: 'computed'` fields) and their i18n
 * companions (`<name>I18n`). Generated, technical, `editable: false` and
 * role-denied fields are never written by forms or grids.
 *
 * @param entity - The entity
 * @param viewerRole - The viewer's role
 * @param operation - `'create'` (inserts) or `'edit'` (patches)
 * @returns The writable field names (companions included)
 *
 * @version 0.2.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */
export function writableFields(
  entity: AnyEntity,
  viewerRole: string,
  operation: 'create' | 'edit'
): Set<string> {
  const { fields } = describeEntity(entity);
  return new Set(
    getFieldsForOperation(entity, { operation, viewerRole })
      .filter((field) => field.written)
      .flatMap((field) => {
        const companion = fields[field.name]?.companion;
        return companion ? [field.name, companion] : [field.name];
      })
  );
}
