#!/usr/bin/env node
/**
 * Stage 5d — idempotent provisioning of the morning-digest cron job
 * into `~/.openclaw/cron/jobs.json` before the OpenClaw gateway boots.
 *
 * Why a script, not `openclaw cron add`:
 *   The cron CLI talks to a *running* Gateway over WebSocket. At
 *   container entrypoint time the Gateway isn't up yet, so we write
 *   the store file directly. OpenClaw reads `jobs.json` on Gateway
 *   start; pending slot metadata in the sibling `jobs-state.json` is
 *   cleared automatically when schedule fields change (per
 *   `docs/automation/cron-jobs.md` § Configuration in
 *   openclaw@2026.5.7).
 *
 * Schema source of truth — `CronJob`/`CronStoreFile` from
 * `openclaw/dist/plugin-sdk/src/cron/types.d.ts`:
 *
 *   type CronStoreFile = { version: 1; jobs: CronJob[] };
 *   type CronJob = {
 *     id, agentId?, sessionKey?, name, description?, enabled,
 *     deleteAfterRun?, createdAtMs, updatedAtMs, schedule,
 *     sessionTarget, wakeMode, payload, delivery?, failureAlert?,
 *     state: CronJobState
 *   }
 *
 * Idempotency:
 *   - An existing job with `name === "morning-digest"` is preserved
 *     (its `id`, `createdAtMs`, and runtime `state` are kept);
 *     `schedule`, `payload`, `delivery`, `updatedAtMs` are
 *     overwritten with the canonical values.
 *   - All other jobs in `jobs.json` are passed through untouched.
 *
 * Skip conditions (each emits a warning + exits 0):
 *   - `OPENCLAW_SKIP_CRON=1` — operator opt-out (same env var
 *     openclaw itself honours).
 *   - `OPENCLAW_FOUNDER_TG_USER_ID` empty — no delivery target;
 *     refuse to provision a job that would silently land nowhere.
 *
 * Pre-baked payload `/digest day`:
 *   - Layer 0 shortcut router claims this message and renders a
 *     canned Markdown digest via 4 read-tools in parallel ($0 LLM
 *     cost). If a cron-driven dispatch bypasses Layer 0 for any
 *     reason, the agent falls through to Layer 2 and produces the
 *     same content via Sonnet (~$0.05/run upper bound).
 *
 * Exports the pure functions for unit tests; runs `main()` when
 * invoked directly via `node ops/openclaw/provision-cron.mjs`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Stable identifier; survives volume resets because we always
 * upsert by `name`. */
export const MORNING_DIGEST_JOB_ID = "sergeant-morning-digest";
export const MORNING_DIGEST_JOB_NAME = "morning-digest";
export const MORNING_DIGEST_CRON_EXPR = "0 9 * * *";
export const MORNING_DIGEST_TIMEZONE = "Europe/Kyiv";

/** Message dispatched to the agent. Matches the existing `/digest`
 * Layer 0 shortcut (period defaults to "day"). */
export const MORNING_DIGEST_MESSAGE = "/digest day";

const DEFAULT_DESCRIPTION =
  "Sergeant morning digest — fires `/digest day` daily at 09:00 Europe/Kyiv into an isolated session; the Layer 0 shortcut router renders the canned Markdown digest and the Gateway announces it to founder DM via Telegram.";

/**
 * Build the canonical morning-digest `CronJob`.
 *
 * @param {object} opts
 * @param {string} opts.founderTgUserId  Telegram user id for delivery.
 * @param {number} [opts.now]            Wall-clock ms (default Date.now()).
 * @param {string} [opts.id]             Stable job id.
 * @param {number} [opts.createdAtMs]    Override creation timestamp.
 * @returns CronJob
 */
export function buildMorningDigestJob({
  founderTgUserId,
  now = Date.now(),
  id = MORNING_DIGEST_JOB_ID,
  createdAtMs = now,
} = {}) {
  if (!founderTgUserId || typeof founderTgUserId !== "string") {
    throw new Error(
      "buildMorningDigestJob: founderTgUserId is required (string).",
    );
  }
  return {
    id,
    name: MORNING_DIGEST_JOB_NAME,
    description: DEFAULT_DESCRIPTION,
    enabled: true,
    createdAtMs,
    updatedAtMs: now,
    schedule: {
      kind: "cron",
      expr: MORNING_DIGEST_CRON_EXPR,
      tz: MORNING_DIGEST_TIMEZONE,
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: MORNING_DIGEST_MESSAGE,
    },
    delivery: {
      mode: "announce",
      channel: "telegram",
      to: founderTgUserId,
      bestEffort: true,
    },
    state: {},
  };
}

/**
 * Merge a freshly-built morning-digest job into an existing store
 * object. Unrelated jobs are passed through unchanged. If a job
 * with the same `name` already exists, its `id`, `createdAtMs`,
 * and runtime `state` are preserved.
 *
 * @param {unknown} store
 * @param {object} job
 * @returns {{ version: 1, jobs: object[] }}
 */
export function mergeMorningDigestJob(store, job) {
  const base = store && typeof store === "object" ? store : {};
  const version = base.version ?? 1;
  const jobs = Array.isArray(base.jobs) ? [...base.jobs] : [];
  const idx = jobs.findIndex(
    (j) => j && typeof j === "object" && j.name === MORNING_DIGEST_JOB_NAME,
  );
  if (idx >= 0) {
    const existing = jobs[idx] ?? {};
    jobs[idx] = {
      ...job,
      id: existing.id ?? job.id,
      createdAtMs:
        typeof existing.createdAtMs === "number"
          ? existing.createdAtMs
          : job.createdAtMs,
      state:
        existing.state && typeof existing.state === "object"
          ? existing.state
          : {},
    };
  } else {
    jobs.push(job);
  }
  return { version, jobs };
}

/**
 * Load the cron store file. Returns `{ version: 1, jobs: [] }` for
 * missing or empty files. Throws when the file exists but is not
 * valid JSON — we refuse to silently overwrite operator data.
 */
export function loadCronStore(path) {
  if (!existsSync(path)) return { version: 1, jobs: [] };
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return { version: 1, jobs: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, jobs: [] };
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `provision-cron: cron store at ${path} is not valid JSON (${msg}). Refusing to overwrite — fix manually and retry.`,
    );
  }
}

export function saveCronStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function resolveJobsJsonPath(homeDir = homedir()) {
  return join(homeDir, ".openclaw", "cron", "jobs.json");
}

function main() {
  if (process.env["OPENCLAW_SKIP_CRON"] === "1") {
    console.log(
      "[provision-cron] OPENCLAW_SKIP_CRON=1 — skipping morning-digest provisioning.",
    );
    return;
  }
  const founderTgUserId = process.env["OPENCLAW_FOUNDER_TG_USER_ID"];
  if (!founderTgUserId) {
    console.warn(
      "[provision-cron] OPENCLAW_FOUNDER_TG_USER_ID not set — skipping morning-digest provisioning. Set the env var (Railway service variable) to enable the daily digest.",
    );
    return;
  }
  const path = resolveJobsJsonPath();
  const store = loadCronStore(path);
  const existing = (store.jobs ?? []).some(
    (j) => j && typeof j === "object" && j.name === MORNING_DIGEST_JOB_NAME,
  );
  const job = buildMorningDigestJob({ founderTgUserId });
  const next = mergeMorningDigestJob(store, job);
  saveCronStore(path, next);
  const action = existing ? "updated" : "created";
  console.log(
    `[provision-cron] morning-digest job ${action} at ${path} (schedule=${MORNING_DIGEST_CRON_EXPR} ${MORNING_DIGEST_TIMEZONE}, delivery=telegram).`,
  );
}

const isCli = fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  try {
    main();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[provision-cron] FATAL: ${msg}`);
    process.exit(1);
  }
}
