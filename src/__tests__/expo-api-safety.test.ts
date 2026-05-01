/**
 * @fileoverview Expo API Safety Net — CRUD Package
 * @description Verifies that all @donotdev/crud APIs consumed by @donotdev/expo exist.
 * If any test fails after a framework change, the expo package WILL break.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect, vi } from 'vitest';

const { createMockStore } = vi.hoisted(() => {
  const createMockStore = () => {
    const state: Record<string, any> = {};
    const store: any = (selector?: any) => (selector ? selector(state) : state);
    store.getState = () => state;
    store.setState = (partial: any) =>
      Object.assign(
        state,
        typeof partial === 'function' ? partial(state) : partial
      );
    store.subscribe = vi.fn(() => vi.fn());
    store.destroy = vi.fn();
    return store;
  };
  return { createMockStore };
});

vi.mock('@donotdev/components', () => ({
  Button: vi.fn(),
  Stack: vi.fn(),
  Spinner: vi.fn(),
  Select: vi.fn(),
  Input: vi.fn(),
  Card: vi.fn(),
  Badge: vi.fn(),
  Text: vi.fn(),
  Checkbox: vi.fn(),
}));

vi.mock('react-hook-form', () => ({
  FormProvider: vi.fn(({ children }: any) => children),
  useForm: vi.fn(() => ({ handleSubmit: vi.fn(), control: {} })),
  useFormContext: vi.fn(() => ({ control: {} })),
  useController: vi.fn(() => ({ field: {}, fieldState: {} })),
}));

vi.mock('@donotdev/core', () => ({
  FEATURE_STATUS: {
    INITIALIZING: 'initializing',
    READY: 'ready',
    DEGRADED: 'degraded',
    ERROR: 'error',
  },
  FRAMEWORK_FEATURES: { CRUD: 'crud' },
  handleError: vi.fn(),
  isClient: () => false,
  isDev: () => false,
  useFeatureConsent: () => true,
  useTranslation: () => ({ t: (k: string) => k }),
  createDoNotDevStore: vi.fn(() => createMockStore()),
  createSingleton: vi.fn((factory: any) => factory),
  getDndevConfig: () => ({}),
  formatDate: vi.fn(),
  useQuery: vi.fn(),
  isFieldVisible: () => true,
  getStorageManager: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  })),
  getGlobalSingleton: vi.fn((_key: string, factory: any) => factory()),
}));

import * as mod from '@donotdev/crud';

describe('Expo API Safety Net — @donotdev/crud', () => {
  // Hooks
  it('exports useCrud hook', () => {
    expect(mod.useCrud).toBeDefined();
    expect(typeof mod.useCrud).toBe('function');
  });

  it('exports useCrudList hook', () => {
    expect(mod.useCrudList).toBeDefined();
    expect(typeof mod.useCrudList).toBe('function');
  });

  it('exports useCrudCardList hook', () => {
    expect(mod.useCrudCardList).toBeDefined();
    expect(typeof mod.useCrudCardList).toBe('function');
  });

  it('exports useCrudStore hook', () => {
    expect(mod.useCrudStore).toBeDefined();
  });

  it('exports useCrudFilters hook', () => {
    expect(mod.useCrudFilters).toBeDefined();
    expect(typeof mod.useCrudFilters).toBe('function');
  });

  it('exports useEntityForm hook', () => {
    expect(mod.useEntityForm).toBeDefined();
    expect(typeof mod.useEntityForm).toBe('function');
  });

  it('exports useEntityField hook', () => {
    expect(mod.useEntityField).toBeDefined();
    expect(typeof mod.useEntityField).toBe('function');
  });

  it('exports useController hook', () => {
    expect(mod.useController).toBeDefined();
    expect(typeof mod.useController).toBe('function');
  });

  // Pure functions
  it('exports getCrudService', () => {
    expect(mod.getCrudService).toBeDefined();
    expect(typeof mod.getCrudService).toBe('function');
  });

  it('exports isFieldEditable', () => {
    expect(mod.isFieldEditable).toBeDefined();
    expect(typeof mod.isFieldEditable).toBe('function');
  });

  it('exports getFieldsForOperation', () => {
    expect(mod.getFieldsForOperation).toBeDefined();
    expect(typeof mod.getFieldsForOperation).toBe('function');
  });

  it('exports validateEntity', () => {
    expect(mod.validateEntity).toBeDefined();
    expect(typeof mod.validateEntity).toBe('function');
  });

  it('exports translateFieldLabel', () => {
    expect(mod.translateFieldLabel).toBeDefined();
    expect(typeof mod.translateFieldLabel).toBe('function');
  });

  it('exports translateLabel', () => {
    expect(mod.translateLabel).toBeDefined();
    expect(typeof mod.translateLabel).toBe('function');
  });

  it('exports matchesFilter', () => {
    expect(mod.matchesFilter).toBeDefined();
    expect(typeof mod.matchesFilter).toBe('function');
  });

  it('exports formatValue', () => {
    expect(mod.formatValue).toBeDefined();
    expect(typeof mod.formatValue).toBe('function');
  });

  it('exports registerFieldType', () => {
    expect(mod.registerFieldType).toBeDefined();
    expect(typeof mod.registerFieldType).toBe('function');
  });

  it('exports getFieldRegistry', () => {
    expect(mod.getFieldRegistry).toBeDefined();
    expect(typeof mod.getFieldRegistry).toBe('function');
  });

  it('exports registerBuiltinFieldTypes', () => {
    expect(mod.registerBuiltinFieldTypes).toBeDefined();
    expect(typeof mod.registerBuiltinFieldTypes).toBe('function');
  });

  it('exports useEntityFavorites', () => {
    expect(mod.useEntityFavorites).toBeDefined();
    expect(typeof mod.useEntityFavorites).toBe('function');
  });

  // Components
  it('exports EntityFilters component', () => {
    expect(mod.EntityFilters).toBeDefined();
  });

  // EntityFormRenderer and EntityDisplayRenderer live in @donotdev/ui (routing-aware)
  // and @donotdev/expo (native reimplementation). Not part of @donotdev/crud public API.
});
