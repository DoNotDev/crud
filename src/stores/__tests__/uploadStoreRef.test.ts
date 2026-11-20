import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

describe('uploadStoreRef', () => {
  it(
    'is empty until the upload store module is loaded, then holds it',
    { timeout: 30000 },
    async () => {
      vi.resetModules();
      const { getLoadedUploadStore } = await import('../uploadStoreRef');
      expect(getLoadedUploadStore()).toBeNull();
      const { useUploadStore } = await import('../UploadStore');
      expect(getLoadedUploadStore()).toBe(useUploadStore);
    }
  );

  it('keeps the upload store out of the form hook module graph', () => {
    const source = readFileSync(
      join(__dirname, '../../forms/hooks/useEntityForm.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"][^'"]*stores\/UploadStore['"]/);
  });
});
