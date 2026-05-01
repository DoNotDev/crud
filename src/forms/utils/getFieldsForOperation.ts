// packages/features/crud/src/forms/utils/getFieldsForOperation.ts

/**
 * @fileoverview Field filtering utility
 * @description Filters entity fields based on operation type, visibility, and viewer role.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  EDITABLE,
  isFieldVisible,
  type AnyEntity,
  type EntityField,
  type FieldType,
} from '@donotdev/core';

import { isFieldEditable } from './isFieldEditable';

/** Entity fields input - supports Entity, Entity['fields'], or plain Record */
export type EntityFieldsInput =
  | AnyEntity
  | AnyEntity['fields']
  | Record<string, EntityField<FieldType>>;

/** Field with computed editability for rendering */
export interface RenderableField<T extends FieldType = FieldType> {
  /** Field name/key */
  name: string;
  /** Field configuration */
  config: EntityField<T>;
  /** Whether field is editable (input vs read-only) */
  editable: boolean;
}

/** Options for field filtering */
export interface GetFieldsForOperationOptions {
  /** Form operation type */
  operation: 'create' | 'edit';
  /** Viewer role for editability checks (defaults to 'guest' if undefined) */
  viewerRole?: string;
  /**
   * Available field names (for edit mode).
   * When provided, only fields in this list are returned.
   * Typically comes from Object.keys(defaultValues) - backend-filtered data.
   */
  availableFields?: string[];
}

/**
 * Filters entity fields based on operation type and viewer role.
 *
 * Pure function, no React dependencies. Use for building custom form layouts.
 *
 * **Create operation:**
 * - Excludes `visibility: 'technical'` fields (auto-added by backend)
 * - Excludes `visibility: 'hidden'` fields (never shown)
 *
 * **Edit operation:**
 * - Excludes `visibility: 'hidden'` fields (never shown)
 * - Technical fields are marked as `editable: false` (read-only)
 * - If `availableFields` provided, only returns fields in that list (backend-filtered)
 *
 * @param entity - Entity definition from defineEntity()
 * @param options - Filtering options
 * @returns Array of renderable fields with computed editability
 *
 * @example
 * ```typescript
 * import { getFieldsForOperation } from '@donotdev/crud/forms';
 * import { productEntity } from './entities/product';
 *
 * // Create form - excludes technical and hidden
 * const createFields = getFieldsForOperation(productEntity, {
 *   operation: 'create',
 *   viewerRole: 'user'
 * });
 *
 * // Edit form - uses backend-filtered fields
 * const editFields = getFieldsForOperation(productEntity, {
 *   operation: 'edit',
 *   viewerRole: 'admin',
 *   availableFields: Object.keys(existingData)
 * });
 *
 * // Render custom form
 * editFields.map(({ name, config, editable }) => (
 *   editable
 *     ? <Input key={name} {...config} />
 *     : <ReadOnlyDisplay key={name} {...config} />
 * ));
 * ```
 *
 * @see {@link AnyEntity} for entity definition structure
 * @see {@link RenderableField} for return type
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function getFieldsForOperation(
  entity: EntityFieldsInput,
  options: GetFieldsForOperationOptions
): RenderableField[] {
  const { operation, viewerRole: viewerRoleProp, availableFields } = options;
  const viewerRole = viewerRoleProp ?? 'guest';

  // Handle Entity, Entity['fields'], or plain Record
  const fields: Record<string, EntityField<FieldType>> = entity &&
  typeof entity === 'object' &&
  'fields' in entity &&
  'name' in entity
    ? (entity as AnyEntity).fields
    : (entity as Record<string, EntityField<FieldType>>);

  const entries = Object.entries(fields);

  const result: RenderableField[] = [];

  for (const [fieldName, fieldDef] of entries) {
    const config = fieldDef;
    const visibility = config.visibility || 'guest';

    // Use unified visibility check (same as EntityDisplayRenderer)
    if (!isFieldVisible(visibility, viewerRole)) {
      continue;
    }

    // Generated/computed fields are never shown in forms
    if (
      config.editable === EDITABLE.GENERATED ||
      config.editable === EDITABLE.COMPUTED
    ) {
      continue;
    }

    // Create mode: also exclude technical fields (backend generates them)
    if (operation === 'create' && visibility === 'technical') {
      continue;
    }

    // Edit mode: only show fields that exist in availableFields (backend filtered)
    if (
      operation === 'edit' &&
      availableFields &&
      !availableFields.includes(fieldName)
    ) {
      continue;
    }

    // Determine editability
    let editable = isFieldEditable(config.editable, viewerRole, operation);

    // Technical fields default to read-only in edit mode, unless explicitly overridden
    if (
      operation === 'edit' &&
      visibility === 'technical' &&
      config.editable === undefined
    ) {
      editable = false;
    }

    result.push({ name: fieldName, config, editable });
  }

  return result;
}
