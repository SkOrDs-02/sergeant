/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import {
  memo,
  useCallback,
  useMemo,
  type ButtonHTMLAttributes,
  type DragEventHandler,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";
import { getModulePrefetchProps } from "../../lib/intentPrefetch";
import {
  MODULE_CONFIGS,
  type ModuleConfig,
  type ModuleId,
} from "./moduleConfigs";

export interface BentoCardProps {
  config: ModuleConfig;
  onClick: () => void;
  /**
   * Intent-prefetch props applied to the inner primary button.
   */
  primaryProps?: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  /**
   * When `true`, the card is rendered in a muted/greyed-out state
   * because the user did not mark this module as important during
   * onboarding. A hint pointing at Hub Settings is shown in place of
   * the preview numbers.
   */
  inactive?: boolean | undefined;
  /**
   * When `true`, the card is in dashboard "edit mode": it wiggles to
   * signal it is draggable and exposes a visible top-right grip handle.
   * Two explicit move controls keep reordering available to keyboard and
   * coarse-pointer users without nesting controls inside the card button.
   */
  editMode?: boolean | undefined;
  canMovePrevious?: boolean | undefined;
  canMoveNext?: boolean | undefined;
  onMovePrevious?: (() => void) | undefined;
  onMoveNext?: (() => void) | undefined;
  /**
   * Set on the single card the adaptive-bento engine has lifted to the top
   * for the current context (signal × time of day). Renders a small
   * "Зараз" pill with the reason so the reorder is explainable, not magic.
   * `null`/`undefined` = not lifted.
   */
  adaptiveReason?: string | null | undefined;
}

/**
 * Bento-grid module tile rendered inside the 2×2 dashboard layout. Shows
 * the module emoji + label, latest preview numbers (`main`/`sub`) and a
 * progress bar when the module has a daily goal (`hasGoal`).
 *
 * The whole card is the primary `<button>` (tap → open module). In edit
 * mode a drag-handle is rendered as an absolutely-positioned sibling
 * button — sibling, not parent/child, so axe's `nested-interactive`
 * rule passes.
 */
export const BentoCard = memo(function BentoCard({
  config,
  onClick,
  primaryProps,
  inactive,
  editMode,
  canMovePrevious,
  canMoveNext,
  onMovePrevious,
  onMoveNext,
  adaptiveReason,
}: BentoCardProps) {
  const preview = config.getPreview();
  const showProgress =
    !inactive &&
    config.hasGoal &&
    preview.progress !== undefined &&
    preview.progress > 0;
  const hasData = !!(preview.main || preview.sub);
  const showHandle = !!editMode;

  return (
    <div
      className={cn(
        "relative h-full",
        inactive && "opacity-60",
        // Edit-mode wiggle makes the reorder state visible.
        editMode && "motion-safe:animate-wiggle",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        {...primaryProps}
        aria-label={
          inactive
            ? `${config.label} — неактивний модуль. Увімкнути в налаштуваннях Hub.`
            : hasData
              ? `${config.label}: ${preview.main}${preview.sub ? `, ${preview.sub}` : ""}`
              : `${config.label}: ${config.emptyLabel}`
        }
        data-inactive={inactive ? "true" : undefined}
        className={cn(
          "group relative flex flex-col w-full h-full rounded-3xl border border-line overflow-hidden",
          "p-3.5 pointer-coarse:p-4",
          "min-h-[120px] pointer-coarse:min-h-[132px]",
          "shadow-card transition-interactive text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 focus-visible:ring-offset-2",
          // Hover effect for desktop - lift and glow
          "pointer-fine:hover:shadow-float pointer-fine:hover:-translate-y-0.5",
          "pointer-fine:hover:border-brand-200/50 dark:pointer-fine:hover:border-line/80",
          "active:scale-[0.98] pointer-coarse:active:scale-[0.97]",
          inactive ? "bg-panel grayscale" : config.cardBg,
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div
            aria-hidden
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              inactive ? "bg-line/40 text-muted" : config.iconClass,
            )}
          >
            {config.icon}
          </div>

          {/* Layout placeholder for the absolutely-positioned edit-handle
              sibling — keeps the label centred consistently regardless of
              whether the handle is currently rendered. */}
          {showHandle && <span aria-hidden className="w-6 h-6 shrink-0" />}
        </div>

        <span
          className={cn(
            "font-semibold",
            // Empty cards have no preview number, so the module name is the
            // focal point and is sized up; once data lands the big
            // `preview.main` number takes over as the hero and the name
            // recedes to a caption above it.
            hasData ? "text-xs" : "text-sm",
            inactive ? "text-muted" : "text-text",
          )}
        >
          {config.label}
        </span>

        {!inactive && (
          <span className="text-style-caption text-muted mt-0.5 leading-snug">
            {config.description}
          </span>
        )}

        {adaptiveReason && !inactive && (
          <span
            className={cn(
              "mt-1 inline-flex items-start gap-1 self-start",
              "rounded-full border border-line bg-panel/80 px-2 py-0.5",
              "text-style-caption font-medium text-muted",
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
          <span className="text-style-caption text-muted mt-1 leading-snug">
            Неактивний — увімкнути в налаштуваннях
          </span>
        ) : hasData ? (
          <>
            {preview.main && (
              <span className="text-style-title text-text tabular-nums mt-1 truncate">
                {preview.main}
              </span>
            )}
            {preview.sub && (
              <span className="text-style-caption text-muted mt-0.5 truncate">
                {preview.sub}
              </span>
            )}
          </>
        ) : null}
        {/* Empty cards intentionally render no CTA copy: the whole tile is a
            button (hover-lift on desktop, full tap target on touch) and the
            quick-add `+` sits in the corner for modules that support it. The
            module name + description carry the invitation — the previous
            «Почни тут →» / «Натисни, щоб почати» pair was triple-redundant
            with the card affordance and crowded the tile. */}

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

      {showHandle && (
        <div className="absolute top-3 right-3 flex gap-1 pointer-coarse:top-3.5 pointer-coarse:right-3.5">
          <button
            type="button"
            onClick={onMovePrevious}
            disabled={!canMovePrevious}
            aria-label={`Перемістити ${config.label} назад`}
            className="flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-xl bg-panel/90 text-muted transition-colors hover:bg-panelHi hover:text-text disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
          >
            <Icon name="chevron-left" size="sm" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onMoveNext}
            disabled={!canMoveNext}
            aria-label={`Перемістити ${config.label} вперед`}
            className="flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-xl bg-panel/90 text-muted transition-colors hover:bg-panelHi hover:text-text disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
          >
            <Icon name="chevron-right" size="sm" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
});

export interface ReorderableCardProps {
  id: ModuleId;
  onOpenModule: (id: ModuleId) => void;
  inactive?: boolean;
  /**
   * Enables native desktop drag and explicit previous/next controls.
   */
  editMode?: boolean;
  /**
   * Forwarded to `BentoCard` — adaptive-bento "lifted" reason chip.
   */
  adaptiveReason?: string | null;
  canMovePrevious: boolean;
  canMoveNext: boolean;
  onMovePrevious: () => void;
  onMoveNext: () => void;
  onNativeDragStart: () => void;
  onNativeDrop: () => void;
}

/**
 * Reorderable wrapper around `BentoCard`: native HTML drag on fine pointers,
 * explicit previous/next controls for keyboard and touch users.
 */
export const ReorderableCard = memo(function ReorderableCard({
  id,
  onOpenModule,
  inactive,
  editMode,
  adaptiveReason,
  canMovePrevious,
  canMoveNext,
  onMovePrevious,
  onMoveNext,
  onNativeDragStart,
  onNativeDrop,
}: ReorderableCardProps) {
  const intentProps = useMemo(
    () => (editMode ? null : getModulePrefetchProps(id)),
    [editMode, id],
  );

  const primaryProps = intentProps ?? undefined;

  const handleDragStart: DragEventHandler<HTMLDivElement> = (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    onNativeDragStart();
  };

  // Inactive cards route the user to Hub Settings → Дашборд → "Модулі
  // дашборду" instead of opening the module itself. The card's copy
  // already promises «Неактивний — увімкнути в налаштуваннях» and the
  // quick-add affordance is suppressed for the same reason; navigating
  // back to the toggle list is the affordance the user is being told
  // about. See HubSettingsPage.tsx for the `#settings-dashboard` anchor.
  const handleClick = useCallback(() => {
    if (inactive) {
      openHubSettingsSection("dashboard");
      return;
    }
    onOpenModule(id);
  }, [inactive, onOpenModule, id]);

  const cfg = MODULE_CONFIGS[id];
  if (!cfg) return null;

  return (
    <div
      className="min-w-0 h-full"
      draggable={editMode}
      onDragStart={handleDragStart}
      onDragOver={(event) => {
        if (editMode) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onNativeDrop();
      }}
    >
      <BentoCard
        config={cfg}
        onClick={handleClick}
        primaryProps={primaryProps}
        inactive={inactive}
        editMode={editMode}
        adaptiveReason={adaptiveReason}
        canMovePrevious={canMovePrevious}
        canMoveNext={canMoveNext}
        onMovePrevious={onMovePrevious}
        onMoveNext={onMoveNext}
      />
    </div>
  );
});
