// packages/features/crud/src/utils/__tests__/uploadValidation.test.ts

/**
 * @fileoverview Tests for isStorageUrl, validatePicture, checkForBlobUrls, hasBlobUrls
 * @description Unit tests for upload validation utilities.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import {
  isStorageUrl,
  validatePicture,
  checkForBlobUrls,
  hasBlobUrls,
} from '../uploadValidation';

describe('isStorageUrl', () => {
  it('returns true for https URL', () => {
    expect(isStorageUrl('https://storage.example.com/path')).toBe(true);
  });

  it('returns false for blob URL', () => {
    expect(isStorageUrl('blob:https://origin/abc')).toBe(false);
  });

  it('returns false for empty or non-string', () => {
    expect(isStorageUrl('')).toBe(false);
    expect(isStorageUrl(null as any)).toBe(false);
    expect(isStorageUrl(undefined as any)).toBe(false);
  });

  it('returns false for http (non-https)', () => {
    expect(isStorageUrl('http://example.com/x')).toBe(false);
  });
});

describe('validatePicture', () => {
  it('returns true when fullUrl and thumbUrl are storage URLs', () => {
    expect(
      validatePicture({
        fullUrl: 'https://storage.example.com/full.jpg',
        thumbUrl: 'https://storage.example.com/thumb.jpg',
      })
    ).toBe(true);
  });

  it('returns false when fullUrl is blob', () => {
    expect(
      validatePicture({
        fullUrl: 'blob:https://origin/abc',
        thumbUrl: 'https://storage.example.com/thumb.jpg',
      })
    ).toBe(false);
  });

  it('returns false when thumbUrl is blob', () => {
    expect(
      validatePicture({
        fullUrl: 'https://storage.example.com/full.jpg',
        thumbUrl: 'blob:https://origin/def',
      })
    ).toBe(false);
  });

  it('returns false for null or non-object', () => {
    expect(validatePicture(null as any)).toBe(false);
    expect(validatePicture(undefined as any)).toBe(false);
    expect(validatePicture('picture' as any)).toBe(false);
  });
});

describe('checkForBlobUrls', () => {
  it('returns empty array for null/undefined', () => {
    expect(checkForBlobUrls(null)).toEqual([]);
    expect(checkForBlobUrls(undefined)).toEqual([]);
  });

  it('returns path for root string blob URL', () => {
    expect(checkForBlobUrls('blob:http://x/y')).toEqual(['root']);
  });

  it('returns empty for non-blob string', () => {
    expect(checkForBlobUrls('https://x')).toEqual([]);
  });

  it('finds blob in nested object', () => {
    expect(checkForBlobUrls({ a: { b: 'blob:http://x/y' } })).toEqual(['a.b']);
  });

  it('finds blob in array', () => {
    expect(checkForBlobUrls(['ok', 'blob:http://x/y'])).toEqual(['[1]']);
  });

  it('reports Picture-like object with blob', () => {
    const result = checkForBlobUrls({
      fullUrl: 'blob:http://x',
      thumbUrl: 'https://y',
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('fullUrl');
  });

  it('recurses into nested structures', () => {
    const result = checkForBlobUrls({
      level1: { level2: { url: 'blob:http://x' } },
    });
    expect(result).toContainEqual('level1.level2.url');
  });
});

describe('hasBlobUrls', () => {
  it('returns false when no blob URLs', () => {
    expect(hasBlobUrls({ a: 1 })).toBe(false);
    expect(hasBlobUrls('https://x')).toBe(false);
  });

  it('returns true when blob URL present', () => {
    expect(hasBlobUrls('blob:http://x')).toBe(true);
    expect(hasBlobUrls({ url: 'blob:http://x' })).toBe(true);
  });
});

// ============================================================================
// EDGE CASES - isStorageUrl
// ============================================================================

describe('isStorageUrl - edge cases', () => {
  it('returns false for number input', () => {
    expect(isStorageUrl(123 as any)).toBe(false);
  });

  it('returns false for data: URL', () => {
    expect(isStorageUrl('data:image/png;base64,abc')).toBe(false);
  });

  it('returns false for file: URL', () => {
    expect(isStorageUrl('file:///tmp/test.jpg')).toBe(false);
  });

  it('returns true for https URL with query params', () => {
    expect(isStorageUrl('https://storage.example.com/img.jpg?token=abc')).toBe(
      true
    );
  });

  it('returns true for https URL with hash', () => {
    expect(isStorageUrl('https://cdn.example.com/file#section')).toBe(true);
  });

  it('returns false for whitespace-only string', () => {
    expect(isStorageUrl('   ')).toBe(false);
  });
});

// ============================================================================
// EDGE CASES - validatePicture
// ============================================================================

describe('validatePicture - edge cases', () => {
  it('returns true when thumbUrl is undefined (optional field)', () => {
    expect(
      validatePicture({
        fullUrl: 'https://storage.example.com/full.jpg',
      } as any)
    ).toBe(true);
  });

  it('returns true when thumbUrl is empty string (falsy, skipped)', () => {
    expect(
      validatePicture({
        fullUrl: 'https://storage.example.com/full.jpg',
        thumbUrl: '',
      })
    ).toBe(true);
  });

  it('returns false when fullUrl is empty string', () => {
    expect(
      validatePicture({
        fullUrl: '',
        thumbUrl: 'https://storage.example.com/thumb.jpg',
      })
    ).toBe(false);
  });

  it('returns false when fullUrl is not a storage URL (http)', () => {
    expect(
      validatePicture({
        fullUrl: 'http://insecure.com/img.jpg',
        thumbUrl: 'https://storage.example.com/thumb.jpg',
      })
    ).toBe(false);
  });

  it('returns false for array input', () => {
    expect(validatePicture([] as any)).toBe(false);
  });

  it('returns false for number input', () => {
    expect(validatePicture(42 as any)).toBe(false);
  });
});

// ============================================================================
// EDGE CASES - checkForBlobUrls (deeply nested, mixed)
// ============================================================================

describe('checkForBlobUrls - deep nesting and mixed content', () => {
  it('returns empty for primitive non-string types', () => {
    expect(checkForBlobUrls(42)).toEqual([]);
    expect(checkForBlobUrls(true)).toEqual([]);
    expect(checkForBlobUrls(false)).toEqual([]);
  });

  it('finds blob URL deeply nested in object', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            level4: {
              url: 'blob:http://deep/nested',
            },
          },
        },
      },
    };
    expect(checkForBlobUrls(data)).toEqual(['level1.level2.level3.level4.url']);
  });

  it('finds blob URL deeply nested in arrays', () => {
    const data = [[[['blob:http://x/y']]]];
    expect(checkForBlobUrls(data)).toEqual(['[0][0][0][0]']);
  });

  it('finds blob URLs in mixed object-array nesting', () => {
    const data = {
      items: [
        { name: 'ok', url: 'https://valid.com/img.jpg' },
        { name: 'bad', url: 'blob:http://x/y' },
      ],
    };
    expect(checkForBlobUrls(data)).toEqual(['items[1].url']);
  });

  it('handles empty string values without flagging', () => {
    const data = { field1: '', field2: 'valid text', field3: '' };
    expect(checkForBlobUrls(data)).toEqual([]);
  });

  it('handles null fields within objects', () => {
    const data = { a: null, b: undefined, c: 'blob:http://x' };
    expect(checkForBlobUrls(data)).toEqual(['c']);
  });

  it('detects Picture-like object with blob in thumbUrl only', () => {
    const data = {
      profile: {
        fullUrl: 'https://valid.com/full.jpg',
        thumbUrl: 'blob:http://x/y',
      },
    };
    const result = checkForBlobUrls(data);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('profile');
  });

  it('skips Picture-like objects with valid URLs', () => {
    const data = {
      avatar: {
        fullUrl: 'https://valid.com/full.jpg',
        thumbUrl: 'https://valid.com/thumb.jpg',
      },
    };
    expect(checkForBlobUrls(data)).toEqual([]);
  });

  it('handles empty arrays', () => {
    expect(checkForBlobUrls([])).toEqual([]);
  });

  it('handles empty objects', () => {
    expect(checkForBlobUrls({})).toEqual([]);
  });

  it('handles mixed valid and blob URLs in flat object', () => {
    const data = {
      url1: 'https://valid.com/a.jpg',
      url2: 'blob:http://bad',
      url3: 'https://valid.com/b.jpg',
      url4: 'blob:http://also-bad',
    };
    expect(checkForBlobUrls(data)).toEqual(['url2', 'url4']);
  });

  it('handles array of mixed strings', () => {
    const data = [
      'https://valid.com',
      'blob:http://bad',
      'just-text',
      'blob:http://also-bad',
    ];
    expect(checkForBlobUrls(data)).toEqual(['[1]', '[3]']);
  });
});

// ============================================================================
// EDGE CASES - hasBlobUrls
// ============================================================================

describe('hasBlobUrls - edge cases', () => {
  it('returns false for null', () => {
    expect(hasBlobUrls(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasBlobUrls(undefined)).toBe(false);
  });

  it('returns false for number', () => {
    expect(hasBlobUrls(42)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasBlobUrls('')).toBe(false);
  });

  it('returns true for deeply nested blob', () => {
    expect(hasBlobUrls({ a: { b: { c: 'blob:http://x' } } })).toBe(true);
  });
});
