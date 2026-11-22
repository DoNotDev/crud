# CRUD Components Reference

**Import:** `@donotdev/crud`

---

## Hooks

### useCrud
CRUD actions (add, update, delete, get, subscribe). Holds no document: read with `useCrudDoc` or `get()`.

```tsx
const { add, update, delete: remove, get, loading, error } = useCrud(carEntity);
await add({ name: 'Tesla', year: 2024 });
await remove('doc-id');
```

### useCrudDoc
One document, reactive: re-renders on every edit or delete of it, anywhere in the app (shared cache). For detail/view pages.

```tsx
const { data: car, loading, notFound, error } = useCrudDoc(carEntity, carId);
```

### useCrudList
Paginated list with automatic loading. For data tables.

```tsx
const { items, loading, refresh } = useCrudList(productEntity);
```

### useCrudCardList
Card-based list with infinite scroll.

```tsx
const { items, loading, refresh } = useCrudCardList(articleEntity);
```

### EntityFilters / useCrudFilters
Filter panel for an entity: option fields (select, radio, multiselect, reference) are multi-select with exact matching, text fields substring, numbers/dates ranges. The lists of the collection apply the same state; it syncs with the URL (`?f_type=serum&f_type=essence`).

```tsx
<EntityFilters entity={productEntity} data={rows} fieldsToFilter={['type', 'skinTypes', 'brandId']} />
const { items } = useCrudCardList(productEntity); // filtered by that state

// Picker: own state, not in the URL
<EntityFilters entity={productEntity} filterKey="products#picker" />
const { filters } = useCrudFilters({ collection: 'products#picker' });
```

Matching per field type, `filter.wildcard`, URL format and opt-in/out: CRUD.md "Filters".

---

## Form Components

### EntityFormRenderer
Auto-render full entity form from definition. Import from `@donotdev/ui`; it supplies the entity translator and viewer role automatically.

```tsx
<EntityFormRenderer
  entity={productEntity}
  operation="create"
  onSubmit={handleSubmit}
/>
```

`onSubmit` is optional: without it the default writer saves the record (update, or add on create) plus the child rows joined to the form (nested `EntityList` on this record) in one `bulkAcross`. See CRUD.md "Child rows". `onSubmit` / `onSecondarySubmit` receive the fields the form writes (typed `FormValues<E, Op>`: `E` from `entity`, `Op` from `operation`, both operations when omitted), not the whole row; `defaultValues` is typed `EntityFormDefaultValues<E, Op>` (the stored row on edit, `Partial<CreateInput<E>>` on create). Fields the viewer cannot edit render read-only: computed ones from form state, the others (technical, `editable: false`, role-denied) from the stored record.

### FormFieldRenderer
Render single field. Used inside custom forms.

```tsx
<FormFieldRenderer name={field.name} config={field.config} control={form.control} t={form.t} />
```

Built-in uncontrolled adapters translate their labels with the supplied `t` before rendering visual components, including submit/reset buttons in controlled forms. Custom adapters still receive raw label/config keys plus `t` and own their label translation.

`field-array` add/remove accessible names and the missing-subfields diagnostic use `crud:fieldArray.*` keys through the supplied translator; child fields keep the entity translator.

`onlyOptions` offers a subset of a select/multiselect/radio/combobox field's declared options, in the given order (e.g. the reasons a person may record; the database writes the others). Display only: validation still accepts every declared value. Unknown value or no static options = throws.

```tsx
<FormFieldRenderer name="reason" config={config} control={form.control} t={t}
  onlyOptions={['breakage', 'loss', 'theft']} />
```

### EntityList
Data table for entity collection.

```tsx
<EntityList entity={userEntity} onRowClick={(user) => edit(user.id)} />
```

`editable` edits the list in place (text, number, select, radio, reference fields the viewer may edit; references as dropdowns). Check rows to set one field on all of them; paste blocks from Excel. Save = one `bulk({ updates })`. `editable={false}`: read-only (no Add, no selection, no delete).

`parent={{ field, value }}` lists one record's children. When `editable` (default) and an edit form is open on that record, the rows join it (no own Save; the form's Save writes them; link tables add through a picker); `value: null` shows "Create the draft before adding …". Joined lists show every line (no filters section, search, export or pagination). `extraColumns` (app columns from the edited row) and `actions` (toolbar content) are optional overrides. `extend={{ offer: { entity: productOfferEntity, field: 'productId' } }}` adds a 1:1 extension's columns (`offer.price`), edited and saved with the rows. See CRUD.md "Child rows" and "1:1 extension".

```tsx
<EntityList entity={productEntity} editable />
```

### EntityCardList
Card grid for entity collection.

```tsx
<EntityCardList entity={productEntity} renderCardOverlay={(item) => item.featured ? <Badge>…</Badge> : null} />
```

Cards are `CrudCard`s laid out by the entity's `listCardFields` (title / subtitle / content / footer slots); there is no `renderCard` prop. Opt-in feed: `pageSize={12}` renders the first 12 cards (server HTML included), then 12 more each time the end of the grid nears the viewport, until every card is shown. Without `pageSize`, every card renders at once. Data is still fetched in one go, so this only trims rendering and hydration, and cards past the first page are not in the server HTML. A fully custom card: `useCrudCardList` (+ `EntityFilters`) and your own grid.

### SortableCardList
Cards in a grid the user re-orders before saving (routine steps, ranked selections). Drag the whole card (mouse; touch after a 200 ms hold); the card's own buttons and links stay clicks. With `handleOnly` (cards that are links or buttons), only the grip drags. Keyboard: Space/Enter on the grip, arrows, Space/Enter (Escape cancels). Each card's bar: grip, move-before / move-after, and a remove (X) button at the end with `onRemove`. Screen readers get translated instructions and pick-up / move / drop announcements. Stateless: the caller owns `items` (unique ids) and saves the order received in `onReorder`. Labels come from the `crud` namespace (`sortable.*`); `itemLabel` names each item for them.

```tsx
<SortableCardList
  items={productIds}
  onReorder={setProductIds}
  onRemove={(id) => setProductIds(productIds.filter((p) => p !== id))}
  itemLabel={(id) => byId.get(id)?.name ?? id}
  renderItem={(id, index) => <Card title={`${index + 1}. ${byId.get(id)?.name}`} />}
/>
```

| Prop | Default | |
|---|---|---|
| `items: readonly string[]` | required | Ids in their current order |
| `onReorder: (items: string[]) => void` | required | New order after a drag or a move button |
| `renderItem: (id, index) => ReactNode` | required | Card content |
| `itemLabel: (id) => string` | required | Accessible item name for the grip, buttons and announcements |
| `onRemove?: (id) => void` | none | Adds the remove (X) button at the end of the bar |
| `handleOnly?: boolean` | `false` | Only the grip drags (mouse, touch): for cards that are links or buttons |
| `disabled?: boolean` | `false` | No dragging, buttons disabled |
| `cols?: GridCols` | `[1, 2, 3, 4]` | Grid columns |

---|---|---|
| `items: readonly string[]` | required | Ids in their current order |
| `onReorder: (items: string[]) => void` | required | New order after a drag or a move button |
| `renderItem: (id, index) => ReactNode` | required | Card content (remove button included, if any) |
| `itemLabel: (id) => string` | required | Accessible item name for the handle and move buttons |
| `disabled?: boolean` | `false` | No dragging, move buttons disabled |
| `cols?: GridCols` | `[1, 2, 3, 4]` | Grid columns |

---

## Form Building Blocks

For custom layouts, use `useEntityForm`. It automatically resolves translations from `[entity.namespace, 'crud']`; the signed-in viewer role must still be supplied:

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

**No `t` option required:** Each form resolves its own entity namespace, with shared CRUD labels and language/SSR support. Pass the returned `form.t` to every `FormFieldRenderer` / `DisplayFieldRenderer`. Supply `options.t` only to intentionally bypass the default entity + CRUD namespace resolution with your own translator; it fully replaces the default. Never duplicate entity labels/options in page locales.

Use stable, unique form IDs; respect field editability and live `useFieldConditions`; submit writes through `form.handleSubmit`. See CRUD → Custom Forms for the complete contract.

| Export | Purpose |
|--------|---------|
| `useEntityForm` | React Hook Form wrapper for entities |
| `useEntityField` | Single field hook |
| `getFieldsForOperation` | Form fields for create/edit (`editable`, `written`), from the entity descriptor |
| `validateEntity` | Validate data against entity schema |
| `isFieldEditable` | `isFieldEditable(entity, field, viewerRole, op)`: whether the field is an input |

---

## Field Types (Built-in)

Field components are auto-rendered by `FormFieldRenderer`. You don't import them directly.

### Text Inputs
- `text` - Single-line text input
- `email` - Email input with validation
- `tel` - Phone number input
- `url` - URL input
- `color` - Color picker
- `password` - Password input (masked)
- `textarea` - Multi-line text input
- `richtext` - Rich text editor

### Numbers
- `number` - Numeric input
- `range` - Slider input
- `rating` - Star rating input (1-5, configurable max)

**Rating + comment (e.g. reviews):** Use two fields on the same entity - `rating` (type `rating`) for stars and `comment` (type `textarea`) for the text. The form renders them as separate rows; no composite field type needed.

### Boolean
- `checkbox` - Checkbox input
- `boolean` - Alias for checkbox
- `switch` - Toggle switch

### Dates & Time
- `date` - Date picker
- `datetime-local` - Date and time picker
- `time` - Time picker
- `week` - Week picker
- `month` - Month picker
- `timestamp` - Timestamp (Firestore Timestamp)

### Selection
- `select` - Dropdown select
- `combobox` - Searchable dropdown
- `multiselect` - Multiple selection dropdown
- `radio` - Radio button group

### Files & Media
- `file` - Single file upload
- `files` - Multiple file uploads
- `document` - Document upload (PDF, etc.)
- `documents` - Multiple document uploads
- `image` - Single image upload
- `images` - Multiple image uploads

### Complex Types
- `geopoint` - Geographic coordinates (lat/lng)
- `address` - Address input with autocomplete
- `map` - Map picker
- `array` - Array of text inputs

### Special
- `avatar` - Avatar image upload
- `badge` - Badge display
- `hidden` - Hidden field (not displayed)
- `submit` - Submit button (uncontrolled)
- `reset` - Reset button (uncontrolled)

To add custom field types:
```tsx
import { useController, registerFieldType } from '@donotdev/crud';
import type { ControlledFieldProps } from '@donotdev/crud';

// Custom controlled component MUST use framework's useController (not react-hook-form's)
function ScoreField({
  fieldConfig,
  control,
  errors,
  t,
  onChange
}: ControlledFieldProps) {
  // REQUIRED: Use framework's useController - ensures type compatibility
  const { field, fieldState } = useController({
    name: fieldConfig.name,
    control: control,
  });

  return (
    <div>
      <label>{t(fieldConfig.label)}</label>
      {/* Use field.value and field.onChange */}
      <input
        type="number"
        value={field.value ?? 0}
        onChange={(e) => {
          const value = Number(e.target.value);
          field.onChange(value);
          onChange?.(value);
        }}
        min={0}
        max={10}
      />
      {fieldState?.error && (
        <span className="error">{fieldState.error.message}</span>
      )}
    </div>
  );
}

registerFieldType({
  type: 'score',
  controlledComponent: ScoreField,
});
```

**Important:**
- Custom controlled components receive `control` prop, NOT `field` prop
- You must use **framework's `useController`** (from `@donotdev/crud`), NOT `react-hook-form`'s useController
- This ensures type compatibility - no type assertions needed

---

## Service & Store

Direct access (rarely needed):

```tsx
import { getCrudService, useCrudStore } from '@donotdev/crud';

const service = getCrudService();
await service.query('products', { where: [['active', '==', true]] });
```

---

## Collection Utilities

```tsx
import { loadDeterministicRange, upsertDeterministic, appendToCollection } from '@donotdev/crud';
```

| Utility | Purpose |
|---------|---------|
| `loadDeterministicRange` | Paginated loading with deterministic IDs |
| `upsertDeterministic` | Insert or update with deterministic ID |
| `appendToCollection` | Add to collection end |

---

**JSDoc in IDE** - Hover over any import for full props and examples.
