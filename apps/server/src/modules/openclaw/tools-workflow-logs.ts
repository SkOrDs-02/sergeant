// ─────────────────────────────────────────────────────────────────────────
// read_workflow_logs — n8n execution traces
// ─────────────────────────────────────────────────────────────────────────

import { logger } from "../../obs/logger.js";
import { env } from "../../env.js";

export interface ReadWorkflowLogsInput {
  workflowId: string;
  /** ISO-string. */
  since?: string | undefined;
  limit?: number | undefined;
}

export interface ReadWorkflowLogsOutput {
  workflowId: string;
  executions: Array<{
    id: string;
    finished: boolean;
    mode: string;
    startedAt: string | null;
    stoppedAt: string | null;
    status: string | null;
  }>;
}

/**
 * Читає n8n executions через REST API. Phase 1 — прямий REST-call, без
 * caching. Phase 2 може кешувати у Redis якщо стане bottleneck-ом.
 *
 * Якщо `N8N_API_URL` / `N8N_API_KEY` не задано — повертає порожній
 * список з warning-ом (graceful degradation).
 */
export async function readWorkflowLogs(
  input: ReadWorkflowLogsInput,
): Promise<ReadWorkflowLogsOutput> {
  const baseUrl = env.N8N_API_URL;
  const apiKey = env.N8N_API_KEY;
  if (!baseUrl || !apiKey) {
    logger.warn({
      msg: "openclaw_read_workflow_logs_not_configured",
      workflowId: input.workflowId,
    });
    return { workflowId: input.workflowId, executions: [] };
  }

  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/executions?workflowId=${encodeURIComponent(input.workflowId)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`n8n API returned ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      finished: boolean;
      mode: string;
      startedAt: string | null;
      stoppedAt: string | null;
      status?: string | null;
    }>;
  };

  return {
    workflowId: input.workflowId,
    executions: (body.data ?? []).map((e) => ({
      id: e.id,
      finished: e.finished,
      mode: e.mode,
      startedAt: e.startedAt,
      stoppedAt: e.stoppedAt,
      status: e.status ?? null,
    })),
  };
}
