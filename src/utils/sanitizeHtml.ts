// packages/features/crud/src/utils/sanitizeHtml.ts

/**
 * @fileoverview HTML sanitizer using DOMPurify
 * @description XSS-safe HTML sanitization for rich text content rendered with dangerouslySetInnerHTML.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML using DOMPurify — handles all known XSS vectors including
 * malformed tags, event handlers, javascript: URIs, data: URIs, SVG payloads,
 * CSS injection, and HTML entity encoding bypasses.
 */
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
 * Void elements that DOMPurify may not strip in non-browser DOM implementations
 * (happy-dom parses void elements before DOMPurify can intercept them).
 * Belt-and-suspenders: regex strip after DOMPurify for these specific tags.
 */
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

/**
 * Void elements that DOMPurify may not strip in non-browser DOM implementations
 * (happy-dom parses void elements before DOMPurify can intercept them).
 * Belt-and-suspenders: regex strip after DOMPurify for these specific tags.
 */
const VOID_STRIP_RE = /<\/?(?:embed|source|track|area|wbr)[^>]*>/gi;

export function sanitizeHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  return sanitized.replace(VOID_STRIP_RE, '');
}
