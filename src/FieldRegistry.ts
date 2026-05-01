'use client';
// packages/features/crud/src/FieldRegistry.ts

/**
 * @fileoverview Field Type Registry
 * @description UI component registry for field types. Schemas handled by @donotdev/core.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { getGlobalSingleton } from '@donotdev/core';
import type { EntityField, FieldType, ValueTypeForField } from '@donotdev/core';

import type { ControlledFieldProps } from './components/controlled/types';
import type { ComponentType, ReactElement } from 'react';
import type { FieldValues } from 'react-hook-form';

export type { ControlledFieldProps };

/**
 * Props for uncontrolled field components
 */
export interface UncontrolledFieldProps<FT extends FieldType = FieldType> {
  name: string;
  label?: string;
  value: ValueTypeForField<FT>;
  onChange: (value: ValueTypeForField<FT>) => void;
  error?: string;
  helperText?: string;
  t: (key: string) => string;
  config: EntityField<FT>;
}

/**
 * Internal registration entry.
 * `ControlledFieldProps<FieldValues, FieldType>` uses the declared bounds rather than
 * `any` so TypeScript retains structural safety at the registry boundary (W10).
 */
interface ComponentRegistration {
  controlled: ComponentType<ControlledFieldProps<FieldValues, FieldType>>;
  uncontrolled?: ComponentType<UncontrolledFieldProps>;
}

/**
 * Display formatter for list/card/display views (same signature as fieldTypeRegistry.DisplayFormatter)
 */
export type CustomDisplayFormatter = (
  value: unknown,
  config: EntityField,
  t: (key: string, options?: Record<string, unknown>) => string,
  options?: { compact?: boolean; asString?: boolean }
) => string | ReactElement;

/** Filter UI type for EntityFilters; must match fieldTypeRegistry.FilterType */
export type CustomFilterType =
  | 'text'
  | 'range'
  | 'select'
  | 'none'
  | 'address'
  | 'multiselect';

/**
 * Registration for custom field types (UI components only)
 * Schemas must be defined in entity.validation.schema
 * Optional displayFormatter so list/card/display views can render the value.
 * Optional filterable + filterType so EntityFilters can show the right filter UI.
 */
export interface FieldTypeRegistration<FT extends FieldType = FieldType> {
  type: FT;
  /** Controlled form component. Optional for display-only registrations. */
  controlledComponent?: ComponentType<ControlledFieldProps<FieldValues, FT>>;
  uncontrolledComponent?: ComponentType<UncontrolledFieldProps<FT>>;
  /** Formatter for list/card/display; receives (value, fieldConfig, t, options?) */
  displayFormatter?: CustomDisplayFormatter;
  /** Whether this field is filterable in list/card filters */
  filterable?: boolean;
  /** Filter UI type for EntityFilters (e.g. 'text', 'range', 'select') */
  filterType?: CustomFilterType;
}

/**
 * Field Registry - UI components only
 * Schemas are handled by @donotdev/core
 */
class FieldRegistry {
  private readonly components = new Map<string, ComponentRegistration>();
  private readonly displayFormatters = new Map<
    string,
    CustomDisplayFormatter
  >();
  private readonly filterMetadata = new Map<
    string,
    { filterable: boolean; filterType?: CustomFilterType }
  >();

  /**
   * Register UI components for a field type (built-in types)
   * Does NOT register schema - use for types where schema is in @donotdev/core
   */
  registerComponent(
    type: string,
    controlled: ComponentType<ControlledFieldProps<FieldValues, FieldType>>,
    uncontrolled?: ComponentType<UncontrolledFieldProps>
  ): void {
    this.components.set(type, { controlled, uncontrolled });
  }

  /**
   * Register a custom field type (UI components only)
   * Schemas must be defined in entity.validation.schema
   */
  register<FT extends FieldType>(
    registration: FieldTypeRegistration<FT>
  ): void {
    const {
      type,
      controlledComponent,
      uncontrolledComponent,
      displayFormatter,
      filterable,
      filterType,
    } = registration;

    // Register UI components (internal cast safe — registry dispatches by type string)
    if (controlledComponent || uncontrolledComponent) {
      this.components.set(type, {
        controlled: controlledComponent as ComponentType<
          ControlledFieldProps<FieldValues, FieldType>
        >,
        uncontrolled: uncontrolledComponent as
          | ComponentType<UncontrolledFieldProps>
          | undefined,
      });
    }
    if (displayFormatter) {
      this.displayFormatters.set(type, displayFormatter);
    }
    if (filterable !== undefined || filterType !== undefined) {
      this.filterMetadata.set(type, {
        filterable: filterable ?? false,
        filterType,
      });
    }
  }

  /**
   * Get controlled component
   */
  getControlledComponent(
    type: string
  ): ComponentType<ControlledFieldProps> | undefined {
    return this.components.get(type)?.controlled;
  }

  /**
   * Get uncontrolled component
   */
  getUncontrolledComponent(
    type: string
  ): ComponentType<UncontrolledFieldProps> | undefined {
    return this.components.get(type)?.uncontrolled;
  }

  /**
   * Get display formatter for a custom field type (registered via registerFieldType with displayFormatter)
   */
  getDisplayFormatter(type: string): CustomDisplayFormatter | undefined {
    return this.displayFormatters.get(type);
  }

  /**
   * Get filter type for a custom field type (registered via registerFieldType with filterType)
   */
  getFilterType(type: string): CustomFilterType | undefined {
    return this.filterMetadata.get(type)?.filterType;
  }

  /**
   * Check if a custom field type is filterable
   */
  isFilterable(type: string): boolean {
    return this.filterMetadata.get(type)?.filterable ?? false;
  }

  /**
   * Check if type is registered
   */
  has(type: string): boolean {
    return this.components.has(type);
  }

  /**
   * Get all registered types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Clear (testing)
   */
  clear(): void {
    this.components.clear();
    this.displayFormatters.clear();
    this.filterMetadata.clear();
  }
}

/**
 * Get the field registry singleton.
 * Backed by globalThis to survive Vite pre-bundling chunk splits and HMR.
 */
export function getFieldRegistry(): FieldRegistry {
  return getGlobalSingleton('field-registry', () => new FieldRegistry());
}

/**
 * Register a custom field type (form, optional display, optional filter).
 * Schema must be defined in entity.validation.schema
 *
 * @example
 * ```ts
 * import { useController, registerFieldType } from '@donotdev/crud';
 * import type { ControlledFieldProps } from '@donotdev/crud';
 * import * as v from 'valibot';
 *
 * function ControlledRepairOperationsField({
 *   fieldConfig,
 *   control,
 *   errors,
 *   t,
 * }: ControlledFieldProps) {
 *   const { field, fieldState } = useController({
 *     name: fieldConfig.name,
 *     control: control,
 *   });
 *   return (
 *     <div>
 *       Your custom UI here
 *       {fieldState?.error && <span>{fieldState.error.message}</span>}
 *     </div>
 *   );
 * }
 *
 * registerFieldType({
 *   type: 'repairOperations',
 *   controlledComponent: ControlledRepairOperationsField,
 *   displayFormatter: (value) => (value != null ? String(value) : '—'),
 *   filterable: true,
 *   filterType: 'text',
 * });
 *
 * const carEntity = defineEntity({
 *   fields: {
 *     repairs: {
 *       type: 'repairOperations',
 *       validation: { schema: v.array(v.object({ operation: v.string(), cost: v.number() })) }
 *     }
 *   }
 * });
 * ```
 */
export function registerFieldType<FT extends FieldType>(
  registration: FieldTypeRegistration<FT>
): void {
  getFieldRegistry().register(registration);
}

/**
 * Check if a field type is registered
 */
export function isFieldTypeRegistered(type: string): boolean {
  return getFieldRegistry().has(type);
}
