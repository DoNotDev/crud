import { valibotResolver } from '@hookform/resolvers/valibot';
import type { FieldValues, Resolver } from 'react-hook-form';

import {
  createSchemas,
  evaluateFieldConditions,
  i18nFieldName,
  createStatus,
  statusCan,
  updateCheck,
} from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

/** Evaluate only validation-relevant conditions against the complete retained form. */
export function getFormConditionStates(entity: AnyEntity, values: Record<string, unknown>) {
  return Object.entries(entity.fields)
    .filter(([, field]) => field.conditions?.visible || field.conditions?.required)
    .map(([name, field]) => {
      const state = evaluateFieldConditions(field.conditions, values);
      return {
        name,
        visible: state.visible,
        required: field.conditions?.required ? state.required : field.validation?.required,
      };
    });
}

/**
 * Form-only validation projection. Persistence schemas remain strict; inactive
 * values are retained for drafts and domain normalization in the submit callback.
 * Only the fields the form writes (`written`: `writableFields`) are validated and
 * output: a field the viewer cannot write (a status editable by admins only, an
 * `editable: false` field) is the writer's, not the form's.
 * Schema and scope: the CRUD rules (core/schemas crud/), as the writers apply them.
 * Create: the whole form (`draft` or `create` schema, `createStatus`). Edit
 * (`updateCheck` on the base row): a draft, or leaving draft for a visible status,
 * checks the whole form; any other edit checks only the fields that differ from the
 * base row (rule 2: an update validates what changes).
 *
 * @template T - Form state the resolver reads
 * @template TOutput - Values it outputs (`onValid`'s), `T` by default
 * @param entity - Entity from `defineEntity()`
 * @param operation - Form operation
 * @param written - Field names the form writes (companions included)
 * @param base - The row the form starts from: the stored row on edit, the caller's
 *   defaults on create (its status is read when form state has none)
 * @returns React Hook Form resolver
 *
 * @version 0.4.0
 * @since 0.2.4
 * @author AMBROISE PARK Consulting
 */
export function createConditionAwareResolver<
  T extends FieldValues,
  TOutput = T,
>(
  entity: AnyEntity,
  operation: 'create' | 'edit',
  written: ReadonlySet<string>,
  base?: Readonly<Record<string, unknown>> | null
): Resolver<T, unknown, TOutput> {
  // The entity reduced to the fields the form writes (the update schema keeps `id`).
  const formEntity: AnyEntity = {
    ...entity,
    fields: Object.fromEntries(
      Object.entries(entity.fields).filter(([name]) => written.has(name))
    ),
  };
  const writeSchemas = createSchemas(formEntity);
  // Keep only the latest projection, rather than caching every condition combination.
  let previousKey: string | undefined;
  let resolver: Resolver<T, unknown, TOutput>;
  let retainedNames: string[] = [];
  return async (values, context, options) => {
    const states = getFormConditionStates(formEntity, values);
    const withStatus = { ...values, status: values.status ?? base?.status };
    let schemaOperation: 'create' | 'draft' | 'update';
    let changed: string[] | null = null;
    if (operation === 'edit') {
      const check = updateCheck(withStatus, base);
      schemaOperation = check.schemaKey;
      // Rule 2: a plain update checks only what differs from the base row.
      if (check.schemaKey === 'update' && !check.whole) {
        changed = Object.keys(formEntity.fields).filter((name) =>
          [name, i18nFieldName(name)].some(
            (key) => JSON.stringify(values[key]) !== JSON.stringify(base?.[key])
          )
        );
      }
    } else {
      schemaOperation = statusCan(createStatus(withStatus), 'saveIncomplete') ? 'draft' : 'create';
    }
    const key = JSON.stringify([schemaOperation, states, changed]);
    if (key !== previousKey) {
      // Generated write entries are the eligibility SSOT, including companions.
      const writeSchema = writeSchemas[schemaOperation];
      if (!('entries' in writeSchema) || typeof writeSchema.entries !== 'object' || writeSchema.entries === null) {
        throw new Error('Expected an object write schema');
      }
      const eligible = new Set(Object.keys(writeSchema.entries));
      retainedNames = states.filter((state) => !state.visible && eligible.has(state.name))
        .flatMap(({ name }) => formEntity.fields[name]?.i18n === true
          ? [name, i18nFieldName(name)].filter((candidate) => eligible.has(candidate))
          : [name]);
      const fields = { ...formEntity.fields };
      // A plain edit validates only the changed fields (the others are the stored values).
      if (changed) {
        for (const name of Object.keys(fields)) if (!changed.includes(name)) delete fields[name];
      }
      for (const [name, field] of Object.entries(fields)) {
        const state = states.find((candidate) => candidate.name === name);
        if (!state) continue;
        if (!state.visible) {
          delete fields[name];
        } else if (field.conditions?.required) {
          fields[name] = {
            ...field,
            validation: { ...field.validation, required: state.required },
          };
        }
      }
      const schema = createSchemas({ ...formEntity, fields })[schemaOperation];
      // createSchemas erases the entity output to unknown; this projection still
      // describes TOutput, with intentionally unparsed inactive values restored below.
      type FormSchema = Parameters<typeof valibotResolver<T, unknown, TOutput>>[0];
      resolver = valibotResolver(schema as FormSchema);
      previousKey = key;
    }
    // Snapshot before yielding: another validation may replace the projection.
    const retained = Object.fromEntries(retainedNames
      .filter((name) => Object.hasOwn(values, name))
      .map((name) => [name, values[name]]));
    const result = await resolver(values, context, options);
    if (Object.keys(result.errors).length > 0) return result;
    // The projection plus eligible inactive fields has the output's TOutput shape;
    // RHF's error union does not narrow from the empty-errors check above.
    // Unchanged fields of a plain edit pass through as they are (stored values).
    const unchecked = changed
      ? Object.fromEntries(Object.entries(values).filter(([name]) => written.has(name)))
      : {};
    return { errors: {}, values: { ...unchecked, ...retained, ...result.values } as TOutput };
  };
}
