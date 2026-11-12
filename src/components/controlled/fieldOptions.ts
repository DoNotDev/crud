// packages/features/crud/src/components/controlled/fieldOptions.ts

import type {
  BuiltInFieldType,
  EntityField,
  UIFieldOptions,
} from '@donotdev/core';

/**
 * `options` of an entity field as read by the built-in controlled fields.
 *
 * Adds the top-level keys those fields forward to their component that
 * `UIFieldOptions` does not declare. Internal: not exported from the package.
 */
export type ControlledFieldOptions = UIFieldOptions & {
  showCharCount?: boolean;
  autoResize?: boolean;
  rows?: number;
  maxFiles?: number;
};

/**
 * Field `options`, `{}` when absent, typed with the keys built-in controlled fields read.
 *
 * @param fieldConfig - Entity field passed to the controlled component
 * @returns The field's options object
 */
export function controlledFieldOptions(
  fieldConfig: EntityField
): ControlledFieldOptions {
  return fieldConfig.options || {};
}

/**
 * Upload fields' `options.fieldSpecific` (`maxSize`, `storagePath`, plus `image` processing
 * options for image fields).
 *
 * @param fieldConfig - Entity field of an upload type (file, image, document, ...)
 * @returns The field-specific options, `undefined` when absent
 */
export function uploadFieldSpecific(fieldConfig: EntityField):
  | (NonNullable<UIFieldOptions<'image'>['fieldSpecific']> & {
      image?: unknown;
    })
  | undefined {
  // why: controlled fields receive EntityField<FieldType>, so fieldSpecific is the union of every type's shape; the registry only routes upload types here. `image` is read raw and validated by readImageProcessingOptions.
  return fieldConfig.options?.fieldSpecific as
    | (UIFieldOptions<'image'>['fieldSpecific'] & { image?: unknown })
    | undefined;
}

/**
 * `options.fieldSpecific` typed with the shape `@donotdev/core` declares for a
 * built-in field type.
 *
 * @param fieldConfig - Entity field whose `type` is `FT`
 * @returns The field-specific options, `undefined` when absent
 */
export function fieldSpecificOf<FT extends BuiltInFieldType>(
  fieldConfig: EntityField
): UIFieldOptions<FT>['fieldSpecific'] | undefined {
  // why: controlled fields receive EntityField<FieldType>, so fieldSpecific is the union of every type's shape; the registry routes only fields of type FT to the caller.
  return fieldConfig.options?.fieldSpecific as
    UIFieldOptions<FT>['fieldSpecific'] | undefined;
}
