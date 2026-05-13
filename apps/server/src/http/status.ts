import type { Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import { logger } from "../obs/logger.js";

/**
 * Public status-page API (`/api/status`) — PR-41.
 *
 * Powers the unauthenticated `apps/web/src/core/status/StatusPage.tsx`
 * surface. Returns a compact JSON document describing the live status
 * of each user-facing component plus the timestamp of the most recent
 * incident on file.
 *
 * Design constraints:
 *
 * 1. **Public, unauthenticated.** Same surface invariants as the
 *    existing `/healthz` endpoint per
 *    `docs/security/hardening/L7-health-endpoint-info-leak.md` —
 *    response MUST NOT contain `commit`/`sha`/`version`/`build`/
 *    `buildDate`/`buildSha`/`gitSha`/`release` keys at any depth.
 *    Regression-tested in `status.infoleak.test.ts`.
 * 2. **Always 200.** A status page that returns 503 when something is
 *    degraded defeats its own purpose (the page itself becomes
 *    unreachable from the platform's view). HTTP status is decoupled
 *    from `body.status`.
 * 3. **No cross-service probes.** We do not call out to n8n / Telegram
 *    from this handler — that would couple page-load latency to remote
 *    timeouts. Instead we read recent DB rows that are already written
 *    by the n8n failure-event webhook and the OpenClaw invocation
 *    audit log. If the DB is down we still return 200 with `database`
 *    marked `down` and the compound `status` set to `down`.
 *
 * Per-component signal:
 *
 *   - `server`     → always `operational` (the response itself is
 *                    proof we're up).
 *   - `database`   → `pool.query("SELECT 1")`. Success ⇒ operational;
 *                    error ⇒ down.
 *   - `n8n`        → count of `n8n_failure_events` in the last 5 min.
 *                    `>= N8N_DEGRADED_THRESHOLD` ⇒ degraded; otherwise
 *                    operational. Last incident comes from `max(created_at)`
 *                    within the last 7 days.
 *   - `console-bot`→ recency of `openclaw_invocations.invoked_at`.
 *                    Latest within `BOT_OPERATIONAL_WINDOW_MS` ⇒
 *                    operational; otherwise `degraded` ("idle / no
 *                    recent activity"). We intentionally do not say
 *                    "down" — silence here does not prove the process
 *                    is dead, only that nobody has DM'd it.
 *
 * Compound `status`: if any component is `down` → `down`; else if any
 * is `degraded` → `degraded`; else `operational`.
 */

export type ComponentStatus = "operational" | "degraded" | "down";

export interface StatusComponent {
  id: "server" | "database" | "n8n" | "console-bot";
  label: string;
  status: ComponentStatus;
}

export interface StatusLastIncident {
  at: string;
  component: StatusComponent["id"];
}

export interface StatusResponse {
  status: ComponentStatus;
  timestamp: string;
  components: StatusComponent[];
  lastIncident: StatusLastIncident | null;
}

/**
 * Threshold above which a burst of n8n failures (last 5 min) flips the
 * `n8n` component into `degraded`. Single recent failure ≠ system-wide
 * outage — workflows fail for individual reasons (validation, upstream
 * 429, etc.) and we do not want a single retried workflow to paint the
 * page yellow.
 */
export const N8N_DEGRADED_THRESHOLD = 3;
export const N8N_RECENT_WINDOW_MS = 5 * 60 * 1000;
export const N8N_INCIDENT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const BOT_OPERATIONAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BOT_INCIDENT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

interface DbPool {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/**
 * Combine per-component statuses into the overall page status. Exported
 * for direct unit testing — the rest of the handler is mostly DB I/O.
 */
export function computeOverallStatus(
  components: ReadonlyArray<{ status: ComponentStatus }>,
): ComponentStatus {
  if (components.some((c) => c.status === "down")) return "down";
  if (components.some((c) => c.status === "degraded")) return "degraded";
  return "operational";
}

interface BuildOptions {
  now: Date;
}

/**
 * Pure status-document builder. The HTTP wrapper supplies `pool` + a
 * fresh `now`; this function performs the four queries in parallel and
 * shapes the response. Separated from the Express handler so unit
 * tests can drive it with a fake `DbPool` and an injected clock.
 */
export async function buildStatusResponse(
  pool: DbPool,
  opts: BuildOptions = { now: new Date() },
): Promise<StatusResponse> {
  const now = opts.now;
  const n8nRecentSinceIso = new Date(
    now.getTime() - N8N_RECENT_WINDOW_MS,
  ).toISOString();
  const n8nLookbackIso = new Date(
    now.getTime() - N8N_INCIDENT_LOOKBACK_MS,
  ).toISOString();
  const botOperationalSinceIso = new Date(
    now.getTime() - BOT_OPERATIONAL_WINDOW_MS,
  ).toISOString();
  const botLookbackIso = new Date(
    now.getTime() - BOT_INCIDENT_LOOKBACK_MS,
  ).toISOString();

  const [dbProbe, n8nRecent, n8nLastIncident, botActivity] = await Promise.all([
    safeQuery(pool, "SELECT 1 AS ok", []),
    safeQuery<{ count: string }>(
      pool,
      "SELECT COUNT(*)::text AS count FROM n8n_failure_events WHERE created_at >= $1",
      [n8nRecentSinceIso],
    ),
    safeQuery<{ created_at: string | Date }>(
      pool,
      "SELECT created_at FROM n8n_failure_events WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 1",
      [n8nLookbackIso],
    ),
    safeQuery<{ invoked_at: string | Date }>(
      pool,
      "SELECT invoked_at FROM openclaw_invocations WHERE invoked_at >= $1 ORDER BY invoked_at DESC LIMIT 1",
      [botLookbackIso],
    ),
  ]);

  const databaseStatus: ComponentStatus = dbProbe.ok ? "operational" : "down";

  let n8nStatus: ComponentStatus = "operational";
  if (n8nRecent.ok && n8nRecent.rows.length > 0) {
    const count = Number(n8nRecent.rows[0]?.count ?? "0");
    if (Number.isFinite(count) && count >= N8N_DEGRADED_THRESHOLD) {
      n8nStatus = "degraded";
    }
  } else if (!n8nRecent.ok && !dbProbe.ok) {
    // Pool itself is broken — we surface that via `database: down`. We
    // intentionally keep n8n at `operational` here so the page does not
    // paint everything red on a single DB hiccup; the explicit
    // `database: down` row already communicates the outage.
    n8nStatus = "operational";
  }

  let botStatus: ComponentStatus = "degraded";
  if (botActivity.ok && botActivity.rows.length > 0) {
    const latestRaw = botActivity.rows[0]?.invoked_at;
    if (
      latestRaw !== undefined &&
      latestRaw !== null &&
      isWithinWindow(latestRaw, botOperationalSinceIso)
    ) {
      botStatus = "operational";
    }
  } else if (!botActivity.ok && !dbProbe.ok) {
    botStatus = "degraded";
  }

  const components: StatusComponent[] = [
    { id: "server", label: "API server", status: "operational" },
    { id: "database", label: "Database", status: databaseStatus },
    { id: "n8n", label: "n8n workflows", status: n8nStatus },
    { id: "console-bot", label: "OpenClaw bot", status: botStatus },
  ];

  const overall = computeOverallStatus(components);

  const lastIncident = pickLastIncident({
    n8nLatest:
      n8nLastIncident.ok && n8nLastIncident.rows.length > 0
        ? (n8nLastIncident.rows[0]?.created_at ?? null)
        : null,
  });

  return {
    status: overall,
    timestamp: now.toISOString(),
    components,
    lastIncident,
  };
}

interface QueryResult<T> {
  ok: boolean;
  rows: T[];
}

async function safeQuery<T extends Record<string, unknown>>(
  pool: DbPool,
  sql: string,
  params: unknown[],
): Promise<QueryResult<T>> {
  try {
    const res = await pool.query<T>(sql, params);
    return { ok: true, rows: res.rows ?? [] };
  } catch (err) {
    logger.warn({
      msg: "status_probe_query_failed",
      sql,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, rows: [] };
  }
}

function isWithinWindow(value: string | Date, sinceIso: string): boolean {
  const valueIso = value instanceof Date ? value.toISOString() : value;
  return valueIso >= sinceIso;
}

function pickLastIncident(input: {
  n8nLatest: string | Date | null;
}): StatusLastIncident | null {
  if (input.n8nLatest == null) return null;
  const at =
    input.n8nLatest instanceof Date
      ? input.n8nLatest.toISOString()
      : input.n8nLatest;
  return { at, component: "n8n" };
}

/**
 * Express handler factory. Defers all work to `buildStatusResponse`.
 * Always returns 200 — see the file header for the rationale.
 */
export function createStatusHandler(pool: Pool): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      const body = await buildStatusResponse(pool);
      res.status(200).json(body);
    } catch (err) {
      logger.error({
        msg: "status_handler_unexpected_error",
        err: err instanceof Error ? err.message : String(err),
      });
      // Defensive fallback. If even the wrapper threw (e.g. JSON
      // serialisation went sideways) we still return 200 with the
      // server marked operational and database marked down — the page
      // remains renderable.
      const fallback: StatusResponse = {
        status: "down",
        timestamp: new Date().toISOString(),
        components: [
          { id: "server", label: "API server", status: "operational" },
          { id: "database", label: "Database", status: "down" },
          { id: "n8n", label: "n8n workflows", status: "operational" },
          { id: "console-bot", label: "OpenClaw bot", status: "degraded" },
        ],
        lastIncident: null,
      };
      res.status(200).json(fallback);
    }
  };
}
