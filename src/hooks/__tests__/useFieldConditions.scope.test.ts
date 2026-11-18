// packages/features/crud/src/hooks/__tests__/useFieldConditions.scope.test.ts

import { renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import type { RenderableField } from '../../forms/utils/getFieldsForOperation';
import { useFieldConditions } from '../useFieldConditions';

// Fields of a 1:1 extension (`scope`) evaluate their conditions on the
// extension's values (`values.offer`), not on the record's.

const offerPrice: RenderableField = {
  name: 'offer.price',
  config: {
    name: 'offer.price',
    label: 'price',
    type: 'number',
    visibility: 'admin',
    conditions: { visible: { type: 'condition', field: 'onSale', operator: 'equals', value: true } },
  },
  editable: true,
  written: true,
  scope: 'offer',
};

describe('useFieldConditions scope', () => {
  it('reads an extension field conditions from its extension values', () => {
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: { onSale: false, offer: { onSale: true } } });
      return useFieldConditions([offerPrice], form.control);
    });
    expect(result.current['offer.price']?.visible).toBe(true);
  });
});
