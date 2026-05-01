// packages/features/crud/src/forms/utils/validateEntity.ts

/**
 * @fileoverview Entity validation utility
 * @description Validates data against entity definition using Valibot.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import * as v from 'valibot';

import type { AnyEntity } from '@donotdev/core';
import { createSchemas } from '@donotdev/core';

/**
 * Validation operation type
 */
export type SchemaOperation = 'create' | 'draft' | 'update' | 'full';

/**
 * Validation issue structure
 */
export interface ValidationIssue {
  /** Field path (e.g., 'name' or 'address.street') */
  path: string;
  /** Error message */
  message: string;
}

/**
 * Validation result structure
 * @template T - Data type
 */
export interface ValidationResult<T> {
  /** Whether validation succeeded */
  success: boolean;
  /** Validated data (if success) */
  data?: T;
  /** Validation issues (if failed) */
  issues?: ValidationIssue[];
}

/**
 * Validates data against an entity definition.
 *
 * Uses Valibot under the hood with entity-derived schemas.
 * Pure function, no React dependencies.
 *
 * @template E - Entity type from defineEntity()
 * @param entity - Entity definition from defineEntity()
 * @param data - Data to validate
 * @param operation - Validation context ('create', 'draft', 'update', or 'full')
 * @returns Validation result with typed issues
 *
 * @example
 * ```typescript
 * import { validateEntity } from '@donotdev/crud/forms';
 * import { productEntity } from './entities/product';
 *
 * // Validate create data
 * const result = validateEntity(productEntity, formData, 'create');
 *
 * if (result.success) {
 *   await saveProduct(result.data);
 * } else {
 *   console.error('Validation failed:', result.issues);
 *   // [{ path: 'name', message: 'Required' }, ...]
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use in form submission
 * const onSubmit = async (data: unknown) => {
 *   const validation = validateEntity(productEntity, data, 'create');
 *
 *   if (!validation.success) {
 *     validation.issues?.forEach(issue => {
 *       form.setError(issue.path, { message: issue.message });
 *     });
 *     return;
 *   }
 *
 *   await api.createProduct(validation.data);
 * };
 * ```
 *
 * @see {@link Entity} for entity definition structure
 * @see {@link ValidationResult} for return type
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export function validateEntity<E extends AnyEntity>(
  entity: E,
  data: unknown,
  operation: SchemaOperation = 'create'
): ValidationResult<Record<string, unknown>> {
  const schemas = createSchemas(entity);

  // Select the appropriate schema based on operation
  const schemaMap = {
    create: schemas.create,
    draft: schemas.draft,
    update: schemas.update,
    full: schemas.get, // 'full' maps to 'get' for backward compatibility
  };

  const schema = schemaMap[operation];

  const result = v.safeParse(schema, data);

  if (result.success) {
    return {
      success: true,
      data: result.output as Record<string, unknown>,
    };
  }

  // Transform Valibot issues to our format
  const issues: ValidationIssue[] = result.issues.map((issue) => ({
    path: issue.path?.map((p) => p.key).join('.') || '',
    message: issue.message,
  }));

  return {
    success: false,
    issues,
  };
}
