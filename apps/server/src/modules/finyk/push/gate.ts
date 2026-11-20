/**
 * Гейт push Фініка: тумблер, куди слати, годинник людини, ліміти.
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md. Одне читання за
 * PK на кожну подію (операція Monobank, синк ручних записів): якщо тумблер
 * вимкнено, слати нікуди або місячних чи тижневих лімітів немає, на цьому
 * все, до жодного запиту витрат (бриф § вартість запиту).
 *
 * Людина без рядка `user_preferences` читається дефолтами колонок:
 * тумблер увімкнений (міграція 175), стеля 2, тихі години 22:00-08:00,
 * пояс Київ (міграції 148, 168), так само як `monoPushVerdict`.
 */

import { getLimitBudgets } from "@sergeant/finyk-domain/domain/budget";
import type { Budget } from "@sergeant/finyk-domain/domain/types";

import {
  userClockFromRow,
  type UserClock,
  type UserClockRow,
} from "../../../lib/reminders/userClock.js";
import { hmToMinute, isInQuietWindow } from "../../../lib/reminders/time.js";
import type { FinykPushDb } from "./db.js";

export interface FinykPushGate {
  /** Тумблер «Ліміти й платежі Фініка» (`push_finyk_alerts`). */
  enabled: boolean;
  /** Є активна web-підписка або native-пристрій. */
  hasTarget: boolean;
  /** Доба, хвилина, тихі години й стеля в поясі людини. */
  clock: UserClock;
  /** Ліміти людини (`type: "limit"`), id з колонки рядка. */
  budgets: Budget[];
}

export type FinykGateOutcome =
  "ok" | "disabled" | "no_target" | "no_limits" | "quiet_deferred";

interface GateRow extends UserClockRow {
  push_finyk_alerts: boolean | null;
  has_target: boolean | null;
  budgets: unknown;
}

/**
 * Один запит: налаштування (LEFT JOIN, рядка може не бути), наявність
 * підписки чи пристрою і ліміти. `data_json || id` повторює читача веба
 * (`rowToBlob`: id береться з колонки, навіть якщо JSON розійшовся).
 */
export async function loadFinykPushGate(
  db: FinykPushDb,
  userId: string,
  now: Date,
): Promise<FinykPushGate> {
  const { rows } = await db.query<GateRow>(
    `SELECT u.user_id,
            p.push_finyk_alerts, p.push_daily_cap, p.time_zone,
            p.quiet_hours_enabled, p.quiet_hours_start_min,
            p.quiet_hours_end_min,
            (EXISTS (SELECT 1 FROM push_subscriptions s
                      WHERE s.user_id = u.user_id AND s.deleted_at IS NULL)
             OR EXISTS (SELECT 1 FROM push_devices d
                         WHERE d.user_id = u.user_id AND d.deleted_at IS NULL)
            ) AS has_target,
            (SELECT COALESCE(
                      jsonb_agg(b.data_json || jsonb_build_object('id', b.id::text)
                                ORDER BY b.created_at),
                      '[]'::jsonb)
               FROM finyk_budgets b
              WHERE b.user_id = u.user_id AND b.deleted_at IS NULL
                AND b.data_json->>'type' = 'limit') AS budgets
       FROM (SELECT $1::text AS user_id) u
       LEFT JOIN user_preferences p ON p.user_id = u.user_id`,
    [userId],
    "finyk_push_gate",
  );
  const row = rows[0];
  return {
    enabled: row?.push_finyk_alerts !== false,
    hasTarget: row?.has_target === true,
    // Колонки `NULL` (рядка налаштувань немає) годинник читає дефолтами.
    clock: userClockFromRow(row, now, null),
    budgets: Array.isArray(row?.budgets) ? (row.budgets as Budget[]) : [],
  };
}

/** Чи поточна хвилина людини в її тихих годинах. */
export function isQuietNow(clock: UserClock): boolean {
  return (
    clock.quiet !== null &&
    isInQuietWindow(hmToMinute(clock.hm), { enabled: true, ...clock.quiet })
  );
}

/**
 * Вердикт гейта для push ліміту. Порядок: тумблер, куди слати, чи є
 * місячний або тижневий ліміт (разовий push не отримує, спека § Дедуп),
 * тиха година. У тиху годину ключ не займається: поріг дошле прохід
 * нагадувань у першу хвилину після її кінця (відповідь власника на
 * питання 2, варіант (Б)).
 */
export function finykLimitGateOutcome(gate: FinykPushGate): FinykGateOutcome {
  if (!gate.enabled) return "disabled";
  if (!gate.hasTarget) return "no_target";
  const periodic = getLimitBudgets(gate.budgets).filter(
    (b) => b.period !== "one_time",
  );
  if (periodic.length === 0) return "no_limits";
  if (isQuietNow(gate.clock)) return "quiet_deferred";
  return "ok";
}
