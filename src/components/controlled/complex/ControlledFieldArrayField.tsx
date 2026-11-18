'use client';
// packages/features/crud/src/components/controlled/complex/ControlledFieldArrayField.tsx

/**
 * @fileoverview Controlled field-array component
 * @description Renders an array of objects where each row contains multiple sub-fields.
 * Sub-fields delegate to their registered field type via the FieldRegistry.
 *
 * @version 0.1.0
 * @since 0.5.0
 */

import type { ReactElement } from 'react';
import { useFieldArray, Controller } from 'react-hook-form';

import { Button } from '@donotdev/components';
import type { EntityField, FieldType } from '@donotdev/core';

import { getFieldRegistry } from '../../../FieldRegistry';
import { convertValidationRules } from '../types';
import type { ControlledFieldProps } from '../types';

/** Sub-field definition inside fieldSpecific.fields */
export interface SubFieldDef {
  name: string;
  type: FieldType;
  label: string;
  required?: boolean;
  options?: Record<string, unknown>;
  validation?: Record<string, unknown>;
}

interface FieldArrayFieldSpecific {
  fields: SubFieldDef[];
  direction?: 'row' | 'column';
  /**
   * Render exactly the rows of the form value: no add / remove buttons. For a form that
   * edits rows it set itself (e.g. one new row in `defaultValues`). Default: false.
   */
  fixedRows?: boolean;
}

/** Return a type-appropriate empty value for a field type. */
function getEmptyValue(type: FieldType): unknown {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}

/**
 * ControlledFieldArrayField — nested object array with per-row sub-fields.
 * Each sub-field is rendered via the field type registry so custom types work automatically.
 * Uses the supplied translator for child fields and CRUD field-array control/diagnostic text.
 */
export function ControlledFieldArrayField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;
  const { name, label, validation } = fieldConfig;

  // why: @donotdev/core declares no fieldSpecific shape for this field type, and FieldType is erased at registry dispatch
  const fieldSpecific = (fieldConfig.options?.fieldSpecific ??
    {}) as FieldArrayFieldSpecific;
  const subFields = fieldSpecific.fields ?? [];
  const direction = fieldSpecific.direction ?? 'row';
  const fixedRows = fieldSpecific.fixedRows === true;

  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  const registry = getFieldRegistry();

  const handleAdd = () => {
    if (subFields.length === 0) return;
    const emptyRow: Record<string, unknown> = {};
    for (const sf of subFields) {
      emptyRow[sf.name] = getEmptyValue(sf.type);
    }
    append(emptyRow);
  };

  if (subFields.length === 0) {
    return (
      <div
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--muted-foreground)',
        }}
      >
        {t('crud:fieldArray.noSubFields', { field: t(label) })}
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}
    >
      {/* Header: label + add button */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {t(label)}
          {required && (
            <span
              style={{
                color: 'var(--destructive)',
                marginInlineStart: 'var(--gap-sm)',
              }}
            >
              *
            </span>
          )}
        </span>
        {!fixedRows && (
          <Button
            type="button"
            variant="ghost"
            display="compact"
            intent="add"
            onClick={handleAdd}
            aria-label={t('crud:fieldArray.addRow', { field: t(label) })}
          />
        )}
      </div>

      {/* Rows */}
      {fields.map((field, rowIndex) => (
        <div
          key={field.id}
          style={{
            display: 'flex',
            flexDirection: direction,
            gap: 'var(--gap-sm)',
            alignItems: direction === 'row' ? 'flex-start' : undefined,
          }}
        >
          {subFields.map((sf) => {
            const subFieldPath =
              `${name}.${rowIndex}.${sf.name}`;

            const subFieldConfig: EntityField = {
              name: subFieldPath,
              type: sf.type,
              label: sf.label,
              visibility: fieldConfig.visibility,
              validation: {
                ...(sf.validation ?? {}),
                ...(sf.required ? { required: true } : {}),
              },
              options: sf.options ?? {},
            };

            const SubFieldComponent = registry.getControlledComponent(sf.type);

            if (SubFieldComponent) {
              return (
                <div
                  key={sf.name}
                  style={{ flex: direction === 'row' ? 1 : undefined }}
                >
                  <SubFieldComponent
                    control={control}
                    fieldConfig={subFieldConfig}
                    t={t}
                  />
                </div>
              );
            }

            // Fallback: render as text via Controller
            return (
              <div
                key={sf.name}
                style={{ flex: direction === 'row' ? 1 : undefined }}
              >
                <Controller
                  name={subFieldPath}
                  control={control}
                  rules={
                    sf.validation
                      ? convertValidationRules(sf.validation)
                      : undefined
                  }
                  render={({ field: rhfField }) => (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--gap-sm)',
                      }}
                    >
                      <span style={{ fontSize: 'var(--font-size-xs)' }}>
                        {t(sf.label)}
                      </span>
                      <input
                        className="dndev-input"
                        value={String(rhfField.value ?? '')}
                        onChange={rhfField.onChange}
                        onBlur={rhfField.onBlur}
                      />
                    </label>
                  )}
                />
              </div>
            );
          })}

          {/* Remove row button */}
          {!fixedRows && (
            <Button
              type="button"
              variant="ghost"
              display="compact"
              intent="delete"
              onClick={() => remove(rowIndex)}
              aria-label={t('crud:fieldArray.removeRow', { field: t(label), index: rowIndex + 1 })}
              style={{ alignSelf: direction === 'row' ? 'center' : 'flex-end' }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
