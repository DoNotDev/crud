import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getI18nInstance, RequestLanguageProvider } from '@donotdev/core';

import { useEntityForm } from '../useEntityForm';
import { adminNamespaceEntity as admin, shopNamespaceEntity as shop } from '@dndev/test-entities';

// Exercise the real framework translation hook with an isolated i18next instance.
vi.mock('../../../../../../core/i18n/src/instance.vite', async () => {
  const { createInstance } = await import('i18next');
  const instance = createInstance();
  const { initReactI18next } = await import('react-i18next');
  await instance.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'en',
    supportedLngs: ['fr', 'en'],
    ns: ['form-shop', 'form-admin', 'crud', 'custom-form'],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    resources: {
      fr: {
        'form-shop': {
          fields: { name: 'Boutique', rateCarrier: 'Transporteur' },
          options: { carrier: { colissimo: 'Colissimo FR' } },
        },
        'form-admin': { fields: { name: 'Administration' } },
        crud: { fields: { shared: 'Champ partagé' } },
        'custom-form': { fields: { name: 'Libellé personnalisé' } },
      },
      en: {
        'form-shop': { fields: { name: 'Shop', rateCarrier: 'Carrier' } },
        'form-admin': { fields: { name: 'Administration EN' } },
        crud: { fields: { shared: 'Shared field' } },
      },
    },
  });
  return { getI18nInstance: () => instance };
});


beforeEach(async () => {
  await getI18nInstance().changeLanguage('fr');
});
afterEach(cleanup);

describe('useEntityForm translations', () => {
  it('translates entity labels, nested labels and options without passing t', () => {
    const { result } = renderHook(() => useEntityForm(shop));
    expect(result.current.t(shop.fields.name.label)).toBe('Boutique');
    expect(result.current.t('fields.rateCarrier')).toBe('Transporteur');
    expect(result.current.t('options.carrier.colissimo')).toBe('Colissimo FR');
  });

  it('resolves explicitly namespaced shared CRUD labels like existing entity components', () => {
    const { result } = renderHook(() => useEntityForm(shop));
    expect(result.current.t('crud:fields.shared')).toBe('Champ partagé');
  });

  it('keeps each entity namespace independent on a multi-form page', () => {
    const { result } = renderHook(() => ({
      shop: useEntityForm(shop),
      admin: useEntityForm(admin),
    }));
    expect(result.current.shop.t('fields.name')).toBe('Boutique');
    expect(result.current.admin.t('fields.name')).toBe('Administration');
  });

  it('uses an explicit t as a complete override, including namespace selection', () => {
    const customT = (key: string) => getI18nInstance().t(key, { ns: 'custom-form' });
    const { result, rerender } = renderHook(
      ({ t }: { t?: typeof customT }) => useEntityForm(shop, { t }),
      { initialProps: { t: customT } }
    );
    expect(result.current.t).toBe(customT);
    expect(result.current.t('fields.name')).toBe('Libellé personnalisé');
    rerender({ t: undefined });
    expect(result.current.t('fields.name')).toBe('Boutique');
  });

  it('updates translations after a language change without replacing the entity', async () => {
    const { result } = renderHook(() => useEntityForm(shop));
    expect(result.current.t('fields.name')).toBe('Boutique');
    await act(async () => { await getI18nInstance().changeLanguage('en'); });
    expect(result.current.t('fields.name')).toBe('Shop');
  });

  it('uses the request language during SSR rather than the shared instance language', async () => {
    await getI18nInstance().changeLanguage('en');
    function Probe() {
      const form = useEntityForm(shop);
      return createElement('span', null, form.t('fields.name'));
    }
    const html = renderToString(createElement(
      RequestLanguageProvider,
      { language: 'fr', children: createElement(Probe) }
    ));
    expect(html).toContain('Boutique');
    expect(html).not.toContain('Shop');
  });
});
