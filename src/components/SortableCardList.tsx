'use client';
// packages/features/crud/src/components/SortableCardList.tsx

/**
 * @fileoverview SortableCardList component
 * @description Ordered cards the user re-orders by drag-and-drop or move buttons,
 * for an order that is then saved (routine steps, ranked selections).
 *
 * @version 0.2.0
 * @since 0.2.6
 * @author AMBROISE PARK Consulting
 */

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  Announcements,
  DragEndEvent,
  MouseSensorOptions,
  ScreenReaderInstructions,
  TouchSensorOptions,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, GripVertical, X } from 'lucide-react';
import type { MouseEvent, ReactNode, TouchEvent } from 'react';

import { Button, DISPLAY, Grid, Stack } from '@donotdev/components';
import type { GridCols } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

/** Default columns: one card per row on phones, up to four on desktop. */
const DEFAULT_COLS: GridCols = [1, 2, 3, 4];

/** The card's own controls: a press on one is a click, never the start of a drag. */
const CONTROLS = 'a, button, input, select, textarea, label, [contenteditable="true"]';
/** Marks the drag handle, the one control that starts drags. */
const HANDLE_ATTRIBUTE = 'data-sortable-handle';

function startsOnControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(CONTROLS) !== null &&
    target.closest(`[${HANDLE_ATTRIBUTE}]`) === null
  );
}

/** Mouse: primary button, anywhere on the card except its controls. */
class CardMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent: event }: MouseEvent, { onActivation }: MouseSensorOptions) => {
        if (event.button !== 0 || startsOnControl(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** Touch: one finger, anywhere on the card except its controls (after the hold delay). */
class CardTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent: event }: TouchEvent, { onActivation }: TouchSensorOptions) => {
        if (event.touches.length > 1 || startsOnControl(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** Props for {@link SortableCardList}. */
export interface SortableCardListProps {
  /** Item ids, in their current order. Ids must be unique. */
  items: readonly string[];
  /** Receives the new order after a drag or a move button. The caller owns and saves it. */
  onReorder: (items: string[]) => void;
  /** Card content for one item (title, image…). Remove goes through `onRemove`. */
  renderItem: (id: string, index: number) => ReactNode;
  /** Accessible name of an item, used by the handle, the buttons and the announcements. */
  itemLabel: (id: string) => string;
  /** Adds a remove (X) button at the end of each card's bar. */
  onRemove?: (id: string) => void;
  /**
   * Only the handle starts drags (mouse and touch). Use it when the card itself is a
   * link or a button; otherwise the whole card drags. @default false
   */
  handleOnly?: boolean;
  /** Disables dragging and the buttons. @default false */
  disabled?: boolean;
  /** Grid columns. @default [1, 2, 3, 4] */
  cols?: GridCols;
}

interface SortableCardProps {
  id: string;
  index: number;
  count: number;
  label: string;
  disabled: boolean;
  handleOnly: boolean;
  move: (from: number, to: number) => void;
  onRemove?: (id: string) => void;
  children: ReactNode;
}

/** Whole card: grab cursor; touch keeps scrolling and zooming until the hold starts a drag. */
const CARD_DRAG_STYLE = { cursor: 'grab', touchAction: 'manipulation' } as const;
/** Handle: grab cursor; a touch on it never scrolls the page. */
const HANDLE_STYLE = { cursor: 'grab', touchAction: 'none' } as const;

function SortableCard({ id, index, count, label, disabled, handleOnly, move, onRemove, children }: SortableCardProps) {
  const { t } = useTranslation('crud');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  // Keyboard always goes through the handle (the activator): it is the focusable,
  // labelled control. Mouse and touch start from the whole card unless handleOnly.
  const cardListeners = handleOnly || disabled ? undefined : listeners;

  return (
    <Stack
      ref={setNodeRef}
      gap="tight"
      {...cardListeners}
      style={{
        ...(cardListeners ? CARD_DRAG_STYLE : undefined),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <Stack direction="row" align="center" justify="between" gap="tight">
        <Stack direction="row" align="center" gap="none" width="fit">
          <Button
            ref={setActivatorNodeRef}
            {...attributes}
            {...(cardListeners ? undefined : listeners)}
            {...{ [HANDLE_ATTRIBUTE]: '' }}
            variant="ghost"
            icon={GripVertical}
            display={DISPLAY.COMPACT}
            aria-label={t('sortable.drag', { name: label })}
            tooltip={t('sortable.drag', { name: label })}
            disabled={disabled}
            style={HANDLE_STYLE}
          />
          <Button
            variant="ghost"
            icon={ChevronLeft}
            display={DISPLAY.COMPACT}
            aria-label={t('sortable.moveBefore', { name: label })}
            tooltip={t('sortable.moveBefore', { name: label })}
            disabled={disabled || index === 0}
            onClick={() => move(index, index - 1)}
          />
          <Button
            variant="ghost"
            icon={ChevronRight}
            display={DISPLAY.COMPACT}
            aria-label={t('sortable.moveAfter', { name: label })}
            tooltip={t('sortable.moveAfter', { name: label })}
            disabled={disabled || index === count - 1}
            onClick={() => move(index, index + 1)}
          />
        </Stack>
        {onRemove && (
          <Button
            variant="ghost"
            icon={X}
            display={DISPLAY.COMPACT}
            aria-label={t('sortable.remove', { name: label })}
            tooltip={t('sortable.remove', { name: label })}
            disabled={disabled}
            onClick={() => onRemove(id)}
          />
        )}
      </Stack>
      {children}
    </Stack>
  );
}

/**
 * Cards in a grid, re-ordered by dragging (the whole card with a mouse, or after a short
 * hold on touch; only the handle with `handleOnly`), with the keyboard on the handle
 * (Space/Enter, arrows, Space/Enter; Escape cancels), or with the move-before /
 * move-after buttons. `onRemove` adds a remove button. Screen readers get translated
 * instructions and announcements. Stateless: the caller owns `items` and receives each
 * new order in `onReorder`, then saves it. Labels come from the `crud` namespace.
 *
 * @component
 * @example
 * ```tsx
 * <SortableCardList
 *   items={productIds}
 *   onReorder={setProductIds}
 *   onRemove={(id) => setProductIds(productIds.filter((p) => p !== id))}
 *   itemLabel={(id) => products.get(id)?.name ?? id}
 *   renderItem={(id, index) => <Card title={`${index + 1}. ${products.get(id)?.name}`} />}
 * />
 * ```
 */
export function SortableCardList({
  items,
  onReorder,
  renderItem,
  itemLabel,
  onRemove,
  handleOnly = false,
  disabled = false,
  cols = DEFAULT_COLS,
}: SortableCardListProps) {
  const { t } = useTranslation('crud');
  const sensors = useSensors(
    // 8px before a mouse drag starts, 200ms hold on touch: clicks and scrolls stay clicks and scrolls.
    useSensor(CardMouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(CardTouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= items.length || from === to) return;
    onReorder(arrayMove([...items], from, to));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(items.indexOf(String(active.id)), items.indexOf(String(over.id)));
  };

  const name = (id: UniqueIdentifier) => itemLabel(String(id));
  const position = (id: UniqueIdentifier) => items.indexOf(String(id)) + 1;
  const count = items.length;
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: t('sortable.instructions') };
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('sortable.picked', { name: name(active.id), position: position(active.id), count }),
    onDragOver: ({ active, over }) =>
      over ? t('sortable.moved', { name: name(active.id), position: position(over.id), count }) : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('sortable.dropped', { name: name(active.id), position: position(over.id), count })
        : t('sortable.cancelled', { name: name(active.id) }),
    onDragCancel: ({ active }) => t('sortable.cancelled', { name: name(active.id) }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ screenReaderInstructions, announcements }}
    >
      <SortableContext items={[...items]} strategy={rectSortingStrategy} disabled={disabled}>
        <Grid cols={cols} gap="medium">
          {items.map((id, index) => (
            <SortableCard
              key={id}
              id={id}
              index={index}
              count={count}
              label={itemLabel(id)}
              disabled={disabled}
              handleOnly={handleOnly}
              move={move}
              onRemove={onRemove}
            >
              {renderItem(id, index)}
            </SortableCard>
          ))}
        </Grid>
      </SortableContext>
    </DndContext>
  );
}

export default SortableCardList;
