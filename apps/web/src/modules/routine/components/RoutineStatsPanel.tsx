import { useMemo, useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Segmented } from "@shared/components/ui/Segmented";
import { Stat } from "@shared/components/ui/Stat";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitRangeGrid } from "./HabitRangeGrid";
import { HabitLeadersBlock } from "./HabitLeadersBlock";
import {
  completionRateForRange,
  flexibleMaxStreakAllTimeAcrossHabits,
} from "../lib/streaks";
import { dateKeyMinusDays } from "@sergeant/routine-domain";
import { anchoredTodayKey } from "../lib/dayAnchor";
import {
  ROUTINE_STATS_DEFAULT_RANGE,
  ROUTINE_STATS_RANGES,
  routineStatsRange,
  type RoutineStatsRangeId,
} from "../lib/statsRanges";
import type { RoutineState } from "../lib/types";

const rangeItems = ROUTINE_STATS_RANGES.map((r) => ({
  value: r.id,
  label: r.label,
}));

export interface RoutineStatsPanelProps {
  routine: RoutineState;
  currentStreak: number;
  hidden?: boolean;
}

export function RoutineStatsPanel({
  routine,
  currentStreak,
  hidden,
}: RoutineStatsPanelProps) {
  // Той самий анкер доби, що й решта web-routine (`lib/dayAnchor.ts`), не
  // окремий прямий виклик — інакше день тут і в сусідніх картках знову
  // могли б розійтись (unification audit 2026-08-31, finding 2.3).
  const todayKey = anchoredTodayKey();

  // Вибір зрізу навмисно не переживає перезавантаження: писати його в
  // localStorage означало б новий ключ в allowlist заради стану, який
  // дешевше перевибрати одним тапом.
  const [rangeId, setRangeId] = useState<RoutineStatsRangeId>(
    ROUTINE_STATS_DEFAULT_RANGE,
  );
  const range = routineStatsRange(rangeId);

  const summary = useMemo(() => {
    const habits = routine.habits || [];
    const completions = routine.completions || {};
    // Гнучкий аналог, як і `currentStreak` — інакше «Серія сьогодні» могла
    // показувати БІЛЬШЕ, ніж «Макс. серія» (unification audit 2026-08-31,
    // finding 1.22): жорсткий рекорд не бачив прощених пропусків, які
    // гнучка поточна серія вже пережила.
    const maxAllTime = flexibleMaxStreakAllTimeAcrossHabits(
      habits,
      completions,
      routine.skips ?? {},
    );
    // `pausedFrom: todayKey` — заморозка минулого (ADR-0079 §2). Саме тут вона
    // найпомітніша: усі зрізи цілком лежать у минулому, тож без параметра
    // пауза, поставлена сьогодні, обнуляла б їх усі одразу.
    const rate = completionRateForRange(
      habits,
      completions,
      dateKeyMinusDays(todayKey, range.days - 1),
      todayKey,
      { pausedFrom: todayKey },
    );
    return { maxAllTime, rate };
  }, [
    routine.habits,
    routine.completions,
    routine.skips,
    todayKey,
    range.days,
  ]);

  return (
    <div
      role="tabpanel"
      id="routine-panel-stats"
      aria-labelledby="routine-tab-stats"
      hidden={hidden}
      className="space-y-4"
    >
      {/* AI-DANGER: без `overflow-x-auto`, як і ряд чипів у «Огляді» — там
          скролер створював композиторний шар, який iOS малював зі зсувом
          (див. AI-DANGER у `RoutineCalendarPanel`). Чотири чипи вміщаються,
          а якщо колись ні — `Segmented` перенесе їх рядком. */}
      <Segmented
        style="soft"
        size="sm"
        variant="routine"
        ariaLabel="Діапазон статистики"
        className="[&>button]:shrink-0"
        items={rangeItems}
        value={rangeId}
        onChange={setRangeId}
      />

      <Card as="section" radius="lg" aria-label="Зведена статистика">
        <SectionHeading as="p" size="xs" className="mb-3" variant="routine">
          Зведення · {range.hint}
        </SectionHeading>
        {/* F1 (анти-слоп аудит 2026-09-01): три однакові плитки «число +
            підпис» — це та сама stat-граматика, що й тайли хабу й
            «Аналітика» Їжі, і на одному екрані вона дає ієрархію густини
            рівно нуль. П4 стратегії застосовано до КІЛЬКОСТІ контейнерів:
            один показник — hero (`Виконано`, єдине число зі станом за
            зріз), решта — рядок тексту без власного бокса. Раніше плитки
            несли ще й `statCardHighlight` зі світлою заливкою, яка в
            «Чорнилі» читалась як витік світлої теми (браузерна перевірка
            2026-08-17) — боксів нема, нема й проблеми. */}
        {/* Відсотка від нуля не буває: коли в зрізі нічого не заплановано,
            «0%» при «0/0» читався б як провал. */}
        <Stat
          label="Виконано"
          value={
            summary.rate.scheduled > 0 ? (
              <Measure value={Math.round(summary.rate.rate * 100)} unit="%" />
            ) : (
              "–"
            )
          }
          sublabel={
            summary.rate.scheduled > 0
              ? `${summary.rate.completed}/${summary.rate.scheduled}`
              : undefined
          }
          size="md"
        />
        {/* Обидва числа — крос-звичкові МАКСИМУМИ, не «тримаю все N днів»:
            `currentStreak` приходить як `streakMax` (`flexibleMaxActiveStreak`
            по всіх звичках), `maxAllTime` — `flexibleMaxStreakAllTimeAcrossHabits`.
            Доти підписи казали «Серія сьогодні» й «Макс. серія», тобто людина
            читала агрегат як власну суцільну серію (знахідка PR-R10).

            AI-DANGER: це ДРУГА поверхня тієї ж знахідки. Першу
            (`RoutineCalendarHero.tsx:170-178`) виправили раніше — там підпис
            уже каже «найкраща серія», і там же стоїть пояснення з посиланням
            на PR-R10. Воно не вберегло цей файл: коментар у файлі А не боронить
            файл Б. Слово «найкраща» тут узяте звідти навмисно, щоб дві
            поверхні називали одну величину однаково; міняєш формулювання —
            міняй в обох. */}
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-style-label text-muted">
          <span>Найкраща серія:</span>
          <span>сьогодні</span>
          <span className="font-semibold text-text tabular-nums">
            {currentStreak}
          </span>
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <span>за весь час</span>
          <span className="font-semibold text-text tabular-nums">
            {summary.maxAllTime}
          </span>
        </p>
      </Card>

      {range.view === "rows" ? (
        <HabitRangeGrid
          habits={routine.habits}
          completions={routine.completions}
          skips={routine.skips}
          days={range.days}
          hint={range.hint}
        />
      ) : (
        // `key` навмисно: хітмап один раз відкручує viewport у правий край і
        // тримає це засувкою в ref, щоб перерахунок сітки не смикав юзера з
        // історії. При зміні вікна ширина сітки інша, тож потрібен свіжий
        // монтаж — інакше квартальний scrollLeft лишився б посеред року.
        <HabitHeatmap
          key={range.id}
          habits={routine.habits}
          completions={routine.completions}
          skips={routine.skips}
          historyWeeks={range.heatmapWeeks ?? 53}
          futureWeeks={range.heatmapFutureWeeks ?? 4}
          historyLabel={range.heatmapHistoryLabel ?? "рік"}
          {...(range.heatmapCaption ? { caption: range.heatmapCaption } : {})}
        />
      )}

      <HabitLeadersBlock
        habits={routine.habits}
        completions={routine.completions}
      />
    </div>
  );
}
