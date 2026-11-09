# @donotdev/crud

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
