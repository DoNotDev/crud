import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useTranslation } from '@donotdev/core';

import { EntityFilters } from '../EntityFilters';
import { useCrudFilters } from '../../hooks/useCrudFilters';
import { adminOnlyFieldEntity, filterProductEntity, statusFilterEntity } from '@dndev/test-entities';

// Mock dependencies - use importOriginal to avoid brittle manual re-exports
vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  const mockT = Object.assign((key: string) => key, {
    t: (key: string) => key,
  });
  return {
    ...actual,
    useTranslation: vi.fn(() => ({ t: mockT, i18n: { language: 'en' } })),
    handleError: vi.fn(),
  };
});

vi.mock('@donotdev/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/components')>();
  return {
    ...actual,
    Button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    Grid: ({ children, cols, ...props }: any) => (
      <div data-cols={JSON.stringify(cols)} {...props}>
        {children}
      </div>
    ),
    Combobox: ({
      children,
      label,
      options,
      value,
      multiple,
      clearLabel,
      selectedLabel,
    }: any) => (
      <div
        data-testid={`combobox-${label}`}
        data-options={JSON.stringify(options)}
        data-value={JSON.stringify(value ?? null)}
        data-multiple={multiple ? 'true' : 'false'}
        data-clear-label={JSON.stringify(clearLabel ?? null)}
        data-selected-label={JSON.stringify(selectedLabel ?? null)}
      >
        {children}
      </div>
    ),
    Tag: ({ children, removeLabel }: any) => (
      <span data-testid="filter-chip" data-remove-label={removeLabel}>
        {children}
      </span>
    ),
  };
});

const FILTER_TYPES: Record<string, string> = {
  text: 'text',
  select: 'select',
  multiselect: 'multiselect',
  reference: 'reference',
  number: 'range',
};

vi.mock('../../fieldTypeRegistry', () => ({
  getFilterType: (type: string) => FILTER_TYPES[type],
  isFilterable: (type: string) => type in FILTER_TYPES,
}));

vi.mock('../../fieldTypeRegistry.store', () => ({
  getFilterType: (type: string) => FILTER_TYPES[type],
  isFilterable: (type: string) => type in FILTER_TYPES,
}));

vi.mock('../../hooks/useReferenceResolver', () => ({
  useReferenceResolver: vi.fn(() => ({
    filter_brands: { b1: 'Brand One', b2: 'Brand Two' },
  })),
}));

vi.mock('../../hooks/useCrudFilters', () => ({
  useCrudFilters: vi.fn(() => ({
    filters: {},
    setFilter: vi.fn(),
    setFilters: vi.fn(),
    clearFilters: vi.fn(),
  })),
}));

vi.mock('../../useCrudCardList', () => ({
  useCrudCardList: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
  })),
}));

describe('EntityFilters', () => {
  const mockEntity = statusFilterEntity;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds entity and shared crud translations without caller wiring', () => {
    render(<EntityFilters entity={mockEntity} viewerRole="user" />);
    expect(useTranslation).toHaveBeenCalledWith([mockEntity.namespace, 'crud']);
  });

  it('renders filters for entity fields', () => {
    render(<EntityFilters entity={mockEntity} viewerRole="user" />);

    // Component should render clear buttons (per-filter + global)
    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('renders with data prop', () => {
    const mockData = [
      { id: '1', title: 'Product 1', status: 'active' },
      { id: '2', title: 'Product 2', status: 'inactive' },
    ];

    render(<EntityFilters entity={mockEntity} viewerRole="user" data={mockData} />);

    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('renders with sidebar variant', () => {
    render(<EntityFilters entity={mockEntity} viewerRole="user" variant="sidebar" />);

    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('sizes inline columns by the panel width (selects never under 14rem, at most 2 below laptop)', () => {
    const { container } = render(
      <EntityFilters entity={mockEntity} viewerRole="user" variant="inline" />
    );
    const grid = container.querySelector('[data-cols]');
    expect(grid).toBeTruthy();
    const upTo2 =
      'repeat(auto-fit, minmax(max(min(100%, 14rem), calc((100% - var(--gap-md)) / 2)), 1fr))';
    const all = 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))';
    expect(JSON.parse(grid!.getAttribute('data-cols')!)).toEqual([
      upTo2,
      upTo2,
      all,
      all,
    ]);
  });

  it('puts the inline clear button beside the filter grid, not in it', () => {
    const { container } = render(
      <EntityFilters entity={mockEntity} viewerRole="user" variant="inline" />
    );
    const grid = container.querySelector('[data-cols]')!;
    const clear = screen.getByRole('button', { name: /clear/i });
    expect(grid.contains(clear)).toBe(false);
    expect(clear.parentElement).toBe(grid.parentElement);
  });

  it('uses 1 col for sidebar variant', () => {
    const { container } = render(
      <EntityFilters entity={mockEntity} viewerRole="user" variant="sidebar" />
    );
    const grid = container.querySelector('[data-cols]');
    expect(grid).toBeTruthy();
    expect(JSON.parse(grid!.getAttribute('data-cols')!)).toBe(1);
  });
});

// ─── Options, availability, labels and chips ─────────────────────────

describe('EntityFilters options and chips', () => {
  const skinEntity = filterProductEntity;

  const rows = [
    { id: '1', type: 'toner', skinTypes: ['dry', 'oily'], brandId: 'b1', size: '50 ml' },
    { id: '2', type: 'toner_pad', skinTypes: ['all'], brandId: 'b2', size: '100 ml' },
    { id: '3', type: 'toner', skinTypes: ['oily'], brandId: 'b1', size: '50 ml' },
  ];

  type Option = { value: string; label: string; disabled?: boolean; count?: number };

  function optionsOf(label: string): Option[] {
    return JSON.parse(
      screen.getByTestId(`combobox-${label}`).getAttribute('data-options')!
    );
  }

  function setFilters(filters: Record<string, unknown>) {
    vi.mocked(useCrudFilters).mockReturnValue({
      filters,
      setFilters: vi.fn(),
      showFavoritesOnly: false,
      setShowFavoritesOnly: vi.fn(),
    } as any);
  }

  beforeEach(() => setFilters({}));

  function renderFilters() {
    return render(
      <EntityFilters
        entity={skinEntity}
        data={rows}
        fieldsToFilter={['type', 'skinTypes', 'brandId', 'size']}
      />
    );
  }

  function attr(label: string, name: string) {
    return JSON.parse(
      screen.getByTestId(`combobox-${label}`).getAttribute(name)!
    );
  }

  it('multiselect: availability and counts are per array item', () => {
    renderFilters();
    const byValue = Object.fromEntries(
      optionsOf('Skin types').map((o) => [o.value, o])
    );
    // row 2 carries the wildcard: counts for every option
    expect(byValue.dry).toMatchObject({ disabled: false, count: 2 });
    expect(byValue.oily).toMatchObject({ disabled: false, count: 3 });
    expect(byValue.sensitive).toMatchObject({ disabled: false, count: 1 });
  });

  it('the wildcard value is not offered as a choice', () => {
    renderFilters();
    expect(optionsOf('Skin types').map((o) => o.value)).not.toContain('all');
  });

  it('without wildcard rows, an option absent from every row is disabled', () => {
    render(
      <EntityFilters
        entity={skinEntity}
        data={[rows[0]!, rows[2]!]}
        fieldsToFilter={['skinTypes']}
      />
    );
    const sensitive = optionsOf('Skin types').find(
      (o) => o.value === 'sensitive'
    );
    expect(sensitive).toMatchObject({ disabled: true, count: 0 });
  });

  it('select: counts are exact (toner does not count toner_pad)', () => {
    renderFilters();
    const byValue = Object.fromEntries(
      optionsOf('Type').map((o) => [o.value, o])
    );
    expect(byValue.toner).toMatchObject({ count: 2, disabled: false });
    expect(byValue.toner_pad).toMatchObject({ count: 1, disabled: false });
    expect(byValue.serum).toMatchObject({ count: 0, disabled: true });
    expect(byValue.toner.label).toBe('options.type.toner');
  });

  it('counts use the other filters with exact matching', () => {
    setFilters({ type: 'toner' });
    renderFilters();
    const byValue = Object.fromEntries(
      optionsOf('Skin types').map((o) => [o.value, o])
    );
    // only rows 1 and 3 (type toner, not toner_pad)
    expect(byValue.dry).toMatchObject({ count: 1 });
    expect(byValue.sensitive).toMatchObject({ count: 0, disabled: true });
  });

  it('reference: a select of the resolved labels, values are ids', () => {
    renderFilters();
    const options = optionsOf('Brand');
    expect(options).toEqual([
      { value: 'b1', label: 'Brand One', count: 2 },
      { value: 'b2', label: 'Brand Two', count: 1 },
    ]);
  });

  it('select, multiselect and reference filters are multi-select', () => {
    renderFilters();
    expect(attr('Type', 'data-multiple')).toBe(true);
    expect(attr('Skin types', 'data-multiple')).toBe(true);
    expect(attr('Brand', 'data-multiple')).toBe(true);
    expect(attr('Size', 'data-multiple')).toBe(false);
  });

  it('multi-select value: the array state; a string state reads as one value', () => {
    setFilters({ type: ['serum', 'toner'], brandId: 'b1' });
    renderFilters();
    expect(attr('Type', 'data-value')).toEqual(['serum', 'toner']);
    expect(attr('Brand', 'data-value')).toEqual(['b1']);
  });

  it('several selected values: OR within the field for the other counts', () => {
    setFilters({ type: ['toner', 'toner_pad'] });
    renderFilters();
    const byValue = Object.fromEntries(
      optionsOf('Brand').map((o) => [o.value, o])
    );
    expect(byValue.b1).toMatchObject({ count: 2 });
    expect(byValue.b2).toMatchObject({ count: 1 });
  });

  it('text filters keep a single value with an "any" option that cannot collide', () => {
    renderFilters();
    const options = optionsOf('Size');
    expect(options[0]!.label).toBe('filter.selectPlaceholder');
    expect(options[0]!.value).not.toBe('all');
    expect(options.slice(1).map((o) => o.value)).toEqual(['100 ml', '50 ml']);
  });

  it('chips show the translated option label, never the raw value', () => {
    setFilters({ type: 'toner' });
    renderFilters();
    const chips = screen.getAllByTestId('filter-chip').map((c) => c.textContent);
    expect(chips).toEqual(['Type: options.type.toner']);
  });

  it('chips: one translated label per selected select value', () => {
    setFilters({ type: ['serum', 'toner'] });
    renderFilters();
    const chips = screen.getAllByTestId('filter-chip').map((c) => c.textContent);
    expect(chips).toEqual(['Type: options.type.serum', 'Type: options.type.toner']);
  });

  it('chips show one translated label per multiselect value', () => {
    setFilters({ skinTypes: ['dry', 'oily'] });
    renderFilters();
    const chips = screen.getAllByTestId('filter-chip').map((c) => c.textContent);
    expect(chips).toEqual([
      'Skin types: options.skin.dry',
      'Skin types: options.skin.oily',
    ]);
  });

  it('reference chips show the resolved label', () => {
    setFilters({ brandId: 'b2' });
    renderFilters();
    const chips = screen.getAllByTestId('filter-chip').map((c) => c.textContent);
    expect(chips).toEqual(['Brand: Brand Two']);
  });

  it('chip remove and combobox clear buttons use crud translations', () => {
    setFilters({ type: ['serum'], size: '50 ml' });
    renderFilters();
    const removeLabels = screen
      .getAllByTestId('filter-chip')
      .map((c) => c.getAttribute('data-remove-label'));
    expect(removeLabels).toEqual(['form.remove', 'form.remove']);
    expect(attr('Type', 'data-clear-label')).toBe('filter.clear');
    expect(attr('Size', 'data-clear-label')).toBe('filter.clear');
  });

  it('multi-select summary: filters.selected with the selection count', () => {
    const original = vi.mocked(useTranslation).getMockImplementation()!;
    vi.mocked(useTranslation).mockReturnValue({
      t: Object.assign(
        (key: string, opts?: { count?: number }) =>
          opts?.count === undefined ? key : `${key}:${opts.count}`,
        { t: (key: string) => key }
      ),
      i18n: { language: 'en' },
    } as any);
    try {
      setFilters({ type: ['serum', 'toner'] });
      renderFilters();
      expect(attr('Type', 'data-selected-label')).toBe('filters.selected:2');
      expect(attr('Skin types', 'data-selected-label')).toBe(
        'filters.selected:0'
      );
    } finally {
      vi.mocked(useTranslation).mockImplementation(original);
    }
  });

  it('passes urlSync and the entity to useCrudFilters', () => {
    render(
      <EntityFilters
        entity={skinEntity}
        data={rows}
        filterKey="filter_products#picker"
        urlSync
      />
    );
    expect(useCrudFilters).toHaveBeenCalledWith({
      collection: 'filter_products#picker',
      urlSync: true,
      entity: skinEntity,
    });
  });

  it('renders nothing (no hooks-order crash) when no field is filterable', () => {
    const { container, rerender } = render(
      <EntityFilters entity={skinEntity} data={rows} fieldsToFilter={['type']} />
    );
    expect(container.textContent).not.toBe('');
    const adminOnly = adminOnlyFieldEntity;
    rerender(
      <EntityFilters entity={adminOnly} data={rows} fieldsToFilter={['secret']} />
    );
    expect(container.textContent).toBe('');
  });
});
