// Реєстр і композитор правил. Кожний модуль реєструє свої `Rule<Ctx>`,
// `runRules` — ізольовано запускає і збирає результат. Якщо правило кинуло
// виняток — воно «пропадає», решта продовжує роботу (регресії одного правила
// не ламають усі рекомендації).

import type { Rec, Rule } from "./types.js";

/** Запускає правила з одним контекстом і збирає рекомендації. */
export function runRules<Ctx>(rules: readonly Rule<Ctx>[], ctx: Ctx): Rec[] {
  const out: Rec[] = [];
  for (const rule of rules) {
    try {
      const produced = rule.evaluate(ctx);
      if (Array.isArray(produced)) {
        for (const r of produced) {
          if (r && typeof r.id === "string") out.push(r);
        }
      }
    } catch (err) {
      // Одне правило не валить решту; лог — для дебагу у деві.
      try {
        console.warn(`[recommendations:${rule.id}] evaluate failed`, err);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}
