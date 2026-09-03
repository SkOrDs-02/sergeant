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
import { cn } from "@shared/lib/ui/cn";
import {
  getRowsForRange,
  mealTypeBreakdown,
  topMeals,
} from "../lib/nutritionStats";
import { MEAL_ORDER, MEAL_META } from "../lib/mealTypes";
import { Icon, type IconName } from "@shared/components/ui/Icon";
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
  const statsTop = useMemo(
    () => topMeals(log, selectedDate, statsRange, 8),
    [log, selectedDate, statsRange],
  );
  const statsMealTypes = useMemo(
    () => mealTypeBreakdown(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );

  return (
    <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="div" size="xs" variant="nutrition">
          Аналітика (тренди)
        </SectionHeading>
        <div className="flex gap-2">
          {[30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setStatsRange(d)}
              className={cn(
                "px-2 py-1 rounded-xl text-style-caption border",
                statsRange === d
                  ? "border-nutrition/60 text-nutrition-strong dark:text-nutrition bg-nutrition/10"
                  : "border-line text-muted bg-panelHi",
              )}
            >
              {d} днів
            </button>
          ))}
        </div>
      </div>

      {statsAvg.daysLogged === 0 ? (
        // UX-2 (аудит 2026-09-01): чотири плитки з нулями «0 на 0 активн.
        // днів» і плаский графік замінені на один Tier-2 `<EmptyState>`
        // (docs/05-design/design/empty-states.md). Без окремого CTA-
        // ґудзика: «+ Додати прийом їжі» вже видно нижче на цій самій
        // сторінці `LogCard` — дублювати дію в компактній картці означало
        // б саме той анти-патерн, який документ empty-states забороняє.
        <EmptyState
          compact
          module="nutrition"
          icon={<Icon name="trending-up" size={20} />}
          title="Ще немає трендів"
          description="Залогуй кілька прийомів їжі, і тут зʼявляться середні калорії, макро та графік за днями."
        />
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
            <SectionHeading
              as="div"
              size="xs"
              variant="nutrition"
              className="mb-2"
            >
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
                      className="flex-1 rounded-sm bg-nutrition/60"
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
              <SectionHeading
                as="div"
                size="xs"
                variant="nutrition"
                className="mb-2"
              >
                Топ страв
              </SectionHeading>
              {statsTop.length === 0 ? (
                <div className="text-style-caption text-muted">
                  Поки що порожньо
                </div>
              ) : (
                <ol className="space-y-1">
                  {statsTop.map((x) => (
                    <li
                      key={x.name}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="text-style-caption text-text truncate">
                        {x.name}
                      </span>
                      <span className="text-style-caption text-muted shrink-0">
                        <Measure value={x.count} unit="" />× ·{" "}
                        <Measure value={Math.round(x.kcal)} unit="ккал" />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <SectionHeading
                as="div"
                size="xs"
                variant="nutrition"
                className="mb-2"
              >
                Розподіл прийомів
              </SectionHeading>
              {Object.keys(statsMealTypes).length === 0 ? (
                <div className="text-style-caption text-muted">
                  Поки що порожньо
                </div>
              ) : (
                <ul className="space-y-1">
                  {MEAL_ORDER.filter(
                    (t) => (statsMealTypes[t]?.count ?? 0) > 0,
                  ).map((t) => {
                    const s = statsMealTypes[t];
                    if (!s) return null;
                    return (
                      <li
                        key={t}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span className="text-style-caption text-text inline-flex items-center gap-1.5">
                          {MEAL_META[t] && (
                            <Icon
                              name={MEAL_META[t].iconName as IconName}
                              size={14}
                              className="text-muted"
                              aria-hidden
                            />
                          )}
                          {MEAL_META[t]?.label || t}
                        </span>
                        <span className="text-style-caption text-muted shrink-0">
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
    </div>
  );
}
