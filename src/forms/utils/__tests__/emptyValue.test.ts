/**
 * @fileoverview Empty value contract: an emptied input is null, never ''.
 */

import { describe, it, expect } from 'vitest';

import { EMPTY_VALUE, fromInputValue } from '../emptyValue';

describe('fromInputValue', () => {
  it('maps an emptied input to EMPTY_VALUE (null)', () => {
    expect(EMPTY_VALUE).toBeNull();
    expect(fromInputValue('')).toBeNull();
  });

  it('keeps any typed value, whitespace included', () => {
    expect(fromInputValue('FR123')).toBe('FR123');
    expect(fromInputValue(' ')).toBe(' ');
  });
});
