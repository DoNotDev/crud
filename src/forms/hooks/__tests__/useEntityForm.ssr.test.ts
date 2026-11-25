/**
 * @fileoverview Regression: an edit form renders the record on the server.
 *
 * The edit values used to reach React Hook Form only through a reset in an effect,
 * which never runs on the server: SSR rendered every field empty (a switch unchecked)
 * while the client filled them before hydrating fields inside Suspense boundaries,
 * a hydration mismatch and an empty-then-filled flash (shop /compte, 0.3.7).
 */

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useController } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { useFormStore } from '../../../stores';
import { useEntityForm } from '../useEntityForm';
import { draftAcknowledgementEntity as entity } from '@dndev/test-entities';

const record = { id: 'record-1', title: 'Stored title', address: { street: 'Stored street', city: 'Stored city' } };

function TitleField({ operation }: { operation: 'create' | 'edit' }) {
  const form = useEntityForm(entity, { viewerRole: 'user', operation, formId: 'ssr', defaultValues: record });
  const { field } = useController({ name: 'title', control: form.control });
  return createElement('output', null, String(field.value ?? ''));
}

afterEach(() => useFormStore.setState({ drafts: {}, forms: {} }));

describe('entity form server render', () => {
  it.each(['create', 'edit'] as const)('renders the %s defaults on the server (no effects)', (operation) => {
    expect(renderToString(createElement(TitleField, { operation }))).toBe('<output>Stored title</output>');
  });
});
