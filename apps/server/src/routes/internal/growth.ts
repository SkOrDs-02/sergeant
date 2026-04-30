import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * Growth / revenue snapshot endpoints (n8n WF-60…WF-66).
 *
 * Hard Rule #1: усі `bigint` із Postgres явно coerce-яться до `number`
 * у JSON-відповіді (див. `Number(...)` на кожному `id`).
 */

interface FunnelRow {
  step?: string;
  stepOrder?: number;
  segment?: string;
  count?: number;
  conversionRate?: number | null;
  raw?: unknown;
}

interface CohortRow {
  cohortStart?: string;
  periodOffset?: number;
  cohortSize?: number;
  retained?: number;
  retentionRate?: number | null;
}

interface AcquisitionRow {
  source?: string;
  medium?: string;
  campaign?: string;
  signups?: number;
  spendCents?: number;
  cacCents?: number | null;
  raw?: unknown;
}

interface FeatureAdoptionRow {
  featureKey?: string;
  module?: string;
  activeUsers?: number;
  totalUsers?: number;
  adoptionRate?: number | null;
}

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nonNeg(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function bigIntStr(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Math.trunc(value).toString();
}

function toJsonbDefault(value: unknown): string {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function createGrowthInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  // ── Funnel snapshot ────────────────────────────────────────────────────────
  r.post(
    "/api/internal/growth/funnel",
    asyncHandler(async (req, res) => {
      const body = req.body as { snapshotDate?: string; rows?: FunnelRow[] };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let inserted = 0;
      for (const row of rows) {
        if (!row.step || typeof row.stepOrder !== "number") continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO growth_funnel_daily (
             snapshot_date, step, step_order, segment, count, conversion_rate, raw
           )
           VALUES ($1::date, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (snapshot_date, step, segment)
           DO UPDATE SET
             step_order = EXCLUDED.step_order,
             count = EXCLUDED.count,
             conversion_rate = EXCLUDED.conversion_rate,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            body.snapshotDate,
            row.step,
            Math.trunc(row.stepOrder),
            row.segment ?? "all",
            nonNeg(row.count),
            typeof row.conversionRate === "number" ? row.conversionRate : null,
            toJsonbDefault(row.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Cohort retention ───────────────────────────────────────────────────────
  r.post(
    "/api/internal/growth/cohort",
    asyncHandler(async (req, res) => {
      const body = req.body as { rows?: CohortRow[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let inserted = 0;
      for (const row of rows) {
        if (!isYmd(row.cohortStart) || typeof row.periodOffset !== "number") {
          continue;
        }
        const result = await pool.query<{ id: string }>(
          `INSERT INTO growth_cohorts (
             cohort_start, period_offset, cohort_size, retained, retention_rate
           )
           VALUES ($1::date, $2, $3, $4, $5)
           ON CONFLICT (cohort_start, period_offset)
           DO UPDATE SET
             cohort_size = EXCLUDED.cohort_size,
             retained = EXCLUDED.retained,
             retention_rate = EXCLUDED.retention_rate
           RETURNING id`,
          [
            row.cohortStart,
            Math.max(0, Math.trunc(row.periodOffset)),
            nonNeg(row.cohortSize),
            nonNeg(row.retained),
            typeof row.retentionRate === "number" ? row.retentionRate : null,
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Revenue snapshot ───────────────────────────────────────────────────────
  r.post(
    "/api/internal/revenue/snapshot",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        snapshotDate?: string;
        mrrCents?: number;
        arrCents?: number;
        arpuCents?: number;
        activeSubscriptions?: number;
        newMrrCents?: number;
        expansionMrrCents?: number;
        contractionMrrCents?: number;
        churnMrrCents?: number;
        netNewMrrCents?: number;
        logoChurnCount?: number;
        raw?: unknown;
      };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }

      const result = await pool.query<{ id: string }>(
        `INSERT INTO revenue_daily (
           snapshot_date, mrr_cents, arr_cents, arpu_cents, active_subscriptions,
           new_mrr_cents, expansion_mrr_cents, contraction_mrr_cents,
           churn_mrr_cents, net_new_mrr_cents, logo_churn_count, raw
         )
         VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (snapshot_date)
         DO UPDATE SET
           mrr_cents = EXCLUDED.mrr_cents,
           arr_cents = EXCLUDED.arr_cents,
           arpu_cents = EXCLUDED.arpu_cents,
           active_subscriptions = EXCLUDED.active_subscriptions,
           new_mrr_cents = EXCLUDED.new_mrr_cents,
           expansion_mrr_cents = EXCLUDED.expansion_mrr_cents,
           contraction_mrr_cents = EXCLUDED.contraction_mrr_cents,
           churn_mrr_cents = EXCLUDED.churn_mrr_cents,
           net_new_mrr_cents = EXCLUDED.net_new_mrr_cents,
           logo_churn_count = EXCLUDED.logo_churn_count,
           raw = EXCLUDED.raw
         RETURNING id`,
        [
          body.snapshotDate,
          bigIntStr(body.mrrCents),
          bigIntStr(body.arrCents),
          bigIntStr(body.arpuCents),
          nonNeg(body.activeSubscriptions),
          bigIntStr(body.newMrrCents),
          bigIntStr(body.expansionMrrCents),
          bigIntStr(body.contractionMrrCents),
          bigIntStr(body.churnMrrCents),
          bigIntStr(body.netNewMrrCents),
          nonNeg(body.logoChurnCount),
          toJsonbDefault(body.raw),
        ],
      );

      res.json({ ok: true, id: Number(result.rows[0]?.id ?? 0) });
    }),
  );

  // ── Acquisition channels ───────────────────────────────────────────────────
  r.post(
    "/api/internal/growth/acquisition",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        snapshotDate?: string;
        rows?: AcquisitionRow[];
      };
      if (!isYmd(body.snapshotDate)) {
        res.status(400).json({ error: "snapshotDate must be YYYY-MM-DD" });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let inserted = 0;
      for (const row of rows) {
        if (!row.source) continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO growth_acquisition_daily (
             snapshot_date, source, medium, campaign, signups, spend_cents, cac_cents, raw
           )
           VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (snapshot_date, source, medium, campaign)
           DO UPDATE SET
             signups = EXCLUDED.signups,
             spend_cents = EXCLUDED.spend_cents,
             cac_cents = EXCLUDED.cac_cents,
             raw = EXCLUDED.raw
           RETURNING id`,
          [
            body.snapshotDate,
            row.source,
            row.medium ?? "",
            row.campaign ?? "",
            nonNeg(row.signups),
            bigIntStr(row.spendCents),
            typeof row.cacCents === "number"
              ? Math.trunc(row.cacCents).toString()
              : null,
            toJsonbDefault(row.raw),
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  // ── Feature adoption ───────────────────────────────────────────────────────
  r.post(
    "/api/internal/growth/feature-adoption",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        weekStart?: string;
        rows?: FeatureAdoptionRow[];
      };
      if (!isYmd(body.weekStart)) {
        res.status(400).json({ error: "weekStart must be YYYY-MM-DD" });
        return;
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      let inserted = 0;
      for (const row of rows) {
        if (!row.featureKey) continue;
        const result = await pool.query<{ id: string }>(
          `INSERT INTO feature_adoption_weekly (
             week_start, feature_key, module, active_users, total_users, adoption_rate
           )
           VALUES ($1::date, $2, $3, $4, $5, $6)
           ON CONFLICT (week_start, feature_key, module)
           DO UPDATE SET
             active_users = EXCLUDED.active_users,
             total_users = EXCLUDED.total_users,
             adoption_rate = EXCLUDED.adoption_rate
           RETURNING id`,
          [
            body.weekStart,
            row.featureKey,
            row.module ?? "core",
            nonNeg(row.activeUsers),
            nonNeg(row.totalUsers),
            typeof row.adoptionRate === "number" ? row.adoptionRate : null,
          ],
        );
        if (result.rows.length > 0) inserted += 1;
      }
      res.json({ ok: true, inserted });
    }),
  );

  return r;
}
