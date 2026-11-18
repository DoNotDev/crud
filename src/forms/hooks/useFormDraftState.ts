'use client';
// packages/features/crud/src/forms/hooks/useFormDraftState.ts

/**
 * @fileoverview useFormDraftState hook
 * @description `useState` whose value lives in a form's draft. For page state
 * that is not a form field but is saved by the same page Save (a product list,
 * pending table edits). With leave-on-save the page unmounts before the server
 * answers; a rejected write brings the page back and this state with it.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useRef, useState } from 'react';

/** One page-state slot as the form sees it. */
export interface FormDraftSlot {
  /** Current value, read when the draft is saved. */
  get: () => unknown;
  /** True when the current value differs from the initial one (the slot holds an edit). */
  edited: () => boolean;
  /** Apply a value restored from the draft. */
  restore: (value: unknown) => void;
  /** Back to the initial value (Discard, resetForm). */
  reset: () => void;
}

/** Slot registry exposed by `useEntityForm` as `form.draftState`. */
export interface FormDraftStateRegistry {
  /** Register a slot; returns its unregister function. */
  register: (key: string, slot: FormDraftSlot) => () => void;
  /** A slot changed: schedule the form's draft autosave. */
  changed: () => void;
}

/** Options for {@link useFormDraftState}. */
export interface UseFormDraftStateOptions<T> {
  /**
   * Validate a value read back from the draft (browser storage: untrusted, may
   * come from an older page version) and adjust it before it is applied, e.g.
   * drop table edits that already equal the loaded record. Throw to reject it;
   * the slot then keeps `initial`.
   */
  parse: (draft: unknown) => T;
}

/**
 * Page state saved in the form's draft: autosaved with it, saved at submit,
 * restored with it ("Draft restored" toast), reset by its Discard, cleared when
 * the submit succeeds and kept when it fails. A value different from `initial`
 * is an edit: it keeps the draft like a dirty field. Values must be JSON-serializable.
 *
 * @param form - The `useEntityForm` result that owns the page Save
 * @param key - Slot name, unique within the form
 * @param initial - Value when no draft exists (and after Discard)
 * @param options - See {@link UseFormDraftStateOptions}
 * @returns `[value, setValue]`, like `useState`
 *
 * @example
 * ```tsx
 * const form = useEntityForm(routineEntity, { formId: 'routine', operation: 'edit', defaultValues });
 * const [productIds, setProductIds] = useFormDraftState(form, 'productIds', initialIds, {
 *   parse: (draft) => v.parse(v.array(v.string()), draft),
 * });
 * const save = form.handleSubmit((values) => saveRoutine(values, productIds));
 * ```
 */
export function useFormDraftState<T>(
  form: { draftState: FormDraftStateRegistry },
  key: string,
  initial: T,
  options: UseFormDraftStateOptions<T>
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState(initial);
  // Read at save time, which can follow a set in the same handler (set, then submit).
  const current = useRef(value);
  const initialRef = useRef(initial);
  const parseRef = useRef(options.parse);
  useEffect(() => {
    initialRef.current = initial;
    parseRef.current = options.parse;
  });

  const { draftState } = form;
  useEffect(
    () =>
      draftState.register(key, {
        get: () => current.current,
        // Values are JSON by contract: compared as JSON.
        edited: () => JSON.stringify(current.current) !== JSON.stringify(initialRef.current),
        restore: (draft) => {
          let next: T;
          try {
            next = parseRef.current(draft);
          } catch (error) {
            // Not this page's shape (older version, edited storage): keep initial.
            console.warn(`[useFormDraftState] ${key}: draft value rejected`, error);
            return;
          }
          current.current = next;
          setValue(next);
        },
        reset: () => {
          current.current = initialRef.current;
          setValue(initialRef.current);
        },
      }),
    [draftState, key]
  );

  const set = (next: T | ((previous: T) => T)) => {
    // T is data (JSON), never a function: a function argument is the updater form.
    // TypeScript cannot narrow `T | updater` for a generic T (React's types use overloads).
    const resolved =
      typeof next === 'function'
        ? (next as (previous: T) => T)(current.current)
        : next;
    current.current = resolved;
    setValue(resolved);
    draftState.changed();
  };

  return [value, set];
}
