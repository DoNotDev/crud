'use client';
// packages/features/crud/src/forms/hooks/useController.ts

/**
 * @fileoverview useController Hook Wrapper
 * @description Framework-provided useController that uses framework's react-hook-form types.
 * Use this instead of importing useController directly from react-hook-form to avoid type mismatches.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useController as useControllerRHF } from 'react-hook-form';

import type {
  Control,
  FieldPath,
  FieldValues,
  UseControllerProps,
  UseControllerReturn,
} from 'react-hook-form';

/**
 * Framework-provided useController hook
 *
 * Use this instead of importing useController from react-hook-form directly.
 * This ensures type compatibility with framework's Control types.
 *
 * @template TFieldValues - Form values type
 * @template TName - Field name path
 * @param props - Controller props (name and control)
 * @returns Controller return value (field, fieldState, formState)
 *
 * @example
 * ```tsx
 * import { useController } from '@donotdev/crud';
 * import type { ControlledFieldProps } from '@donotdev/crud';
 *
 * function MyCustomField({ control, fieldConfig }: ControlledFieldProps) {
 *   const { field, fieldState } = useController({
 *     name: fieldConfig.name,
 *     control: control,
 *   });
 *   // ...
 * }
 * ```
 */
export function useController<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
  props: UseControllerProps<TFieldValues, TName>
): UseControllerReturn<TFieldValues, TName> {
  return useControllerRHF<TFieldValues, TName>(props);
}

// Re-export types for convenience
export type {
  UseControllerProps,
  UseControllerReturn,
  ControllerRenderProps,
  ControllerFieldState,
} from 'react-hook-form';
