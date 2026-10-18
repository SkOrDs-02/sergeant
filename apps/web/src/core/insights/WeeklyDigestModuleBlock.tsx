/**
 * Last validated: 2026-07-31
 * Status: Active
 *
 * Розкривний блок одного модуля всередині картки тижневого дайджесту.
 * Винесено з `WeeklyDigestCard.tsx`, коли той упритул підійшов до
 * `max-lines: 600` (Hard Rule #18) — сама картка лишилась контейнером.
 */
import { useId, useState } from "react";
import { cn } from "@shared/lib/ui/cn";

const MODULE_CONFIG: Record<ModuleKey, { label: string }> = {
  finyk: { label: "Фінанси" },
  fizruk: { label: "Тренування" },
  nutrition: { label: "Їжа" },
  routine: { label: "Звички" },
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
  const bodyId = useId();
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg || !data) return null;

  return (
    <div className="border-b border-line overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="min-h-11 w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-panelHi/50 transition-colors"
      >
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
        <span className="text-style-caption text-muted">
          {open ? "Згорнути" : "Розгорнути"}
        </span>
      </button>

      <div
        id={bodyId}
        aria-hidden={!open}
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
                    <div key={i} className="border-t border-line py-2">
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
