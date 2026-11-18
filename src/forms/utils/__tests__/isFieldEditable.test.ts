/**
 * @fileoverview Unit tests for isFieldEditable
 * @description Tests field editability logic (entity descriptor `editableFor`): role hierarchy,
 * generated/computed, create-only, booleans, technical fields, unknown fields.
 *
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import { EDITABLE } from '@donotdev/core';
import type { Editable, Visibility } from '@donotdev/core';
import { editableMatrixEntity } from '@dndev/test-entities';

import { isFieldEditable } from '../isFieldEditable';

/** The field of the shared `editableMatrixEntity` with the given `editable` and visibility. */
function probe(editable: Editable | undefined, visibility: Visibility = 'guest'): string {
  const key = `${String(editable)}|${visibility}`;
  const field = EDITABLE_FIELDS[key];
  if (!field) throw new Error(`editableMatrixEntity has no field for ${key}`);
  return field;
}
const EDITABLE_FIELDS: Record<string, string> = {
  'undefined|guest': 'editableUnset',
  'true|guest': 'editableTrue',
  'false|guest': 'editableFalse',
  [`${EDITABLE.COMPUTED}|guest`]: 'computed',
  [`${EDITABLE.GENERATED}|guest`]: 'generated',
  [`${EDITABLE.CREATE_ONLY}|guest`]: 'createOnly',
  'guest|guest': 'guestRole',
  'user|guest': 'userRole',
  'admin|guest': 'adminRole',
  'moderator|guest': 'moderatorRole',
  'super|guest': 'superRole',
  'undefined|technical': 'technicalUnset',
  'admin|technical': 'technicalAdmin',
};

describe('isFieldEditable', () => {
  // -------------------------------------------------------------------------
  // Defaults
  // -------------------------------------------------------------------------

  describe('defaults', () => {
    it('returns true when editable is undefined', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(undefined), 'user', 'create')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe(undefined), 'guest', 'edit')).toBe(true);
    });

    it('returns true when editable is true', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(true), 'guest', 'create')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe(true), 'user', 'edit')).toBe(true);
    });

    it('returns false when editable is false', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(false), 'super', 'create')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe(false), 'admin', 'edit')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Generated / Computed
  // -------------------------------------------------------------------------

  describe('generated and computed', () => {
    it('returns false for generated fields regardless of role or operation', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.GENERATED), 'super', 'create')).toBe(
        false
      );
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.GENERATED), 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.GENERATED), 'guest', 'create')).toBe(
        false
      );
    });

    it('returns false for computed fields regardless of role or operation', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.COMPUTED), 'super', 'create')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.COMPUTED), 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.COMPUTED), 'user', 'create')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Create-only
  // -------------------------------------------------------------------------

  describe('create-only', () => {
    it('returns true for create operation', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.CREATE_ONLY), 'user', 'create')).toBe(
        true
      );
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.CREATE_ONLY), 'admin', 'create')).toBe(
        true
      );
    });

    it('returns false for edit operation', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.CREATE_ONLY), 'user', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe(EDITABLE.CREATE_ONLY), 'super', 'edit')).toBe(
        false
      );
    });
  });

  // -------------------------------------------------------------------------
  // Role-based (hierarchy: guest < user < admin < super)
  // -------------------------------------------------------------------------

  describe('role hierarchy', () => {
    it('admin field: admin+ can edit, below cannot', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'guest', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'user', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'admin', 'edit')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'super', 'edit')).toBe(true);
    });

    it('user field: user+ can edit, guest cannot', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('user'), 'guest', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('user'), 'user', 'edit')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('user'), 'admin', 'edit')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('user'), 'super', 'edit')).toBe(true);
    });

    it('super field: only super can edit', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('super'), 'guest', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('super'), 'user', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('super'), 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('super'), 'super', 'edit')).toBe(true);
    });

    it('guest field: everyone can edit', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('guest'), 'guest', 'edit')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('guest'), 'user', 'create')).toBe(true);
    });

    it('role check works for both create and edit operations', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'admin', 'create')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'admin', 'edit')).toBe(true);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'user', 'create')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'user', 'edit')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('unknown role string returns false (hasRoleAccess fail-safe)', () => {
      expect(isFieldEditable(editableMatrixEntity, probe('admin'), 'unknown-role', 'edit')).toBe(false);
    });

    it('unknown editable role string is checked via hierarchy', () => {
      // A custom role string not in ROLE_HIERARCHY defaults to Infinity required level
      expect(isFieldEditable(editableMatrixEntity, probe('moderator'), 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('moderator'), 'super', 'edit')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Descriptor rules (regression: same rule as forms and grids)
  // -------------------------------------------------------------------------

  describe('descriptor rules', () => {
    it('technical fields are read-only unless editable says otherwise', () => {
      expect(isFieldEditable(editableMatrixEntity, probe(undefined, 'technical'), 'super', 'edit')).toBe(false);
      expect(isFieldEditable(editableMatrixEntity, probe('admin', 'technical'), 'admin', 'edit')).toBe(true);
    });

    it('backend-generated names are never editable', () => {
      // editableMatrixEntity sets `createdAt: { editable: true }`.
      expect(isFieldEditable(editableMatrixEntity, 'createdAt', 'super', 'create')).toBe(false);
    });

    it('throws for a field the entity does not have', () => {
      expect(() => isFieldEditable(editableMatrixEntity, 'missing', 'admin', 'edit')).toThrow(/no field "missing"/);
    });
  });
});
