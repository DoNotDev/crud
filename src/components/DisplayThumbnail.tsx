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
  const first =
    Array.isArray(pictures) && pictures.length > 0
      ? pictures[0]
      : (pictures as Picture);
  if (!first || typeof first !== 'object') return null;
  const url = (first as Picture).thumbUrl ?? (first as Picture).fullUrl;
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
        borderRadius: 'var(--radius-md)',
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

export default DisplayThumbnail;
