/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Measure } from "@shared/components/ui/Measure";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Stat } from "@shared/components/ui/Stat";
import { Segmented } from "@shared/components/ui/Segmented";
import {
  getRowsForRange,
  mealTypeBreakdown,
  topMeals,
} from "../lib/nutritionStats";
import { compareWeekToPrevious } from "../lib/weekCompare";
import { MEAL_ORDER, MEAL_META } from "../lib/mealTypes";
import {
  calcNutritionPeriodAverages,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import { pluralUa } from "@sergeant/shared";

// TXT-8 (аудит 2026-09-01): "N активн. днів" було жорстко many-формою для
// будь-якого N (навіть "1 активн. днів"). §8 style guide вимагає
// `Intl.PluralRules`, не hardcoded форму.
const ACTIVE_DAYS_FORMS = {
  one: "активний день",
  few: "активні дні",
  many: "активних днів",
};

interface LogCardAnalyticsProps {
  log: NutritionLog;
  selectedDate: string;
}

export function LogCardAnalytics({ log, selectedDate }: LogCardAnalyticsProps) {
  const [statsRange, setStatsRange] = useState(30);

  const statsRows = useMemo(
    () => getRowsForRange(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );
  // Канон `calcNutritionPeriodAverages` (nutrition.md §5.2): знаменник —
  // дні з ≥1 прийомом їжі (`daysLogged`), а не дні з макросами. Той самий
  // список дат, що вже породив `statsRows`, тож повторного проходу по логу
  // немає.
  const statsAvg = useMemo(
    () =>
      calcNutritionPeriodAverages(
        log,
        statsRows.map((r) => r.date),
      ),
    [log, statsRows],
  );
  const weekCompare = useMemo(
    () => compareWeekToPrevious(log, selectedDate),
    [log, selectedDate],
  );
  const statsTop = useMemo(
    () => topMeals(log, selectedDate, statsRange, 8),
    [log, selectedDate, statsRange],
  );
  const statsMealTypes = useMemo(
    () => mealTypeBreakdown(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="h2" size="lg">
          Аналітика (тренди)
        </SectionHeading>
        <Segmented
          size="sm"
          semantics="filter"
          ariaLabel="Період трендів"
          items={[
            { value: "30", label: "30 днів" },
            { value: "90", label: "90 днів" },
          ]}
          value={String(statsRange)}
          onChange={(v) => setStatsRange(Number(v))}
        />
      </div>

      {statsAvg.daysLogged === 0 ? (
        // UX-2 (аудит 2026-09-01): чотири плитки з нулями «0 на 0 активн.
        // днів» і плаский графік замінені на один Tier-2 `<EmptyState>`
        // (docs/design/design/empty-states.md). Без окремого CTA-
        // ґудзика: «+ Додати прийом їжі» вже видно нижче на цій самій
        // сторінці `LogCard` — дублювати дію в компактній картці означало
        // б саме той анти-патерн, який документ empty-states забороняє.
        <EmptyState compact title="Ще немає трендів" />
      ) : (
        <>
          {/* F1 (анти-слоп аудит 2026-09-01): 2×2 плитки «підпис → число →
              підпис» повторювали граматику тайлів хабу й зведення Рутини —
              чотири однакові контейнери для чотирьох чисел однієї ваги.
              П4 стратегії застосовано до кількості контейнерів: hero тут
              лише калорії (єдине число, яке людина звіряє з ціллю дня),
              макро — один рядок тексту під ним, без боксів. Графік і два
              списки нижче так само без власних плит: їх розділяє лінійка,
              не заливка. */}
          <Stat
            label="Середні ккал"
            value={
              <Measure value={Math.round(statsAvg.avgKcal) || 0} unit="ккал" />
            }
            sublabel={`за ${statsAvg.daysLogged} ${pluralUa(statsAvg.daysLogged, ACTIVE_DAYS_FORMS)}`}
            size="md"
          />
          <p className="text-style-label text-muted" data-testid="week-compare">
            {weekCompare.kind === "none"
              ? "Тиждень проти минулого: немає з чим порівняти"
              : weekCompare.deltaKcal === 0
                ? `Тиждень проти минулого: без змін (минулого ${weekCompare.prevAvgKcal} ккал)`
                : `Тиждень проти минулого: ${weekCompare.deltaKcal > 0 ? "▲ +" : "▼ −"}${Math.abs(weekCompare.deltaKcal)} ккал (минулого ${weekCompare.prevAvgKcal} ккал)`}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-style-label text-muted">
            {[
              { key: "protein_g", label: "Білки", v: statsAvg.avgProtein },
              { key: "fat_g", label: "Жири", v: statsAvg.avgFat },
              { key: "carbs_g", label: "Вуглеводи", v: statsAvg.avgCarbs },
            ].map((x, i) => (
              <span
                key={x.key}
                className="inline-flex items-baseline gap-x-1.5"
              >
                {i > 0 && (
                  <span aria-hidden className="text-subtle">
                    ·
                  </span>
                )}
                <span>{x.label}</span>
                <Measure
                  value={Math.round(Number(x.v) || 0)}
                  unit="г"
                  className="font-semibold text-text"
                />
              </span>
            ))}
          </p>

          <div className="border-t border-line pt-3">
            <SectionHeading as="h3" size="md" className="mb-2">
              Калорії по днях (останні {Math.min(statsRange, statsRows.length)})
            </SectionHeading>
            {(() => {
              const kcals = statsRows.map((r) => Number(r.kcal) || 0);
              const max = Math.max(1, ...kcals);
              return (
                <div className="flex items-end gap-0.5 h-12">
                  {kcals.slice(-statsRange).map((k, i) => (
                    <div
                      key={i}
                      title={`${Math.round(k)} ккал`}
                      className="flex-1 rounded-t-[3px] bg-chart-nutrition"
                      style={{
                        height: `${Math.max(2, Math.round((k / max) * 48))}px`,
                      }}
                    />
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
            <div>
              <SectionHeading as="h3" size="md" className="mb-2">
                Топ страв
              </SectionHeading>
              {statsTop.length === 0 ? (
                <div className="text-style-label text-muted">
                  Поки що порожньо
                </div>
              ) : (
                <ol className="divide-y divide-line">
                  {statsTop.map((x) => (
                    <li
                      key={x.name}
                      className="flex items-baseline justify-between gap-2 py-1.5"
                    >
                      <span className="text-style-label text-text truncate">
                        {x.name}
                      </span>
                      <span className="text-style-caption text-muted tabular-nums shrink-0">
                        <Measure value={x.count} unit="" />× ·{" "}
                        <Measure value={Math.round(x.kcal)} unit="ккал" />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <SectionHeading as="h3" size="md" className="mb-2">
                Розподіл прийомів
              </SectionHeading>
              {Object.keys(statsMealTypes).length === 0 ? (
                <div className="text-style-label text-muted">
                  Поки що порожньо
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {MEAL_ORDER.filter(
                    (t) => (statsMealTypes[t]?.count ?? 0) > 0,
                  ).map((t) => {
                    const s = statsMealTypes[t];
                    if (!s) return null;
                    return (
                      <li
                        key={t}
                        className="flex items-baseline justify-between gap-2 py-1.5"
                      >
                        <span className="text-style-label text-text">
                          {MEAL_META[t]?.label || t}
                        </span>
                        <span className="text-style-caption text-muted tabular-nums shrink-0">
                          <Measure value={s.count} unit="" />× ·{" "}
                          <Measure value={Math.round(s.kcal)} unit="ккал" />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
