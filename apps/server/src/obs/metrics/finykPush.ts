import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────── Push Фініка (Ф-4 (б)) ─────────────────────
/**
 * Оцінки push Фініка: ліміт 80 % / 100 % і «завтра спишеться».
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md.
 *
 * Одна оцінка = один прогін гейта для людини (операція Monobank, синк
 * ручних записів, прохід нагадувань). Лейбли з фіксованим набором значень:
 *   - `kind`: `limit` | `due`;
 *   - `outcome`: `sent` (надіслано) | `nothing` (порога чи платежу немає) |
 *     `disabled` (тумблер вимкнено) | `no_target` (немає підписки чи
 *     пристрою) | `no_limits` (немає місячних чи тижневих лімітів) |
 *     `quiet_deferred` (тиха година: дошле прохід нагадувань після її
 *     кінця) | `cap_exhausted` (немає слота денної стелі: ключ зайнято, push
 *     не йде) | `deduped` (інший процес уже застовпив) | `error`.
 *
 * userId, суми й категорії в лейбли не кладемо (кардинальність, Hard
 * Rule #21).
 */
export const finykPushEvaluationsTotal = new client.Counter({
  name: "finyk_push_evaluations_total",
  help: "Finyk limit/due push evaluations by kind and outcome",
  labelNames: ["kind", "outcome"],
  registers: [register],
});
