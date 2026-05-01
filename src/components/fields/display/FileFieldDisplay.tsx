// packages/features/crud/src/components/fields/display/FileFieldDisplay.tsx

/**
 * @fileoverview FileFieldDisplay component
 * @description Displays file values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Badge, BADGE_VARIANT, Text, Stack } from '@donotdev/components';
import type { EntityField } from '@donotdev/core';

export interface FileFieldDisplayProps {
  /** Field configuration */
  config: EntityField<'file'>;
  /** Value to display */
  value: File | null;
  /** Translation function */
  t: (key: string, options?: Record<string, any>) => string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * FileFieldDisplay - Displays file values in read-only mode
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
export const FileFieldDisplay: React.ComponentType<FileFieldDisplayProps> = ({
  config,
  value,
  t,
  className,
}) => {
  if (!value) {
    return (
      <Text as="span" variant="muted" className={className}>
        -
      </Text>
    );
  }

  return (
    <Stack direction="row" align="center" className={className}>
      <Text as="span" level="small">
        {value.name}
      </Text>
      {value.size && (
        <Badge variant={BADGE_VARIANT.SECONDARY}>
          {(value.size / 1024).toFixed(1)} KB
        </Badge>
      )}
    </Stack>
  );
};

export default FileFieldDisplay;
