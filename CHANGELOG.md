# @donotdev/crud

## Unreleased

### Minor Changes

- `useCrudDoc(entity, id)`: one document, reactive to the shared cache. Every edit, delete (optimistic or confirmed) or subscription write re-renders it. `EntityDisplayRenderer` (ui, expo) uses it: detail views no longer go stale after an edit.
- Removed `useCrud().data` (always `null` since 0.1.x). Read documents with `useCrudDoc` or `get()`.

### Patch Changes

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
