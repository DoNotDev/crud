// packages/features/crud/src/CrudService.internal.ts

/**
 * @fileoverview CrudService internal helpers
 * @description Toast/audit/rate-limit/resilience helpers used by the CrudService
 * facade and its impl siblings (mutations, queries, subscriptions, optimistic).
 *
 * **Why this split exists:**
 * The monolithic CrudService.ts exceeded the 500-LOC cap. These helpers are
 * pure, stateless where possible, and take the service instance explicitly so
 * they can live in a sibling file without mixins/proxies. Shared mutable state
 * (`_inflightMutations`, adapter, store, security context) stays on the class.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { dndevSchema } from '@donotdev/core';
import {
  getI18nInstance,
  hasProvider,
  getProvider,
  hasRestrictedVisibility,
  withTimeout,
  DEFAULT_CRUD_TIMEOUT,
} from '@donotdev/core';

import type { CrudServiceInternal, MutationOptions } from './types';

/**
 * Determine if success toast should be shown based on per-call options and global setting
 * - options.showSuccessToast=true → always show
 * - options.showSuccessToast=false → never show
 * - options.showSuccessToast=undefined → use global !hideSuccessToasts
 */
export function shouldShowSuccessToast(
  self: CrudServiceInternal,
  options?: MutationOptions
): boolean {
  if (options?.showSuccessToast === true) return true;
  if (options?.showSuccessToast === false) return false;
  // Undefined → check global setting
  return !self.store?.getState().hideSuccessToasts;
}

/**
 * Resolve PII fields for a collection from the schema metadata (if available).
 * Returns empty array when no security config or piiFields defined.
 */
export function getPiiFields(schema?: dndevSchema<unknown>): string[] {
  const meta = (schema as { security?: { piiFields?: string[] } } | undefined)
    ?.security;
  return meta?.piiFields ?? [];
}

/**
 * Emit a CRUD audit event when security context is present.
 * Skips silently if auditLog is explicitly false on the schema.
 */
export function auditCrud(
  self: CrudServiceInternal,
  type: 'crud.create' | 'crud.read' | 'crud.update' | 'crud.delete',
  collection: string,
  docId?: string,
  userId?: string
): void {
  if (!self.security) return;
  self.security.audit({
    type,
    collection,
    docId,
    userId: userId ?? self.currentUserId ?? undefined,
  });
}

/**
 * Build the rate limit key for a write/read operation.
 * Uses `<userId>:<collection>` when a current user is set, ensuring per-user
 * isolation.
 *
 * **Warning:** Falls back to `<collection>` when no user is set, which means all
 * unauthenticated callers share one rate-limit bucket per collection. A single
 * anonymous client can exhaust the limit for all others. Call `setCurrentUser()`
 * after auth state changes to enable per-user isolation.
 */
export function rateLimitKey(self: CrudServiceInternal, collection: string): string {
  return self.currentUserId
    ? `${self.currentUserId}:${collection}`
    : collection;
}

/** Compose the in-flight mutation key for a given (collection, id). */
export function mutationKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

/**
 * Execute an adapter call with timeout and 1 retry on transient errors.
 * Transient errors: network errors, timeouts, 5xx status codes.
 */
export async function withResilience<T>(
  operation: () => Promise<T>,
  timeoutMs: number = DEFAULT_CRUD_TIMEOUT
): Promise<T> {
  try {
    return await withTimeout(operation(), timeoutMs);
  } catch (error) {
    if (isTransientError(error)) {
      // Wait 2s then retry once
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await withTimeout(operation(), timeoutMs);
    }
    throw error;
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    // Timeout errors are transient
    if (error.name === 'TimeoutError') return true;
    // Network errors
    if (
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('network')
    )
      return true;
    // Check for HTTP 5xx in error message (Supabase pattern)
    const statusMatch = error.message.match(/(?:status|code)\s*:?\s*(\d{3})/i);
    if (statusMatch?.[1] && parseInt(statusMatch[1]) >= 500) return true;
  }
  return false;
}

/** Ensure adapter is initialized from provider registry. */
export async function ensureAdapter(self: CrudServiceInternal): Promise<void> {
  if (self.adapter) return;
  await self.initialize();
}

/**
 * Throws if the active adapter is direct (not server-side) and the entity schema
 * has any field with restricted visibility. Call before any adapter read or write.
 */
export function assertCanAccess(
  self: CrudServiceInternal,
  collection: string,
  schema?: dndevSchema<unknown>
): void {
  // Null adapter means not yet initialized — skip this check; the caller will throw
  // "Adapter not initialized" before any data access. Without this guard, null?.serverSideOnly
  // evaluates to undefined (falsy), causing an access-restriction error instead of the correct one.
  if (!self.adapter) return;
  if (
    schema &&
    hasRestrictedVisibility(schema) &&
    !self.adapter.serverSideOnly &&
    !self.adapter.dbLevelSecurity
  ) {
    throw new Error(
      `[dndev] Direct adapter cannot access "${collection}": entity has restricted field visibility. ` +
        `Use a server-side adapter (FunctionsAdapter for Firebase, or SupabaseCrudAdapter with RLS enabled) ` +
        `to enforce field-level security (serverSideOnly = true | dbLevelSecurity = true).`
    );
  }
}

/**
 * Initialize the CRUD adapter from the provider registry.
 * Apps must call `configureProviders({ crud: adapter })` at startup before any CRUD.
 *
 * @throws If no CRUD provider is configured
 */
export async function initializeImpl(self: CrudServiceInternal): Promise<void> {
  if (self.adapter) return;

  if (!hasProvider('crud')) {
    throw new Error(
      '[dndev] No CRUD adapter configured. Call configureProviders({ crud: yourAdapter }) at app startup.\n' +
        'Examples:\n' +
        '  import { FirestoreAdapter } from "@donotdev/firebase";\n' +
        '  import { FunctionsAdapter } from "@donotdev/crud";\n' +
        '  import { SupabaseCrudAdapter } from "@donotdev/supabase";\n' +
        '\n' +
        '  configureProviders({ crud: new FirestoreAdapter() })       // Firebase direct\n' +
        '  configureProviders({ crud: new FunctionsAdapter() })       // via callable functions\n' +
        '  configureProviders({ crud: new SupabaseCrudAdapter(sb) })  // Supabase direct (RLS)'
    );
  }

  self.adapter = getProvider('crud');

  if (self.store) {
    self.store.getState().setCrudService(self);
  }
}

/**
 * Helper to get translated entity name from collection
 * Tries entity-{collection}:name and entity-{singular}:name patterns
 * Falls back to collection name if translation not found
 */
export function getEntityName(collection: string): string {
  const i18n = getI18nInstance();

  // Try entity-{collection}:name pattern (e.g., entity-cars:name)
  let entityNamespace = `entity-${collection}`;
  let translated = i18n.t('name', {
    ns: entityNamespace,
    defaultValue: null,
  });
  // If translation found (not the key itself), return it
  if (
    translated &&
    translated !== 'name' &&
    translated !== `${entityNamespace}:name`
  ) {
    return translated;
  }

  // Try singular form (remove trailing 's' if collection ends with 's')
  // This handles common case: collection="cars" → namespace="entity-car"
  if (collection.endsWith('s') && collection.length > 1) {
    const singular = collection.slice(0, -1);
    entityNamespace = `entity-${singular}`;
    translated = i18n.t('name', { ns: entityNamespace, defaultValue: null });
    if (
      translated &&
      translated !== 'name' &&
      translated !== `${entityNamespace}:name`
    ) {
      return translated;
    }
  }

  // Fallback to collection name
  return collection;
}

/**
 * Run a mutation with concurrent-mutation serialization per (collection, id).
 * Ensures sequential writes to the same document while allowing concurrent
 * writes across different documents.
 */
export async function runSerializedMutation<T>(
  self: CrudServiceInternal,
  collection: string,
  id: string,
  run: () => Promise<T>
): Promise<T> {
  const key = mutationKey(collection, id);
  const existing = self._inflightMutations.get(key);
  if (existing) {
    await existing.catch(() => {}); // Ignore previous errors
  }
  const promise = run();
  self._inflightMutations.set(key, promise);
  try {
    return await promise;
  } finally {
    if (self._inflightMutations.get(key) === promise) {
      self._inflightMutations.delete(key);
    }
  }
}
