import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * Internal (bearer-guarded) manual billing controls — admin/ops tooling for
 * comp-акаунти і ручні корекції плану без платіжного провайдера.
 *
 * Пише в канонічну таблицю `subscriptions` (m056, provider='manual').
 * Попередня версія цих ендпоінтів оновлювала неіснуючу таблицю `users`
 * (Better Auth таблиця — `"user"`, без plan-колонок) і гарантовано
 * падала 500 при першому виклику — audit 2026-06-11 ws-08.
 *
 * Контракт: `{ userId }` — Better Auth opaque string. Stripe-шлях
 * (webhook upsert) ці ендпоінти не зачіпають і не дублюють.
 */
export function createBillingInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.post(
    "/api/internal/billing/upgrade",
    asyncHandler(async (req, res) => {
      const { userId } = req.body as { userId?: string };
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      try {
        const { rows } = await pool.query<{
          id: number;
          plan: string;
          status: string;
          provider: string;
        }>(
          `INSERT INTO subscriptions (user_id, plan, status, provider)
           VALUES ($1, 'pro', 'active', 'manual')
           ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due')
           DO UPDATE SET plan = 'pro', updated_at = NOW()
           RETURNING id, plan, status, provider`,
          [userId],
        );
        res.json({ ok: true, subscription: rows[0] });
      } catch (err) {
        // 23503 = FK violation: user_id не існує в "user".
        if ((err as { code?: string }).code === "23503") {
          res.status(404).json({ error: "User not found" });
          return;
        }
        throw err;
      }
    }),
  );

  r.post(
    "/api/internal/billing/downgrade",
    asyncHandler(async (req, res) => {
      const { userId } = req.body as { userId?: string };
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      const { rows } = await pool.query<{
        id: number;
        plan: string;
        status: string;
      }>(
        `UPDATE subscriptions
            SET status = 'canceled', cancel_at_period_end = FALSE, updated_at = NOW()
          WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
          RETURNING id, plan, status`,
        [userId],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "No active subscription" });
        return;
      }
      res.json({ ok: true, subscription: rows[0] });
    }),
  );

  return r;
}
