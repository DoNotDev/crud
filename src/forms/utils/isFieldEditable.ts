// packages/features/crud/src/forms/utils/isFieldEditable.ts

/**
 * @fileoverview Field editability utility
 * @description Determines if a field is editable based on editable config, viewer role, and operation.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { EDITABLE, hasRoleAccess } from '@donotdev/core';
import type { Editable } from '@donotdev/core';

/** Viewer role type - used for editability checks */
export type ViewerRole = 'public' | 'guest' | 'user' | 'admin' | 'super';

/**
 * Determines if a field is editable by the current viewer.
 *
 * NOTE: Visibility is handled by backend - this function only handles editability (UI concern).
 *
 * @param editable - Field's editable configuration
 * @param viewerRole - Current viewer's role
 * @param operation - Form operation type
 * @returns Whether the field should be rendered as an input (true) or read-only (false)
 *
 * @example
 * ```typescript
 * // Default editable
 * isFieldEditable(undefined, 'user', 'create'); // true
 *
 * // Role-based (uses hierarchy: guest < user < admin < super)
 * isFieldEditable('admin', 'user', 'edit'); // false
 * isFieldEditable('admin', 'admin', 'edit'); // true
 * isFieldEditable('user', 'admin', 'edit'); // true (admin >= user)
 * isFieldEditable('super', 'admin', 'edit'); // false (admin < super)
 *
 * // Create-only field (`EDITABLE` from `@donotdev/core`; string literals still valid)
 * isFieldEditable(EDITABLE.CREATE_ONLY, 'user', 'create'); // true
 * isFieldEditable(EDITABLE.CREATE_ONLY, 'user', 'edit'); // false
 *
 * // Generated/computed — always false (excluded from forms)
 * isFieldEditable(EDITABLE.GENERATED, 'admin', 'create'); // false
 * isFieldEditable(EDITABLE.COMPUTED, 'admin', 'edit'); // false
 * ```
 *
 * @see {@link Editable} for editable configuration options
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function isFieldEditable(
  editable: Editable | undefined,
  viewerRole: string,
  operation: 'create' | 'edit'
): boolean {
  // Default to true if not specified
  if (editable === undefined || editable === true) return true;

  // Never editable
  if (editable === false) return false;

  // DB-generated / UI-computed — never editable (caller decides form inclusion)
  if (editable === EDITABLE.GENERATED || editable === EDITABLE.COMPUTED)
    return false;

  // Create only - editable if creating
  if (editable === EDITABLE.CREATE_ONLY) return operation === 'create';

  // Role-based: 'admin', 'super', 'user', etc. — uses hierarchy
  if (typeof editable === 'string') {
    return hasRoleAccess(viewerRole, editable);
  }

  return true;
}
