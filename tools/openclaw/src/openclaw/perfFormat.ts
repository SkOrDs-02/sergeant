/**
 * Pure formatter для `/perf` slash-command reply (Telegram HTML).
 *
 * Wire-shape mirrors `apps/server/src/modules/openclaw/perfSnapshot.ts`
 * (`PerfSnapshot`); ми redeclar-имо мінімально-необхідну форму, щоб
 * `tools/openclaw` не залежав від `apps/server` (той самий паттерн, що
 * `WriteAuditListItem`/`AiCostSummaryResponse`).
 *
 * Layout — compact (~25 рядків), founder-friendly:
 *   • Heading + uptime context (counters cumulative since-restart).
 *   • HTTP top-N routes з p50/p95/p99.
 *   • AI provider p95.
 *   • DB pool active/total + waiting.
 *   • AI memory queue depth per status.
 *   • Top errors by route (since-restart).
 *
 * HTTP-плумбінг — у `handler-info-commands.ts::perf`; тут лише
 * деривація read-only string-у з готового JSON, щоб корнер-кейси
 * (порожні дані, missing-metric, +Inf p99) тестувались без grammy-бота.
 */

// ─────────────────────────────────────────────────────────────────────────
// Wire types — точне дзеркало server `PerfSnapshot`.
// ─────────────────────────────────────────────────────────────────────────

export interface PerfRouteLatencyItem {
  method: string;
  path: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface PerfAiLatencyItem {
  provider: string;
  count: number;
  p95Ms: number;
}

export interface PerfDbPoolItem {
  total: number;
  idle: number;
  waiting: number;
  active: number;
}

export interface PerfQueueItem {
  status: string;
  depth: number;
}

export interface PerfErrorItem {
  method: string;
  path: string;
  statusClass: string;
  module: string;
  count: number;
}

export interface PerfSnapshotResponse {
  generatedAt: string;
  uptimeSeconds: number;
  topHttpRoutes: ReadonlyArray<PerfRouteLatencyItem>;
  aiLatency: ReadonlyArray<PerfAiLatencyItem>;
  dbPool: PerfDbPoolItem | null;
  aiMemoryQueue: ReadonlyArray<PerfQueueItem>;
  topErrors: ReadonlyArray<PerfErrorItem>;
}

// ─────────────────────────────────────────────────────────────────────────
// Internal formatters
// ─────────────────────────────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** "1234ms" / "1.2s" / "—" для невалідних значень. */
function fmtMs(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1) return "<1ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function fmtUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return h > 0 ? `${d}d${h}h` : `${d}d`;
}

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/**
 * Telegram HTML reply. Усі рядки з даних (route path, error route,
 * provider name) проходимо через `escapeHtml`, бо path може теоретично
 * містити `<` (Express допускає arbitrary route regex). Інші поля —
 * фіксований enum, але escape дешевий → escape усе про всяк.
 */
export function formatPerfSnapshot(snapshot: PerfSnapshotResponse): string {
  const lines: string[] = [];

  lines.push(
    `<b>Performance snapshot</b> (uptime ${fmtUptime(snapshot.uptimeSeconds)})`,
  );
  lines.push("");
  lines.push(`<i>Counters cumulative since-restart; gauges — current.</i>`);

  // HTTP latency
  lines.push("");
  lines.push("<b>HTTP latency (top routes)</b>");
  if (snapshot.topHttpRoutes.length === 0) {
    lines.push("  —");
  } else {
    for (const row of snapshot.topHttpRoutes) {
      const label = `${escapeHtml(row.method)} ${escapeHtml(row.path)}`;
      lines.push(
        `  • <code>${label}</code> · ${fmtCount(row.count)} req · ` +
          `p50 ${fmtMs(row.p50Ms)} · p95 ${fmtMs(row.p95Ms)} · ` +
          `p99 ${fmtMs(row.p99Ms)}`,
      );
    }
  }

  // AI latency
  lines.push("");
  lines.push("<b>AI latency</b>");
  if (snapshot.aiLatency.length === 0) {
    lines.push("  —");
  } else {
    for (const row of snapshot.aiLatency) {
      lines.push(
        `  • ${escapeHtml(row.provider)} · ${fmtCount(row.count)} req · ` +
          `p95 ${fmtMs(row.p95Ms)}`,
      );
    }
  }

  // DB pool
  lines.push("");
  if (snapshot.dbPool) {
    const p = snapshot.dbPool;
    lines.push(
      `<b>DB pool:</b> ${p.active}/${p.total} active (${p.waiting} waiting)`,
    );
  } else {
    lines.push(`<b>DB pool:</b> <i>—</i>`);
  }

  // Queue
  if (snapshot.aiMemoryQueue.length > 0) {
    const parts = snapshot.aiMemoryQueue
      .filter(
        (q) => q.depth > 0 || q.status === "waiting" || q.status === "active",
      )
      .map((q) => `${escapeHtml(q.status)} ${Math.round(q.depth)}`);
    lines.push(
      `<b>AI memory queue:</b> ${parts.length > 0 ? parts.join(", ") : "idle"}`,
    );
  } else {
    lines.push(`<b>AI memory queue:</b> <i>—</i>`);
  }

  // Errors
  lines.push("");
  lines.push("<b>Top error routes (4xx/5xx since restart)</b>");
  if (snapshot.topErrors.length === 0) {
    lines.push("  <i>none</i>");
  } else {
    for (const row of snapshot.topErrors) {
      const label = `${escapeHtml(row.method)} ${escapeHtml(row.path)}`;
      const status = row.statusClass ? ` [${escapeHtml(row.statusClass)}]` : "";
      lines.push(`  • <code>${label}</code>${status} · ${fmtCount(row.count)}`);
    }
  }

  return lines.join("\n");
}
