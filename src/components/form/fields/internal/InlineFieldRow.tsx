// packages/features/crud/src/components/form/fields/internal/InlineFieldRow.tsx

/**
 * @fileoverview Inline field row
 * @description Row for `[control] label` fields (switch, checkbox, consent) in CRUD forms.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { Stack } from '@donotdev/components';

/** Same block size as an input (`--touch-target`), so every form row shares one rhythm. */
const ROW_STYLE: CSSProperties = { minBlockSize: 'var(--touch-target)' };

/** Props for {@link InlineFieldRow}. */
export interface InlineFieldRowProps {
  /** The control and its label */
  children: ReactNode;
}

/**
 * Row for inline-control form fields. Matches the height of label-on-top inputs and
 * centres the control vertically, so switch/checkbox rows align with inputs in one-
 * and multi-column form grids.
 *
 * @param props - InlineFieldRowProps
 * @returns The row
 */
export function InlineFieldRow({ children }: InlineFieldRowProps): ReactElement {
  return (
    <Stack direction="row" align="center" gap="tight" style={ROW_STYLE}>
      {children}
    </Stack>
  );
}
