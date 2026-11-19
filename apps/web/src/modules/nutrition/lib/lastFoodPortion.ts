/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Остання вага продукту (OD-27 Х-1 б, рішення власника 2026-11-18): скільки
 * грамів людина записала цього продукту минулого разу. Окремого сховища
 * немає: число виводиться з журналу (останній запис із тим самим `foodId` і
 * вагою), тож воно їде між пристроями разом із журналом і не потребує ні
 * схеми, ні sync.
 *
 * Майбутні дні не рахуються: це план, а не зʼїдене (logic-43, канон
 * 2026-11-17).
 */
import { todayISODate, type NutritionLog } from "@sergeant/nutrition-domain";

export interface LastFoodPortion {
  grams: number;
  /** День запису, `YYYY-MM-DD` (ADR-0078). */
  date: string;
}

export function lastFoodPortion(
  log: NutritionLog | null | undefined,
  foodId: string,
  today: string = todayISODate(),
): LastFoodPortion | null {
  const id = String(foodId ?? "").trim();
  if (!id || !log) return null;
  let best: (LastFoodPortion & { time: string }) | null = null;
  for (const [date, day] of Object.entries(log)) {
    if (!date || date > today) continue;
    if (best && date < best.date) continue;
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const meal of meals) {
      if (!meal || String(meal.foodId ?? "") !== id) continue;
      const grams = Number(meal.amount_g);
      if (!Number.isFinite(grams) || grams <= 0) continue;
      const time = String(meal.time || "");
      // Пізніший день виграє; у межах дня пізніший час, а за рівного часу
      // пізніший рядок журналу.
      if (!best || date > best.date || time >= best.time) {
        best = { grams, date, time };
      }
    }
  }
  return best ? { grams: best.grams, date: best.date } : null;
}
