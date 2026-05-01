# DoNotDev CRUD

Complete CRUD operations and form components for DoNotDev framework.

## Quick Start

```typescript
import { useCrud, EntityFormRenderer } from '@donotdev/crud';

// Data operations (requires configureProviders({ crud: adapter }) at app startup)
function UserList() {
  const { data, loading, query } = useCrud('users', {
    schema: UserSchema
  });

  useEffect(() => {
    query({ limit: 10 });
  }, []);

  return <div>{/* Render users */}</div>;
}

// Form rendering
function UserForm() {
  const { add } = useCrud('users', { schema: UserSchema });

  return (
    <EntityFormRenderer
      entity={UserEntity}
      onSubmit={async (data) => {
        await add(data);
      }}
    />
  );
}
```

## Architecture

### 4-Layer Architecture

```
useCrud (React entry point)
    ↓
CrudService (Complete orchestrator)
    ↓
Backend Adapter (FunctionsAdapter | FirestoreAdapter)
    ↓
Backend SDK (Firebase Functions | Firestore SDK)
```

### Package Structure

- **Form Components** (`@donotdev/components/form/fields`) - Pure UI components without react-hook-form
- **Controlled Components** (`@donotdev/core/crud`) - React Hook Form wrappers
- **Form Renderers** (`@donotdev/crud`) - High-level form components (EntityFormRenderer, FormFieldRenderer)
- **Data Layer** (`@donotdev/crud`) - useCrud hook, CrudService, CrudStore

## Usage

### useCrud Hook

```typescript
const {
  data,
  loading,
  error,
  get,
  set,
  update,
  delete: deleteDoc,
  add,
  query,
} = useCrud('users', {
  schema: UserSchema,
});

// Get single document
const user = await get('user123');

// Create document
await add({ name: 'John', email: 'john@example.com' });

// Update document
await update('user123', { name: 'Jane' });

// Delete document
await deleteDoc('user123');

// Query collection
const users = await query({ limit: 10, orderBy: 'createdAt' });
```

### EntityFormRenderer

```typescript
const UserEntity = {
  name: {
    name: 'name',
    type: 'text',
    label: 'Name',
    required: true
  },
  email: {
    name: 'email',
    type: 'email',
    label: 'Email',
    required: true
  }
};

<EntityFormRenderer
  entity={UserEntity}
  onSubmit={async (data) => {
    await add(data);
  }}
/>
```

## Dependencies

- `@donotdev/core` - Core utilities and types
- `@donotdev/components` - UI components
- `@donotdev/firebase` - Firebase provider
- `react-hook-form` - Form state management

## Backend Adapters

### FirestoreAdapter (`@donotdev/firebase`)

Direct Firestore SDK operations with real-time subscriptions.

```typescript
import { FirestoreAdapter } from '@donotdev/firebase';
configureProviders({ crud: new FirestoreAdapter() });
```

**When to use:** User preferences, settings, prototyping without functions.
**When NOT to use:** Production data requiring server-side security — use `FunctionsAdapter` instead.

### FunctionsAdapter (`@donotdev/crud`)

Callable functions adapter (Firebase Cloud Functions or Supabase Edge Functions).

```typescript
import { FunctionsAdapter } from '@donotdev/crud';
configureProviders({ crud: new FunctionsAdapter() });
```

Server generates technical fields and enforces security rules. Use for production data requiring validation, auth checks, and audit logs.

### SupabaseCrudAdapter (`@donotdev/supabase`)

Direct PostgREST access with RLS-based security.

```typescript
import { SupabaseCrudAdapter } from '@donotdev/supabase';
configureProviders({ crud: new SupabaseCrudAdapter(supabaseClient) });
```

DB-level security via Row Level Security and column grants. Field name mapping (camelCase ↔ snake_case) handled at adapter boundary.
