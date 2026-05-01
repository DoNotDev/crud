// packages/features/crud/src/utils/__tests__/scopeUtils.test.ts

/**
 * @fileoverview Tests for injectScope, injectScopeFilter, getCurrentScopeValue
 * @description Unit tests with mocked getScopeValue from @donotdev/core.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as core from '@donotdev/core';
import type { ScopeConfig, QueryOptions } from '@donotdev/core';

import {
  injectScope,
  injectScopeFilter,
  getCurrentScopeValue,
} from '../scopeUtils';

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof core>();
  return {
    ...actual,
    getScopeValue: vi.fn(),
  };
});

const getScopeValue = vi.mocked(core.getScopeValue);

const SCOPE_CONFIG: ScopeConfig = {
  provider: 'company',
  field: 'companyId',
};

describe('injectScope', () => {
  beforeEach(() => {
    getScopeValue.mockReturnValue('company-123');
  });
  afterEach(() => vi.clearAllMocks());

  it('returns data unchanged when scope is undefined', () => {
    const data = { name: 'Test' };
    expect(injectScope(data, undefined)).toBe(data);
    expect(getScopeValue).not.toHaveBeenCalled();
  });

  it('injects scope field when getScopeValue returns value', () => {
    const data = { name: 'Acme' };
    const result = injectScope(data, SCOPE_CONFIG);
    expect(getScopeValue).toHaveBeenCalledWith('company');
    expect(result).toEqual({ name: 'Acme', companyId: 'company-123' });
  });

  it('throws when getScopeValue returns null', () => {
    getScopeValue.mockReturnValue(null);
    const data = { name: 'Test' };
    expect(() => injectScope(data, SCOPE_CONFIG)).toThrow(
      /Scope provider "company" returned null/
    );
  });
});

describe('injectScopeFilter', () => {
  beforeEach(() => {
    getScopeValue.mockReturnValue('company-456');
  });
  afterEach(() => vi.clearAllMocks());

  it('returns options unchanged when scope is undefined', () => {
    const options: QueryOptions = {
      orderBy: [{ field: 'name', direction: 'asc' }],
    };
    expect(injectScopeFilter(options, undefined)).toEqual(options);
    expect(getScopeValue).not.toHaveBeenCalled();
  });

  it('adds where filter when getScopeValue returns value', () => {
    const options: QueryOptions = {
      orderBy: [{ field: 'name', direction: 'asc' }],
    };
    const result = injectScopeFilter(options, SCOPE_CONFIG);
    expect(getScopeValue).toHaveBeenCalledWith('company');
    expect(result.where).toEqual([
      { field: 'companyId', operator: '==', value: 'company-456' },
    ]);
    expect(result.orderBy).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('appends to existing where', () => {
    const options: QueryOptions = {
      where: [{ field: 'status', operator: '==', value: 'active' }],
    };
    const result = injectScopeFilter(options, SCOPE_CONFIG);
    expect(result.where).toHaveLength(2);
    expect(result.where).toContainEqual({
      field: 'companyId',
      operator: '==',
      value: 'company-456',
    });
  });

  it('throws when getScopeValue returns null', () => {
    getScopeValue.mockReturnValue(null);
    const options: QueryOptions = { limit: 10 };
    expect(() => injectScopeFilter(options, SCOPE_CONFIG)).toThrow(
      /Scope provider "company" returned null/
    );
  });
});

describe('getCurrentScopeValue', () => {
  beforeEach(() => {
    getScopeValue.mockReturnValue('scope-789');
  });
  afterEach(() => vi.clearAllMocks());

  it('returns null when scope is undefined', () => {
    expect(getCurrentScopeValue(undefined)).toBe(null);
    expect(getScopeValue).not.toHaveBeenCalled();
  });

  it('returns value from getScopeValue when scope is defined', () => {
    expect(getCurrentScopeValue(SCOPE_CONFIG)).toBe('scope-789');
    expect(getScopeValue).toHaveBeenCalledWith('company');
  });
});

// ============================================================================
// EDGE CASES - injectScope
// ============================================================================

describe('injectScope - edge cases', () => {
  afterEach(() => vi.clearAllMocks());

  it('overwrites existing scope field in data', () => {
    getScopeValue.mockReturnValue('new-scope');
    const data = { name: 'Test', companyId: 'old-scope' };
    const result = injectScope(data, SCOPE_CONFIG);
    expect(result.companyId).toBe('new-scope');
  });

  it('works with empty data object', () => {
    getScopeValue.mockReturnValue('scope-val');
    const result = injectScope({}, SCOPE_CONFIG);
    expect(result).toEqual({ companyId: 'scope-val' });
  });

  it('preserves all existing fields in data', () => {
    getScopeValue.mockReturnValue('scope-val');
    const data = { a: 1, b: 'two', c: [3], d: { nested: true } };
    const result = injectScope(data, SCOPE_CONFIG);
    expect(result).toEqual({ ...data, companyId: 'scope-val' });
  });

  it('uses scope.field as the injected key', () => {
    getScopeValue.mockReturnValue('org-99');
    const orgScope: ScopeConfig = { provider: 'org', field: 'organizationId' };
    const result = injectScope({ name: 'X' }, orgScope);
    expect(result).toEqual({ name: 'X', organizationId: 'org-99' });
    expect(getScopeValue).toHaveBeenCalledWith('org');
  });

  it('error message includes provider name', () => {
    getScopeValue.mockReturnValue(null);
    const customScope: ScopeConfig = { provider: 'tenant', field: 'tenantId' };
    expect(() => injectScope({}, customScope)).toThrow(
      /Scope provider "tenant" returned null/
    );
  });
});

// ============================================================================
// EDGE CASES - injectScopeFilter
// ============================================================================

describe('injectScopeFilter - edge cases', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns empty object when both queryOptions and scope are undefined', () => {
    const result = injectScopeFilter(undefined, undefined);
    expect(result).toEqual({});
  });

  it('creates base options from undefined queryOptions when scope is provided', () => {
    getScopeValue.mockReturnValue('val');
    const result = injectScopeFilter(undefined, SCOPE_CONFIG);
    expect(result.where).toEqual([
      { field: 'companyId', operator: '==', value: 'val' },
    ]);
  });

  it('warns and skips filter when scope.field is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badScope = {
      provider: 'company',
      field: 123,
    } as unknown as ScopeConfig;
    const options: QueryOptions = { limit: 5 };
    const result = injectScopeFilter(options, badScope);
    expect(result).toEqual(options);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('scope.field must be a string')
    );
    warnSpy.mockRestore();
  });

  it('preserves all existing queryOptions properties', () => {
    getScopeValue.mockReturnValue('val');
    const options: QueryOptions = {
      limit: 20,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      where: [{ field: 'active', operator: '==', value: true }],
    };
    const result = injectScopeFilter(options, SCOPE_CONFIG);
    expect(result.limit).toBe(20);
    expect(result.orderBy).toEqual(options.orderBy);
    expect(result.where).toHaveLength(2);
  });

  it('does not mutate original queryOptions', () => {
    getScopeValue.mockReturnValue('val');
    const original: QueryOptions = {
      where: [{ field: 'status', operator: '==', value: 'active' }],
    };
    const originalWhere = [...original.where!];
    injectScopeFilter(original, SCOPE_CONFIG);
    expect(original.where).toEqual(originalWhere);
  });

  it('error message includes provider name for null scope value', () => {
    getScopeValue.mockReturnValue(null);
    const customScope: ScopeConfig = { provider: 'workspace', field: 'wsId' };
    expect(() => injectScopeFilter({}, customScope)).toThrow(
      /Scope provider "workspace" returned null/
    );
  });
});

// ============================================================================
// EDGE CASES - getCurrentScopeValue
// ============================================================================

describe('getCurrentScopeValue - edge cases', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns null when getScopeValue returns null', () => {
    getScopeValue.mockReturnValue(null);
    expect(getCurrentScopeValue(SCOPE_CONFIG)).toBeNull();
  });

  it('delegates to getScopeValue with correct provider', () => {
    getScopeValue.mockReturnValue('result');
    const scope: ScopeConfig = { provider: 'team', field: 'teamId' };
    getCurrentScopeValue(scope);
    expect(getScopeValue).toHaveBeenCalledWith('team');
  });
});
