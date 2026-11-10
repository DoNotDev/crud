// packages/features/crud/src/utils/__tests__/mergeWithOptimistic.test.ts

/**
 * @fileoverview Tests for mergeWithOptimistic
 * @description Unit tests for merging query data with optimistic operations.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import type { OptimisticMeta } from '../../types';
import {
  applyOptimisticToDoc,
  mergeWithOptimistic,
} from '../mergeWithOptimistic';

/** Item must satisfy WithId (id + index signature) for mergeWithOptimistic generic */
interface Item {
  id: string;
  name: string;
  [key: string]: unknown;
}

function meta(
  operation: OptimisticMeta['operation'],
  optimisticData: unknown,
  tempId = 'temp-1',
  originalData: unknown = null
): OptimisticMeta {
  return {
    tempId,
    originalData,
    optimisticData,
    status: 'pending',
    operation,
  };
}

describe('mergeWithOptimistic', () => {
  const queryData: Item[] = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
    { id: '3', name: 'Carol' },
  ];

  it('returns query data when optimistic is empty', () => {
    const result = mergeWithOptimistic(queryData, {});
    expect(result).toEqual(queryData);
  });

  it('filters out items marked for delete', () => {
    const optimistic: Record<string, OptimisticMeta> = {
      '2': meta('delete', { id: '2', name: 'Bob' }),
    };
    const result = mergeWithOptimistic(queryData, optimistic);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('replaces item with optimistic update', () => {
    const optimistic: Record<string, OptimisticMeta> = {
      '2': meta('update', { id: '2', name: 'Robert' }),
    };
    const result = mergeWithOptimistic(queryData, optimistic);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ id: '2', name: 'Robert' });
  });

  it('appends optimistic add not in query data', () => {
    const optimistic: Record<string, OptimisticMeta> = {
      'temp-new': meta('add', { id: 'temp-new', name: 'New' }),
    };
    const result = mergeWithOptimistic(queryData, optimistic);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({ id: 'temp-new', name: 'New' });
  });

  it('combines delete, update, and add', () => {
    const optimistic: Record<string, OptimisticMeta> = {
      '2': meta('delete', queryData[1]),
      '3': meta('update', { id: '3', name: 'Caroline' }),
      'temp-x': meta('add', { id: 'temp-x', name: 'X' }, 'temp-x'),
    };
    const result = mergeWithOptimistic(queryData, optimistic);
    expect(result).toHaveLength(3); // 1 kept, 2 deleted, 3 updated, 1 added
    expect(result[0]).toEqual({ id: '1', name: 'Alice' });
    expect(result[1]).toEqual({ id: '3', name: 'Caroline' });
    expect(result[2]).toEqual({ id: 'temp-x', name: 'X' });
  });

  it('ignores add if id already in query data', () => {
    const optimistic: Record<string, OptimisticMeta> = {
      '2': meta('add', { id: '2', name: 'Duplicate' }, '2'),
    };
    const result = mergeWithOptimistic(queryData, optimistic);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ id: '2', name: 'Bob' });
  });
});

describe('applyOptimisticToDoc', () => {
  const doc: Item = { id: '1', name: 'Cached' };

  it('returns the cached document when nothing is pending', () => {
    expect(applyOptimisticToDoc(doc, undefined)).toBe(doc);
    expect(applyOptimisticToDoc(null, undefined)).toBeNull();
  });

  it('returns null for a pending delete', () => {
    expect(applyOptimisticToDoc(doc, meta('delete', null, '1'))).toBeNull();
  });

  it('merges a pending update over the cached document', () => {
    const full = { id: '1', name: 'Cached', price: 10 };
    expect(
      applyOptimisticToDoc(
        full,
        meta('update', { id: '1', name: 'Updated' }, '1')
      )
    ).toEqual({ id: '1', name: 'Updated', price: 10 });
  });

  it('keeps fields the partial optimistic value lacks (cold-cache update)', () => {
    const full = { id: '1', name: 'Cached', price: 10 };
    expect(
      applyOptimisticToDoc(full, meta('update', { id: '1', read: true }, '1'))
    ).toEqual({ id: '1', name: 'Cached', price: 10, read: true });
  });

  it('returns the optimistic value for an update with nothing cached', () => {
    const updated = { id: '1', name: 'Updated' };
    expect(applyOptimisticToDoc(null, meta('update', updated, '1'))).toBe(
      updated
    );
  });

  it('returns the optimistic value for a pending add not yet cached', () => {
    const added = { id: 'temp-1', name: 'New' };
    expect(applyOptimisticToDoc(null, meta('add', added))).toBe(added);
  });

  it('keeps the cached document once the server returned the add', () => {
    expect(
      applyOptimisticToDoc(doc, meta('add', { id: '1', name: 'Stale' }, '1'))
    ).toBe(doc);
  });
});
