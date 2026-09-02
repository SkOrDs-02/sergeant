/**
 * 7-денна mini-bar-chart ккал. Mirror web `WeekKcalCard`
 * (`apps/web/src/modules/nutrition/components/WeekKcalCard.tsx`).
 *
 * AI-CONTEXT: обидві поверхні рахували шкалу власним інлайновим рядком і
 * успадкували ту саму пару дефектів (фідбек тестера 2026-08-17: «не
 * зрозуміла шкала»). Тепер модель приходить з `computeWeekKcalChart`
 * (`@sergeant/nutrition-domain`) — стеля осі, лінія цілі й ознака
 * порожнього дня рахуються в одному місці, тож дзеркала не розійдуться.
 *
 * Свідома розбіжність із web: тут НЕМА tap-to-select із ккал вибраного дня
 * (web-first до traction — `docs/00-start/agents/decisions.md`, 2026-06-29).
 * Опора шкали — підписана ціль/стеля — є на обох поверхнях, бо саме без неї
 * графік нечитабельний.
 */
import { Text, View } from "react-native";

import {
  computeWeekKcalChart,
  type MacrosRow,
} from "@sergeant/nutrition-domain";
import { formatNumberUk } from "@sergeant/shared";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const CHART_HEIGHT = 48;
/** Мінімальна видима висота ненульового дня — 50 ккал теж мусять бути видні. */
const MIN_BAR_HEIGHT = 3;

function fmtKcal(n: number): string {
  return formatNumberUk(Math.round(n));
}

export interface WeekKcalChartProps {
  rows: MacrosRow[];
  /**
   * Ціль на КОЖЕН день тижня, вирівняна з `rows`. Не одне число: ціль може
   * змінитись серед тижня, і минулі дні судяться тією, що діяла тоді
   * (ADR-0091). `null` — цілі на той день не було.
   */
  goalsByDay: readonly (number | null)[];
  todayIso: string;
}

export function WeekKcalChart({
  rows,
  goalsByDay,
  todayIso,
}: WeekKcalChartProps) {
  const model = computeWeekKcalChart(rows, goalsByDay);

  const summaryText =
    model.daysLogged > 0
      ? `${fmtKcal(model.totalKcal)} ккал · сер. ${fmtKcal(model.avgKcal)}/день`
      : "Ще немає записів цього тижня";

  let scaleText: string | null = null;
  if (model.goalKcal > 0) {
    scaleText = `ціль ${fmtKcal(model.goalKcal)}`;
  } else if (model.totalKcal > 0) {
    scaleText = `макс ${fmtKcal(model.ceiling)}`;
  }

  return (
    <View>
      <View className="flex-row items-baseline justify-between gap-2 mb-2">
        <Text className="text-[11px] text-fg-subtle">{summaryText}</Text>
        {scaleText !== null && (
          <Text className="text-[11px] text-fg-subtle">{scaleText}</Text>
        )}
      </View>

      <View className="flex-row items-end gap-1 h-16">
        {model.bars.map((bar) => {
          const isToday = bar.date === todayIso;
          const [y, m, d] = bar.date.split("-").map(Number);
          const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
          const label = DAY_LABELS[(dt.getDay() + 6) % 7];
          const height = bar.isEmpty
            ? 0
            : Math.max(MIN_BAR_HEIGHT, bar.ratio * CHART_HEIGHT);
          return (
            <View key={bar.date} className="flex-1 items-center gap-0.5">
              <View
                style={{ height: CHART_HEIGHT, justifyContent: "flex-end" }}
                className="w-full items-center"
              >
                {bar.goalRatio !== null && (
                  // Висота — з ЦЬОГО дня, тож у тижні зі зміненою ціллю
                  // лінія йде сходинкою (ADR-0091).
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: bar.goalRatio * CHART_HEIGHT,
                      borderTopWidth: 1,
                      borderStyle: "dashed",
                    }}
                    className="border-fg-subtle/40"
                  />
                )}
                {bar.isEmpty ? (
                  // Канон §5.2: пропущений день — неповні дані, а не нуль
                  // спожитого. Плаский трек, а не огризок стовпчика.
                  <View
                    testID={`week-kcal-empty-${bar.date}`}
                    style={{ height: 2, width: 18, borderRadius: 999 }}
                    className="bg-fg-subtle/20"
                  />
                ) : (
                  <View
                    testID={`week-kcal-bar-${bar.date}`}
                    style={{
                      height,
                      width: 18,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                    className={
                      bar.isOver
                        ? isToday
                          ? "bg-amber-500"
                          : "bg-amber-500/40"
                        : isToday
                          ? "bg-lime-500"
                          : "bg-lime-500/40"
                    }
                  />
                )}
              </View>
              <Text
                className={
                  isToday
                    ? "text-[9px] leading-none text-fg font-bold"
                    : "text-[9px] leading-none text-fg-subtle"
                }
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
