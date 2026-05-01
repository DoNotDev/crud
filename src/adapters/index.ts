// packages/features/crud/src/adapters/index.ts

/**
 * @fileoverview CRUD adapters
 * @description Backend adapters for CRUD operations
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// FirestoreAdapter moved to @donotdev/firebase (Firebase-specific ICrudAdapter implementation)
export type { FunctionsQueryOptions } from './FunctionsAdapter';
export { FunctionsAdapter } from './FunctionsAdapter';
