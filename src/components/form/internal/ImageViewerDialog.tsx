'use client';
// packages/features/crud/src/components/form/internal/ImageViewerDialog.tsx

/**
 * @fileoverview Image Viewer Sheet Component
 * @description Side sheet for image editing with smooth crop, rotation, and navigation.
 * Modern UX with real-time preview and intuitive controls.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Trash2,
  Check,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3X3,
} from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import Cropper from 'react-easy-crop';

import {
  Button,
  BUTTON_VARIANT,
  Sheet,
  Stack,
  Text,
  Slider,
  ToggleGroup,
} from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { processImage } from '../../../utils/imageProcessing';
import { createPreviewURL, revokePreviewURL } from '../../../utils/imageUtils';

import type { ImageMetadata } from '../../../utils/imageUtils';
import type { Area, Point } from 'react-easy-crop';

export interface ImageViewerDialogProps {
  /** Array of images */
  images: ImageMetadata[];
  /** Selected image index */
  selectedIndex: number;
  /** Open state */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Update callback */
  onUpdate: (index: number, updates: Partial<ImageMetadata>) => void;
  /** Delete callback */
  onDelete: (index: number) => void;
  /** Navigate callback */
  onNavigate: (index: number) => void;
  /** Multiple mode */
  multiple?: boolean;
}

type AspectRatioOption = 'free' | '1:1' | '4:3' | '16:9' | '3:2';

const ASPECT_RATIOS: Record<AspectRatioOption, number | undefined> = {
  free: undefined,
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
};

/**
 * ImageViewerDialog - Side sheet for image viewing and editing
 * Uses react-easy-crop for smooth, touch-friendly cropping
 */
export function ImageViewerDialog({
  images,
  selectedIndex,
  open,
  onClose,
  onUpdate,
  onDelete,
  onNavigate,
  multiple = false,
}: ImageViewerDialogProps) {
  const { t } = useTranslation('crud');

  // Crop state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('free');
  const [showGrid, setShowGrid] = useState(true);

  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Track original state for reset
  const originalStateRef = useRef({
    crop: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
  });

  const currentImage = images[selectedIndex];
  const canGoPrev = multiple && selectedIndex > 0;
  const canGoNext = multiple && selectedIndex < images.length - 1;

  // Reset state when image changes
  useEffect(() => {
    if (currentImage) {
      const initialState = { x: 0, y: 0 };
      setCrop(initialState);
      setZoom(1);
      setRotation(currentImage.rotation * 90);
      setAspectRatio('free');
      setIsEditing(false);
      setConfirmDelete(false);
      originalStateRef.current = {
        crop: initialState,
        zoom: 1,
        rotation: currentImage.rotation * 90,
      };
    }
  }, [currentImage]);

  // Crop complete handler
  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  // Reset to original state
  const handleReset = useCallback(() => {
    setCrop(originalStateRef.current.crop);
    setZoom(originalStateRef.current.zoom);
    setRotation(originalStateRef.current.rotation);
  }, []);

  // Quick rotation buttons
  const handleRotateLeft = useCallback(() => {
    setRotation((r) => (r - 90 + 360) % 360);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.25, 1));
  }, []);

  const handleFitToView = useCallback(() => {
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }, []);

  // Apply crop and save
  const handleApply = async () => {
    if (!currentImage || !croppedAreaPixels) return;
    setIsProcessing(true);

    try {
      const processed = await processImage(currentImage.file, {
        crop: croppedAreaPixels,
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 0.95,
      });

      const newFile = new File([processed.fullBlob], currentImage.file.name, {
        type: 'image/webp',
      });

      const newPreview = createPreviewURL(newFile);

      // Revoke old preview
      if (currentImage.previewURL.startsWith('blob:')) {
        revokePreviewURL(currentImage.previewURL);
      }

      onUpdate(selectedIndex, {
        file: newFile,
        previewURL: newPreview,
        uploaded: null,
        uploadProgress: null,
        error: null,
        rotation: 0,
      });

      setIsEditing(false);
    } catch (err) {
      console.error('Failed to process image', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete handler
  const handleDelete = useCallback(() => {
    onDelete(selectedIndex);
    setConfirmDelete(false);
    if (images.length === 1) {
      onClose();
    } else if (selectedIndex >= images.length - 1) {
      onNavigate(selectedIndex - 1);
    }
  }, [selectedIndex, images.length, onDelete, onClose, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canGoPrev) {
        onNavigate(selectedIndex - 1);
      } else if (e.key === 'ArrowRight' && canGoNext) {
        onNavigate(selectedIndex + 1);
      } else if (e.key === 'Escape' && isEditing) {
        setIsEditing(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, canGoPrev, canGoNext, selectedIndex, onNavigate, isEditing]);

  if (!currentImage) return null;

  const isUploading =
    currentImage.uploadProgress !== null && currentImage.uploadProgress < 100;
  // Prefer full-res URL for viewer (uploaded.fullUrl), fall back to previewURL (blob or thumb)
  const imageUrl = currentImage.uploaded?.fullUrl || currentImage.previewURL;

  const sheetTitle = multiple
    ? t('image.editor.titleWithIndex', {
        current: selectedIndex + 1,
        total: images.length,
      })
    : t('image.editor.title');

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      side="right"
      title={sheetTitle}
      description={t('image.editor.description')}
      noSwipe={isEditing}
    >
      <Stack gap="large" style={{ height: '100%' }}>
        {/* Image Preview Area */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 300,
            backgroundColor: 'var(--surface-muted)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {isEditing ? (
            /* Cropper - Full interactive editor */
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={ASPECT_RATIOS[aspectRatio]}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              showGrid={showGrid}
              style={{
                containerStyle: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
                cropAreaStyle: {
                  border: '2px solid var(--primary)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                },
              }}
            />
          ) : (
            /* Static preview with navigation */
            <>
              {canGoPrev && (
                <Button
                  variant={BUTTON_VARIANT.GHOST}
                  icon={ChevronLeft}
                  onClick={() => onNavigate(selectedIndex - 1)}
                  aria-label={t('image.editor.previousImage')}
                  style={{
                    position: 'absolute',
                    left: 'var(--gap-sm)',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 10,
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    color: 'white',
                  }}
                />
              )}
              <img
                src={imageUrl}
                alt={`Image ${selectedIndex + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform var(--dur-normal) var(--ease-out)',
                }}
              />
              {canGoNext && (
                <Button
                  variant={BUTTON_VARIANT.GHOST}
                  icon={ChevronRight}
                  onClick={() => onNavigate(selectedIndex + 1)}
                  aria-label={t('image.editor.nextImage')}
                  style={{
                    position: 'absolute',
                    right: 'var(--gap-sm)',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 10,
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    color: 'white',
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Controls */}
        {isEditing ? (
          /* Edit Mode Controls */
          <Stack>
            {/* Aspect Ratio */}
            <Stack gap="tight">
              <Text level="small" variant="muted">
                {t('image.editor.aspectRatio')}
              </Text>
              <ToggleGroup
                type="single"
                value={aspectRatio}
                onValueChange={(v) =>
                  v && setAspectRatio(v as AspectRatioOption)
                }
                items={[
                  { value: 'free', label: t('image.editor.aspectFree') },
                  { value: '1:1', label: '1:1' },
                  { value: '4:3', label: '4:3' },
                  { value: '16:9', label: '16:9' },
                ]}
              />
            </Stack>

            {/* Zoom */}
            <Stack gap="tight">
              <Stack direction="row" justify="between" align="center">
                <Text level="small" variant="muted">
                  {t('image.editor.zoom')}
                </Text>
                <Text level="small" variant="muted">
                  {Math.round(zoom * 100)}%
                </Text>
              </Stack>
              <Stack direction="row" gap="tight" align="center">
                <Button
                  variant={BUTTON_VARIANT.OUTLINE}
                  icon={ZoomOut}
                  display="compact"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                />
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={(v) => setZoom(v[0] ?? 1)}
                  style={{ flex: 1 }}
                />
                <Button
                  variant={BUTTON_VARIANT.OUTLINE}
                  icon={ZoomIn}
                  display="compact"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                />
              </Stack>
            </Stack>

            {/* Rotation */}
            <Stack gap="tight">
              <Stack direction="row" justify="between" align="center">
                <Text level="small" variant="muted">
                  {t('image.editor.rotation')}
                </Text>
                <Text level="small" variant="muted">
                  {rotation}°
                </Text>
              </Stack>
              <Stack direction="row" gap="tight" align="center">
                <Button
                  variant={BUTTON_VARIANT.OUTLINE}
                  icon={RotateCcw}
                  display="compact"
                  onClick={handleRotateLeft}
                  tooltip={t('image.editor.rotateLeft')}
                />
                <Slider
                  value={[rotation]}
                  min={0}
                  max={360}
                  step={1}
                  onValueChange={(v) => setRotation(v[0] ?? 0)}
                  style={{ flex: 1 }}
                />
                <Button
                  variant={BUTTON_VARIANT.OUTLINE}
                  icon={RotateCw}
                  display="compact"
                  onClick={handleRotateRight}
                  tooltip={t('image.editor.rotateRight')}
                />
              </Stack>
            </Stack>

            {/* Tools */}
            <Stack direction="row" gap="tight">
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                icon={Maximize2}
                display="compact"
                onClick={handleFitToView}
                tooltip={t('image.editor.fitToView')}
              />
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                icon={Grid3X3}
                display="compact"
                onClick={() => setShowGrid(!showGrid)}
                tooltip={
                  showGrid
                    ? t('image.editor.hideGrid')
                    : t('image.editor.showGrid')
                }
                data-active={showGrid || undefined}
              />
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                icon={Undo2}
                display="compact"
                onClick={handleReset}
                tooltip={t('image.editor.reset')}
              />
            </Stack>

            {/* Apply / Cancel */}
            <Stack direction="row" style={{ marginTop: 'var(--gap-md)' }}>
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                onClick={() => setIsEditing(false)}
                fullWidth
              >
                {t('image.editor.cancel')}
              </Button>
              <Button
                variant={BUTTON_VARIANT.PRIMARY}
                icon={Check}
                onClick={handleApply}
                disabled={isProcessing}
                fullWidth
              >
                {isProcessing
                  ? t('image.editor.processing')
                  : t('image.editor.apply')}
              </Button>
            </Stack>
          </Stack>
        ) : (
          /* View Mode Controls */
          <Stack>
            {/* Quick Actions */}
            <Stack direction="row" gap="tight" justify="center">
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                icon={RotateCcw}
                display="compact"
                onClick={handleRotateLeft}
                tooltip={t('image.editor.rotateLeft')}
              />
              <Button
                variant={BUTTON_VARIANT.PRIMARY}
                onClick={() => setIsEditing(true)}
                disabled={isUploading}
              >
                {t('image.editor.editButton')}
              </Button>
              <Button
                variant={BUTTON_VARIANT.OUTLINE}
                icon={RotateCw}
                display="compact"
                onClick={handleRotateRight}
                tooltip={t('image.editor.rotateRight')}
              />
            </Stack>

            {/* Delete */}
            {confirmDelete ? (
              <Stack
                style={{
                  border: '1px solid var(--destructive)',
                  padding: 'var(--gap-md)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Text variant="destructive" level="small" textAlign="center">
                  {t('image.editor.deleteConfirm')}
                </Text>
                <Stack direction="row" gap="tight">
                  <Button
                    variant={BUTTON_VARIANT.OUTLINE}
                    onClick={() => setConfirmDelete(false)}
                    fullWidth
                  >
                    {t('image.editor.cancel')}
                  </Button>
                  <Button
                    variant={BUTTON_VARIANT.DESTRUCTIVE}
                    onClick={handleDelete}
                    fullWidth
                  >
                    {t('actions.delete')}
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                variant={BUTTON_VARIANT.GHOST}
                icon={Trash2}
                onClick={() => setConfirmDelete(true)}
                disabled={isUploading}
                style={{ color: 'var(--destructive)' }}
              >
                {t('image.editor.deleteImage')}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Sheet>
  );
}

export default ImageViewerDialog;
