import { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../http/index.js";

/**
 * `POST /api/internal/governance/audit` — фіксує порушення Hard Rules
 * виявлені WF-93 (hard-rules compliance auditor) у post-merge перевірці.
 *
 * Body: {
 *   ruleId: number,                // 1..N з docs/governance/hard-rules.json
 *   ruleTitle?: string,
 *   severity?: "blocker"|"major"|"minor"|"info",  // default "blocker"
 *   prNumber?: number,
 *   commitSha?: string,
 *   filePath?: string,
 *   lineNumber?: number,
 *   message: string,               // human-readable пояснення
 *   raw?: unknown
 * }
 *
 * Hard Rule #1: `id` (BIGINT) coerce-ять до `number` через `Number(...)`.
 */

const SEVERITY = new Set(["blocker", "major", "minor", "info"]);

function toJsonbDefault(value: unknown): string {
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function createGovernanceInternalRouter({
  pool,
}: {
  pool: Pool;
}): Router {
  const r = Router();

  r.post(
    "/api/internal/governance/audit",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        ruleId?: number;
        ruleTitle?: string;
        severity?: string;
        prNumber?: number;
        commitSha?: string;
        filePath?: string;
        lineNumber?: number;
        message?: string;
        raw?: unknown;
      };

      if (typeof body.ruleId !== "number" || !Number.isFinite(body.ruleId)) {
        res.status(400).json({ error: "ruleId is required (number)" });
        return;
      }
      if (!body.message) {
        res.status(400).json({ error: "message is required" });
        return;
      }
      const severity =
        body.severity && SEVERITY.has(body.severity)
          ? body.severity
          : "blocker";

      const result = await pool.query<{ id: string }>(
        `INSERT INTO hard_rules_violations (
           rule_id, rule_title, severity, pr_number, commit_sha,
           file_path, line_number, message, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id`,
        [
          Math.trunc(body.ruleId),
          body.ruleTitle ?? null,
          severity,
          typeof body.prNumber === "number" ? Math.trunc(body.prNumber) : null,
          body.commitSha ?? null,
          body.filePath ?? null,
          typeof body.lineNumber === "number"
            ? Math.trunc(body.lineNumber)
            : null,
          body.message,
          toJsonbDefault(body.raw),
        ],
      );

      res.json({ ok: true, id: Number(result.rows[0]?.id ?? 0) });
    }),
  );

  return r;
}
