import { patchNutritionPrefs } from "@nutrition/lib/nutritionStorage";
import type { ConvertUnitsAction, SetGoalAction } from "../types";
import { formatNumberUk } from "@sergeant/shared";

// rel-16 (рішення власника 2026-10-19/23): `set_goal` звужено до денної норми
// калорій. Раніше тул писав у `hub_goals_v1`, який ніхто не читає, і
// рапортував «створено»; тепер цей ключ не пишеться, а все, крім ккал, —
// чесна відмова (серверну схему тулу не чіпаємо: касети tool-eval незмінні).
export function setGoal(action: SetGoalAction): string {
  const { target_weight_kg, target_date, daily_kcal, workouts_per_week } = (
    action as SetGoalAction
  ).input;
  const dk = daily_kcal == null ? NaN : Number(daily_kcal);
  if (!Number.isFinite(dk) || dk <= 0) {
    return "Не вдалося зберегти ціль: поки що я зберігаю лише денну норму калорій (ккал/день). Цілі ваги, дедлайну чи тренувань не записую, бо їх ніде не буде видно.";
  }
  // Лише поле цілі, поверх актуального кешу, і не до гідратації (data-04):
  // інакше застарілий/дефолтний blob стер би шаблони страв і нагадування.
  // Канонічне сховище Харчування (dual-write у SQLite); застарілий LS-ключ
  // `nutrition_prefs_v1` tombstoned.
  if (!patchNutritionPrefs({ dailyTargetKcal: dk })) {
    return "Не вдалося зберегти ціль ккал у Їжі: дані Їжі ще завантажуються, спробуй за кілька секунд";
  }
  const dropped: string[] = [];
  if (target_weight_kg != null) dropped.push("цільову вагу");
  if (target_date) dropped.push("дедлайн");
  if (workouts_per_week != null) dropped.push("кількість тренувань");
  const note = dropped.length
    ? `. ${dropped.join(", ")} не збережено: поки зберігаю лише калорії`
    : "";
  return `Ціль збережено: ${formatNumberUk(dk)} ккал/день${note}`;
}

export function convertUnits(action: ConvertUnitsAction): string {
  const { value, from, to } = (action as ConvertUnitsAction).input;
  const v = Number(value);
  if (!Number.isFinite(v)) return "Значення має бути числом.";
  const f = (from || "").toLowerCase().trim();
  const t = (to || "").toLowerCase().trim();
  const conversions: Record<string, Record<string, (n: number) => number>> = {
    kg: { lb: (n) => n * 2.20462 },
    lb: { kg: (n) => n / 2.20462 },
    cm: { in: (n) => n / 2.54 },
    in: { cm: (n) => n * 2.54 },
    km: { mi: (n) => n * 0.621371 },
    mi: { km: (n) => n / 0.621371 },
    c: { f: (n) => (n * 9) / 5 + 32 },
    f: { c: (n) => ((n - 32) * 5) / 9 },
    kcal: { kj: (n) => n * 4.184 },
    kj: { kcal: (n) => n / 4.184 },
    m: { ft: (n) => n * 3.28084 },
    ft: { m: (n) => n / 3.28084 },
    g: { oz: (n) => n / 28.3495 },
    oz: { g: (n) => n * 28.3495 },
  };
  const fn = conversions[f]?.[t];
  if (!fn)
    return `Невідома конвертація: ${f} → ${t}. Підтримуються: kg↔lb, cm↔in, km↔mi, c↔f, kcal↔kj, m↔ft, g↔oz`;
  const result = Math.round(fn(v) * 100) / 100;
  return `${formatNumberUk(v)} ${f} = ${formatNumberUk(result, { maximumFractionDigits: 2 })} ${t}`;
}
