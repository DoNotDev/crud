// packages/features/crud/src/components/form/fields/GdprConsentFieldComponent.tsx

/**
 * @fileoverview GDPR Consent Field Component
 * @description Renders a GDPR-compliant consent checkbox with automatic label generation including links to privacy policy and terms.
 * Opens legal documents in Sheet with iframe when links are clicked.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState } from 'react';

import { Checkbox, Label, Sheet, Stack, Text } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import type { ChangeEvent, ComponentType, MouseEvent } from 'react';

export interface GdprConsentFieldComponentProps {
  /** Whether the checkbox is checked */
  checked?: boolean;
  /** Change handler for the checkbox */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Whether the field is required */
  required?: boolean;
  /** Path to privacy policy page (default: '/legal/privacy') */
  privacyPolicyPath?: string;
  /** Path to terms of use page (default: '/legal/terms') */
  termsPath?: string;
}

/**
 * GDPR Consent Field Component - Renders a consent checkbox with automatic label generation.
 * Opens privacy policy and terms in Sheet with iframe when links are clicked.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param props - GdprConsentFieldComponentProps
 * @returns JSX.Element
 */
const GdprConsentFieldComponent: ComponentType<
  GdprConsentFieldComponentProps
> = ({
  checked = false,
  onChange,
  required,
  privacyPolicyPath = '/legal/privacy',
  termsPath = '/legal/terms',
}) => {
  const { t } = useTranslation('crud');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const handleChange = (checked: boolean) => {
    if (onChange) {
      onChange({
        target: { checked },
      } as ChangeEvent<HTMLInputElement>);
    }
  };

  const handleLabelClick = (e: MouseEvent<HTMLLabelElement>) => {
    // Don't toggle if clicking on links
    if ((e.target as HTMLElement).tagName === 'A') {
      return;
    }
    // Toggle checkbox when clicking label (but not on the checkbox itself to avoid double-toggle)
    if ((e.target as HTMLElement).closest('[data-type="checkbox"]')) {
      return;
    }
    handleChange(!checked);
  };

  const handleLinkClick = (
    e: MouseEvent<HTMLAnchorElement>,
    type: 'privacy' | 'terms'
  ) => {
    e.preventDefault();
    if (type === 'privacy') {
      setPrivacyOpen(true);
    } else {
      setTermsOpen(true);
    }
  };

  const consentText = t('gdprConsent.consent', {
    defaultValue: 'I agree to the',
  });
  const privacyPolicyText = t('gdprConsent.privacyPolicy', {
    defaultValue: 'privacy policy',
  });
  const termsText = t('gdprConsent.terms', { defaultValue: 'terms of use' });
  const andText = t('gdprConsent.and', {
    defaultValue: 'and consent to the processing of my personal data.',
  });

  return (
    <>
      <Stack direction="row" align="center" gap="tight">
        <Checkbox checked={checked} onCheckedChange={handleChange} />
        <Label
          required={required}
          plain
          onClick={handleLabelClick}
          style={{ cursor: 'pointer' }}
        >
          <Text level="body" style={{ fontSize: 'var(--font-size-input)' }}>
            {consentText}{' '}
            <a
              href={privacyPolicyPath}
              onClick={(e) => handleLinkClick(e, 'privacy')}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
            >
              {privacyPolicyText}
            </a>
            {' / '}
            <a
              href={termsPath}
              onClick={(e) => handleLinkClick(e, 'terms')}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
            >
              {termsText}
            </a>{' '}
            {andText}
          </Text>
        </Label>
      </Stack>
      <Sheet
        open={privacyOpen}
        onOpenChange={setPrivacyOpen}
        side="bottom"
        title={privacyPolicyText}
        style={{
          width: '100%',
          height: '90%',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <iframe
          src={privacyPolicyPath}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            flex: 1,
            minHeight: 0,
          }}
          title={privacyPolicyText}
        />
      </Sheet>
      <Sheet
        open={termsOpen}
        onOpenChange={setTermsOpen}
        side="bottom"
        title={termsText}
        style={{
          width: '100%',
          height: '90%',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <iframe
          src={termsPath}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            flex: 1,
            minHeight: 0,
          }}
          title={termsText}
        />
      </Sheet>
    </>
  );
};

export default GdprConsentFieldComponent;
