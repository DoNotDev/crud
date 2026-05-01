/**
 * @fileoverview Regression test: required asterisks must render on form fields
 *
 * Root cause: each controlled component independently destructured
 * `fieldConfig.validation?.required`. If validation was lost in transit
 * (stale build, bundler issue), ALL fields lost their asterisks.
 *
 * Fix: FormFieldRenderer now extracts `required` from config.validation
 * and passes it as a first-class prop on ControlledFieldProps.
 *
 * This test verifies that FormFieldRenderer passes `required: true`
 * in controlledProps when the entity field has `validation.required: true`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import { FormFieldRenderer } from '../FormFieldRenderer';

import type { EntityField } from '@donotdev/core';
import type { ControlledFieldProps } from '../controlled/types';

// Track what props the controlled component receives
let capturedProps: ControlledFieldProps | null = null;

// Mock the field registry to capture props passed to controlled components
vi.mock('../../FieldRegistry', () => {
  const CaptureComponent = (props: ControlledFieldProps) => {
    capturedProps = props;
    return <div data-testid="mock-field" />;
  };

  return {
    getFieldRegistry: () => ({
      getControlledComponent: () => CaptureComponent,
      getUncontrolledComponent: () => undefined,
    }),
  };
});

// Mock react-hook-form Controller to render immediately
vi.mock('react-hook-form', () => ({
  Controller: ({ render: renderProp }: any) =>
    renderProp({
      field: {
        onChange: vi.fn(),
        onBlur: vi.fn(),
        value: '',
        name: 'test',
        ref: vi.fn(),
      },
      fieldState: {
        invalid: false,
        error: undefined,
        isDirty: false,
        isTouched: false,
      },
    }),
  useWatch: () => undefined,
  useFormContext: () => ({ setValue: vi.fn() }),
}));

const mockT = (key: string) => key;

describe('required asterisk - FormFieldRenderer → ControlledFieldProps', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('passes required=true when validation.required is true', () => {
    const config: EntityField = {
      name: 'rent',
      label: 'fields.rent',
      type: 'currency',
      visibility: 'guest',
      validation: { required: true },
    };

    render(
      <FormFieldRenderer
        name="rent"
        config={config}
        control={{} as any}
        errors={{}}
        t={mockT}
      />
    );

    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.required).toBe(true);
  });

  it('passes required=false when validation.required is false', () => {
    const config: EntityField = {
      name: 'notes',
      label: 'fields.notes',
      type: 'textarea',
      visibility: 'admin',
      validation: { required: false },
    };

    render(
      <FormFieldRenderer
        name="notes"
        config={config}
        control={{} as any}
        errors={{}}
        t={mockT}
      />
    );

    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.required).toBe(false);
  });

  it('passes required=false when validation is undefined', () => {
    const config: EntityField = {
      name: 'lift',
      label: 'fields.lift',
      type: 'checkbox',
      visibility: 'guest',
    };

    render(
      <FormFieldRenderer
        name="lift"
        config={config}
        control={{} as any}
        errors={{}}
        t={mockT}
      />
    );

    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.required).toBe(false);
  });
});
