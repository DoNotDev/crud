// packages/features/crud/src/utils/useRowTranslator.ts

/**
 * @fileoverview Current-language view of translated entity rows
 * @description Read hooks (`useCrudDoc`, list hooks) pass rows through this so a field
 * defined with `i18n: true` shows the current language, falling back to the stored
 * default-language value. The cache keeps the stored rows (every language), so a
 * language switch re-renders without a new read.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { useCallback, useMemo } from 'react';

import {
  getTranslatedFieldNames,
  translateRow,
  useTranslation,
} from '@donotdev/core';
import type { AnyEntity } from '@donotdev/core';

/** Row → same row in the current language. */
export type RowTranslator = <R>(row: R) => R;

const identity: RowTranslator = (row) => row;

/**
 * Translator for the rows of `entityOrCollection` in the current language.
 * Identity when the entity has no translated field, when no entity is known (bare
 * collection name without `options.entity`), or when `options.translate` is false
 * (edit forms read stored values).
 *
 * @param entityOrCollection - Entity, or collection name
 * @param options - Hook options: `entity` (when called with a collection name), `translate`
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */
export function useRowTranslator(
  entityOrCollection: AnyEntity | string,
  options: { entity?: AnyEntity; translate?: boolean }
): RowTranslator {
  const { language } = useTranslation();
  const translate = options.translate ?? true;
  const entity =
    typeof entityOrCollection === 'string' ? options.entity : entityOrCollection;
  const fields = entity?.fields ?? null;
  const fieldNames = useMemo(
    () => (fields ? getTranslatedFieldNames(fields) : []),
    [fields]
  );
  const active = translate && fieldNames.length > 0;
  const translator = useCallback<RowTranslator>(
    (row) =>
      row && typeof row === 'object'
        ? (translateRow(
            row as Record<string, unknown>,
            fieldNames,
            language
          ) as typeof row)
        : row,
    [fieldNames, language]
  );
  return active ? translator : identity;
}
