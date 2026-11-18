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
  describeEntity,
  describeField,
  isFieldVisible,
  type AnyEntity,
  type EntityField,
  type FieldDescriptor,
  type FieldType,
} from '@donotdev/core';

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
  /**
   * Whether the form writes the field: an input (`editable`) or a derived
   * (`editable: 'computed'`) field. Its value lives in form state; a field the form
   * does not write (technical, `editable: false`, role-denied) is read from
   * `form.record`.
   * @since 0.2.5
   */
  written: boolean;
  /**
   * Values the field's `conditions` read: the key of a 1:1 extension (`offer`)
   * for its prefixed fields (`offer.priceExclVat`); omitted for the entity's own.
   * @since 0.2.5
   */
  scope?: string;
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

/** Descriptors of a plain field map, built once per map (no entity name: errors name `<fields>`). */
const fieldMapCache = new WeakMap<object, Readonly<Record<string, FieldDescriptor>>>();

/**
 * Field descriptors of an entity (`describeEntity`, memoized) or of a plain field map.
 *
 * @param entity - Entity, `entity.fields` or a plain field map
 * @returns Field configurations and their descriptors, keyed by field name
 */
function describeInput(entity: EntityFieldsInput): {
  fields: Record<string, EntityField<FieldType>>;
  descriptors: Readonly<Record<string, FieldDescriptor>>;
} {
  if ('fields' in entity && 'name' in entity && typeof entity.name === 'string') {
    // why: the guard above identifies an entity (fields + name); a field map has field configs as values
    const whole = entity as AnyEntity;
    return { fields: whole.fields, descriptors: describeEntity(whole).fields };
  }
  const fields = entity as Record<string, EntityField<FieldType>>;
  let descriptors = fieldMapCache.get(fields);
  if (!descriptors) {
    descriptors = Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [
        name,
        describeField(name, field, '<fields>'),
      ])
    );
    fieldMapCache.set(fields, descriptors);
  }
  return { fields, descriptors };
}

/**
 * Filters entity fields based on operation type and viewer role, from the entity
 * descriptor (`describeEntity`: write class, `editableFor`, visibility).
 *
 * Pure function, no React dependencies. Use for building custom form layouts.
 *
 * Per write class (design 3.4):
 * - `never` (hidden, `editable: 'generated'`, backend names): not shown, except
 *   technical fields on edit, shown read-only (`id`, `createdAt`, ...)
 * - `program` (`editable: false`): shown read-only
 * - `derived` (`editable: 'computed'`): shown read-only, written by the form
 * - `user`: an input when `editableFor(viewerRole, operation)`, else read-only
 *
 * **Create operation:** excludes `visibility: 'technical'` fields.
 * **Edit operation:** if `availableFields` is provided, only returns those fields.
 * Fields the viewer cannot see (`visibility` above the role, `hidden`) are left out.
 *
 * @param entity - Entity definition from defineEntity(), or a field map
 * @param options - Filtering options
 * @returns Array of renderable fields with computed editability
 * @throws When a field has a custom type and no value shape (`describeEntity`)
 *
 * @example
 * ```typescript
 * import { getFieldsForOperation } from '@donotdev/crud/forms';
 * import { productEntity } from './entities/product';
 *
 * const editFields = getFieldsForOperation(productEntity, {
 *   operation: 'edit',
 *   viewerRole: 'admin',
 * });
 *
 * // Inputs for written editable fields; read-only display for the others
 * // (`written`: from form state, else from form.record)
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
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function getFieldsForOperation(
  entity: EntityFieldsInput,
  options: GetFieldsForOperationOptions
): RenderableField[] {
  const { operation, viewerRole: viewerRoleProp, availableFields } = options;
  const viewerRole = viewerRoleProp ?? 'guest';
  const { fields, descriptors } = describeInput(entity);

  const result: RenderableField[] = [];

  for (const [fieldName, config] of Object.entries(fields)) {
    const descriptor = descriptors[fieldName]!;
    const visibility = descriptor.visibleAt;

    // Use unified visibility check (same as EntityDisplayRenderer)
    if (!isFieldVisible(visibility, viewerRole)) continue;

    // Create mode: technical fields are set by the backend
    if (operation === 'create' && visibility === 'technical') continue;

    // Never written: only technical fields are shown (read-only, edit mode)
    if (descriptor.write === 'never' && visibility !== 'technical') continue;

    // Edit mode: only show fields that exist in availableFields (backend filtered)
    if (
      operation === 'edit' &&
      availableFields &&
      !availableFields.includes(fieldName)
    ) {
      continue;
    }

    const editable = descriptor.editableFor(viewerRole, operation);
    result.push({
      name: fieldName,
      config,
      editable,
      written: editable || descriptor.write === 'derived',
    });
  }

  return result;
}
