import { useState } from "react";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import type { Rec } from "../lib/recommendationEngine";

type ModuleId = "finyk" | "fizruk" | "routine" | "nutrition" | "hub";
type Severity = "danger" | "warning";

// Re-export Rec as Recommendation for backward compat
type Recommendation = Rec;

const MODULE_ACCENT: Record<ModuleId, string> = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-primary",
};

const SEVERITY_ACCENT: Record<Severity, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
};

interface RecRowProps {
  rec: Recommendation;
  onAction: (module: string, hash?: string) => void;
  onDismiss?: (id: string) => void;
}

function RecRow({ rec, onAction, onDismiss }: RecRowProps) {
  const accent =
    rec.severity && (rec.severity === "danger" || rec.severity === "warning")
      ? SEVERITY_ACCENT[rec.severity]
      : MODULE_ACCENT[rec.module] || "bg-primary";
  return (
    <div
      className={cn(
        "relative flex gap-3 rounded-xl border border-line bg-bg px-3 py-2.5",
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full",
          accent,
        )}
        aria-hidden
      />
      <div className="pl-1 flex-1 min-w-0">
        <p className="text-sm font-semibold text-text leading-snug">
          {rec.icon && (
            <span className="mr-1" aria-hidden>
              {rec.icon}
            </span>
          )}
          {rec.title}
        </p>
        {rec.body && (
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            {rec.body}
          </p>
        )}
        {rec.action && (
          <button
            type="button"
            onClick={() => onAction(rec.action ?? "", rec.actionHash)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-text hover:text-primary transition-colors"
          >
            Відкрити
            <Icon name="chevron-right" size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={() => onDismiss(rec.id)}
          aria-label="Прибрати"
          title="Прибрати"
          className="shrink-0 -mr-1 -mt-1 text-muted hover:text-text"
        >
          <Icon name="close" size={14} />
        </Button>
      )}
    </div>
  );
}

interface HubInsightsPanelProps {
  items: Recommendation[];
  onOpenModule: (module: string, hash?: string) => void;
  onDismiss?: (id: string) => void;
}

/**
 * Колапсована панель вторинних інсайтів на дашборді. Показує список
 * рекомендацій із нижчим пріоритетом, які не попали в NextCard. Coach-insight
 * більше НЕ рендериться тут — він переїхав усередину NextCard як інлайн-рядок
 * під body. Це знімає дубль-UI: раніше інсайт існував і в картці фокусу, і
 * в цьому блоці окремо.
 */
export function HubInsightsPanel({
  items,
  onOpenModule,
  onDismiss,
}: HubInsightsPanelProps) {
  const [open, setOpen] = useState(false);

  const total = items?.length || 0;
  if (total === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl",
          "border border-line bg-panel",
          "hover:bg-panelHi transition-colors",
        )}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-text">
          Інсайти
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-panelHi text-2xs font-bold text-muted">
            {total}
          </span>
        </span>
        <Icon
          name="chevron-right"
          size={15}
          strokeWidth={2.5}
          className={cn(
            "text-muted transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pt-1">
            {items.map((rec: Recommendation) => (
              <RecRow
                key={rec.id}
                rec={rec}
                onAction={(m: string, hash?: string) =>
                  onOpenModule(m, hash ?? undefined)
                }
                onDismiss={onDismiss}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
