// Rule: сьогоднішні витрати проти 7-денної середньої за день. Коли темп
// різко вищий, нагадуємо дописати витрати, які могли не потрапити в облік
// (готівку), поки памʼятаємо: найбільший fail-mode трекінгу в тому, що юзер
// «потім внесу» і забуває. Текст свідомо про готівку, а не про «поточні
// витрати»: банківські записи прилітають самі, і «зафіксуй, поки памʼятаєш»
// поруч із галочкою «записано» суперечило (рішення власника 2026-10-01, f4).
//
// Тригер:
//   • київський час ≥ 14:00 (до обіду мало даних, зашумить);
//   • за попередні 7 повних днів сумарно ≥ 700 ₴ — інакше ratio нестабільне;
//   • сьогодні витрачено ≥ 200 ₴ — noise floor для дрібниць;
//   • today / avg_daily_prev7 ≥ 1.5.
//
// «Сьогодні» і «попередні 7 днів» — київські доби, як і в решти грошових
// сигналів хабу (рішення власника 2026-10-01: гроші за Києвом, ADR-0078; до
// цього — північ і година телефона, тож поза Києвом біля опівночі картка
// розходилась з Аналітикою Фініка). Година-поріг теж київська: вона міряє, як
// багато даних накопичила КИЇВСЬКА доба.
//
// CTA: `pwaAction: "add_expense"` — шлях до manual-sheet одним тапом.
//
// Одна картка про темп за раз (f2): коли ця спрацювала, тижнева
// (`spendingVelocityRule`) мовчить — вона читає `evaluateDailyPace`.

import type { Rule } from "../types.js";
import {
  financeExcludedTxIds,
  isManualExpenseExcluded,
  type FinanceContext,
} from "../financeContext.js";
import {
  formatNumberUk,
  kyivDayStartMs,
  kyivHour,
  toKyivISODate,
} from "@sergeant/shared";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";
import { shiftDayKey } from "@sergeant/finyk-domain/domain/weekSlices";
import { DAILY_PACE_REC_ID } from "./paceSignals.js";

const MIN_PREV7_SUM = 700;
const MIN_TODAY_SUM = 200;
const PACE_RATIO = 1.5;
const MIN_HOUR = 14;

export interface DailyPaceSignal {
  /** Витрати сьогодні, ₴. */
  todaySpend: number;
  /** Середні витрати за день за попередні 7 повних днів, ₴. */
  avgDaily: number;
  /** Відсоток, на який сьогодні вище середнього (округлений). */
  pctMore: number;
}

/**
 * Чи темп сьогодні різко вищий за середній. `null` — картки немає. Окрема
 * функція, бо її питає ще й тижнева картка, щоб промовчати (f2): правило
 * відповідає «що показати», ця функція — «чи спрацював сигнал».
 */
export function evaluateDailyPace(ctx: FinanceContext): DailyPaceSignal | null {
  const nowMs = ctx.now.getTime();
  if (kyivHour(nowMs) < MIN_HOUR) return null;

  const todayKey = toKyivISODate(nowMs);
  const todayMs = kyivDayStartMs(todayKey);
  // Кінець київської доби: «сьогодні» — це [початок, кінець), а не «усе від
  // початку»; запис, датований наперед (запланована ручна витрата), сьогоднішнім
  // не є.
  const tomorrowMs = kyivDayStartMs(shiftDayKey(todayKey, 1));
  const weekAgoMs = kyivDayStartMs(shiftDayKey(todayKey, -7));
  const excludedTxIds = financeExcludedTxIds(ctx);

  // Банк — через канонічний агрегатор (враховує спліти й виключені id),
  // ручні витрати — окремо, calcFinykPeriodAggregate їх не бачить.
  const bankSpend = (start: number, end: number): number =>
    calcFinykPeriodAggregate(ctx.transactions, {
      start,
      end,
      excludedTxIds,
      txSplits: ctx.txSplits ?? {},
    }).totalSpent;

  let todayManual = 0;
  let prev7Manual = 0;
  for (const me of ctx.manualExpenses) {
    if (isManualExpenseExcluded(excludedTxIds, me)) continue;
    const ts = new Date(me.date).getTime();
    if (!Number.isFinite(ts)) continue;
    const abs = Math.abs(Number(me.amount) || 0);
    if (ts >= todayMs) {
      if (ts < tomorrowMs) todayManual += abs;
    } else if (ts >= weekAgoMs) {
      prev7Manual += abs;
    }
  }

  const todaySpend = bankSpend(todayMs, tomorrowMs) + todayManual;
  const prev7Spend = bankSpend(weekAgoMs, todayMs) + prev7Manual;

  if (prev7Spend < MIN_PREV7_SUM) return null;
  if (todaySpend < MIN_TODAY_SUM) return null;

  const avgDaily = prev7Spend / 7;
  if (avgDaily <= 0) return null;
  const ratio = todaySpend / avgDaily;
  if (ratio < PACE_RATIO) return null;

  return { todaySpend, avgDaily, pctMore: Math.round((ratio - 1) * 100) };
}

export const dailyVsWeeklyPaceRule: Rule<FinanceContext> = {
  id: "finyk.daily_vs_weekly_pace",
  module: "finyk",
  evaluate(ctx) {
    const signal = evaluateDailyPace(ctx);
    if (!signal) return [];
    const { todaySpend, avgDaily, pctMore } = signal;
    return [
      {
        id: DAILY_PACE_REC_ID,
        module: "finyk" as const,
        priority: 72,
        icon: "clock",
        title: `Сьогодні ${formatNumberUk(Math.round(todaySpend))} ₴, на ${pctMore}% вище середнього`,
        body: `7-денна середня: ${formatNumberUk(Math.round(avgDaily))} ₴/день. Якщо платив готівкою, додай, поки памʼятаєш.`,
        action: "finyk",
        pwaAction: "add_expense",
      },
    ];
  },
};
