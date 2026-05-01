// packages/features/crud/src/components/fields/display/RichTextDisplay.tsx

/**
 * @fileoverview RichTextDisplay component
 * @description Displays rich text/HTML content in read-only mode
 *
 * Renders HTML content from Tiptap editor with proper styling.
 * Uses dangerouslySetInnerHTML for lightweight rendering (no parser needed).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Text } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

import { sanitizeHtml } from '../../../utils/sanitizeHtml';

import type { ComponentType } from 'react';

export interface RichTextDisplayProps {
  /** Field configuration */
  config: EntityField<'richtext'>;
  /** HTML value to display */
  value: string;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * RichTextDisplay - Displays rich text/HTML content in read-only mode
 *
 * Renders HTML with styling that matches Tiptap editor output.
 * Safe to use with HTML from Tiptap (sanitized by Tiptap).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const RichTextDisplay: ComponentType<RichTextDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (!value || value.trim() === '') {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <div
      className={className}
      style={{
        padding: 'var(--gap-md)',
        backgroundColor: 'var(--muted)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        minHeight: '38px',
      }}
    >
      <div
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
        style={{
          // Match Tiptap editor styling
          outline: 'none',
          fontSize: 'var(--font-size-base)',
          lineHeight: '1.6',
        }}
        className="prose prose-sm max-w-none"
      />
      <style>{`
        /* Match Tiptap ProseMirror styling */
        .prose p {
          margin: 0.5em 0;
        }
        .prose p:first-child {
          margin-top: 0;
        }
        .prose p:last-child {
          margin-bottom: 0;
        }
        .prose h1 {
          font-size: var(--font-size-2xl);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .prose h2 {
          font-size: var(--font-size-xl);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .prose h3 {
          font-size: var(--font-size-lg);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .prose ul, .prose ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .prose li {
          margin: 0.25em 0;
        }
        .prose strong {
          font-weight: 600;
        }
        .prose em {
          font-style: italic;
        }
        .prose code {
          background: var(--muted);
          padding: 0.2em 0.4em;
          border-radius: var(--radius-sm);
          font-family: monospace;
          font-size: 0.9em;
        }
        .prose blockquote {
          border-left: 3px solid var(--border);
          padding-left: 1em;
          margin: 0.5em 0;
          color: var(--muted-foreground);
          font-style: italic;
        }
        .prose a {
          color: var(--primary);
          text-decoration: underline;
        }
        .prose a:hover {
          color: var(--primary-hover);
        }
      `}</style>
    </div>
  );
};

export default RichTextDisplay;
