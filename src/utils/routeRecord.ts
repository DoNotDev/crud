// packages/features/crud/src/utils/routeRecord.ts

/**
 * @fileoverview Whether the current URL is a record's page
 * @description The route of the current URL (route manifest, `_DNDEV_CONFIG_.routes`,
 * matched by `matchRoute` from @donotdev/core, the matcher AutoMetaTags uses) shows this
 * record: it declares the record's entity (PageMeta `entity` → `meta.entity`, the
 * collection) and its `:param` value is the document id. `useCrudDoc` marks only that
 * read's not-found state noindex (Vite), never a secondary read on the page.
 *
 * @version 0.2.0
 * @since 0.3.2
 * @author AMBROISE PARK Consulting
 */

import {
  getDndevConfig,
  getLanguageRouting,
  matchRoute,
  splitLanguagePath,
} from '@donotdev/core';

/**
 * Whether the current URL is the page of document `id` of `collection`: the route the URL
 * matches (`matchRoute`: exact path first, else the most specific `:param` route, as
 * AutoMetaTags resolves it) declares that entity (`meta.entity === collection`) and one
 * of its params holds `id`. Browser only (reads `window.location`).
 *
 * @param collection - Collection of the document read
 * @param id - Document id read
 * @returns true when the URL names this record on a route declaring its entity
 *
 * @example
 * // Route `/produits/:id` with PageMeta `entity: productEntity`, URL /en/produits/abc
 * isRouteRecord('products', 'abc'); // true
 * isRouteRecord('brands', 'xyz'); // false: a secondary read on the page
 *
 * @version 0.2.0
 * @since 0.3.2
 * @author AMBROISE PARK Consulting
 */
export function isRouteRecord(collection: string, id: string): boolean {
  const mapping = getDndevConfig()?.routes?.mapping;
  if (!Array.isArray(mapping)) return false;

  const path = splitLanguagePath(
    window.location.pathname,
    getLanguageRouting()
  ).path;
  const match = matchRoute(mapping, path);
  if (!match || match.route.meta?.entity !== collection) return false;
  return Object.values(match.params).includes(id);
}
