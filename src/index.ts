// packages/features/crud/src/index.ts

/**
 * @fileoverview CRUD package
 * @description CRUD operations and form components for DoNotDev framework
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

// Core CRUD hooks
export * from './useCrud';
export * from './useCrudList';
export * from './useCrudCardList';

// Components
export * from './components';

// Stores - automatic loading state management
export * from './stores';

// Adapters — register via configureProviders({ crud: adapter }) at app startup
// FirestoreAdapter is in @donotdev/firebase (Firebase-specific ICrudAdapter implementation)
export { FunctionsAdapter } from './adapters/FunctionsAdapter';
export type { FunctionsQueryOptions } from './adapters/FunctionsAdapter';

// Service
export { getCrudService } from './CrudService';
// QueryOptions is exported from @donotdev/core, not re-exported here to avoid duplicate export

// Store hook export
export { useCrudStore } from './CrudStore';

// Types - exported from shared types file
export type {
  CrudServiceInterface,
  CrudState,
  CrudActions,
  OptimisticStatus,
  OptimisticMeta,
  CrudOperation,
  CrudStoreApi,
  CacheOptions,
  MutationOptions,
  FilterState,
  CollectionUIState,
} from './types';
export { OPTIMISTIC_STATUSES, CRUD_OPERATION } from './types';

// Collection utilities
export {
  loadDeterministicRange,
  upsertDeterministic,
  appendToCollection,
} from './utils/collections';

// Field Registry - for custom field types
export {
  getFieldRegistry,
  registerFieldType,
  isFieldTypeRegistered,
  type FieldTypeRegistration,
  type ControlledFieldProps,
  type UncontrolledFieldProps,
} from './FieldRegistry';

// Unified Field Type Registry - for built-in types metadata
export {
  registerBuiltinFieldType,
  getFieldTypeMetadata,
  getFilterType,
  getDisplayFormatter,
  isFilterable,
  getValueType,
  clearFieldTypeRegistry,
  type FieldTypeMetadata,
  type FilterType,
  type ValueType,
  type DisplayFormatter,
  type ComponentRegistration,
} from './fieldTypeRegistry';

/**
 * @deprecated No-op shim. Built-in field types are now auto-registered via
 * `fieldTypeRegistry.ts` → `registerBuiltinFieldTypes.tsx` side-effect chain.
 * Exported for backward compatibility with consumers that call it at startup.
 */
export { registerBuiltinFieldTypes } from './builtinFieldTypes';

// Form building blocks - for custom forms
export {
  // Hooks
  useEntityForm,
  useEntityField,
  useController,
  // Utilities
  isFieldEditable,
  getFieldsForOperation,
  validateEntity,
  translateFieldLabel,
  translateLabel,
} from './forms';

// Form types
export type {
  ViewerRole,
  RenderableField,
  GetFieldsForOperationOptions,
  EntityFieldsInput,
  SchemaOperation,
  ValidationIssue,
  ValidationResult,
  InferEntityData,
  InferEntityCreate,
  InferEntityInput,
  InferEntityOutput,
  UseEntityFormOptions,
  EntityFormReturn,
  EntityFieldReturn,
  UseControllerProps,
  UseControllerReturn,
  ControllerRenderProps,
  ControllerFieldState,
} from './forms';

// Upload context and hooks - for custom upload components
export { UploadProvider, useUploadContext } from './contexts';
export type { UploadProviderProps } from './contexts';
export {
  useFileUpload,
  useEntityFavorites,
  useRelatedItems,
  useCrudFilters,
  useCrudPageSize,
  useFieldConditions,
  useReferenceResolver,
} from './hooks';
export type {
  FileMetadata,
  FileEntry,
  UseFileUploadOptions,
  UseEntityFavoritesOptions,
  UseEntityFavoritesReturn,
  UseRelatedItemsOptions,
  UseRelatedItemsReturn,
  UseCrudFiltersOptions,
  UseCrudFiltersReturn,
  UseCrudPageSizeOptions,
  UseCrudPageSizeReturn,
  ReferenceData,
} from './hooks';

// Upload validation utilities - for secure blob URL detection
export {
  isStorageUrl,
  validatePicture,
  checkForBlobUrls,
  hasBlobUrls,
} from './utils/uploadValidation';

// Workflow engine - multi-step entity forms
export {
  defineWorkflow,
  useEntityWorkflow,
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
} from './workflows';
export type {
  WorkflowConfig,
  WorkflowStep,
  WorkflowStepContext,
  UseEntityWorkflowOptions,
  EntityWorkflowReturn,
  PersistedWorkflowState,
} from './workflows';

// Display formatting - explicit named export for consumers
export { formatValue } from './components/DisplayFieldRenderer';

// Reference utilities
export { buildReferenceLabel } from './components/controlled/select/ControlledReferenceField';

// Filter matching utility - standalone for non-React contexts
export { matchesFilter } from './utils/matchesFilter';

// Client-side list processing utilities
export {
  applyFilters,
  applySearch,
  applySort,
  getSearchableFields,
} from './utils/clientListProcessing';
export type {
  ClientSort,
  ClientSortConfig,
} from './utils/clientListProcessing';
