// packages/features/crud/src/components/fields/display/__tests__/BooleanFieldDisplay.test.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import BadgeFieldDisplay from '../BadgeFieldDisplay';
import CheckboxFieldDisplay from '../CheckboxFieldDisplay';

afterEach(cleanup);

/** French `crud:boolean.*`, the documented Yes / No keys */
const t = (key: string) =>
  ({ 'crud:boolean.yes': 'Oui', 'crud:boolean.no': 'Non' })[key] ?? key;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: the config is not read for booleans
const config = {} as any;

describe('Yes / No field displays', () => {
  it('CheckboxFieldDisplay reads crud:boolean.*', () => {
    render(<CheckboxFieldDisplay config={config} value t={t} />);
    expect(screen.getByText('Oui')).toBeTruthy();
    cleanup();
    render(<CheckboxFieldDisplay config={config} value={false} t={t} />);
    expect(screen.getByText('Non')).toBeTruthy();
  });

  it('BadgeFieldDisplay reads crud:boolean.* for a boolean', () => {
    render(<BadgeFieldDisplay config={config} value t={t} />);
    expect(screen.getByText('Oui')).toBeTruthy();
  });

  it('an empty value shows the documented dash', () => {
    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: an empty row value
      <CheckboxFieldDisplay config={config} value={null as any} t={t} />
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});
