import { describe, it, expect } from 'vitest';

import { createSchemas, defineEntity } from '@donotdev/core';
import type { ICrudAdapter } from '@donotdev/core';

import { assertCanAccess } from '../CrudService.internal';

// Real hasRestrictedVisibility + real defineEntity schemas: a direct adapter
// (FirestoreAdapter: neither serverSideOnly nor dbLevelSecurity) serves entities whose
// own fields are guest; the auto-added base fields do not make them restricted.
const publicEntity = defineEntity({
  name: 'Brand',
  collection: 'brands',
  fields: {
    name: { name: 'name', label: 'name', type: 'text', visibility: 'guest', validation: {} },
  },
});
const privateEntity = defineEntity({
  name: 'Supplier',
  collection: 'suppliers',
  fields: {
    name: { name: 'name', label: 'name', type: 'text', visibility: 'guest', validation: {} },
    iban: { name: 'iban', label: 'iban', type: 'text', visibility: 'admin', validation: {} },
  },
});

// why: assertCanAccess reads only the two security flags; the rest of the adapter is irrelevant
const adapter = (flags: Partial<ICrudAdapter>) => flags as ICrudAdapter;
const direct = adapter({});

describe('assertCanAccess', () => {
  it('direct adapter: an entity with only base fields restricted is served', () => {
    const schemas = createSchemas(publicEntity);
    for (const schema of [schemas.get, schemas.list, schemas.create, schemas.update]) {
      expect(() => assertCanAccess(direct, 'brands', schema)).not.toThrow();
    }
  });

  it('direct adapter: an own restricted field is refused', () => {
    expect(() =>
      assertCanAccess(direct, 'suppliers', createSchemas(privateEntity).get)
    ).toThrow(/Direct adapter cannot access "suppliers": entity has restricted field visibility/);
  });

  it('serverSideOnly or dbLevelSecurity adapters serve restricted entities', () => {
    const schema = createSchemas(privateEntity).get;
    expect(() =>
      assertCanAccess(adapter({ serverSideOnly: true }), 'suppliers', schema)
    ).not.toThrow();
    expect(() =>
      assertCanAccess(adapter({ dbLevelSecurity: true }), 'suppliers', schema)
    ).not.toThrow();
  });
});
