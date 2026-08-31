/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { Icon } from "@shared/components/ui/Icon";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";
import { deviceDayKey } from "@sergeant/shared";
import { ReturnScale } from "./ReturnScale";
import { fmtLoose } from "../../lib/numberFmt";

export interface PrEntry {
  id: string;
  name: string;
  muscleGroup: string | null;
  muscleGroupLabel: string | null;
  best1rm: number;
  weightKg: number;
  reps: number;
  at: string;
  /**
   * Рекорд застарів — від останньої силової сесії вправи минуло більше за
   * поріг `ONE_RM_STALE_AFTER_DAYS` (канон `fizruk.md` §6).
   */
  isStale?: boolean;
  /** Поточний рівень помітно нижчий за пік. Констатація, не докір. */
  isRegression?: boolean;
  /** Відхилення поточного рівня від піка у відсотках (≤ 0 — просів). */
  deltaVsPeakPct?: number;
  /**
   * Орієнтир на сьогодні — знижений пік (`oneRmAging.reference1rm`).
   *
   * AI-DANGER: саме це число людина кладе на штангу, і саме воно тепер
   * стоїть у рядку головним. Пік лишається, але як підпис на краю шкали.
   * Помінявши їх місцями, знімемо захист, заради якого старіння 1RM
   * існує (канон `fizruk.md` §6).
   */
  reference1rm?: number;
  /** На скільки % орієнтир нижчий за пік. 0 — свіжа вправа. */
  reductionPct?: number;
  daysSinceLastSession?: number | null;
}

interface PrBoardProps {
  prs: readonly PrEntry[];
  prFilter: string;
  onPrFilterChange: (next: string) => void;
  /**
   * Українські назви PRIMARY-ГРУП (`FizrukData.PRIMARY_GROUPS_UK`), не
   * окремих мʼязів.
   *
   * AI-DANGER: до 2026-08-24 сюди приходив `musclesUk`, і збігалось воно
   * лише випадково — `quadriceps`/`biceps`/`calves` є в обох мапах, а
   * `chest`/`back`/`shoulders`/`core`/`glutes` — тільки в груповій. Тому
   * поруч із локалізованим «Квадрицепс» на фільтрі стояв сирий `chest`
   * (браузерне QA 2026-08-23). Пропс перейменовано навмисно: щоб наступний
   * виклик не міг тихо підставити не ту мапу.
   */
  primaryGroupsUk: Record<string, string> | undefined;
  onSelect: (id: string) => void;
}

/**
 * Strength PR leaderboard with a per-muscle-group filter strip. Extracted
 * from `Progress.tsx` to keep the page module under the 600-LOC ceiling
 * (Hard Rule #18) — mirrors the `Body/` sub-component split.
 */
export function PrBoard({
  prs,
  prFilter,
  onPrFilterChange,
  primaryGroupsUk,
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
        <SectionHeading size="xs" variant="fizruk">
          {messages.fizruk.prBoard.heading} · {prs.length}
        </SectionHeading>
        {filtered.length !== prs.length && (
          <div className="text-style-caption text-muted">
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
              {primaryGroupsUk?.[g] || g}
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
            const podiumRank =
              globalRank >= 0 && globalRank < 3 ? globalRank + 1 : null;
            return (
              <button
                key={p.id}
                type="button"
                className="focus-ring w-full text-left border border-line rounded-2xl p-3 bg-bg hover:bg-panelHi transition-colors"
                onClick={() => onSelect(p.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {podiumRank && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-style-caption text-warning-strong dark:text-warning">
                        <Icon name="award" size={14} aria-hidden />
                        {podiumRank}
                      </span>
                    )}
                    <div className="text-style-label text-text truncate">
                      {p.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-style-label text-text tabular-nums">
                    {(p.reference1rm ?? p.best1rm).toFixed(0)}{" "}
                    {messages.fizruk.kgUnit}
                  </div>
                </div>
                {/*
                  П4 — with all four badges present (weight×reps, date,
                  stale/regression badge, muscle-group chip) this row could
                  overflow on narrow screens; `flex-wrap` + `min-w-0` let it
                  wrap onto a second line instead of clipping.
                */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 min-w-0">
                  <span className="text-style-caption text-muted tabular-nums">
                    {fmtLoose(p.weightKg ?? 0)} {messages.fizruk.kgUnit} ×{" "}
                    {p.reps ?? 0}
                  </span>
                  {p.at && (
                    <span className="text-style-caption text-muted">
                      ·{" "}
                      {formatDayKeyUk(deviceDayKey(new Date(p.at)), {
                        todayKey: deviceDayKey(),
                        relative: false,
                      })}
                    </span>
                  )}
                  {/*
                    Борд раніше реагував лише на рух УГОРУ (`isNewPR`), тож
                    регрес і застарілий рекорд були невидимі — канон §6
                    вимагає протилежного. Тон нейтральний: жодного
                    попереджувального кольору, це факт, а не осуд.
                  */}
                  {p.isStale && (
                    <span className="text-style-caption text-muted">
                      · {messages.fizruk.prBoard.staleBadge}
                    </span>
                  )}
                  {p.isRegression && (
                    <span className="text-style-caption text-muted tabular-nums">
                      · {messages.fizruk.prBoard.belowPeakPrefix}{" "}
                      {p.deltaVsPeakPct}%
                    </span>
                  )}
                  {p.muscleGroupLabel && (
                    // Contrast fix (П4): `text-fizruk/70` cleared only
                    // ≈2.2:1 on the dark chip background — below WCAG AA.
                    // `-strong`/module-tint pair mirrors the icon tiles
                    // above and clears AA in both themes.
                    <span className="ml-auto text-style-caption px-2 py-0.5 rounded-full bg-fizruk/10 text-fizruk-strong dark:text-fizruk font-medium shrink-0">
                      {p.muscleGroupLabel}
                    </span>
                  )}
                </div>
                {/*
                  Шкала показується для ВСІХ вправ, не лише застарілих
                  (рішення власника 2026-08-06). Повна шкала — теж
                  інформація («ти на піку»), а список, що стрибає між
                  рядками зі шкалою і без, читається гірше за кілька
                  повних смуг поспіль.
                */}
                {p.reductionPct != null && (
                  <ReturnScale
                    peak1rm={p.best1rm}
                    reference1rm={p.reference1rm ?? p.best1rm}
                    reductionPct={p.reductionPct}
                    daysSinceLastSession={p.daysSinceLastSession ?? null}
                    isStale={p.isStale === true}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
