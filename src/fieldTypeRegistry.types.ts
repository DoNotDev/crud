'use client';
// packages/features/crud/src/fieldTypeRegistry.types.ts

/**
 * @fileoverview Shared types for field type registry.
 * Extracted to break circular dependency between fieldTypeRegistry ↔ registerBuiltinFieldTypes.
 */

import type { EntityField, FieldType } from '@donotdev/core';
import type {
  ControlledFieldProps,
  UncontrolledFieldProps,
} from './FieldRegistry';
import type { ComponentType, ReactElement } from 'react';

/**
 * Filter type metadata for EntityFilters component
 */
export type FilterType =
  | 'text'
  | 'range'
  | 'select'
  | 'none'
  | 'address'
  | 'multiselect'
  | 'rating';

/**
 * Value type for type checking
 */
export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array';

/**
 * Display formatter function
 */
export type DisplayFormatterOptions = {
  compact?: boolean;
  asString?: boolean;
  /** Pre-resolved reference data: { collectionName: { id: displayLabel } } */
  referenceData?: Record<string, Record<string, string>>;
  /** BCP 47 locale tag for date/number formatting (e.g. 'fr', 'ko'). Auto-resolved from i18n when omitted. */
  locale?: string;
  /** Full item record — enables cross-field conditional display via `displayValue` resolver */
  item?: Record<string, unknown>;
};

export type DisplayFormatter = (
  value: any,
  config: EntityField,
  t: (key: string, options?: Record<string, any>) => string,
  options?: DisplayFormatterOptions
) => string | ReactElement;

/**
 * Component registration for a field type
 */
export interface ComponentRegistration {
  controlled: ComponentType<ControlledFieldProps<any, any>>;
  uncontrolled?: ComponentType<UncontrolledFieldProps>;
}

/**
 * Complete metadata for a built-in field type
 *
 * NOTE: Schemas are registered separately in @donotdev/core/schemas/getSchemaType.ts
 * This registry only handles UI components + filter/display metadata
 */
export interface FieldTypeMetadata {
  /** Field type identifier */
  type: FieldType;
  /** Whether this field type is filterable */
  filterable?: boolean;
  /** Filter UI type for EntityFilters */
  filterType?: FilterType;
  /** Display formatter function */
  displayFormatter?: DisplayFormatter;
  /** Runtime value type */
  valueType?: ValueType;
  /** UI components */
  components?: ComponentRegistration;
}
