import type { Pool } from "pg";

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
 * userId is a TEXT primary key matching the "user" table (Better Auth / session id).
 */
/**
 * Founder Better-Auth user IDs get a permanent Pro entitlement, independent
 * of any subscriptions row. Same allowlist as the AI-quota bypass
 * (`chat/aiQuota.ts` isFounderUser) — one env var, one meaning.
 */
function isFounderUser(userId: string): boolean {
  const raw = process.env["AI_QUOTA_FOUNDER_IDS"];
  if (!raw) return false;
  return raw.split(",").some((id) => id.trim() !== "" && id.trim() === userId);
}

export async function getUserPlan(
  pool: Pool,
  userId: string,
): Promise<UserPlanResult> {
  if (isFounderUser(userId)) {
    return {
      plan: "pro",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      provider: "manual",
    };
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
