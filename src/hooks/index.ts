// packages/features/crud/src/hooks/index.ts

export { useFileUpload } from './useFileUpload';
export type { FileMetadata, UseFileUploadOptions } from './useFileUpload';
// Re-export FileEntry from store (canonical type, FileMetadata is alias)
export type { FileEntry } from '../stores/UploadStore';

export { useEntityFavorites } from './useEntityFavorites';
export type {
  UseEntityFavoritesOptions,
  UseEntityFavoritesReturn,
} from './useEntityFavorites';

export { useCrudFilters } from './useCrudFilters';
export type {
  UseCrudFiltersOptions,
  UseCrudFiltersReturn,
} from './useCrudFilters';

export { useCrudPageSize } from './useCrudPageSize';
export type {
  UseCrudPageSizeOptions,
  UseCrudPageSizeReturn,
} from './useCrudPageSize';

export { useRelatedItems } from './useRelatedItems';
export type {
  UseRelatedItemsOptions,
  UseRelatedItemsReturn,
} from './useRelatedItems';

export { useFieldConditions } from './useFieldConditions';

export { useReferenceResolver } from './useReferenceResolver';
export type { ReferenceData } from './useReferenceResolver';
