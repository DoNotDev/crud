# Gotchas: @donotdev/crud

Common mistakes related to entity definition, forms, fields, and CRUD operations.

---

## CRUD [Phase 2, 3]

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

**Generated/computed fields are auto-excluded from forms.** Fields with `editable: 'generated'` (DB-generated columns) or `editable: 'computed'` (UI-derived values) are silently filtered out by `getFieldsForOperation`. They won't appear in create or edit forms. Use `'generated'` for PostgreSQL `GENERATED ALWAYS` columns. Use `'computed'` for fields derived from other form values (still included in write payloads).

**Entity namespace defaults to `entity-{name}`** (lowercase). Translation files must match: `locales/entity-product_en.json`.
