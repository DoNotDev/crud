# Gotchas: @donotdev/crud

Common mistakes related to entity definition, forms, fields, and CRUD operations.

---

## CRUD [Phase 2, 3]

**GOTCHA: Do not override `useEntityForm` translations accidentally.** The hook automatically binds `[entity.namespace, 'crud']`; normal usage requires no `t` option, even on multi-entity pages. Pass its returned `form.t` to field renderers. Supply your own `options.t` only to intentionally bypass that namespace resolution: it replaces the default translator completely. Passing a page-bound `t` can therefore hide entity labels/options. Never copy entity strings into page locales. The hook still defaults `viewerRole` to `'guest'`, so pass the actual role. See CRUD → Custom Forms.

**Never `get(id)` / `query()` in a `useEffect` to render data.** Effects don't run on the server: on Next.js (SSR) the page HTML is a loader, invisible to crawlers and AI search. Use `useCrudDoc(entity, id)` for one record, `useCrudList` / `useCrudCardList` for lists: they read through the CRUD cache, which the server fills during the render.

**Hidden fields are auto-added by `defineEntity()` - don't define them manually:**
- `id`, `createdAt`, `updatedAt`, `createdById`, `updatedById`

**Status field - auto-added, fully overridable.**
The `status` field is auto-added with defaults: `visibility: 'admin'`, `editable: 'admin'`, `type: 'select'`, `required: true`. All properties can be overridden. `validation.options` are **merged** (consumer options added after base: `draft`, `available`, `deleted`).

```typescript
// Minimal: just extend options
status: { validation: { options: [{ value: 'shipped', label: 'Shipped' }] } }

// Override visibility, editable, label - all respected
status: { name: 'status', label: 'fields.status', visibility: 'admin', editable: 'super', validation: { options: [...] } }

// Hide from forms entirely
status: { visibility: 'technical' }
```

**Scope field is auto-added** when `scope` is configured. Don't manually define the scope field (e.g., `companyId`).

**Empty is `null`, never `''`.** Entity forms store an empty text input as `null` (form state, validated data, adapter payload); `''` exists only in the DOM. An optional field left empty passes its format rules; a `required` field left empty fails.

**Field `type` is a closed union.** Built-ins plus the custom types declared in `CustomFieldOptionsMap` (module augmentation of `@donotdev/core`). A typo or an undeclared custom type fails typecheck; a declared type with no `registerFieldType()` throws at render. No text-input fallback.

**`datetime-local` stores an ISO instant, displays local time.** The form shows the viewer's local wall time and saves `toISOString()` (UTC). Do not convert in the app.

**Filters on option fields are exact, not substring.** `select` / `radio` / `multiselect` / `reference` filters match the stored code or id exactly (`toner` never matches `toner_pad`); only text filters are substring. A stored "suits everything" value (`['all']`) needs `filter: { wildcard: 'all' }` on the field, never an extra filter option. See CRUD.md "Filters".

**Picker / dialog filters: give `EntityFilters` a `filterKey`.** Without it, the dialog shares (and URL-syncs) the page list's filter state. A custom key never touches the URL unless `urlSync` is set. See CRUD.md "Filters" (URL sync).

**Several forms on one record: give each a stable `formId`.** The auto-saved draft key includes it.

**A field the form does not render must not be `required` without a value.** Form validation uses the static `validation`: a required field hidden by `visibility` (role), `editable` or `conditions.visible` fails on submit unless its value comes in through `defaultValues`. The scope field is the exception: the form injects it from the scope provider before validating, as `add()` does.

**Custom form fields MUST use framework's `useController`:**

```typescript
// WRONG
import { useController } from 'react-hook-form';

// CORRECT
import { useController } from '@donotdev/crud';
```

**Form components receive `control` prop, not `field` prop.**

**Price field is structured:** `{ amount, currency, vatIncluded, discountPercent }`. Don't store computed discount amounts.

**File uploads are deferred** - files upload on form submit, not on selection. Images show optimistic blob URLs.

**Generated fields are excluded from forms; computed fields are shown read-only.** Fields with `editable: 'generated'` (DB-generated columns) are left out of create and edit forms and never written. Fields with `editable: 'computed'` (UI-derived values) are shown read-only by `getFieldsForOperation` (`editable: false`, `written: true`), kept in form state and written by the default writer. Use `'generated'` for PostgreSQL `GENERATED ALWAYS` columns. Use `'computed'` for fields derived from other form values.

**Entity namespace defaults to `entity-{name}`** (lowercase). Translation files must match: `locales/entity-product_en.json`.
