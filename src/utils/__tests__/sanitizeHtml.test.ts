// packages/features/crud/src/utils/__tests__/sanitizeHtml.test.ts

/**
 * @fileoverview Tests for sanitizeHtml
 * @description Unit tests for XSS-safe HTML sanitization via DOMPurify.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { describe, it, expect } from 'vitest';

import { sanitizeHtml } from '../sanitizeHtml';

describe('sanitizeHtml', () => {
  // ─── Basic behavior ──────────────────────────────────────────────────────

  it('preserves plain text content', () => {
    expect(sanitizeHtml('Hello, world!')).toBe('Hello, world!');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('preserves safe HTML tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('preserves links with safe href', () => {
    const input = '<a href="https://example.com">Link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  // ─── Script tag stripping ────────────────────────────────────────────────

  it('strips script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toBe('<p>Hello</p>');
  });

  it('strips script tags with attributes', () => {
    const input = '<script type="text/javascript" src="evil.js"></script>text';
    expect(sanitizeHtml(input)).toBe('text');
  });

  // ─── Event handler stripping ─────────────────────────────────────────────

  it('strips onclick handlers', () => {
    const result = sanitizeHtml('<div onclick="alert(1)">Click</div>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Click');
  });

  it('strips onerror handlers', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('strips onload handlers', () => {
    const result = sanitizeHtml('<body onload="alert(1)">content</body>');
    expect(result).not.toContain('onload');
  });

  it('strips onmouseover handlers', () => {
    const result = sanitizeHtml('<div onmouseover="alert(1)">hover</div>');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('hover');
  });

  // ─── Style tag stripping ─────────────────────────────────────────────────
  // CRUD rich text fields never produce <style> tags. Strip for XSS safety.

  it('strips style tags', () => {
    const input = '<style>body { background: url("evil") }</style><p>Safe</p>';
    expect(sanitizeHtml(input)).toBe('<p>Safe</p>');
  });

  it('strips style tags with expressions', () => {
    const input =
      '<style>div { width: expression(alert(1)) }</style><p>content</p>';
    expect(sanitizeHtml(input)).toBe('<p>content</p>');
  });

  // ─── XSS vectors ────────────────────────────────────────────────────────

  it('strips img onerror XSS', () => {
    const result = sanitizeHtml('<img src=x onerror=alert(1)>');
    expect(result).not.toContain('onerror');
  });

  it('strips svg onload XSS', () => {
    const result = sanitizeHtml(
      '<svg onload="alert(1)"><circle r="10"/></svg>'
    );
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert');
  });

  it('strips javascript: URLs in href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('strips javascript: URLs in img src', () => {
    const result = sanitizeHtml('<img src="javascript:alert(1)">');
    expect(result).not.toContain('javascript:');
  });

  it('strips data: URI XSS in href', () => {
    const result = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">click</a>'
    );
    expect(result).not.toContain('data:text/html');
  });

  // ─── Nested malicious content ────────────────────────────────────────────

  it('strips nested script in div', () => {
    const input = '<div><div><script>alert(1)</script></div></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
  });

  it('strips deeply nested event handlers', () => {
    const input =
      '<div><p><span><a href="#" onclick="alert(1)">deep</a></span></p></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).toContain('deep');
  });

  // ─── Encoded entities ────────────────────────────────────────────────────

  it('preserves safe HTML entities', () => {
    const input = '<p>5 &gt; 3 &amp; 2 &lt; 4</p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('handles mixed content with entities', () => {
    const result = sanitizeHtml('<p>&amp;</p><script>alert(1)</script>');
    expect(result).toBe('<p>&amp;</p>');
  });

  // ─── Dangerous tags ──────────────────────────────────────────────────────

  it('strips iframe tags', () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>safe');
    expect(result).not.toContain('iframe');
    expect(result).toContain('safe');
  });

  it('strips object/embed tags', () => {
    const result = sanitizeHtml(
      '<object data="evil.swf"></object><embed src="evil.swf">text'
    );
    expect(result).not.toContain('object');
    expect(result).not.toContain('embed');
    expect(result).toContain('text');
  });

  it('strips form tags', () => {
    const result = sanitizeHtml(
      '<form action="https://evil.com"><input type="text"></form>safe'
    );
    expect(result).not.toContain('form');
    expect(result).toContain('safe');
  });
});
