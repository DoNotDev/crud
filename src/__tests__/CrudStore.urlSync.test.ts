// packages/features/crud/src/__tests__/CrudStore.urlSync.test.ts

/**
 * @fileoverview CrudStore filter ↔ URL sync
 * @description Scope (entity collection keys only, opt-in/out), re-read on URL change
 * (popstate, Navigation API, mount), types round-trip and encoding.
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */

import { render, renderHook } from '@testing-library/react';
import { Fragment, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { urlFilterProductEntity as productEntity } from '@dndev/test-entities';

vi.mock('../fieldTypeRegistry.store', () => ({
  getFilterType: vi.fn((type: string) => {
    const map: Record<string, string> = {
      text: 'text',
      number: 'range',
      select: 'select',
      multiselect: 'multiselect',
      reference: 'reference',
    };
    return map[type];
  }),
  isFilterable: vi.fn(() => true),
}));


const KEY = productEntity.collection;
const PICKER_KEY = `${KEY}#picker`;

type StoreModule = typeof import('../CrudStore');
let useCrudStore: StoreModule['useCrudStore'];

/** Fresh store module (module-level URL sync registry and listener reset). */
async function loadStore() {
  // The store is a global singleton by name: drop it so a fresh module creates it
  const stores = (globalThis as { _DNDEV_STORES_?: Record<string, unknown> })
    ._DNDEV_STORES_;
  if (stores) delete stores['crud-store'];
  vi.resetModules();
  ({ useCrudStore } = await import('../CrudStore'));
}

function go(url: string) {
  history.pushState({ idx: 1 }, '', url);
}

function params() {
  return new URLSearchParams(location.search);
}

beforeEach(async () => {
  vi.useFakeTimers();
  delete (window as { navigation?: unknown }).navigation;
  history.replaceState(null, '', '/catalogue');
  await loadStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CrudStore URL sync: scope', () => {
  it('an entity collection key writes its filters to the URL (debounced)', () => {
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    expect(location.search).toBe('');
    vi.advanceTimersByTime(500);
    expect(params().get('f_type')).toBe('toner');
  });

  it('a custom filterKey neither writes nor reads the URL', () => {
    go('/catalogue?f_type=serum');
    expect(useCrudStore.getState().getFilters(PICKER_KEY)).toEqual({});
    useCrudStore.getState().setFilters(PICKER_KEY, { type: 'toner' });
    vi.advanceTimersByTime(500);
    expect(params().getAll('f_type')).toEqual(['serum']);
  });

  it('a custom key opted in with its entity reads and writes', () => {
    go('/catalogue?f_type=serum');
    useCrudStore.getState().setFilterUrlSync(PICKER_KEY, productEntity);
    expect(useCrudStore.getState().getFilters(PICKER_KEY)).toEqual({
      type: ['serum'],
    });
    useCrudStore.getState().setFilters(PICKER_KEY, { type: 'toner' });
    vi.advanceTimersByTime(500);
    expect(params().get('f_type')).toBe('toner');
  });

  it('an entity collection key opted out does not sync', () => {
    go('/catalogue?f_type=serum');
    useCrudStore.getState().setFilterUrlSync(KEY, null);
    expect(useCrudStore.getState().getFilters(KEY)).toEqual({});
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    vi.advanceTimersByTime(500);
    expect(params().get('f_type')).toBe('serum');
  });

  it('a key that is no entity collection does not sync by default', () => {
    go('/catalogue?f_type=serum');
    expect(useCrudStore.getState().getFilters('not_a_collection')).toEqual({});
  });

  it("writes only the entity's params; others and the hash stay", () => {
    history.replaceState(null, '', '/catalogue?q=cream&f_other=1&f_type=serum#top');
    useCrudStore.getState().setFilters(KEY, { skinTypes: ['dry'] });
    vi.advanceTimersByTime(500);
    expect(params().get('q')).toBe('cream');
    expect(params().get('f_other')).toBe('1');
    expect(params().has('f_type')).toBe(false);
    expect(params().getAll('f_skinTypes')).toEqual(['dry']);
    expect(location.hash).toBe('#top');
  });

  it("reads only the entity's fields", () => {
    go('/catalogue?f_other=1&f_type=serum');
    expect(useCrudStore.getState().getFilters(KEY)).toEqual({ type: ['serum'] });
  });

  it('keeps the router history state on write', () => {
    history.replaceState({ usr: null, key: 'k1', idx: 3 }, '', '/catalogue');
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    vi.advanceTimersByTime(500);
    expect(history.state).toEqual({ usr: null, key: 'k1', idx: 3 });
  });

  it('drops a pending write when the page changed meanwhile', () => {
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    go('/product/1');
    vi.advanceTimersByTime(500);
    expect(location.pathname).toBe('/product/1');
    expect(location.search).toBe('');
  });
});

describe('CrudStore URL sync: re-read on URL change', () => {
  it('back/forward (popstate) updates the filter state', () => {
    useCrudStore.getState().getFilters(KEY); // first access installs the listener
    go('/catalogue?f_type=serum');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useCrudStore.getState().collections[KEY]?.ui.filters).toEqual({
      type: ['serum'],
    });
  });

  it('a link without params clears the filter state', () => {
    go('/catalogue?f_type=serum');
    expect(useCrudStore.getState().getFilters(KEY)).toEqual({ type: ['serum'] });
    go('/catalogue');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useCrudStore.getState().collections[KEY]?.ui.filters).toEqual({});
  });

  it('follows pushState navigations through the Navigation API', async () => {
    const navigation = new EventTarget();
    (window as { navigation?: EventTarget }).navigation = navigation;
    await loadStore();
    useCrudStore.getState().getFilters(KEY);
    go('/catalogue?f_type=toner&f_skinTypes=oily');
    navigation.dispatchEvent(new Event('currententrychange'));
    expect(useCrudStore.getState().collections[KEY]?.ui.filters).toEqual({
      type: ['toner'],
      skinTypes: ['oily'],
    });
  });

  it('does not re-read a custom key', () => {
    useCrudStore.getState().setFilters(PICKER_KEY, { type: 'toner' });
    useCrudStore.getState().getFilters(KEY);
    go('/catalogue?f_type=serum');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useCrudStore.getState().collections[PICKER_KEY]?.ui.filters).toEqual(
      { type: 'toner' }
    );
  });

  it('a pending write on the same page wins over the URL', () => {
    useCrudStore.getState().getFilters(KEY);
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    useCrudStore.getState().syncFiltersFromUrl(KEY);
    expect(useCrudStore.getState().collections[KEY]?.ui.filters).toEqual({
      type: 'toner',
    });
    vi.advanceTimersByTime(500);
    expect(params().get('f_type')).toBe('toner');
  });

  it('useCrudFilters re-reads the URL on mount (state left by a previous page)', async () => {
    const { useCrudFilters } = await import('../hooks/useCrudFilters');
    useCrudStore.getState().setFilters(KEY, { type: 'toner' });
    vi.advanceTimersByTime(500);
    go('/catalogue?f_type=serum');
    const { result } = renderHook(() => useCrudFilters({ collection: KEY }));
    expect(result.current.filters).toEqual({ type: ['serum'] });
  });

  it('useCrudFilters urlSync: true on a custom key needs an entity', async () => {
    const { useCrudFilters } = await import('../hooks/useCrudFilters');
    expect(() =>
      renderHook(() =>
        useCrudFilters({ collection: 'custom#key', urlSync: true })
      )
    ).toThrow(/needs the entity/);
  });

  it('useCrudFilters urlSync: false opts the collection key out', async () => {
    const { useCrudFilters } = await import('../hooks/useCrudFilters');
    go('/catalogue?f_type=serum');
    const { result } = renderHook(() =>
      useCrudFilters({ collection: KEY, urlSync: false })
    );
    expect(result.current.filters).toEqual({});
  });
});

describe('CrudStore URL sync: pure render', () => {
  it('a first mount with f_ params notifies no subscriber during render; first paint filtered', async () => {
    const { useCrudFilters } = await import('../hooks/useCrudFilters');
    go('/catalogue?f_type=serum');
    let rendering = false;
    let notifiedDuringRender = 0;
    const unsubscribe = useCrudStore.subscribe(() => {
      if (rendering) notifiedDuringRender++;
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const painted: unknown[] = [];
    // Another subscriber rendered first (the shop's HeaderCart)
    function Header() {
      useCrudStore((state) => state.collections);
      return null;
    }
    function Catalogue() {
      rendering = true;
      const { filters } = useCrudFilters({ collection: KEY });
      rendering = false;
      painted.push(filters);
      return null;
    }
    try {
      render(
        createElement(
          Fragment,
          null,
          createElement(Header),
          createElement(Catalogue)
        )
      );
      expect(notifiedDuringRender).toBe(0);
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(
        /Cannot update a component/
      );
      expect(painted[0]).toEqual({ type: ['serum'] });
      // Seeded by the mount effect
      expect(useCrudStore.getState().collections[KEY]?.ui.filters).toEqual({
        type: ['serum'],
      });
    } finally {
      unsubscribe();
      errors.mockRestore();
    }
  });

  it('server render shows no filters and writes no state', async () => {
    const { useCrudFilters } = await import('../hooks/useCrudFilters');
    go('/catalogue?f_type=serum');
    function Catalogue() {
      const { filters } = useCrudFilters({ collection: KEY });
      return createElement('span', null, JSON.stringify(filters));
    }
    expect(renderToString(createElement(Catalogue))).toBe('<span>{}</span>');
    expect(useCrudStore.getState().collections[KEY]).toBeUndefined();
  });
});

describe('CrudStore URL sync: types round-trip and encoding', () => {
  function roundTrip(filters: Record<string, unknown>) {
    useCrudStore.getState().setFilters(KEY, filters as never);
    vi.advanceTimersByTime(500);
    const search = location.search;
    useCrudStore.setState({ collections: {} });
    history.replaceState(null, '', `/catalogue${search}`);
    return useCrudStore.getState().getFilters(KEY);
  }

  it('a single value of a multiselect field comes back as an array', () => {
    expect(roundTrip({ skinTypes: ['dry'] })).toEqual({ skinTypes: ['dry'] });
    expect(params().getAll('f_skinTypes')).toEqual(['dry']);
  });

  it('several values come back as an array, in order', () => {
    expect(roundTrip({ skinTypes: ['oily', 'dry'] })).toEqual({
      skinTypes: ['oily', 'dry'],
    });
  });

  it('select fields round-trip as arrays (multi-select filters)', () => {
    expect(roundTrip({ type: ['serum', 'essence'] })).toEqual({
      type: ['serum', 'essence'],
    });
    expect(roundTrip({ type: ['toner'] })).toEqual({ type: ['toner'] });
    expect(params().getAll('f_type')).toEqual(['toner']);
  });

  it('a string state of a select field reads back as a one-value array', () => {
    expect(roundTrip({ type: 'toner' })).toEqual({ type: ['toner'] });
  });

  it('a single value of a text field stays a string', () => {
    expect(roundTrip({ name: 'cream' })).toEqual({ name: 'cream' });
  });

  it('values containing commas are not split', () => {
    expect(roundTrip({ name: 'a,b', skinTypes: ['x,y'] })).toEqual({
      name: 'a,b',
      skinTypes: ['x,y'],
    });
  });

  it('ranges use _min / _max', () => {
    expect(roundTrip({ price: { min: '10', max: '' } })).toEqual({
      price: { min: '10' },
    });
    expect(params().get('f_price_min')).toBe('10');
    expect(params().has('f_price_max')).toBe(false);
  });
});
