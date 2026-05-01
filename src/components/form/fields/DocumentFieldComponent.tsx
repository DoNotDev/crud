'use client';
// packages/features/crud/src/components/form/fields/DocumentFieldComponent.tsx

/**
 * @fileoverview Document Field Component
 * @description Document-specific file upload (PDF, Word, Excel, etc.) with storage.
 * Upload state managed by UploadStore via useFileUpload hook.
 *
 * @version 0.2.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  Upload,
  X,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Loader2,
  Eye,
} from 'lucide-react';
import { useState, useRef, useImperativeHandle, forwardRef } from 'react';

import {
  Button,
  BUTTON_VARIANT,
  Text,
  Stack,
  Progress,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@donotdev/components';
import { handleError, useTranslation } from '@donotdev/core';

import { useFileUpload } from '../../../hooks/useFileUpload';
import {
  uploadFile,
  deleteFile,
  getFileIcon,
  formatFileSize,
  getDocumentAcceptString,
} from '../../../utils/fileStorage';

import type { FileEntry, UploadResult } from '../../../stores/UploadStore';
import type { FileAsset } from '../../../utils/fileStorage';
import type { ChangeEvent, DragEvent } from 'react';

export interface DocumentFieldComponentProps {
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
  /** Multiple files mode */
  multiple?: boolean;
  /** Maximum number of files (multiple mode only) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 25MB for documents) */
  maxSize?: number;
  /** Folder path within the storage bucket. Omit to upload to bucket root. */
  storagePath?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Enable PDF preview */
  enablePreview?: boolean;
}

export interface DocumentFieldComponentRef {
  /** Trigger upload of all pending documents */
  upload: () => Promise<void>;
  /** Get current documents */
  getDocuments: () => FileEntry[];
}

/** Valid document extensions */
const VALID_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.html',
  '.csv',
];

/** Document MIME type accept string for file input */
const DOCUMENT_ACCEPT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
];

/**
 * Get icon component based on document type
 */
function DocumentTypeIcon({
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
    case 'text':
    case 'html':
      return <FileText className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

/** Validate document type by extension */
function isValidDocumentType(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return VALID_DOCUMENT_EXTENSIONS.includes(ext);
}

/**
 * DocumentFieldComponent - Document-specific upload with storage
 * Features: Restricted to document types, PDF preview, deferred upload
 */
const DocumentFieldComponent = forwardRef<
  DocumentFieldComponentRef,
  DocumentFieldComponentProps
>(
  (
    {
      name = 'document',
      label,
      value,
      onChange,
      error,
      helperText,
      multiple = false,
      maxFiles = 10,
      maxSize = 25 * 1024 * 1024, // 25MB for documents
      storagePath,
      required,
      enablePreview = true,
    },
    ref
  ) => {
    const { t } = useTranslation('crud');
    const [dragActive, setDragActive] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const acceptString = getDocumentAcceptString();

    // Upload function: File -> FileAsset
    function documentUploadFn(
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
      accept: DOCUMENT_ACCEPT_TYPES,
      storagePath,
      uploadFn: documentUploadFn,
    });

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        upload: async () => {},
        getDocuments: () => files,
      }),
      [files]
    );

    // Handle file input change
    function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
      const inputFiles = Array.from(e.target.files || []);
      if (inputFiles.length > 0) {
        // Additional document type validation before passing to hook
        const validFiles = inputFiles.filter((file) => {
          if (!isValidDocumentType(file)) {
            handleError(new Error('Invalid document type'), {
              userMessage: t('document.errors.invalidType', {
                fileName: file.name,
              }),
              severity: 'warning',
              showNotification: true,
            });
            return false;
          }
          return true;
        });
        if (validFiles.length > 0) addFiles(validFiles);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    // Handle drop
    function handleDrop(e: DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      // Filter for valid document types
      const validFiles = droppedFiles.filter((file) => {
        if (!isValidDocumentType(file)) {
          handleError(new Error('Invalid document type'), {
            userMessage: t('document.errors.invalidType', {
              fileName: file.name,
            }),
            severity: 'warning',
            showNotification: true,
          });
          return false;
        }
        return true;
      });
      if (validFiles.length > 0) addFiles(validFiles);
    }

    // Handle delete with storage cleanup
    async function handleDelete(id: string) {
      const item = files.find((d) => d.id === id);
      if (!item) return;

      try {
        if (item.uploaded && 'url' in item.uploaded) {
          await deleteFile(item.uploaded as FileAsset);
        }
        removeFile(id);
      } catch (err) {
        handleError(err, {
          userMessage: t('document.delete.failed'),
          severity: 'error',
          showNotification: true,
        });
      }
    }

    // Handle preview (PDF only)
    function handlePreview(doc: FileEntry) {
      if (doc.uploaded && 'url' in doc.uploaded) {
        const asset = doc.uploaded as FileAsset;
        if (asset.mimeType === 'application/pdf') {
          setPreviewUrl(asset.url);
        }
      }
    }

    const showDropzone = multiple || files.length === 0;

    return (
      <>
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
              aria-label={t('document.upload.ariaLabel')}
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
                accept={acceptString}
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
                  {t('document.upload.hint')}
                </Text>
                <Text as="p" variant="muted" level="caption" textAlign="center">
                  PDF, Word, Excel, PowerPoint, TXT, Markdown, HTML
                </Text>
              </Stack>
            </div>
          )}

          {/* Document list */}
          {files.length > 0 && (
            <Stack gap="tight">
              {files.map((docData) => {
                const mimeType =
                  docData.uploaded && 'mimeType' in docData.uploaded
                    ? (docData.uploaded as FileAsset).mimeType
                    : docData.file.type;
                const iconType = getFileIcon(mimeType || '', docData.file.name);
                const isDocUploading = docData.status === 'uploading';
                const isPdf =
                  mimeType === 'application/pdf' ||
                  docData.file.name.toLowerCase().endsWith('.pdf');
                const fileSize =
                  docData.uploaded && 'size' in docData.uploaded
                    ? (docData.uploaded as FileAsset).size
                    : docData.file.size;

                return (
                  <div
                    key={docData.id}
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
                    <DocumentTypeIcon
                      type={iconType}
                      className="dndev-size-md"
                    />

                    <Stack gap="none" style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        level="small"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {docData.file.name}
                      </Text>
                      <Text level="caption" variant="muted">
                        {formatFileSize(fileSize)}
                        {docData.error && (
                          <span style={{ color: 'var(--destructive)' }}>
                            {' '}
                            · {docData.error}
                          </span>
                        )}
                      </Text>

                      {isDocUploading && (
                        <Progress
                          value={docData.progress || 0}
                          max={100}
                          style={{ marginTop: 'var(--gap-xs)' }}
                        />
                      )}
                    </Stack>

                    {/* Actions */}
                    <Stack direction="row" gap="tight">
                      {enablePreview &&
                        isPdf &&
                        docData.status === 'complete' && (
                          <Button
                            variant={BUTTON_VARIANT.GHOST}
                            onClick={() => handlePreview(docData)}
                            aria-label={t('document.preview.ariaLabel')}
                          >
                            <Eye className="dndev-size-sm" />
                          </Button>
                        )}

                      {isDocUploading ? (
                        <Loader2
                          className="dndev-size-sm"
                          style={{ animation: 'spin 1s linear infinite' }}
                        />
                      ) : (
                        <Button
                          variant={BUTTON_VARIANT.GHOST}
                          onClick={() => handleDelete(docData.id)}
                          aria-label={t('document.delete.ariaLabel')}
                        >
                          <X className="dndev-size-sm" />
                        </Button>
                      )}
                    </Stack>
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

        {/* PDF Preview Dialog */}
        {enablePreview && previewUrl && (
          <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
            <DialogContent
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                width: '900px',
                height: '80vh',
              }}
            >
              <DialogHeader>
                <DialogTitle>{t('document.preview.title')}</DialogTitle>
              </DialogHeader>
              <iframe
                src={previewUrl}
                sandbox="allow-same-origin"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
                title="PDF Preview"
              />
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }
);

DocumentFieldComponent.displayName = 'DocumentFieldComponent';

export default DocumentFieldComponent;
