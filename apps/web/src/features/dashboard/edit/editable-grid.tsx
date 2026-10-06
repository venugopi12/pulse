import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Thresholds, WidgetConfig } from "@pulse/shared";
import { Columns2, GripVertical, SlidersHorizontal, X } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { WIDGETS } from "../registry";
import { WidgetCard, gridClass } from "../widget-frame";
import { ThresholdDialog } from "./threshold-dialog";

/**
 * Edit mode grid. dnd-kit moves cards with CSS transforms while dragging and
 * animates the others out of the way; on drop we just reorder the array
 * (order on screen = order in the config).
 *
 * Keyboard: Tab to a grip, Space to pick up, arrow keys to move, Space to
 * drop, Escape to cancel. Screen readers hear where the widget is.
 */
export function EditableGrid({
  widgets,
  onChange,
}: {
  widgets: WidgetConfig[];
  onChange: (widgets: WidgetConfig[]) => void;
}) {
  const sensors = useSensors(
    // 6px before a drag starts, so clicks on the card's buttons still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const title = (id: string | number) => widgets.find((w) => w.id === id)?.title ?? "widget";
  const position = (id: string | number) => widgets.findIndex((w) => w.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}, position ${position(active.id)} of ${widgets.length}.`,
    onDragOver: ({ active, over }) => (over ? `${title(active.id)} moved to position ${position(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `${title(active.id)} dropped at position ${position(over.id)}.` : `${title(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${title(active.id)} cancelled.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = widgets.findIndex((w) => w.id === active.id);
    const to = widgets.findIndex((w) => w.id === over.id);
    onChange(arrayMove(widgets, from, to));
  }

  const update = (id: string, patch: (w: WidgetConfig) => WidgetConfig) =>
    onChange(widgets.map((w) => (w.id === id ? patch(w) : w)));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="grid auto-rows-[minmax(140px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {widgets.map((w) => (
            <SortableWidget
              key={w.id}
              widget={w}
              onRemove={() => onChange(widgets.filter((x) => x.id !== w.id))}
              onResize={() =>
                update(w.id, (x) => ({ ...x, layout: { ...x.layout, colSpan: (x.layout.colSpan % 4) + 1 } }))
              }
              onThresholds={(t) =>
                update(w.id, (x) => {
                  if (x.type !== "kpi" && x.type !== "line") return x;
                  const { thresholds: _old, ...rest } = x;
                  return t ? { ...rest, thresholds: t } : rest;
                })
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableWidget({
  widget,
  onRemove,
  onResize,
  onThresholds,
}: {
  widget: WidgetConfig;
  onRemove: () => void;
  onResize: () => void;
  onThresholds: (t: Thresholds | undefined) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const [editingThresholds, setEditingThresholds] = useState(false);
  const supportsThresholds = WIDGETS[widget.type].supportsThresholds;
  const thresholds = widget.type === "kpi" || widget.type === "line" ? widget.thresholds : undefined;

  return (
    <div
      ref={setNodeRef}
      // Translate, not Transform: cards have different sizes, and dnd-kit's
      // scale component would stretch a 1x1 card when it passes a 3x2 slot.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative min-h-[140px]", gridClass(widget), isDragging && "z-20")}
    >
      <WidgetCard
        widget={widget}
        className={cn(
          "outline-1 outline-offset-2 outline-dashed outline-border-strong",
          isDragging && "outline-accent shadow-[0_24px_48px_-24px_var(--accent-glow)]",
        )}
        toolbar={
          <div className="-my-1 -mr-2 flex items-center gap-0.5">
            {supportsThresholds && (
              <ToolButton label={`Edit thresholds for ${widget.title}`} onClick={() => setEditingThresholds(true)}>
                <SlidersHorizontal />
              </ToolButton>
            )}
            <ToolButton label={`Change width of ${widget.title} (now ${widget.layout.colSpan} of 4)`} onClick={onResize}>
              <Columns2 />
            </ToolButton>
            <ToolButton label={`Remove ${widget.title}`} onClick={onRemove}>
              <X />
            </ToolButton>
            <ToolButton
              ref={setActivatorNodeRef}
              label={`Move ${widget.title}`}
              className="cursor-grab active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </ToolButton>
          </div>
        }
      />
      {supportsThresholds && (
        <ThresholdDialog
          open={editingThresholds}
          onOpenChange={setEditingThresholds}
          title={widget.title}
          initial={thresholds}
          onApply={onThresholds}
        />
      )}
    </div>
  );
}

function ToolButton({ label, className, children, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <Tooltip content={label} side="top">
      <button
        type="button"
        aria-label={label}
        className={cn(
          "flex size-8 items-center justify-center rounded-[6px] text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg [&_svg]:size-4",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
}
