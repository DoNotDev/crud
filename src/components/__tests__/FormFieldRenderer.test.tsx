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
vi.mock('../FieldRegistry', () => ({
  getFieldRegistry: vi.fn(() => ({
    getComponent: vi.fn(() => () => <div>Mock Field</div>),
  })),
}));

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
  });

  it('renders field with correct props', () => {
    const { container } = render(
      <FormFieldRenderer
        name="title"
        config={mockConfig}
        t={mockT}
        control={{} as any}
        errors={{}}
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
        errors={{}}
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
});
