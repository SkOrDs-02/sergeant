import type { Calculate1rmAction, ChatActionResult } from "../types";

export function calculate1rm(action: Calculate1rmAction): ChatActionResult {
  const { weight_kg, reps, exercise_name } = action.input;
  const w = Number(weight_kg);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return "Вага має бути додатним числом.";
  if (!Number.isInteger(r) || r < 1)
    return "Повторення мають бути цілим числом >= 1.";
  if (r === 1) {
    return `1RM${exercise_name ? ` (${exercise_name})` : ""}: ${w} кг (1 повторення = вже максимум)`;
  }
  if (r >= 37) {
    return "Для оцінки 1RM кількість повторень має бути в діапазоні 1..36.";
  }
  const epley = Math.round(w * (1 + r / 30) * 10) / 10;
  const brzycki = Math.round(((w * 36) / (37 - r)) * 10) / 10;
  const avg1rm = Math.round(((epley + brzycki) / 2) * 10) / 10;
  const percentages = [
    { pct: 100, reps: 1 },
    { pct: 95, reps: 2 },
    { pct: 90, reps: 4 },
    { pct: 85, reps: 6 },
    { pct: 80, reps: 8 },
    { pct: 75, reps: 10 },
    { pct: 70, reps: 12 },
    { pct: 65, reps: 15 },
  ];
  const parts: string[] = [
    `1RM${exercise_name ? ` (${exercise_name})` : ""}: ~${avg1rm} кг`,
    `Епллі: ${epley} кг | Бжицкі: ${brzycki} кг`,
    `Базується на: ${w} кг × ${r} повт`,
    "",
    "Таблиця відсотків:",
  ];
  for (const p of percentages) {
    parts.push(
      `  ${p.pct}% = ${Math.round((avg1rm * p.pct) / 100)} кг (~${p.reps} повт)`,
    );
  }
  return parts.join("\n");
}
