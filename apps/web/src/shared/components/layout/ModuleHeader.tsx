import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";
import { hapticTap } from "@shared/lib/haptic";
import { openHubModule } from "@shared/lib/hubNav";
import { MODULE_LABELS, type HubModuleId } from "@shared/lib/moduleLabels";

/**
 * Sticky module header used by Фінік / Фізрук / Рутина.
 *
 * Owns the layout contract — safe-area padding, 68px min-height, divider,
 * backdrop blur, sticky flex row — and exposes slots so each module can
 * drop in its own back/hub/settings buttons without re-declaring the shell
 * styles. Title/subtitle/eyebrow are conventional text rows; modules that
 * need a completely custom title body can pass `titleSlot` instead.
 *
 * Typical composition:
 *
 *     <ModuleHeader
 *       left={<ModuleHeaderBackButton onClick={onBackToHub} />}
 *       right={<ModuleHeaderIconButton ... />}
 *       title="ФІЗРУК"
 *       eyebrow="ОСОБИСТИЙ ЖУРНАЛ"
 *       subtitle="Тренування · прогрес"
 *     />
 */

export interface ModuleHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /** Override the default title/eyebrow/subtitle body entirely. */
  titleSlot?: ReactNode;
  /** Optional: when provided the header gets a module-colored gradient tint and subtitle uses the module color. */
  module?: ModuleAccent;
  /**
   * Render a row of module-switching chips below the title. Defaults to
   * `true` whenever {@link module} is set so top-level module shells get
   * cross-module navigation for free; sub-pages that should keep the
   * header compact can opt out with `showSwitcher={false}`.
   */
  showSwitcher?: boolean;
  className?: string;
}

const MODULE_HEADER_TOKENS: Record<
  ModuleAccent,
  {
    gradient: string;
    border: string;
    subtitle: string;
    /** Title accent — applied as a left accent dot for module identity. */
    accentDot: string;
    /** Saturated accent strip below the header. */
    accentStrip: string;
  }
> = {
  finyk: {
    gradient: "from-finyk/[.06]",
    border: "border-finyk/[.14]",
    subtitle: "text-finyk-strong dark:text-finyk/70",
    accentDot: "bg-finyk",
    accentStrip: "bg-finyk/45",
  },
  fizruk: {
    gradient: "from-fizruk/[.06]",
    border: "border-fizruk/[.14]",
    subtitle: "text-fizruk-strong dark:text-fizruk/70",
    accentDot: "bg-fizruk",
    accentStrip: "bg-fizruk/45",
  },
  routine: {
    gradient: "from-routine/[.06]",
    border: "border-routine/[.14]",
    subtitle: "text-routine-strong dark:text-routine/70",
    accentDot: "bg-routine",
    accentStrip: "bg-routine/45",
  },
  nutrition: {
    gradient: "from-nutrition/[.06]",
    border: "border-nutrition/[.14]",
    subtitle: "text-nutrition-strong dark:text-nutrition/70",
    accentDot: "bg-nutrition",
    accentStrip: "bg-nutrition/45",
  },
};

export function ModuleHeader({
  title,
  subtitle,
  eyebrow,
  left,
  right,
  titleSlot,
  module,
  showSwitcher,
  className,
}: ModuleHeaderProps) {
  const mt = module ? MODULE_HEADER_TOKENS[module] : null;
  const renderSwitcher = module ? (showSwitcher ?? true) : false;

  return (
    <div
      className={cn(
        "shrink-0 backdrop-blur-md z-40 relative safe-area-pt",
        mt
          ? cn(
              "bg-gradient-to-b to-panel/95",
              mt.gradient,
              mt.border,
              "border-b",
            )
          : "bg-panel/95 border-b border-line",
        className,
      )}
    >
      <div className="flex min-h-[68px] items-center px-4 py-2 sm:px-5 gap-3">
        {left}
        <div className="min-w-0 flex-1">
          {titleSlot ?? (
            <>
              {eyebrow ? (
                // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Module hero kicker uses text-brand-700 tint (WCAG AA ≥4.5:1 on panel); SectionHeading xs does not expose a brand-700 tone, so we render the eyebrow inline rather than via SectionHeading.
                <span className="text-2xs text-brand-700 dark:text-brand/70 font-bold tracking-widest uppercase block leading-none mb-0.5">
                  {eyebrow}
                </span>
              ) : null}
              {title ? (
                <span className="text-[16px] font-semibold tracking-wide text-text leading-tight flex items-center gap-2">
                  {mt ? (
                    <span
                      aria-hidden
                      className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                        mt.accentDot,
                      )}
                    />
                  ) : null}
                  <span className="truncate">{title}</span>
                </span>
              ) : null}
              {subtitle ? (
                <span
                  className={cn(
                    "text-2xs font-medium truncate",
                    mt ? mt.subtitle : "text-subtle",
                  )}
                >
                  {subtitle}
                </span>
              ) : null}
            </>
          )}
        </div>
        {right}
      </div>
      {renderSwitcher && module ? <ModuleSwitcher active={module} /> : null}
      {/* Saturated accent strip — pinned to the bottom edge so module
          identity stays visible even when the header gradient is muted
          (e.g. dark mode, contextual sub-page overrides). */}
      {mt ? (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 right-0 -bottom-px h-px",
            mt.accentStrip,
          )}
        />
      ) : null}
    </div>
  );
}

export interface ModuleHeaderIconButtonProps {
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Standardized 40×40 icon button used in module headers (back, settings).
 */
export function ModuleHeaderIconButton({
  onClick,
  ariaLabel,
  title,
  children,
  className,
}: ModuleHeaderIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors border border-line bg-panel/80",
        className,
      )}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
    >
      {children}
    </button>
  );
}

export interface ModuleHeaderBackButtonProps {
  onClick: () => void;
  /** Visible label next to the chevron (e.g. "Хаб"). */
  label?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * "Back" button variant — used for top-level "to hub" navigation. Renders
 * a chevron + optional label inside the same 40-tall pill as icon buttons.
 */
export function ModuleHeaderBackButton({
  onClick,
  label = "Хаб",
  ariaLabel = "До хабу",
  className,
}: ModuleHeaderBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 h-10 min-h-[40px] -ml-1 pl-2 pr-3 gap-1.5 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors border border-line bg-panel/80",
        className,
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label ? <span className="text-sm font-semibold">{label}</span> : null}
    </button>
  );
}

// Persistent module switcher — 4 chips, always visible inside a module
// header. Tap on a non-active chip dispatches `hub:open-module` so the
// host shell pops the active module and opens the chosen one without
// the user routing back to the hub manually. Active chip uses the
// `-strong` companion behind `text-white` per AGENTS.md rule #9.
//
// `shared/components/layout` is exempt from rule #12 (module-accent
// containment), so referencing all 4 module accents in the same file
// is intentional.

const MODULE_SWITCHER_ORDER: HubModuleId[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

// SVG glyphs are inlined to avoid pulling the full Icon registry into
// every module header — chip icons are tiny and don't change.
const MODULE_SWITCHER_ICONS: Record<HubModuleId, ReactNode> = {
  finyk: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  ),
  fizruk: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </svg>
  ),
  routine: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  nutrition: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 2v7a3 3 0 0 0 3 3v9" />
      <path d="M9 2v20" />
      <path d="M9 9H3" />
      <path d="M14 2c-1.7 0-3 1.3-3 3v7h3V2Z" />
      <path d="M14 12v10" />
      <path d="M21 22V11l-3-3v14" />
    </svg>
  ),
};

const MODULE_SWITCHER_TOKENS: Record<
  HubModuleId,
  { active: string; inactive: string; ring: string }
> = {
  finyk: {
    active: "bg-finyk-strong text-white",
    inactive: "text-finyk-strong dark:text-finyk hover:bg-finyk-soft",
    ring: "focus-visible:ring-finyk",
  },
  fizruk: {
    active: "bg-fizruk-strong text-white",
    inactive: "text-fizruk-strong dark:text-fizruk hover:bg-fizruk-soft",
    ring: "focus-visible:ring-fizruk",
  },
  routine: {
    active: "bg-routine-strong text-white",
    inactive: "text-routine-strong dark:text-routine hover:bg-routine-soft",
    ring: "focus-visible:ring-routine",
  },
  nutrition: {
    active: "bg-nutrition-strong text-white",
    inactive:
      "text-nutrition-strong dark:text-nutrition hover:bg-nutrition-soft",
    ring: "focus-visible:ring-nutrition",
  },
};

export interface ModuleSwitcherProps {
  active: HubModuleId;
  className?: string;
}

export function ModuleSwitcher({ active, className }: ModuleSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Перемикач модулів"
      className={cn("flex items-stretch gap-1 px-3 sm:px-4 pb-2", className)}
    >
      {MODULE_SWITCHER_ORDER.map((id) => {
        const isActive = id === active;
        const tokens = MODULE_SWITCHER_TOKENS[id];
        const label = MODULE_LABELS[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            aria-label={`Перейти до модуля ${label}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              if (isActive) return;
              hapticTap();
              openHubModule(id);
            }}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 h-8 [@media(pointer:coarse)]:h-9 px-2 rounded-xl text-2xs font-semibold tracking-wide transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
              isActive ? tokens.active : tokens.inactive,
              tokens.ring,
            )}
          >
            <span aria-hidden className="shrink-0">
              {MODULE_SWITCHER_ICONS[id]}
            </span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Plain chevron-only back button (no label). Used inside a module when a
 * sub-page (e.g. Atlas, Exercise) wants to return to the module's own
 * dashboard rather than the global hub.
 */
export function ModuleHeaderChevronButton({
  onClick,
  ariaLabel = "Назад",
  className,
}: {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-10 h-10 min-w-[40px] min-h-[40px] -ml-1 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors",
        className,
      )}
      aria-label={ariaLabel}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
