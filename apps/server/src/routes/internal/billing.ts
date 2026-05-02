import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

export function createBillingInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.post(
    "/api/internal/billing/upgrade",
    asyncHandler(async (req, res) => {
      const { stripeCustomerId } = req.body as { stripeCustomerId?: string };
      if (!stripeCustomerId) {
        res.status(400).json({ error: "stripeCustomerId is required" });
        return;
      }
      const { rows } = await pool.query<{ id: string; email: string }>(
        `UPDATE users
           SET plan = 'pro', plan_updated_at = NOW()
         WHERE stripe_customer_id = $1
         RETURNING id, email`,
        [stripeCustomerId],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({ ok: true, user: rows[0] });
    }),
  );

  r.post(
    "/api/internal/billing/downgrade",
    asyncHandler(async (req, res) => {
      const { stripeCustomerId } = req.body as { stripeCustomerId?: string };
      if (!stripeCustomerId) {
        res.status(400).json({ error: "stripeCustomerId is required" });
        return;
      }
      const { rows } = await pool.query<{ id: string; email: string }>(
        `UPDATE users
           SET plan = 'free', plan_updated_at = NOW()
         WHERE stripe_customer_id = $1
         RETURNING id, email`,
        [stripeCustomerId],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({ ok: true, user: rows[0] });
    }),
  );

  return r;
}
