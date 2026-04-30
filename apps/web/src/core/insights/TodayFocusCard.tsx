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
import {
  MODULE_PRIMARY_ACTION,
  getModulePrimaryAction,
} from "@shared/lib/moduleQuickActions";
import { safeReadLS } from "@shared/lib/storage";
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
// `MODULE_PRIMARY_ACTION` і dispatchається через hubNav — центральний шлях
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

function readJSON<T = unknown>(key: string): T | null {
  return safeReadLS<T>(key);
}

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

/**
 * Snapshot reward-сигналу для хедера Next: серія, що горить, або щойно
 * виконана ціль. Повертається маленьким chip'ом у хедері Next, замість
 * того щоб забирати окрему картку.
 */
interface QuickStats {
  streak?: number;
}

function deriveRewardSignal(): {
  line: string;
  module: keyof typeof MODULE_ACCENT;
} | null {
  const routine = readJSON<QuickStats>("routine_quick_stats") ?? {};
  const fizruk = readJSON<QuickStats>("fizruk_quick_stats") ?? {};

  const streaks = [
    { module: "routine" as const, days: Number(routine.streak) || 0 },
    { module: "fizruk" as const, days: Number(fizruk.streak) || 0 },
  ]
    .filter((s) => s.days >= 2)
    .sort((a, b) => b.days - a.days);

  if (streaks.length > 0) {
    const top = streaks[0];
    return {
      line: `${top.days} днів поспіль`,
      module: top.module,
    };
  }
  return null;
}

interface QuickAddChip {
  module: HubModuleId;
  label: string;
  action: HubModuleAction;
}

const QUICK_ADD_CHIPS: QuickAddChip[] = (
  ["finyk", "nutrition", "routine", "fizruk"] as HubModuleId[]
).map((mod) => {
  const a = MODULE_PRIMARY_ACTION[mod];
  return { module: mod, label: a.shortLabel, action: a.action };
});

// Refined chip language: neutral panel base (matches the cream module rows
// below) + a tinted «bubble» with a module-coloured plus, so the chips
// visually echo the module list's icon-square pattern instead of looking
// like loose candy pastels.
const MODULE_CHIP_ACCENT: Record<
  HubModuleId,
  { bubble: string; hoverBorder: string }
> = {
  finyk: {
    bubble:
      "bg-finyk-soft text-finyk dark:bg-finyk-surface-dark/20 dark:text-finyk",
    hoverBorder: "hover:border-finyk/40 hover:bg-finyk-soft/40",
  },
  fizruk: {
    bubble:
      "bg-fizruk-soft text-fizruk dark:bg-fizruk-surface-dark/20 dark:text-fizruk",
    hoverBorder: "hover:border-fizruk/40 hover:bg-fizruk-soft/40",
  },
  routine: {
    bubble:
      "bg-routine-surface text-routine dark:bg-routine-surface-dark/20 dark:text-routine",
    hoverBorder: "hover:border-routine/40 hover:bg-routine-surface/40",
  },
  nutrition: {
    bubble:
      "bg-nutrition-soft text-nutrition dark:bg-nutrition-surface-dark/20 dark:text-nutrition",
    hoverBorder: "hover:border-nutrition/40 hover:bg-nutrition-soft/40",
  },
};

/**
 * Empty-state Next: коли жодної рекомендації немає. Замість пасивного
 * «Сьогодні нічого термінового» показує 4 quick-add чипи — один тап і
 * користувач фіксує запис, не мусячи шукати «+» FAB.
 */
function EmptyFocus() {
  const reward = deriveRewardSignal();
  const washClass = reward
    ? MODULE_WASH[reward.module]
    : "bg-panelHi/60 dark:bg-panelHi/30";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-panel p-4",
        "bg-hub-hero dark:bg-panel",
        washClass,
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <SectionHeading as="span" size="xs" variant="muted">
          Зараз
        </SectionHeading>
        {reward && (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
              "text-2xs font-semibold text-text bg-panel/80 border border-line",
            )}
            title="Не розривай серію"
          >
            <span aria-hidden>🔥</span>
            {reward.line}
          </span>
        )}
      </div>

      <h2 className="text-base font-bold text-text leading-snug">
        Що зафіксуємо?
      </h2>
      <p className="text-xs text-muted mt-0.5 leading-relaxed">
        Один тап — один запис. Обери модуль і продовжуй.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ADD_CHIPS.map((chip) => {
          const accent = MODULE_CHIP_ACCENT[chip.module];
          const name = chip.label.replace(/^\+\s*/, "");
          return (
            <button
              key={chip.module}
              type="button"
              onClick={() => openHubModuleWithAction(chip.module, chip.action)}
              className={cn(
                "group inline-flex items-center gap-1.5 pl-1.5 pr-3.5 py-2 rounded-full",
                "bg-panel border border-line text-sm font-semibold text-text",
                "shadow-sm transition-[box-shadow,opacity,transform] active:scale-[0.98]",
                accent.hoverBorder,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full",
                  accent.bubble,
                )}
              >
                <Icon name="plus" size={12} strokeWidth={2.5} />
              </span>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
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
 * recommendation engine, or an action-driven empty state when nothing is
 * pending. CTA виконує дію (PWA-intent) інлайн, а не навігує в модуль —
 * це ключова зміна action-driven дашборду.
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
    return <EmptyFocus />;
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
            "w-7 h-7 flex items-center justify-center rounded-lg",
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
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
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
                "px-2.5 py-1.5 rounded-lg hover:bg-panelHi transition-colors",
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
