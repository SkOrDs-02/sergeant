/**
 * Last validated: 2026-07-20
 * Status: Active
 */
import {
  memo,
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";
import {
  getModulePrefetchProps,
  type ModuleIntentProps,
} from "../../lib/intentPrefetch";
import {
  MODULE_CONFIGS,
  type ModuleConfig,
  type ModuleId,
} from "./moduleConfigs";
import {
  beginNativeSortablePointerDrag,
  handleNativeSortableKeyDown,
  type NativeSortableHandlers,
} from "./nativeSortable";

export interface BentoCardProps {
  config: ModuleConfig;
  onClick: () => void;
  /**
   * Ref/props applied to the inner primary `<button>` for intent-prefetch.
   * Drag activation lives on the grip handle in edit mode (native pointer).
   */
  primaryRef?: ((node: HTMLButtonElement | null) => void) | undefined;
  primaryProps?: Record<string, unknown> | ModuleIntentProps | undefined;
  isDragging?: boolean | undefined;
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
   * The grip handle uses `handleRef` / `handleProps` as the native
   * pointer/keyboard activator so the whole card body can keep navigating
   * to the module on tap.
   */
  editMode?: boolean | undefined;
  handleRef?: ((node: HTMLButtonElement | null) => void) | undefined;
  handleProps?: Record<string, unknown> | undefined;
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
  const showHandle = !!editMode;

  return (
    <div
      className={cn(
        "relative h-full",
        isDragging && "opacity-70 z-50",
        inactive && "opacity-60",
        // Edit-mode wiggle. Suppressed while a card is being dragged so
        // the pointer drag is not fighting the rotation keyframes.
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
          isDragging && "shadow-float cursor-grabbing",
        )}
      >
        {/* Мова «Папір» П3/П4: модульний акцент повертається як видима
            2px-риска по верхньому краю замість пастельної заливки всієї
            плити. Заливка тягнула картку до кольору сторінки (виміряно
            1.03:1 плита↔фон); риска дає край, який видно, і лишає
            композиційну вагу цифрі під ним. */}
        {!inactive && (
          <span
            aria-hidden
            className={cn("absolute inset-x-0 top-0 h-0.5", config.accentClass)}
          />
        )}

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
              <span
                className={cn(
                  "text-style-title tabular-nums mt-1 truncate",
                  config.inkClass,
                )}
              >
                {preview.main}
              </span>
            )}
            {preview.sub && (
              <span className="text-style-caption text-muted mt-0.5 truncate">
                {preview.sub}
              </span>
            )}
          </>
        ) : (
          /* FTUX: порожня картка мовчала — назва + опис, і все. Перший
             екран після онбордінгу нічого не обіцяв. Тепер картка каже,
             що саме тут зʼявиться, і показує приклад справжнього
             значення в mono/модульному ink (мова «Папір», П3) — щоб
             місце під число було видно ще до першого запису. */
          <span className="text-style-caption text-subtle mt-1 leading-snug">
            {config.emptyPromise}{" "}
            <span className={cn("font-mono tabular-nums", config.inkClass)}>
              {config.emptyExample}
            </span>
          </span>
        )}
        {/* Empty cards intentionally render no CTA copy: the whole tile is a
            button (hover-lift on desktop, full tap target on touch) and the
            quick-add `+` sits in the corner for modules that support it. The
            module name + description carry the invitation — the previous
            «Почни тут →» / «Натисни, щоб почати» pair was triple-redundant
            with the card affordance and crowded the tile. */}

        {showProgress && (
          <div
            className="w-full h-1.5 rounded-full bg-panelHi overflow-hidden mt-2"
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
        <button
          ref={handleRef}
          type="button"
          {...handleProps}
          aria-label={`Перетягнути ${config.label}`}
          title="Перетягнути для зміни порядку"
          className={cn(
            "absolute top-3.5 right-3.5 pointer-coarse:top-4 pointer-coarse:right-4",
            // Visible 28 px glyph; 44×44 hit area on coarse pointers via
            // `touch-target`.
            "w-7 h-7 touch-target",
            // CONTROL tier (12 px) per the 3-tier radius system in
            // `tailwind-preset.js` — matches Button iconSizes.xs/sm.
            "rounded-xl flex items-center justify-center",
            "text-muted bg-panel/90 hover:text-text hover:bg-panelHi",
            "transition-colors cursor-grab active:cursor-grabbing touch-none select-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 focus-visible:ring-offset-1",
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
  inactive?: boolean;
  /**
   * When `true`, native pointer/keyboard listeners attach to the visible
   * drag handle — taps on the body still navigate to the module.
   */
  editMode?: boolean;
  /**
   * Forwarded to `BentoCard` — adaptive-bento "lifted" reason chip.
   */
  adaptiveReason?: string | null;
  /** Visual order used for drop-target hit-testing + keyboard moves. */
  displayOrder: readonly string[];
  sortableHandlers: NativeSortableHandlers;
  /** Grid column count for ArrowUp/Down keyboard moves. */
  columns?: number;
}

/**
 * Drag-sortable wrapper around `BentoCard` using native pointer + keyboard
 * reorder (S10-T2 — no `@dnd-kit`). Order persists via `saveDashboardOrder`
 * in the parent dashboard state hook.
 */
export const SortableCard = memo(function SortableCard({
  id,
  onOpenModule,
  inactive,
  editMode,
  adaptiveReason,
  displayOrder,
  sortableHandlers,
  columns = 2,
}: SortableCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const intentProps = useMemo(
    () => (editMode ? null : getModulePrefetchProps(id)),
    [editMode, id],
  );

  const handleClick = useCallback(() => {
    if (inactive) {
      openHubSettingsSection("dashboard");
      return;
    }
    onOpenModule(id);
  }, [inactive, onOpenModule, id]);

  const onHandlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!editMode) return;
      beginNativeSortablePointerDrag({
        event,
        activeId: id,
        getOrder: () => displayOrder,
        handlers: sortableHandlers,
        onDraggingChange: setIsDragging,
      });
    },
    [displayOrder, editMode, id, sortableHandlers],
  );

  const onHandleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!editMode) return;
      handleNativeSortableKeyDown({
        event,
        activeId: id,
        order: displayOrder,
        columns,
        handlers: sortableHandlers,
      });
    },
    [columns, displayOrder, editMode, id, sortableHandlers],
  );

  const handleProps = useMemo(
    () =>
      editMode
        ? {
            onPointerDown: onHandlePointerDown,
            onKeyDown: onHandleKeyDown,
          }
        : undefined,
    [editMode, onHandleKeyDown, onHandlePointerDown],
  );

  const cfg = MODULE_CONFIGS[id];
  if (!cfg) return null;

  return (
    <div
      data-sortable-id={id}
      className={cn(
        "min-w-0 h-full",
        isDragging && "ring-2 ring-focus/40 rounded-3xl",
      )}
    >
      <BentoCard
        config={cfg}
        onClick={handleClick}
        primaryProps={intentProps ?? undefined}
        handleProps={handleProps}
        isDragging={isDragging}
        inactive={inactive}
        editMode={editMode}
        adaptiveReason={adaptiveReason}
      />
    </div>
  );
});
