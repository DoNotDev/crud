// packages/features/crud/src/components/fields/display/__tests__/AvatarImageFieldDisplay.test.tsx

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AvatarFieldDisplay from '../AvatarFieldDisplay';
import ImageFieldDisplay from '../ImageFieldDisplay';

afterEach(cleanup);

const t = (key: string) => key;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- why: only label is read
const config = { label: 'Jane Doe' } as any;

// Regression: `size` mapped to Tailwind-style classes no CSS defines
// (`size-touch`, `h-16 w-16`): every size rendered the Avatar's 32px default.
describe.each([
  ['AvatarFieldDisplay', AvatarFieldDisplay],
  ['ImageFieldDisplay', ImageFieldDisplay],
])('%s size', (_name, Display) => {
  it.each([
    ['sm', 'var(--touch-target)'],
    ['md', 'var(--touch-target)'],
    ['lg', '4rem'],
  ] as const)('%s sizes the avatar box', (size, expected) => {
    const { container } = render(
      <Display config={config} value="https://example.com/a.png" t={t} size={size} />
    );
    const root = container.querySelector<HTMLElement>('.dndev-avatar')!;
    expect(root.style.width).toBe(expected);
    expect(root.style.height).toBe(expected);
    expect(root.className).not.toMatch(/\b(size-touch|h-16|w-16)\b/);
  });
});
