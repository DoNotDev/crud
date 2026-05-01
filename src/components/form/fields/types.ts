// packages/features/crud/src/components/form/fields/types.ts

/**
 * @fileoverview Shared Field Component Types
 * @description Types shared between field components to break circular dependencies
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { ChangeEvent } from 'react';

/**
 * Rich Text Field Component Props
 */
export interface RichTextComponentProps {
  /** Field label */
  label: string;
  /** Current HTML value */
  value?: string;
  /** Change handler */
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Error state */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Required field */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder */
  placeholder?: string;
  /** Optional className */
  className?: string;
}
