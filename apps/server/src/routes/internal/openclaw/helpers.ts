/**
 * Спільні error-response helpers для `/api/internal/openclaw/*` роутів
 * (див. `../openclaw.ts`). Перенесено з `routes/internal/openclaw.ts`
 * без змін логіки (G1-декомпозиція, tech-debt-assessment-2026-07-01).
 */

import type { N8nAllowlistError } from "../../../modules/openclaw/index.js";

export function asAllowlistFailure(
  res: import("express").Response,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: "allowlist_fail", message });
}

export function asN8nAllowlistFailure(
  res: import("express").Response,
  err: N8nAllowlistError,
): void {
  res.status(400).json({
    error: "allowlist_fail",
    op: err.op,
    workflowId: err.workflowId,
    tier: err.tier,
    message: err.message,
  });
}

export function asNotFound(
  res: import("express").Response,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(404).json({ error: "not_found", message });
}

export function asSchemaFailure(
  res: import("express").Response,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: "schema_error", message });
}
