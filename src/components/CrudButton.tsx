'use client';
// packages/features/crud/src/components/CrudButton.tsx

/**
 * @fileoverview CrudButton Component
 * @description Defensive button component for CRUD operations.
 * Extends ActionButton with CRUD-specific checks (auto-detects availability, requiresAuth).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { ActionButton } from '@donotdev/components';
import type { ActionButtonProps } from '@donotdev/components';

import { useCrudStore } from '../CrudStore';

import type { ReactNode } from 'react';

/** Props for {@link CrudButton}, an ActionButton variant that auto-checks CRUD availability. */
export interface CrudButtonProps<T = unknown> extends Omit<
  ActionButtonProps<T>,
  'disabled'
> {
  /**
   * Whether user authentication is required for this action.
   * When true, button is disabled if user is not authenticated.
   * @default true
   */
  requiresAuth?: boolean;
  /**
   * Current user object. Pass from useAuth('user').
   * Required when requiresAuth=true.
   */
  user?: unknown;
  /**
   * Additional disabled condition.
   */
  disabled?: boolean;
  /** Button content */
  children: ReactNode;
}

/**
 * Defensive button component for CRUD operations.
 *
 * Features (inherited from ActionButton):
 * - Auto-disables while loading
 * - Shows spinner + loadingText during action
 * - Optional confirmation dialog
 * - aria-busy for accessibility
 *
 * CRUD-specific features:
 * - **Auto-detects CRUD availability** - no manual prop needed
 * - Auto-disables when user not authenticated (if requiresAuth=true)
 *
 * @example
 * ```tsx
 * const { delete: deleteItem } = useCrud(itemEntity);
 * const user = useAuth('user');
 *
 * <CrudButton
 *   action={() => deleteItem(itemId)}
 *   user={user}
 *   loadingText="Deleting..."
 *   confirmText="Delete this item?"
 *   confirmTitle="Delete Item"
 *   onSuccess={() => refetch()}
 *   variant="destructive"
 * >
 *   Delete
 * </CrudButton>
 * ```
 */
function CrudButton<T = unknown>({
  requiresAuth = true,
  user,
  disabled = false,
  children,
  ...actionButtonProps
}: CrudButtonProps<T>) {
  // Auto-detect CRUD availability - checks if CrudService is initialized
  const isAvailable = useCrudStore((state) => !!state.crudService);

  // Compute disabled state based on CRUD-specific conditions
  const isDisabled = disabled || !isAvailable || (requiresAuth && !user);

  return (
    <ActionButton<T> {...actionButtonProps} disabled={isDisabled}>
      {children}
    </ActionButton>
  );
}

export default CrudButton;
