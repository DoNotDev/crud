// packages/features/crud/src/__tests__/FunctionsAdapter.bulk.test.ts

/**
 * @fileoverview FunctionsAdapter.bulk() — unit tests
 * @description Covers the callable-backed bulk implementation:
 * happy path, empty payload, collision rejection, callable failure wrapping,
 * and malformed-server-response handling.
 *
 * The `@donotdev/core` provider registry is mocked so the adapter resolves a
 * fake ICallableProvider whose `call()` we assert on directly.
 *
 * @version 0.1.0
 * @since 0.2.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Mocks — @donotdev/core provider registry
// -----------------------------------------------------------------------------

// The mocked callable — each test clears / rewires the resolved value.
const callableCall = vi.fn();

vi.mock('@donotdev/core', async () => {
  const actual =
    await vi.importActual<typeof import('@donotdev/core')>('@donotdev/core');
  return {
    ...actual,
    // Provider registry lookup → returns a fake ICallableProvider.
    getProvider: vi.fn((key: string) => {
      if (key !== 'callable') {
        throw new Error(`unexpected provider lookup: ${key}`);
      }
      return { call: callableCall };
    }),
  };
});

// -----------------------------------------------------------------------------
// Subject under test — imported after mocks are registered.
// -----------------------------------------------------------------------------

import { FunctionsAdapter } from '../adapters/FunctionsAdapter';
import { BulkCollisionError } from '@donotdev/core';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface Event {
  title: string;
}

function resetMocks(): void {
  callableCall.mockReset();
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('FunctionsAdapter.bulk()', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('invokes bulk_${collection} once with the exact wire shape and preserves order', async () => {
    callableCall.mockResolvedValueOnce({
      insertedIds: ['evt_1', 'evt_2'],
      updatedIds: ['e1'],
      deletedIds: ['e2', 'e3'],
    });

    const adapter = new FunctionsAdapter();

    const result = await adapter.bulk<Event>('events', {
      inserts: [{ title: 'A' }, { title: 'B' }],
      updates: [{ id: 'e1', patch: { title: 'renamed' } }],
      deletes: ['e2', 'e3'],
    });

    // Callable invoked exactly once with the correct name and body.
    expect(callableCall).toHaveBeenCalledTimes(1);
    const [functionName, body] = callableCall.mock.calls[0] as [
      string,
      { inserts: unknown[]; updates: unknown[]; deletes: string[] },
    ];
    expect(functionName).toBe('bulk_events');
    expect(body).toEqual({
      inserts: [{ title: 'A' }, { title: 'B' }],
      updates: [{ id: 'e1', patch: { title: 'renamed' } }],
      deletes: ['e2', 'e3'],
    });

    // Response pass-through, order preserved per bucket.
    expect(result.insertedIds).toEqual(['evt_1', 'evt_2']);
    expect(result.updatedIds).toEqual(['e1']);
    expect(result.deletedIds).toEqual(['e2', 'e3']);
  });

  it('empty payload is a no-op — no callable invoked, zeroed response', async () => {
    const adapter = new FunctionsAdapter();

    const result = await adapter.bulk<Event>('events', {});

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      deletedIds: [],
    });
    expect(callableCall).not.toHaveBeenCalled();
  });

  it('empty payload with explicit empty arrays is also a no-op', async () => {
    const adapter = new FunctionsAdapter();

    const result = await adapter.bulk<Event>('events', {
      inserts: [],
      updates: [],
      deletes: [],
    });

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      deletedIds: [],
    });
    expect(callableCall).not.toHaveBeenCalled();
  });

  it('rejects with BulkCollisionError (updates vs deletes) — callable not invoked', async () => {
    const adapter = new FunctionsAdapter();

    await expect(
      adapter.bulk<Event>('events', {
        updates: [{ id: 'x', patch: { title: 'renamed' } }],
        deletes: ['x'],
      })
    ).rejects.toBeInstanceOf(BulkCollisionError);

    expect(callableCall).not.toHaveBeenCalled();
  });

  it('rejects with BulkCollisionError (inserts-with-id vs updates) — callable not invoked', async () => {
    const adapter = new FunctionsAdapter();

    await expect(
      adapter.bulk<Event>('events', {
        // Insert carrying an explicit id that also appears in updates.
        inserts: [{ id: 'y', title: 'A' } as unknown as Event],
        updates: [{ id: 'y', patch: { title: 'renamed' } }],
      })
    ).rejects.toBeInstanceOf(BulkCollisionError);

    expect(callableCall).not.toHaveBeenCalled();
  });

  it('wraps callable rejection (server 500) via wrapCrudError', async () => {
    callableCall.mockRejectedValueOnce(new Error('internal server error'));

    const adapter = new FunctionsAdapter();

    await expect(
      adapter.bulk<Event>('events', {
        deletes: ['e1'],
      })
    ).rejects.toMatchObject({
      // wrapCrudError produces a DoNotDevError whose message references the
      // adapter signature `FunctionsAdapter.bulk(events)`.
      message: expect.stringContaining('FunctionsAdapter.bulk(events)'),
    });

    expect(callableCall).toHaveBeenCalledTimes(1);
  });

  it('malformed server response (missing insertedIds) fails loud — not a silent empty result', async () => {
    // Response is missing `insertedIds` — Valibot parse must reject.
    callableCall.mockResolvedValueOnce({
      updatedIds: [],
      deletedIds: [],
    });

    const adapter = new FunctionsAdapter();

    const promise = adapter.bulk<Event>('events', {
      deletes: ['e1'],
    });

    await expect(promise).rejects.toThrow();
    // And the error message surfaces as a clean adapter error, not an empty
    // pass-through.
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('FunctionsAdapter.bulk'),
    });
  });

  it('malformed server response (wrong id type) fails loud', async () => {
    callableCall.mockResolvedValueOnce({
      insertedIds: [42], // number, schema requires string
      updatedIds: [],
      deletedIds: [],
    });

    const adapter = new FunctionsAdapter();

    await expect(
      adapter.bulk<Event>('events', {
        inserts: [{ title: 'A' }],
      })
    ).rejects.toThrow();
  });
});
