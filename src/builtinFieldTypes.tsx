'use client';
// packages/features/crud/src/builtinFieldTypes.tsx

/**
 * @fileoverview Built-in Field Type Registrations — legacy compatibility shim.
 *
 * Registration is now handled at the source: `fieldTypeRegistry.ts` imports
 * `registerBuiltinFieldTypes.tsx` as a side-effect, guaranteeing built-ins are
 * available for every code path (display, form, filter, Expo).
 *
 * This file is kept solely for backward compatibility — existing consumers that
 * import `registerBuiltinFieldTypes` from `@donotdev/crud` still get a no-op
 * function that won't break their startup code.
 *
 * For custom field types, use `registerFieldType()` from `@donotdev/crud`.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

/**
 * @deprecated No-op. Built-in registration is now automatic (lazy on first access).
 * Kept for API compatibility with consumers that call this at app startup.
 */
export function registerBuiltinFieldTypes(): void {
  // Intentional no-op — registration happens lazily in getMetadataRegistry()
}
