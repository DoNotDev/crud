// packages/features/crud/src/forms/utils/emptyValue.ts

/**
 * @fileoverview Empty value contract of entity forms
 * @description One value means "not filled in" in form state, in validated data and in
 * every adapter payload: `null`. It is native to Firestore, Postgres, REST and GraphQL,
 * survives JSON (an `undefined` key is dropped, so a cleared field would never be
 * written) and is what `v.nullish()` accepts for an optional field. `''` exists only
 * inside the DOM input: fields display `value ?? ''` and report an emptied input
 * through {@link fromInputValue}.
 *
 * @version 0.1.0
 * @since 0.2.4
 * @author AMBROISE PARK Consulting
 */

/**
 * The form-state value of a field that is not filled in.
 *
 * @since 0.2.4
 */
export const EMPTY_VALUE = null;

/**
 * Form-state value of a text input's DOM value: an emptied input is {@link EMPTY_VALUE}.
 *
 * @param value - The input's DOM value
 * @returns The value to store in form state
 *
 * @example
 * ```tsx
 * <Input value={field.value ?? ''} onChange={(e) => field.onChange(fromInputValue(e.target.value))} />
 * ```
 *
 * @since 0.2.4
 */
export function fromInputValue(value: string): string | null {
  return value === '' ? EMPTY_VALUE : value;
}
