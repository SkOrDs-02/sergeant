/**
 * Push Фініка про ліміт: 80 % і 100 %, кожен поріг раз за період.
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md. Відповідь
 * власника 2026-11-19: push рахується в денну стелю сповіщень (немає
 * слота: не йде, лишається рядок на хабі); у тиху годину досилається після
 * її кінця; один тумблер, увімкнений за замовчуванням.
 *
 * Розрахунок цілком у `@sergeant/finyk-domain` (`calcFinykLimitProgress`,
 * `finykLimitPushVerdict`): тут лише збір входів, гейт, claim і відправка.
 *
 * Порядок claim (дзеркало проходу нагадувань, `lib/reminders/sweep.ts`):
 * спершу слот стелі, потім ключі порогів. Немає слота: ключі порогів однаково
 * займаються. Так поріг, який не вліз у стелю, не дошлеться ні після тихої
 * години, ні завтра; людина бачить рядок «Зараз» на хабі. Тиха година
 * ключів не займає зовсім: прохід нагадувань дошле їх у першу хвилину після
 * її кінця, перерахувавши вердикт з даних (`./sweep.ts`).
 */

import {
  getLimitBudgets,
  getLimitPeriodRange,
} from "@sergeant/finyk-domain/domain/budget";
import {
  calcFinykLimitProgress,
  finykLimitPushVerdict,
  type FinykLimitProgress,
} from "@sergeant/finyk-domain/domain/limitPush";

import {
  claimBudgetSlot,
  releaseBudgetSlot,
} from "../../../lib/reminders/budgetSlots.js";
import { logger, serializeError } from "../../../obs/logger.js";
import { finykPushEvaluationsTotal } from "../../../obs/metrics/finykPush.js";
import { sendToUserQuietly } from "../../../push/send.js";
import type { FinykPushDb } from "./db.js";
import {
  finykLimitGateOutcome,
  loadFinykPushGate,
  type FinykPushGate,
} from "./gate.js";
import {
  finykExcludedTxIds,
  loadFinykSpendAux,
  loadFinykTransactions,
} from "./spendData.js";
import { buildFinykLimitPush, finykLimitLabel } from "./texts.js";

/** Звідки прийшла оцінка: лише для логу, не для логіки. */
export type FinykLimitTrigger =
  "mono_webhook" | "sync" | "manual_expense" | "quiet_end";

export type FinykPushOutcome =
  | "sent"
  | "nothing"
  | "disabled"
  | "no_target"
  | "no_limits"
  | "quiet_deferred"
  | "cap_exhausted"
  | "deduped"
  | "error";

/** Префікс ключів дедупу ліміту (`finykLimitDedupKey`). */
const LIMIT_KEY_PREFIX = "finyk_limit_";

/**
 * Застовпити ключ у журналі. `true`, якщо цей процес вставив рядок.
 * `module = 'finyk'`, `day_key` = день людини, у який зроблено claim
 * (ретенція 45 днів довша за місячний період, спека § Дедуп).
 */
async function claimKey(
  db: FinykPushDb,
  userId: string,
  key: string,
  dayKey: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO push_reminder_log (user_id, dedup_key, module, day_key)
          VALUES ($1, $2, 'finyk', $3)
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    [userId, key, dayKey],
    "finyk_push_claim",
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Застовпити ключі однієї відправки разом зі слотом стелі. Повертає
 * `sent`, коли цей процес виграв і має слати, `cap_exhausted`, коли слота
 * немає (ключі зайнято, слати не можна), `deduped`, коли всі ключі вже
 * зайняв інший процес.
 */
export async function claimFinykSend(
  db: FinykPushDb,
  userId: string,
  keys: readonly string[],
  clock: { dayKey: string; cap: number },
): Promise<"sent" | "cap_exhausted" | "deduped"> {
  const slot = await claimBudgetSlot(db, userId, clock.dayKey, clock.cap);
  let won = 0;
  for (const key of keys) {
    if (await claimKey(db, userId, key, clock.dayKey)) won++;
  }
  if (won === 0) {
    if (slot) await releaseBudgetSlot(db, userId, slot);
    return "deduped";
  }
  return slot ? "sent" : "cap_exhausted";
}

function countOutcome(kind: "limit" | "due", outcome: FinykPushOutcome): void {
  try {
    finykPushEvaluationsTotal.inc({ kind, outcome });
  } catch {
    /* metrics must never break a push */
  }
}

/** Початок найранішого вікна серед лімітів: звідти читаємо операції. */
function earliestPeriodStartMs(gate: FinykPushGate, now: Date): number {
  return Math.min(
    ...getLimitBudgets(gate.budgets)
      .filter((b) => b.period !== "one_time")
      .map((b) => getLimitPeriodRange(b, now).startMs),
  );
}

/**
 * Оцінити ліміти людини й надіслати push про перетнутий поріг.
 * Повертає підсумок (для тестів і метрики); push іде лише на `sent`.
 */
export async function runFinykLimitPush(
  db: FinykPushDb,
  userId: string,
  now: Date,
  trigger: FinykLimitTrigger,
): Promise<FinykPushOutcome> {
  const gate = await loadFinykPushGate(db, userId, now);
  const gateOutcome = finykLimitGateOutcome(gate);
  if (gateOutcome !== "ok") {
    countOutcome("limit", gateOutcome);
    return gateOutcome;
  }

  const [transactions, aux] = await Promise.all([
    loadFinykTransactions(db, userId, earliestPeriodStartMs(gate, now)),
    loadFinykSpendAux(db, userId, LIMIT_KEY_PREFIX),
  ]);
  const progress = calcFinykLimitProgress({
    budgets: gate.budgets,
    transactions,
    excludedTxIds: finykExcludedTxIds(aux, transactions),
    txCategories: aux.txCategories,
    merchantRuleIndex: aux.merchantRuleIndex,
    txSplits: aux.txSplits,
    customCategories: aux.customCategories,
    nowMs: now.getTime(),
  });

  const fired: {
    p: FinykLimitProgress;
    threshold: 80 | 100;
    keys: string[];
  }[] = [];
  for (const p of progress) {
    const verdict = finykLimitPushVerdict(p, aux.claimedKeys);
    if (verdict.notify !== null) {
      fired.push({ p, threshold: verdict.notify, keys: verdict.claimKeys });
    }
  }
  if (fired.length === 0) {
    countOutcome("limit", "nothing");
    return "nothing";
  }

  let last: FinykPushOutcome = "nothing";
  const byId = new Map(getLimitBudgets(gate.budgets).map((b) => [b.id, b]));
  for (const { p, threshold, keys } of fired) {
    const outcome = await claimFinykSend(db, userId, keys, gate.clock);
    countOutcome("limit", outcome);
    // Без сум, назв і категорій (Hard Rule #21): лише вид і поріг.
    logger.info({
      msg: "finyk_limit_push",
      outcome,
      threshold,
      trigger,
    });
    last = outcome;
    if (outcome !== "sent") continue;
    const budget = byId.get(p.budgetId);
    await sendToUserQuietly(
      userId,
      buildFinykLimitPush({
        budgetId: p.budgetId,
        label: budget ? finykLimitLabel(budget, aux.customCategories) : "",
        threshold,
        spentMinor: p.spentMinor,
        limitMinor: p.limitMinor,
        pctRaw: p.pctRaw,
        periodKey: p.periodKey,
      }),
      { module: "finyk" },
    );
  }
  return last;
}

/**
 * Обгортка для побічного виклику з вебхука й синку: ніколи не кидає.
 * Відповідь клієнту вже віддано, тож збій push лише логується.
 */
export async function runFinykLimitPushQuietly(
  db: FinykPushDb,
  userId: string,
  now: Date,
  trigger: FinykLimitTrigger,
): Promise<FinykPushOutcome> {
  try {
    return await runFinykLimitPush(db, userId, now, trigger);
  } catch (err) {
    countOutcome("limit", "error");
    logger.warn({
      msg: "finyk_limit_push_failed",
      trigger,
      err: serializeError(err, { includeStack: false }),
    });
    return "error";
  }
}
