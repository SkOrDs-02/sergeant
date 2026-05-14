/* eslint-disable sergeant-design/no-eyebrow-drift -- legend labels are
   the canonical "tiny eyebrow" treatment for showcase toggle groups;
   replacing the inline span with <SectionHeading> would over-promote
   them visually. */
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import {
  useShowcaseSettings,
  type ShowcaseDensity,
  type ShowcaseDirection,
  type ShowcaseReducedMotion,
  type ShowcaseTheme,
} from "./context";

/**
 * Top-bar toggle row. Each control follows the design-system
 * SegmentedControl shape (rounded pill, focus-visible ring) but is
 * implemented locally to keep the showcase file count compact —
 * SegmentedControl in `@shared` requires `value` to be a string union
 * per option, which clashes with the four discrete settings here.
 */
export function ShowcaseToggles() {
  const settings = useShowcaseSettings();

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      role="group"
      aria-label="Налаштування дизайн-системи"
    >
      <ToggleGroup<ShowcaseTheme>
        legend="Тема"
        value={settings.theme}
        onChange={settings.setTheme}
        options={[
          { value: "light", label: "Light", icon: "sun" },
          { value: "dark", label: "Dark", icon: "moon" },
          { value: "hc", label: "HC" },
        ]}
      />
      <ToggleGroup<ShowcaseDensity>
        legend="Щільність"
        value={settings.density}
        onChange={settings.setDensity}
        options={[
          { value: "comfortable", label: "Comfort" },
          { value: "compact", label: "Compact" },
        ]}
      />
      <ToggleGroup<ShowcaseDirection>
        legend="Напрям"
        value={settings.direction}
        onChange={settings.setDirection}
        options={[
          { value: "ltr", label: "LTR" },
          { value: "rtl", label: "RTL" },
        ]}
      />
      <ToggleGroup<ShowcaseReducedMotion>
        legend="Reduced motion"
        value={settings.reducedMotion}
        onChange={settings.setReducedMotion}
        options={[
          { value: "auto", label: "Auto" },
          { value: "force", label: "Force" },
        ]}
      />
    </div>
  );
}

interface ToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: "sun" | "moon";
}

interface ToggleGroupProps<T extends string> {
  legend: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly ToggleOption<T>[];
}

function ToggleGroup<T extends string>({
  legend,
  value,
  onChange,
  options,
}: ToggleGroupProps<T>) {
  return (
    <fieldset className="flex items-center gap-1 border border-line rounded-xl pl-2 pr-1 py-0.5 bg-panel">
      <legend className="sr-only">{legend}</legend>
      <span
        aria-hidden="true"
        className="text-2xs uppercase tracking-wide text-subtle font-mono"
      >
        {legend}
      </span>
      <div className="flex items-center gap-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={cn(
                "px-2 py-1 rounded-md text-2xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                active
                  ? "bg-brand-strong text-white"
                  : "text-muted hover:text-text hover:bg-panelHi",
              )}
            >
              {opt.icon ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name={opt.icon} size={12} />
                  {opt.label}
                </span>
              ) : (
                opt.label
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
