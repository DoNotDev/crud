'use client';
// packages/features/crud/src/fieldTypeRegistry.store.ts

/**
 * @fileoverview Registry storage + reader functions.
 * Isolated from registration imports to break the circular dependency:
 * fieldTypeRegistry → registerBuiltinFieldTypes → controlled → useCrudList → clientListProcessing → fieldTypeRegistry
 *
 * clientListProcessing and matchesFilter import from HERE (no cycle).
 * fieldTypeRegistry.ts wires the lazy init and re-exports everything.
 */

import { getGlobalSingleton } from '@donotdev/core';

import { getFieldRegistry } from './FieldRegistry';

import type { FieldTypeMetadata } from './fieldTypeRegistry.types';
import type { DisplayFormatter } from './fieldTypeRegistry.types';
import type { FilterType } from './fieldTypeRegistry.types';
import type { ValueType } from './fieldTypeRegistry.types';

// --- Storage (globalThis-backed to survive chunk splits) ---

interface MetadataRegistryState {
  registry: Map<string, FieldTypeMetadata>;
  builtinsRegistered: boolean;
  initFn: ((registry: Map<string, FieldTypeMetadata>) => void) | null;
}

function getState(): MetadataRegistryState {
  return getGlobalSingleton<MetadataRegistryState>(
    'field-type-metadata',
    () => ({ registry: new Map(), builtinsRegistered: false, initFn: null })
  );
}

/**
 * Called once by fieldTypeRegistry.ts to wire the lazy init callback.
 * Keeps this file free of imports from registerBuiltinFieldTypes.
 */
export function setRegistrationInit(
  fn: (registry: Map<string, FieldTypeMetadata>) => void
): void {
  getState().initFn = fn;
}

export function getMetadataRegistry(): Map<string, FieldTypeMetadata> {
  const state = getState();
  if (!state.builtinsRegistered) {
    state.builtinsRegistered = true;
    state.initFn?.(state.registry);
  }
  return state.registry;
}

// --- Reader functions (public API) ---

export function getFieldTypeMetadata(
  type: string
): FieldTypeMetadata | undefined {
  return getMetadataRegistry().get(type);
}

export function getFilterType(type: string): FilterType | undefined {
  const custom = getFieldRegistry().getFilterType(type);
  if (custom) return custom as FilterType;
  return getMetadataRegistry().get(type)?.filterType;
}

export function getDisplayFormatter(
  type: string
): DisplayFormatter | undefined {
  const custom = getFieldRegistry().getDisplayFormatter(type);
  if (custom) return custom as DisplayFormatter;
  return getMetadataRegistry().get(type)?.displayFormatter;
}

export function isFilterable(type: string): boolean {
  if (getFieldRegistry().isFilterable(type)) return true;
  return getMetadataRegistry().get(type)?.filterable ?? false;
}

export function getValueType(type: string): ValueType | undefined {
  return getMetadataRegistry().get(type)?.valueType;
}

export function clearFieldTypeRegistry(): void {
  getMetadataRegistry().clear();
}
