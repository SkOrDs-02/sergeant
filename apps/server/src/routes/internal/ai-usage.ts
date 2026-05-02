import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

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

  r.post(
    "/api/internal/ai-usage",
    asyncHandler(async (req, res) => {
      const { source, bucket = "default" } = req.body as AiUsageBody;
      const inputTokens = nonNegativeInt((req.body as AiUsageBody).inputTokens);
      const outputTokens = nonNegativeInt(
        (req.body as AiUsageBody).outputTokens,
      );

      if (!source) {
        res.status(400).json({ error: "source is required" });
        return;
      }

      const totalTokens = inputTokens + outputTokens;
      const usageDay = new Date().toISOString().slice(0, 10);

      await pool.query(
        `INSERT INTO ai_usage_daily (
           subject_key,
           usage_day,
           bucket,
           request_count,
           input_tokens,
           output_tokens,
           total_tokens
         )
         VALUES ($1, $2::date, $3, 1, $4, $5, $6)
         ON CONFLICT (subject_key, usage_day, bucket)
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
        ],
      );

      res.json({ ok: true });
    }),
  );

  return r;
}
