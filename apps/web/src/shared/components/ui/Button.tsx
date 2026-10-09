import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { useModuleAccent } from "../layout/ModuleAccentProvider";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Button Component
 *
 * ## Orthogonal API (canonical — use this for new code)
 *
 * A button is described by two independent axes, matching the `Badge`
 * (`variant` × `tone`) and `Card` (`module` × `prominence`) contracts so
 * the primitives stay mentally consistent:
 *
 * - **`variant`** — the *emphasis / shape*: `solid` | `soft` | `outline` | `ghost`.
 * - **`tone`** — the *colour family*: `neutral` | `finyk` | `fizruk` |
 *   `routine` | `nutrition` | `danger` | `success` | `ink`.
 *
 * ```tsx
 * <Button variant="solid"   tone="finyk">Додати</Button>   // module CTA
 * <Button variant="soft"    tone="finyk">Скасувати</Button> // module secondary
 * <Button variant="solid"   tone="danger">Видалити</Button> // destructive CTA
 * <Button variant="outline" tone="neutral">Назад</Button>   // neutral outline
 * ```
 *
 * Supported `(variant, tone)` cells map 1:1 onto the tested class strings in
 * `variants` below; unsupported combos fall back to `solid/neutral`.
 *
 * ## Legacy variants (DEPRECATED — kept as thin aliases)
 *
 * The pre-2026-07 flat variant strings fused role + emphasis into one token
 * (`finyk` vs `finyk-soft`) and were duplicated by the `module` prop. They
 * still work — each resolves to a `(variant, tone)` cell with byte-identical
 * output — but new code should use the orthogonal axes.
 *
 * | legacy        | → variant | tone       |
 * |---------------|-----------|------------|
 * | primary       | solid     | neutral    |
 * | secondary     | outline   | neutral    |
 * | ghost         | ghost     | neutral    |
 * | danger        | soft      | danger     |
 * | destructive   | solid     | danger     |
 * | success       | soft      | success    |
 * | finyk…nutrition        | solid | {module} |
 * | {module}-soft          | soft  | {module} |
 * | primary-ink   | solid     | ink        |
 *
 * Touch: `xs` / `sm` / icon-only sizes get `min 44×44px` under `@media (pointer: coarse)`
 * so primary controls stay tappable on phones while staying visually compact on desktop.
 *
 * @see ./Badge.tsx for the reference orthogonal (`variant` × `tone`) contract.
 */

/**
 * Emphasis / shape axis (canonical). Combine with {@link ButtonTone}.
 */
export type ButtonEmphasis = "solid" | "soft" | "outline" | "ghost";

/**
 * Colour-family axis (canonical). Combine with {@link ButtonEmphasis}.
 */
export type ButtonTone =
  | "neutral"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "danger"
  | "success"
  | "ink";

/**
 * @deprecated The flat variant strings fuse emphasis + colour into one token.
 * Prefer the orthogonal `variant` ({@link ButtonEmphasis}) × `tone`
 * ({@link ButtonTone}) API. Kept as aliases; see the mapping table in the
 * component JSDoc. @removeBy 2026-12-01
 */
export type ButtonVariantLegacy =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "success"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk-soft"
  | "fizruk-soft"
  | "routine-soft"
  | "nutrition-soft"
  | "primary-ink";

/**
 * `variant` accepts either a canonical {@link ButtonEmphasis} (use with
 * `tone`) or a {@link ButtonVariantLegacy} alias (deprecated). `ghost` is
 * intentionally shared between both — it is a legacy name *and* a canonical
 * emphasis with identical output.
 */
export type ButtonVariant = ButtonEmphasis | ButtonVariantLegacy;

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

// Internal style source of truth — one class string per legacy key. The
// orthogonal `(variant, tone)` API and the `module` prop both resolve DOWN
// to one of these keys (see `resolveStyleKey`), so every code path emits a
// string that is already covered by the contract tests. Do not inline these
// into the resolver — keeping them flat guarantees byte-identical output
// across the legacy and canonical entry points.
const variants: Record<ButtonVariantLegacy, string> = {
  // Мова H (redesign v3): `primary` = чорнило на сторінці (у темній
  // сторінка на чорнилі, бо токени перевертаються), `secondary` = outline
  // 1 px `border-strong` без тіні. Межу outline-кнопки дає обвід, не заливка.
  primary: "bg-text text-bg hover:bg-text/90 active:bg-text/80",
  secondary:
    "bg-transparent text-text border border-border-strong hover:bg-panel active:bg-panelHi",
  // AI-CONTEXT: `ghost` — НЕ «стриманий secondary». Без бордера й заливки
  // його межу мусить давати РАМКА контейнера, в якому він стоїть. Сусідство
  // з гучною кнопкою межі не замінює — рішення власника 2026-09-15 після
  // заміру «Скасувати» (10 із 11 уже були `secondary`): поки погляд не
  // дійшов до сусіда, тиха кнопка читається як підпис. Кнопка на всю
  // ширину блока рамки не має і читається як голий текст
  // на фоні — знахідка власника 2026-09-15 («кнопки як то оновити чеки
  // голі лежать на фоні»), десять викликів у Налаштуваннях. Для дії-блока
  // бери `secondary`; домальовувати `border border-line` поверх `ghost` не
  // треба — це і є `secondary`, зібраний вручну. Таблиця вибору варіанта —
  // `docs/design/design/design-system/04-components.md` § Button; гейт на
  // Налаштування — `core/settings/settingsActionButtonVariants.test.ts`.
  ghost:
    "bg-transparent text-muted hover:bg-panelHi hover:text-text active:bg-line/50",
  // Темна тема: `--c-danger-soft` там суцільний red-800 (його беруть і
  // банери помилок), тож soft-кнопка ставала насиченим червоним блоком і
  // «Видалити» важило більше за головну дію (критика екранів, хвиля 3).
  // Заливку ведемо тією ж конвенцією, що й soft-варіанти модулів: акцент
  // на низькій прозорості, текст лишається `danger-soft-fg`.
  danger:
    "bg-danger-soft text-danger-soft-fg border border-danger/30 hover:bg-danger/15 hover:border-danger/50 dark:bg-danger/15 dark:border-danger/40 dark:hover:bg-danger/25",
  destructive: "bg-danger-strong text-white hover:brightness-110",
  success:
    "bg-brand-soft text-brand-soft-fg border border-brand-soft-border/50 hover:bg-brand-soft-hover",

  // Модульні суцільні кнопки: лише в hero-контексті модуля. Світла - `-strong`
  // заливка під білим текстом, темна - тир 400 під чорнилом сторінки.
  finyk:
    "bg-finyk-strong text-white hover:bg-teal-900 active:bg-teal-900 dark:bg-finyk dark:text-bg",
  fizruk:
    "bg-fizruk-strong text-white hover:bg-cyan-900 active:bg-cyan-900 dark:bg-fizruk dark:text-bg",
  routine:
    "bg-routine-strong text-white hover:bg-rose-800 active:bg-rose-900 dark:bg-routine dark:text-bg",
  nutrition:
    "bg-nutrition-strong text-white hover:bg-lime-900 dark:bg-nutrition dark:text-bg",

  // Soft module variants (for secondary actions within modules).
  // Dark mode keeps the saturated accent at low opacity for the FILL so the
  // button blends with the warm dark panel instead of reading as an acidic
  // pastel — same convention used by Badge/Tabs. The FOREGROUND, however,
  // is the theme-aware `text-<m>-soft-fg` token (NOT the mid accent): in
  // dark mode the old `dark:text-<m>` ink sat at the same tone as the
  // `bg-<m>/15` fill and measured ~1.77:1 (fizruk) — an a11y fail.
  // `text-<m>-soft-fg` resolves to the `-strong` ink in light and the
  // bright `-300` accent in dark, clearing WCAG AA in both themes from a
  // single class (see `--c-<m>-soft-fg` in theme.css). Readability wins
  // over the blend aesthetic.
  "finyk-soft":
    "bg-finyk-soft text-finyk-soft-fg dark:bg-finyk/15 border border-finyk-ring/50 dark:border-finyk/30 hover:bg-brand-100 dark:hover:bg-finyk/25",
  "fizruk-soft":
    "bg-fizruk-soft text-fizruk-soft-fg dark:bg-fizruk/15 border border-fizruk-ring/50 dark:border-fizruk/30 hover:bg-cyan-100 dark:hover:bg-fizruk/25",
  "routine-soft":
    "bg-routine-surface text-routine-soft-fg dark:bg-routine/15 border border-routine-ring/50 dark:border-routine/30 hover:bg-rose-100 dark:hover:bg-routine/25",
  "nutrition-soft":
    "bg-nutrition-soft text-nutrition-soft-fg dark:bg-nutrition/15 border border-nutrition-ring/50 dark:border-nutrition/30 hover:bg-lime-100 dark:hover:bg-nutrition/25",

  // Sergeant v2 inverted primary — see `ButtonVariant` JSDoc above.
  // `bg-ink-strong` is emerald-900 in light + white in dark (HC: pure
  // #000 / #fff). `text-bg-base` is the corresponding warm-cream / dark
  // base, so the contrast inverts cleanly with the theme.
  "primary-ink":
    "bg-ink-strong text-bg-base hover:opacity-90 active:opacity-80",
};

// RADIUS - мова H (redesign v3): 8 px для всіх розмірів, `xl` теж. Рух лише
// на зміні стану: ні тіні, ні масштабу на hover / active.
const sizes: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-style-label font-medium rounded-lg gap-1.5",
  sm: "h-9 px-3.5 text-style-label font-medium rounded-lg gap-1.5",
  md: "h-11 px-5 text-style-label font-semibold rounded-lg gap-2",
  lg: "h-12 px-6 text-style-label-lg font-semibold rounded-lg gap-2",
  xl: "h-14 px-8 text-style-label-lg font-bold rounded-lg gap-2.5",
};

// Icon-only button sizes
const iconSizes: Record<ButtonSize, string> = {
  xs: "h-8 w-8 rounded-lg",
  sm: "h-9 w-9 rounded-lg",
  md: "h-11 w-11 rounded-lg",
  lg: "h-12 w-12 rounded-lg",
  xl: "h-14 w-14 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  iconOnly?: boolean | undefined;
  loading?: boolean | undefined;
  /** Progress value 0-100 for determinate loading state */
  progress?: number | undefined;
  /**
   * The colour-family axis (canonical). Combine with an emphasis `variant`
   * (`solid` / `soft` / `outline` / `ghost`). Ignored when `variant` is a
   * legacy alias that already encodes its own colour (e.g. `finyk`,
   * `destructive`) — the alias wins so existing call-sites are unaffected.
   */
  tone?: ButtonTone | undefined;
  /**
   * @deprecated Prefer `tone`. When set, redirects the *neutral* `primary` /
   * `secondary` variants to the host module's branded equivalent (e.g.
   * `module="finyk"` + `variant="primary"` → `finyk` solid; `+
   * variant="secondary"` → `finyk-soft`). Equivalent to
   * `tone="finyk"`. @removeBy 2026-12-01
   *
   * Other variants (`ghost`, `danger`, `destructive`, `success`, the
   * already-branded module variants) are passed through unchanged — a
   * destructive Delete button stays red even inside a Fizruk screen.
   *
   * Hub-level chrome (HubHeader, HubChat, dashboard) should leave both
   * `module` and `tone` unset — the neutral stone primary is intentional so
   * the four modules share a hueless parent.
   */
  module?: ModuleAccent | undefined;
  children?: ReactNode | undefined;
}

// The legacy variant union, as a runtime set, so the resolver can tell a
// legacy alias apart from a canonical emphasis word.
const LEGACY_VARIANTS = new Set<string>([
  "primary",
  "secondary",
  "ghost",
  "danger",
  "destructive",
  "success",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "finyk-soft",
  "fizruk-soft",
  "routine-soft",
  "nutrition-soft",
  "primary-ink",
]);

// Legacy `module` prop: redirect a NEUTRAL primary/secondary to the module's
// branded key. Mirrors the pre-2026-07 behaviour exactly (secondary → -soft).
const MODULE_LEGACY_OVERRIDE: Record<
  ModuleAccent,
  Partial<Record<ButtonVariantLegacy, ButtonVariantLegacy>>
> = {
  finyk: { primary: "finyk", secondary: "finyk-soft" },
  fizruk: { primary: "fizruk", secondary: "fizruk-soft" },
  routine: { primary: "routine", secondary: "routine-soft" },
  nutrition: { primary: "nutrition", secondary: "nutrition-soft" },
};

// Canonical `(emphasis, tone)` → internal legacy style key. Only the cells
// that map onto a tested class string are listed; anything else falls back
// to `primary` (solid/neutral). `ghost` is tone-agnostic (single neutral
// treatment), so it maps regardless of tone.
const EMPHASIS_TONE_MAP: Record<
  ButtonEmphasis,
  Partial<Record<ButtonTone, ButtonVariantLegacy>>
> = {
  solid: {
    neutral: "primary",
    ink: "primary-ink",
    danger: "destructive",
    finyk: "finyk",
    fizruk: "fizruk",
    routine: "routine",
    nutrition: "nutrition",
  },
  soft: {
    danger: "danger",
    success: "success",
    finyk: "finyk-soft",
    fizruk: "fizruk-soft",
    routine: "routine-soft",
    nutrition: "nutrition-soft",
  },
  outline: {
    neutral: "secondary",
  },
  ghost: {
    neutral: "ghost",
  },
};

/**
 * Collapse the public API (legacy alias OR canonical `variant` × `tone`,
 * plus the deprecated `module` prop) down to a single internal style key.
 */
function resolveStyleKey(
  variant: ButtonVariant,
  tone: ButtonTone | undefined,
  module: ModuleAccent | undefined,
): ButtonVariantLegacy {
  // Legacy path: a flat alias already encodes emphasis + colour. Preserve
  // the exact pre-2026-07 behaviour, including the `module` redirect.
  if (LEGACY_VARIANTS.has(variant)) {
    const legacy = variant as ButtonVariantLegacy;
    if (module) return MODULE_LEGACY_OVERRIDE[module][legacy] ?? legacy;
    return legacy;
  }

  // Canonical path: `variant` is an emphasis word. `tone` drives colour;
  // `module` is honoured only as a neutral→module shortcut for parity.
  const emphasis = variant as ButtonEmphasis;
  const effectiveTone: ButtonTone =
    (!tone || tone === "neutral") && module ? module : (tone ?? "neutral");
  // Клітинки немає: скидаємо ТОН, не емфазу. `outline` усередині модуля
  // (контекст підміняє нейтральний тон модульним) має лишатись контурним,
  // а не ставати суцільним `primary`. Саме так неактивні фільтри Операцій
  // Фініка виходили чорними, важчими за активний.
  const cells = EMPHASIS_TONE_MAP[emphasis];
  return cells[effectiveTone] ?? cells.neutral ?? "primary";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      tone,
      size = "md",
      type = "button",
      iconOnly = false,
      loading = false,
      progress,
      module,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    // Акцент модуля, у якому стоїть кнопка. Явний проп `module` виграє —
    // контекст лише закриває випадок «проп забули», який доти давав
    // генеричний синій усередині брендованого модуля (PR-C1, рішення
    // власника 2026-09-14; замір: 105 кнопок у модулях + до 117 спільних,
    // коли ті рендеряться всередині модуля).
    //
    // AI-DANGER: жодна кнопка не має змінити ФОРМУ від цього. Тримається
    // це на тому, що всі беспропні виклики йдуть ЛЕГАСІ-гілкою
    // `resolveStyleKey`, де `MODULE_LEGACY_OVERRIDE` мапить лише
    // `primary`/`secondary`, а `ghost`/`danger`/`destructive` проходять
    // наскрізь. У канонічній гілці клітинок `outline × модуль` і
    // `ghost × модуль` у `EMPHASIS_TONE_MAP` немає, тож `resolveStyleKey`
    // скидає тон до нейтрального в межах тієї ж емфази. Пін:
    // `Button.moduleContext.test.tsx`.
    const contextAccent = useModuleAccent();
    const effectiveModule = module ?? contextAccent ?? undefined;

    const isDisabled = disabled || loading;
    const hasProgress = typeof progress === "number" && progress >= 0;
    const needsCoarseMinTarget = iconOnly || size === "xs" || size === "sm";
    const resolvedVariant = resolveStyleKey(variant, tone, effectiveModule);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-live={loading ? "polite" : undefined}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center touch-manipulation",
          "motion-safe:transition-colors motion-safe:duration-base motion-safe:ease-smooth",
          "motion-reduce:transition-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          // Touch / coarse pointer: WCAG 2.5.5 / HIG ≥44×44px for compact controls.
          needsCoarseMinTarget &&
            "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
          // Resolved style key — legacy alias, or canonical variant×tone,
          // collapsed by resolveStyleKey (see its mapping tables).
          variants[resolvedVariant],
          // Size
          iconOnly ? iconSizes[size] : sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            {hasProgress ? (
              <ProgressSpinner progress={progress} className="shrink-0" />
            ) : (
              <LoadingSpinner className="motion-safe:animate-spin" />
            )}
            {!iconOnly && (
              <span className="opacity-0" aria-hidden="true">
                {children}
              </span>
            )}
            <span className="sr-only">
              {hasProgress
                ? `Завантаження ${Math.round(progress)}%`
                : "Завантаження…"}
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

// Loading spinner component. Always decorative — SR announcement is handled by
// the sr-only "Завантаження…" sibling in Button.
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// Determinate progress spinner with circular progress ring
function ProgressSpinner({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 18 18"
    >
      {/* Background circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      {/* Progress circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-base ease-standard"
      />
    </svg>
  );
}
