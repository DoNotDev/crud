// packages/features/crud/src/forms/utils/isFieldEditable.ts

/**
 * @fileoverview Field editability utility
 * @description Determines if a field is editable for a viewer and operation, from the entity descriptor.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describeEntity } from '@donotdev/core';
import type { AnyEntity, FieldOperation } from '@donotdev/core';

/** Viewer role type - used for editability checks */
export type ViewerRole = 'public' | 'guest' | 'user' | 'admin' | 'super';

/**
 * Determines if a field is edited as an input by the current viewer, from the
 * entity descriptor (`describeEntity(entity).fields[name].editableFor`): the same
 * rule as forms, grids and URL prefills.
 *
 * - Only the `user` write class is editable: `editable: 'generated'`, `'computed'`,
 *   `false`, hidden fields and backend names (`id`, `createdAt`, ...) never are
 * - `editable` unset / `true`: editable, except technical fields (read-only)
 * - `'create-only'`: editable on create only
 * - a role: `hasRoleAccess(viewerRole, role)` (guest < user < admin < super)
 *
 * NOTE: Visibility is handled by backend - this function only handles editability (UI concern).
 *
 * @param entity - Entity from `defineEntity()`
 * @param fieldName - Field name (key in `entity.fields`)
 * @param viewerRole - Current viewer's role
 * @param operation - Form operation type
 * @returns Whether the field should be rendered as an input (true) or read-only (false)
 * @throws When `entity` has no field `fieldName`
 *
 * @example
 * ```typescript
 * // fields: { title: {}, status: { editable: 'admin' }, sku: { editable: 'create-only' } }
 * isFieldEditable(productEntity, 'title', 'user', 'edit');  // true
 * isFieldEditable(productEntity, 'status', 'user', 'edit'); // false (user < admin)
 * isFieldEditable(productEntity, 'sku', 'admin', 'edit');   // false (create only)
 * isFieldEditable(productEntity, 'createdAt', 'super', 'edit'); // false (backend-generated)
 * ```
 *
 * @see `Editable` (`@donotdev/core`) for editable configuration options
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function isFieldEditable(
  entity: AnyEntity,
  fieldName: string,
  viewerRole: string,
  operation: FieldOperation
): boolean {
  const descriptor = describeEntity(entity).fields[fieldName];
  if (!descriptor) {
    throw new Error(
      `isFieldEditable: entity "${entity.name}" has no field "${fieldName}".`
    );
  }
  return descriptor.editableFor(viewerRole, operation);
}
