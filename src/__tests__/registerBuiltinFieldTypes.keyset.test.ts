// packages/features/crud/src/__tests__/registerBuiltinFieldTypes.keyset.test.ts

/**
 * @fileoverview Key-set parity of the formatter registry
 * @description Design 2026-11-17 §6 "Key-set parity": FIELD_TYPES = keys of
 * BUILTIN_VALUES = keys of FieldTypeToValue (core parity tests) = the formatter
 * registry. Every built-in type is registered, and every type that stores a value
 * has a display formatter; the core text formatters name only built-in types.
 */

import { describe, expect, it } from 'vitest';

import { FIELD_TEXT_FORMATTERS, FIELD_TYPES } from '@donotdev/core';

import { getFieldRegistry } from '../FieldRegistry';
import type { FieldTypeMetadata } from '../fieldTypeRegistry.types';
import { registerAllBuiltinFieldTypes } from '../registerBuiltinFieldTypes';

/** Action buttons: no value (`FieldTypeToValue` = `never`), nothing to display */
const VALUELESS = ['reset', 'submit'];

const metadata = new Map<string, FieldTypeMetadata>();
registerAllBuiltinFieldTypes(metadata, getFieldRegistry());
const builtIn = [...FIELD_TYPES].sort();

describe('formatter registry key-set parity', () => {
  it('registers exactly the built-in types', () => {
    expect([...metadata.keys()].sort()).toEqual(builtIn);
  });

  it('has a display formatter for every type that stores a value', () => {
    const formatted = [...metadata].filter(([, meta]) => meta.displayFormatter).map(([type]) => type);
    expect(formatted.sort()).toEqual(builtIn.filter((type) => !VALUELESS.includes(type)));
  });

  it('core text formatters name built-in types only', () => {
    expect(Object.keys(FIELD_TEXT_FORMATTERS).filter((type) => !builtIn.includes(type))).toEqual([]);
  });
});
