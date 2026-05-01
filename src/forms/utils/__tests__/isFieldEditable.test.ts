/**
 * @fileoverview Unit tests for isFieldEditable
 * @description Tests field editability logic: role hierarchy, generated/computed, create-only, booleans.
 *
 * @version 0.1.0
 * @since 0.1.0
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import { EDITABLE } from '@donotdev/core';

import { isFieldEditable } from '../isFieldEditable';

describe('isFieldEditable', () => {
  // -------------------------------------------------------------------------
  // Defaults
  // -------------------------------------------------------------------------

  describe('defaults', () => {
    it('returns true when editable is undefined', () => {
      expect(isFieldEditable(undefined, 'user', 'create')).toBe(true);
      expect(isFieldEditable(undefined, 'guest', 'edit')).toBe(true);
    });

    it('returns true when editable is true', () => {
      expect(isFieldEditable(true, 'guest', 'create')).toBe(true);
      expect(isFieldEditable(true, 'user', 'edit')).toBe(true);
    });

    it('returns false when editable is false', () => {
      expect(isFieldEditable(false, 'super', 'create')).toBe(false);
      expect(isFieldEditable(false, 'admin', 'edit')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Generated / Computed
  // -------------------------------------------------------------------------

  describe('generated and computed', () => {
    it('returns false for generated fields regardless of role or operation', () => {
      expect(isFieldEditable(EDITABLE.GENERATED, 'super', 'create')).toBe(
        false
      );
      expect(isFieldEditable(EDITABLE.GENERATED, 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(EDITABLE.GENERATED, 'guest', 'create')).toBe(
        false
      );
    });

    it('returns false for computed fields regardless of role or operation', () => {
      expect(isFieldEditable(EDITABLE.COMPUTED, 'super', 'create')).toBe(false);
      expect(isFieldEditable(EDITABLE.COMPUTED, 'admin', 'edit')).toBe(false);
      expect(isFieldEditable(EDITABLE.COMPUTED, 'user', 'create')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Create-only
  // -------------------------------------------------------------------------

  describe('create-only', () => {
    it('returns true for create operation', () => {
      expect(isFieldEditable(EDITABLE.CREATE_ONLY, 'user', 'create')).toBe(
        true
      );
      expect(isFieldEditable(EDITABLE.CREATE_ONLY, 'admin', 'create')).toBe(
        true
      );
    });

    it('returns false for edit operation', () => {
      expect(isFieldEditable(EDITABLE.CREATE_ONLY, 'user', 'edit')).toBe(false);
      expect(isFieldEditable(EDITABLE.CREATE_ONLY, 'super', 'edit')).toBe(
        false
      );
    });
  });

  // -------------------------------------------------------------------------
  // Role-based (hierarchy: guest < user < admin < super)
  // -------------------------------------------------------------------------

  describe('role hierarchy', () => {
    it('admin field: admin+ can edit, below cannot', () => {
      expect(isFieldEditable('admin', 'guest', 'edit')).toBe(false);
      expect(isFieldEditable('admin', 'user', 'edit')).toBe(false);
      expect(isFieldEditable('admin', 'admin', 'edit')).toBe(true);
      expect(isFieldEditable('admin', 'super', 'edit')).toBe(true);
    });

    it('user field: user+ can edit, guest cannot', () => {
      expect(isFieldEditable('user', 'guest', 'edit')).toBe(false);
      expect(isFieldEditable('user', 'user', 'edit')).toBe(true);
      expect(isFieldEditable('user', 'admin', 'edit')).toBe(true);
      expect(isFieldEditable('user', 'super', 'edit')).toBe(true);
    });

    it('super field: only super can edit', () => {
      expect(isFieldEditable('super', 'guest', 'edit')).toBe(false);
      expect(isFieldEditable('super', 'user', 'edit')).toBe(false);
      expect(isFieldEditable('super', 'admin', 'edit')).toBe(false);
      expect(isFieldEditable('super', 'super', 'edit')).toBe(true);
    });

    it('guest field: everyone can edit', () => {
      expect(isFieldEditable('guest', 'guest', 'edit')).toBe(true);
      expect(isFieldEditable('guest', 'user', 'create')).toBe(true);
    });

    it('role check works for both create and edit operations', () => {
      expect(isFieldEditable('admin', 'admin', 'create')).toBe(true);
      expect(isFieldEditable('admin', 'admin', 'edit')).toBe(true);
      expect(isFieldEditable('admin', 'user', 'create')).toBe(false);
      expect(isFieldEditable('admin', 'user', 'edit')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('unknown role string returns false (hasRoleAccess fail-safe)', () => {
      expect(isFieldEditable('admin', 'unknown-role', 'edit')).toBe(false);
    });

    it('unknown editable role string is checked via hierarchy', () => {
      // A custom role string not in ROLE_HIERARCHY defaults to Infinity required level
      expect(isFieldEditable('moderator', 'admin', 'edit')).toBe(false);
      expect(isFieldEditable('moderator', 'super', 'edit')).toBe(false);
    });
  });
});
