/**
 * @fileoverview Regression: form initial values.
 *
 * Root causes (shopkb sign-up, 2026-11-13):
 * - text-like fields defaulted to '', which fails optional format rules and passes `required`;
 * - status defaulted to 'draft', so every form create saved a hidden draft and skipped `required`.
 *
 * Root cause (design 3.6, 2026-11-17): the whole record was spread into form state, so
 * generated, technical, `editable: false` and role-denied values entered state, the local
 * draft and the payload. Initial values are now projected onto the fields the form writes.
 */

import { describe, it, expect } from 'vitest';


import { buildInitialFromRecord, buildSchemaDefaults } from '../buildInitialValues';
import { writableFields } from '../writableFields';
import { initialValuesEntity as entity, projectionDefaultsEntity, snakeCaseFieldEntity } from '@dndev/test-entities';


const createFields = writableFields(entity, 'admin', 'create');
const editFields = writableFields(entity, 'admin', 'edit');

describe('buildSchemaDefaults (create)', () => {
  const defaults = buildSchemaDefaults(entity, createFields);

  it('defaults text-like fields to null, never ""', () => {
    expect(defaults.vatNumber).toBeNull();
    expect(defaults.notes).toBeNull();
    expect(defaults.email).toBeNull();
    expect(defaults.phone).toBeNull();
  });

  it("defaults status to the documented 'available'", () => {
    expect(defaults.status).toBe('available');
  });

  it('keeps the other type defaults', () => {
    expect(defaults.sameAsBilling).toBe(false);
    expect(defaults.quantity).toBeUndefined();
  });
});

describe('buildInitialFromRecord (edit)', () => {
  it('keeps stored values and status', () => {
    const values = buildInitialFromRecord(entity, { vatNumber: 'FR12345678901', status: 'draft' }, { fields: editFields });
    expect(values.vatNumber).toBe('FR12345678901');
    expect(values.status).toBe('draft');
  });

  it('normalizes a stored null or "" to null', () => {
    const values = buildInitialFromRecord(entity, { vatNumber: '', notes: null }, { fields: editFields });
    expect(values.vatNumber).toBeNull();
    expect(values.notes).toBeNull();
  });
});

describe('buildInitialFromRecord (field names)', () => {
  const snake = snakeCaseFieldEntity;
  const fields = writableFields(snake, 'admin', 'edit');

  it('reads the entity field name only (adapters return entity-keyed rows, no camelCase fallback)', () => {
    const values = buildInitialFromRecord(snake, { starts_on: 'a' }, { fields });
    expect(values.starts_on).toBe('a');
    const camel = buildInitialFromRecord(snake, { startsOn: 'b' }, { fields });
    expect(camel.starts_on).toBeNull();
    expect(camel).not.toHaveProperty('startsOn');
  });
});

describe('buildInitialFromRecord (projection onto the written fields)', () => {
  const projected = projectionDefaultsEntity;
  const row = {
    id: 'r1', title: 'T', titleI18n: { fr: 'T' }, revision: 3, locked: 'L', total: 9,
    adminNote: 'n', sku: 's', status: 'available', createdAt: '2026-01-01T00:00:00Z', injected: 'x',
  };

  it('keeps only what a user edit writes: inputs, computed, companions, and id', () => {
    const values = buildInitialFromRecord(projected, row, {
      fields: writableFields(projected, 'user', 'edit'),
      keepId: true,
    });
    expect(values).toEqual({ id: 'r1', title: 'T', titleI18n: { fr: 'T' }, total: 9 });
  });

  it('keeps role-gated and create-only fields only when the role / operation writes them', () => {
    const admin = buildInitialFromRecord(projected, row, { fields: writableFields(projected, 'admin', 'edit') });
    expect(admin).toMatchObject({ adminNote: 'n', status: 'available' });
    expect(admin).not.toHaveProperty('sku');
    expect(admin).not.toHaveProperty('id');
    const create = buildSchemaDefaults(projected, writableFields(projected, 'user', 'create'));
    expect(create).toHaveProperty('sku');
    expect(create).not.toHaveProperty('adminNote');
  });
});
