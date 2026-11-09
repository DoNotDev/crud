// packages/features/crud/src/utils/__tests__/imageProcessingOptions.test.ts

import { describe, expect, it } from 'vitest';

import { readImageProcessingOptions } from '../imageProcessing';

describe('readImageProcessingOptions', () => {
  it('returns undefined when the field sets no image options (framework defaults apply)', () => {
    expect(readImageProcessingOptions(undefined)).toBeUndefined();
    expect(
      readImageProcessingOptions({ storagePath: 'products' })
    ).toBeUndefined();
  });

  it('accepts the full option set', () => {
    const image = {
      maxWidth: 2400,
      maxHeight: 2400,
      thumbWidth: 960,
      thumbHeight: 960,
      aspectRatio: 'original',
      quality: 0.9,
      thumbQuality: 0.85,
      background: 'transparent',
    };
    expect(
      readImageProcessingOptions({ storagePath: 'products', image })
    ).toEqual(image);
    expect(
      readImageProcessingOptions({ image: { aspectRatio: 4 / 5 } })
    ).toEqual({ aspectRatio: 0.8 });
  });

  it('fails loud on typos and out-of-range values', () => {
    expect(() =>
      readImageProcessingOptions({ image: { maxwidth: 2400 } })
    ).toThrow();
    expect(() =>
      readImageProcessingOptions({ image: { quality: 90 } })
    ).toThrow();
    expect(() =>
      readImageProcessingOptions({ image: { maxWidth: 1.5 } })
    ).toThrow();
    expect(() =>
      readImageProcessingOptions({ image: { aspectRatio: 'square' } })
    ).toThrow();
  });
});
