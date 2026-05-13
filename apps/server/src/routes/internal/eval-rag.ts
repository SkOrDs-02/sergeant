/**
 * `/api/internal/eval/rag-weekly` — приймає JSON-result від weekly cron-у
 * (`scripts/rag-eval-weekly.mjs` ↗ n8n WF-28) і виконує 4 побічні ефекти:
 *
 *   1. INSERT у `n8n_failure_events` (workflow_id=`rag-eval-weekly`)
 *      — historical log для post-mortem.
 *   2. SET Prom gauges (`rag_eval_recall_at_4`, `..._precision_at_1`,
 *      `..._mrr`, `..._last_run_timestamp_seconds`, `..._last_run_status`)
 *      — щоб PromQL alert-rule бачила свіже значення між run-ами.
 *   3. Sentry capture при `status != "pass"`:
 *       - `warn` → `level=warning`, tag `auto_disable_recommended=false`
 *       - `kill` → `level=error`, tag `auto_disable_recommended=true`
 *      Sentry group-by-message буде фолд-ити повторні алерти у одне issue;
 *      delta vs прошлий тиждень (через `--baseline=...` у CLI) пробрасується
 *      в `extra.delta`.
 *   4. Auto-flip kill-switch `mono_ai_memory_ingest` при `status=kill`
 *      (in-memory; зберігається до process-restart). Не торкається env-у на
 *      Railway — operator має зробити permanent flip per runbook §
 *      «RagQualityGateKillSwitch».
 *
 * Auth: bearer-token guard у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 *
 * Архітектурна нота: endpoint приймає JSON-результат, а не сам рахує eval.
 * Це навмисно — eval живе у `scripts/eval-rag-recall.mjs` як CLI, що
 * запускається у GH Action / n8n / dev-laptop. Сервер тільки fan-out-ить
 * сигнали в спостережуваність. Логіка `compute → record → alert` залишається
 * pure-функцією; endpoint = thin сейв-layer.
 *
 * Reaction playbook: `docs/observability/runbook.md` §
 * «RagQualityGateDegraded» / «RagQualityGateKillSwitch».
 */

import * as Sentry from "@sentry/node";
import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { activateKillSwitch } from "../../lib/featureFlags/runtimeKillSwitch.js";
import { logger } from "../../obs/logger.js";
import {
  ragEvalLastRunStatus,
  ragEvalLastRunTimestampSeconds,
  ragEvalMrr,
  ragEvalPrecisionAt1,
  ragEvalRecallAt4,
  ragEvalRecordsTotal,
} from "../../obs/metrics.js";

// ─────────────────────────────────────────────────────────────────────────
// Zod schemas — дзеркалять output `scripts/eval-rag-recall.mjs` v2.0
// (PR-20 #2685). Mirror loose-ний навмисно (`.passthrough()`), щоб eval-CLI
// міг додавати поля без миттєвого breaking-cycle-у на endpoint-і.
// ─────────────────────────────────────────────────────────────────────────

const STATUS_VALUES = ["pass", "warn", "kill", "error"] as const;
export const STATUS_TO_GAUGE = {
  pass: 0,
  warn: 1,
  kill: 2,
  error: 3,
} as const;

const AggregateSchema = z
  .object({
    count: z.number().int().nonnegative(),
    mean: z.number(),
    min: z.number(),
    p50: z.number(),
  })
  .passthrough();

const MetricsBundleSchema = z
  .object({
    recallAtK: AggregateSchema,
    precisionAt1: AggregateSchema,
    mrr: AggregateSchema,
  })
  .passthrough();

const BaselineComparisonSchema = z
  .object({
    baselinePath: z.string(),
    deltas: z
      .object({
        recallAtK: z.number(),
        precisionAt1: z.number(),
        mrr: z.number(),
      })
      .passthrough(),
    regression: z.boolean(),
  })
  .passthrough()
  .nullable();

const SummaryBody = z
  .object({
    version: z.string(),
    mode: z.enum(["mock", "simulate", "live"]),
    ranAt: z.string().datetime({ offset: true }),
    topK: z.number().int().positive(),
    thresholds: z.object({
      warn: z.number(),
      kill: z.number(),
    }),
    metrics: MetricsBundleSchema,
    /** Legacy aggregate alias — PR-22 (#2624) залишив це поле; v2.0 дублює. */
    aggregate: AggregateSchema.optional(),
    status: z.enum(STATUS_VALUES),
    exitCode: z.number().int(),
    baselineComparison: BaselineComparisonSchema.optional(),
  })
  .passthrough();

export type RagEvalSummary = z.infer<typeof SummaryBody>;

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Формує human-readable error_message для `n8n_failure_events`. Мета —
 * щоб dedup-сигнатура (md5 over first 200 chars; migration 058) була стабільна
 * для повторних `status` без шуму від floating-point recall-у.
 */
export function formatEventMessage(summary: RagEvalSummary): string {
  const meanStr = summary.metrics.recallAtK.mean.toFixed(3);
  return (
    `rag-eval-weekly ${summary.status} ` +
    `mode=${summary.mode} ` +
    `recall@${summary.topK}=${meanStr} ` +
    `count=${summary.metrics.recallAtK.count}`
  );
}

/**
 * Чи варто авто-вимикати `mono_ai_memory_ingest`. Гард-функція для
 * idempotency-тестування — endpoint викликає це навіть якщо `status=kill`,
 * щоб у майбутньому можна було додати condition-и (наприклад, потребує
 * baseline-comparison-у з `regression=true`).
 */
export function shouldAutoDisableMonoIngest(summary: RagEvalSummary): boolean {
  return summary.status === "kill";
}

// ─────────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────────

export function createEvalRagInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.post(
    "/api/internal/eval/rag-weekly",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(SummaryBody, req, res);
      if (!parsed.ok) return;
      const summary = parsed.data;

      // ── 1. INSERT у n8n_failure_events ──
      // `error_message` — human-friendly status (dedup-friendly).
      // `raw` — повний summary JSON для post-mortem-аналізу.
      const message = formatEventMessage(summary);
      const insertResult = await pool.query<{ id: number | string }>(
        `INSERT INTO n8n_failure_events
            (workflow_id, workflow_name, execution_id, last_node, error_message, raw)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [
          "rag-eval-weekly",
          "RAG eval weekly",
          // ranAt як execution_id — унікальний на запуск, дозволяє idempotency
          // якщо n8n WF retry-ить той самий exec.
          summary.ranAt,
          summary.mode,
          message,
          JSON.stringify(summary),
        ],
      );
      // bigint → number coercion (Hard Rule #1 — apps/server/AGENTS.md).
      const recordId = Number(insertResult.rows[0]?.id ?? 0);

      // ── 2. SET Prom gauges ──
      try {
        const mode = summary.mode;
        ragEvalRecallAt4.set({ mode }, summary.metrics.recallAtK.mean);
        ragEvalPrecisionAt1.set({ mode }, summary.metrics.precisionAt1.mean);
        ragEvalMrr.set({ mode }, summary.metrics.mrr.mean);
        ragEvalLastRunTimestampSeconds.set(
          Math.floor(new Date(summary.ranAt).getTime() / 1000),
        );
        ragEvalLastRunStatus.set({ mode }, STATUS_TO_GAUGE[summary.status]);
        ragEvalRecordsTotal.inc({ status: summary.status });
      } catch (err) {
        // Metrics never block the record — лише логуємо.
        logger.warn({
          msg: "rag_eval_weekly_metrics_set_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 3. Sentry capture ──
      let sentryEventId: string | undefined;
      if (summary.status === "warn" || summary.status === "kill") {
        try {
          sentryEventId = Sentry.captureMessage(
            `RAG quality gate ${summary.status} — recall@${summary.topK}=${summary.metrics.recallAtK.mean.toFixed(3)}`,
            {
              level: summary.status === "kill" ? "error" : "warning",
              tags: {
                module: "rag-eval",
                op: "rag_quality_gate",
                status: summary.status,
                mode: summary.mode,
                auto_disable_recommended:
                  summary.status === "kill" ? "true" : "false",
              },
              extra: {
                topK: summary.topK,
                thresholds: summary.thresholds,
                metrics: summary.metrics,
                baselineComparison: summary.baselineComparison ?? null,
                ranAt: summary.ranAt,
                eventRecordId: recordId,
              },
            },
          );
        } catch (err) {
          logger.warn({
            msg: "rag_eval_weekly_sentry_capture_failed",
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── 4. Auto-flip kill-switch при status=kill ──
      let killSwitchActivated = false;
      if (shouldAutoDisableMonoIngest(summary)) {
        activateKillSwitch("mono_ai_memory_ingest", {
          reason: `auto: rag-eval kill (recall@${summary.topK}=${summary.metrics.recallAtK.mean.toFixed(3)})`,
          context: {
            mode: summary.mode,
            ranAt: summary.ranAt,
            recallAtK: summary.metrics.recallAtK.mean,
            killThreshold: summary.thresholds.kill,
            eventRecordId: recordId,
          },
        });
        killSwitchActivated = true;
      }

      logger.info({
        msg: "rag_eval_weekly_recorded",
        recordId,
        status: summary.status,
        mode: summary.mode,
        recallAtK: summary.metrics.recallAtK.mean,
        precisionAt1: summary.metrics.precisionAt1.mean,
        mrr: summary.metrics.mrr.mean,
        killSwitchActivated,
        sentryEventId,
      });

      res.json({
        ok: true,
        recordId,
        status: summary.status,
        killSwitchActivated,
        sentryEventId: sentryEventId ?? null,
      });
    }),
  );

  return r;
}
