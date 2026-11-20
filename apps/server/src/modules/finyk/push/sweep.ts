/**
 * Хвилинний прохід push Фініка: «завтра спишеться» і досилання порогів
 * ліміту після тихих годин.
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md. Кличе
 * планувальник нагадувань (`lib/reminders/scheduler.ts`) після основного
 * проходу, тож нагадування звичок, тренувань і їжі тієї самої хвилини
 * займають слоти стелі першими.
 *
 * Правило часу (спека § «Правило часу для кожного push»):
 *  - «завтра спишеться»: о 09:00 за годинником пристрою людини
 *    (`user_preferences.time_zone`, `NULL` = Київ), а якщо 09:00 у її тихих
 *    годинах, то в кінці тихих годин того ж дня (`nudgeAtHm`, те саме правило,
 *    що й нудж Сержанта). День списання питаємо в домену як
 *    `nextDayKey(день пристрою)`; сам цикл списання київський;
 *  - досилання порогів: у першу хвилину після кінця тихих годин людини
 *    прохід перераховує вердикт з даних і шле ще не застовплені пороги
 *    поточного періоду. Стану не треба: незайнятий ключ і є «ще не надіслано».
 *
 * Обидва push займають слот спільної стелі `push_daily_cap`; слота немає,
 * ключ однаково займається і push не йде (відповідь власника 2026-11-19).
 */

import type { Pool } from "pg";

import {
  finykDueDedupKey,
  nextDayKey,
  selectFinykChargesDueOn,
  type FlowSubscriptionInput,
} from "@sergeant/finyk-domain/domain/flowSchedule";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";

import { nudgeAtHm } from "../../../lib/reminders/nudge.js";
import { minuteToHm } from "../../../lib/reminders/time.js";
import {
  userClockFromRow,
  type UserClock,
  type UserClockRow,
} from "../../../lib/reminders/userClock.js";
import { logger, serializeError } from "../../../obs/logger.js";
import { finykPushEvaluationsTotal } from "../../../obs/metrics/finykPush.js";
import { sendToUserQuietly } from "../../../push/send.js";
import { finykPushDbFromPool, type FinykPushDb } from "./db.js";
import {
  claimFinykSend,
  runFinykLimitPushQuietly,
  type FinykPushOutcome,
} from "./limitPush.js";
import { loadFinykTransactions } from "./spendData.js";
import { buildFinykDuePush } from "./texts.js";

/**
 * Скільки днів операцій читаємо для сум підписок і залишків боргів:
 * два цикли списання. Старші привʼязані операції підтягуються за id.
 */
const DUE_TX_LOOKBACK_DAYS = 62;

/** Чи припадає `targetHm` на цю хвилину проходу (з наздоганянням). */
export function isDueThisMinute(
  targetHm: string,
  clock: Pick<UserClock, "hm" | "fromHm">,
): boolean {
  return (
    targetHm === clock.hm || (targetHm > clock.fromHm && targetHm < clock.hm)
  );
}

/** Час push «завтра спишеться» людини: 09:00 або кінець тихих годин. */
export function finykDueAtHm(clock: Pick<UserClock, "quiet">): string {
  return nudgeAtHm(clock.quiet);
}

/** Хвилина досилання порогів: кінець тихих годин; `null`, коли їх немає. */
export function finykQuietEndHm(
  clock: Pick<UserClock, "quiet">,
): string | null {
  return clock.quiet ? minuteToHm(clock.quiet.endMin) : null;
}

type CandidateRow = UserClockRow & { user_id: string };

/**
 * Кандидати: тумблер увімкнений (людина без рядка налаштувань теж, дефолт
 * міграції 175), є куди слати, і є потрібні дані Фініка. `kind` обирає,
 * які саме: підписки чи борги для платежу, ліміти для досилання.
 */
async function loadCandidates(
  db: FinykPushDb,
  kind: "due" | "limit",
): Promise<CandidateRow[]> {
  // Один параметризований запит на обидва види: гілка, що не стосується
  // `kind`, відсікається умовою `$1` і нічого не читає.
  const { rows } = await db.query<CandidateRow>(
    `SELECT u.user_id, p.push_daily_cap, p.time_zone, p.quiet_hours_enabled,
            p.quiet_hours_start_min, p.quiet_hours_end_min
       FROM (SELECT user_id FROM finyk_subscriptions
              WHERE $1 = 'due' AND deleted_at IS NULL
             UNION
             SELECT user_id FROM finyk_debts
              WHERE $1 = 'due' AND deleted_at IS NULL
             UNION
             SELECT user_id FROM finyk_budgets
              WHERE $1 = 'limit' AND deleted_at IS NULL
                AND data_json->>'type' = 'limit') u
       LEFT JOIN user_preferences p ON p.user_id = u.user_id
      WHERE COALESCE(p.push_finyk_alerts, TRUE)
        AND (EXISTS (SELECT 1 FROM push_subscriptions s
                      WHERE s.user_id = u.user_id AND s.deleted_at IS NULL)
             OR EXISTS (SELECT 1 FROM push_devices d
                         WHERE d.user_id = u.user_id AND d.deleted_at IS NULL))`,
    [kind],
    `finyk_push_candidates_${kind}`,
  );
  return rows;
}

interface FlowsRow {
  subscriptions: unknown;
  debts: unknown;
}

async function loadFlows(
  db: FinykPushDb,
  userId: string,
): Promise<{ subscriptions: FlowSubscriptionInput[]; debts: Debt[] }> {
  const { rows } = await db.query<FlowsRow>(
    `SELECT
       (SELECT COALESCE(jsonb_agg(s.data_json || jsonb_build_object('id', s.id::text)
                                  ORDER BY s.created_at), '[]'::jsonb)
          FROM finyk_subscriptions s
         WHERE s.user_id = $1 AND s.deleted_at IS NULL) AS subscriptions,
       (SELECT COALESCE(jsonb_agg(d.data_json || jsonb_build_object('id', d.id::text)
                                  ORDER BY d.created_at), '[]'::jsonb)
          FROM finyk_debts d
         WHERE d.user_id = $1 AND d.deleted_at IS NULL) AS debts`,
    [userId],
    "finyk_push_flows",
  );
  const row = rows[0];
  return {
    subscriptions: Array.isArray(row?.subscriptions)
      ? (row.subscriptions as FlowSubscriptionInput[])
      : [],
    debts: Array.isArray(row?.debts) ? (row.debts as Debt[]) : [],
  };
}

function linkedTxIds(
  subscriptions: readonly FlowSubscriptionInput[],
  debts: readonly Debt[],
): string[] {
  const ids = new Set<string>();
  for (const s of subscriptions) if (s.linkedTxId) ids.add(s.linkedTxId);
  for (const d of debts) {
    for (const id of d.linkedTxIds ?? []) if (id) ids.add(id);
  }
  return [...ids];
}

function count(kind: "limit" | "due", outcome: FinykPushOutcome): void {
  try {
    finykPushEvaluationsTotal.inc({ kind, outcome });
  } catch {
    /* metrics must never break a push */
  }
}

/** Push «завтра спишеться» для однієї людини, чий час настав. */
export async function runFinykDuePush(
  db: FinykPushDb,
  userId: string,
  clock: UserClock,
  now: Date,
): Promise<FinykPushOutcome> {
  const { subscriptions, debts } = await loadFlows(db, userId);
  if (subscriptions.length === 0 && debts.length === 0) {
    count("due", "nothing");
    return "nothing";
  }
  const transactions = await loadFinykTransactions(
    db,
    userId,
    now.getTime() - DUE_TX_LOOKBACK_DAYS * 86_400_000,
    linkedTxIds(subscriptions, debts),
  );
  const dueDayKey = nextDayKey(clock.dayKey);
  const charges = selectFinykChargesDueOn({
    subscriptions,
    manualDebts: debts,
    transactions,
    nowMs: now.getTime(),
    dueDayKey,
  });
  if (charges.length === 0) {
    count("due", "nothing");
    return "nothing";
  }
  const outcome = await claimFinykSend(
    db,
    userId,
    charges.map((c) => finykDueDedupKey(c.flowId, c.dueDayKey)),
    clock,
  );
  count("due", outcome);
  // Без назв і сум (Hard Rule #21): лише вид і кількість.
  logger.info({ msg: "finyk_due_push", outcome, charges: charges.length });
  if (outcome === "sent") {
    await sendToUserQuietly(userId, buildFinykDuePush(charges, dueDayKey), {
      module: "finyk",
    });
  }
  return outcome;
}

export interface FinykPushSweepResult {
  due: number;
  catchUp: number;
}

/**
 * Один прохід. Збій однієї людини не зупиняє решту; збій усього проходу
 * лише логується: основний прохід нагадувань уже відпрацював.
 */
export async function runFinykPushSweep(
  pool: Pool,
  now: Date,
  lastSweepAt: Date | null,
  db: FinykPushDb = finykPushDbFromPool(pool),
): Promise<FinykPushSweepResult> {
  const result: FinykPushSweepResult = { due: 0, catchUp: 0 };
  try {
    const [dueRows, limitRows] = await Promise.all([
      loadCandidates(db, "due"),
      loadCandidates(db, "limit"),
    ]);
    for (const row of dueRows) {
      const clock = userClockFromRow(row, now, lastSweepAt);
      if (!isDueThisMinute(finykDueAtHm(clock), clock)) continue;
      result.due++;
      try {
        await runFinykDuePush(db, row.user_id, clock, now);
      } catch (err) {
        count("due", "error");
        logger.warn({
          msg: "finyk_due_push_failed",
          err: serializeError(err, { includeStack: false }),
        });
      }
    }
    for (const row of limitRows) {
      const clock = userClockFromRow(row, now, lastSweepAt);
      const endHm = finykQuietEndHm(clock);
      if (endHm === null || !isDueThisMinute(endHm, clock)) continue;
      result.catchUp++;
      await runFinykLimitPushQuietly(db, row.user_id, now, "quiet_end");
    }
  } catch (err) {
    logger.warn({
      msg: "finyk_push_sweep_failed",
      err: serializeError(err, { includeStack: false }),
    });
  }
  return result;
}
