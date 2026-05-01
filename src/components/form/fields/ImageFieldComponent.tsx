'use client';
// packages/features/crud/src/components/form/fields/ImageFieldComponent.tsx

/**
 * @fileoverview Image Field Component
 * @description Image upload field with drag-to-reorder (touch + mouse), crop, rotate via ImageViewerDialog.
 * Supports single (Picture) and multiple (Picture[]) images.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Upload, X, Loader2, GripVertical } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { Text, Stack, Progress, handleImageError } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';
import type { Picture } from '@donotdev/core';

import { useFileUpload } from '../../../hooks/useFileUpload';
import { processImage } from '../../../utils/imageProcessing';
import { uploadImage } from '../../../utils/imageStorage';
import { ImageViewerDialog } from '../internal/ImageViewerDialog';

import type { FileEntry } from '../../../stores/UploadStore';
import type { ImageMetadata } from '../../../utils/imageUtils';
import type { DragEndEvent } from '@dnd-kit/core';
import type { ChangeEvent, DragEvent } from 'react';

// Stable reference for accept types
const IMAGE_ACCEPT_TYPES = ['image/*'];

export interface ImageFieldComponentProps {
  /** Field name (for upload registration) */
  name?: string;
  /** Field label */
  label: string;
  /** Current value - Picture for single, Picture[] for multiple */
  value?: Picture | Picture[] | null;
  /** Change handler */
  onChange: (value: Picture | Picture[] | null) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Multiple images mode */
  multiple?: boolean;
  /** Maximum number of images (multiple mode only) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Folder path within the storage bucket. Omit to upload to bucket root. */
  storagePath?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Camera capture mode: 'environment' (back), 'user' (front), or undefined (browser decides) */
  capture?: 'environment' | 'user';
}

export interface ImageFieldComponentRef {
  upload: () => Promise<void>;
  focus: () => void;
}

/**
 * Convert FileEntry to ImageMetadata for ImageViewerDialog
 */
function toImageMetadata(file: FileEntry): ImageMetadata {
  return {
    id: file.id,
    file: file.file,
    previewURL: file.previewURL,
    hash: '',
    rotation: 0,
    uploadProgress: file.progress,
    uploaded: file.uploaded as Picture | null,
    error: file.error,
  };
}

// =============================================================================
// SortableImageItem - Individual draggable image thumbnail
// =============================================================================

interface SortableImageItemProps {
  file: FileEntry;
  index: number;
  multiple: boolean;
  onImageClick: (index: number) => void;
  onRemove: (id: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function SortableImageItem({
  file,
  index,
  multiple,
  onImageClick,
  onRemove,
  t,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const isFileUploading = file.progress !== null && file.progress < 100;
  const canDrag = multiple && !isFileUploading;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative' as const,
    width: 100,
    height: 100,
    borderRadius: 'var(--radius-md)',
    border: 'var(--border-width) solid var(--border)',
    overflow: 'hidden',
    backgroundColor: 'var(--surface)',
    opacity: isDragging ? 0.5 : 1,
    cursor: canDrag ? 'grab' : 'pointer',
    userSelect: 'none' as const,
    touchAction: canDrag ? 'none' : 'auto',
  };

  // Handle click - only open viewer if not dragging
  const handleClick = () => {
    if (!isDragging) {
      onImageClick(index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canDrag ? listeners : {})}
      onClick={handleClick}
    >
      {isFileUploading ? (
        <Stack
          align="center"
          justify="center"
          style={{ width: '100%', height: '100%' }}
        >
          <Loader2 style={{ animation: 'spin 1s linear infinite' }} />
          <Progress value={file.progress || 0} style={{ width: '80%' }} />
        </Stack>
      ) : file.error ? (
        <Stack
          align="center"
          justify="center"
          style={{ width: '100%', height: '100%' }}
        >
          <X style={{ color: 'var(--destructive)' }} />
          <Text variant="destructive" level="small">
            {file.error}
          </Text>
        </Stack>
      ) : (
        <>
          {/* Drag indicator (multiple mode) - visual hint only */}
          {multiple && (
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: 2,
                background: 'rgba(0,0,0,0.5)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              <GripVertical style={{ color: 'white', width: 14, height: 14 }} />
            </div>
          )}

          {/* Image */}
          <img
            src={file.previewURL}
            alt={t('image.alt.upload', { index: index + 1 })}
            draggable={false}
            onError={handleImageError}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />

          {/* Remove button - stops propagation to prevent drag/click */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(file.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              padding: 4,
              background: 'rgba(0,0,0,0.5)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              zIndex: 2,
            }}
          >
            <X style={{ color: 'white', width: 16, height: 16 }} />
          </button>

          {/* Pending indicator */}
          {!file.uploaded && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: 4,
                background: 'rgba(0,0,0,0.7)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <Text variant="muted" level="small" style={{ color: 'white' }}>
                {t('image.upload.pending', { defaultValue: 'Pending' })}
              </Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// ImageFieldComponent - Main component
// =============================================================================

/**
 * ImageFieldComponent - Image upload with viewer dialog for crop/rotate and drag-to-reorder
 */
const ImageFieldComponent = forwardRef<
  ImageFieldComponentRef,
  ImageFieldComponentProps
>(
  (
    {
      name = 'image',
      label,
      value,
      onChange,
      error,
      helperText,
      multiple = false,
      maxFiles = 10,
      maxSize = 10 * 1024 * 1024,
      storagePath,
      required,
      capture,
    },
    ref
  ) => {
    const { t } = useTranslation('crud');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Viewer dialog state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Configure sensors for both mouse and touch
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8, // 8px movement before drag starts (prevents accidental drags)
        },
      }),
      useSensor(TouchSensor, {
        activationConstraint: {
          delay: 200, // 200ms hold before drag starts on touch
          tolerance: 5, // 5px movement tolerance during delay
        },
      })
    );

    // Upload function
    const uploadFn = useCallback(
      async (
        file: File,
        onProgress: (progress: number) => void
      ): Promise<Picture> => {
        const { fullBlob, thumbBlob } = await processImage(file);
        return uploadImage(fullBlob, thumbBlob, file.name, {
          storagePath,
          onProgress: (p) => onProgress(p.progress),
        });
      },
      [storagePath]
    );

    const { files, addFiles, removeFile, reorderFiles } = useFileUpload({
      name,
      value,
      onChange: onChange as (value: unknown) => void,
      multiple,
      maxFiles,
      maxSize,
      accept: IMAGE_ACCEPT_TYPES,
      storagePath,
      uploadFn,
    });

    // Handle file input
    const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
      const inputFiles = Array.from(e.target.files || []);
      if (inputFiles.length > 0) addFiles(inputFiles);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Handle drop on dropzone (external file drops only)
    const handleDrop = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files.length > 0) {
          addFiles(Array.from(e.dataTransfer.files));
        }
      },
      [addFiles]
    );

    // Handle drag end for reordering - delegates to store via reorderFiles
    const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
          const oldIndex = files.findIndex((f) => f.id === active.id);
          const newIndex = files.findIndex((f) => f.id === over.id);

          if (oldIndex !== -1 && newIndex !== -1) {
            const reorderedIds = arrayMove(
              files.map((f) => f.id),
              oldIndex,
              newIndex
            );
            reorderFiles(reorderedIds);
          }
        }
      },
      [files, reorderFiles]
    );

    // ImageViewerDialog handlers
    const handleImageClick = (index: number) => {
      setSelectedIndex(index);
      setViewerOpen(true);
    };

    const handleViewerUpdate = (
      index: number,
      updates: Partial<ImageMetadata>
    ) => {
      console.log('Update image', index, updates);
    };

    const handleViewerDelete = (index: number) => {
      const fileToRemove = files[index];
      if (fileToRemove) {
        removeFile(fileToRemove.id);
      }
    };

    const handleViewerNavigate = (index: number) => {
      setSelectedIndex(index);
    };

    const showDropzone = multiple || files.length === 0;

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        upload: async () => {},
        focus: () => fileInputRef.current?.focus(),
      }),
      []
    );

    // Convert files to ImageMetadata for viewer
    const imagesForViewer = files.map(toImageMetadata);

    return (
      <Stack gap="tight">
        <Text level="body" textAlign="start">
          {label}
          {required && '*'}
        </Text>

        {/* Dropzone */}
        {showDropzone && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              border: `var(--border-width) dashed ${error ? 'var(--destructive)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--gap-lg)',
              backgroundColor: 'var(--surface)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={capture}
              multiple={multiple}
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <Stack align="center">
              <Upload style={{ color: 'var(--muted-foreground)' }} />
              <Text variant="muted" level="small">
                {multiple
                  ? t('image.upload.dropzoneMultiple', {
                      defaultValue: 'Drop images here or click to upload',
                    })
                  : t('image.upload.dropzoneSingle', {
                      defaultValue: 'Drop image here or click to upload',
                    })}
              </Text>
            </Stack>
          </div>
        )}

        {/* Image Previews - Sortable with @dnd-kit */}
        {files.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={files.map((f) => f.id)}
              strategy={rectSortingStrategy}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--gap-md)',
                }}
              >
                {files.map((file, index) => (
                  <SortableImageItem
                    key={file.id}
                    file={file}
                    index={index}
                    multiple={multiple}
                    onImageClick={handleImageClick}
                    onRemove={removeFile}
                    t={t}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {helperText && (
          <Text variant={error ? 'destructive' : 'muted'} level="small">
            {helperText}
          </Text>
        )}

        {/* Image Viewer Dialog */}
        <ImageViewerDialog
          images={imagesForViewer}
          selectedIndex={selectedIndex}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onUpdate={handleViewerUpdate}
          onDelete={handleViewerDelete}
          onNavigate={handleViewerNavigate}
          multiple={multiple}
        />
      </Stack>
    );
  }
);

ImageFieldComponent.displayName = 'ImageFieldComponent';

export default ImageFieldComponent;
