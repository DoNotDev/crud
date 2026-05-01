'use client';
// packages/features/crud/src/components/FormLayout.tsx

/**
 * @fileoverview FormLayout component
 * @description Enhanced form layout with modern UX features
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';
import { FormProvider } from 'react-hook-form';

import {
  Button,
  BUTTON_VARIANT,
  Spinner,
  cn,
  Stack,
  Grid,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { FormEventHandler, ReactNode, FormEvent } from 'react';
import type { UseFormReturn, FieldValues } from 'react-hook-form';

/** Props for {@link FormLayout}, wraps a form with submit button, loading state, and layout grid. */
export interface FormDnDevLayoutProps<T extends FieldValues> {
  /** The title of the form */
  title: string;
  /** The submit handler for the form */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** The form fields (children) */
  children: ReactNode;
  /** The methods returned by useForm */
  formMethods: UseFormReturn<T>;
  /** Loading state */
  loading?: boolean;
  /** Submit button text */
  submitText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Show cancel button */
  showCancel?: boolean;
  /** Cancel handler */
  onCancel?: () => void;
  /** Form layout variant */
  variant?: 'default' | 'card' | 'minimal';
  /** Responsive columns */
  columns?: 1 | 2 | 3 | 4;
  /** Form description */
  description?: string;
}

/**
 * Enhanced FormLayout with modern UX features
 *
 * Features:
 * - Responsive design
 * - Loading states
 * - ARIA compliance
 * - Multiple variants
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * - Action buttons
 * - Error handling
 */
const FormLayout = <T extends FieldValues>({
  title,
  onSubmit,
  children,
  formMethods,
  loading = false,
  submitText,
  cancelText,
  showCancel = false,
  onCancel,
  variant = 'default',
  columns = 1,
  description,
}: FormDnDevLayoutProps<T>) => {
  const { t } = useTranslation('crud');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultSubmitText = submitText || t('form.submit', 'Submit');
  const defaultCancelText = cancelText || t('form.cancel', 'Cancel');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const gridCols = {
    1: 'dndev-grid-cols-1',
    2: 'dndev-grid-cols-1 dndev-md:grid-cols-2',
    3: 'dndev-grid-cols-1 dndev-md:grid-cols-2 dndev-md:grid-cols-3',
    4: 'dndev-grid-cols-1 dndev-md:grid-cols-2 dndev-md:grid-cols-4',
  };

  const variantStyles = {
    default: 'dndev-surface',
    card: 'dndev-surface',
    minimal: '',
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={handleSubmit}
        className={cn('dndev-mx-auto', variantStyles[variant])}
        style={variant !== 'minimal' ? { padding: 'var(--gap-lg)' } : undefined}
        role="form"
        aria-labelledby="form-title"
        noValidate
      >
        <Stack gap="large">
          {/* Header */}
          <Stack gap="tight">
            <h2
              id="form-title"
              style={{
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              {title}
            </h2>
            {description && (
              <p style={{ color: 'var(--muted-foreground)' }}>{description}</p>
            )}
          </Stack>

          {/* Form Fields */}
          <Grid cols={columns} className="dndev-w-full dndev-min-w-0">
            {children}
          </Grid>

          {/* Action Buttons */}
          <Stack
            direction="row"
            align="center"
            justify="end"
            style={{
              paddingTop: 'var(--gap-md)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {showCancel && (
              <Button
                type="button"
                variant={BUTTON_VARIANT.OUTLINE}
                onClick={onCancel}
                disabled={loading || isSubmitting}
              >
                {defaultCancelText}
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading || isSubmitting}
              style={{ minWidth: '120px' }}
            >
              {loading || isSubmitting ? (
                <>
                  <Spinner className="me-component-gap" />
                  {isSubmitting
                    ? t('form.submitting', 'Submitting...')
                    : t('form.loading', 'Loading...')}
                </>
              ) : (
                defaultSubmitText
              )}
            </Button>
          </Stack>
        </Stack>
      </form>
    </FormProvider>
  );
};

export default FormLayout;
