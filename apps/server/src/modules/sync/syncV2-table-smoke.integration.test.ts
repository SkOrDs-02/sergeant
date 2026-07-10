/**
 * Smoke tests for sync table groups without existing integration coverage (PR-5,
 * Stage 2). One insert+pull per group — 8 groups representing 23 tables
 * previously untested at the integration level.
 *
 * Groups and representative tables:
 *   routine-meta      → routine_habits
 *   routine-tracking  → routine_pushups
 *   fizruk-planning   → fizruk_monthly_plan
 *   fizruk-templates  → fizruk_wellbeing
 *   nutrition-logs    → nutrition_water_log
 *   finyk-money       → finyk_assets
 *   finyk-tx          → finyk_tx_splits
 *   finyk-mono        → finyk_mono_debt_links
 *
 * Each test pushes one valid insert op then pulls from a second device and
 * verifies the op appears. The intent is coverage-completeness, not exhaustive
 * LWW / conflict semantics — those are already tested in syncV2.integration.test.ts.
 *
 * Uses the shared createIntegrationApp harness (pool-only mode — no Express
 * app needed; handlers are called directly, same pattern as the existing
 * syncV2.integration.test.ts). The dynamic import of syncV2.js AFTER
 * bootIntegrationHarness sets DATABASE_URL ensures the module-level pg.Pool
 * in db.ts connects to the container URI and not localhost:5432.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";

// Dynamic import — must happen AFTER bootIntegrationHarness sets DATABASE_URL.
let syncV2Push: typeof import("./syncV2.js").syncV2Push;
let syncV2Pull: typeof import("./syncV2.js").syncV2Pull;

let harness: IntegrationHarness | undefined;
let dockerAvailable = false;

// ── fakes ──────────────────────────────────────────────────────────────────

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq({
  body,
  query,
  headers,
  userId,
}: {
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  userId: string;
}): Request & { user: { id: string } } {
  return {
    body: body ?? {},
    query: query ?? {},
    headers: headers ?? {},
    user: { id: userId },
  } as unknown as Request & { user: { id: string } };
}

function isoNow(): string {
  return new Date().toISOString();
}

// ── lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    ({ syncV2Push, syncV2Pull } = await import("./syncV2.js"));
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[syncV2 table-smoke] Skipping: testcontainers unavailable — ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!harness || !dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
});

// ── shared smoke helper ────────────────────────────────────────────────────

/**
 * Push one insert op for `table` then pull from a second device.
 * Asserts: accepted=1, status=applied, and at least one op in pull response.
 *
 * `row` must NOT include `user_id` — the helper prepends it so all apply
 * functions get the required ownership field.
 */
async function smokePushPull(
  ctx: { skip: () => void },
  {
    table,
    userId,
    row,
    key,
  }: {
    table: string;
    userId: string;
    row: Record<string, unknown>;
    key: string;
  },
): Promise<void> {
  if (!dockerAvailable || !harness) return ctx.skip();
  await seedIntegrationUser(harness.pool, userId);

  const ts = isoNow();
  // user_id must be in the row for assertRowUserId checks in every apply fn.
  const fullRow: Record<string, unknown> = { user_id: userId, ...row };

  const pushRes = makeRes();
  await syncV2Push(
    makeReq({
      userId,
      body: {
        ops: [
          {
            table,
            op: "insert",
            row: fullRow,
            client_ts: ts,
            idempotency_key: key,
          },
        ],
      },
      headers: { "x-origin-device-id": "device-A" },
    }),
    pushRes,
  );

  const pushBody = pushRes.body as {
    accepted: number;
    results: Array<{ status: string; reason?: string }>;
  };
  expect(pushBody.accepted, `${table}: push accepted`).toBe(1);
  expect(pushBody.results[0]?.status, `${table}: push status`).toBe("applied");

  const pullRes = makeRes();
  await syncV2Pull(
    makeReq({
      userId,
      query: { since: 0 },
      headers: { "x-origin-device-id": "device-B" },
    }),
    pullRes,
  );

  const pullBody = pullRes.body as { ops: unknown[] };
  expect(
    pullBody.ops.length,
    `${table}: pull from device-B sees the pushed op`,
  ).toBeGreaterThanOrEqual(1);
}

// ── 8 group smoke tests ────────────────────────────────────────────────────

describe("syncV2 table-coverage smoke (PR-5)", () => {
  // Group: routine-meta — routine_habits, routine_tags, routine_categories, routine_prefs
  it(
    "routine-meta: routine_habits insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "routine_habits",
        userId: "u-smoke-rh",
        row: {
          id: "00000005-0001-4000-8001-000000000001",
          name: "smoke habit",
        },
        key: "smoke-routine-habits",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: routine-tracking — routine_pushups, routine_habit_order, routine_completion_notes
  it(
    "routine-tracking: routine_pushups insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "routine_pushups",
        userId: "u-smoke-rp",
        row: {
          date_key: "2026-07-10",
          reps: 25,
        },
        key: "smoke-routine-pushups",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: fizruk-planning — fizruk_daily_log, fizruk_monthly_plan, fizruk_plan_templates, fizruk_programs
  it(
    "fizruk-planning: fizruk_monthly_plan insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "fizruk_monthly_plan",
        userId: "u-smoke-fmp",
        row: {
          // readJsonbField(row, "data", "data_json") accepts either key.
          data_json: { weeks: [] },
        },
        key: "smoke-fizruk-monthly-plan",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: fizruk-templates — fizruk_wellbeing, fizruk_workout_templates
  it(
    "fizruk-templates: fizruk_wellbeing insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "fizruk_wellbeing",
        userId: "u-smoke-fwb",
        row: {
          date_key: "2026-07-10",
          mood: 4,
          energy: 3,
        },
        key: "smoke-fizruk-wellbeing",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: nutrition-logs — nutrition_water_log, nutrition_shopping_list
  it(
    "nutrition-logs: nutrition_water_log insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "nutrition_water_log",
        userId: "u-smoke-nwl",
        row: {
          date_key: "2026-07-10",
          volume_ml: 600,
        },
        key: "smoke-nutrition-water-log",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: finyk-money — finyk_assets, finyk_debts, finyk_receivables
  it(
    "finyk-money: finyk_assets insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "finyk_assets",
        userId: "u-smoke-fa",
        row: {
          id: "00000005-0006-4000-8001-000000000001",
          // applyFinykPerRowBlob reads row["data_json"] via toJsonbParam.
          data_json: { name: "apartment", value: 500000 },
        },
        key: "smoke-finyk-assets",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: finyk-tx — finyk_custom_categories, finyk_manual_expenses, finyk_tx_filters, finyk_tx_splits
  it(
    "finyk-tx: finyk_tx_splits insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "finyk_tx_splits",
        userId: "u-smoke-fts",
        row: {
          transaction_id: "tx-smoke-splits-001",
          // applyFinykPerTxJsonbArray reads row["splits_json"].
          splits_json: [{ amount: 100, label: "food" }],
        },
        key: "smoke-finyk-tx-splits",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Group: finyk-mono — finyk_mono_debt_links
  it(
    "finyk-mono: finyk_mono_debt_links insert → pull",
    async (ctx) => {
      await smokePushPull(ctx, {
        table: "finyk_mono_debt_links",
        userId: "u-smoke-fmdl",
        row: {
          transaction_id: "tx-smoke-mono-001",
          // applyFinykPerTxJsonbArray reads row["debt_ids_json"].
          debt_ids_json: ["debt-1"],
        },
        key: "smoke-finyk-mono-debt-links",
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
