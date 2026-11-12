'use client';
// packages/features/crud/src/components/controlled/file/ControlledMultiImageField.tsx

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Controller } from 'react-hook-form';

import { readImageProcessingOptions } from '../../../utils/imageProcessing';
import { ImageFieldComponent } from '../../form/fields';
import { controlledFieldOptions, uploadFieldSpecific } from '../fieldOptions';
import { convertValidationRules, type ControlledFieldProps } from '../types';

/**

 * ControlledMultiImageField - Explicit controlled component for multiple image uploads

 * NO ref forwarding - complex component (forwardRef) handles its own refs

 */

export function ControlledMultiImageField(
  props: ControlledFieldProps
): ReactElement {
  const { control, fieldConfig, required, t } = props;

  const { name, label, validation } = fieldConfig;

  const options = controlledFieldOptions(fieldConfig);
  const fieldSpecific = uploadFieldSpecific(fieldConfig);
  // Stable across renders: the upload callback depends on it, and a new object each
  // render would re-register the field's pending upload on every keystroke.
  const imageOptions = fieldSpecific?.image;
  const processing = useMemo(
    () => readImageProcessingOptions({ image: imageOptions }),
    // Keyed on content: entity configs are often inline literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(imageOptions)]
  );

  return (
    <Controller
      name={name}
      control={control}
      rules={validation ? convertValidationRules(validation) : undefined}
      render={({ field, fieldState }) => {
        // Normalize value to array

        const arrayValue = Array.isArray(field.value)
          ? field.value
          : field.value
            ? [field.value]
            : null;

        return (
          <ImageFieldComponent
            name={name}
            label={t(label)}
            value={arrayValue}
            onChange={(value) => field.onChange(value)}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            required={required}
            multiple={true}
            maxFiles={options.maxFiles ?? 10}
            maxSize={fieldSpecific?.maxSize}
            storagePath={fieldSpecific?.storagePath}
            processing={processing}
          />
        );
      }}
    />
  );
}
