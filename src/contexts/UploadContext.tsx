'use client';
// packages/features/crud/src/contexts/UploadContext.tsx

/**
 * @fileoverview Upload Context
 * @description Provides formId to upload components via context instead of prop drilling.
 *
 * **Why we need this:**
 * - Enables deferred uploads: Components inside EntityFormRenderer automatically get formId
 * - No prop drilling: Upload components don't need formId passed as prop
 * - Standalone mode: Components outside EntityFormRenderer work without formId (immediate upload)
 * - Easy for consumers: Just use `useUploadContext()` in custom upload components
 *
 * **Usage for consumers:**
 * ```tsx
 * function MyCustomUploadComponent() {
 *   const formId = useUploadContext();
 *   // formId is undefined = standalone mode (upload immediately)
 *   // formId is defined = deferred mode (upload on form submit)
 *   // Your component works automatically in both modes!
 * }
 * ```
 *
 * EntityFormRenderer wraps forms with this provider automatically.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { createContext, useContext } from 'react';

import type { ReactNode } from 'react';

// Simple string context - no object wrapper, no state needed
const UploadContext = createContext<string | undefined>(undefined);

/** Props for the {@link UploadProvider} component. */
export interface UploadProviderProps {
  formId: string | undefined;
  children: ReactNode;
}

/**
 * UploadProvider - Provides formId to upload components via context
 * Used by EntityFormRenderer to enable deferred uploads
 */
export function UploadProvider({ formId, children }: UploadProviderProps) {
  return (
    <UploadContext.Provider value={formId}>{children}</UploadContext.Provider>
  );
}

/**
 * useUploadContext - Get formId for upload components
 * Returns undefined if not inside an UploadProvider (standalone usage)
 */
export function useUploadContext(): string | undefined {
  return useContext(UploadContext);
}
