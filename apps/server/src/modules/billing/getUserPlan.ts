import type { Pool } from "pg";
import { env } from "../../env/env.js";

export type Plan = "free" | "pro";

export interface UserPlanResult {
  plan: Plan;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  provider: string;
}

/**
 * Reads the canonical subscriptions table (migration 056) for the given user.
 * Returns a synthetic free-plan record when no active/trialing/past_due row exists.
 *
 * A row is only an entitlement while its period still runs: `current_period_end`
 * in the past means expired, regardless of `status` (a canceled-at-period-end or
 * past_due row keeps its status forever — nothing flips it back). `NULL` means
 * "no period at all" — manual/admin grants and the Stripe checkout row written
 * before the first subscription webhook — and stays valid.
 *
 * userId is a TEXT primary key matching the "user" table (Better Auth / session id).
 */
/**
 * Founder Better-Auth user IDs get a permanent Pro entitlement, independent
 * of any subscriptions row. Same allowlist as the AI-quota bypass
 * (`chat/aiQuota.ts` isFounderUser) — one env var, one meaning. Exported so
 * every plan-reading code path (`requirePlan` gate, `/api/billing/status`
 * route) shares this single check instead of re-implementing it — a prior
 * duplication let the two paths drift out of sync (round-2 UI audit S1).
 */
export function isFounderUser(userId: string): boolean {
  const raw = process.env["AI_QUOTA_FOUNDER_IDS"];
  if (!raw) return false;
  return raw.split(",").some((id) => id.trim() !== "" && id.trim() === userId);
}

/**
 * AI-LEGACY: expires 2026-10-31 — інфраструктура закритої бети.
 *
 * `BILLING_ALL_PRO` видає Pro всім автентизованим, не заводячи рядків у
 * `subscriptions`. Читається через `env`, а не `process.env`, бо Zod-схема
 * валить старт на одруківці — мовчазне «всі лишились на Free» тут гірше за
 * відмову стартувати.
 *
 * Експортується з тієї ж причини, що й `isFounderUser`: план читають ДВА
 * незалежні шляхи — цей модуль і роут `/api/billing/status`, який ходить у
 * `subscriptions` напряму. Одного разу вони вже розійшлись саме так
 * (round-2 UI audit S1), і наслідок був характерний: сервер пускав, а
 * клієнт малював Free. Один прапорець — одна перевірка на обох шляхах.
 */
export function isAllProEnabled(): boolean {
  return env.BILLING_ALL_PRO;
}

/** Синтетичний Pro-запис для байпасів — без рядка в `subscriptions`. */
function syntheticProPlan(): UserPlanResult {
  return {
    plan: "pro",
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    provider: "manual",
  };
}

export async function getUserPlan(
  pool: Pool,
  userId: string,
): Promise<UserPlanResult> {
  if (isFounderUser(userId) || isAllProEnabled()) {
    return syntheticProPlan();
  }

  const result = await pool.query<{
    plan: string;
    status: string;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    provider: string;
  }>(
    `SELECT plan, status, current_period_end, cancel_at_period_end, provider
     FROM subscriptions
     WHERE user_id = $1
       AND status IN ('active', 'trialing', 'past_due')
       AND (current_period_end IS NULL OR current_period_end > NOW())
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return {
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      provider: "manual",
    };
  }

  // noUncheckedIndexedAccess: length-guard above guarantees row exists
  const row = result.rows[0] as NonNullable<(typeof result.rows)[0]>;
  return {
    plan: row.plan as Plan,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    provider: row.provider,
  };
}
