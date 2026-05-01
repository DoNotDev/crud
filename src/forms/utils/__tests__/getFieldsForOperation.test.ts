/**
 * @fileoverview Unit tests for getFieldsForOperation
 * @description Tests field filtering: visibility, editability, generated/computed exclusion, create vs edit.
 *
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import { EDITABLE, type EntityField, type FieldType } from '@donotdev/core';

import { getFieldsForOperation } from '../getFieldsForOperation';

/** Helper to build minimal field config */
function field(
  overrides: Partial<EntityField<FieldType>> = {}
): EntityField<FieldType> {
  return {
    type: 'text',
    name: 'test',
    label: 'Test',
    visibility: 'guest',
    ...overrides,
  } as EntityField<FieldType>;
}

describe('getFieldsForOperation', () => {
  // -------------------------------------------------------------------------
  // Generated / Computed exclusion
  // -------------------------------------------------------------------------

  describe('generated and computed fields', () => {
    const fields: Record<string, EntityField<FieldType>> = {
      title: field({ name: 'title', label: 'Title' }),
      total: field({
        name: 'total',
        label: 'Total',
        editable: EDITABLE.GENERATED,
      }),
      derived: field({
        name: 'derived',
        label: 'Derived',
        editable: EDITABLE.COMPUTED,
      }),
      notes: field({ name: 'notes', label: 'Notes' }),
    };

    it('excludes generated fields from create forms', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'admin',
      });
      const names = result.map((f) => f.name);
      expect(names).toContain('title');
      expect(names).toContain('notes');
      expect(names).not.toContain('total');
      expect(names).not.toContain('derived');
    });

    it('excludes generated fields from edit forms', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'admin',
      });
      const names = result.map((f) => f.name);
      expect(names).toContain('title');
      expect(names).toContain('notes');
      expect(names).not.toContain('total');
      expect(names).not.toContain('derived');
    });

    it('excludes computed fields regardless of viewer role', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'super',
      });
      expect(result.map((f) => f.name)).not.toContain('derived');
    });
  });

  // -------------------------------------------------------------------------
  // Visibility filtering
  // -------------------------------------------------------------------------

  describe('visibility', () => {
    const fields: Record<string, EntityField<FieldType>> = {
      public: field({ name: 'public', label: 'Public', visibility: 'guest' }),
      secret: field({
        name: 'secret',
        label: 'Secret',
        visibility: 'hidden',
      }),
      system: field({
        name: 'system',
        label: 'System',
        visibility: 'technical',
      }),
      adminOnly: field({
        name: 'adminOnly',
        label: 'Admin Only',
        visibility: 'admin',
      }),
    };

    it('hides hidden fields from all operations', () => {
      const create = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'super',
      });
      const edit = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'super',
      });
      expect(create.map((f) => f.name)).not.toContain('secret');
      expect(edit.map((f) => f.name)).not.toContain('secret');
    });

    it('hides technical fields from create forms', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'super',
      });
      expect(result.map((f) => f.name)).not.toContain('system');
    });

    it('shows technical fields as read-only in edit forms for admins', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'admin',
      });
      const systemField = result.find((f) => f.name === 'system');
      expect(systemField).toBeDefined();
      expect(systemField!.editable).toBe(false);
    });

    it('hides admin fields from guest viewers', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'guest',
      });
      expect(result.map((f) => f.name)).not.toContain('adminOnly');
    });

    it('shows admin fields to admin viewers', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'admin',
      });
      expect(result.map((f) => f.name)).toContain('adminOnly');
    });
  });

  // -------------------------------------------------------------------------
  // Editability
  // -------------------------------------------------------------------------

  describe('editability', () => {
    const fields: Record<string, EntityField<FieldType>> = {
      title: field({ name: 'title', label: 'Title' }),
      adminField: field({
        name: 'adminField',
        label: 'Admin Field',
        editable: 'admin',
      }),
      createOnly: field({
        name: 'createOnly',
        label: 'Create Only',
        editable: EDITABLE.CREATE_ONLY,
      }),
      readOnly: field({
        name: 'readOnly',
        label: 'Read Only',
        editable: false,
      }),
    };

    it('marks admin-only fields as non-editable for users', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'user',
      });
      const adminField = result.find((f) => f.name === 'adminField');
      expect(adminField).toBeDefined();
      expect(adminField!.editable).toBe(false);
    });

    it('marks admin-only fields as editable for admins', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'admin',
      });
      const adminField = result.find((f) => f.name === 'adminField');
      expect(adminField!.editable).toBe(true);
    });

    it('marks create-only fields as editable on create, read-only on edit', () => {
      const create = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'user',
      });
      const edit = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'user',
      });
      expect(create.find((f) => f.name === 'createOnly')!.editable).toBe(true);
      expect(edit.find((f) => f.name === 'createOnly')!.editable).toBe(false);
    });

    it('marks false-editable fields as non-editable', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'super',
      });
      expect(result.find((f) => f.name === 'readOnly')!.editable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // availableFields filter
  // -------------------------------------------------------------------------

  describe('availableFields', () => {
    const fields: Record<string, EntityField<FieldType>> = {
      title: field({ name: 'title', label: 'Title' }),
      description: field({ name: 'description', label: 'Description' }),
      notes: field({ name: 'notes', label: 'Notes' }),
    };

    it('filters to only available fields in edit mode', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'edit',
        viewerRole: 'user',
        availableFields: ['title', 'notes'],
      });
      const names = result.map((f) => f.name);
      expect(names).toEqual(['title', 'notes']);
    });

    it('ignores availableFields in create mode', () => {
      const result = getFieldsForOperation(fields, {
        operation: 'create',
        viewerRole: 'user',
        availableFields: ['title'],
      });
      // Create mode doesn't filter by availableFields (no backend data)
      // The function checks `operation === 'edit' && availableFields`
      expect(result.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Entity input format
  // -------------------------------------------------------------------------

  describe('accepts Entity object with name and fields', () => {
    it('extracts fields from Entity-shaped input', () => {
      const entity = {
        name: 'Product',
        fields: {
          title: field({ name: 'title', label: 'Title' }),
        },
      };
      const result = getFieldsForOperation(entity as any, {
        operation: 'create',
        viewerRole: 'user',
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('title');
    });
  });

  // -------------------------------------------------------------------------
  // Default viewerRole
  // -------------------------------------------------------------------------

  describe('defaults', () => {
    it('defaults viewerRole to guest when not provided', () => {
      const fields: Record<string, EntityField<FieldType>> = {
        adminOnly: field({
          name: 'adminOnly',
          label: 'Admin',
          visibility: 'admin',
        }),
        public: field({ name: 'public', label: 'Public' }),
      };
      const result = getFieldsForOperation(fields, { operation: 'create' });
      const names = result.map((f) => f.name);
      expect(names).toContain('public');
      expect(names).not.toContain('adminOnly');
    });
  });
});
