/**
 * @fileoverview Regression: a scoped create form validates the record useCrud.add saves.
 *
 * The scope field is technical + required and never rendered. The form resolver injects
 * it (injectScope, as useCrud.add does) before validating the create schema; without the
 * injection a scoped create form could never pass once forms stopped defaulting to draft.
 */

import * as v from 'valibot';
import { afterEach, describe, it, expect } from 'vitest';

import { clearScopeProviders, createSchemas, registerScopeProvider } from '@donotdev/core';

import { injectScope } from '../../../utils/scopeUtils';
import { scopedEntity as scoped } from '@dndev/test-entities';


const create = createSchemas(scoped).create;
const formValues = { status: 'available', label: 'Acme' };

afterEach(() => clearScopeProviders());

describe('scoped create form', () => {
  it('fails without the scope field', () => {
    expect(v.safeParse(create, formValues).success).toBe(false);
  });

  it('passes once the scope is injected, as useCrud.add does', () => {
    registerScopeProvider('company', () => 'c1');
    const result = v.safeParse(create, injectScope(formValues, scoped.scope));
    expect(result.success).toBe(true);
  });

  it('fails loudly when no scope is selected', () => {
    registerScopeProvider('company', () => null);
    expect(() => injectScope(formValues, scoped.scope)).toThrow(/scope value/);
  });
});
