import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — SectionHeading
 *
 * Consolidates the 80+ "eyebrow"-style section titles scattered across
 * modules. The drift this primitive absorbed (all four hand-rolled the
 * same uppercase combo):
 *   - text-style-caption font-bold text-subtle uppercase tracking-widest  (53 matches)
 *   - text-xs  font-bold text-subtle uppercase tracking-widest  (majority of Fizruk)
 *   - text-xs  text-muted uppercase tracking-wide font-semibold (Finyk)
 *   - text-2xs text-nutrition/70 font-bold uppercase tracking-wide (nutrition macros)
 *
 * Sizes drive **font scale + weight + kicker chrome** only. Colour
 * is picked via `variant` (see `docs/design/COMPONENT_API.md`) so the same size
 * can render in `subtle` (default eyebrow on cards), `muted`, or a
 * module-branded tint (finyk / fizruk / routine / nutrition). Semantics
 * default to <h3>.
 *
 * **Кікер — це смужка й колір, а не капс** (правило 4 типографіки тексту,
 * `docs/05-design/design/anti-slop-strategy.md`; рішення власника
 * 2026-08-06 на `mockups/product/kickers.html`). Кікер `xs` більше не
 * робить `uppercase` і не розріджує трекінг — деталі й причина в
 * AI-CONTEXT біля `sizeTokens` нижче.
 */

/**
 * Розміри кікера й заголовка.
 *
 * AI-CONTEXT: кікер тут РІВНО ОДИН — `xs`. Колись їх було три (`2xs`,
 * `xs`, `sm`), і різниця між ними полягала лише в трекінгу, який існував
 * заради капсу. Після зняття капсу (рішення власника 2026-08-06) вони
 * стали трьома іменами одного результату — стан, що гниє: наступний
 * викликач обирає `sm`, вважаючи його більшим, витрачає на це увагу й не
 * отримує нічого.
 *
 * Спершу вони лишились як `@deprecated`-синоніми, бо їх було 73 у 46
 * файлах і PR на стільки файлів ніхто б не прочитав. Прибрані 2026-08-06
 * на прохання власника — одним проходом, разом із рештою механічного
 * боргу. Тепер це не угода про стиль, а ТИП: `size="sm"` більше не
 * компілюється, тож розходження не може повернутись непоміченим.
 *
 * «Полагодити», давши кікерам справжню різницю в розмірі, НЕ можна: 12px
 * — підлога типографічної шкали, нижче не пускає доступність, а вище — це
 * вже не кікер, а заголовок (`md`).
 */
export type SectionHeadingSize = "xs" | "md" | "lg" | "xl";

export type SectionHeadingVariant =
  | "subtle"
  | "muted"
  | "text"
  | "accent"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

/**
 * Font-weight override. Default is size-dependent (eyebrow sizes bold,
 * md semibold, lg/xl extrabold). Primary use-case is the Finyk drift
 * "text-xs text-muted uppercase tracking-wide font-semibold" — after this
 * prop exists, call-sites can opt-in via `<SectionHeading weight="semibold">`
 * and drop their raw-className eslint-disable. `normal` covers the
 * `text-[11px] uppercase tracking-wide` no-explicit-weight pattern used
 * by sheet sub-headers (see `apps/mobile/src/modules/finyk/pages/Transactions`).
 */
export type SectionHeadingWeight =
  "normal" | "medium" | "semibold" | "bold" | "extrabold";

// Size-only tokens (font-scale + casing + tracking). Weight is applied
// separately so `weight` prop overrides can compose cleanly. The `2xs`
// step maps to text-style-caption (12px) + uppercase + tracking-wide —
// raised from 10px to satisfy HR#16 (minimum 12px text).
// Роль задає РОЗМІР; casing / tracking / weight лишаються шарами поверх
// (той самий патерн, що вже був у `2xs`). eyebrow-розміри сидять на
// `caption` (12px floor, HR#16); md — `label`; lg — `title` (секційний
// заголовок); xl — `headline` (проміжний H2: крок ієрархії title 22 →
// headline 26 і є тим розривом, яким користуємось, cycle-6 acceptance §3).
// AI-CONTEXT: кікер = смужка + колір, а НЕ капс (правило 4 типографіки
// тексту; рішення власника 2026-08-06 на `mockups/product/kickers.html`).
//
// Смужка — `before:`-псевдоелемент, а не вузол: так вона не потрапляє в
// accessible name і не змінює `children`. `bg-current` бере колір варіанта,
// тож смужка не може розійтися з текстом — вона і є текст, тільки геометрія.
// `before:shrink-0` обовʼязковий: у flex-контейнері 2px-елемент інакше
// стискається до нуля, коли рядок довгий.
const KICKER_BAR =
  "flex items-center gap-2 " +
  "before:content-[''] before:w-0.5 before:h-3 before:shrink-0 " +
  "before:rounded-full before:bg-current";

/** Єдиний кікер — див. `SectionHeadingSize`. */
const KICKER = `text-style-caption ${KICKER_BAR}`;

const sizeTokens: Record<SectionHeadingSize, string> = {
  xs: KICKER,
  md: "text-style-label",
  lg: "text-style-title leading-tight",
  xl: "text-style-headline leading-tight",
};

const weightTokens: Record<SectionHeadingWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

// Кікери — `semibold`, не `bold`. Разом із капсом пішла й причина для
// сімсотої ваги: капс сам по собі світліший на око (немає виносних, які
// «чіпляють» погляд), тож вагу піднімали, щоб рядок не зникав. У змішаному
// регістрі 700 на 12px уже читається як другий заголовок поруч із першим.
const defaultWeightForSize: Record<SectionHeadingSize, SectionHeadingWeight> = {
  xs: "semibold",
  md: "semibold",
  lg: "extrabold",
  xl: "extrabold",
};

const variants: Record<SectionHeadingVariant, string> = {
  subtle: "text-subtle",
  muted: "text-muted",
  text: "text-text",
  // `accent` uses `text-brand-strong` (= stone-800 / #292524, the hub
  // ink identity after the 2026-07 design-audit M1 decoupled `brand`
  // from teal/emerald) instead of the global `--c-accent` token, which
  // only clears ~2.4:1 against the cream `bg-bg`. The dark `-strong`
  // ink clears WCAG-AAA on cream. See the SectionHeading contract test
  // that pins the className.
  accent: "text-brand-strong",
  // Module-branded tints — normalised to /70 so callers don't drift
  // between /70, /80, /90. In dark mode the de-emphasised /70 subtitle
  // must still clear WCAG AA (4.5:1) for normal text on `--c-panel`:
  // finyk/routine/fizruk ride the lighter `-300` tier (teal/rose/cyan-300
  // /70 ≈ 5.5–6.3:1), while nutrition's lime-500/70 already clears AA (≈4.9:1).
  finyk: "text-finyk-strong dark:text-finyk-300/70",
  fizruk: "text-fizruk-strong dark:text-fizruk-300/70",
  routine: "text-routine-strong dark:text-routine-300/70",
  nutrition: "text-nutrition-strong dark:text-nutrition/70",
};

// Default variant per size — eyebrow sizes (xs/sm) are muted;
// body-size headings default to the foreground text colour.
// `muted`, не `subtle`: eyebrow — 12px bold, а `text-subtle` у dark дає
// 3.13:1 на панелі (axe serious, design-audit F9); `text-muted` = 6.03:1.
const defaultVariantForSize: Record<SectionHeadingSize, SectionHeadingVariant> =
  {
    xs: "muted",
    md: "text",
    lg: "text",
    xl: "text",
  };

export interface SectionHeadingProps extends HTMLAttributes<HTMLElement> {
  size?: SectionHeadingSize;
  /** Colour variant. Defaults to `subtle` for xs/sm and `text` for md+. */
  variant?: SectionHeadingVariant;
  /**
   * Font-weight override. Defaults to `bold` for xs/sm (eyebrow),
   * `semibold` for md, and `extrabold` for lg/xl. Use `semibold` to
   * match the Finyk eyebrow tone on neutral cards.
   */
  weight?: SectionHeadingWeight;
  as?: ElementType;
  /** Optional right-aligned slot for actions/links. */
  action?: ReactNode;
  /**
   * Optional small DS eyebrow label rendered above the main heading. This
   * pairs a compact uppercase kicker with a larger title in one primitive
   * so call-sites stop hand-rolling the raw `uppercase tracking-* text-*`
   * combo (the `no-eyebrow-drift` pattern) for hero / card kickers. The
   * eyebrow uses the `2xs` size tokens; tone/tag/id are tunable below.
   */
  eyebrow?: ReactNode;
  /** Colour variant for the `eyebrow` slot. Defaults to `subtle`. */
  eyebrowTone?: SectionHeadingVariant;
  /** Semantic tag for the `eyebrow` slot. Defaults to `p`. */
  eyebrowAs?: ElementType;
  /** `id` for the `eyebrow` slot — wire it to `aria-labelledby` on a group. */
  eyebrowId?: string;
  children?: ReactNode;
  /** When `as="button"`, allow specifying the button type. */
  type?: "button" | "submit" | "reset";
  /** When `as="button"`, allow disabling. */
  disabled?: boolean;
}

export function SectionHeading({
  className,
  size = "xs",
  variant,
  weight,
  as: Component = "h3",
  action,
  eyebrow,
  eyebrowTone = "subtle",
  eyebrowAs: EyebrowComponent = "p",
  eyebrowId,
  children,
  ...props
}: SectionHeadingProps) {
  const resolvedVariant = variant ?? defaultVariantForSize[size];
  const resolvedWeight = weight ?? defaultWeightForSize[size];
  const base = cn(
    sizeTokens[size],
    weightTokens[resolvedWeight],
    variants[resolvedVariant],
  );

  const eyebrowNode =
    eyebrow != null ? (
      <EyebrowComponent
        id={eyebrowId}
        className={cn(
          sizeTokens.xs,
          weightTokens[defaultWeightForSize.xs],
          variants[eyebrowTone],
        )}
      >
        {eyebrow}
      </EyebrowComponent>
    ) : null;

  if (action) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div>
          {eyebrowNode}
          <Component className={base} {...props}>
            {children}
          </Component>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  if (eyebrowNode) {
    return (
      <div className={className}>
        {eyebrowNode}
        <Component className={base} {...props}>
          {children}
        </Component>
      </div>
    );
  }

  return (
    <Component className={cn(base, className)} {...props}>
      {children}
    </Component>
  );
}

/**
 * Alias exported so that consumers can import `SectionHeader` alongside
 * `Card` / `Badge` / `Tabs` / etc. Both names resolve to the same
 * component — prefer `SectionHeader` in new code.
 */
export const SectionHeader = SectionHeading;
