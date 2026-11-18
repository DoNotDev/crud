import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const localesDir = join(__dirname, '../../../../../core/i18n/locales/lazy');
const locales = readdirSync(localesDir).filter((file) => /^crud_[a-z]{2}\.json$/.test(file));

describe('field-array control translations', () => {
  it('finds the CRUD locales', () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it.each(locales)('%s provides complete interpolated field-array messages', (file) => {
    const { fieldArray }: { fieldArray: Record<string, string> } = JSON.parse(
      readFileSync(join(localesDir, file), 'utf8')
    );
    expect(fieldArray.addRow).toContain('{{field}}');
    expect(fieldArray.removeRow).toContain('{{field}}');
    expect(fieldArray.removeRow).toContain('{{index}}');
    expect(fieldArray.noSubFields).toContain('{{field}}');
  });
});
