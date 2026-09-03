import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Card Component
 *
 * The Card surface has two layers of decisions:
 *   1. **Identity** — "is this card branded for a module?" → `module` prop
 *      (`finyk` / `fizruk` / `routine` / `nutrition`).
 *   2. **Prominence** — "how loud should the card read on the page?" →
 *      `prominence` prop (`hero` / `soft` / `tinted` / `flat` /
 *      `interactive` / `elevated` / `ghost`).
 *
 * `module` and `prominence` are orthogonal: every prominence has a
 * neutral and a module-tinted version, and the radius is always
 * controlled by the `radius` prop (no more "module variants silently
 * bake `rounded-3xl`").
 *
 * Dark-mode parity: module-branded surfaces (`hero`, `soft`, `tinted`)
 * resolve their tint through the `--c-{module}-soft*` token family
 * defined in `apps/web/src/index.css`. In light mode the tokens are
 * the `-50/-200` family; in dark mode they swap to a deep `-900/-800`
 * family, so module identity stays present across themes — light
 * cards no longer collapse into a near-neutral panel in dark mode.
 *
 * Radius hierarchy — maps to the 3 semantic tiers in `tailwind-preset.js`:
 *   - md  → rounded-xl  (12px, CONTROL) — inline / list cards & chips
 *   - lg  → rounded-2xl (16px, CARD)    — section/panel cards
 *   - xl  → rounded-3xl (24px, HERO)    — hero & module-branded cards
 *
 * The `variant` prop is preserved as a **deprecated alias** for the
 * historical string union (`default` / `interactive` / `flat` /
 * `elevated` / `ghost` / `finyk` / `finyk-soft` / …). Module variant
 * strings are translated to (`module`, `prominence`) internally.
 * Prefer the orthogonal API in new code; existing call-sites keep
 * working unchanged.
 *
 * @example
 *   // Neutral, default surface (page-level content cards)
 *   <Card>...</Card>
 *
 *   // Module-branded hero (Finyk dashboard)
 *   <Card module="finyk" prominence="hero" radius="xl">...</Card>
 *
 *   // Module-tinted soft surface (sub-card inside a module screen)
 *   <Card module="finyk" prominence="soft" radius="lg">...</Card>
 *
 *   // Legacy (still works — emits a deprecation hint via JSDoc only)
 *   <Card variant="finyk-soft">...</Card>
 */

export type CardModule = "finyk" | "fizruk" | "routine" | "nutrition";

export type CardProminence =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | "hero"
  | "soft"
  | "tinted"
  // Sergeant v2 redesign (2026-05, PR-4) — translucent floating-glass
  // surface. Uses `--surface-glass` + `backdrop-blur(12px)` + inset
  // highlight + module-untinted hairline. Opt-in; existing
  // `default`/`interactive`/`flat`/`elevated` surfaces unchanged so
  // 80+ existing call sites keep their look. New v2 module shells +
  // AIPill + InsightCard pick this up explicitly.
  | "glass";

/**
 * @deprecated Prefer the orthogonal `module` + `prominence` props.
 * The string union is kept for back-compat with existing call-sites
 * and is internally mapped to the new API.
 *
 * Термін перенесено 2026-09-03 з 2026-09-01: на дату замір дав ~68
 * call-site-ів `<Card variant="…">` у `apps/web/src` — це окремий
 * механічний codemod-PR, не хвіст. Реєстр: `docs/90-work/tech-debt/frontend.md`
 * § «Прострочені `@removeBy` 2026-09-01».
 * @removeBy 2026-12-01
 */
export type CardVariant =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | CardModule
  | `${CardModule}-soft`;

export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

// Canonical 3-tier radius rhythm — see docs/05-design/design/radius-rhythm.md.
// 2026-07 design-audit: the parallel v2 namespace (`r-lg`/`r-xl`/`r-2xl`,
// 14/18/24 px) was collapsed into this single scale. Its keys mapped onto
// `md`/`lg`/`xl` (r-lg,r-xl → CARD; r-2xl → HERO) so all call sites now use
// the one contract.
export type CardRadius = "md" | "lg" | "xl";

/**
 * Обробка краю — власний матеріал Sergeant (П3, рішення власника
 * 2026-08-06 на `mockups/product/own-material-variants.html`).
 *
 * AI-CONTEXT: це НЕ радіус і не його четверте значення. Радіус описує,
 * наскільки скруглений прямокутник; край описує, чим поверхня взагалі
 * є. `stub` каже «це відривний талон», `rule` — «це аркуш під
 * друкарською лінійкою». Обидва скасовують радіус, і саме тому проп
 * окремий: інакше `radius="stub"` читалося б як «скруглення розміру
 * stub», чого не буває.
 *
 * Навіщо: §3.2 анти-слоп-стратегії міряє 723 входження
 * `rounded-2xl|3xl|full` — це найбільший атрактор у нас, і єдиний, у
 * якого є число. Матеріал бʼє саме по ньому.
 */
export type CardEdge = "stub" | "rule" | "perf";

const edges: Record<CardEdge, string> = {
  /** Окремий документ поза стосом: лінійка зверху + відривний низ. */
  stub: "edge-stub",
  /** Перша поверхня в стосі — лише друкарська лінійка. */
  rule: "edge-rule",
  /** Остання поверхня в стосі — лише відривний низ. */
  perf: "edge-perf",
};

/**
 * Краї, що вирізають перфорацію МАСКОЮ.
 *
 * AI-DANGER: маска зрізає будь-яку тінь на своєму вузлі — і `box-shadow`,
 * і `filter: drop-shadow()` однаково. Заміряно в headless Chromium
 * 2026-08-06 (яскравість під нижнім краєм, 0 = чорне, 255 = біле):
 * фільтр і маска на одному вузлі дають 255/255, тобто рівно те саме, що
 * контрольний `box-shadow`; і лише фільтр на БАТЬКУ дає 125 під зубцем
 * проти 225 під проміжком — тобто рвану тінь по зубцях.
 *
 * Тому `Card` сам загортає масковий край у `.edge-lift`. Це не зручність:
 * помилка тут мовчазна — поверхня не ламається, вона просто втрачає
 * глибину, і побачити це можна лише поруч зі звичайною карткою. Автоматика
 * знімає питання з викликача назавжди.
 *
 * `rule` у цей набір НЕ входить: у нього маски немає — тільки квадратний
 * верх і 2px лінійка, — тож обгортка йому не потрібна.
 */
const MASKED_EDGES: ReadonlySet<CardEdge> = new Set(["stub", "perf"]);

const radii: Record<CardRadius, string> = {
  md: "rounded-xl", // 12px — CONTROL tier
  lg: "rounded-2xl", // 16px — CARD tier
  xl: "rounded-3xl", // 24px — HERO tier
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

// ─── Non-module surfaces ──────────────────────────────────────────────
// Reach for these when the card is **not** branded for a module.
// Padding and radius are layered on top of these by the wrapper below.
// Maps onto the semantic elevation scale (e0..e5) from
// `packages/design-tokens`. `default` is e1 (raised card), `interactive`
// rests at e1 and lifts to e2 on hover (matches the new hover-lift
// contract), and `elevated` sits at e3 so it reads as a clearly higher
// surface than a default card. The `shadow-card` / `shadow-float`
// aliases still resolve here for back-compat in product code, but
// new code below uses the explicit `shadow-eN` utilities.
const NON_MODULE_PROMINENCE: Record<
  Exclude<CardProminence, "hero" | "soft" | "tinted">,
  string
> = {
  default: "bg-panel border border-line shadow-e1",
  interactive:
    "bg-panel border border-line shadow-e1 transition-interactive hover:shadow-e2 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer",
  flat: "bg-panel border border-line",
  elevated: "bg-panel border border-line shadow-e3",
  ghost: "bg-transparent border border-transparent",
  // Sergeant v2 glass — translucent floating surface. `bg-surface-glass`
  // is alpha-baked (0.82 light / 1.0 dark under «Чорнило» / 1.0 HC);
  // `surface-line` is the inset hairline. `shadow-card-v2` keeps the
  // inset top-highlight. Under «Чорнило» the dark surface is fully
  // opaque, so `backdrop-blur` is a pure no-op — `dark:backdrop-blur-none`
  // drops the wasted compositing layer (mobile perf) while leaving the
  // light default frost untouched.
  glass:
    "bg-surface-glass backdrop-blur-md dark:backdrop-blur-none border border-surface-line shadow-card-v2",
};

// ─── Module-branded surfaces ───────────────────────────────────────────
// Each module owns 3 prominence treatments. Light + dark are encoded
// together so call-sites never need to re-implement the dark variant.
//
//   hero    — full saturated identity (light: bg-hero-{module} gradient +
//             down-shadow; dark «Чорнило»: bg-{module}-soft tint + a
//             luminescent tier-400 accent border /25 + inset-glow instead
//             of a drop shadow — depth reads as glow, not elevation).
//   soft    — branded surface on a panel (single token, no /50 wash).
//             Replaces the legacy `bg-{module}-soft/50` pattern that
//             washed out in light and dropped to ~6% in dark.
//   tinted  — "selected" surface. Light: neutral panel + module hairline.
//             Dark «Чорнило»: accent/10 wash + accent/35 border, flat (no
//             shadow) — the quiet accent-tinted state of a picked row/card.
//
// The «Чорнило» treatment is `dark:`-scoped so the light theme (the
// product default) is byte-for-byte unchanged until the § 5 inversion
// (step 6). Accent tier-400 = the module's own luminescent tone, so
// module-accent containment (Hard Rule #12) holds. The accent only ever
// appears as a translucent border/wash/glow — never a saturated solid
// behind text — so no `text-white`/`-strong` companion is needed here.
const MODULE_PROMINENCE: Record<
  CardModule,
  Record<"hero" | "soft" | "tinted", string>
> = {
  finyk: {
    // Light bg/shadow: `bg-hero-grad-finyk` + `shadow-hero-finyk` are the
    // «Чорнило» v3.1 § 3 brand anchor — the same saturated gradient in
    // both themes, a soft down-shadow instead of elevation. Dark:
    // `dark:bg-hero-ink-finyk` sets `background-image`, which overrides
    // the light gradient by itself — no separate `dark:bg-none` reset
    // needed (§ 2). Same fix applies to all 4 modules below — see
    // screenshot bug report 2026-05-18.
    // `soft` до 2026-09-01 ніс `backdrop-blur-sm` поверх непрозорого
    // `bg-*-soft` — візуальний no-op і зайвий GPU-шар на кожну модульну
    // картку (анти-слоп аудит 2026-09-01, F8). Blur лишається лише в
    // `glass` і в overlay-ах, де під ним справді є що розмивати.
    hero: "border shadow-hero-finyk bg-hero-grad-finyk border-white/20 dark:bg-hero-ink-finyk dark:border-brand-400/25 dark:shadow-glow-inset-teal",
    soft: "border bg-finyk-soft border-finyk-soft-border",
    tinted:
      "bg-panel border border-finyk-soft-border shadow-card dark:bg-brand-400/10 dark:border-brand-400/35 dark:shadow-none",
  },
  fizruk: {
    hero: "border shadow-hero-fizruk bg-hero-grad-fizruk border-white/20 dark:bg-hero-ink-fizruk dark:border-cyan-400/25 dark:shadow-glow-inset-cyan",
    soft: "border bg-fizruk-soft border-fizruk-soft-border",
    tinted:
      "bg-panel border border-fizruk-soft-border shadow-card dark:bg-cyan-400/10 dark:border-cyan-400/35 dark:shadow-none",
  },
  routine: {
    hero: "border shadow-hero-routine bg-hero-grad-routine border-white/20 dark:bg-hero-ink-routine dark:border-rose-400/25 dark:shadow-glow-inset-rose",
    soft: "border bg-routine-soft border-routine-soft-border",
    tinted:
      "bg-panel border border-routine-soft-border shadow-card dark:bg-rose-400/10 dark:border-rose-400/35 dark:shadow-none",
  },
  nutrition: {
    hero: "border shadow-hero-nutrition bg-hero-grad-nutrition border-white/20 dark:bg-hero-ink-nutrition dark:border-lime-400/25 dark:shadow-glow-inset-lime",
    soft: "border bg-nutrition-soft border-nutrition-soft-border",
    tinted:
      "bg-panel border border-nutrition-soft-border shadow-card dark:bg-lime-400/10 dark:border-lime-400/35 dark:shadow-none",
  },
};

const SOFT_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)-soft$/;
const MODULE_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)$/;

interface ResolvedVariant {
  readonly module: CardModule | null;
  readonly prominence: CardProminence;
}

/**
 * Maps a legacy `variant` string to the new (`module`, `prominence`)
 * pair, or passes through the new API when the caller uses it
 * directly. The new API wins when both are provided — explicit beats
 * implicit. This is identical to how `<Button>` resolves its
 * `module`-vs-`variant` collision (see Button.tsx line ~178 in the
 * test).
 */
function resolveVariant(
  variant: CardVariant | undefined,
  module: CardModule | undefined,
  prominence: CardProminence | undefined,
): ResolvedVariant {
  if (module || prominence) {
    return {
      module: module ?? null,
      prominence: prominence ?? (module ? "hero" : "default"),
    };
  }
  if (!variant) {
    return { module: null, prominence: "default" };
  }
  if (SOFT_VARIANT_RE.test(variant)) {
    const m = variant.replace("-soft", "") as CardModule;
    return { module: m, prominence: "soft" };
  }
  if (MODULE_VARIANT_RE.test(variant)) {
    return { module: variant as CardModule, prominence: "hero" };
  }
  return {
    module: null,
    prominence: variant as Exclude<CardProminence, "hero" | "soft" | "tinted">,
  };
}

function surfaceClass(resolved: ResolvedVariant): string {
  const { module, prominence } = resolved;
  if (module) {
    if (
      prominence === "hero" ||
      prominence === "soft" ||
      prominence === "tinted"
    ) {
      return MODULE_PROMINENCE[module][prominence];
    }
    // `module` set with a non-module prominence → fall through to the
    // neutral surface but keep the module-tinted hairline so the card
    // still reads as belonging to the module. This makes
    // `<Card module="finyk" prominence="interactive">` a valid combo
    // for clickable list items inside a Finyk screen.
    return cn(
      NON_MODULE_PROMINENCE[prominence],
      `border-${module}-soft-border`,
    );
  }
  if (
    prominence === "hero" ||
    prominence === "soft" ||
    prominence === "tinted"
  ) {
    // Module-only prominences without a module → defensive fallback to
    // the historical default surface. We don't want a runtime throw
    // here because it would crash production for a misconfiguration
    // that's purely cosmetic.
    return NON_MODULE_PROMINENCE.default;
  }
  return NON_MODULE_PROMINENCE[prominence];
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * @deprecated Prefer `module` + `prominence`. Kept for back-compat
   * with existing call-sites; module-style variants are mapped to the
   * new API internally. Термін перенесено разом із `CardVariant` вище.
   * @removeBy 2026-12-01
   */
  variant?: CardVariant | undefined;
  module?: CardModule | undefined;
  prominence?: CardProminence | undefined;
  padding?: CardPadding | undefined;
  radius?: CardRadius | undefined;
  /**
   * Документна обробка краю. Коли задана — `radius` ігнорується, бо
   * обидва описують ту саму межу поверхні й не складаються.
   */
  edge?: CardEdge | undefined;
  as?: ElementType | undefined;
  children?: ReactNode | undefined;
}

/**
 * The historical visual default for legacy module-`-soft` variants was
 * `rounded-2xl` (lg). Preserve that for back-compat when the caller
 * didn't pass an explicit `radius`. New API consumers (`module` +
 * `prominence`) always honour the `radius` prop with the standard
 * `xl` default.
 */
function defaultRadius(
  variant: CardVariant | undefined,
  prominence: CardProminence | undefined,
): CardRadius {
  // Glass surfaces default to CARD tier (`lg` → rounded-2xl, 16px). This
  // was the v2 `r-lg` (14px) before the 2026-07 radius consolidation.
  if (prominence === "glass") return "lg";
  if (variant && SOFT_VARIANT_RE.test(variant)) return "lg";
  return "xl";
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    className,
    variant,
    module,
    prominence,
    padding = "md",
    radius,
    edge,
    as: Component = "div",
    children,
    ...props
  },
  ref,
) {
  const resolved = resolveVariant(variant, module, prominence);
  const effectiveRadius = radius ?? defaultRadius(variant, resolved.prominence);
  // Край скасовує радіус, а не додається до нього: це дві назви однієї
  // межі. Порядок важливий — `edge-*` мусить іти після `surfaceClass`,
  // бо обнуляє його рамку й тінь.
  const surfaceClasses = cn(
    surfaceClass(resolved),
    edge ? edges[edge] : radii[effectiveRadius],
    paddings[padding],
    className,
  );

  if (!edge || !MASKED_EDGES.has(edge)) {
    return (
      <Component ref={ref} className={surfaceClasses} {...props}>
        {children}
      </Component>
    );
  }

  /*
    Масковий край: підйом іде на ЗОВНІШНІЙ вузол, маска — на внутрішній.

    AI-DANGER: зовнішній вузол — це `Component`, тобто те, що просив
    викликач, а НЕ доданий `div`. Спершу я зробив навпаки, і `Card
    as="li"` усередині `ul` давав `<ul><div><li>` — невалідну розмітку
    списку; заразом ламались селектори прямих нащадків і поведінка
    елемента у flex/grid, бо в розкладці батька опинявся чужий вузол.
    Тепер семантичний корінь лишається зовні, а всередину йде рівно
    поверхня.

    Обгортка несе ЛИШЕ фільтр — ні фону, ні рамки, ні відступів. Фон на
    ній був би прямокутником ПОЗА маскою, тобто видимим клаптем під
    зубцями.

    `className` викликача лишається з поверхнею, а не з обгорткою: у
    маскованого краю візуальні класи мусять потрапити під маску,
    інакше вони малюють поза нею.
  */
  return (
    <Component
      ref={ref}
      className={
        resolved.prominence === "interactive"
          ? "edge-lift-interactive"
          : "edge-lift"
      }
      {...props}
    >
      <div className={surfaceClasses}>{children}</div>
    </Component>
  );
});

/**
 * CardHeader — Consistent header section for cards
 */
export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between mb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

/**
 * CardTitle — Title text for cards
 */
export function CardTitle({
  className,
  as: Component = "h3",
  ...props
}: CardTitleProps) {
  return (
    <Component
      className={cn("text-style-title font-semibold text-text", className)}
      {...props}
    />
  );
}

/**
 * CardDescription — Secondary text for cards
 */
export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-style-body text-muted mt-1", className)}
      {...props}
    />
  );
}

/**
 * CardContent — Main content area with optional overflow handling
 */
export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

/**
 * CardFooter — Footer section for actions
 */
export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 mt-4 pt-4 border-t border-line",
        className,
      )}
      {...props}
    />
  );
}
