/**
 * @fileoverview Entity form errors show translated messages: required (null, ''),
 * built-in formats (phone, email, lengths) and the entity's own message keys, never
 * valibot's raw text or the schemas' English.
 */

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { defineEntity } from '@donotdev/core';

import { createConditionAwareResolver } from '../conditionAwareResolver';
import { translateFieldErrors } from '../fieldErrorMessages';

const entity = defineEntity({
  name: 'Lead',
  collection: 'leads',
  fields: {
    name: { name: 'name', label: 'fields.name', type: 'text', visibility: 'guest', validation: { required: true, maxLength: 5 } },
    phone: { name: 'phone', label: 'fields.phone', type: 'tel', visibility: 'guest' },
    email: { name: 'email', label: 'fields.email', type: 'email', visibility: 'guest' },
    siret: { name: 'siret', label: 'fields.siret', type: 'text', visibility: 'guest', validation: { schema: v.pipe(v.string(), v.regex(/^\d{14}$/, 'siretFormat')) } },
    code: { name: 'code', label: 'fields.code', type: 'text', visibility: 'guest', validation: { schema: v.pipe(v.string(), v.regex(/^A/, 'codeFormat')) } },
  },
});

const dictionary: Record<string, string> = {
  'crud:text.required': '{{field}} est obligatoire',
  'crud:text.invalid': "{{field}} n'est pas valide",
  'crud:text.phone': 'Veuillez entrer un numéro de téléphone valide',
  'crud:text.email': 'Veuillez entrer une adresse email valide',
  'crud:text.maxLength': '{{field}} ne doit pas dépasser {{max}} caractères',
  'fields.name': 'Nom',
  'fields.phone': 'Téléphone',
  'fields.siret': 'SIRET',
  'fields.code': 'Code',
  siretFormat: 'Le SIRET compte 14 chiffres',
};

/** i18next-like: missing key → `defaultValue`, else the key. */
const t = (key: string, options: Record<string, unknown> = {}) =>
  (dictionary[key] ?? (options.defaultValue as string | undefined) ?? key).replace(
    /\{\{(\w+)\}\}/g,
    (_, name: string) => String(options[name])
  );

const written = new Set(Object.keys(entity.fields));
const valid = { name: 'Ann', phone: null, email: null, siret: null, code: null, status: 'available' };

async function messages(values: Record<string, unknown>) {
  const resolve = createConditionAwareResolver(entity, 'create', written, t);
  const result = await resolve(values, undefined, { fields: {}, shouldUseNativeValidation: false });
  return Object.fromEntries(
    Object.entries(result.errors).map(([name, error]) => [name, (error as { message?: string }).message])
  );
}

describe('entity form error messages', () => {
  it('a valid form has no errors', async () => {
    expect(await messages(valid)).toEqual({});
  });

  it.each([[null], [''], [undefined]])('required field %j: translated required message', async (name) => {
    expect(await messages({ ...valid, name })).toEqual({ name: 'Nom est obligatoire' });
  });

  it('invalid phone: translated phone message', async () => {
    expect(await messages({ ...valid, phone: '+33 1' })).toEqual({
      phone: 'Veuillez entrer un numéro de téléphone valide',
    });
  });

  it('the phone field value is valid (optional phone left empty is valid)', async () => {
    expect(await messages({ ...valid, phone: '+33 612345678' })).toEqual({});
    expect(await messages({ ...valid, phone: null })).toEqual({});
  });

  it('length and email rules: translated messages with their limits', async () => {
    expect(await messages({ ...valid, name: 'Annabelle', email: 'nope' })).toEqual({
      name: 'Nom ne doit pas dépasser 5 caractères',
      email: 'Veuillez entrer une adresse email valide',
    });
  });

  it("the entity's own message key is translated in its namespace", async () => {
    expect(await messages({ ...valid, siret: '123' })).toEqual({ siret: 'Le SIRET compte 14 chiffres' });
  });

  it('an entity message with no translation shows the invalid message', async () => {
    expect(await messages({ ...valid, code: 'B' })).toEqual({ code: "Code n'est pas valide" });
  });

  it('replaces the raw valibot message, keeping type and ref', () => {
    const ref = { name: 'name' };
    const errors = translateFieldErrors(
      { name: { type: 'string', message: 'Invalid type: Expected string but received null', ref } },
      { name: null },
      entity,
      t
    );
    expect(errors).toEqual({ name: { type: 'string', message: 'Nom est obligatoire', ref } });
  });
});
