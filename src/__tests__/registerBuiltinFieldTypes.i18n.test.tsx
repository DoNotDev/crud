import { cleanup, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EntityField } from '@donotdev/core';

import { getFieldRegistry } from '../FieldRegistry';
import { FormFieldRenderer } from '../components/FormFieldRenderer';
import type { FieldTypeMetadata } from '../fieldTypeRegistry.types';
import { registerAllBuiltinFieldTypes } from '../registerBuiltinFieldTypes';

// Observe the visual-component boundary, without testing editor internals here.
vi.mock('../components/form/fields', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/form/fields')>();
  const Label = ({ label }: { label: string }) => <output>{label}</output>;
  return {
    ...actual,
    TextFieldComponent: Label,
    TextAreaComponent: Label,
    RichTextComponent: Label,
    ButtonFieldComponent: Label,
  };
});

const metadata = new Map<string, FieldTypeMetadata>();
registerAllBuiltinFieldTypes(metadata, getFieldRegistry());
afterEach(cleanup);

const types = ['text', 'email', 'url', 'color', 'textarea', 'richtext', 'iban', 'submit', 'reset'] as const;

describe('built-in uncontrolled adapter translations', () => {
  it.each(types)('%s translates its configured label before rendering', (type) => {
    const Component = metadata.get(type)?.components?.uncontrolled;
    if (!Component) throw new Error(`No uncontrolled adapter for ${type}`);
    const config: EntityField = { name: 'name', label: 'fields.name', type, visibility: 'guest' };
    const t = vi.fn((key: string) => key === 'fields.name' ? 'Libellé traduit' : key);
    render(<Component name="name" label={config.label} value="" onChange={() => {}} config={config} t={t} />);
    expect(screen.getByText('Libellé traduit')).toBeTruthy();
    expect(t).toHaveBeenCalledWith('fields.name');
    expect(config.label).toBe('fields.name');
  });

  it.each(['submit', 'reset'] as const)('%s also translates when rendered inside a controlled form', (type) => {
    function Harness() {
      const { control } = useForm();
      const config: EntityField = { name: 'action', label: 'actions.save', type, visibility: 'guest' };
      return <FormFieldRenderer name="action" config={config} control={control} t={() => 'Enregistrer'} />;
    }
    render(<Harness />);
    expect(screen.getByText('Enregistrer')).toBeTruthy();
  });

  it('honors the supplied custom translator rather than selecting a namespace itself', () => {
    const Component = metadata.get('submit')?.components?.uncontrolled;
    if (!Component) throw new Error('No submit adapter');
    const config: EntityField = { name: 'save', label: 'actions.save', type: 'submit', visibility: 'guest' };
    render(<Component name="save" label={config.label} value="" onChange={() => {}} config={config} t={() => 'Custom save'} />);
    expect(screen.getByText('Custom save')).toBeTruthy();
  });
});
