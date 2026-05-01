'use client';
// packages/features/crud/src/components/form/fields/FileFieldComponent.tsx

/**
 * @fileoverview File Field Component
 * @description Generic file upload with storage, deferred uploads, progress tracking.
 * Supports any file type. Upload state managed by UploadStore via useFileUpload hook.
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  Upload,
  X,
  File as FileIcon,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
} from 'lucide-react';
import { useState, useRef, useImperativeHandle, forwardRef } from 'react';

import {
  Button,
  BUTTON_VARIANT,
  Text,
  Stack,
  Progress,
} from '@donotdev/components';
import { handleError, useTranslation } from '@donotdev/core';

import { useFileUpload } from '../../../hooks/useFileUpload';
import {
  uploadFile,
  deleteFile,
  getFileIcon,
  formatFileSize,
} from '../../../utils/fileStorage';

import type { FileEntry, UploadResult } from '../../../stores/UploadStore';
import type { FileAsset } from '../../../utils/fileStorage';
import type { ChangeEvent, DragEvent } from 'react';

export interface FileFieldComponentProps {
  /** Field name (for upload registration) */
  name?: string;
  /** Field label */
  label: string;
  /** Current value - FileAsset for single, FileAsset[] for multiple */
  value?: FileAsset | FileAsset[] | null;
  /** Change handler */
  onChange: (value: FileAsset | FileAsset[] | null) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Accept attribute for file input (MIME types or extensions) */
  accept?: string;
  /** Multiple files mode */
  multiple?: boolean;
  /** Maximum number of files (multiple mode only) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 50MB) */
  maxSize?: number;
  /** Folder path within the storage bucket. Omit to upload to bucket root. */
  storagePath?: string;
  /** Whether the field is required */
  required?: boolean;
}

export interface FileFieldComponentRef {
  /** Trigger upload of all pending files */
  upload: () => Promise<void>;
  /** Get current files */
  getFiles: () => FileEntry[];
}

/**
 * Get icon component based on file type
 */
function FileTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case 'pdf':
      return (
        <FileText
          className={className}
          style={{ color: 'var(--destructive)' }}
        />
      );
    case 'doc':
      return (
        <FileText className={className} style={{ color: 'var(--primary)' }} />
      );
    case 'xls':
      return (
        <FileSpreadsheet
          className={className}
          style={{ color: 'var(--success)' }}
        />
      );
    case 'ppt':
      return (
        <FileText className={className} style={{ color: 'var(--warning)' }} />
      );
    case 'image':
      return <FileImage className={className} />;
    case 'video':
      return <FileVideo className={className} />;
    case 'audio':
      return <FileAudio className={className} />;
    case 'archive':
      return <FileArchive className={className} />;
    case 'html':
    case 'text':
      return <FileCode className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

/**
 * FileFieldComponent - Generic file upload with storage
 * Features: Deferred upload, progress indicator, multiple files, drag-and-drop
 */
const FileFieldComponent = forwardRef<
  FileFieldComponentRef,
  FileFieldComponentProps
>(
  (
    {
      name = 'file',
      label,
      value,
      onChange,
      error,
      helperText,
      accept,
      multiple = false,
      maxFiles = 10,
      maxSize = 50 * 1024 * 1024, // 50MB
      storagePath,
      required,
    },
    ref
  ) => {
    const { t } = useTranslation('crud');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Upload function: File -> FileAsset
    function fileUploadFn(
      file: File,
      onProgress: (progress: number) => void
    ): Promise<UploadResult> {
      return uploadFile(file, {
        storagePath,
        onProgress: (p) => onProgress(p.progress),
      });
    }

    const { files, addFiles, removeFile } = useFileUpload({
      name,
      value,
      onChange: onChange as (value: unknown) => void,
      multiple,
      maxFiles,
      maxSize,
      accept: accept ? [accept] : [],
      storagePath,
      uploadFn: fileUploadFn,
    });

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        upload: async () => {},
        getFiles: () => files,
      }),
      [files]
    );

    // Handle file input change
    function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
      const inputFiles = Array.from(e.target.files || []);
      if (inputFiles.length > 0) addFiles(inputFiles);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    // Handle drop
    function handleDrop(e: DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      addFiles(Array.from(e.dataTransfer.files));
    }

    // Handle delete with storage cleanup
    async function handleDelete(id: string) {
      const item = files.find((f) => f.id === id);
      if (!item) return;

      try {
        if (item.uploaded && 'url' in item.uploaded) {
          await deleteFile(item.uploaded as FileAsset);
        }
        removeFile(id);
      } catch (err) {
        handleError(err, {
          userMessage: t('file.delete.failed'),
          severity: 'error',
          showNotification: true,
        });
      }
    }

    const showDropzone = multiple || files.length === 0;

    return (
      <Stack gap="tight">
        <Text level="body" textAlign="start">
          {label}
          {required ? '*' : ''}
        </Text>

        {/* Dropzone */}
        {showDropzone && (
          <div
            role="button"
            tabIndex={0}
            aria-label={
              multiple
                ? t('file.upload.ariaLabelMultiple')
                : t('file.upload.ariaLabelSingle')
            }
            className="dndev-surface"
            data-variant={error ? 'destructive' : 'default'}
            style={{
              border: `var(--border-width) dashed`,
              borderColor: dragActive
                ? 'var(--primary)'
                : error
                  ? 'var(--destructive)'
                  : 'var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--gap-lg)',
              backgroundColor: dragActive
                ? 'color-mix(in oklab, var(--primary) 5%, transparent)'
                : 'var(--surface)',
              transition: `border-color var(--dur-fast), background-color var(--dur-fast)`,
              cursor: 'pointer',
              outline: 'none',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />

            <Stack align="center" justify="center">
              <Upload
                className="dndev-size-lg"
                style={{ color: 'var(--muted-foreground)' }}
              />
              <Text as="p" variant="muted" level="small" textAlign="center">
                {multiple
                  ? t('file.upload.dragDropMultiple')
                  : t('file.upload.dragDropSingle')}
              </Text>
            </Stack>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <Stack gap="tight">
            {files.map((fileData, index) => {
              const mimeType =
                fileData.uploaded && 'mimeType' in fileData.uploaded
                  ? (fileData.uploaded as FileAsset).mimeType
                  : fileData.file.type;
              const iconType = getFileIcon(mimeType || '', fileData.file.name);
              const isFileUploading = fileData.status === 'uploading';
              const fileSize =
                fileData.uploaded && 'size' in fileData.uploaded
                  ? (fileData.uploaded as FileAsset).size
                  : fileData.file.size;

              return (
                <div
                  key={fileData.id}
                  className="dndev-surface"
                  data-variant="muted"
                  style={{
                    padding: 'var(--gap-md)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--gap-md)',
                  }}
                >
                  <FileTypeIcon type={iconType} className="dndev-size-md" />

                  <Stack gap="none" style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      level="small"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fileData.file.name}
                    </Text>
                    <Text level="caption" variant="muted">
                      {formatFileSize(fileSize)}
                      {fileData.error && (
                        <span style={{ color: 'var(--destructive)' }}>
                          {' '}
                          · {fileData.error}
                        </span>
                      )}
                    </Text>

                    {isFileUploading && (
                      <Progress
                        value={fileData.progress || 0}
                        max={100}
                        style={{ marginTop: 'var(--gap-xs)' }}
                      />
                    )}
                  </Stack>

                  {isFileUploading ? (
                    <Loader2
                      className="dndev-size-sm"
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                  ) : (
                    <Button
                      variant={BUTTON_VARIANT.GHOST}
                      onClick={() => handleDelete(fileData.id)}
                      aria-label={t('file.delete.ariaLabel')}
                    >
                      <X className="dndev-size-sm" />
                    </Button>
                  )}
                </div>
              );
            })}
          </Stack>
        )}

        {helperText && (
          <Text
            level="caption"
            variant={error ? 'destructive' : 'muted'}
            style={{ marginTop: 'var(--gap-xs)' }}
          >
            {helperText}
          </Text>
        )}
      </Stack>
    );
  }
);

FileFieldComponent.displayName = 'FileFieldComponent';

export default FileFieldComponent;
