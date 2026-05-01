import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { describe, it, expect, vi } from 'vitest';

import { ControlledTextField } from '../ControlledTextField';

// Mock @donotdev/components to provide Input and other primitives
vi.mock('@donotdev/components', () => ({
  Input: ({ value, label, ref: _ref, ...props }: any) => (
    <input
      data-testid="text-input"
      value={value}
      aria-label={label}
      {...props}
    />
  ),
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  Spinner: () => null,
  Stack: ({ children }: any) => <div>{children}</div>,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

/**
 * Regression test: ControlledTextField must pass RHF default values to the input.
 *
 * When register() was used instead of Controller, TextFieldComponent rendered
 * with value="" (controlled-empty) because its default prop overrode the DOM value.
 * This test ensures the input displays the RHF default value, not empty string.
 */

function Wrapper({ defaultValue }: { defaultValue: string }) {
  const methods = useForm({ defaultValues: { reference: defaultValue } });
  return (
    <FormProvider {...methods}>
      <ControlledTextField
        control={methods.control}
        errors={{}}
        fieldConfig={{
          name: 'reference',
          label: 'fields.reference',
          type: 'text',
          visibility: 'guest',
          editable: 'admin',
          validation: { required: true, minLength: 1 },
        }}
        t={(key: string) => key}
      />
    </FormProvider>
  );
}

describe('ControlledTextField', () => {
  it('renders default value from RHF (not empty string)', () => {
    render(<Wrapper defaultValue="APT-001" />);
    const input = screen.getByTestId('text-input');
    expect((input as HTMLInputElement).value).toBe('APT-001');
  });

  it('renders empty string when default value is empty', () => {
    render(<Wrapper defaultValue="" />);
    const input = screen.getByTestId('text-input');
    expect((input as HTMLInputElement).value).toBe('');
  });
});
