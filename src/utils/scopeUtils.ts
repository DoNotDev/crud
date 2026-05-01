// packages/features/crud/src/utils/scopeUtils.ts

/**
 * @fileoverview Scope Utilities for Multi-Tenancy
 * @description Internal utilities for injecting scope into CRUD operations.
 * Used by useCrud, useCrudList, and useCrudCardList.
 *
 * @version 0.1.0
 * @since 0.0.10
 * @author AMBROISE PARK Consulting
 */

import { getScopeValue, CRUD_OPERATORS } from '@donotdev/core';
import type { ScopeConfig, QueryOptions } from '@donotdev/core';

/**
 * Injects scope value into data object for create/update operations
 *
 * @param data - Original data
 * @param scope - Scope configuration from entity
 * @returns Data with scope value injected
 *
 * @example
 * ```typescript
 * const scopedData = injectScope({ name: 'Acme' }, scope);
 * // Result: { name: 'Acme', companyId: 'abc123' }
 * ```
 */
export function injectScope<T>(data: T, scope: ScopeConfig | undefined): T {
  if (!scope) return data;

  const scopeValue = getScopeValue(scope.provider);
  if (!scopeValue) {
    throw new Error(
      `[CRUD] Scope provider "${scope.provider}" returned null. ` +
        `Cannot write scoped entity without a scope value. ` +
        `Ensure a scope is selected before creating scoped entities.`
    );
  }

  return {
    ...data,
    [scope.field]: scopeValue,
  };
}

/**
 * Injects scope filter into query options for list/query operations
 *
 * @param queryOptions - Original query options
 * @param scope - Scope configuration from entity
 * @returns Query options with scope filter added
 *
 * @example
 * ```typescript
 * const scopedOptions = injectScopeFilter({ orderBy: [{ field: 'name' }] }, scope);
 * // Result: { orderBy: [...], where: [{ field: 'companyId', operator: '==', value: 'abc123' }] }
 * ```
 */
export function injectScopeFilter(
  queryOptions: QueryOptions | undefined,
  scope: ScopeConfig | undefined
): QueryOptions {
  const baseOptions = queryOptions ?? {};

  if (!scope) return baseOptions;

  // Field name must be a string — adapters/mapper expect string (e.g. camelToSnake)
  if (typeof scope.field !== 'string') {
    console.warn(
      `[CRUD] scope.field must be a string (e.g. "companyId"), got ${typeof scope.field}. ` +
        `Skipping scope filter. Check entity.scope definition.`
    );
    return baseOptions;
  }

  const scopeValue = getScopeValue(scope.provider);
  if (!scopeValue) {
    throw new Error(
      `[CRUD] Scope provider "${scope.provider}" returned null. ` +
        `Cannot query scoped entity without a scope value. ` +
        `Ensure a scope is selected before querying scoped entities.`
    );
  }

  const scopeFilter = {
    field: scope.field,
    operator: CRUD_OPERATORS.EQ,
    value: scopeValue,
  };

  return {
    ...baseOptions,
    where: baseOptions.where
      ? [...baseOptions.where, scopeFilter]
      : [scopeFilter],
  };
}

/**
 * Gets current scope value for cache key generation
 *
 * @param scope - Scope configuration from entity
 * @returns Scope value or null
 */
export function getCurrentScopeValue(
  scope: ScopeConfig | undefined
): string | null {
  if (!scope) return null;
  return getScopeValue(scope.provider);
}
