/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";

export interface PrEntry {
  id: string;
  name: string;
  muscleGroup: string | null;
  muscleGroupLabel: string | null;
  best1rm: number;
  weightKg: number;
  reps: number;
  at: string;
}

interface PrBoardProps {
  prs: readonly PrEntry[];
  prFilter: string;
  onPrFilterChange: (next: string) => void;
  musclesUk: Record<string, string> | undefined;
  onSelect: (id: string) => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Strength PR leaderboard with a per-muscle-group filter strip. Extracted
 * from `Progress.tsx` to keep the page module under the 600-LOC ceiling
 * (Hard Rule #18) — mirrors the `Body/` sub-component split.
 */
export function PrBoard({
  prs,
  prFilter,
  onPrFilterChange,
  musclesUk,
  onSelect,
}: PrBoardProps) {
  const muscleGroups = [
    ...new Set(
      prs.map((p) => p.muscleGroup).filter((g): g is string => Boolean(g)),
    ),
  ].sort();
  const filtered =
    prFilter === "all" ? prs : prs.filter((p) => p.muscleGroup === prFilter);

  return (
    <Card radius="lg" padding="lg">
      <div className="flex items-center justify-between gap-2 mb-3">
        <SectionHeading as="div" size="sm">
          {messages.fizruk.prBoard.heading} · {prs.length}
        </SectionHeading>
        {filtered.length !== prs.length && (
          <div className="text-xs text-subtle">
            {filtered.length} {messages.fizruk.prBoard.shownSuffix}
          </div>
        )}
      </div>

      {/* Muscle group filter */}
      {muscleGroups.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
          <button
            type="button"
            onClick={() => onPrFilterChange("all")}
            aria-pressed={prFilter === "all"}
            className={cn(
              "focus-ring shrink-0 px-3 min-h-[44px] rounded-full text-style-caption transition-colors border",
              prFilter === "all"
                ? "bg-fizruk-strong text-white border-fizruk-strong"
                : "bg-panel border-line text-subtle hover:text-text",
            )}
          >
            {messages.fizruk.prBoard.filterAll}
          </button>
          {muscleGroups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onPrFilterChange(g === prFilter ? "all" : g)}
              aria-pressed={prFilter === g}
              className={cn(
                "focus-ring shrink-0 px-3 min-h-[44px] rounded-full text-style-caption transition-colors border whitespace-nowrap",
                prFilter === g
                  ? "bg-fizruk-strong text-white border-fizruk-strong"
                  : "bg-panel border-line text-subtle hover:text-text",
              )}
            >
              {musclesUk?.[g] || g}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          compact
          title={
            prs.length === 0
              ? messages.fizruk.prBoard.emptyTitle
              : messages.fizruk.prBoard.emptyFilteredTitle
          }
          description={
            prs.length === 0
              ? messages.fizruk.prBoard.emptyDescription
              : messages.fizruk.prBoard.emptyFilteredDescription
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const globalRank = prs.findIndex((x) => x.id === p.id);
            const medal =
              globalRank >= 0 && globalRank < 3 ? MEDALS[globalRank] : null;
            return (
              <button
                key={p.id}
                type="button"
                className="focus-ring w-full text-left border border-line rounded-2xl p-3 bg-bg hover:bg-panelHi transition-colors"
                onClick={() => onSelect(p.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {medal && (
                      <span className="shrink-0 text-base leading-none">
                        {medal}
                      </span>
                    )}
                    <div className="text-style-label text-text truncate">
                      {p.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-style-label text-text tabular-nums">
                    {p.best1rm.toFixed(0)} {messages.fizruk.kgUnit}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-subtle tabular-nums">
                    {p.weightKg ?? 0} {messages.fizruk.kgUnit} × {p.reps ?? 0}
                  </span>
                  {p.at && (
                    <span className="text-xs text-muted">
                      ·{" "}
                      {new Date(p.at).toLocaleDateString("uk-UA", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  {p.muscleGroupLabel && (
                    <span className="ml-auto text-style-caption px-2 py-0.5 rounded-full bg-fizruk/10 text-fizruk/70 font-medium shrink-0">
                      {p.muscleGroupLabel}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
