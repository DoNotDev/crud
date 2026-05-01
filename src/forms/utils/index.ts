// packages/features/crud/src/forms/utils/index.ts

/**
 * @fileoverview Form utilities barrel export
 * @description Exports all form utility functions for custom form building.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

export { isFieldEditable } from './isFieldEditable';
export type { ViewerRole } from './isFieldEditable';
export { getFieldsForOperation } from './getFieldsForOperation';
export type {
  RenderableField,
  GetFieldsForOperationOptions,
  EntityFieldsInput,
} from './getFieldsForOperation';
export { validateEntity } from './validateEntity';
export type {
  ValidationIssue,
  ValidationResult,
  SchemaOperation,
} from './validateEntity';
export { translateFieldLabel, translateLabel } from './translateFieldLabel';
