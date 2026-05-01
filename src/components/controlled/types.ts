'use client';
// packages/features/crud/src/components/controlled/types.ts

import type { EntityField, FieldType, ValueTypeForField } from '@donotdev/core';

import type {
  Control,
  ControllerRenderProps,
  FieldErrors,
  FieldValues,
  Path,
  RegisterOptions,
} from 'react-hook-form';

/**
 * Props for controlled field components (react-hook-form)
 *
 * Use framework's `useController` hook (from @donotdev/crud) instead of react-hook-form's useController
 * to ensure type compatibility.
 */
export interface ControlledFieldProps<
  T extends FieldValues = FieldValues,
  FT extends FieldType = FieldType,
> {
  /** Control object from react-hook-form - use with framework's useController hook */
  control: Control<T>;
  errors: FieldErrors<T>;
  fieldConfig: EntityField<FT>;
  t: (key: string, options?: Record<string, unknown>) => string;
  onChange?: (value: ValueTypeForField<FT>) => void;
  placeholder?: string;
  /** Whether the field is required (extracted from fieldConfig.validation by FormFieldRenderer) */
  required?: boolean;
  /** Field object from react-hook-form (provided by framework, no need to use useController) */
  field?: ControllerRenderProps<T, Path<T>>;
  /** Field state from react-hook-form (provided by framework, no need to use useController) */
  fieldState?: {
    error?: { message?: string };
    isDirty: boolean;
    isTouched: boolean;
    invalid: boolean;
  };
  /** Form ID for upload tracking - used by file upload fields */
  formId?: string;
}

/**

 * Convert pattern string to RegExp

 */

export function convertPatternToRegex(
  pattern: string | RegExp | undefined
): RegExp | undefined {
  if (!pattern) return undefined;

  if (pattern instanceof RegExp) return pattern;

  try {
    const match = /^\/(.*)\/([gimyus]*)$/.exec(pattern);

    if (match) {
      const [, regexPattern, flags] = match;

      if (regexPattern) {
        return new RegExp(regexPattern, flags);
      }
    }

    return new RegExp(pattern as string);
  } catch (e) {
    console.error('Error converting pattern to regex:', e);

    return undefined;
  }
}

/**

 * Convert validation rules to react-hook-form RegisterOptions

 */

export function convertValidationRules(validation: any): RegisterOptions {
  if (!validation) return {};

  const result: RegisterOptions = {};

  // Copy only react-hook-form compatible properties

  if (validation.required !== undefined) result.required = validation.required;

  if (validation.min !== undefined) result.min = validation.min;

  if (validation.max !== undefined) result.max = validation.max;

  if (validation.minLength !== undefined)
    result.minLength = validation.minLength;

  if (validation.maxLength !== undefined)
    result.maxLength = validation.maxLength;

  if (validation.pattern && typeof validation.pattern === 'string') {
    result.pattern = {
      value: convertPatternToRegex(validation.pattern) || /.*/,

      message: 'Invalid format',
    };
  }

  return result;
}
