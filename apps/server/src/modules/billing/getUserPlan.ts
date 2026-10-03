import type { Pool } from "pg";

export type Plan = "free" | "pro";

export interface UserPlanResult {
  plan: Plan;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  provider: string;
  /** Лише для `past_due`: доки діє grace після невдалої оплати. */
  graceEndsAt?: Date | null;
}

/** Стан доступу для знімка `/api/billing/status` і гейтів. */
export type AccessState = "free" | "trial" | "pro" | "grace";

/** Grace після невдалої оплати, коли вебхук не записав `grace_period_ends_at`. */
export const GRACE_FALLBACK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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
 * `past_due` is the exception: it is an entitlement only while the grace
 * window runs, `COALESCE(grace_period_ends_at, current_period_end + 3 days)`
 * (spec `docs/work/specs/access-tiers.md`). LiqPay/Plata webhooks may not
 * write the column, so the fallback is what normally applies.
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
  if (isFounderUser(userId)) {
    return syntheticProPlan();
  }

  const result = await pool.query<{
    plan: string;
    status: string;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    provider: string;
    grace_period_ends_at?: Date | null;
  }>(
    `SELECT plan, status, current_period_end, cancel_at_period_end, provider,
            grace_period_ends_at
     FROM subscriptions
     WHERE user_id = $1
       AND (
         (status IN ('active', 'trialing')
           AND (current_period_end IS NULL OR current_period_end > NOW()))
         OR (status = 'past_due'
           AND COALESCE(grace_period_ends_at,
                        current_period_end + make_interval(days => $2)) > NOW())
       )
     LIMIT 1`,
    [userId, GRACE_FALLBACK_DAYS],
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
    graceEndsAt:
      row.status === "past_due"
        ? (row.grace_period_ends_at ??
          (row.current_period_end
            ? new Date(
                row.current_period_end.getTime() + GRACE_FALLBACK_DAYS * DAY_MS,
              )
            : null))
        : null,
  };
}

/**
 * Єдине місце, де рядок підписки стає станом доступу. `requirePlan` і
 * знімок `/api/billing/status` читають саме його, щоб гейт і UI не
 * розійшлися під час trial чи grace.
 */
export function accessStateOf(
  p: UserPlanResult,
  now: Date = new Date(),
): AccessState {
  if (p.plan !== "pro") return "free";
  const running = (end: Date | null | undefined) =>
    end == null || end.getTime() > now.getTime();
  switch (p.status) {
    case "active":
      return running(p.currentPeriodEnd) ? "pro" : "free";
    case "trialing":
      return running(p.currentPeriodEnd) ? "trial" : "free";
    case "past_due":
      return p.graceEndsAt != null && p.graceEndsAt.getTime() > now.getTime()
        ? "grace"
        : "free";
    default:
      return "free";
  }
}
