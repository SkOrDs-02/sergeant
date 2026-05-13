/**
 * Orchestrator для `/perf` slash-command-у.
 *
 * Full lifecycle handler-у (audit-open → fetch snapshot → render →
 * audit-finalize → reply) як pure async function, що приймає всі
 * залежності через `PerfRunnerDeps`. Це дозволяє unit-тестувати
 * lifecycle без grammy `Bot` / `Context` instance-у (той самий патерн,
 * що `status-runner.ts`).
 *
 * Audit-row пишемо у `openclaw_invocations` через
 * `/api/internal/openclaw/invocations/{open,finalize}`. Trigger завжди
 * `dm` (info-команда), розрізнення по `metadata.slashCommand = "/perf"`.
 *
 * Sentry breadcrumb на trigger (`openclaw.perf.*`). Якщо `SENTRY_DSN`
 * не виставлений — `Sentry.addBreadcrumb` no-op (див. `obs/sentry.ts`).
 */

import { formatPerfSnapshot, type PerfSnapshotResponse } from "./perfFormat.js";

// ─────────────────────────────────────────────────────────────────────────
// Fetcher abstraction
// ─────────────────────────────────────────────────────────────────────────

export interface PerfFetcher {
  /** GET-flavor of `/api/internal/openclaw/perf-snapshot`. */
  getPerfSnapshot(): Promise<{
    ok: boolean;
    status: number;
    data: PerfSnapshotResponse | null;
  }>;
  openInvocation(input: {
    founderUserId: string;
    founderTgUserId: number;
    trigger: "dm";
    userMessage: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number; invocationId: number | null }>;
  finalizeInvocation(input: {
    invocationId: number;
    status: "success" | "error";
    assistantResponse: string | null;
    errorMessage: string | null;
  }): Promise<{ ok: boolean; status: number }>;
}

/** Sentry breadcrumb sink — production injects `Sentry.addBreadcrumb`. */
export type PerfBreadcrumbFn = (breadcrumb: {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}) => void;

export interface PerfRunnerDeps {
  /** Better Auth opaque user-id founder-а (з env / OpenClaw config). */
  founderUserId: string;
  /** Telegram user-id founder-а (з allowlist-у, для audit-row-и). */
  founderTgUserId: number;
  /** Telegram chat-id (для metadata-аудиту). Optional. */
  telegramChatId?: number;
  /** Injection-pointable fetcher. */
  fetcher: PerfFetcher;
  /** Injection-pointable Sentry breadcrumb sink. */
  addBreadcrumb?: PerfBreadcrumbFn;
}

export interface PerfRunResult {
  /** Final reply payload (HTML), готовий до `c.reply(reply, { parse_mode: "HTML" })`. */
  reply: string;
  /** ID audit-row-и у `openclaw_invocations`. `null` якщо open-call впав. */
  invocationId: number | null;
  /** Чи зайшли у happy-path. Якщо `false` — `reply` містить error-фразу. */
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

const HTTP_ERROR_FALLBACK_REPLY = (status: number): string =>
  `Не зміг прочитати perf-snapshot (HTTP ${status}).`;

/**
 * Виконує `/perf`. Не throw-ає — будь-який збій мапиться у audit-error
 * (якщо invocation відкрита) + помічається у Sentry-breadcrumb.
 */
export async function executePerfCommand(
  deps: PerfRunnerDeps,
): Promise<PerfRunResult> {
  const emitBreadcrumb = deps.addBreadcrumb ?? (() => undefined);
  const userMessage = "/perf";

  emitBreadcrumb({
    category: "openclaw.perf",
    message: "openclaw.perf.start",
    level: "info",
    data: {
      founderTgUserId: deps.founderTgUserId,
      telegramChatId: deps.telegramChatId ?? null,
    },
  });

  const openRes = await deps.fetcher.openInvocation({
    founderUserId: deps.founderUserId,
    founderTgUserId: deps.founderTgUserId,
    trigger: "dm",
    userMessage,
    metadata: {
      telegramChatId: deps.telegramChatId ?? null,
      slashCommand: "/perf",
    },
  });
  const invocationId = openRes.invocationId;

  const snapshotRes = await deps.fetcher.getPerfSnapshot();

  if (!snapshotRes.ok || !snapshotRes.data) {
    const errMsg = `HTTP ${snapshotRes.status}`;
    const reply = HTTP_ERROR_FALLBACK_REPLY(snapshotRes.status);

    emitBreadcrumb({
      category: "openclaw.perf",
      message: "openclaw.perf.error",
      level: "error",
      data: { status: snapshotRes.status },
    });

    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "error",
        assistantResponse: reply,
        errorMessage: errMsg,
      });
    }

    return { reply, invocationId, ok: false };
  }

  const reply = formatPerfSnapshot(snapshotRes.data);

  if (invocationId != null) {
    await deps.fetcher.finalizeInvocation({
      invocationId,
      status: "success",
      assistantResponse: reply,
      errorMessage: null,
    });
  }

  emitBreadcrumb({
    category: "openclaw.perf",
    message: "openclaw.perf.success",
    level: "info",
    data: {
      replyChars: reply.length,
      httpRoutes: snapshotRes.data.topHttpRoutes.length,
      aiProviders: snapshotRes.data.aiLatency.length,
      dbPoolPresent: snapshotRes.data.dbPool !== null,
      queueRows: snapshotRes.data.aiMemoryQueue.length,
      topErrors: snapshotRes.data.topErrors.length,
    },
  });

  return { reply, invocationId, ok: true };
}
