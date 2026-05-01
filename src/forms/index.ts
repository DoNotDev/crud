// packages/features/crud/src/forms/index.ts

/**
 * @fileoverview Form building blocks for custom forms
 * @description Exposes low-level form utilities from @donotdev/crud for building custom forms.
 *
 * Import from '@donotdev/crud/forms' to access form building blocks:
 * - Hooks: useEntityForm, useEntityField
 * - Utilities: getFieldsForOperation, validateEntity
 * - Types: InferEntityData, EntityFormReturn, etc.
 *
 * @example
 * ```tsx
 * import { useEntityForm, getFieldsForOperation } from '@donotdev/crud/forms';
 * import { productEntity } from './entities/product';
 *
 * function ProductForm() {
 *   const form = useEntityForm(productEntity, { operation: 'create' });
 *
 *   return (
 *     <form onSubmit={form.handleSubmit(onSubmit)}>
 *       {form.fields.map(({ name, config, editable }) => (
 *         <Input key={name} label={config.label} {...form.register(name)} />
 *       ))}
 *     </form>
 *   );
 * }
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// Hooks
export { useEntityForm } from './hooks/useEntityForm';
export { useEntityField } from './hooks/useEntityField';
export { useController } from './hooks/useController';
export type {
  UseControllerProps,
  UseControllerReturn,
  ControllerRenderProps,
  ControllerFieldState,
} from './hooks/useController';

// Utilities
export {
  isFieldEditable,
  getFieldsForOperation,
  validateEntity,
  translateFieldLabel,
  translateLabel,
} from './utils';

// Types
export type {
  // Utility types
  ViewerRole,
  RenderableField,
  GetFieldsForOperationOptions,
  EntityFieldsInput,
  SchemaOperation,
  ValidationIssue,
  ValidationResult,
} from './utils';

export type {
  // Form types
  InferEntityData,
  InferEntityCreate,
  InferEntityInput,
  InferEntityOutput,
  UseEntityFormOptions,
  EntityFormReturn,
  EntityFieldReturn,
  // Re-exported core types
  Entity,
  EntityField,
  FieldType,
  Visibility,
  Editable,
  ValidationRules,
  dndevSchema,
} from './types';
