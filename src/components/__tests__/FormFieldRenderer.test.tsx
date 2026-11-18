import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FormFieldRenderer } from '../FormFieldRenderer';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useFormContext: vi.fn(() => ({
    register: vi.fn(),
    control: {},
    formState: { errors: {} },
  })),
  Controller: ({ render: renderProp }: any) => {
    const mockField = {
      onChange: vi.fn(),
      onBlur: vi.fn(),
      value: '',
      name: 'test-field',
    };
    const mockFieldState = {
      invalid: false,
      error: undefined,
      isDirty: false,
      isTouched: false,
    };
    return renderProp({ field: mockField, fieldState: mockFieldState });
  },
}));

// Mock field registry
const fieldProps = vi.hoisted(() => [] as Array<Record<string, any>>);

vi.mock('../../FieldRegistry', () => {
  const MockField = (props: Record<string, any>) => {
    fieldProps.push(props);
    return <div>Mock Field</div>;
  };
  const lookup = (type: string) =>
    type === 'unregistered-type' ? undefined : MockField;
  return {
    getFieldRegistry: vi.fn(() => ({
      getControlledComponent: vi.fn(lookup),
      getUncontrolledComponent: vi.fn(lookup),
    })),
  };
});

describe('FormFieldRenderer', () => {
  const mockConfig = {
    name: 'title',
    label: 'Title',
    type: 'text' as const,
    visibility: 'user' as const,
    validation: { required: true },
  };

  const mockT = vi.fn((key: string) => key);

  beforeEach(() => {
    vi.clearAllMocks();
    fieldProps.length = 0;
  });

  it('renders field with correct props', () => {
    const { container } = render(
      <FormFieldRenderer
        name="title"
        config={mockConfig}
        t={mockT}
        control={{} as any}
      />
    );

    expect(container).toBeDefined();
  });

  it('renders textarea field for textarea type', () => {
    const textareaConfig = {
      ...mockConfig,
      type: 'textarea' as const,
      name: 'description',
      label: 'Description',
    };

    const { container } = render(
      <FormFieldRenderer
        name="description"
        config={textareaConfig}
        t={mockT}
        control={{} as any}
      />
    );

    expect(container).toBeDefined();
  });

  it('handles uncontrolled mode', () => {
    const { container } = render(
      <FormFieldRenderer
        name="title"
        config={mockConfig}
        t={mockT}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(container).toBeDefined();
  });

  it('preserves raw labels and the supplied translator for custom uncontrolled adapters', () => {
    render(
      <FormFieldRenderer
        name="title"
        config={{ ...mockConfig, label: 'fields.title' }}
        t={mockT}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(fieldProps.at(-1)?.label).toBe('fields.title');
    expect(fieldProps.at(-1)?.config.label).toBe('fields.title');
    expect(fieldProps.at(-1)?.t).toBe(mockT);
  });

  it('throws for a type with no registered component (no text-input fallback)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <FormFieldRenderer
          name="title"
          config={{ ...mockConfig, type: 'unregistered-type' as never }}
          t={mockT}
          control={{} as any}
        />
      )
    ).toThrow(/no registered component/);
  });

  describe('onlyOptions', () => {
    const reasonConfig = {
      name: 'reason',
      label: 'Reason',
      type: 'select' as const,
      visibility: 'admin' as const,
      validation: {
        required: true,
        options: [
          { value: 'sale', label: 'Sale' },
          { value: 'breakage', label: 'Breakage' },
          { value: 'loss', label: 'Loss' },
        ],
      },
    };

    it('renders only the given declared options, in the given order (controlled)', () => {
      render(
        <FormFieldRenderer
          name="reason"
          config={reasonConfig}
          t={mockT}
          control={{} as any}
          onlyOptions={['loss', 'breakage']}
        />
      );
      expect(fieldProps.at(-1)?.fieldConfig.validation).toEqual({
        required: true,
        options: [
          { value: 'loss', label: 'Loss' },
          { value: 'breakage', label: 'Breakage' },
        ],
      });
      // The entity definition itself is untouched
      expect(reasonConfig.validation.options).toHaveLength(3);
    });

    it('restricts the options in uncontrolled mode', () => {
      render(
        <FormFieldRenderer
          name="reason"
          config={reasonConfig}
          t={mockT}
          value=""
          onChange={vi.fn()}
          onlyOptions={['breakage']}
        />
      );
      expect(fieldProps.at(-1)?.config.validation.options).toEqual([
        { value: 'breakage', label: 'Breakage' },
      ]);
    });

    it('throws on a value the field does not declare', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() =>
        render(
          <FormFieldRenderer
            name="reason"
            config={reasonConfig}
            t={mockT}
            control={{} as any}
            onlyOptions={['theft']}
          />
        )
      ).toThrow(/"theft" is not an option of field "reason"/);
    });

    it('throws on a field without static options', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() =>
        render(
          <FormFieldRenderer
            name="title"
            config={mockConfig}
            t={mockT}
            control={{} as any}
            onlyOptions={['a']}
          />
        )
      ).toThrow(/declares no static validation.options/);
    });
  });
});
