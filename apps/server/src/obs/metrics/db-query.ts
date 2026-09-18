import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── Postgres (USE) ─────────────────────
export const dbQueryDurationMs = new client.Histogram({
  name: "db_query_duration_ms",
  help: "PG query duration in ms",
  labelNames: ["op"],
  buckets: [1, 5, 25, 100, 250, 1000, 5000],
  registers: [register],
});

export const dbErrorsTotal = new client.Counter({
  name: "db_errors_total",
  help: "PG errors grouped by error code",
  labelNames: ["code"],
  registers: [register],
});

export const dbSlowQueriesTotal = new client.Counter({
  name: "db_slow_queries_total",
  help: "PG queries over DB_SLOW_MS",
  labelNames: ["op"],
  registers: [register],
});

/**
 * I7 — Security events Telegram push channel reachability counter.
 *
 * Bumped on:
 *   - Boot heartbeat (`pingSecurityRoom()` in `securityEventsRoom.ts`) when
 *     env-vars missing or Telegram `getMe` fails.
 *   - Runtime `sendToTelegram()` HTTP failures or fetch errors.
 *
 * Use case: detect rotated/expired bot token, unset env vars, or Telegram
 * outages — without this counter the alert channel can go dark silently
 * because the room itself is fail-open (warn-only logs).
 *
 * `reason` label categorizes the failure for Grafana panels:
 *   - `bot_token_missing` / `chat_id_missing` — config gap
 *   - `http_4xx` / `http_5xx` — token rotated, chat deleted, Telegram down
 *   - `fetch_error` — DNS/TLS/network issue
 */
export const securityRoomUnreachableTotal = new client.Counter({
  name: "security_room_unreachable_total",
  help: "I7 security events Telegram push channel unreachable count by failure reason.",
  labelNames: ["reason"],
  registers: [register],
});
