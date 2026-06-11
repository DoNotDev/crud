# @donotdev/crud

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
