import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatusColor } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  openHubModuleWithAction,
  type HubModuleAction,
  type HubModuleId,
} from "@shared/lib/hubNav";
import { getModulePrimaryAction } from "@shared/lib/moduleQuickActions";
import { generateRecommendations } from "../lib/recommendationEngine";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";

// Reuse the same dismissed-map key HubRecommendations used so user
// dismissals remain stable across the redesign.
const DISMISSED_KEY = "hub_recs_dismissed_v1";

const MODULE_ACCENT = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-primary",
};

// Subtle module-tinted background wash for the primary hero card. Uses the
// low-saturation "soft"/"surface" color tokens defined in tailwind.config;
// opacity is tuned so the card dominates without fighting dark mode.
const MODULE_WASH = {
  finyk: "bg-finyk-soft/60 dark:bg-finyk-soft/10",
  fizruk: "bg-fizruk-soft/60 dark:bg-fizruk-soft/10",
  routine: "bg-routine-surface/60 dark:bg-routine-surface/20",
  nutrition: "bg-nutrition-soft/60 dark:bg-nutrition-soft/10",
  hub: "bg-panelHi",
};

const SEVERITY_TONE = {
  danger: {
    accent: "bg-danger",
    wash: "bg-danger-soft/70 dark:bg-danger/10",
    border: "border-danger/30",
    eyebrow: "text-danger",
  },
  warning: {
    accent: "bg-warning",
    wash: "bg-warning-soft/70 dark:bg-warning/10",
    border: "border-warning/35",
    eyebrow: "text-warning",
  },
};

// Fallback for CTA коли rec не несе свого `pwaAction`: просто відкриває
// модуль. Імперативна дія (`add_expense`, `start_workout`, …) береться з
// `getModulePrimaryAction` і dispatchається через hubNav — центральний шлях
// квік-адду з дашборду.
const MODULE_OPEN_CTA = {
  finyk: "Відкрити Фінік",
  fizruk: "Відкрити Фізрук",
  routine: "Відкрити Рутину",
  nutrition: "Відкрити Харчування",
  hub: "Подивитись",
};

const MODULE_SHORT_LABEL: Record<HubModuleId, string> = {
  finyk: "Фінік",
  fizruk: "Фізрук",
  routine: "Рутина",
  nutrition: "Харчування",
};

/**
 * Hook that exposes the current dashboard focus (= top recommendation) plus
 * the rest of the visible recommendations, sharing dismiss state with the
 * unified insights panel.
 */
export function useDashboardFocus() {
  const [dismissed, setDismissed] = useLocalStorageState<
    Record<string, number>
  >(DISMISSED_KEY, {});
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const recs = generateRecommendations();

  const visible = useMemo(
    () => recs.filter((r) => !dismissed[r.id]),
    [recs, dismissed],
  );

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => ({ ...prev, [id]: Date.now() }));
    },
    [setDismissed],
  );

  return {
    focus: visible[0] || null,
    rest: visible.slice(1),
    dismiss,
  };
}

interface FocusRec {
  id: string;
  module: keyof typeof MODULE_ACCENT;
  severity?: StatusColor;
  title: string;
  body?: string;
  icon?: string;
  action: string;
  pwaAction?: HubModuleAction;
}

/**
 * Primary hero on the dashboard: one next-best-action derived from the
 * recommendation engine. CTA виконує дію (PWA-intent) інлайн, а не
 * навігує в модуль — це ключова зміна action-driven дашборду.
 *
 * Renders nothing when there is no focus rec — the bento module grid
 * below already exposes per-module quick-add affordances, so a chip
 * fallback would duplicate them and split the user's attention
 * (ONE-HERO rule, mirrored in `HubDashboard`).
 */
export function TodayFocusCard({
  focus,
  onAction,
  onDismiss,
}: {
  focus: FocusRec | null;
  onAction: (module: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (!focus) {
    return null;
  }

  const severityTone =
    focus.severity === "danger" || focus.severity === "warning"
      ? SEVERITY_TONE[focus.severity]
      : null;
  const accent =
    severityTone?.accent || MODULE_ACCENT[focus.module] || "bg-primary";
  const wash = severityTone?.wash || MODULE_WASH[focus.module] || "bg-panelHi";

  const primary = focus.pwaAction
    ? (() => {
        const quick = getModulePrimaryAction(focus.module);
        return {
          label: quick?.label || MODULE_OPEN_CTA[focus.module] || "Відкрити",
          run: () =>
            openHubModuleWithAction(
              focus.module as HubModuleId,
              focus.pwaAction as HubModuleAction,
            ),
        };
      })()
    : {
        label: MODULE_OPEN_CTA[focus.module] || "Відкрити",
        run: () => onAction(focus.action),
      };

  // Fallback: коли primary був імперативним, додаємо текстовий линк
  // «Відкрити X» як secondary — для юзерів, які хочуть спершу
  // перевірити контекст у модулі, не фіксуючи нічого.
  const secondary =
    focus.pwaAction && onAction
      ? {
          label:
            `Відкрити ${MODULE_SHORT_LABEL[focus.module as HubModuleId] ?? ""}`.trim(),
          run: () => onAction(focus.action),
        }
      : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-panel",
        "shadow-card p-4",
        "bg-hub-hero dark:bg-panel",
        wash,
        severityTone?.border,
      )}
    >
      {/* Accent bar */}
      <div
        className={cn(
          "absolute left-0 top-4 bottom-4 w-1 rounded-r-full",
          accent,
        )}
        aria-hidden
      />

      {/* Dismiss X — corner button, keeps CTA row uncluttered */}
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(focus.id)}
          aria-label="Закрити підказку"
          className={cn(
            "absolute top-2.5 right-2.5",
            "w-7 h-7 flex items-center justify-center rounded-xl",
            "text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10",
            "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          <Icon name="x" size={14} strokeWidth={2.5} />
        </button>
      )}

      <div className="pl-3 pr-6">
        <div className="flex items-center gap-3 mb-1">
          <SectionHeading
            as="span"
            size="xs"
            variant="muted"
            className={severityTone?.eyebrow}
          >
            Зараз
          </SectionHeading>
        </div>

        <h2 className="text-base font-bold text-text leading-snug text-balance">
          {focus.icon && (
            <span className="mr-1.5" aria-hidden>
              {focus.icon}
            </span>
          )}
          {focus.title}
        </h2>

        {focus.body && (
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {focus.body}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={primary.run}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl",
              "bg-primary text-bg text-xs font-semibold",
              "hover:brightness-110 active:scale-[0.98] transition-[filter,opacity,transform]",
            )}
          >
            {primary.label}
            <Icon name="chevron-right" size={14} strokeWidth={2.5} />
          </button>
          {secondary && (
            <button
              type="button"
              onClick={secondary.run}
              className={cn(
                "text-xs font-medium text-muted hover:text-text",
                "px-2.5 py-1.5 rounded-xl hover:bg-panelHi transition-colors",
              )}
            >
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
