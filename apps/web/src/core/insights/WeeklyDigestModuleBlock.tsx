/**
 * Last validated: 2026-07-31
 * Status: Active
 *
 * Розкривний блок одного модуля всередині картки тижневого дайджесту.
 * Винесено з `WeeklyDigestCard.tsx`, коли той упритул підійшов до
 * `max-lines: 600` (Hard Rule #18) — сама картка лишилась контейнером.
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon, type IconName } from "@shared/components/ui/Icon";

// Wave 1b: `bgClass` / `borderClass` consolidated onto the
// `{module}-soft` / `{module}-soft-border` token family (preset-owned
// light/dark pair via `--c-{module}-soft*`). `colorClass` keeps the
// explicit `-600 / dark:-400` pair because the module accent text uses
// the saturated `-500` family (not the `-soft` wash) and does not have
// a theme-adaptive semantic token today.
const MODULE_CONFIG: Record<
  ModuleKey,
  {
    icon: IconName;
    label: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  finyk: {
    icon: "credit-card",
    label: "Фінанси",
    colorClass: "text-brand-strong",
    bgClass: "bg-finyk-soft",
    borderClass: "border-finyk-soft-border/60",
  },
  fizruk: {
    icon: "dumbbell",
    label: "Тренування",
    colorClass: "text-fizruk-strong dark:text-fizruk-300",
    bgClass: "bg-fizruk-soft",
    borderClass: "border-fizruk-soft-border/60",
  },
  nutrition: {
    icon: "utensils",
    label: "Їжа",
    colorClass: "text-nutrition-strong dark:text-nutrition",
    bgClass: "bg-nutrition-soft",
    borderClass: "border-nutrition-soft-border/60",
  },
  routine: {
    icon: "check-circle",
    label: "Звички",
    colorClass: "text-routine-strong dark:text-routine",
    bgClass: "bg-routine-soft",
    borderClass: "border-routine-soft-border/60",
  },
};

// `WeeklyDigestReport` (the AI-generated body) lives in
// `@sergeant/shared`; we only need the per-module block shape here. The
// hook returns the report flattened with `{ generatedAt, weekKey,
// weekRange }` (saved digest) plus an `overallRecommendations` array, so
// we describe just the fields the card touches rather than re-importing
// the full report type.
export type ModuleKey = "finyk" | "fizruk" | "nutrition" | "routine";

export interface DigestModuleData {
  summary?: string;
  comment?: string;
  recommendations?: string[];
}

export interface DigestPayload {
  generatedAt?: string;
  finyk?: DigestModuleData | null;
  fizruk?: DigestModuleData | null;
  nutrition?: DigestModuleData | null;
  routine?: DigestModuleData | null;
  overallRecommendations?: string[];
}

/**
 * «залоговано 2/7» біля назви модуля Харчування.
 *
 * Для ПОТОЧНОГО тижня знаменник не проговорюється: «2/7» у середу читалось
 * би як провал там, де минуло лише три дні — тобто фікс проти хибного
 * сигналу сам породив би хибний сигнал. Для закритого тижня знаменник —
 * і є суть повідомлення (аудит nutrition § E-4).
 */
export function coverageBadge(
  coverage: { logged: number; total: number } | null | undefined,
  isCurrentWeek: boolean,
): string | undefined {
  if (!coverage || coverage.total <= 0) return undefined;
  return isCurrentWeek
    ? `· залоговано днів: ${coverage.logged}`
    : `· залоговано ${coverage.logged}/${coverage.total}`;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Icon
      name="chevron-right"
      size={15}
      strokeWidth={2.5}
      className={cn(
        "transition-transform duration-base shrink-0 text-muted",
        expanded && "rotate-90",
      )}
    />
  );
}

interface ModuleBlockProps {
  moduleKey: ModuleKey;
  data: DigestModuleData | null | undefined;
  /**
   * Детермінований факт поруч із назвою модуля — не частина AI-тексту.
   *
   * Потрібен саме тому, що `summary` пише модель: вона бачить середні, які
   * рахуються лише по залогованих днях, і без явного знаменника описує
   * два залоговані дні як вдалий тиждень (аудит nutrition § E-4).
   */
  badge?: string | undefined;
}

export function ModuleBlock({ moduleKey, data, badge }: ModuleBlockProps) {
  const [open, setOpen] = useState(false);
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg || !data) return null;

  return (
    <div className="rounded-xl border border-line bg-bg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-panelHi/50 transition-colors"
      >
        <div
          className={cn(
            "w-6 h-6 rounded-xl flex items-center justify-center shrink-0",
            cfg.bgClass,
            cfg.colorClass,
          )}
        >
          <Icon name={cfg.icon} size="sm" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-style-label font-semibold text-text">
            {cfg.label}
          </span>
          {badge && (
            <span className="ml-1.5 text-style-caption text-muted font-normal">
              {badge}
            </span>
          )}
          {data.summary && (
            <p className="text-style-caption text-muted truncate mt-0.5">
              {data.summary}
            </p>
          )}
        </div>
        <ChevronIcon expanded={open} />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-base ease-standard",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-line pt-2 space-y-2">
            {data.comment && (
              <p className="text-style-body text-muted leading-relaxed">
                {data.comment}
              </p>
            )}
            {Array.isArray(data.recommendations) &&
              data.recommendations.length > 0 && (
                <div className="space-y-1">
                  {data.recommendations.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "text-style-caption font-bold mt-0.5 shrink-0",
                          cfg.colorClass,
                        )}
                      >
                        →
                      </span>
                      <span className="text-style-body text-text leading-snug">
                        {rec}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
