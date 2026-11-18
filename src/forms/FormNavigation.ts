// packages/features/crud/src/forms/FormNavigation.ts

/**
 * @fileoverview Form navigation placeholder
 * @description crud has no router. `@donotdev/ui` fills this context (in
 * `UIProviders`) with the app router, the current path and the previous
 * breadcrumb, so `useEntityForm` can leave the page on save. Same pattern as
 * `LinkRendererProvider` in `@donotdev/components`.
 *
 * @version 0.1.0
 * @since 0.2.5
 * @author AMBROISE PARK Consulting
 */

import { createContext, useContext } from 'react';

/** Router access a form needs to leave on save and return on failure. */
export interface FormNavigation {
  /** Navigate to an app path. */
  navigate: (path: string) => void;
  /** Current app path, read at call time. */
  currentPath: () => string;
  /** Previous breadcrumb of the current path (nearest existing parent route, else home). */
  parentPath: () => string;
}

/**
 * Empty (null) outside a router, e.g. tests or a bare component tree:
 * forms then stay on the page after saving.
 */
const FormNavigationContext = createContext<FormNavigation | null>(null);

/**
 * Provides router access to every `useEntityForm` below it.
 * `@donotdev/ui` mounts it in `UIProviders`; apps do not mount it themselves.
 *
 * @example
 * ```tsx
 * <FormNavigationProvider value={{ navigate, currentPath, parentPath }}>
 *   {children}
 * </FormNavigationProvider>
 * ```
 */
export const FormNavigationProvider = FormNavigationContext.Provider;

/** Router access for forms, or null when no router provided it. */
export function useFormNavigation(): FormNavigation | null {
  return useContext(FormNavigationContext);
}
