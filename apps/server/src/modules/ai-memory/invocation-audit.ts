/**
 * Invocation-audit helpers навколо таблиці `openclaw_invocations`.
 *
 * Історично таблицю писав OpenClaw co-founder bot (ADR-0031/0037). Після
 * декомісії зовнішнього gateway єдиний писар — `ai-memory` `/forget`, який
 * логує свою LLM-інвокацію (cost/duration/status) для audit-трейлу.
 *
 * Pure helpers навколо `pg.Pool` (DI-friendly + тестується). Назву таблиці
 * не міняємо, бо міграції immutable (Hard Rule #4).
 */

import type { Pool } from "pg";

export interface OpenInvocationInput {
  founderUserId: string;
  founderTgUserId: number;
  trigger: string;
  userMessage: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Створює row у `openclaw_invocations` зі status='success' і нульовими
 * cost/duration. Caller потім викликає `finalizeInvocation` коли робота
 * заверш-ується. Повертає id новоствореної row-и.
 */
export async function openInvocation(
  pool: Pool,
  input: OpenInvocationInput,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO openclaw_invocations (
       founder_user_id, founder_tg_user_id, trigger, user_message, metadata
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [
      input.founderUserId,
      input.founderTgUserId,
      input.trigger,
      input.userMessage,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  // BIGINT → string у pg-driver default; coerce до number (Hard Rule #1).
  const row = result.rows[0];
  if (!row)
    throw new Error("openInvocation: INSERT RETURNING returned no rows");
  return Number(row.id);
}

export interface FinalizeInvocationInput {
  invocationId: number;
  status: string;
  assistantResponse?: string | null | undefined;
  toolCalls?: unknown[] | undefined;
  costUsd?: number | undefined;
  durationMs?: number | undefined;
  iterations?: number | undefined;
  errorMessage?: string | null | undefined;
  toneMode?: string | null | undefined;
  metadataPatch?: Record<string, unknown> | undefined;
}

/**
 * Фіналізує invocation: оновлює status, assistant_response, tool_calls,
 * cost_usd, duration_ms, iterations, error_message, tone_mode. `metadataPatch`
 * мерджиться у поточний metadata через `jsonb || $patch`.
 */
export async function finalizeInvocation(
  pool: Pool,
  input: FinalizeInvocationInput,
): Promise<void> {
  await pool.query(
    `UPDATE openclaw_invocations
       SET status              = $2,
           assistant_response  = $3,
           tool_calls          = $4::jsonb,
           cost_usd            = $5,
           duration_ms         = $6,
           iterations          = $7,
           error_message       = $8,
           tone_mode           = $9,
           metadata            = metadata || $10::jsonb
     WHERE id = $1`,
    [
      input.invocationId,
      input.status,
      input.assistantResponse ?? null,
      JSON.stringify(input.toolCalls ?? []),
      input.costUsd ?? 0,
      input.durationMs ?? 0,
      input.iterations ?? 0,
      input.errorMessage ?? null,
      input.toneMode ?? null,
      JSON.stringify(input.metadataPatch ?? {}),
    ],
  );
}
