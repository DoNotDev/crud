/**
 * @fileoverview Regression test: dynamicResolver must use updateSchema for edit
 *
 * Root cause: dynamicResolver used createSchema (all required enforced) for edit
 * operations, causing silent validation failures on partial updates.
 *
 * These tests validate the schema selection logic directly via createSchemas +
 * valibotResolver, proving that partial data passes update but fails create.
 */

import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { valibotResolver } from '@hookform/resolvers/valibot';

import { createSchemas, defineEntity, EDITABLE } from '@donotdev/core';

import type { FieldValues, ResolverOptions } from 'react-hook-form';

// ---------------------------------------------------------------------------
// Test Entity: mimics apartment with required fields + computed field
// ---------------------------------------------------------------------------

const testEntity = defineEntity({
  name: 'TestApartment',
  collection: 'test_apartments',
  fields: {
    status: {
      name: 'status',
      label: 'Status',
      type: 'select',
      visibility: 'admin',
      validation: {
        options: [
          { value: 'available', label: 'Available' },
          { value: 'reserved', label: 'Reserved' },
        ],
      },
    },
    reference: {
      name: 'reference',
      label: 'Reference',
      type: 'text',
      visibility: 'guest',
      validation: { required: true, minLength: 1 },
    },
    rent: {
      name: 'rent',
      label: 'Rent',
      type: 'currency',
      visibility: 'guest',
      editable: 'admin',
      validation: { required: true, min: 0 },
    },
    district_code: {
      name: 'district_code',
      label: 'District',
      type: 'number',
      visibility: 'guest',
      editable: EDITABLE.COMPUTED,
      validation: { required: true },
    },
    rent_cc: {
      name: 'rent_cc',
      label: 'Rent CC',
      type: 'currency',
      visibility: 'guest',
      editable: EDITABLE.GENERATED,
      validation: { required: false },
    },
    notes: {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      visibility: 'admin',
      validation: { required: false },
    },
  },
});

// ---------------------------------------------------------------------------
// Helper: run resolver and return { values, errors }
// ---------------------------------------------------------------------------

async function resolve(
  schema: Parameters<typeof valibotResolver>[0],
  data: Record<string, unknown>
) {
  const resolver = valibotResolver(schema);
  const options: ResolverOptions<FieldValues> = {
    fields: {},
    shouldUseNativeValidation: false,
  };
  return resolver(data as FieldValues, undefined, options);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dynamicResolver schema selection', () => {
  const schemas = createSchemas(testEntity);

  // -----------------------------------------------------------------------
  // Regression: edit with partial data must pass update, must fail create
  // -----------------------------------------------------------------------

  describe('edit operation (partial update)', () => {
    const partialUpdate = { id: 'apt-1', rent: 950 };

    it('PASSES with update schema (all fields optional)', async () => {
      const result = await resolve(
        schemas.update as Parameters<typeof valibotResolver>[0],
        partialUpdate
      );
      expect(Object.keys(result.errors)).toHaveLength(0);
      expect(result.values).toMatchObject({ rent: 950 });
    });

    it('FAILS with create schema (required fields enforced) — the old bug', async () => {
      const result = await resolve(
        schemas.create as Parameters<typeof valibotResolver>[0],
        partialUpdate
      );
      // create schema requires reference (required: true) → error
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
      expect(result.errors.reference).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Create with full data must still pass create schema
  // -----------------------------------------------------------------------

  describe('create operation (full data)', () => {
    const fullCreate = {
      status: 'available',
      reference: 'APT-001',
      rent: 850,
      district_code: 75011,
      notes: 'Ground floor',
    };

    it('PASSES with create schema when all required fields present', async () => {
      const result = await resolve(
        schemas.create as Parameters<typeof valibotResolver>[0],
        fullCreate
      );
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Create with missing required field must fail create schema
  // -----------------------------------------------------------------------

  describe('create operation (missing required)', () => {
    const missingRent = {
      status: 'available',
      reference: 'APT-001',
      district_code: 75011,
    };

    it('FAILS with create schema when rent is missing', async () => {
      const result = await resolve(
        schemas.create as Parameters<typeof valibotResolver>[0],
        missingRent
      );
      expect(result.errors.rent).toBeDefined();
    });

    it('PASSES with draft schema (all optional)', async () => {
      const result = await resolve(
        schemas.draft as Parameters<typeof valibotResolver>[0],
        { ...missingRent, status: 'draft' }
      );
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Schema shape: generated fields excluded, computed fields included
  // -----------------------------------------------------------------------

  describe('schema field inclusion', () => {
    it('create schema excludes generated fields (rent_cc)', () => {
      // rent_cc uses EDITABLE.GENERATED → isWriteExcluded returns true
      const shape = (schemas.create as v.ObjectSchema<any, any>).entries;
      expect(shape).not.toHaveProperty('rent_cc');
    });

    it('create schema includes computed fields (district_code)', () => {
      // district_code uses EDITABLE.COMPUTED → NOT excluded from write schemas
      // (computed = frontend-set, DB-persisted)
      const shape = (schemas.create as v.ObjectSchema<any, any>).entries;
      expect(shape).toHaveProperty('district_code');
    });

    it('update schema excludes generated fields (rent_cc)', () => {
      const shape = (schemas.update as v.ObjectSchema<any, any>).entries;
      expect(shape).not.toHaveProperty('rent_cc');
    });

    it('update schema includes computed fields as optional', async () => {
      // Partial update without computed field must pass
      const result = await resolve(
        schemas.update as Parameters<typeof valibotResolver>[0],
        { id: 'apt-1', rent: 900 }
      );
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });
});
