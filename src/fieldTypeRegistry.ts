'use client';
// packages/features/crud/src/fieldTypeRegistry.ts

/**
 * @fileoverview Unified Field Type Registry — public API.
 *
 * Wires lazy initialization: on first read access, registerAllBuiltinFieldTypes
 * populates both registries. Registration import is one-way (no cycle).
 *
 * Reader functions live in fieldTypeRegistry.store.ts so that modules deep in
 * the component tree (clientListProcessing, matchesFilter) can import them
 * without creating a circular dependency through registerBuiltinFieldTypes.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { getFieldRegistry } from './FieldRegistry';
import { registerAllBuiltinFieldTypes } from './registerBuiltinFieldTypes';
import {
  setRegistrationInit,
  getMetadataRegistry,
} from './fieldTypeRegistry.store';

import type { FieldTypeMetadata } from './fieldTypeRegistry.types';

// Wire lazy init — runs once on first registry read.
setRegistrationInit((registry) => {
  registerAllBuiltinFieldTypes(registry, getFieldRegistry());
});

// --- Re-exports: types ---

export type {
  FilterType,
  ValueType,
  DisplayFormatterOptions,
  DisplayFormatter,
  ComponentRegistration,
  FieldTypeMetadata,
} from './fieldTypeRegistry.types';

// --- Re-exports: reader functions (from store) ---

export {
  getFieldTypeMetadata,
  getFilterType,
  getDisplayFormatter,
  isFilterable,
  getValueType,
  clearFieldTypeRegistry,
} from './fieldTypeRegistry.store';

// --- Registration (stays here — only used by external callers) ---

/**
 * Register a built-in field type with all metadata.
 * For internal/plugin use — consumers should use registerFieldType() instead.
 */
export function registerBuiltinFieldType(metadata: FieldTypeMetadata): void {
  const { type, components } = metadata;

  if (components) {
    const registry = getFieldRegistry();
    registry.registerComponent(
      type,
      components.controlled,
      components.uncontrolled
    );
  }

  getMetadataRegistry().set(type, metadata);
}
