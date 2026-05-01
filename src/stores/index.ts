// packages/features/crud/src/stores/index.ts

/**
 * @fileoverview CRUD Stores
 * @description Store exports for CRUD feature
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// Form Store - form submission state machine
export {
  useFormStore,
  useFormStatus,
  useFormLoading,
  useUploadProgress,
  useFormError,
  useFormIsDirty,
  useHasDirtyForms,
  type FormStatus,
  type FormStoreState,
  type FormStoreActions,
} from './FormStore';

// Upload Store - per-field upload progress + per-file state
export {
  useUploadStore,
  useTotalProgress,
  useIsUploading,
  useFieldProgress,
  useFieldUploadStatus,
  useFieldFiles,
  generateStandaloneFormId,
  type UploadStatus,
  type UploadFunction,
  type UploadStoreState,
  type UploadStoreActions,
  type FileEntry,
  type FileEntryStatus,
  type UploadResult,
} from './UploadStore';
