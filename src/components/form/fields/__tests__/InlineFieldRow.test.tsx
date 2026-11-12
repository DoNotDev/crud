// packages/features/crud/src/components/form/fields/__tests__/InlineFieldRow.test.tsx

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import CheckboxFieldComponent from '../CheckboxFieldComponent';
import SwitchFieldComponent from '../SwitchFieldComponent';

/** The row an inline control sits in. */
function rowOf(control: HTMLElement): HTMLElement {
  let el: HTMLElement | null = control;
  while (el && !el.style.minBlockSize) el = el.parentElement;
  return el!;
}

describe('Inline-control form rows', () => {
  it('gives a switch field the height of an input row', () => {
    render(<SwitchFieldComponent label="Actif" checked={false} />);
    const row = rowOf(screen.getByRole('switch', { name: 'Actif' }));
    expect(row.style.minBlockSize).toBe('var(--touch-target)');
  });

  it('gives a checkbox field the height of an input row', () => {
    render(<CheckboxFieldComponent label="Accepter" checked={false} />);
    const row = rowOf(screen.getByRole('checkbox', { name: 'Accepter' }));
    expect(row.style.minBlockSize).toBe('var(--touch-target)');
  });

  it('keeps the switch label at full colour while off (track only is muted)', () => {
    const { container } = render(
      <SwitchFieldComponent label="Actif" checked={false} />
    );
    expect(container.querySelector('.dndev-switch[data-variant="muted"]')).not.toBeNull();
    expect(screen.getByText('Actif').closest('[data-variant="muted"]')).toBeNull();
  });
});
