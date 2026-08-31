import { E1RM_REP_CAP, epley1rm } from "@sergeant/fizruk-domain";

import type { Calculate1rmAction, ChatActionResult } from "../types";

/**
 * Формула Еплі, та сама, що рахує PR на екрані Вправи
 * (`packages/fizruk-domain/src/lib/workoutStats.ts`, канон §3
 * fizruk.md). Раніше тут жило власне середнє Еплі/Бжицкі без обмеження
 * повторень, воно давало чату іншу цифру, ніж домен, на тому самому
 * підході.
 */
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
  if (r > E1RM_REP_CAP) {
    return `Оцінка 1RM ненадійна після ${E1RM_REP_CAP} повторень: підхід із ${r} повт. не рахується як рекорд і на екрані Вправи. Спробуй з меншою кількістю повторень.`;
  }
  const epley1rmKg = Math.round(epley1rm(w, r) * 10) / 10;
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
    `1RM${exercise_name ? ` (${exercise_name})` : ""}: ~${epley1rmKg} кг`,
    `Формула Еплі, базується на: ${w} кг × ${r} повт`,
    "",
    "Таблиця відсотків:",
  ];
  for (const p of percentages) {
    parts.push(
      `  ${p.pct}% = ${Math.round((epley1rmKg * p.pct) / 100)} кг (~${p.reps} повт)`,
    );
  }
  return parts.join("\n");
}
