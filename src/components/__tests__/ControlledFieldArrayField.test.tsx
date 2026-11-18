import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, it, expect, vi } from 'vitest';

import type { EntityField } from '@donotdev/core';

import en from '../../../../../core/i18n/locales/lazy/crud_en.json';
import fr from '../../../../../core/i18n/locales/lazy/crud_fr.json';
import { ControlledFieldArrayField } from '../controlled/complex/ControlledFieldArrayField';

vi.mock('@donotdev/components', () => ({
  Button: (props: { 'aria-label'?: string; onClick?: () => void }) => (
    <button type="button" aria-label={props['aria-label']} onClick={props.onClick} />
  ),
}));

vi.mock('../../FieldRegistry', () => ({
  getFieldRegistry: () => ({
    getControlledComponent: () => (props: { fieldConfig: EntityField; t: (key: string) => string }) => (
      <span data-testid="sub-field" data-label={props.t(props.fieldConfig.label)}>{props.fieldConfig.name}</span>
    ),
  }),
}));

const i18n = createInstance();
await i18n.init({
  lng: 'fr',
  fallbackLng: false,
  interpolation: { escapeValue: false },
  resources: {
    fr: { crud: fr, 'entity-shipment': { Shipments: 'Colis', Tracking: 'Suivi' } },
    en: { crud: en, 'entity-shipment': { Shipments: 'Shipments', Tracking: 'Tracking' } },
  },
});
afterEach(cleanup);

function shipmentsField(fixedRows?: boolean, missingFields = false): EntityField {
  return {
    name: 'shipments',
    label: 'Shipments',
    type: 'field-array',
    visibility: 'admin',
    options: {
      fieldSpecific: {
        fields: missingFields ? [] : [{ name: 'trackingNumber', type: 'text', label: 'Tracking' }],
        ...(fixedRows !== undefined && { fixedRows }),
      },
    },
  };
}

function Harness({ fixedRows, missingFields, language = 'fr' }: {
  fixedRows?: boolean;
  missingFields?: boolean;
  language?: string;
}): ReactElement {
  const { control } = useForm({
    defaultValues: {
      shipments: [{ parcelKey: '2026-11-20', trackingNumber: '', lineIds: ['a'] }],
    },
  });
  return (
    <ControlledFieldArrayField
      control={control}
      fieldConfig={shipmentsField(fixedRows, missingFields)}
      t={i18n.getFixedT(language, ['entity-shipment', 'crud'])}
    />
  );
}

describe('ControlledFieldArrayField', () => {
  it('translates add/remove controls and forwards the entity translator to children', () => {
    render(<Harness />);
    expect(screen.getAllByTestId('sub-field').map((e) => e.textContent)).toEqual([
      'shipments.0.trackingNumber',
    ]);
    expect(screen.getByTestId('sub-field').getAttribute('data-label')).toBe('Suivi');
    expect(screen.getByLabelText('Ajouter une ligne à Colis')).toBeTruthy();
    expect(screen.getByLabelText('Supprimer la ligne 1 de Colis')).toBeTruthy();
  });

  it('uses the supplied translator language, not hardcoded French or English', () => {
    render(<Harness language="en" />);
    expect(screen.getByLabelText('Add a row to Shipments')).toBeTruthy();
    expect(screen.getByLabelText('Remove row 1 from Shipments')).toBeTruthy();
  });

  it('adds/removes rows and updates translated row numbers', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Ajouter une ligne à Colis'));
    expect(screen.getAllByTestId('sub-field')).toHaveLength(2);
    expect(screen.getByLabelText('Supprimer la ligne 2 de Colis')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Supprimer la ligne 1 de Colis'));
    expect(screen.getAllByTestId('sub-field')).toHaveLength(1);
    expect(screen.getByLabelText('Supprimer la ligne 1 de Colis')).toBeTruthy();
    expect(screen.queryByLabelText('Supprimer la ligne 2 de Colis')).toBeNull();
  });

  it('fixedRows renders the form rows only: no add, no remove', () => {
    render(<Harness fixedRows />);
    expect(screen.getAllByTestId('sub-field')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('translates the existing diagnostic when no sub-fields are configured', () => {
    render(<Harness missingFields />);
    expect(screen.getByText('Colis : aucun sous-champ configuré.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
