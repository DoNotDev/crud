# CRUD Operations

> **API details:** `lookup_symbol("symbolName")` via MCP for full props, return types, and examples from JSDoc.

---

## 1. Define Entity (SSOT)

The entity definition drives everything - forms, lists, validation, access, search, sort, backend.

```typescript
import { defineEntity } from '@donotdev/core';

export const productEntity = defineEntity({
  name: 'Product',
  collection: 'products',
  search: { fields: ['name', 'description'] },
  defaultSort: { field: 'createdAt', direction: 'desc' },
  fields: {
    name: { name: 'name', label: 'name', type: 'text', visibility: 'guest', validation: { required: true } },
    price: { name: 'price', label: 'price', type: 'price', visibility: 'guest', validation: { required: true } },
    image: { name: 'image', label: 'image', type: 'image', visibility: 'guest' },
  }
});
```

**Import from `@donotdev/core`, never `@donotdev/core/server`.** Entity files load in the browser (Vite, Next client) and on the Next server (`llms.txt` route). The root export resolves per platform: full root in the browser, client-free server entry under Next's `react-server` condition. Vite empties `/server` imports in client bundles, so `/server` in an entity file breaks the app.

**Auto-added fields:** `id`, `createdAt`, `updatedAt`, `createdById`, `updatedById`, `status`.

**Reference fields** (`type: 'reference'`, `validation: { reference: 'brands' }`) show labels, not ids, in `EntityList` and the form combobox with no app code. `defineEntity()` registers every entity under its collection, and the reference reads the target entity with its own schema (access, visibility, field mapping). Label: `options.fieldSpecific.labelFields` or `displayField`, else the first of `name`, `title`, `label`, `displayName`. A collection with no defined entity keeps showing the raw id (dev warning).

See `lookup_symbol("defineEntity")` for all options (scope, access, ownership, uniqueKeys, validation).

### Status Field (auto-added)

The `status` field is auto-added by `defineEntity()` with sensible defaults:

| Property | Default | Can Override? |
|----------|---------|---------------|
| `type` | `'select'` | Yes |
| `visibility` | `'admin'` | Yes |
| `editable` | `'admin'` | Yes |
| `required` | `true` | Yes |

**Default options:** `draft`, `available`, `deleted` - always present, cannot be removed.
**Default value:** `available`.

If you don't define `status` in your fields at all, the full default is added automatically. If you define it, your properties are merged on top of defaults:

```typescript
fields: {
  // Minimal: just add custom options (merged after defaults)
  status: {
    validation: {
      options: [
        { value: 'shipped', label: 'Shipped' },
        { value: 'returned', label: 'Returned' },
      ],
    },
  },
  // Result: [draft, available, deleted, shipped, returned]

  // Full override: all properties respected
  status: {
    visibility: 'super',
    editable: 'super',
    validation: { options: [...] },
  },
}
```

> `draft` and `deleted` items are hidden from non-admin users (server-side filtering).

### SEO (`seo`, since 0.2.3)

`<Seo entity data>` and llms.txt title/describe a record with the card's text (`listCardFields`, formatted like the card: same `formatFieldText` from `@donotdev/core`). Override per entity:

```typescript
seo: {
  title: (item, t) => t('seo.title', { size: item.size }),   // null → no title
  description: (item, t) => null,
  // schema.org Offer availability by status; `available` → InStock built in, unmapped → omitted.
  // Read from the guest record: needs a `status` field with visibility: 'guest' (the base one is admin-only)
  availability: { promoted: 'InStock', reserved: 'SoldOut', signed: 'SoldOut' },
},
```

Full rules: `packages/ui/guidelines/SEO.md` (Entity-derived).

---

## 2. Provider Setup (once)

```typescript
// config/providers.ts
import { configureProviders } from '@donotdev/core';
import { FirestoreAdapter } from '@donotdev/firebase'; // or SupabaseCrudAdapter

configureProviders({ crud: new FirestoreAdapter() });
```

Import in `App.tsx`: `import './config/providers';`

---

## 3. Backend Functions

**Firebase:**
```typescript
// functions/src/index.ts
import { initializeApp } from 'firebase-admin/app';
import { createCrudFunctions } from '@donotdev/functions/firebase';
import * as entities from 'entities';

initializeApp();
export const crud = createCrudFunctions(entities);
```

**Supabase:**
```typescript
// supabase/functions/crud/index.ts
import * as entities from '../_shared/entities.ts';
import { createSupabaseCrudFunctions } from '@donotdev/functions/supabase';

const { serve } = createSupabaseCrudFunctions(entities);
Deno.serve(serve);
```

See the Firebase or Supabase guideline for full function setup.

---

## 4. Use Components

Drop components on a page. Entity drives the UI - no configuration needed.

```tsx
<EntityList entity={productEntity} userRole={user?.role} />
<EntityCardList entity={productEntity} basePath="/shop" cols={[1, 2, 3, 4]} />
<EntityFormRenderer entity={productEntity} operation="create" onSubmit={handleSubmit} cancelPath="/products" />
<EntityDisplayRenderer entity={productEntity} id={id} />
```

Use `lookup_symbol("ComponentName")` for full props.

**`EntityList` rows:** open-link icon (real `<a href>`, Ctrl/Cmd-click opens a tab; with `onClick` it is a button) · checkbox (bulk select; the header selects every filtered row across pages) · the list fields, **edited in their cells by default** (text, number, select, radio, reference). Checked rows take one value per field from the bulk bar, or are deleted together ("Delete selected", one `bulk({ deletes })`); Save writes every cell change in one `bulk({ updates })`; rows that fail stay pending (still marked) with an error count, saved rows leave the pending set. `editable={false}`: read-only cells, a row click opens the record.

**Nested list (parent → children)**, e.g. the products of a brand on the brand page:

```tsx
<EntityList entity={productEntity} basePath="/produits" parent={{ field: 'brandId', value: brandId }} />
```

Lists only that parent's children (server-side `where`), hides the parent column and filter; the add button opens `/produits/new?brandId=…` and `EntityFormRenderer` (create) prefills `brandId` from the URL. `parent.field` must be a `reference` field (throws otherwise). URL prefill only accepts reference fields the viewer may set on create, with an id-shaped value.

---

## 5. Visibility & Access

### Field Visibility (who sees what)

| Level | Who |
|-------|-----|
| `'guest'` | Everyone |
| `'user'` | Authenticated |
| `'admin'` | Admins |
| `'super'` | Super admins |
| `'technical'` | Admins only, read-only in forms |
| `'owner'` | Stakeholders only (see `ownership`) |
| `'hidden'` | Never |

### Entity Access (who can CRUD)

```typescript
access: { create: 'admin', read: 'guest', update: 'admin', delete: 'admin' }
```

### Ownership

For marketplace patterns. See `lookup_symbol("defineEntity")` -> `ownership`.

**Firebase:** Enforced by generated secure Firebase Functions (server-side).
**Supabase:** Enforced via RLS policies - generated by `dndev setup`.

---

## 6. Multi-Tenancy (Scope)

```typescript
registerScopeProvider('company', () => companyStore.getState().currentCompanyId);

export const clientEntity = defineEntity({
  scope: { field: 'companyId', provider: 'company' },
  // ... (companyId auto-added, all CRUD ops auto-scoped)
});
```

See `lookup_symbol("registerScopeProvider")`.

---

## 7. Data Fetching & Pagination

### Default: Auto Mode (zero config)

```tsx
<EntityList entity={productEntity} />
```

That's it. The framework handles pagination automatically:

1. **First fetch** - loads up to 1000 items client-side (instant search, sort, filter in the browser)
2. **If total > 1000** - auto-switches to server pagination (fetches one page at a time via cursor)

You never need to configure pagination mode. It just works.

### Forcing a Mode (rare)

| Mode | Behavior | When to force |
|------|----------|---------------|
| `pagination='auto'` (default) | Client-side up to 1000, auto-switches to server if more | Never - this is the default |
| `pagination='client'` | Always client-side, fetches all | You know the dataset is small and want instant filters |
| `pagination='server'` | Always server-side, cursor pagination | You know the dataset is huge and want minimal fetch |

```tsx
// Force server pagination with custom page size
<EntityList entity={productEntity} pagination="server" pageSize={50} />
```

### What Changes When Auto-Switches to Server

| Feature | Client mode (< 1000) | Server mode (> 1000) |
|---------|----------------------|----------------------|
| Search | Instant (in-memory) | Re-fetches per query |
| Sort | Instant | Re-fetches |
| Filters | Instant | Re-fetches |
| Page navigation | Instant | Fetches next page |

Server mode fetches only `pageSize` items per request - not the whole collection.

### Reading Data to Render (CSR + SSR)

Data a page **renders** comes from the read hooks, never from `useCrud` actions in a `useEffect`.
The hooks read through the CRUD cache, which the server fills during the render (Next.js SSR):
the first HTML carries the content (SEO, AI search). Effects never run on the server, so
`get(id)` / `query()` in a `useEffect` ships a loader instead of the page.

| Render | Hook |
|--------|------|
| One record (detail / edit page) | `useCrudDoc(entity, id)` - pass `null` to wait (e.g. `id === 'new'`) |
| A list (admin, filters, search) | `useCrudList(entity, options)` |
| A public list (cards) | `useCrudCardList(entity, options)` |

```tsx
// Correct: server-rendered, reactive to every edit
const { data: product, loading, notFound } = useCrudDoc(productEntity, id);

// WRONG: client-only, the server HTML is a spinner
const { get } = useCrud(productEntity);
useEffect(() => { get(id).then(setProduct); }, [id, get]);
```

**Next: who the server read is for.** The generated per-request layout (visitors with an auth cookie) passes the request's cookies to
`NextJsAppProviders` (CLI template), so server reads run as the visitor (their access token) and
the first paint is final. Nothing to do in pages.

`get` / `query` stay for imperative reads in event handlers (button click, submit, export).

---

## 8. Bulk CRUD (partial success)

For multi-row saves (editable lists, "apply to selected", reorder lists). One call, one toast. Update 100 rows: if 90 work and 10 fail, the 90 stay written and `failed` says which 10 and why.

```tsx
const { bulk } = useCrud<Event>(eventEntity);

await bulk({
  inserts: newEvents,
  updates: editedEvents.map(e => ({ id: e.id, patch: e })),
  deletes: removedEventIds,
});
// { insertedIds, updatedIds, deletedIds, failed } — written ids in input order per bucket;
// failed: [{ op: 'update', id: 'e7', error: 'Update affected 0 rows: … access denied' }]
```

**Non-negotiable semantics:**

| # | Guarantee |
|---|-----------|
| 1 | **Partial success, no rollback.** Each row succeeds or fails on its own; written rows stay written; `failed` lists the others with the reason. Supabase writes directly under RLS (no edge function): deletes `.in(id)`, inserts as one array insert, updates grouped by identical patch ("one value on N rows" = one request); rows RLS skips are reported failed. Firestore `writeBatch`, GraphQL and REST endpoints commit their batch as one unit (`failed` is empty, or the call throws). |
| 2 | **Few round-trips.** One adapter call; Supabase chunks ids (100) and runs requests 6 at a time. |
| 3 | **One toast.** Error toast with the failed count when rows failed, else success once if any op succeeded. `{ showSuccessToast: false }` suppresses the success toast. |
| 4 | **One audit entry.** `crud.bulk` with `{ inserts, updates, deletes }` counts. Anomaly detection on `bulk.deletes` fires on the bulk count, not the row count. |
| 5 | **One rate-limit hit.** Checked at entry, not per op. |
| 6 | **Validation up-front.** Inserts against `create` schema before the adapter call. |
| 7 | **Collision rejection.** Same id in `updates` + `deletes`, or `inserts` + `updates`, throws `BulkCollisionError` before any write. |
| 8 | **Empty bulk is a no-op.** `bulk({})` returns zeroed result without hitting the wire. |
| 9 | **Optimistic.** Store applies all 3 buckets; confirms the rows written, reverts only the rows in `failed`. If the call throws (batch not attempted: no session, collision), everything is reverted. |

Catch the specific error for collision handling:

```tsx
import { BulkCollisionError } from '@donotdev/core';

try {
  await bulk(ops);
} catch (err) {
  if (err instanceof BulkCollisionError) {
    // Show the user which ids conflict (err.collidingIds).
    return;
  }
  throw err;
}
```

**Concurrency**: bulk does NOT acquire per-id locks. A single-row op racing with a bulk on the same id resolves last-write-wins at the adapter. Route everything through bulk or coordinate at a higher layer if strict ordering matters.

See `lookup_symbol("BulkOperations")`, `lookup_symbol("BulkResult")`, `lookup_symbol("BulkCollisionError")`.

---

## What's Available

### Components (`@donotdev/ui`)

| Component | One-liner |
|-----------|-----------|
| `EntityList` | Table list with search, filters, pagination, routing |
| `EntityCardList` | Card grid with search, filters, favorites, routing |
| `EntityFormRenderer` | Auto-generated form from entity (create/edit) |
| `EntityDisplayRenderer` | Read-only detail view, auto-fetches by ID |
| `EntityRecommendations` | "You may also like" related items |

### Templates (`@donotdev/templates`)

| Template | One-liner |
|----------|-----------|
| `ProductCardListTemplate` | Shop card grid with price, image, sale badges |
| `CarCardListTemplate` | Automotive listing with mileage, year |
| `CarDetailTemplate` | Car detail with gallery, specs, price |
| `InquiryFormTemplate` | Contact form (Customer + Inquiry, GDPR) |
| `InquiryAdminTemplate` | Admin dashboard for inquiries |
| `HomeTemplate` | Landing page |
| `LoginTemplate` | Auth login page |
| `DashboardTemplate` | Admin dashboard |
| `CheckoutTemplate` | Stripe checkout |
| `BillingSuccessTemplate` | Post-checkout success |
| `UserSubscriptionTemplate` | Manage subscription |

### Hooks (`@donotdev/crud`)

> **Always destructure `useCrud`.** The returned object is a new reference every render.
> Individual methods (`get`, `query`, `add`, `update`) are `useCallback`-stable.
> Put destructured methods in dependency arrays, never the whole object.
>
> ```tsx
> const { query, add } = useCrud<Car>(carEntity);                 // Correct
> const onExport = useCallback(() => query({...}).then(download), [query]); // Stable dep
>
> const crud = useCrud(carEntity);                                 // WRONG
> const onExport = useCallback(() => crud.query({...}), [crud]);   // New callback every render
> ```
>
> Rendering data? Use `useCrudDoc` / `useCrudList` / `useCrudCardList`, not `get`/`query`
> in a `useEffect` (see [Reading Data to Render](#reading-data-to-render-csr--ssr)).

| Hook | One-liner |
|------|-----------|
| `useCrud` | CRUD actions: `add`, `update`, `delete`, `get`, `set`, `query`, `bulk` |
| `useCrudDoc` | One document, reactive to every edit/delete (detail pages) |
| `useCrudList` | Real-time list with search, filters, sort applied |
| `useCrudCardList` | Same as `useCrudList`, optimized for public card views |
| `useCrudFilters` | Filter state per collection, auto-consumed by list hooks |
| `useEntityForm` | Form state for custom form layouts |
| `useEntityField` | Single-field control for custom form layouts |
| `useEntityFavorites` | Local favorites (localStorage) |
| `useRelatedItems` | Fetch related items by reference field |
| `useFileUpload` | File upload with progress tracking |
| `useUnsavedChangesWarning` | Warn before leaving with unsaved changes |

### Utilities (`@donotdev/crud`)

| Utility | One-liner |
|---------|-----------|
| `formatValue` | Format any field value for display |
| `applyFilters` / `applySearch` / `applySort` | Processing pipeline (what `useCrudList` does internally) |
| `registerFieldType` | Register custom field type |
| `validateEntity` | Validate entity data against schemas |
| `isFieldEditable` / `getFieldsForOperation` | Field visibility helpers |

### Routing (`@donotdev/ui`)

| Symbol | One-liner |
|--------|-----------|
| `useNavigate` | Programmatic navigation (Vite/Next.js auto-detected) |
| `useParams` | Read route params |
| `Link` | Declarative navigation |
| `AuthGuard` | Protect routes by auth + role |

**Convention:** `/${collection}` (list) - `/${collection}/new` (create) - `/${collection}/:id` (detail/edit)

---

## Built-in Field Types

| Category | Types |
|----------|-------|
| **Text** | `text`, `email`, `tel`, `url`, `color`, `password`, `textarea`, `richtext` |
| **Number** | `number`, `currency`, `price`, `range`, `year` |
| **Boolean** | `checkbox`, `boolean`, `switch` |
| **Date/Time** | `date`, `datetime-local`, `time`, `week`, `month`, `timestamp` |
| **Selection** | `select`, `combobox`, `multiselect`, `radio` |
| **Files** | `file`, `files`, `document`, `documents`, `image`, `images` |
| **Complex** | `geopoint`, `address`, `map`, `array` |
| **Special** | `avatar`, `badge`, `hidden`, `submit`, `reset` |

**Field options placement** (as typed by `UIFieldOptions`):
- Upload types (`file`, `files`, `document`, `documents`, `image`, `images`): `options.fieldSpecific.maxSize` (bytes), `options.fieldSpecific.storagePath`. Top-level `options.maxSize` / `options.storagePath` are ignored.
- `range`: `options.showValue` (top level, not under `fieldSpecific`).

---

## Custom Field Types (escape hatch)

When built-in types don't fit, register your own with `registerFieldType`. One call wires form component + display formatter + filter.

```typescript
import { registerFieldType, useController } from '@donotdev/crud';
import type { ControlledFieldProps } from '@donotdev/crud';

function StatusTierField({ fieldConfig, control, t }: ControlledFieldProps) {
  const { field, fieldState } = useController({ name: fieldConfig.name, control });
  return (
    <select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)}>
      <option value="basic">Basic</option>
      <option value="premium">Premium</option>
    </select>
  );
}

registerFieldType({
  type: 'statusTier',
  controlledComponent: StatusTierField,
  displayFormatter: (value) => value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '-',
  filterable: true,
  filterType: 'select',
});
```

Then use in entity: `tier: { name: 'tier', label: 'tier', type: 'statusTier', visibility: 'guest' }`

Custom display formatters render cards/lists only: entity SEO (`deriveEntitySeo`, also on the Next server) shows a custom type's raw value. For a translated label in both, use the field's `options.displayValue` (or the entity `seo.title`).

See `lookup_symbol("registerFieldType")`, `lookup_symbol("ControlledFieldProps")`.

---

## i18n

**Namespace:** `entity-${entity.name.toLowerCase()}` (customizable via `namespace`).

```json
{ "fields": { "name": "Product Name", "price": "Price" }, "name": "Product" }
```

Status labels: entity namespace -> `crud` namespace fallback.

### Translated content (`i18n: true`, since 0.2.3)

Labels above are UI strings. **Record values** (a product description) are translated per field:

```typescript
description: { name: 'description', label: 'fields.description', type: 'textarea', visibility: 'guest', i18n: true },
```

- Types: `text`, `textarea`, `richtext`, `field-array`. Any other type throws when schemas are built.
- Storage: the field keeps the **default language** (`i18n.fallbackLanguage`). The other languages live in the companion `descriptionI18n` (`{ en: '…', de: '…' }`); Supabase column `description_i18n jsonb NOT NULL DEFAULT '{}'` (the SQL generator emits it; existing tables need the `ADD COLUMN`), Firestore nested map. Same visibility as the field.
- Reads: `useCrudDoc`, `useCrudList`, `useCrudCardList` (and reference labels) return the field in the **current language**. Missing or empty translation → the stored default-language value. The cache keeps stored rows, so a language switch re-renders without a request. Client sort/filter/search see the current language.
- **Edit forms: `translate: false`** (`useCrudDoc(entity, id, { translate: false })`), or the form would load a translation and save it as the default-language value.
- Writes: send `descriptionI18n` with the other fields (validated per language like the field, never required). The default language is never stored in the map.
- Column not migrated yet (Supabase): the read gets Postgres 42703, the adapter leaves that `_i18n` column out for the table, retries, and warns once. The page serves the default language, no error. Other missing columns still throw. Firestore: a document without the map is valid. GraphQL adapter: not covered (selects every schema field).
- Not translated: `useCrud().get/query` (stored rows), server sort/where (default language only), slugs.

---

**Define entity -> register provider -> register functions -> drop components. Entity is the SSOT - everything flows from it.**
