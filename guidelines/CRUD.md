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

**Field help:** `hint: 'hints.slug'` (a key of the entity namespace) puts an (i) after the field's label in entity forms: hover or focus shows the translated text, a tap pins it on touch screens. Opt-in: no `hint`, no (i). Shown by the fields with a floating label (text, textarea, number, currency, password, phone, select, combobox, multiselect, reference, year, date, timestamp, multi-text, address, price); checkbox, switch, radio, rating, range and upload fields do not show it yet.

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
**Default value:** `available`. A form, `add()` or a bulk insert is a draft only when you pass `status: 'draft'`; a draft skips `required` validation only: what is filled in keeps its format (`TOTO` is not a phone number, even in a draft).

**Validation rules (schemas from `createSchemas`):**
- **Required** = filled in: `null`, `undefined` and `''` are rejected (forms and grids store an emptied field as `null`).
- **create** (status other than `draft`): every required field filled in, every value in format.
- **draft** (`status: 'draft'`, created or edited): required fields may be empty; values in format.
- **update** (edit of a non-draft record): only the fields that change are validated (rule 2); a field left out or unchanged is not checked, so a record with a legacy empty required field saves until that field is edited. A required field the edit empties is rejected. Leaving `draft` or `deleted` for a strict status checks the whole record (rule 5).
- **CRUD rules (SSOT: `@donotdev/core`, `core/schemas/src/common/crud/`).** Every write (forms, `useCrud`, `bulk`, `bulkAcross`, child rows, server functions, entity store) goes through `prepareCreate` / `prepareUpdate` / `prepareRemove`; reads through `hiddenStatusesFor` / `isReadableBy`. No site composes a rule itself.
  **Status matrix (SSOT: `STATUS_MATRIX`, `@donotdev/types`).** One table says what each status can do: `draft` (read: admin, saveIncomplete, holdIncomplete), `available` (read: guest, isDefault), `deleted` (read: admin, holdIncomplete, isRemoved). App-added statuses behave like `available`. Code asks it (`statusCan(status, capability)`, `statusReadableBy(status, role)`, `statusesThat(capability)`), never names a status; the entity-derived types (rows, forms, inputs) read the same columns.
  1. Create validates everything. 2. Update validates what changes (a required field it sends cannot be emptied, except on a draft). 3. `delete(id)` is the hard delete; `remove(id)` the logical delete (the `isRemoved` status, nothing else validated). 4. A row is read only by roles that reach its status's `read` role. 5. A status that `saveIncomplete` saves without its required fields; leaving a status that may `holdIncomplete` for one that may not checks the whole record. 6. Apps add statuses; they are strict like `available`. 7. No status sent → the `isDefault` status; the caller overrides it (`defaultValues.status`, payload `status`). 8. Fields the entity does not have are not written and warn the user (client toast, server log). 9. Field behaviour comes from the entity (`editable`, `visibility`, `computed` / `generated`).
  An update needs the stored row (its status, and the whole-record check): writers take the caller's (`bulkAcross` update `stored`, the form's `record`), else the cache, else read it once.
- **`tel`:** international (`+` country code, 8 to 15 digits, as E.164: `+33 6 12 34 56 78`, `+33612345678`) or French national (`06 12 34 56 78`, `0612345678`, `06.12.34.56.78`); spaces, dots or dashes between digits. `validation.pattern` replaces the rule. The phone field stores `<dial code> <number>` with separators stripped and the trunk `0` dropped (`06.12.34.56.78` → `+33 612345678`); a number typed with the selected dial code (`+33 6 12…`, `+33612…`, `0033612…`) keeps one dial code, one with another `+` code is stored as typed (`+447911123456`); nothing typed, or the dial code alone (`+33`), stores `null`.
- **Error messages (entity forms):** translated, never the schemas' English or valibot's raw text (`Invalid type: Expected string but received null`). Empty value (`null`, `''`) → `crud:text.required`; a `validation.schema` message is a key of the entity namespace (`v.regex(SIRET, 'siretFormat')` → `t('siretFormat')`, a sentence or a missing key → `crud:text.invalid`); `minLength` / `maxLength` / `min` / `max` → `crud:text.minLength` / `maxLength`, `crud:number.min` / `max`; `tel` → `crud:text.phone`, `email` → `crud:text.email`, `url` → `crud:text.url`, date and time types → `crud:date.format`; anything else → `crud:text.invalid`. `createSchemas` (shared with the server) keeps its messages.

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

The Next entity page metadata (generated for a public single-param page declaring `entity: productEntity` in its PageMeta, see ui `SEO.md`) and llms.txt title/describe a record with the card's text (`listCardFields`, formatted like the card: same `formatFieldText` from `@donotdev/core`). Override per entity:

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

**`EntityDisplayRenderer` (detail page):** header (thumbnail, record name, status badge, Edit → `${basePath}/${id}/edit` and Delete for viewers with `access.update` / `access.delete`; `basePath` defaults to `/${collection}`, `hideActions` removes them), then the fields in a label | value grid grouped by `field.group`, references shown by label, empty fields as "—".

**Value formatting (`formatValue`):** money in the UI language with the currency's standard decimals ("15,50 €" / "€15.50"); list cells (`compact`) show a price's amount only (put the VAT note in the column title with `fieldColumnTitle`), booleans as a check icon, images as a 40 px thumbnail; timestamps without seconds; translated Yes / No. A `select` value with a colour is a `Badge`: built-in statuses (draft, published, available, active, deleted, archived) have one, other options declare `variant`:

```ts
status: {
  type: 'select',
  validation: {
    options: [
      { value: 'pending', label: 'status.pending', variant: 'warning' },
      { value: 'shipped', label: 'status.shipped', variant: 'success' },
    ],
  },
}
```

**`EntityList` layout:** one `<Section>` with an admin header: the title is the count wording itself (`crud:list.count`: "64 products", the entity's `namePlural` inside it; the page's in client mode, the query total in server mode; 0 rows: "0 products", the empty row says the rest; while loading `crud:messages.loading`; a failed read `crud:errors.fetchFailed`, the table replaced by the shared load-error state, the same as the joined list and the detail view: title `crud:errors.fetchFailed`, the reason from the error code `dndev:messages.*`, Retry; never the error's own message, which goes to the console), plain heading style (normal case, text colour: `titleVariant="heading"`), the Add button at the end. No separate plural title: a page that titles itself ("Products") never shows the name twice. Under it one toolbar row: search · **Filters** (badge = active filters; opens `EntityFilters` in a side sheet; `hideFilters` removes it) … Export · Refresh · the app's `actions`. Empty states, in the table's one full-width empty row: an empty collection shows `crud:list.empty` ("No products yet") + Add; no row matching the search / filters shows `crud:list.noResultsFor` ("No results for “x”") or `crud:filters.noResults`, + Clear (search and filters). A failed read shows the error + "Try again" instead of the table.

**Columns** come from the field types: image 56 px, boolean 72, date 112, timestamp 180, select / radio 120, reference 180, rating 104 (5 small stars); numbers (number, price, currency, rating, range, year) end-aligned with tabular digits; textarea / richtext on 2 lines; the first `text` field is the row's name (min 240 px, takes the free space, pinned at the inline start when the table scrolls sideways). Cells stay on one line ("…" + native tooltip with the full text). 25 rows per page by default (`useCrudPageSize`). Under 768 px the rows stack (DataTable CSS): the name on top, then "label  value" lines; with `listCardFields` only those fields (and the name) appear there.

**`EntityList` rows:** open-link icon (real `<a href>`, Ctrl/Cmd-click opens a tab; with `onClick` it is a button) · checkbox (bulk select; the header selects every filtered row across pages) · the list fields, **edited in their cells by default** (text, number, select, radio, reference, date, date-time). Date and date-time cells edit with the DatePicker / DateTimePicker: `date` as a calendar date (`YYYY-MM-DD`), `datetime-local` / `timestamp` as a wall time in the app's time zone (`i18n.timeZone`) stored as its UTC instant; paste (`2026-11-24`, `24/11/2026 14:30`) and bulk edit work as for the other types. A cell shows its formatted value as text; focusing it (click, Tab, Enter / arrows from a neighbour) opens its editor in place (Esc leaves it; typing a character, Enter or F2 reopens it). Checked rows show a selection bar in the bottom `ActionBar` ("2 selected · field · value · Apply · Delete selected · ✕"): one value per field for all of them, or deleted together (one `bulk({ deletes })`); unsaved cell edits show there too ("1 unsaved change · Discard · Save"): Save writes every cell change in one `bulk({ updates })`; rows that fail stay pending (still marked) with an error count, saved rows leave the pending set. Nothing is inserted above the table. `editable={false}`: read-only list — read-only cells, no Add, no row selection and no delete; a row click (or the open icon) opens the record. `deletable={false}` (web): no Delete in the selection bar, for records never deleted from a list (archived from their editor); editing and row selection (bulk edit) stay. The Expo `EntityList` throws on it.

**Nested list (parent → children)**, e.g. the products of a brand on the brand page:

```tsx
<EntityList entity={productEntity} basePath="/produits" parent={{ field: 'brandId', value: brandId }} />
```

Lists only that parent's children (server-side `where`), hides the parent column and filter; the add button opens `/produits/new?brandId=…` and `EntityFormRenderer` (create) prefills `brandId` from the URL. `parent.field` must be a `reference` field (throws otherwise). URL prefill only accepts reference fields the viewer may set on create, with an id-shaped value. When an edit form is open on that parent record, the list joins it instead — see [Child rows](#child-rows-saved-with-their-record).

**Overrides (optional):** `extraColumns` — app columns after the list fields, `{ key, title, render(row), align? }`, `render` gets the row with its unsaved edits applied (computed values); `actions` — app toolbar content (it can call `useChildRows` on the same entity + parent). Web only: the Expo `EntityList` throws when given either.

---

## Child rows (saved with their record)

On a record's page, its child rows (1:N, including link tables N:M with data on the link) are edited, added and removed, kept with the record's unsaved edits, and saved by the record's Save. Opt-in by usage: nothing changes for pages that do not put an editable child list next to an open edit form of its parent.

```tsx
// Zero wiring: the form's default writer saves the campaign and its products.
<EntityFormRenderer entity={campaignEntity} defaultValues={campaign} successPath={null} />
<EntityList entity={campaignProductEntity} parent={{ field: 'campaignId', value: campaign?.id ?? null }} />
```

- **Join (automatic).** The parent collection is the child field's `validation.reference`. A mounted `useEntityForm` in edit mode (also inside `EntityFormRenderer`) registers its record in `FormStore`; child rows of that record join the **latest** form opened on it (when it closes, the previous one is the target again). Joined edits live in that form's draft: autosaved, restored with it ("Draft restored" toast), reset by its Discard / `resetForm`, kept when the save fails (also after an optimistic leave).
- **`EntityList` with `parent`, joined** (the list is `editable`, the default, and an edit form is open on the parent; `editable={false}` lists never join): no own Save, delete waits for the form's Save, pending count + Discard shown in the toolbar row (not the bottom bar: the form's own footer holds its Save), every line of the parent shown (no filters section, search, export or pagination). Add, never a navigation: link table (the child has exactly one reference field besides the parent's) → dialog with `EntityFilters` (for the viewer's role, with its own filter state: the lists of that collection keep theirs) + text search + selectable list of the other side's records, deleted (`status: 'deleted'`) and already-linked ones excluded, multi-select → unsaved rows (the other side's entity must be defined with `defineEntity`, throws otherwise); any other child → one blank row (schema defaults). Without an open form on the parent: exactly the standalone behaviour above (own Save, immediate delete, add opens the create page).
- **Create mode:** `parent.value: null` (record not saved yet) → the list only shows "Create the draft before adding …" (`crud:childRows.createFirst`). Rows are added after the first save.
- **Saving.** `form.handleSubmit()` **without** `onValid` (or `EntityFormRenderer` without `onSubmit`) is the default writer: the record (update, or add on create) with the fields the form writes for the viewer (inputs editable for them, `editable: 'computed'` fields, `<name>I18n` companions; on create also the caller's `defaultValues.status` when the viewer may not edit status), plus the joined rows (inserts with pre-minted ids, updates, deletes), in **one `bulkAcross`**. **With** `onValid` the app writes as before and takes the rows' writes from `form.pendingWrites()` (one batch per child collection); if joined rows have edits and `pendingWrites()` was not read during the submit, the submit fails with an explicit error (no silent loss). `EntityFormRenderer`'s `onSubmit` has no form handle: omit it when rows join, or build the page with `useEntityForm`.
- **Validation (reactive, the record form's rules):** a grid is a shortcut onto the same records. Every add / update is checked with the CRUD rules (extension rows the same, merged with their stored extension; a missing extension: its defaults and edits): an added row with `prepareCreate`, an edited row with `prepareUpdate` on its stored row (only the changed fields, unless it is a draft or leaves draft for a visible status). Only fields the viewer can see are checked; only rows with edits. `rows.errors[rowId][fieldKey]` holds the translated message (`crud:childRows.required` / `invalidValue`); the list marks those cells (DataTable `cellErrors`). A Save with invalid rows is blocked before the optimistic leave with **one** message, the count of rows to fix (`crud:childRows.invalidRows`): the form error (formId set), else a toast; `rows.save()` rejects with it.
- **After success:** joined edits are cleared and the rows refetched, also when the save stays on the page (`successPath: null`). Edits made while the write was in flight stay.
- **Partial failure (non-atomic adapters):** after a rejected save the rows refetch; rows that were written leave the edits, rows that were not stay unsaved (same rule as the standalone list). Atomicity is the adapter's (`{ execution: 'atomic' }`) or the app's choice (app writer).
- **Entity rules:** `entity.access` gates add / edit / remove for the viewer (the form's `viewerRole`, or `useChildRows`' `viewerRole` option); only fields the viewer may write are set; drafts read back from browser storage are validated (shape, writable fields, value types, record-id shape) and edits of rows that no longer exist are dropped.

**Custom display — `useChildRows(entity, parent?, options?)`** (`@donotdev/crud`; no `parent` = every record of the entity, standalone, never joined; `options`: `viewerRole`, `extend` — see [1:1 extension](#11-extension-extend)): the same rows for any UI. Every `useChildRows` on the same form + child entity + parent sees the same rows (the page's button and the table agree).

```tsx
const rows = useChildRows(supplyOrderLineEntity, { field: 'supplyOrderId', value: order.id });
rows.items;     // saved rows + unsaved edits applied, added rows, removed rows hidden
rows.add([{ productId, unitsOrdered: 6 }]);  // returns the new ids
rows.update(id, { unitsOrdered: 12 });       // ordering: update(id, { sortOrder })
rows.remove(ids); // logical delete on Save; rows.delete(ids): hard delete
rows.discard();
rows.hasEdits; rows.pendingCount; rows.loading; rows.error; rows.access; // { create, update, delete }
rows.joined;    // true when an open form edits the parent record
rows.save();    // standalone only (no form): writes this instance's edits (one bulk; with extend one bulkAcross); throws when joined or while rows.errors is not empty
rows.errors;    // { [rowId]: { [fieldKey]: message } }, updated on every change
rows.base; rows.edits; rows.extensionFields; // table data under edits.changes, the edits, visible extension fields
```

`form.pendingWrites()` also carries the form's own 1:1 extensions (below).

App writer with joined rows:

```tsx
const form = useEntityForm(campaignEntity, { formId: 'campaign', operation: 'edit', defaultValues: campaign, viewerRole, successPath: null });
const save = form.handleSubmit(async (values) => {
  await bulkAcross([
    { collection: campaignEntity.collection, updates: [{ id: campaign.id, patch: toPatch(values) }], schemas: { update } },
    ...form.pendingWrites(),
  ]);
});
```

Standalone `useChildRows` (no form on the parent): edits stay in memory for that instance (not persisted); `save()` writes exactly the edits it snapshots in one `bulk` (partial success: rows that fail stay unsaved). On success what it sent leaves the edits at once (no wait for a refetch); edits made during the save stay pending; on failure everything stays. `useJoinedForm(entity, parent)` returns the open form the rows join, or `null`.

---

## 1:1 extension (`extend`)

A record split across two tables (e.g. `products` public + `product_offers` private, unique `productId`) is read, edited and saved as one.

```tsx
const extend = { offer: { entity: productOfferEntity, field: 'productId' } };
useChildRows(productEntity, { field: 'brandId', value: brand.id }, { extend });  // a brand's products
useChildRows(productEntity, undefined, { extend });                              // all products
useEntityForm(productEntity, { formId: 'product', operation: 'edit', defaultValues: product, viewerRole, extend });
<EntityList entity={productEntity} parent={{ field: 'brandId', value: brand.id }} extend={extend} />
```

- **Spec:** `extend: { [key]: { entity, field } }` — `field` is the extension entity's `reference` to the extended collection (throws otherwise); `key` must not contain `.` nor be a field of the extended entity. Keep the same keys while mounted (throws when they change); use the same `extend` on every `useChildRows` of the same rows.
- **Read:** one batched query per loaded set (`field in [ids]`, chunked by 30 — Firestore's `in` limit), cached under the extension collection (refetched when it is invalidated, merged with its optimistic writes). Rows get the extension under the key (`row.offer.priceExclVat`, `row.offer === null` when missing) and as flat `offer.priceExclVat` values. The form reads the edited record's extension and waits for it before initializing.
- **Fields:** extension fields are addressed with the key prefix — `offer.priceExclVat` — in `form.fields` (`FormFieldRenderer`, values under `values.offer`), list cells, edits (`rows.update(id, { 'offer.priceExclVat': 12 })`), validation, drafts and uploads. No name collisions (id, status, audit fields stay apart). The extension's id, link field, `status` and backend-generated fields are never shown nor written by the viewer. Extension fields' `conditions` read the extension's values (`RenderableField.scope`).
- **Stable ids:** every id a write mints (a new record on create, a missing extension row) is the same on repeated `pendingWrites()` calls and retries until the write succeeds (kept in `FormStore.mintedIds`, released on success / once the row is loaded), so a retry never inserts twice.
- **Write:** extension patches go in the same writes — the form's default writer and `form.pendingWrites()`, the joined rows, `rows.save()`: update of the existing extension row, or **insert of a missing one on Save** (link field = the record; schema defaults). On create the extension insert depends on the record insert (`dependsOn`): the default writer pre-mints the record id; an app writer passes it: `form.pendingWrites({ recordId })`. An added child row always gets its extension (when the viewer may create it).
- **Validation:** like the record's own fields (edit = the update schema, draft = the draft schema, insert = the create schema; a missing extension is inserted, so its required fields apply).
- **Entity rules:** a viewer without `access.read` on the extension entity gets no extension fields (same as a hidden field), never an error and never its data (nothing is read). Without `access.create` / `access.update` its fields are read-only (no insert / update).
- **`EntityList` with `extend`:** the list is a display of `useChildRows` — joined to an open parent form as above, or standalone: filters, search, pagination, export and its own Save (rows and extensions in one `bulkAcross`; deletes wait for that Save). Extension columns = the extension entity's `listFields` (all its visible fields without), prefixed. Web only (Expo throws).

---

## Custom Forms: `useEntityForm` Contract

Prefer `EntityFormRenderer` from `@donotdev/ui` for a complete entity form. Use `useEntityForm` from `@donotdev/crud` when a custom layout is needed.

**Translations are automatic. Do not pass `t` for normal framework usage.** `useEntityForm` binds `[entity.namespace, 'crud']` itself, including language changes and SSR request language. Each entity form resolves its own namespace, including several entities on one page.

```tsx
import { useAuth } from '@donotdev/auth';
import { useEntityForm } from '@donotdev/crud';

const viewerRole = useAuth('userRole');
const form = useEntityForm(productEntity, {
  formId: 'product-create',
  operation: 'create',
  viewerRole,
});
```

**Override only when intentional:** To bypass the default entity + CRUD namespace resolution, supply your own `t`. It replaces the default translator completely; it is not merged with it.

```tsx
const { t: tCustom } = useTranslation('custom-form');
const form = useEntityForm(productEntity, {
  formId: 'product-custom',
  operation: 'create',
  viewerRole,
  t: tCustom,
});
```

- **Each entity gets its own translator automatically.** A page editing shop settings and admin settings needs no translation wiring for either form.
- **Pass `form.t` to field renderers.** `FormFieldRenderer` takes `name`, `config`, `control` and `t`; `DisplayFieldRenderer` takes `name`, `config`, `value` and `t`. Labels, hints, select options and field-array child fields need the same entity translator. Never copy entity strings/options into page locales to hide a missing `t`.
- **Pass the real `viewerRole`.** Omission means `'guest'`, not the signed-in user's role: a guest form writes only guest-visible fields. Use the returned fields' `editable` / `written` flags and `useFieldConditions` for live visibility/required/disabled/readonly conditions in custom layouts.
- **Form state = the fields the form writes** (`FormValues<E, Op>`, from the entity descriptor): inputs editable for the viewer and operation, `editable: 'computed'` fields, their `<name>I18n` companions, and `id` on edit. Generated, `editable: false` and role-denied fields never enter form state, the local draft or the payload; `form.getValues('<such field>')` is `undefined`. Technical fields (`visibility: 'technical'`) never enter it on create; on edit only a technical field with a role in `editable` (`editable: 'admin'`) does, for a viewer who sees technical fields (admin and above) and holds that role (an optional key in `FormValues<E, 'edit'>`); technical fields with `editable` unset / `true` / `'create-only'` never do. So the scope field (`entity.scope`: technical, `create-only`) is never in form state: the save injects it (`injectScope`). With `extend`, each 1:1 extension's values sit under its key (`values.offer`, typed `FormValues<E, Op, X>`: the extension's written fields without its link field and `status`, with `id` when its row exists; key optional). The resolver validates and outputs only these fields, so `handleSubmit(onValid)` passes `onValid` a `FormValues<E, Op, X>`; `EntityFormRenderer`'s `onSubmit` / `onSecondarySubmit` get the same projection. Form state (React Hook Form's `TFieldValues`: `control`, `watch`, `getValues`, `setValue`, `onInvalid`'s errors) is typed `EntityFormState<E, X>` = `FormValues<E, FieldOperation, X>` (both operations); `Op` keys only the submitted values (RHF's `TTransformedValues`: `onValid`'s argument). RHF's types are invariant in their field values and covariant in the submitted ones, so every form of `E`, `create` or `edit`, is an `EntityFormReturn<E>`: helpers take `<E extends AnyEntity>(form: EntityFormReturn<E>)`, components typed `control: Control<EntityFormState<E>>` take its `control`; a helper taking a form with `extend` declares `X` (`EntityFormReturn<E, FieldOperation, X>`). `useEntityField`, `useFieldConditions` and `FormFieldRenderer` take any form of `E`.
- **`form.record`** is the stored row the edit started from (`defaultValues` on edit, 1:1 extension rows under their key; `undefined` on create). It is saved with the local draft and restored with it: read a concurrency token from `form.record` (`form.record?.revision`), not from form state, so a restored draft keeps its base version. A restored draft whose base row's `updatedAt` differs from the stored row's is a **conflict**: a persistent warning (`crud:draft.conflict`) with Discard; `form.record` stays the draft's base, so a revision-checked save refuses instead of overwriting. A draft saved for edits made after a successful save has no base row: on return, the stored row is the base. Display fields the form does not write from `form.record` (`EntityFormRenderer` does: technical, `editable: false` and role-denied fields read-only from the record; computed fields read-only from form state).
- **`defaultValues`:** on edit the stored row as read (`InferEntityRow<E>`, accepted as-is: no `?? ''` needed); on create `Partial<CreateInput<E>>` (caller defaults, e.g. `status: 'draft'`, a parent reference).
- **`editable: 'computed'`** fields are shown read-only and written: the value a field component sets with `setValue` is saved by the default writer and passed to `onValid`.
- **Give each form a stable, unique `formId`.** This scopes drafts, upload orchestration and form status; several forms on one page must not share it.
- **Edit stored values.** Read with `useCrudDoc(entity, id, { translate: false })` before passing `defaultValues`; do not save translated record content back as the default-language value.
- **Submit through `form.handleSubmit`.** It validates/orchestrates the form; your submit callback performs the CRUD write (or omit it: `form.handleSubmit()` is the default writer, record + joined child rows in one `bulkAcross` — see [Child rows](#child-rows-saved-with-their-record); with a callback, add `form.pendingWrites()` to your write when child rows join the form or `extend` is set; record + 1:1 extensions with `extend`, see [1:1 extension](#11-extension-extend)). Reject on a failed write so submission does not acknowledge it as saved. Success acknowledges the editor snapshot taken before async validation, with pending upload previews replaced by the submitted stored assets. Upload normalization alone stays clean; later edits (including changes to upload fields) stay visible, dirty and in the local draft. Right before your callback runs, the editor is written to the local draft (no 3s autosave wait), so a rejected write keeps every edit even if the page has unmounted; success clears it.
- **Saving leaves the page by default (optimistic).** Once validation and uploads pass, the form navigates to `successPath` before your callback runs: omitted = the previous breadcrumb (nearest existing parent route, else `/`), a path = that path. If the callback rejects, it navigates back to the page it left and the draft restores the edits. Same option on `EntityFormRenderer` (`successPath`). Router access comes from `@donotdev/ui` (`UIProviders` fills crud's `FormNavigationProvider`); without it the form stays. Pass `successPath: null` to stay: dialogs, wizards, settings pages, create flows that open the new record, pages with other unsaved state (e.g. pending table edits), and **every** form of a nested submit (leaving unmounts the inner form and cancels its save). Per submit: `form.handleSubmit(onValid, onInvalid, { successPath })` overrides the hook option for that submit (key present wins, `undefined` = previous breadcrumb) — e.g. Save on a draft passes `null`, Publish on the same form passes nothing.
- **Validation timing: `mode` (default `'onTouched'`).** A field shows its first error when the user leaves it, then re-validates on every change: the fix clears the error while typing ("reward early, punish late"; React Hook Form `onTouched`). A submit validates every field and focuses the first invalid control (DOM order, hidden / disabled skipped) and scrolls it into view. Override per form: `useEntityForm(entity, { mode: 'onBlur' | 'onChange' | 'onSubmit' | 'all' })`.
- **Field messages: one slot per field (`FieldMessage`, `@donotdev/components`).** Every built-in field renders its helper text and its error in the same slot under the control, the error in place of the helper text (icon + text); a field without helper text gets the line only when an error appears. The control gets `aria-invalid` and `aria-describedby` to the slot; the slot is a polite live region mounted from the first render, so the error is announced. A custom field type renders `<FieldMessage id error={fieldState.error?.message} />` and spreads `fieldMessageAria({ id, error })` on its control.
- **Toasts are opt-out.** A submit that fails validation toasts the fields to correct, and a restored draft toasts "Draft restored"; `useEntityForm(entity, { toasts: false })` drops both (field messages, the scroll to the first one and the draft restoring stay), e.g. a form in a sheet. Success toasts: `{ showSuccessToast: false }` per mutation, `useCrudStore.getState().setHideSuccessToasts(true)` globally.
- **Page state saved by the same Save goes in the form's draft.** `const [ids, setIds] = useFormDraftState(form, 'productIds', initialIds, { parse })` is `useState` kept in the form's draft: autosaved with it, written at submit, restored with the form ("Draft restored" toast), reset by Discard / `resetForm`, cleared on success, kept on failure (also after the page left optimistically). Use it for product lists or pending table edits a page Save writes; values must be JSON. A value different from `initial` is an edit (it keeps the draft like a dirty field). `parse` (required) validates the value read back from browser storage (untrusted, possibly from an older page version) and may adjust it (e.g. drop pending edits that already equal the loaded record); if it throws, the slot keeps `initial` and a warning is logged.
- **A draft exists only while the page holds edits.** Edited = a field dirty in React Hook Form (against `defaultValues`, which always stay the base: the stored record on edit, the caller/schema defaults on create), a `useFormDraftState` slot different from its initial value, or joined child rows with edits. Autosave and the submit-time save write the draft only then, and clear it otherwise. A restored draft is applied as dirty edits on top of the base (`isDirty` / `dirtyFields` are right at once); one with no edit against the base is cleared without a toast.
- **Create defaults do not disable drafts.** With `operation: 'create'`, caller defaults override schema defaults, then restored drafts merge onto that base (nested objects merge; arrays replace). Discard restores the schema/caller base. Draft autosaving is browser-local only, including edits made while a submission is pending; it performs no CRUD writes. Leaving the page (unmount) writes a pending 3s autosave immediately, so an accidental leave keeps the last edits; the "Draft restored" toast offers Discard on return. There is no leave-time prompt.

**GOTCHA:** Do not override `t` with the page translator merely because it is in scope. That bypasses the entity namespace. Use the returned `form.t` for entity fields; keep the page's translator for page headings and actions.

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

**Missing record on Vite.** While `notFound` is true for the record the URL names, `useCrudDoc` adds `<meta name="robots" content="noindex">` to the document head (removed when the record shows up or the component unmounts): a client-rendered app answers every URL with HTTP 200, so crawlers must not index the not-found state. The record the URL names: the current route (route manifest, language prefix stripped, matched by `matchRoute` from `@donotdev/core`, the AutoMetaTags matcher: a static route of the same path wins) declares the entity in its PageMeta (`entity: productEntity` → `meta.entity`, the collection read) and one of its `:param` values is the `id` read (`/produits/:id`, `useCrudDoc(productEntity, id)`). A secondary read on the page (a missing brand on a valid product page, any read on a route without `entity`) never adds it. Next adds nothing: its entity pages answer a missing record with a real 404 (`notFound()`, see ui `SEO.md`).

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

### Cross-collection `bulkAcross`

**Toasts:** one success toast `crud:messages.updateSuccess` named after the first batch's collection (the primary record, like `bulk`), or `options.successMessage` (translated by the caller); the error toast is named the same way.

By default `bulkAcross(batches, options?)` is ordered partial-success bulk, **not a database
transaction**. Each batch supplies its collection, schemas and optional
`dependsOn`; independent batches run in parallel waves. Success returns
`{ results: Record<string, BulkResult> }` unchanged.

A rejection or non-empty `failed` stops subsequent waves. All bounded timeout
outcomes in the started wave settle before all optimistic changes are reverted;
only then are collections invalidated/refetched. Raw attempts are observed, not
awaited indefinitely. Any raw attempt settling after rollback or successful
confirmation queues an authoritative refetch, serialized behind initial/late
refetches, with no stale optimistic patches. Late refetch errors are caught and
reported, never substituted for the original write error. The call rejects through
the existing `handleError` normalization (not guaranteed error identity), rather
than returning partial results. Written rows remain written: a product insert
survives a dependent offer failure. Optimistic rollback is not database rollback.
Refetch failures cannot guarantee a fresh cache.

Cross-collection bulk writes use the existing timeout without automatic retry:
a timeout/network failure may have committed already. Late reconciliation prevents
stale cache races, not duplicate writes; do not blindly resubmit the whole operation. A forever-pending
raw attempt does not delay caller completion/loading cleanup after bounded outcomes
and initial refetches; its commit status remains unknown until settlement. Refetch
completion behavior is unchanged. Global retry policy/provider guarantees are
separate preexisting work.

For a single database commit, request `{ execution: 'atomic' }`. The configured
adapter must advertise the atomic capability or the call rejects before optimistic
changes, including for empty requests. The service preflights the complete request,
then executes its snapshot-bound plan once without retry; legacy void preflight uses
`execute(prepared)`. Malformed non-void plans reject before optimism.
`AtomicBulkError.outcome` is `not-committed` only
when definitive; `unknown` requires authoritative reconciliation, not replay.
Pre-mint referenced IDs; no automatic reference remapping occurs. Provider-owned
emulator and security-rule tests remain the gate for deployment guarantees. See
`docs/architecture/BULK_ACROSS.md`.

**F05 — request-aware acknowledgements.** `validateBulkOutcome` uses additive
`BulkOutcomeSchema` to preserve per-row `failed` (insert index; update/delete ID)
and checks exactly one outcome per submitted operation, counts, multiplicity and
update/delete order before confirmations or downstream waves. Omitted `failed`
is legacy complete-success only after those checks; malformed/incomplete replies
mean unknown commit status, not proof of rollback. Cleanup removes this call's
pending optimistic entries before authoritative refetch; original write errors
must survive reconciliation errors. Functions/REST/GraphQL decoding preserves
failures when present. The legacy GraphQL selection/SDL exposes only success ID
arrays: partial replies without failure identities reject, rather than silently
succeed. Server-generated insert ID correspondence/order remains unprovable
without an input-index echo; explicit insert IDs are not a universal provider
guarantee. F05 does not close these legacy provider protocol gaps.

---

## 9. Filters (`EntityFilters`, `useCrudFilters`, `applyFilters`)

`EntityFilters` (`@donotdev/crud`) builds one filter per filterable field of `fieldsToFilter` (default: `listFields`, else all fields) visible to `viewerRole`, and reads/writes the filter state of `useCrudFilters({ collection: filterKey ?? entity.collection })`. `useCrudList` / `useCrudCardList` (and `EntityList` / `EntityCardList`) apply the state of their collection with `applyFilters`: every field filter must match (AND across fields).

**Matching per filter type** (`getFilterType(field.type)`, `matchesFilter`):

| Filter type | Field types | UI | Match |
|---|---|---|---|
| `select` | `select`, `combobox`, `radio`, `boolean`, `checkbox`, `switch` | Multi-select of `validation.options` (translated labels; else the values in the data) | Exact, case-sensitive value; several selected values = OR (`['serum', 'essence']`) |
| `multiselect` | `multiselect` | Multi-select of `validation.options` | Any of the row's items is selected (`['dry','oily']` matches `['oily']`) |
| `reference` | `reference` (custom types with `validation.reference`: register `filterType: 'reference'`) | Multi-select of the ids in the data, labelled like list cells (`useReferenceResolver`: `labelFields` / `displayField`; raw id until resolved or when the document is unknown) | Exact id; several = OR |
| `text`, `address` | text-like types, `address` | "Contains" text input (applies 250ms after typing stops; emptied = no filter) | Case-insensitive substring (`address`: of `formatted_address`) |
| `range` | number, price (`amount`), date, year... | Min/max | Inclusive; min-only excludes empty values, max-only keeps them |
| `rating` | `rating` | Stars, under the same floating label as the other filters | At least the value |

Every filter takes one cell of the grid (a range shows min and max side by side; no filter spans two columns). With active filters, their chips show above the grid, followed by a small link-style "Clear all filters" (`crud:filter.clearAll`); there is no Clear button otherwise.

Options are counted per stored value from the rows matching the other filters (array values: per item) and disabled at 0. Chips show the option's translated label / the reference's resolved label. A multi-select shows its selection: the label of one value, `filters.selected` (`{{count}} selected`, pluralised) for several. A filter state value may be a string or an array for option fields (`setFilters({ type: 'toner' })` still works); `EntityFilters` writes arrays.

**Wildcard value** (`field.filter.wildcard`, since 0.3.0): a stored value meaning "every option".

```typescript
skinTypes: { name: 'skinTypes', type: 'multiselect', filter: { wildcard: 'all' }, validation: { options: [...] }, ... }
```

`all` is not offered as a filter choice; a row holding it (value or array item) matches any selection of that field and counts for every option. Applies to `select`, `multiselect` and `reference` filters (`applyFilters`, `EntityFilters`; direct `matchesFilter` callers pass `field.filter` as 4th argument).

**URL sync** (since 0.3.0): a filter state syncs with the URL when its key is the collection of an entity defined with `defineEntity` (the page list's state). Pickers and dialogs with a custom `filterKey` never touch the URL.

| | |
|---|---|
| Write | `setFilters` → `history.replaceState` after 500ms (router state and hash kept), dropped if the page changed meanwhile. Only the entity's own `f_*` params are rewritten. |
| Read | Page mount (`useCrudFilters` effect: render never writes the store; the first client render already shows the URL's filters), and every URL change: back/forward, router navigations, links (Navigation API `currententrychange`; without it, `popstate` + mount). A URL without params clears the state. Server render and hydration: no filters (no hydration mismatch), the URL's apply right after. |
| Format | `f_<field>=<value>` percent-encoded (commas safe). Option fields (`select`, `multiselect`, `reference`): one param per value, always read back as an array (`?f_type=serum&f_type=essence`). Ranges: `f_<field>_min` / `f_<field>_max`. Text: one param, a string. Field types decide, not the value. |
| Opt-out / in | `useCrudFilters({ collection: 'products', urlSync: false })` (or `<EntityFilters urlSync={false} />`); a custom key: `<EntityFilters filterKey="products#dialog" urlSync />` (`useCrudFilters` needs `entity` then). Store level: `useCrudStore.getState().setFilterUrlSync(key, entity \| null)`. |

One URL-synced state per page: another collection's list on the same page reads the same `f_<field>` params when field names coincide (e.g. `f_status`); set `urlSync: false` on it.

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
| `useCrudFilters` | Filter state per collection (URL-synced for entity collections, see [Filters](#9-filters-entityfilters-usecrudfilters-applyfilters)), auto-consumed by list hooks |
| `useEntityForm` | Form state for custom form layouts |
| `useChildRows` | A record's child rows, joined to the form open on it and saved by its Save |
| `useEntityField` | Single-field control for custom form layouts |
| `useEntityFavorites` | Local favorites (localStorage) |
| `useRelatedItems` | Fetch related items by reference field |
| `useFileUpload` | File upload with progress tracking |
| `useUnsavedChangesWarning` | Warn before leaving with unsaved changes |

### Utilities (`@donotdev/crud`)

| Utility | One-liner |
|---------|-----------|
| `formatValue` | Format any field value for display (UI-language money, status badges, compact list-cell forms) |
| `applyFilters` / `applySearch` / `applySort` | Processing pipeline (what `useCrudList` does internally); `matchesFilter` one value ([Filters](#9-filters-entityfilters-usecrudfilters-applyfilters)) |
| `registerFieldType` | Register custom field type |
| `validateEntity` | Validate entity data against schemas |
| `isFieldEditable(entity, field, role, op)` / `getFieldsForOperation` | Field editability / form fields, from the entity descriptor |

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

Then use in entity, with its value shape: `tier: { name: 'tier', label: 'tier', type: 'statusTier', visibility: 'guest', validation: { schema: v.picklist(['basic', 'premium']) } }`

`registerFieldType` is UI-only (client code, invisible to server functions and generators): the entity says the stored value. A custom type needs `validation.schema` (Valibot schema of the stored value) or `validation.reference` (referenced collection: the value is an id). Without either, `defineEntity` throws, naming `entity.field`. Value order, everywhere: `validation.schema` > `validation.reference` > built-in type (`BUILTIN_VALUES`, `@donotdev/core`).

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
