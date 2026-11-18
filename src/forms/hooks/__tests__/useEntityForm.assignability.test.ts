// packages/features/crud/src/forms/hooks/__tests__/useEntityForm.assignability.test.ts

/**
 * @fileoverview Regression: a concrete entity's form is assignable wherever the form API takes it.
 *
 * Root cause (2026-11-17): `EntityFormReturn<E, Op, X>` extended
 * `UseFormReturn<FormValues<E, Op, X>>`. React Hook Form's types are invariant in their
 * values (`watch`, `control`, `setValue`, ...), so a form with `operation: 'create'` or
 * `'edit'` (Op inferred as the literal) was not an `EntityFormReturn<E>` (Op = both):
 * `useEntityField(form, 'x')` and app helpers `<E extends AnyEntity>(form:
 * EntityFormReturn<E>)` rejected it (TS2345 / TS2719 in consumer apps). Form state
 * (RHF `TFieldValues`) is now `EntityFormState<E, X>` (both operations); `Op` keys the
 * submitted values (RHF `TTransformedValues`, covariant), `operation`, `originalValues`.
 *
 * Type assertions (`expectTypeOf`, `@ts-expect-error`) are compile-time only: `dn tc`
 * excludes `__tests__`, so check them by typechecking a copy of this file inside `src`.
 */

import type { Control } from 'react-hook-form';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  AnyEntity,
  EntityExtensions,
  FieldOperation,
  FormValues,
} from '@donotdev/core';

import { FormFieldRenderer } from '../../../components/FormFieldRenderer';
import { useFieldConditions } from '../../../hooks/useFieldConditions';
import type {
  EntityFormReturn,
  EntityFormState,
  RenderableField,
} from '../../types';
import { useEntityField } from '../useEntityField';
import { useEntityForm } from '../useEntityForm';
import { movementEntity, movementOfferEntity as offerEntity } from '@dndev/test-entities';



type Movement = typeof movementEntity;

/** App helper shape (shopkb `EntityFields` / `groupFields`): any form of E. */
function fieldsOf<E extends AnyEntity>(
  form: EntityFormReturn<E>
): RenderableField[] {
  return form.fields;
}

/** App renderer shape (shopkb `EntityFields`): form state to the field API. */
function renderFields<E extends AnyEntity>(form: EntityFormReturn<E>) {
  const conditions = useFieldConditions(form.fields, form.control);
  return form.fields
    .filter(({ name }) => conditions[name]?.visible !== false)
    .map(({ name, config }) =>
      FormFieldRenderer({ name, config, control: form.control, t: form.t })
    );
}

/** App helper taking a form with 1:1 extensions: declares X. */
function extendedFieldsOf<E extends AnyEntity, X extends EntityExtensions>(
  form: EntityFormReturn<E, FieldOperation, X>
): RenderableField[] {
  return form.fields;
}

/** Non-generic helper over one entity (shopkb `RoutineForm`). */
function movementFields(form: EntityFormReturn<Movement>): RenderableField[] {
  return form.fields;
}

/** The consumer patterns; compiled, never called (hooks need a React tree). */
function consumerPatterns() {
  const createForm = useEntityForm(movementEntity, {
    formId: 'movement-create',
    operation: 'create',
    successPath: null,
  });
  const editForm = useEntityForm(movementEntity, { operation: 'edit' });
  const eitherForm = useEntityForm(movementEntity, {});
  const extendedForm = useEntityForm(movementEntity, {
    operation: 'edit',
    extend: { offer: { entity: offerEntity, field: 'movementId' } },
  });

  // Op is inferred as the literal and keys what is submitted
  expectTypeOf(createForm.operation).toEqualTypeOf<'create'>();
  expectTypeOf(editForm.operation).toEqualTypeOf<'edit'>();
  editForm.handleSubmit(async (values) => {
    expectTypeOf(values).toEqualTypeOf<FormValues<Movement, 'edit'>>();
  });

  // Form state is the same for every operation
  expectTypeOf(createForm.getValues()).toEqualTypeOf<
    EntityFormState<Movement>
  >();
  expectTypeOf(editForm.getValues()).toEqualTypeOf<
    EntityFormState<Movement>
  >();
  // App components typed `control: Control<T>` take any form's control
  const createControl: Control<EntityFormState<Movement>> = createForm.control;
  const editControl: Control<EntityFormState<Movement>> = editForm.control;

  // useEntityField: any form of the entity (StockMovementForm pattern)
  useEntityField(createForm, 'productId');
  useEntityField(createForm, 'quantity');
  useEntityField(editForm, 'note');
  useEntityField(eitherForm, 'code');
  useEntityField(extendedForm, 'productId');

  // Generic helpers typed EntityFormReturn<E> (EntityFields / CancelOrderDialog pattern)
  fieldsOf(createForm);
  fieldsOf(editForm);
  fieldsOf(eitherForm);
  movementFields(createForm);
  movementFields(editForm);
  extendedFieldsOf(extendedForm);
  renderFields(createForm);
  renderFields(editForm);

  const asEntityForm: EntityFormReturn<Movement> = editForm;

  // FormFieldRenderer / useFieldConditions take the form's control
  useFieldConditions(createForm.fields, createForm.control);
  useFieldConditions(editForm.fields, editForm.control);
  FormFieldRenderer({
    name: 'note',
    config: movementEntity.fields.note,
    control: editForm.control,
    t: editForm.t,
  });

  return [asEntityForm, createControl, editControl];
}

describe('useEntityForm result assignability', () => {
  it('compiles the consumer patterns (type-level regression)', () => {
    expect(typeof consumerPatterns).toBe('function');
  });
});
