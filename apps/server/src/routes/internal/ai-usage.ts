import { Router } from "express";
import type { Pool } from "pg";
import { toLocalISODate } from "@sergeant/shared";
import { ANTHROPIC_PROVIDER_SUBJECT } from "../../lib/anthropicUsageStore.js";
interface AiUsageBody {
  source: string;
  bucket?: string;
  inputTokens?: number;
  outputTokens?: number;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function createAiUsageInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.post("/api/internal/ai-usage", async (req, res) => {
    const { source, bucket = "default" } = req.body as AiUsageBody;
    const inputTokens = nonNegativeInt((req.body as AiUsageBody).inputTokens);
    const outputTokens = nonNegativeInt((req.body as AiUsageBody).outputTokens);

    if (!source) {
      res.status(400).json({ error: "source is required" });
      return;
    }

    const totalTokens = inputTokens + outputTokens;
    // Europe/Kyiv day boundary (домен-інваріант) — той самий стовпець
    // `ai_usage_daily.usage_day` пишеться через `toLocalISODate` в
    // anthropicUsageStore і читається як Kyiv-день у aiCostSummary.
    const usageDay = toLocalISODate();

    await pool.query(
      `INSERT INTO ai_usage_daily (
           subject_key,
           usage_day,
           bucket,
           request_count,
           input_tokens,
           output_tokens,
           total_tokens,
           endpoint
         )
         VALUES ($1, $2::date, $3, 1, $4, $5, $6, $7)
         ON CONFLICT (subject_key, usage_day, bucket, endpoint)
         DO UPDATE SET
           request_count = ai_usage_daily.request_count + 1,
           input_tokens  = ai_usage_daily.input_tokens  + EXCLUDED.input_tokens,
           output_tokens = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
           total_tokens  = ai_usage_daily.total_tokens  + EXCLUDED.total_tokens`,
      [
        `n8n:${source}`,
        usageDay,
        bucket,
        inputTokens,
        outputTokens,
        totalTokens,
        // Без ендпоінта рядок не дедуплікується новим унікальним індексом
        // (міграція 091): NULL-и в Postgres унікальні між собою, тож кожен
        // виклик створював би окремий рядок замість інкременту.
        `n8n:${source}`,
      ],
    );

    res.json({ ok: true });
  });

  /**
   * Читалка витрат на AI. Досі таблиця лише наповнювалась — жодного способу
   * подивитись, на що саме йдуть гроші, не існувало.
   *
   * Розріз по (endpoint × bucket) — рівно той, якого бракувало: поки перший
   * тур і синтез їхали різними моделями, розділяв `bucket`; щойно вони
   * ділять модель, розрізняє лише `endpoint`.
   *
   * `cache_hit_pct` — головне число для оцінки економіки: payload першого
   * туру це ~10.5k незмінних токенів, і різниця між прогрітим і холодним
   * кешем там майже десятикратна.
   */
  r.get("/api/internal/ai-usage", async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query["days"]) || 7));

    const { rows } = await pool.query(
      `SELECT
         COALESCE(endpoint, 'unknown')          AS endpoint,
         bucket,
         SUM(request_count)::bigint             AS calls,
         SUM(input_tokens)::bigint              AS input_tokens,
         SUM(COALESCE(cache_read_tokens, 0))::bigint AS cache_read_tokens,
         SUM(output_tokens)::bigint             AS output_tokens,
         SUM(COALESCE(actual_cost_usd, est_cost_usd))::numeric AS cost_usd
       FROM ai_usage_daily
       WHERE usage_day >= (CURRENT_DATE - $1::int)
         AND subject_key = $2
       GROUP BY 1, 2
       ORDER BY cost_usd DESC NULLS LAST`,
      [days, ANTHROPIC_PROVIDER_SUBJECT],
    );

    // Hard Rule #1: pg віддає bigint/numeric рядками — коерцимо на межі API,
    // інакше рядки протікають у клієнтські кеші й ламають арифметику.
    const items = rows.map((row: Record<string, unknown>) => {
      const calls = Number(row["calls"] ?? 0);
      const inputTokens = Number(row["input_tokens"] ?? 0);
      const cacheRead = Number(row["cache_read_tokens"] ?? 0);
      const costUsd = Number(row["cost_usd"] ?? 0);
      return {
        endpoint: String(row["endpoint"]),
        bucket: String(row["bucket"]),
        calls,
        inputTokens,
        outputTokens: Number(row["output_tokens"] ?? 0),
        cacheReadTokens: cacheRead,
        cacheHitPct:
          inputTokens > 0 ? +((cacheRead / inputTokens) * 100).toFixed(1) : 0,
        costUsd: +costUsd.toFixed(6),
        costPerCallUsd: calls > 0 ? +(costUsd / calls).toFixed(6) : 0,
        costPer1kUsd: calls > 0 ? +((costUsd / calls) * 1000).toFixed(2) : 0,
      };
    });

    res.json({
      days,
      totalCostUsd: +items.reduce((a, i) => a + i.costUsd, 0).toFixed(4),
      items,
    });
  });

  return r;
}
