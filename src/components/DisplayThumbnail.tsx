'use client';
// packages/features/crud/src/components/DisplayThumbnail.tsx

/**
 * @fileoverview DisplayThumbnail component
 * @description Renders the thumbnail of the first picture (pictures[0]) for list cards and list views.
 * Normalizes string (backend-optimized thumbUrl), single Picture, or Picture[].
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { handleImageError } from '@donotdev/components';
import type { Picture } from '@donotdev/core';

/** Props for {@link DisplayThumbnail}, renders the first picture thumbnail for list/card views. */
export interface DisplayThumbnailProps {
  /** Picture(s) from item — string (optimized thumbUrl), single Picture, or Picture[] */
  pictures: Picture[] | Picture | string | null;
  /** Alt text for the image */
  alt?: string;
  /** CSS aspect-ratio (e.g. '16/9', '4/3') */
  aspectRatio?: string;
  /** Optional className for the wrapper */
  className?: string;
  /** Optional inline style for the wrapper */
  style?: React.CSSProperties;
}

/**
 * Resolve first picture URL from string, single Picture, or Picture[].
 */
function getFirstThumbUrl(
  pictures: Picture[] | Picture | string | null
): string | null {
  if (pictures == null) return null;
  if (typeof pictures === 'string') return pictures || null;
  const first = Array.isArray(pictures) ? pictures[0] : pictures;
  if (!first || typeof first !== 'object') return null;
  const url = first.thumbUrl ?? first.fullUrl;
  return typeof url === 'string' ? url : null;
}

/**
 * DisplayThumbnail - Renders thumbnail of first picture for list cards.
 * Used by CrudCard and any list view that needs a single thumbnail.
 */
export function DisplayThumbnail({
  pictures,
  alt = '',
  aspectRatio = '16/9',
  className,
  style,
}: DisplayThumbnailProps): React.ReactElement | null {
  const src = getFirstThumbUrl(pictures);
  if (!src) return null;

  return (
    <div
      className={className}
      style={{
        width: '100%',
        aspectRatio,
        // A surface, as its placeholder and the ImageGallery thumbnails
        borderRadius: 'var(--radius-surface)',
        overflow: 'hidden',
        backgroundColor: 'var(--muted)',
        position: 'relative',
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={handleImageError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );
}

/**
 * Side of the square image thumbnail in compact displays (list cells): the image
 * field's compact display (`registerBuiltinFieldTypes`) and {@link ImagePlaceholder}.
 * One value, so a cell with and one without an image keep the same size.
 *
 * @since 0.3.8
 */
export const LIST_THUMBNAIL_SIZE = '40px';

// Module-level: no style object per render
const PLACEHOLDER_STYLE = {
  display: 'block',
  width: LIST_THUMBNAIL_SIZE,
  height: LIST_THUMBNAIL_SIZE,
  flexShrink: 0,
  borderRadius: 'var(--radius-surface)',
  backgroundColor: 'var(--muted)',
} as const;

/**
 * Neutral 40 px tile standing for a missing image in compact displays (list cells),
 * so an image column keeps its rhythm instead of showing a dash. Decorative
 * (`aria-hidden`): the empty value has nothing to announce.
 *
 * @version 0.1.0
 * @since 0.3.8
 */
export function ImagePlaceholder(): React.ReactElement {
  return <span aria-hidden="true" data-image-placeholder="" style={PLACEHOLDER_STYLE} />;
}

export default DisplayThumbnail;
