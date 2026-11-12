// packages/features/crud/src/components/CrudCard.tsx

/**
 * @fileoverview CrudCard component
 * @description Presentational card built from entity + item + field slots.
 * Platform-agnostic: no routing. Parent (EntityCardList in ui/expo) handles
 * Link wrapping for navigation.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { Card, Stack, Text, ActionButton } from '@donotdev/components';
import { useTranslation, getListCardFieldNames } from '@donotdev/core';
import type { CrudCardProps, Picture } from '@donotdev/core';

import { formatValue } from './DisplayFieldRenderer';
import { DisplayThumbnail } from './DisplayThumbnail';
import { translateFieldLabel } from '../forms/utils/translateFieldLabel';
import { useCrud } from '../useCrud';

function isImageType(type: string | undefined): boolean {
  return type === 'image' || type === 'images';
}

/**
 * Resolve slot fields: from listCardFields object, or infer from array/listFields.
 */
function useResolvedSlots(entity: CrudCardProps['entity']) {
  return useMemo(() => {
    const l = entity.listCardFields;
    if (l && !Array.isArray(l)) {
      return {
        titleFields: l.title ?? [],
        subtitleFields: l.subtitle ?? [],
        contentFields: l.content ?? [],
        footerFields: l.footer ?? [],
      };
    }
    const fieldsToShow = getListCardFieldNames(entity);
    const other = fieldsToShow.filter(
      (name) => !isImageType(entity.fields[name]?.type)
    );
    const imageInList = fieldsToShow.filter((name) =>
      isImageType(entity.fields[name]?.type)
    );
    const titleFields = other.length > 0 ? [other[0]] : [];
    const contentFields = [...other.slice(1, 4), ...imageInList];
    return {
      titleFields,
      subtitleFields: [] as string[],
      contentFields,
      footerFields: [] as string[],
    };
  }, [entity]);
}

/**
 * CrudCard — Presentational card from entity + item + field slots.
 * Navigation: `href` renders a real link (router-aware); `onClick` for other interactions.
 */
export function CrudCard({
  item,
  entity,
  onClick,
  href,
  titleFields: titleFieldsProp,
  subtitleFields: subtitleFieldsProp,
  contentFields: contentFieldsProp,
  footerFields: footerFieldsProp,
  showDelete = false,
  renderActions,
  renderOverlay,
  className,
}: CrudCardProps) {
  const { t } = useTranslation([entity.namespace, 'crud']);
  const { t: tCrud } = useTranslation('crud');
  const resolved = useResolvedSlots(entity);

  const titleFields = titleFieldsProp ?? resolved.titleFields;
  const subtitleFields = subtitleFieldsProp ?? resolved.subtitleFields;
  const contentFields = contentFieldsProp ?? resolved.contentFields;
  const footerFields = footerFieldsProp ?? resolved.footerFields;

  // Shared options for formatValue — passes item for displayValue resolvers
  const fvItem: Record<string, unknown> = item;

  const title = useMemo(() => {
    if (!titleFields?.length) return item.id ?? '';
    const names = titleFields.filter((n): n is string => typeof n === 'string');
    const parts = names
      .filter((name) => !isImageType(entity.fields[name]?.type))
      .map((name) => {
        const config = entity.fields[name];
        const value = item[name];
        const formatted = config
          ? formatValue(value, config, t, {
              compact: true,
              asString: true,
              item: fvItem,
            })
          : value;
        return typeof formatted === 'string'
          ? formatted
          : String(formatted ?? '');
      })
      .filter(Boolean);
    const separator =
      !Array.isArray(entity.listCardFields) &&
      entity.listCardFields?.titleSeparator != null
        ? entity.listCardFields.titleSeparator
        : ' ';
    return parts.join(separator) || String(item.id ?? '');
  }, [item, entity.fields, titleFields, entity.listCardFields, t]);

  const subtitle = useMemo(() => {
    if (!subtitleFields?.length) return undefined;
    const names = subtitleFields.filter(
      (n): n is string => typeof n === 'string'
    );
    const parts = names
      .filter((name) => !isImageType(entity.fields[name]?.type))
      .map((name) => {
        const config = entity.fields[name];
        const value = item[name];
        const formatted = config
          ? formatValue(value, config, t, {
              compact: true,
              asString: true,
              item: fvItem,
            })
          : value;
        return typeof formatted === 'string'
          ? formatted
          : String(formatted ?? '');
      })
      .filter(Boolean);
    return parts.join(' ') || undefined;
  }, [item, entity.fields, subtitleFields, t]);

  const contentNode = useMemo(() => {
    if (!contentFields?.length) return null;
    const nodes = contentFields.map((fieldName) => {
      const config = entity.fields[fieldName];
      if (!config) return null;
      // Skip field if displayValue resolver returns null for this item
      if (config.options?.displayValue?.(item[fieldName], fvItem, t) === null)
        return null;
      if (isImageType(config.type)) {
        const value = item[fieldName];
        if (value == null) return null;
        return (
          <DisplayThumbnail
            key={fieldName}
            // why: isImageType(config.type) fixes the stored shape; AnyFieldValue cannot be narrowed by the field config
            pictures={value as Picture | Picture[] | string}
            alt={String(title)}
            aspectRatio="16/9"
          />
        );
      }
      return (
        <div key={fieldName}>
          <Text level="small" variant="muted">
            {translateFieldLabel(fieldName, config, t)}
          </Text>
          <Text>
            {formatValue(item[fieldName], config, t, {
              compact: true,
              item: fvItem,
            })}
          </Text>
        </div>
      );
    });
    const filtered = nodes.filter(Boolean);
    return filtered.length > 0 ? (
      <Stack direction="column" gap="tight">
        {filtered}
      </Stack>
    ) : null;
  }, [item, entity.fields, contentFields, title, t]);

  const footerNode = useMemo(() => {
    if (!footerFields?.length) return undefined;
    const hasImage = footerFields.some((name) =>
      isImageType(entity.fields[name]?.type)
    );
    if (hasImage) {
      const nodes = footerFields.map((fieldName) => {
        const config = entity.fields[fieldName];
        if (!config) return null;
        if (isImageType(config.type)) {
          const value = item[fieldName];
          if (value == null) return null;
          return (
            <DisplayThumbnail
              key={fieldName}
              // why: isImageType(config.type) fixes the stored shape; AnyFieldValue cannot be narrowed by the field config
            pictures={value as Picture | Picture[] | string}
              alt=""
              aspectRatio="1"
            />
          );
        }
        const formatted = formatValue(item[fieldName], config, t, {
          compact: true,
          item: fvItem,
        });
        return <span key={fieldName}>{formatted}</span>;
      });
      return (
        <Stack direction="row" gap="tight" align="center">
          {nodes.filter(Boolean)}
        </Stack>
      );
    }
    const parts = footerFields.map((name) => {
      const config = entity.fields[name];
      return config
        ? formatValue(item[name], config, t, { compact: true, item: fvItem })
        : item[name];
    });
    return <Text level="small">{parts.join(' · ')}</Text>;
  }, [item, entity.fields, footerFields, t]);

  const deleteItem = useCrud(entity).delete;

  const actionsNode =
    renderActions || showDelete ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--gap-xs)',
          // Override inherited pointer-events:none from .dndev-card-overlay
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {renderActions}
        {showDelete && (
          <ActionButton
            action={async () => {
              await deleteItem(item.id);
            }}
            confirmText={tCrud('delete.confirm', {
              defaultValue: 'Are you sure you want to delete this item?',
            })}
            confirmTitle={tCrud('delete.title', {
              defaultValue: 'Delete Item',
            })}
            loadingText={tCrud('delete.loading', {
              defaultValue: 'Deleting...',
            })}
            confirmLabel={tCrud('actions.delete')}
            cancelLabel={tCrud('actions.cancel')}
            variant="destructive"
            icon={Trash2}
            aria-label={tCrud('actions.delete')}
          >
            {tCrud('actions.delete')}
          </ActionButton>
        )}
      </div>
    ) : null;

  return (
    <Card
      title={String(title ?? '')}
      subtitle={subtitle}
      content={contentNode ?? undefined}
      footer={footerNode}
      clickable
      elevated
      href={href}
      onClick={onClick ? () => onClick(item.id) : undefined}
      className={className}
      overlay={actionsNode ?? undefined}
      overlayPosition="top-right"
      fullOverlay={renderOverlay ?? undefined}
    />
  );
}

export default CrudCard;
