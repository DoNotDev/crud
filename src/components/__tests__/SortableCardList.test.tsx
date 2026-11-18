import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import fr from '../../../../../core/i18n/locales/lazy/crud_fr.json';

const i18n = createInstance();
await i18n.init({ lng: 'fr', fallbackLng: false, interpolation: { escapeValue: false }, resources: { fr: { crud: fr } } });

vi.mock('@donotdev/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTranslation: () => ({ t: i18n.getFixedT('fr', 'crud') }),
}));

const { SortableCardList } = await import('../SortableCardList');

const NAMES: Record<string, string> = { a: 'Toner', b: 'Serum', c: 'Cream' };

function setup(disabled = false, onRemove?: (id: string) => void) {
  const onReorder = vi.fn();
  render(
    <SortableCardList
      items={['a', 'b', 'c']}
      onReorder={onReorder}
      onRemove={onRemove}
      itemLabel={(id) => NAMES[id]}
      renderItem={(id, index) => <span data-testid="card">{`${index + 1}. ${NAMES[id]}`}</span>}
      disabled={disabled}
    />
  );
  return onReorder;
}

afterEach(cleanup);

describe('SortableCardList', () => {
  it('renders the cards in order', () => {
    setup();
    expect(screen.getAllByTestId('card').map((e) => e.textContent)).toEqual(['1. Toner', '2. Serum', '3. Cream']);
  });

  it('move buttons emit the new order, with translated labels', () => {
    const onReorder = setup();
    fireEvent.click(screen.getByLabelText('Placer Serum avant'));
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    fireEvent.click(screen.getByLabelText('Placer Serum après'));
    expect(onReorder).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    expect(screen.getByLabelText('Glisser pour déplacer Toner')).toBeTruthy();
  });

  it('remove button (end of the bar) only with onRemove', () => {
    setup();
    expect(screen.queryByLabelText('Retirer Serum')).toBeNull();
    cleanup();
    const onRemove = vi.fn();
    setup(false, onRemove);
    fireEvent.click(screen.getByLabelText('Retirer Serum'));
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('marks the handle and gives screen readers translated instructions', () => {
    setup();
    expect(screen.getByLabelText('Glisser pour déplacer Toner').hasAttribute('data-sortable-handle')).toBe(true);
    expect(document.body.textContent).toContain('Pour saisir un élément, appuyez sur Espace ou Entrée.');
  });

  it('disables moving past the ends and when disabled', () => {
    setup();
    expect((screen.getByLabelText('Placer Toner avant') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Placer Cream après') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const onReorder = setup(true);
    fireEvent.click(screen.getByLabelText('Placer Serum avant'));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
