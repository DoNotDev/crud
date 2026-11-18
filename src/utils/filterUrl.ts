// packages/features/crud/src/utils/filterUrl.ts

/**
 * @fileoverview Filter state ↔ URL search params
 * @description Pure encoding of a filter state (`FilterState`) as `f_*` search params,
 * decided by the entity's field types. Used by CrudStore URL sync. No `location` access.
 *
 * Format (one param per value, standard percent-encoding, commas safe):
 * - range fields (number, price, date, year...): `f_<field>_min`, `f_<field>_max`
 * - option fields (select, radio, multiselect, reference: filter types `select`,
 *   `multiselect`, `reference`): `f_<field>` repeated, always decoded as an array
 * - other fields (text, rating...): `f_<field>`; repeated → array, single → string
 *
 * @version 0.1.0
 * @since 0.3.0
 * @author AMBROISE PARK Consulting
 */

import type { AnyEntity } from '@donotdev/core';

import { getFilterType } from '../fieldTypeRegistry.store';
import type { FilterState } from '../types';

/** Filter types holding option codes / ids: decoded as arrays (any-of). */
const OPTION_FILTER_TYPES = new Set(['select', 'multiselect', 'reference']);

/** Prefix of filter search params */
export const FILTER_PARAM_PREFIX = 'f_';

function filterTypeOf(entity: AnyEntity, field: string) {
  const config = entity.fields[field];
  return config ? getFilterType(config.type) : undefined;
}

/** Whether `key` is a filter param of one of `entity`'s fields. */
function isEntityFilterParam(key: string, entity: AnyEntity): boolean {
  if (!key.startsWith(FILTER_PARAM_PREFIX)) return false;
  const rest = key.slice(FILTER_PARAM_PREFIX.length);
  if (rest in entity.fields) return filterTypeOf(entity, rest) !== 'range';
  const range = /^(.+)_(min|max)$/.exec(rest);
  return !!range && filterTypeOf(entity, range[1]!) === 'range';
}

/**
 * Write `filters` into `params`: removes the entity's `f_*` params, then writes the
 * filters of the entity's fields. Params of other fields and non-filter params stay.
 *
 * @param params - Search params to update in place
 * @param filters - Filter state
 * @param entity - Entity whose field types decide the encoding
 */
export function writeFilterParams(
  params: URLSearchParams,
  filters: FilterState,
  entity: AnyEntity
): void {
  [...new Set(params.keys())]
    .filter((key) => isEntityFilterParam(key, entity))
    .forEach((key) => params.delete(key));

  for (const [field, value] of Object.entries(filters)) {
    if (!(field in entity.fields)) continue;
    const key = `${FILTER_PARAM_PREFIX}${field}`;
    if (typeof value === 'string') {
      if (value !== '') params.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else {
      if (value.min) params.set(`${key}_min`, value.min);
      if (value.max) params.set(`${key}_max`, value.max);
    }
  }
}

/**
 * Read the filter state of `entity`'s fields from a search string.
 *
 * @param search - `location.search` (with or without `?`)
 * @param entity - Entity whose field types decide the decoding
 * @returns The filter state (fields without params are absent)
 */
export function readFilterParams(
  search: string,
  entity: AnyEntity
): FilterState {
  const params = new URLSearchParams(search);
  const filters: FilterState = {};

  for (const field of Object.keys(entity.fields)) {
    const key = `${FILTER_PARAM_PREFIX}${field}`;
    const filterType = filterTypeOf(entity, field);

    if (filterType === 'range') {
      const min = params.get(`${key}_min`);
      const max = params.get(`${key}_max`);
      if (min || max) {
        filters[field] = {
          ...(min ? { min } : {}),
          ...(max ? { max } : {}),
        };
      }
      continue;
    }

    const values = params.getAll(key).filter((value) => value !== '');
    if (values.length === 0) continue;
    filters[field] =
      (filterType !== undefined && OPTION_FILTER_TYPES.has(filterType)) ||
      values.length > 1
        ? values
        : values[0]!;
  }

  return filters;
}

/**
 * Canonical encoding of a filter state (sorted params): two states that encode the
 * same are the same URL.
 *
 * @param filters - Filter state
 * @param entity - Entity whose field types decide the encoding
 */
export function encodeFilterParams(
  filters: FilterState,
  entity: AnyEntity
): string {
  const params = new URLSearchParams();
  writeFilterParams(params, filters, entity);
  params.sort();
  return params.toString();
}
