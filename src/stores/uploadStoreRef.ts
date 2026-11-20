// packages/features/crud/src/stores/uploadStoreRef.ts

/**
 * @fileoverview Upload store, once loaded
 * @description Forms reach the upload store only through this reference, so a form
 * without file fields never loads it: the store module (UploadStore.ts) registers
 * itself here when it is evaluated, which the file fields (lazy chunks) cause.
 * No reference means no file field ever mounted: no upload to run, abort or clean.
 *
 * @version 0.1.0
 * @since 0.3.1
 * @author AMBROISE PARK Consulting
 */

import type { useUploadStore } from './UploadStore';

type UploadStore = typeof useUploadStore;

let loadedUploadStore: UploadStore | null = null;

/**
 * Called once by UploadStore.ts when it is evaluated.
 *
 * @param store - The upload store
 *
 * @version 0.1.0
 * @since 0.3.1
 * @author AMBROISE PARK Consulting
 */
export function setLoadedUploadStore(store: UploadStore): void {
  loadedUploadStore = store;
}

/**
 * The upload store if a file field loaded it, else `null` (no upload state exists).
 *
 * @returns The upload store or `null`
 *
 * @version 0.1.0
 * @since 0.3.1
 * @author AMBROISE PARK Consulting
 */
export function getLoadedUploadStore(): UploadStore | null {
  return loadedUploadStore;
}
