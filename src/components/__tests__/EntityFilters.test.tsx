import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { defineEntity } from '@donotdev/core';

import { EntityFilters } from '../EntityFilters';

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
    Combobox: ({ children }: any) => <div>{children}</div>,
  };
});

vi.mock('../hooks/useCrudFilters', () => ({
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
  const mockEntity = defineEntity({
    name: 'Product',
    collection: 'products',
    fields: {
      title: {
        name: 'title',
        label: 'Title',
        type: 'text',
        visibility: 'user',
      },
      status: {
        name: 'status',
        label: 'Status',
        type: 'select',
        visibility: 'user',
        validation: {
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders filters for entity fields', () => {
    render(<EntityFilters entity={mockEntity} />);

    // Component should render clear buttons (per-filter + global)
    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('renders with data prop', () => {
    const mockData = [
      { id: '1', title: 'Product 1', status: 'active' },
      { id: '2', title: 'Product 2', status: 'inactive' },
    ];

    render(<EntityFilters entity={mockEntity} data={mockData} />);

    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('renders with sidebar variant', () => {
    render(<EntityFilters entity={mockEntity} variant="sidebar" />);

    const clearButtons = screen.getAllByRole('button', { name: /clear/i });
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it('uses responsive cols for inline variant', () => {
    const { container } = render(
      <EntityFilters entity={mockEntity} variant="inline" />
    );
    const grid = container.querySelector('[data-cols]');
    expect(grid).toBeTruthy();
    expect(JSON.parse(grid!.getAttribute('data-cols')!)).toEqual([2, 4, 6, 8]);
  });

  it('uses 1 col for sidebar variant', () => {
    const { container } = render(
      <EntityFilters entity={mockEntity} variant="sidebar" />
    );
    const grid = container.querySelector('[data-cols]');
    expect(grid).toBeTruthy();
    expect(JSON.parse(grid!.getAttribute('data-cols')!)).toBe(1);
  });
});
