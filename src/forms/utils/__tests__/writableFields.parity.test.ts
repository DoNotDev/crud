/**
 * @fileoverview Parity: `writableFields` (runtime form state) = `FormValues` keys (type)
 *
 * Form state holds only what the form writes (design 3.4). The scope field is
 * technical and injected by `injectScope` on save: neither layer has it on create.
 * Technical role-gated fields are written on edit only; create-only fields on create only.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';

import type { FormValues } from '@donotdev/core';

import { writableFields } from '../writableFields';
import { writableModesEntity as scoped } from '@dndev/test-entities';


/** Keys of every member of a union */
type KeysOf<T> = T extends unknown ? keyof T : never;

const CREATE = ['status', 'title', 'titleI18n', 'sku', 'total'] as const;
const EDIT = ['status', 'title', 'titleI18n', 'total', 'audit'] as const;

describe('writableFields = FormValues keys', () => {
  it('create: no scope field, no technical field', () => {
    expect([...writableFields(scoped, 'super', 'create')].sort()).toEqual([...CREATE].sort());
    expect(writableFields(scoped, 'super', 'create').has('companyId')).toBe(false);
    expectTypeOf<KeysOf<FormValues<typeof scoped, 'create'>>>().toEqualTypeOf<(typeof CREATE)[number]>();
    expectTypeOf<'companyId' extends KeysOf<FormValues<typeof scoped, 'create'>> ? true : false>().toEqualTypeOf<false>();
  });

  it('edit: technical role-gated field written, scope and create-only not (id added by the form)', () => {
    expect([...writableFields(scoped, 'super', 'edit')].sort()).toEqual([...EDIT].sort());
    expectTypeOf<Exclude<KeysOf<FormValues<typeof scoped, 'edit'>>, 'id'>>().toEqualTypeOf<(typeof EDIT)[number]>();
  });
});
