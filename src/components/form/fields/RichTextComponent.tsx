'use client';
// packages/features/crud/src/components/form/fields/RichTextComponent.tsx

/**
 * @fileoverview Rich Text Field Component
 * @description WYSIWYG editor component for rich text/HTML content using Tiptap
 * CSR-safe: Lazy loads editor only on client side
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { lazy, Suspense, useState, useEffect } from 'react';

import { Stack } from '@donotdev/components';

import TextAreaComponent from './TextAreaComponent';

import type { RichTextComponentProps } from './types';
import type { ComponentType } from 'react';

// Lazy load Tiptap editor (CSR-only)
const TiptapEditor = lazy(() =>
  typeof window !== 'undefined'
    ? import('./internal/TiptapEditor').catch(() => {
        // Fallback if Tiptap is not installed
        return { default: () => null };
      })
    : Promise.resolve({ default: () => null })
);

/**
 * RichTextComponent - WYSIWYG editor with Tiptap
 * Falls back to textarea if Tiptap is not available
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const RichTextComponent: ComponentType<RichTextComponentProps> = ({
  label,
  value = '',
  onChange,
  error,
  helperText,
  required,
  disabled,
  placeholder,
  className,
}) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fallback to textarea if not on client or Tiptap not available
  if (!isClient) {
    return (
      <TextAreaComponent
        label={label}
        value={value}
        onChange={onChange}
        error={error}
        helperText={helperText}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <Stack gap="tight">
      <Suspense
        fallback={
          <TextAreaComponent
            label={label}
            value={value}
            onChange={onChange}
            error={error}
            helperText={helperText}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            className={className}
          />
        }
      >
        {TiptapEditor ? (
          <TiptapEditor
            label={label}
            value={value}
            onChange={onChange}
            error={error}
            helperText={helperText}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            className={className}
          />
        ) : (
          <TextAreaComponent
            label={label}
            value={value}
            onChange={onChange}
            error={error}
            helperText={helperText}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            className={className}
          />
        )}
      </Suspense>
    </Stack>
  );
};

export default RichTextComponent;
