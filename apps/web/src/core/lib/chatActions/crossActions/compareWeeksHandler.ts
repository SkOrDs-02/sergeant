import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
  getWeekKey,
} from "../../../insights/useWeeklyDigest";
import type { CompareWeeksAction, CompareWeeksModule } from "../types";
import {
  diffLine,
  formatWeekRangeLabel,
  previousWeekKey,
  weekLabelToMondayKey,
} from "./helpers";

export function compareWeeks(action: CompareWeeksAction): string {
  const { week_a, week_b, modules } = (action as CompareWeeksAction).input;
  const allModules: CompareWeeksModule[] = [
    "finyk",
    "fizruk",
    "routine",
    "nutrition",
  ];
  const selected: CompareWeeksModule[] =
    Array.isArray(modules) && modules.length > 0
      ? (modules.filter((m) =>
          allModules.includes(m as CompareWeeksModule),
        ) as CompareWeeksModule[])
      : allModules;
  if (selected.length === 0) {
    return "Не вказано жодного валідного модуля. Доступні: finyk, fizruk, routine, nutrition.";
  }

  const aKey = week_a ? weekLabelToMondayKey(week_a) : getWeekKey(new Date());
  if (!aKey) {
    return `Некоректний week_a: "${week_a}". Очікую YYYY-Www (наприклад 2026-W17).`;
  }
  const bKey = week_b ? weekLabelToMondayKey(week_b) : previousWeekKey(aKey);
  if (!bKey) {
    return `Некоректний week_b: "${week_b}". Очікую YYYY-Www (наприклад 2026-W16).`;
  }

  const aLabel = formatWeekRangeLabel(aKey);
  const bLabel = formatWeekRangeLabel(bKey);
  const lines: string[] = [`Порівняння тижнів: ${aLabel} vs ${bLabel}`];

  if (selected.includes("finyk")) {
    const fa = aggregateFinyk(aKey);
    const fb = aggregateFinyk(bKey);
    const aSpent = Math.round(fa.totalSpent);
    const bSpent = Math.round(fb.totalSpent);
    lines.push("");
    lines.push("Фінік:");
    lines.push(`  ${diffLine("Витрати", aSpent, bSpent, " грн")}`);
    lines.push(`  ${diffLine("Транзакцій", fa.txCount, fb.txCount, "")}`);
    const topA = fa.topCategories[0];
    const topB = fb.topCategories[0];
    if (topA || topB) {
      lines.push(
        `  Топ категорія: ${topA ? `${topA.name} (${Math.round(topA.amount)} грн)` : "—"} vs ${topB ? `${topB.name} (${Math.round(topB.amount)} грн)` : "—"}`,
      );
    }
  }

  if (selected.includes("fizruk")) {
    const za = aggregateFizruk(aKey);
    const zb = aggregateFizruk(bKey);
    lines.push("");
    lines.push("Фізрук:");
    if (!za && !zb) {
      lines.push("  Немає тренувань у обидва тижні.");
    } else {
      const aCount = za?.workoutsCount ?? 0;
      const bCount = zb?.workoutsCount ?? 0;
      const aVol = za?.totalVolume ?? 0;
      const bVol = zb?.totalVolume ?? 0;
      lines.push(`  ${diffLine("Тренувань", aCount, bCount, "")}`);
      lines.push(`  ${diffLine("Об'єм", aVol, bVol, " кг·повт")}`);
    }
  }

  if (selected.includes("routine")) {
    const ra = aggregateRoutine(aKey);
    const rb = aggregateRoutine(bKey);
    lines.push("");
    lines.push("Рутина:");
    if (!ra && !rb) {
      lines.push("  Немає активних звичок.");
    } else {
      const aRate = ra?.overallRate ?? 0;
      const bRate = rb?.overallRate ?? 0;
      lines.push(`  ${diffLine("Виконання", aRate, bRate, "%")}`);
      if (ra && rb) {
        lines.push(`  Звичок: ${ra.habitCount} vs ${rb.habitCount}`);
      }
    }
  }

  if (selected.includes("nutrition")) {
    const na = aggregateNutrition(aKey);
    const nb = aggregateNutrition(bKey);
    lines.push("");
    lines.push("Харчування:");
    if (!na && !nb) {
      lines.push("  Немає логів їжі у обидва тижні.");
    } else {
      const aKcal = na?.avgKcal ?? 0;
      const bKcal = nb?.avgKcal ?? 0;
      const aDays = na?.daysLogged ?? 0;
      const bDays = nb?.daysLogged ?? 0;
      lines.push(`  ${diffLine("Калорії/день", aKcal, bKcal, " ккал")}`);
      lines.push(`  Днів залоговано: ${aDays} vs ${bDays}`);
    }
  }

  return lines.join("\n");
}
