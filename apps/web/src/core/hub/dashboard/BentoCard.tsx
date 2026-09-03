/**
 * Last validated: 2026-07-20
 * Status: Active
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { DashboardModuleId } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { hapticTap } from "@shared/lib/adapters/haptic";
import {
  openHubModuleWithAction,
  openHubSettingsSection,
} from "@shared/lib/modules/hubNav";
import {
  getModulePrefetchProps,
  type ModuleIntentProps,
} from "../../lib/intentPrefetch";
import {
  MODULE_CONFIGS,
  dormantCopyFor,
  type ModuleConfig,
  type ModuleId,
} from "./moduleConfigs";
import { moduleHasRealEntry } from "../../onboarding/firstRealEntry";
import {
  beginNativeSortablePointerDrag,
  handleNativeSortableKeyDown,
  type NativeSortableHandlers,
} from "./nativeSortable";
import { useHubStorageBump } from "../useHubStorageBump";

// ─── #18 Long-press peek ──────────────────────────────────────────────────

const LONG_PRESS_DELAY_MS = 500;

/**
 * Minimal long-press hook. Returns pointer handlers that fire `onLongPress`
 * after `LONG_PRESS_DELAY_MS` ms of held contact. Cancels on move / release.
 * Uses `useRef` for the timer so it is stable across re-renders.
 */
function useLongPress(onLongPress: () => void, disabled = false) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFire = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (disabled || e.button !== 0) return;
      didFire.current = false;
      cancel();
      timerRef.current = setTimeout(() => {
        didFire.current = true;
        onLongPress();
      }, LONG_PRESS_DELAY_MS);
    },
    [cancel, disabled, onLongPress],
  );

  const onPointerUp = useCallback(() => {
    cancel();
  }, [cancel]);

  const onPointerLeave = useCallback(() => {
    cancel();
  }, [cancel]);

  const onPointerCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  // Prevent the click from firing immediately after a long-press fired.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (didFire.current) {
      e.stopPropagation();
      e.preventDefault();
      didFire.current = false;
    }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClickCapture,
  };
}

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
  // Quick-stat writers update localStorage outside this component. Subscribe
  // to the typed Hub signal so the tile swaps its placeholder for live data
  // immediately, without requiring a route round-trip.
  useHubStorageBump();
  const preview = config.getPreview();
  const showProgress =
    !inactive &&
    config.hasGoal &&
    preview.progress !== undefined &&
    preview.progress > 0;
  // Відсутнє значення — це `null`, а не порожній рядок. Раніше воно їхало
  // прямо в шаблон aria-label, тож знімок із однією половиною (стрік є,
  // тренувань цього тижня нема) озвучувався як «Фізрук: null, Серія:
  // 1 тиждень» (browser QA 2026-08-23). Збираємо лише наявні частини.
  const previewParts = [preview.main, preview.sub].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  const hasData = previewParts.length > 0;
  // «Порожньо» ≠ «нічого не було». Модуль із історією, але без записів за
  // поточний період, більше не отримує FTUX-заклик `emptyLabel`.
  const dormant =
    !inactive &&
    !hasData &&
    moduleHasRealEntry(config.module as DashboardModuleId);
  const dormantCopy = dormantCopyFor(config.module);
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
            ? `${config.label}: неактивний модуль. Увімкнути в налаштуваннях Hub.`
            : hasData
              ? `${config.label}: ${previewParts.join(", ")}`
              : dormant
                ? `${config.label}: ${dormantCopy.label}. ${dormantCopy.hint}`
                : `${config.label}: ${config.emptyLabel}`
        }
        data-inactive={inactive ? "true" : undefined}
        className={cn(
          "group relative flex flex-col w-full h-full rounded-3xl border border-line overflow-hidden select-none",
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

        {/* F1 (анти-слоп аудит 2026-09-01): іконка в тонованому квадраті
            над назвою — перша ланка stat-граматики «icon-in-tinted-square →
            назва → підпис → число → чип», однакової на тайлах хабу, стрічці
            Фізрука й «Аналітиці» Їжі (T5 зовнішньої матриці). Бокс знято:
            іконка стоїть у рядку з назвою як ink-гліф модуля, і єдиним
            контейнером тайла лишається сам тайл, а єдиним hero — число. */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 min-w-0 font-semibold",
              // Empty cards have no preview number, so the module name is the
              // focal point and is sized up; once data lands the big
              // `preview.main` number takes over as the hero and the name
              // recedes to a caption above it.
              hasData ? "text-style-caption" : "text-style-label",
              inactive ? "text-muted" : "text-text",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex shrink-0 items-center",
                inactive ? "text-muted" : config.inkClass,
              )}
            >
              {config.icon}
            </span>
            <span className="truncate">{config.label}</span>
          </span>

          {/* Layout placeholder for the absolutely-positioned edit-handle
              sibling — keeps the label row stable regardless of whether the
              handle is currently rendered. */}
          {showHandle && <span aria-hidden className="w-6 h-6 shrink-0" />}
        </div>

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
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-slow",
            )}
            title={adaptiveReason}
          >
            <Icon
              name="sergeant"
              size={12}
              className="shrink-0 mt-px"
              aria-hidden
            />
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
            Неактивний: увімкнути в налаштуваннях
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
            {/* #8 — trend delta vs previous period. Only shown when
                `trendDelta` is a non-null finite number. Positive =
                success-ink (up arrow, green), negative = danger-ink (down
                arrow, red), zero is omitted (no meaningful change to
                communicate). The direction glyph is a design-system `Icon`,
                not a typographic ▲/▼: those come from the system font, so
                their weight and baseline drift per OS and they ignore the
                `strokeWidth` the rest of the card's iconography uses.
                F1 (анти-слоп 2026-09-01): раніше це був чип із заливкою
                (rounded-full плюс 10%-заливка) — ще один контейнер під числом, яке
                й так стоїть під hero-числом. Тепер це рядок тексту в
                caption-ролі: колір несе стан, бокса немає. */}
            {config.trendDelta != null &&
              Number.isFinite(config.trendDelta) &&
              config.trendDelta !== 0 && (
                <span
                  className={cn(
                    "mt-1 inline-flex items-center gap-0.5 self-start",
                    "text-style-caption font-semibold tabular-nums leading-none",
                    "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-slow",
                    config.trendDelta > 0
                      ? "text-success-strong dark:text-success"
                      : "text-danger-strong dark:text-danger",
                  )}
                  aria-label={`Зміна: ${config.trendDelta > 0 ? "+" : ""}${Math.round(config.trendDelta * 100)} %`}
                >
                  <Icon
                    name={
                      config.trendDelta > 0 ? "trending-up" : "trending-down"
                    }
                    size="xs"
                    strokeWidth={2.5}
                  />
                  {Math.abs(Math.round(config.trendDelta * 100))}%
                </span>
              )}
          </>
        ) : dormant ? (
          <>
            {/* Затишшя, не перший запуск. Людині з місяцем історії FTUX-обіцянка
                («Тут зʼявиться КБЖВ, напр. 1250 ккал») бреше про її ж дані —
                тому тут інший текст, без прикладу-заглушки й без «Почни тут →».
                Кільце/спарклайн-привид теж не рендеримо: показувати силует того,
                що вже існує, немає сенсу. */}
            <span
              className="text-style-caption text-muted mt-1 leading-snug"
              data-testid="bento-dormant"
            >
              {dormantCopy.label}
            </span>
            <span className="text-style-caption text-subtle mt-0.5 leading-snug">
              {dormantCopy.hint}
            </span>
          </>
        ) : (
          <>
            {/* FTUX: порожня картка мовчала — назва + опис, і все. Тепер
                картка каже, що тут зʼявиться, і показує приклад значення. */}
            <span className="text-style-caption text-subtle mt-1 leading-snug">
              {config.emptyPromise}{" "}
              <span className={cn("font-mono tabular-nums", config.inkClass)}>
                {config.emptyExample}
              </span>
            </span>
            {/* #10 — ghost preview: faded silhouette of a sparkline (for
                data modules like finyk/fizruk) or a partial arc ring (for
                goal modules like routine/nutrition). Gives the eye a spatial
                anchor for where the real visual will appear, so the empty
                card feels intentional rather than broken.
                `aria-hidden` — decorative; the sr-only label above carries
                the accessible description. */}
            {config.ghostRingPct != null ? (
              <GhostRing
                pct={config.ghostRingPct}
                colorClass={config.inkClass}
              />
            ) : config.ghostPath ? (
              <GhostSparkline
                d={config.ghostPath}
                colorClass={config.inkClass}
              />
            ) : null}
          </>
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
                "h-full rounded-full transition-[width] duration-slowest ease-standard",
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

/* ─── #18 BentoCardPeek sheet ───────────────────────────────────────────── */

/**
 * Compact action sheet that appears on long-press of a BentoCard.
 * Renders as a floating panel anchored below the card's bottom edge with a
 * subtle scale-in animation. Dismissed on backdrop tap, Escape, or after an
 * action is fired.
 */
function BentoCardPeek({
  config,
  moduleId,
  onDismiss,
}: {
  config: ModuleConfig;
  moduleId: string;
  onDismiss: () => void;
}) {
  const actions = config.quickActions;
  if (!actions || actions.length === 0) return null;

  return (
    // Outer dialog wrapper provides the required modal semantics.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Швидкі дії: ${config.label}`}
    >
      {/* Invisible backdrop — tap anywhere outside to dismiss.
          jsx-a11y permits onClick/onKeyDown on role="presentation" elements. */}
      <div
        role="presentation"
        aria-hidden="true"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onDismiss}
        onKeyDown={(e) => e.key === "Escape" && onDismiss()}
      />

      {/* Peek sheet */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 z-50 mx-2 mb-2",
          "rounded-2xl border border-line bg-panel shadow-float",
          "p-2 flex flex-col gap-0.5",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
          "motion-safe:slide-in-from-bottom-2 motion-safe:duration-fast",
        )}
      >
        {/* Drag handle pill for visual affordance */}
        <div
          aria-hidden
          className="mx-auto mb-1 w-8 h-1 rounded-full bg-line"
        />
        <p className="px-2 pb-1 text-style-caption font-semibold text-muted">
          {config.label}
        </p>
        {actions.map((qa) => (
          <button
            key={qa.action}
            type="button"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl",
              "text-style-label font-medium text-text text-left",
              "hover:bg-panelHi active:bg-panelHi/80",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
              "transition-colors",
            )}
            onClick={() => {
              openHubModuleWithAction(
                moduleId as Parameters<typeof openHubModuleWithAction>[0],
                qa.action,
              );
              onDismiss();
            }}
          >
            {/* F1/F5: гліф без тонованого квадрата — той самий ink, що й
                число тайла; контейнером лишається сам рядок дії. */}
            <span
              className={cn(
                "inline-flex w-5 items-center justify-center shrink-0",
                config.inkClass,
              )}
              aria-hidden
            >
              <Icon name={qa.icon} size={16} strokeWidth={2} />
            </span>
            {qa.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── #10 Ghost preview helpers ──────────────────────────────────────────── */

/**
 * A faded sparkline silhouette rendered inside empty module cards. The `d`
 * prop is a small SVG path string (absolute coords, 48×28 viewBox) that
 * represents the characteristic shape of that module's data chart.
 */
function GhostSparkline({ d, colorClass }: { d: string; colorClass: string }) {
  // Wrap in a span that carries the text-color so `stroke="currentColor"`
  // inside the SVG inherits it. Avoids generating arbitrary `stroke-*`
  // Tailwind classes that won't be present in the bundle without a safelist.
  return (
    <span
      aria-hidden
      className={cn(
        "block mt-2 opacity-20",
        colorClass,
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-slower",
      )}
    >
      <svg viewBox="0 0 48 28" className="w-full max-w-[80px] h-auto">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

/**
 * A partial arc ring silhouette used as the ghost for goal-bearing modules
 * (routine, nutrition). `pct` drives the arc length (0–100).
 */
function GhostRing({ pct, colorClass }: { pct: number; colorClass: string }) {
  const r = 11;
  const cx = 14;
  const cy = 14;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circumference;
  return (
    <span
      aria-hidden
      className={cn(
        "block mt-2 opacity-20",
        colorClass,
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-slower",
      )}
    >
      <svg viewBox="0 0 28 28" className="w-7 h-7">
        {/* Track — inherits color at lower opacity via inline style */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="3"
        />
        {/* Fill arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
    </span>
  );
}

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
  // #18 — long-press peek state
  const [peekOpen, setPeekOpen] = useState(false);
  const openPeek = useCallback(() => {
    hapticTap();
    setPeekOpen(true);
  }, []);
  const closePeek = useCallback(() => setPeekOpen(false), []);
  // Disable long-press in edit-mode (drag already owns the gesture) and for
  // inactive cards (they have no actions to show).
  const longPressDisabled = !!editMode || !!inactive;
  const longPressHandlers = useLongPress(openPeek, longPressDisabled);

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
        "min-w-0 h-full relative",
        isDragging && "ring-2 ring-focus/40 rounded-3xl",
      )}
      // R2-V-2 · Shared-element morph: this tile and the matching module
      // header carry the same `view-transition-name`, so tapping the card
      // makes it visually expand into the module chrome (and reverse on
      // exit). Suppressed in edit mode — during drag/reorder the tile is
      // transformed and there is no navigation to transition into, so a
      // captured name would only risk snapshotting a mid-drag frame.
      style={editMode ? undefined : { viewTransitionName: `sgt-module-${id}` }}
      // #18 — long-press peek: attach to the wrapper so the gesture works
      // regardless of which child element is under the pointer.
      {...(!longPressDisabled ? longPressHandlers : {})}
      onContextMenu={(event) => event.preventDefault()}
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
      {/* #18 — peek sheet rendered inside the positioned wrapper */}
      {peekOpen && (
        <BentoCardPeek config={cfg} moduleId={id} onDismiss={closePeek} />
      )}
    </div>
  );
});
