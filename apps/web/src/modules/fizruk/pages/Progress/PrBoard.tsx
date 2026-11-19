/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
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

/** Роздільник фактів у рядку рекорду; скрінрідеру не потрібен. */
function Dot() {
  return <span aria-hidden>{"· "}</span>;
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
    <Card padding="lg">
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
              "focus-ring shrink-0 px-3 min-h-[44px] rounded-lg text-style-caption transition-colors border",
              prFilter === "all"
                ? "bg-text text-bg border-line dark:text-bg"
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
                "focus-ring shrink-0 px-3 min-h-[44px] rounded-lg text-style-caption transition-colors border whitespace-nowrap",
                prFilter === g
                  ? "bg-text text-bg border-line dark:text-bg"
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
          {/*
            Фідбек власника 2026-11-19: «рекорди важко розписані». Рядок
            тепер короткий — назва, оцінка на 1 раз із підписом, найкращий
            підхід і дата — а деталі (історія, графік, калькулятор) живуть на
            сторінці вправи, куди веде тап; шеврон це показує. Місця з
            подіуму («1», «2», «3» перед назвою) знято: оцінки різних вправ
            між собою не порівнюються, жим ногами завжди «важчий» за жим
            лежачи, і номер читався як частина назви.
          */}
          {filtered.map((p) => {
            const reduced = (p.reductionPct ?? 0) > 0;
            return (
              <button
                key={p.id}
                type="button"
                className="focus-ring flex w-full items-center gap-3 text-left rounded-lg p-3 bg-panelHi hover:bg-bg transition-colors"
                onClick={() => onSelect(p.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-style-label font-semibold text-text truncate">
                      {p.name}
                    </div>
                    <div className="shrink-0 text-style-label font-semibold text-text tabular-nums">
                      {(p.reference1rm ?? p.best1rm).toFixed(0)}{" "}
                      {messages.fizruk.kgUnit}
                    </div>
                  </div>
                  {/*
                    П4 — `flex-wrap` + `min-w-0`, щоб усі факти рядка
                    переносились, а не обрізались на вузькому екрані.
                  */}
                  <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 mt-0.5 min-w-0 text-style-caption text-muted">
                    <span className="tabular-nums">
                      {fmtLoose(p.weightKg ?? 0)} {messages.fizruk.kgUnit} ×{" "}
                      {p.reps ?? 0}
                    </span>
                    {p.at && (
                      <span>
                        <Dot />
                        {formatDayKeyUk(deviceDayKey(new Date(p.at)), {
                          todayKey: deviceDayKey(),
                          relative: false,
                        })}
                      </span>
                    )}
                    {p.muscleGroupLabel && (
                      <span>
                        <Dot />
                        {/* Окремий вузол: група — те саме слово, що й у
                            фільтрі над списком, і тест шукає саме його. */}
                        <span>{p.muscleGroupLabel}</span>
                      </span>
                    )}
                    {/*
                      Борд раніше реагував лише на рух УГОРУ (`isNewPR`), тож
                      регрес і застарілий рекорд були невидимі — канон §6
                      вимагає протилежного. Тон нейтральний: це факт, а не
                      осуд.
                    */}
                    {p.isStale && (
                      <span>
                        <Dot />
                        {messages.fizruk.prBoard.staleBadge}
                      </span>
                    )}
                    {p.isRegression && (
                      <span className="tabular-nums">
                        <Dot />
                        {messages.fizruk.prBoard.belowPeakPrefix}{" "}
                        {p.deltaVsPeakPct}%
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-subtle">
                      {reduced
                        ? messages.fizruk.prBoard.referenceCaption
                        : messages.fizruk.prBoard.oneRepCaption}
                    </span>
                  </div>
                  {/*
                    Шкала повернення лише там, де їй є що сказати: орієнтир
                    просів від піка або рекорд застарів. На свіжій вправі
                    вона малювала порожню доріжку з «−25% … 0%, свіже · 0 дн.
                    тому, пік 53» — чотири числа, що не кажуть нічого нового
                    (фідбек 2026-11-19; переглядає рішення 2026-08-06 «шкала
                    для всіх»). Повна шкала й калькулятор — на сторінці вправи.
                  */}
                  {p.reductionPct != null && (reduced || p.isStale) && (
                    <ReturnScale
                      peak1rm={p.best1rm}
                      reference1rm={p.reference1rm ?? p.best1rm}
                      reductionPct={p.reductionPct}
                      daysSinceLastSession={p.daysSinceLastSession ?? null}
                      isStale={p.isStale === true}
                    />
                  )}
                </div>
                <Icon
                  name="chevron-right"
                  size={18}
                  className="shrink-0 text-subtle"
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
