/**
 * @fileoverview Regression: the form validation toast keys exist in every crud locale.
 *
 * Before: `validation.failed` / `validation.fixErrorsCount` existed in no locale; the
 * toast showed inline English with raw field names in every language.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

const LOCALES_DIR = join(__dirname, '../../../../../../core/i18n/locales/lazy/');
const crudLocales = readdirSync(LOCALES_DIR).filter((f) => /^crud_[a-z]{2}\.json$/.test(f));

describe('validation toast keys', () => {
  it('finds the crud locales', () => {
    expect(crudLocales.length).toBeGreaterThan(0);
  });

  it.each(crudLocales)('%s has form.validationFailed and form.fixFields with {{fields}}', (file) => {
    const { form } = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')) as { form: Record<string, string> };
    expect(form.validationFailed).toBeTruthy();
    expect(form.fixFields).toContain('{{fields}}');
  });
});
