# @donotdev/crud

## Unreleased

### Minor Changes

- `cacheStored(collection, row)` on a row no cache of the collection knows is an insert: the document cache is set, the row is appended to every cached list and `total` is bumped, as `add` does. It did nothing for unknown rows (a row from an RPC that created it never showed up). A row already cached (document cache non-null, or in a cached list) is replaced as before.
- `useCrudDoc(entity, id)`: one document, reactive to the shared cache. Every edit, delete (optimistic or confirmed) or subscription write re-renders it. `EntityDisplayRenderer` (ui, expo) uses it: detail views no longer go stale after an edit.
- Removed `useCrud().data` (always `null` since 0.1.x). Read documents with `useCrudDoc` or `get()`.
- Filters: `select` / `radio` / `multiselect` / `reference` filters match exactly (was substring: `toner` matched `toner_pad`), any-of on arrays (OR within a field, AND across fields). `EntityFilters` offers them as multi-selects (state: arrays; a string state still matches). Reference fields (`filterType: 'reference'`, was `'text'`) filter by id with the referenced documents' labels. Option counts/availability are per array item; chips show option / reference labels.
- `field.filter.wildcard` (`FieldFilterConfig`, `@donotdev/core`): a stored value meaning "every option" (e.g. `skinTypes: ['all']`), never offered as a choice, matches any selection. `matchesFilter` takes the field's `filter` as 4th argument (`applyFilters` passes it).
- URL sync of filters: only entity-collection keys (custom `filterKey` states never touch the URL; `useCrudFilters` / `EntityFilters` `urlSync` opt in/out, store `setFilterUrlSync`); re-read on back/forward, navigations and mount (`syncFiltersFromUrl`); option fields as repeated params read back as arrays, values percent-encoded (commas safe); only the entity's own `f_*` params rewritten; router history state and hash kept; a pending write is dropped when the page changed.
- `EntityList` / `EntityCardList` (ui) pass the viewer's role to `EntityFilters`: admin-visibility fields were filtered as `guest`, so admin lists showed an empty filter panel.

### Patch Changes

- `useCrudDoc` on Vite: while the record the URL names is not found, the document head carries `<meta name="robots" content="noindex">` (removed when the record shows up or the component unmounts), so crawlers do not index a client-rendered not-found state served with HTTP 200. The record the URL names: the current route (`matchRoute` from `@donotdev/core`, the AutoMetaTags matcher) declares the entity in its PageMeta (`meta.entity` = the collection read) and its `:param` value is the `id` read; a secondary read on the page (a missing brand on a valid product page) never noindexes it. Next adds nothing (entity pages answer a missing record with a real 404).
- `DateFilter` loads its calendar on demand (`LazyCalendar`, preloaded when the browser is idle and on trigger pointer-enter / focus): `react-day-picker` no longer ships up front with every list that has a date filter.
- `useCrudList` / `useCrudCardList` pass `translate` through: `translate: false` is honored (it was ignored, rows were translated anyway).
- `useCrudFilters`: render no longer writes the store (a page loaded with `f_*` params updated other components during render: React "Cannot update a component while rendering"). The first client render reads the URL, the mount effect seeds the store; server render and hydration show no filters.
- `EntityFilters`: chip remove and combobox clear buttons are translated (`form.remove`, `filter.clear`; were English "Remove" / "Clear").
- `EntityFilters`: a multi-select with values shows them (one value's label, `filters.selected` for several; was the placeholder). `filters.selected_other` added (fr, es, it, pt).
- One read path per shape: `get()` / `getDocQueryOptions` and `query()` / `getListQueryOptions` now share the access check, PII decryption and the server-render request adapter. Lists read through `useCrudList` / `useCrudCardList` previously returned PII ciphertext and skipped the access check. Subscriptions decrypt PII before writing the cache.
- `assertCanAccess` checks the adapter that performs the read (request-scoped on the server).
- Delete: a displayed document shows not-found (cache entry set to `null`, stale); an undisplayed entry is dropped. Previously `removeQueries` left it on screen.
- Failed delete no longer duplicates the row in cached lists.
- `EntityDisplayRenderer`: a read failure renders inline without a toast (same as lists) and is retried once (`retry: 1`); renders nothing when CRUD is unavailable instead of "not found".
- expo `FormFieldRenderer` / `EntityFormRenderer`: removed the deprecated `errors` prop (fields read `fieldState`).

## 0.1.46

### Patch Changes

- Image fields: `options.fieldSpecific.image` configures upload processing (maxWidth/maxHeight, thumbWidth/thumbHeight, aspectRatio number | 'original', quality, thumbQuality, background incl. 'transparent'). Validated with valibot; invalid config throws. Omitted = previous defaults (1920x1440 + 300x225, 4:3, 0.85 / 0.65, white).
- `processImage`: `aspectRatio: 'original'` keeps the source ratio (no crop, thumbnail fits its box), `thumbQuality`, `background`. `ImageFieldComponent` gains a `processing` prop.

## 0.1.44

### Patch Changes

- 20f9a0e: Prevent blob: URLs from reaching the database through two paths: (1) final gate in handleSubmit rejects blob URLs regardless of upload state, (2) auto-save drafts strip blob URLs before persisting to localStorage.
- 064cfbb: Fix date field validation: show error messages (was silent), accept ISO date strings from DB (was rejecting valid dates with isoTimestamp)
- a4c57d7: bugfixes and performance upgrades
- Updated dependencies [98d641c]
- Updated dependencies [a4c57d7]
- Updated dependencies [2b8210a]
  - @donotdev/core@0.1.43
  - @donotdev/components@0.1.44
