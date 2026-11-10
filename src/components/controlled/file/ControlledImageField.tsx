'use client';
// packages/features/crud/src/components/controlled/file/ControlledImageField.tsx

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';
import type { FieldValues, Path } from 'react-hook-form';

import { readImageProcessingOptions } from '../../../utils/imageProcessing';
import { ImageFieldComponent } from '../../form/fields';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledImageField - Explicit controlled component for image uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledImageField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = fieldConfig.options || {};
  // Stable across renders: the upload callback depends on it, and a new object each
  // render would re-register the field's pending upload on every keystroke.
  const imageOptions = (
    options.fieldSpecific as { image?: unknown } | undefined
  )?.image;
  const processing = useMemo(
    () => readImageProcessingOptions({ image: imageOptions }),
    // Keyed on content: entity configs are often inline literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(imageOptions)]
  );

  return (
    <Controller
      name={name as Path<FieldValues>}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => (
        <ImageFieldComponent
          name={name}
          label={t(label)}
          value={field.value ?? null}
          onChange={(value) => field.onChange(value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message as string | undefined}
          required={required}
          multiple={false}
          maxFiles={1}
          maxSize={(options as any).maxSize}
          storagePath={(options.fieldSpecific as any)?.storagePath}
          processing={processing}
        />
      )}
    />
  );
}
