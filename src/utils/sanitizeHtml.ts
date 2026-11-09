// packages/features/crud/src/utils/sanitizeHtml.ts

/**
 * @fileoverview Rich-text sanitizer for CRUD fields
 * @description Tiptap-tag allowlist over the shared `sanitizeHtml` from
 * `@donotdev/components` (DOMPurify in the browser, DOMPurify + jsdom on the server).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { sanitizeHtml as sanitize } from '@donotdev/components';

/**
 * Allowlisted tags for CRUD rich text fields.
 * Rich text editors (Tiptap/ProseMirror) produce only these tags.
 * Everything else is stripped - no style, form, embed, object, iframe, script.
 */
const ALLOWED_TAGS = [
  // Block
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'hr',
  // List
  'ul',
  'ol',
  'li',
  // Inline
  'a',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'br',
  'span',
  'sub',
  'sup',
  'mark',
  // Table
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  // Media (src sanitized by DOMPurify)
  'img',
  // Structure
  'div',
  'figure',
  'figcaption',
  'details',
  'summary',
];

/**
 * Allowlisted attributes — only these survive sanitization.
 * DOMPurify defaults would be safe, but explicit is defense-in-depth.
 */
const ALLOWED_ATTR = [
  'href',
  'target',
  'rel', // links
  'src',
  'alt',
  'width',
  'height', // images
  'class', // marks / styling
  'colspan',
  'rowspan', // tables
];

/** Sanitize CRUD rich text: shared sanitizer restricted to the rich-text allowlist. */
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR,
  });
}
