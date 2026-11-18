// packages/features/crud/src/forms/__tests__/childRows.test.ts

import { describe, expect, it } from 'vitest';

import {
  apartmentEntity,
  editableModesEntity,
  orderLineEntity as lineEntity,
  productCostEntity as secretEntity,
  productEntity,
  productOfferEntity as offerEntity,
  soldOrderLineEntity,
} from '@dndev/test-entities';

import {
  EMPTY_CHILD_EDITS,
  applyChildEdits,
  childEditsBatches,
  childEditsErrors,
  countChildEdits,
  mergeBatches,
  parentCollectionOf,
  parseChildEdits,
  rebaseChildEdits,
  reconcileChildEdits,
  removeChildRows,
  setChildValues,
  schemasOf,
  writableFields,
} from '../childRows';
import { resolveExtensions } from '../extend';

const saved = [
  { id: 'l1', orderId: 'o1', productId: 'p1', quantity: 1 },
  { id: 'l2', orderId: 'o1', productId: 'p2', quantity: 2 },
];
const parent = { field: 'orderId', value: 'o1' };

describe('child rows edits', () => {
  it('applies changes, added and removed rows', () => {
    const edits = {
      changes: { l1: { quantity: 5 } },
      added: [{ id: 'n1', orderId: 'o1', productId: 'p3', quantity: 3 }],
      removed: ['l2'],
    };
    const { base, items } = applyChildEdits(saved, edits);
    expect(base.map((row) => row.id)).toEqual(['l1', 'n1']);
    expect(items[0]).toMatchObject({ id: 'l1', quantity: 5 });
    expect(base[0]).toMatchObject({ quantity: 1 });
    expect(countChildEdits(edits)).toBe(3);
  });

  it('drops a value set back to the saved one', () => {
    const edited = setChildValues(EMPTY_CHILD_EDITS, saved[0]!, { quantity: 4 });
    expect(edited.changes).toEqual({ l1: { quantity: 4 } });
    expect(setChildValues(edited, saved[0]!, { quantity: 1 }).changes).toEqual({});
  });

  it('removes added rows and marks saved ones', () => {
    const edits = {
      changes: { n1: { quantity: 2 }, l1: { quantity: 9 } },
      added: [{ id: 'n1', orderId: 'o1' }],
      removed: [],
    };
    expect(removeChildRows(edits, ['n1', 'l1'])).toEqual({ changes: {}, added: [], removed: ['l1'] });
  });

  it('settles edits against the saved rows (written rows leave, unknown rows drop)', () => {
    const edits = {
      changes: { l1: { quantity: 1 }, l2: { quantity: 7 }, gone: { quantity: 1 }, n1: { quantity: 4 } },
      added: [{ id: 'n1', orderId: 'o1', productId: 'p3', quantity: 3 }, { id: 'n2', orderId: 'o1' }],
      removed: ['l9'],
    };
    const now = [...saved, { id: 'n1', orderId: 'o1', productId: 'p3', quantity: 3 }];
    expect(reconcileChildEdits(edits, now)).toEqual({
      changes: { l2: { quantity: 7 }, n1: { quantity: 4 } },
      added: [{ id: 'n2', orderId: 'o1' }],
      removed: [],
    });
    const settled = { changes: { l2: { quantity: 7 } }, added: [], removed: [] };
    expect(reconcileChildEdits(settled, saved)).toBe(settled);
  });

  it('keeps only edits made while a write was in flight', () => {
    const submitted = { changes: { l1: { quantity: 5 } }, added: [{ id: 'n1', orderId: 'o1' }], removed: ['l2'] };
    expect(rebaseChildEdits(submitted, submitted)).toBe(EMPTY_CHILD_EDITS);
    const later = { changes: { l1: { quantity: 6 }, n1: { quantity: 2 } }, added: [{ id: 'n1', orderId: 'o1' }], removed: ['l2'] };
    expect(rebaseChildEdits(later, submitted)).toEqual({
      changes: { l1: { quantity: 6 }, n1: { quantity: 2 } },
      added: [],
      removed: [],
    });
  });
});

describe('child rows from a draft (untrusted)', () => {
  it('keeps writable, well-typed values and forces the parent', () => {
    const edits = parseChildEdits({ entity: lineEntity, parent }, {
      changes: { l1: { quantity: 3, note: 'x', id: 'hack', unknown: 1 }, l2: { quantity: 'many' } },
      added: [{ id: 'n1', orderId: 'other', productId: 'p3', quantity: 2, note: 'y' }],
      removed: ['l2', 'n1'],
    }, 'admin');
    expect(edits).toEqual({
      changes: { l1: { quantity: 3 } },
      added: [{ id: 'n1', orderId: 'o1', productId: 'p3', quantity: 2 }],
      removed: ['l2'],
    });
  });

  it('rejects a foreign shape and ids that are not record ids', () => {
    expect(() => parseChildEdits({ entity: lineEntity, parent }, { rows: [] }, 'admin')).toThrow();
    expect(() => parseChildEdits({ entity: lineEntity, parent }, { changes: {}, added: [], removed: ['a b'] }, 'admin')).toThrow();
  });

  it('drops what the viewer may not do (entity access)', () => {
    expect(parseChildEdits({ entity: lineEntity, parent }, {
      changes: { l1: { quantity: 3 } },
      added: [{ id: 'n1', productId: 'p3', quantity: 2 }],
      removed: ['l2'],
    }, 'user')).toBe(EMPTY_CHILD_EDITS);
  });
});

describe('child rows validation and writes', () => {
  const stored = new Map(saved.map((row) => [row.id, { ...row, status: 'available' }]));

  it('checks the resulting row (stored + edits) against the schema of its status', () => {
    const errors = childEditsErrors({ entity: lineEntity, savedRows: stored }, {
      changes: { l1: { quantity: 'many' }, l2: { quantity: null } },
      added: [{ id: 'n1', orderId: 'o1', quantity: 2, status: 'available' }],
      removed: [],
    }, 'admin');
    expect(errors).toEqual({
      n1: { productId: 'required' },
      l1: { quantity: 'invalid' },
      // available row: a required field cleared is flagged
      l2: { quantity: 'required' },
    });
    expect(childEditsErrors({ entity: lineEntity, savedRows: stored }, { changes: { l1: { quantity: 4 } }, added: [], removed: [] }, 'admin')).toEqual({});
  });

  it('an edit keeping the status is an update: only the changed fields are checked', () => {
    // Legacy row with a required field missing: editing another field does not flag it
    const legacy = new Map([['l1', { id: 'l1', orderId: 'o1', productId: null, quantity: 1, status: 'available' }]]);
    expect(childEditsErrors({ entity: lineEntity, savedRows: legacy }, {
      changes: { l1: { quantity: 3 } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({});
    expect(childEditsErrors({ entity: lineEntity, savedRows: legacy }, {
      changes: { l1: { quantity: null } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({ l1: { quantity: 'required' } });
  });

  it('a draft row is checked leniently (draft schema)', () => {
    const drafts = new Map([['l1', { ...saved[0]!, status: 'draft' }]]);
    expect(childEditsErrors({ entity: lineEntity, savedRows: drafts }, {
      changes: { l1: { quantity: null, productId: null } },
      added: [{ id: 'n1', orderId: 'o1', status: 'draft' }],
      removed: [],
    }, 'admin')).toEqual({});
  });

  it('an edit that publishes is checked with the full schema', () => {
    const drafts = new Map([['l1', { id: 'l1', orderId: 'o1', productId: null, quantity: 1, status: 'draft' }]]);
    expect(childEditsErrors({ entity: lineEntity, savedRows: drafts }, {
      changes: { l1: { status: 'available' } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({ l1: { productId: 'required' } });
  });

  // Regression: a soft delete of a draft (→ deleted) checked the merged draft row
  // against the update schema, while the server checks only the sent fields
  // (entersVisibleStatus: deleted is hidden like draft).
  it('a soft delete of a draft is relaxed like the server: only the changed fields', () => {
    const drafts = new Map([['l1', { id: 'l1', orderId: 'o1', productId: null, quantity: null, status: 'draft' }]]);
    expect(childEditsErrors({ entity: lineEntity, savedRows: drafts }, {
      changes: { l1: { status: 'deleted' } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({});
  });

  // CRUD rules 2 and 5: only leaving a status that may hold an incomplete row (draft,
  // deleted: STATUS_MATRIX holdIncomplete) checks the whole record; available → sold is
  // an update of what changes, so the legacy empty productId is not checked.
  it('an edit from one visible status to another checks only what changes', () => {
    const legacy = new Map([['l1', { id: 'l1', orderId: 'o1', productId: null, quantity: 1, status: 'available' }]]);
    const sold = soldOrderLineEntity;
    expect(childEditsErrors({ entity: sold, savedRows: legacy }, {
      changes: { l1: { status: 'sold' } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({});
    expect(childEditsErrors({ entity: sold, savedRows: legacy }, {
      changes: { l1: { status: 'deleted' } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({});
  });

  it('builds one bulkAcross batch (inserts keep their ids, removed rows are not updated)', () => {
    const [batch, ...others] = childEditsBatches({ entity: lineEntity, parent }, {
      changes: { l1: { quantity: 4 }, n1: { quantity: 9 }, l2: { quantity: 1 } },
      added: [{ id: 'n1', productId: 'p3', quantity: 2 }],
      removed: ['l2'],
    });
    expect(others).toEqual([]);
    expect(batch).toMatchObject({
      collection: 'order_lines',
      inserts: [{ id: 'n1', productId: 'p3', quantity: 9, orderId: 'o1' }],
      updates: [{ id: 'l1', patch: { quantity: 4 } }],
      deletes: ['l2'],
    });
    // Each batch carries its entity's schemas (childEditsBatches JSDoc).
    expect(batch!.schemas).toBe(schemasOf(lineEntity));
    const merged = mergeBatches([batch!, { collection: 'order_lines', deletes: ['l1'], schemas: {} }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.deletes).toEqual(['l2', 'l1']);
  });
});

describe('child rows with a 1:1 extension', () => {
  const extensions = resolveExtensions(
    productEntity,
    { offer: { entity: offerEntity, field: 'productId' }, secret: { entity: secretEntity, field: 'productId' } },
    'admin'
  );
  const context = { entity: productEntity, extensions, extensionIds: { p1: { offer: 'o1' } } };

  it('resolves extensions for the viewer and rejects bad specs', () => {
    expect(extensions.map((ext) => [ext.key, ext.readable])).toEqual([['offer', true], ['secret', false]]);
    expect(() => resolveExtensions(productEntity, { name: { entity: offerEntity, field: 'productId' } }, 'admin')).toThrow(/must not/);
    expect(() => resolveExtensions(productEntity, { offer: { entity: offerEntity, field: 'price' } }, 'admin')).toThrow(/not a reference/);
  });

  it('writes extension patches as updates, missing extensions as inserts (after their record)', () => {
    const batches = childEditsBatches(context, {
      changes: { p1: { 'offer.price': 12, name: 'Renamed' }, p2: { 'offer.price': 8 } },
      added: [{ id: 'n1', name: 'New', 'offer.price': 5 }],
      removed: [],
    }, 'admin');
    expect(batches.map((batch) => batch.collection)).toEqual(['products', 'product_offers']);
    expect(batches[0]).toMatchObject({
      inserts: [{ id: 'n1', name: 'New' }],
      updates: [{ id: 'p1', patch: { name: 'Renamed' } }],
    });
    expect(batches[0]!.inserts![0]).not.toHaveProperty('offer.price');
    expect(batches[1]).toMatchObject({
      updates: [{ id: 'o1', patch: { price: 12 } }],
      inserts: [
        { productId: 'n1', price: 5 },
        { productId: 'p2', price: 8 },
      ],
      dependsOn: ['products'],
    });
    expect(() => childEditsBatches(context, { changes: { p1: { 'nope.x': 1 } }, added: [], removed: [] })).toThrow(/no extension/);
  });

  it('validates extensions merged with their stored row (a missing one: inserted, full create schema)', () => {
    const storedProducts = new Map<string, Record<string, unknown> & { id: string }>([
      ['p1', { id: 'p1', name: 'Toner', status: 'available', offer: { id: 'o1', productId: 'p1', price: 10, status: 'available' } }],
      ['p2', { id: 'p2', name: 'Cream', status: 'available', offer: null }],
    ]);
    const merged = { ...context, savedRows: storedProducts };
    expect(childEditsErrors(merged, {
      changes: { p1: { 'offer.price': null }, p2: { name: 'Renamed' } },
      added: [{ id: 'n1', name: 'New', status: 'available' }],
      removed: [],
    }, 'admin')).toEqual({
      n1: { 'offer.price': 'required' },
      p1: { 'offer.price': 'required' },
    });
    // The stored extension supplies the untouched required values.
    expect(childEditsErrors(merged, { changes: { p1: { name: 'Renamed' } }, added: [], removed: [] }, 'admin')).toEqual({});
  });

  it('keeps extension fields of drafts only where the viewer may write them', () => {
    expect(parseChildEdits(context, {
      changes: { p1: { 'offer.price': 3, 'offer.productId': 'x', 'secret.cost': 1, 'offer.price2': 1 } },
      added: [],
      removed: [],
    }, 'admin').changes).toEqual({ p1: { 'offer.price': 3 } });
  });
});

// Regression (design 3.4 / B10): write eligibility and the reference predicate come
// from the entity descriptor.
describe('child rows from the entity descriptor', () => {
  it('writes computed fields and i18n companions, never editable: false or generated ones', () => {
    const fields = writableFields(editableModesEntity, 'admin', 'edit');
    expect(fields.has('total')).toBe(true);
    expect(fields.has('titleI18n')).toBe(true);
    expect(fields.has('code')).toBe(false);
    expect(fields.has('revision')).toBe(false);
    expect(fields.has('createdAt')).toBe(false);
  });

  it('takes a custom-type field with validation.reference as the parent reference', () => {
    expect(parentCollectionOf(apartmentEntity, 'owner_ref')).toBe('owners');
    expect(() => parentCollectionOf(editableModesEntity, 'title')).toThrow(/not a reference field/);
  });

  // One status rule: an edit of a stored draft without a status change is a draft write.
  it('checks an edit of a stored draft with the draft schema (merged row)', () => {
    const drafts = new Map([['l1', { id: 'l1', orderId: 'o1', productId: null, quantity: 1, status: 'draft' }]]);
    expect(childEditsErrors({ entity: lineEntity, savedRows: drafts }, {
      changes: { l1: { quantity: 'many' } },
      added: [],
      removed: [],
    }, 'admin')).toEqual({ l1: { quantity: 'invalid' } });
  });
});

