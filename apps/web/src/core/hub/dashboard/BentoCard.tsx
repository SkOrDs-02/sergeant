import { memo, useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { getModulePrefetchProps } from "../../lib/intentPrefetch";
import {
  MODULE_CONFIGS,
  type ModuleConfig,
  type ModuleId,
} from "./moduleConfigs";

export interface BentoCardProps {
  config: ModuleConfig;
  onClick: () => void;
  onQuickAdd?: { label: string; run: () => void } | null;
  /**
   * Ref/props applied to the inner primary `<button>` so dnd-kit can use it
   * as the drag activator. Keeping the activator on the primary button (not
   * the wrapper) allows the quick-add button to live as a sibling instead of
   * a nested interactive control — see the `nested-interactive` axe rule
   * (#839).
   */
  primaryRef?: (node: HTMLButtonElement | null) => void;
  primaryProps?: Record<string, unknown>;
  isDragging?: boolean;
  /**
   * When `true`, the card is rendered in a muted/greyed-out state
   * because the user did not mark this module as important during
   * onboarding. Quick-add is suppressed and a hint pointing at Hub
   * Settings is shown in place of the preview numbers.
   */
  inactive?: boolean;
  /**
   * When `true`, the card is in dashboard "edit mode": it wiggles to
   * signal it is draggable, exposes a visible top-right grip handle, and
   * suppresses quick-add (since the primary affordance is now reorder).
   * The grip handle uses `handleRef` / `handleProps` as the dnd-kit
   * activator so the whole card body can keep navigating to the module
   * on tap.
   */
  editMode?: boolean;
  handleRef?: (node: HTMLButtonElement | null) => void;
  handleProps?: Record<string, unknown>;
  /**
   * Set on the single card the adaptive-bento engine has lifted to the top
   * for the current context (signal × time of day). Renders a small
   * "Зараз" pill with the reason so the reorder is explainable, not magic.
   * `null`/`undefined` = not lifted.
   */
  adaptiveReason?: string | null;
}

/**
 * Bento-grid module tile rendered inside the 2×2 dashboard layout. Shows
 * the module emoji + label, latest preview numbers (`main`/`sub`) and a
 * progress bar when the module has a daily goal (`hasGoal`).
 *
 * The card itself is the primary `<button>`; the small `+` quick-add affordance
 * is rendered as an absolutely-positioned sibling button. They are siblings —
 * not parent/child — so axe's `nested-interactive` rule passes.
 */
export const BentoCard = memo(function BentoCard({
  config,
  onClick,
  onQuickAdd,
  primaryRef,
  primaryProps,
  isDragging,
  inactive,
  editMode,
  handleRef,
  handleProps,
  adaptiveReason,
}: BentoCardProps) {
  const preview = config.getPreview();
  const showProgress =
    !inactive &&
    config.hasGoal &&
    preview.progress !== undefined &&
    preview.progress > 0;
  const hasData = !!(preview.main || preview.sub);
  // Inactive modules suppress quick-add to avoid implying parity with
  // active modules — the user has to reactivate them in Hub Settings
  // before a quick-add affordance reappears.
  // In edit mode quick-add is also suppressed so the only top-right
  // affordance is the drag handle.
  const showQuickAdd = !inactive && !editMode && !!onQuickAdd;
  const showHandle = !!editMode;

  return (
    <div
      className={cn(
        "relative",
        isDragging && "opacity-70 z-50",
        inactive && "opacity-60",
        // Edit-mode wiggle. Suppressed while a card is being dragged so
        // the dnd-kit transform is not fighting the rotation keyframes.
        editMode && !isDragging && "motion-safe:animate-wiggle",
      )}
    >
      <button
        ref={primaryRef}
        type="button"
        onClick={onClick}
        {...primaryProps}
        aria-label={
          inactive
            ? `${config.label} — неактивний модуль. Увімкнути в налаштуваннях Hub.`
            : undefined
        }
        data-inactive={inactive ? "true" : undefined}
        className={cn(
          "group relative flex flex-col w-full rounded-3xl border border-line",
          "p-3.5 [@media(pointer:coarse)]:p-4",
          "min-h-[120px] [@media(pointer:coarse)]:min-h-[132px]",
          "shadow-card transition-interactive text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2",
          // Hover effect for desktop - lift and glow
          "[@media(pointer:fine)]:hover:shadow-float [@media(pointer:fine)]:hover:-translate-y-0.5",
          "[@media(pointer:fine)]:hover:border-brand-200/50 dark:[@media(pointer:fine)]:hover:border-line/80",
          "active:scale-[0.98] [@media(pointer:coarse)]:active:scale-[0.97]",
          inactive ? "bg-panel grayscale" : config.cardBg,
          isDragging && "shadow-float cursor-grabbing",
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              inactive ? "bg-line/40 text-muted" : config.iconClass,
            )}
          >
            {config.icon}
          </div>

          {/* Layout placeholder for the absolutely-positioned quick-add /
              edit-handle sibling — keeps the label centred consistently
              regardless of whether either affordance is currently rendered. */}
          {(showQuickAdd || showHandle) && (
            <span aria-hidden className="w-6 h-6 shrink-0" />
          )}
        </div>

        <span
          className={cn(
            "text-xs font-semibold",
            inactive ? "text-muted" : "text-text",
          )}
        >
          {config.emoji} {config.label}
        </span>

        {adaptiveReason && !inactive && (
          <span
            className={cn(
              "mt-1 inline-flex items-start gap-1 self-start",
              "rounded-full border border-line bg-panel/80 px-2 py-0.5",
              "text-2xs font-medium text-muted",
              // Soft entry animation so the lifted card visibly *animates*
              // its reason chip in, instead of the previous instant-pop
              // that made the adaptive reorder feel like layout jitter.
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300",
            )}
            title={adaptiveReason}
          >
            <span aria-hidden className="leading-none mt-px">
              ✦
            </span>
            {/* Render the full reason instead of a 12-char truncated tail —
             * the reason is what makes the adaptive reorder explainable
             * (e.g. "ранкова кава" / "вечірня вечеря"); chopping it to
             * "ранкова кав…" gave the lift an air of mystery without
             * actually saving meaningful horizontal space (cards already
             * accommodate the chip on a second visual line). */}
            <span className="leading-snug">{adaptiveReason}</span>
          </span>
        )}

        {inactive ? (
          <span className="text-2xs text-muted mt-1 leading-snug">
            Неактивний — увімкнути в налаштуваннях
          </span>
        ) : hasData ? (
          <>
            {preview.main && (
              <span className="text-lg font-bold text-text tabular-nums mt-1 truncate">
                {preview.main}
              </span>
            )}
            {preview.sub && (
              <span className="text-2xs text-muted mt-0.5 truncate">
                {preview.sub}
              </span>
            )}
          </>
        ) : onQuickAdd && !editMode ? (
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1",
              "text-xs font-medium",
              config.accentClass.replace("bg-", "text-"),
              "opacity-80 group-hover:opacity-100 transition-opacity",
            )}
          >
            <Icon name="plus" size="xs" strokeWidth={2.5} aria-hidden />
            {config.emptyLabel}
          </span>
        ) : (
          <span className="text-xs text-muted mt-1">{config.emptyLabel}</span>
        )}

        {showProgress && (
          <div
            className="w-full h-1.5 rounded-full bg-line/60 dark:bg-white/10 overflow-hidden mt-2"
            aria-hidden
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                config.accentClass,
              )}
              style={{ width: `${Math.min(preview.progress ?? 0, 100)}%` }}
            />
          </div>
        )}
      </button>

      {showQuickAdd && onQuickAdd && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd.run();
          }}
          aria-label={onQuickAdd.label}
          title={onQuickAdd.label}
          className={cn(
            "absolute top-3.5 right-3.5 [@media(pointer:coarse)]:top-4 [@media(pointer:coarse)]:right-4",
            // WCAG 2.5.5 / HIG: ≥44×44 on coarse pointers. The visual
            // glyph stays at 28 px on desktop; a `touch-target` floor
            // expands the hit area to 44×44 on touch without bumping
            // the visible icon size to 44 (which would crowd the card
            // header against the module label).
            "w-7 h-7 touch-target",
            "rounded-lg flex items-center justify-center",
            "text-text bg-panel/80 hover:bg-primary hover:text-bg",
            "transition-colors active:scale-95",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
          )}
        >
          <Icon name="plus" size="sm" strokeWidth={2.5} />
        </button>
      )}

      {showHandle && (
        <button
          ref={handleRef}
          type="button"
          {...handleProps}
          aria-label={`Перетягнути ${config.label}`}
          title="Перетягнути для зміни порядку"
          className={cn(
            "absolute top-3.5 right-3.5 [@media(pointer:coarse)]:top-4 [@media(pointer:coarse)]:right-4",
            // Match the quick-add affordance: visible 28 px glyph,
            // 44×44 hit area on coarse pointers via `touch-target`.
            "w-7 h-7 touch-target",
            "rounded-lg flex items-center justify-center",
            "text-muted bg-panel/90 hover:text-text hover:bg-panelHi",
            "transition-colors cursor-grab active:cursor-grabbing touch-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1",
          )}
        >
          <Icon name="grip-vertical" size="sm" strokeWidth={2} />
        </button>
      )}
    </div>
  );
});

export interface SortableCardProps {
  id: ModuleId;
  onOpenModule: (id: ModuleId) => void;
  quickAdd?: { label: string; run: () => void } | null;
  inactive?: boolean;
  /**
   * When `true`, dnd-kit listeners attach to the visible drag handle
   * instead of the primary card button — taps on the body still navigate
   * to the module, while drag is gated to the explicit grip affordance.
   */
  editMode?: boolean;
  /**
   * Forwarded to `BentoCard` — adaptive-bento "lifted" reason chip.
   */
  adaptiveReason?: string | null;
}

/**
 * Drag-sortable wrapper around `BentoCard` that wires up `@dnd-kit/sortable`
 * transforms / listeners. Rendered inside `<SortableContext>` from the
 * parent dashboard so the order persists via `saveDashboardOrder`.
 */
export const SortableCard = memo(function SortableCard({
  id,
  onOpenModule,
  quickAdd,
  inactive,
  editMode,
  adaptiveReason,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  );

  // AI-NOTE: spread dnd-kit attributes/listeners on the *inner* primary button
  // (via `primaryProps` + `setActivatorNodeRef`). Spreading them on the wrapper
  // would either nest interactive controls (button-in-button with quick-add)
  // or attach `role="button"` to a `<div>` whose only focusable child is the
  // primary `<button>` — both fail axe a11y rules.
  // In edit mode the same listeners move to the visible grip handle so
  // accidental drags from the card body don't fight the explicit handle.
  // We also fold in `getModulePrefetchProps(id)` (intent-prefetch on hover/
  // focus) when not editing — the same primary button is the user's "I'm
  // about to open this module" affordance, so warming its chunk on hover
  // shaves the next dynamic-import RTT off the click handler. Suppressed
  // in edit mode because hovers there are about reordering, not opening.
  const dndProps = useMemo(
    () => ({ ...attributes, ...listeners }),
    [attributes, listeners],
  );

  const intentProps = useMemo(
    () => (editMode ? null : getModulePrefetchProps(id)),
    [editMode, id],
  );

  const primaryProps = useMemo(
    () => (editMode ? undefined : { ...dndProps, ...intentProps }),
    [editMode, dndProps, intentProps],
  );

  const handleClick = useCallback(() => onOpenModule(id), [onOpenModule, id]);

  const cfg = MODULE_CONFIGS[id];
  if (!cfg) return null;

  return (
    <div ref={setNodeRef} style={style} className="min-w-0">
      <BentoCard
        config={cfg}
        onClick={handleClick}
        onQuickAdd={quickAdd}
        primaryRef={editMode ? undefined : setActivatorNodeRef}
        primaryProps={primaryProps}
        handleRef={editMode ? setActivatorNodeRef : undefined}
        handleProps={editMode ? dndProps : undefined}
        isDragging={isDragging}
        inactive={inactive}
        editMode={editMode}
        adaptiveReason={adaptiveReason}
      />
    </div>
  );
});
