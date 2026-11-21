import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────── Сільпо: пропущені чеки ─────────────────────
/**
 * Чеки Сільпо, які синк пропустив, бо їхній запис у Postgres упав
 * (`modules/silpo/receiptsUpsert.ts` → `upsertReceiptsIsolated`).
 *
 * Без ізоляції один «отруйний» чек валив увесь синк користувача: решта
 * чеків не писалась, матчер не біг, полер щогодини ловив той самий 5xx
 * (аудит 2026-10-01, rel-32). Тепер такий чек пропускається, а цей
 * лічильник показує, що пропуски є. Ріст без спаду означає чек, який
 * ламається стабільно: причина в лозі `silpo_receipt_upsert_skipped`
 * (SQLSTATE, без полів покупки).
 *
 * Лейбл `channel`: `offline` | `online`. userId і id чека в лейбли не
 * кладемо (кардинальність, Hard Rule #21).
 */
export const silpoReceiptsSkippedTotal = new client.Counter({
  name: "silpo_receipts_skipped_total",
  help: "Silpo receipts skipped by sync because their DB write failed",
  labelNames: ["channel"],
  registers: [register],
});
